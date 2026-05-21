// @ts-ignore
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys an OZ TimelockController and (optionally) generates the Safe calldata
 * to transfer UPGRADER_ROLE from Safe → TimelockController on YieldVault and StakingVault.
 *
 * The TimelockController is configured so that:
 *   - Safe is PROPOSER + CANCELLER (only Safe can queue or cancel txs)
 *   - address(0) is EXECUTOR (anyone can execute after the delay — standard pattern)
 *   - Safe is TIMELOCK_ADMIN (can update roles on the timelock itself)
 *
 * Usage:
 *   PRIVATE_KEY=0x... \
 *   SEPOLIA_RPC_URL=https://... \
 *   SAFE=0x4E79e5BB88f0596446c615B86D3780A11DB1a2f4 \
 *   DELAY=86400 \
 *   DRY_RUN=true \
 *     npx hardhat run scripts/admin/deploy-timelock.ts --network sepolia
 *
 * Env vars:
 *   SAFE      - Safe multisig address (proposer/canceller/admin). Required.
 *   DELAY     - Timelock delay in seconds. Default: 86400 (24h, per REQUIREMENTS §4.3).
 *   DRY_RUN   - If "true", skips deployment and only prints what would happen.
 *   YIELD_VAULT   - Override YieldVault proxy address.
 *   STAKING_VAULT - Override StakingVault proxy address.
 */

const MAINNET_DEPLOYMENT = path.join(__dirname, "../../deployment_mainnet.json");
const SEPOLIA_DEPLOYMENT = path.join(__dirname, "../../deployment_testnet_sepolia.json");

