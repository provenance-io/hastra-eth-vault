// @ts-ignore
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Prints the 8 Safe calldatas for the Option A migration against an
 * already-deployed TimelockController.
 *
 * Use this when you have a TimelockController already deployed (e.g. via
 * `deploy-timelock.ts`) and just need to regenerate the calldatas — without
 * spending gas on a second deploy.
 *
 * See `local_docs/PLAYBOOK.md` for the full migration playbook.
 *
 * Usage:
 *   SAFE=0x...        \
 *   TIMELOCK=0x...    \
 *   SEPOLIA_RPC_URL=... \
 *     npx hardhat run scripts/admin/print-option-a-calldatas.ts --network sepolia
 *
 * Env vars:
 *   SAFE          - Safe multisig address (required).
 *   TIMELOCK      - Existing TimelockController address (required).
 *   YIELD_VAULT   - Override YieldVault proxy address (optional).
 *   STAKING_VAULT - Override StakingVault proxy address (optional).
 */

const MAINNET_DEPLOYMENT = path.join(__dirname, "../../deployment_mainnet.json");
const SEPOLIA_DEPLOYMENT = path.join(__dirname, "../../deployment_testnet_sepolia.json");

function loadDeployment(networkName: string): any {
  const file = networkName === "mainnet" ? MAINNET_DEPLOYMENT : SEPOLIA_DEPLOYMENT;
  if (!fs.existsSync(file)) throw new Error(`Deployment file not found: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function main() {
  const safeAddress     = process.env.SAFE;
  const timelockAddress = process.env.TIMELOCK;

  if (!safeAddress)     throw new Error("SAFE env var required");
  if (!timelockAddress) throw new Error("TIMELOCK env var required");

  const deployment = loadDeployment(network.name);
  const yieldVaultAddress   = process.env.YIELD_VAULT   || deployment.contracts.yieldVault;
  const stakingVaultAddress = process.env.STAKING_VAULT || deployment.contracts.stakingVault;

  const vault = await ethers.getContractAt("YieldVault", yieldVaultAddress);
  const UPGRADER_ROLE      = await vault.UPGRADER_ROLE();
  const DEFAULT_ADMIN_ROLE = await vault.DEFAULT_ADMIN_ROLE();

  const iface = new ethers.Interface([
    "function grantRole(bytes32 role, address account)",
    "function renounceRole(bytes32 role, address account)",
  ]);

  const batch1 = [
    {
      label: "YieldVault   — grantRole(UPGRADER_ROLE,      TimelockController)",
      to: yieldVaultAddress,
      data: iface.encodeFunctionData("grantRole", [UPGRADER_ROLE, timelockAddress]),
    },
    {
      label: "StakingVault — grantRole(UPGRADER_ROLE,      TimelockController)",
      to: stakingVaultAddress,
      data: iface.encodeFunctionData("grantRole", [UPGRADER_ROLE, timelockAddress]),
    },
    {
      label: "YieldVault   — grantRole(DEFAULT_ADMIN_ROLE, TimelockController)",
      to: yieldVaultAddress,
      data: iface.encodeFunctionData("grantRole", [DEFAULT_ADMIN_ROLE, timelockAddress]),
    },
    {
      label: "StakingVault — grantRole(DEFAULT_ADMIN_ROLE, TimelockController)",
      to: stakingVaultAddress,
      data: iface.encodeFunctionData("grantRole", [DEFAULT_ADMIN_ROLE, timelockAddress]),
    },
  ];

  const batch2 = [
    {
      label: "YieldVault   — renounceRole(UPGRADER_ROLE,      Safe)",
      to: yieldVaultAddress,
      data: iface.encodeFunctionData("renounceRole", [UPGRADER_ROLE, safeAddress]),
    },
    {
      label: "StakingVault — renounceRole(UPGRADER_ROLE,      Safe)",
      to: stakingVaultAddress,
      data: iface.encodeFunctionData("renounceRole", [UPGRADER_ROLE, safeAddress]),
    },
    {
      label: "YieldVault   — renounceRole(DEFAULT_ADMIN_ROLE, Safe)  ⚠️  IRREVERSIBLE",
      to: yieldVaultAddress,
      data: iface.encodeFunctionData("renounceRole", [DEFAULT_ADMIN_ROLE, safeAddress]),
    },
    {
      label: "StakingVault — renounceRole(DEFAULT_ADMIN_ROLE, Safe)  ⚠️  IRREVERSIBLE",
      to: stakingVaultAddress,
      data: iface.encodeFunctionData("renounceRole", [DEFAULT_ADMIN_ROLE, safeAddress]),
    },
  ];

  console.log("═".repeat(62));
  console.log("  OPTION A — SAFE CALLDATAS (existing TimelockController)");
  console.log("═".repeat(62));
  console.log(`  Network:            ${network.name}`);
  console.log(`  Safe:               ${safeAddress}`);
  console.log(`  TimelockController: ${timelockAddress}`);
  console.log(`  YieldVault:         ${yieldVaultAddress}`);
  console.log(`  StakingVault:       ${stakingVaultAddress}`);
  console.log(`  UPGRADER_ROLE:      ${UPGRADER_ROLE}`);
  console.log(`  DEFAULT_ADMIN_ROLE: ${DEFAULT_ADMIN_ROLE}`);
  console.log();

  const print = (calls: typeof batch1) => {
    for (const call of calls) {
      console.log(`  ── ${call.label}`);
      console.log(`     To:       ${call.to}`);
      console.log(`     Value:    0`);
      console.log(`     Calldata: ${call.data}`);
      console.log();
    }
  };

  console.log("─".repeat(62));
  console.log("  BATCH 1 — Grants (queue first, fully reversible)");
  console.log("─".repeat(62));
  print(batch1);

  console.log("─".repeat(62));
  console.log("  BATCH 2 — Renounces (queue ONLY after rehearsing an upgrade");
  console.log("            through the timelock end-to-end — see playbook §4)");
  console.log("            ⚠️  DEFAULT_ADMIN renounce is IRREVERSIBLE");
  console.log("─".repeat(62));
  print(batch2);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
