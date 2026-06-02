// @ts-ignore
import { ethers, network, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys an OZ TimelockController and generates the Safe calldata to migrate
 * BOTH `UPGRADER_ROLE` and `DEFAULT_ADMIN_ROLE` from Safe → TimelockController on
 * YieldVault and StakingVault (Option A migration — see local_docs/TIMELOCK_PLAYBOOK.md).
 *
 * Why DEFAULT_ADMIN_ROLE too: leaving DEFAULT_ADMIN on the Safe means a
 * compromised/coerced Safe can re-grant itself UPGRADER_ROLE at any time and
 * bypass the timelock entirely. Moving DEFAULT_ADMIN behind the timelock makes
 * the 12h delay an actual guarantee, not a polite suggestion.
 *
 * PAUSER_ROLE intentionally stays with the Safe so pause remains instant.
 * (Pause/unpause symmetry is a documented accepted limitation —
 *  see TIMELOCK_PLAYBOOK.md §"Threat model and limitations".)
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
 *   DELAY=43200 \
 *   DRY_RUN=true \
 *     npx hardhat run scripts/admin/deploy-timelock.ts --network sepolia
 *
 * Env vars:
 *   SAFE      - Safe multisig address (proposer/canceller/admin). Required.
 *   DELAY     - Timelock delay in seconds. Default: 43200 (12h, per REQUIREMENTS §4.3).
 *   DRY_RUN   - If "true", skips deployment and only prints what would happen.
 *   YIELD_VAULT   - Override YieldVault proxy address.
 *   STAKING_VAULT - Override StakingVault proxy address.
 */

const MAINNET_DEPLOYMENT = path.join(__dirname, "../../deployment_mainnet.json");
const SEPOLIA_DEPLOYMENT = path.join(__dirname, "../../deployment_testnet_sepolia.json");

function deploymentPath(networkName: string): string | null {
  if (networkName === "mainnet") return MAINNET_DEPLOYMENT;
  if (networkName === "sepolia") return SEPOLIA_DEPLOYMENT;
  return null;
}

function loadDeployment(networkName: string): any {
  const file = deploymentPath(networkName);
  if (!file || !fs.existsSync(file)) throw new Error(`Deployment file not found for network: ${networkName}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function timelockDeploymentPath(networkName: string): string {
  const suffix = networkName === "mainnet" ? "mainnet" : networkName === "sepolia" ? "testnet_sepolia" : networkName;
  return path.join(__dirname, `../../deployment_timelock_${suffix}.json`);
}

function persistTimelock(networkName: string, entry: Record<string, any>): void {
  const file = timelockDeploymentPath(networkName);
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const merged = {
    network: networkName,
    ...existing,
    ...entry,
  };
  fs.writeFileSync(file, JSON.stringify(merged, null, 2) + "\n");
  console.log(`📝 Wrote timelock deployment to ${path.basename(file)}`);
}

async function main() {
  const safeAddress   = process.env.SAFE;
  const delaySeconds  = parseInt(process.env.DELAY || "43200"); // 12h default (REQUIREMENTS §4.3)
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
    const deployTx = timelock.deploymentTransaction()?.hash;
    console.log(`✅ TimelockController deployed: ${timelockAddress}`);

    // Persist to deployment_<network>.json
    persistTimelock(network.name, {
      address: timelockAddress,
      delaySeconds,
      proposer: safeAddress,
      executor: ethers.ZeroAddress,
      admin: safeAddress,
      deployedAt: new Date().toISOString(),
      deployTx: deployTx || null,
    });

    // ── 1b. Auto-verify on Etherscan (best-effort) ──────────────────────────
    // Skips silently if VERIFY=false, ETHERSCAN_API_KEY missing, or local network.
    const wantVerify = process.env.VERIFY !== "false" && network.name !== "hardhat" && network.name !== "localhost";
    if (wantVerify && !process.env.ETHERSCAN_API_KEY) {
      console.log("\n⚠️  Skipping verify: ETHERSCAN_API_KEY not set.");
    } else if (wantVerify) {
      console.log("\n⏳ Waiting 30s for Etherscan to index the deploy tx before verifying...");
      await new Promise((r) => setTimeout(r, 30_000));
      try {
        await run("verify:verify", {
          address: timelockAddress,
          contract: "contracts/utils/HastraTimelockController.sol:HastraTimelockController",
          constructorArguments: [
            delaySeconds,
            [safeAddress],
            [ethers.ZeroAddress],
            safeAddress,
          ],
        });
        console.log(`✅ Verified on Etherscan`);
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (msg.toLowerCase().includes("already verified")) {
          console.log(`✅ Already verified on Etherscan`);
        } else {
          console.log(`⚠️  Verify failed (non-fatal): ${msg.split("\n")[0]}`);
          console.log(`    You can retry manually:`);
          console.log(`    ETHERSCAN_API_KEY=... npx hardhat verify --network ${network.name} \\`);
          console.log(`      --contract contracts/utils/HastraTimelockController.sol:HastraTimelockController \\`);
          console.log(`      ${timelockAddress} ${delaySeconds} '["${safeAddress}"]' '["${ethers.ZeroAddress}"]' ${safeAddress}`);
        }
      }
    }
  }

  // ── 2. Resolve role hashes from YieldVault ──────────────────────────────────
  const vault = await ethers.getContractAt("YieldVault", yieldVaultAddress);
  const UPGRADER_ROLE = await vault.UPGRADER_ROLE();
  const DEFAULT_ADMIN_ROLE = await vault.DEFAULT_ADMIN_ROLE();

  if (dryRun) {
    console.log(`\n  UPGRADER_ROLE       hash: ${UPGRADER_ROLE}`);
    console.log(`  DEFAULT_ADMIN_ROLE  hash: ${DEFAULT_ADMIN_ROLE}`);
    console.log("  [DRY RUN] Deploy TimelockController first, then re-run without DRY_RUN=true");
    console.log("  to generate the Safe calldata with the real timelock address.");
    return;
  }

  // ── 3. Generate Safe calldata (Option A — full admin migration) ─────────────
  // BATCH 1 (grants — reversible, Safe still has DEFAULT_ADMIN after this):
  //   grantRole(UPGRADER_ROLE,      timelock) on YieldVault
  //   grantRole(UPGRADER_ROLE,      timelock) on StakingVault
  //   grantRole(DEFAULT_ADMIN_ROLE, timelock) on YieldVault
  //   grantRole(DEFAULT_ADMIN_ROLE, timelock) on StakingVault
  //
  // BATCH 2 (renounces — IRREVERSIBLE for DEFAULT_ADMIN; queue only after
  // you have rehearsed an upgrade through the timelock end-to-end):
  //   renounceRole(UPGRADER_ROLE,      Safe) on YieldVault
  //   renounceRole(UPGRADER_ROLE,      Safe) on StakingVault
  //   renounceRole(DEFAULT_ADMIN_ROLE, Safe) on YieldVault   ← point of no return
  //   renounceRole(DEFAULT_ADMIN_ROLE, Safe) on StakingVault ← point of no return
  //
  // We use renounceRole (not revokeRole) so each call's authority check is
  // "msg.sender == account" — no DEFAULT_ADMIN dependency. This makes the
  // batch order-independent: even if a Safe operator reorders or splits the
  // batch, no call can revert because Safe no longer has DEFAULT_ADMIN.

  const iface = new ethers.Interface([
    "function grantRole(bytes32 role, address account)",
    "function renounceRole(bytes32 role, address account)",
  ]);

  const batch1Grants = [
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
      label: "YieldVault — grant DEFAULT_ADMIN_ROLE to TimelockController",
      to: yieldVaultAddress,
      data: iface.encodeFunctionData("grantRole", [DEFAULT_ADMIN_ROLE, timelockAddress]),
    },
    {
      label: "StakingVault — grant DEFAULT_ADMIN_ROLE to TimelockController",
      to: stakingVaultAddress,
      data: iface.encodeFunctionData("grantRole", [DEFAULT_ADMIN_ROLE, timelockAddress]),
    },
  ];

  const batch2Renounces = [
    {
      label: "YieldVault — renounce UPGRADER_ROLE from Safe",
      to: yieldVaultAddress,
      data: iface.encodeFunctionData("renounceRole", [UPGRADER_ROLE, safeAddress]),
    },
    {
      label: "StakingVault — renounce UPGRADER_ROLE from Safe",
      to: stakingVaultAddress,
      data: iface.encodeFunctionData("renounceRole", [UPGRADER_ROLE, safeAddress]),
    },
    {
      label: "YieldVault — renounce DEFAULT_ADMIN_ROLE from Safe  ⚠️  IRREVERSIBLE",
      to: yieldVaultAddress,
      data: iface.encodeFunctionData("renounceRole", [DEFAULT_ADMIN_ROLE, safeAddress]),
    },
    {
      label: "StakingVault — renounce DEFAULT_ADMIN_ROLE from Safe  ⚠️  IRREVERSIBLE",
      to: stakingVaultAddress,
      data: iface.encodeFunctionData("renounceRole", [DEFAULT_ADMIN_ROLE, safeAddress]),
    },
  ];

  console.log("\n" + "═".repeat(62));
  console.log("  SAFE TRANSACTIONS — OPTION A FULL ADMIN MIGRATION");
  console.log("═".repeat(62));
  console.log(`  UPGRADER_ROLE      hash: ${UPGRADER_ROLE}`);
  console.log(`  DEFAULT_ADMIN_ROLE hash: ${DEFAULT_ADMIN_ROLE}`);
  console.log(`  TimelockController:      ${timelockAddress}`);
  console.log();

  console.log("─".repeat(62));
  console.log("  BATCH 1 — Grants (queue first, fully reversible)");
  console.log("─".repeat(62));
  for (const call of batch1Grants) {
    console.log(`  ── ${call.label}`);
    console.log(`     To:       ${call.to}`);
    console.log(`     Value:    0`);
    console.log(`     Calldata: ${call.data}`);
    console.log();
  }

  console.log("─".repeat(62));
  console.log("  BATCH 2 — Renounces (queue ONLY after you've rehearsed an");
  console.log("            upgrade through the timelock end-to-end)");
  console.log("            ⚠️  DEFAULT_ADMIN renounce is IRREVERSIBLE");
  console.log("─".repeat(62));
  for (const call of batch2Renounces) {
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
  RPC=$SEPOLIA_RPC_URL   # or $MAINNET_RPC_URL

  # ─── Timelock has both roles ────────────────────────────────────────
  cast call ${yieldVaultAddress} "hasRole(bytes32,address)(bool)" \\
    ${UPGRADER_ROLE} ${timelockAddress} --rpc-url $RPC   # expect: true
  cast call ${yieldVaultAddress} "hasRole(bytes32,address)(bool)" \\
    ${DEFAULT_ADMIN_ROLE} ${timelockAddress} --rpc-url $RPC   # expect: true
  cast call ${stakingVaultAddress} "hasRole(bytes32,address)(bool)" \\
    ${UPGRADER_ROLE} ${timelockAddress} --rpc-url $RPC   # expect: true
  cast call ${stakingVaultAddress} "hasRole(bytes32,address)(bool)" \\
    ${DEFAULT_ADMIN_ROLE} ${timelockAddress} --rpc-url $RPC   # expect: true

  # ─── Safe has neither UPGRADER nor DEFAULT_ADMIN anymore ────────────
  cast call ${yieldVaultAddress} "hasRole(bytes32,address)(bool)" \\
    ${UPGRADER_ROLE} ${safeAddress} --rpc-url $RPC   # expect: false
  cast call ${yieldVaultAddress} "hasRole(bytes32,address)(bool)" \\
    ${DEFAULT_ADMIN_ROLE} ${safeAddress} --rpc-url $RPC   # expect: false
  cast call ${stakingVaultAddress} "hasRole(bytes32,address)(bool)" \\
    ${UPGRADER_ROLE} ${safeAddress} --rpc-url $RPC   # expect: false
  cast call ${stakingVaultAddress} "hasRole(bytes32,address)(bool)" \\
    ${DEFAULT_ADMIN_ROLE} ${safeAddress} --rpc-url $RPC   # expect: false

  # ─── Safe DOES still have PAUSER_ROLE (instant pause preserved) ─────
  # PAUSER_ROLE hash:
  cast keccak "PAUSER_ROLE"
  cast call ${yieldVaultAddress} "hasRole(bytes32,address)(bool)" \\
    $(cast keccak "PAUSER_ROLE") ${safeAddress} --rpc-url $RPC   # expect: true
  cast call ${stakingVaultAddress} "hasRole(bytes32,address)(bool)" \\
    $(cast keccak "PAUSER_ROLE") ${safeAddress} --rpc-url $RPC   # expect: true
`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