function loadDeployment(networkName: string): any {
  const file = networkName === "mainnet" ? MAINNET_DEPLOYMENT : SEPOLIA_DEPLOYMENT;
  if (!fs.existsSync(file)) throw new Error(`Deployment file not found: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function main() {
  const safeAddress   = process.env.SAFE;
  const delaySeconds  = parseInt(process.env.DELAY || "86400"); // 24h default (REQUIREMENTS §4.3)
  const dryRun        = process.env.DRY_RUN === "true";

  if (!safeAddress) throw new Error("SAFE env var required (Safe multisig address)");

  const deployment = loadDeployment(network.name);
  const yieldVaultAddress   = process.env.YIELD_VAULT   || deployment.contracts.yieldVault;
  const stakingVaultAddress = process.env.STAKING_VAULT || deployment.contracts.stakingVault;

  const [deployer] = await ethers.getSigners();

  console.log("═".repeat(62));
  console.log("  TIMELOCK CONTROLLER DEPLOYMENT");
  console.log("═".repeat(62));
  console.log(`  Network:       ${network.name}`);
  console.log(`  Deployer:      ${deployer.address}`);
  console.log(`  Safe:          ${safeAddress}`);
  console.log(`  Delay:         ${delaySeconds}s (${delaySeconds / 3600}h)`);
  console.log(`  YieldVault:    ${yieldVaultAddress}`);
  console.log(`  StakingVault:  ${stakingVaultAddress}`);
  console.log(`  Dry run:       ${dryRun}`);
  console.log("═".repeat(62));

  // ── 1. Deploy TimelockController ────────────────────────────────────────────
  let timelockAddress: string;

  if (dryRun) {
    timelockAddress = "<TIMELOCK_ADDRESS_AFTER_DEPLOY>";
    console.log("\n[DRY RUN] Would deploy TimelockController with:");
    console.log(`  minDelay:   ${delaySeconds}`);
    console.log(`  proposers:  [${safeAddress}]`);
    console.log(`  executors:  [${ethers.ZeroAddress}]  (open execution)`);
    console.log(`  admin:      ${safeAddress}`);
  } else {
    console.log("\n🚀 Deploying TimelockController...");
    const TimelockFactory = await ethers.getContractFactory("HastraTimelockController");
    const timelock = await TimelockFactory.deploy(
      delaySeconds,
      [safeAddress],          // proposers
      [ethers.ZeroAddress],   // executors — open (anyone can execute after delay)
      safeAddress             // admin
    );
    await timelock.waitForDeployment();
    timelockAddress = await timelock.getAddress();
    console.log(`✅ TimelockController deployed: ${timelockAddress}`);
  }

  // ── 2. Resolve UPGRADER_ROLE hash from YieldVault ───────────────────────────
  const vault = await ethers.getContractAt("YieldVault", yieldVaultAddress);
  const UPGRADER_ROLE = await vault.UPGRADER_ROLE();

  if (dryRun) {
    console.log(`\n  UPGRADER_ROLE hash: ${UPGRADER_ROLE}`);
    console.log("  [DRY RUN] Deploy TimelockController first, then re-run without DRY_RUN=true");
    console.log("  to generate the Safe calldata with the real timelock address.");
    return;
  }

  // ── 3. Generate Safe calldata ────────────────────────────────────────────────
  // Safe needs to execute two grantRole + two revokeRole calls:
  //   grantRole(UPGRADER_ROLE, timelock) on YieldVault
  //   grantRole(UPGRADER_ROLE, timelock) on StakingVault
  //   revokeRole(UPGRADER_ROLE, Safe)    on YieldVault
  //   revokeRole(UPGRADER_ROLE, Safe)    on StakingVault

  const iface = new ethers.Interface([
    "function grantRole(bytes32 role, address account)",
    "function revokeRole(bytes32 role, address account)",
  ]);

  const calls = [
    {
      label: "YieldVault — grant UPGRADER_ROLE to TimelockController",
      to: yieldVaultAddress,
      data: iface.encodeFunctionData("grantRole", [UPGRADER_ROLE, timelockAddress]),
    },
    {
      label: "StakingVault — grant UPGRADER_ROLE to TimelockController",
      to: stakingVaultAddress,
      data: iface.encodeFunctionData("grantRole", [UPGRADER_ROLE, timelockAddress]),
    },
    {
      label: "YieldVault — revoke UPGRADER_ROLE from Safe",
      to: yieldVaultAddress,
      data: iface.encodeFunctionData("revokeRole", [UPGRADER_ROLE, safeAddress]),
    },
    {
      label: "StakingVault — revoke UPGRADER_ROLE from Safe",
      to: stakingVaultAddress,
      data: iface.encodeFunctionData("revokeRole", [UPGRADER_ROLE, safeAddress]),
    },
  ];

  console.log("\n" + "═".repeat(62));
  console.log("  SAFE TRANSACTIONS — UPGRADER_ROLE TRANSFER");
  console.log("  (Queue these in Safe after TimelockController is deployed)");
  console.log("═".repeat(62));
  console.log(`  UPGRADER_ROLE hash: ${UPGRADER_ROLE}`);
  console.log(`  TimelockController: ${timelockAddress}`);
  console.log();

  for (const call of calls) {
    console.log(`  ── ${call.label}`);
    console.log(`     To:       ${call.to}`);
    console.log(`     Value:    0`);
    console.log(`     Calldata: ${call.data}`);
    console.log();
  }

  // ── 4. How to propose an upgrade through the timelock ───────────────────────
  console.log("═".repeat(62));
  console.log("  HOW TO UPGRADE THROUGH TIMELOCK (after setup)");
  console.log("═".repeat(62));
  console.log(`
  1. Deploy new implementation (no upgrade yet):
       npx hardhat run scripts/admin/prepare-safe-upgrade.ts --network ${network.name}
       (get the new impl address)

  2. Encode upgradeToAndCall calldata:
       cast calldata "upgradeToAndCall(address,bytes)" <NEW_IMPL> 0x

  3. Safe proposes to TimelockController:
       TimelockController.schedule(
         target:     <VAULT_PROXY>,
         value:      0,
         data:       <upgradeToAndCall_calldata>,
         predecessor: bytes32(0),
         salt:        bytes32(0),
         delay:       ${delaySeconds}
       )

  4. Wait ${delaySeconds / 3600} hours.

  5. Anyone executes:
       TimelockController.execute(
         target, value, data, predecessor, salt
       )
`);

  // ── 5. Verification commands ─────────────────────────────────────────────────
  console.log("═".repeat(62));
  console.log("  VERIFY AFTER SAFE EXECUTES");
  console.log("═".repeat(62));
  console.log(`
  # TimelockController has UPGRADER_ROLE on YieldVault
  cast call ${yieldVaultAddress} "hasRole(bytes32,address)(bool)" \\
    ${UPGRADER_ROLE} ${timelockAddress} --rpc-url $MAINNET_RPC_URL

  # Safe no longer has UPGRADER_ROLE on YieldVault
  cast call ${yieldVaultAddress} "hasRole(bytes32,address)(bool)" \\
    ${UPGRADER_ROLE} ${safeAddress} --rpc-url $MAINNET_RPC_URL

  # Same checks for StakingVault
  cast call ${stakingVaultAddress} "hasRole(bytes32,address)(bool)" \\
    ${UPGRADER_ROLE} ${timelockAddress} --rpc-url $MAINNET_RPC_URL

  cast call ${stakingVaultAddress} "hasRole(bytes32,address)(bool)" \\
    ${UPGRADER_ROLE} ${safeAddress} --rpc-url $MAINNET_RPC_URL
`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
