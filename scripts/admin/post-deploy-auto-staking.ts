// @ts-ignore
import { ethers, network } from "hardhat";

/**
 * Post-deploy role setup and configuration for AutoStakingVault (mainnet).
 *
 * Run in two phases — controlled by the PHASE env var:
 *
 * ── PHASE=setup (run immediately after deployAutoStaking.ts) ──────────────────
 *   1. Grants PAUSER to operator EOA.
 *   2. Grants DEFAULT_ADMIN + UPGRADER to admin target (Safe / timelock).
 *   3. Reads reward guard config from PRIME StakingVault and mirrors it on AUTO.
 *   4. Optionally calls setNavOracle if NAV_ORACLE + NAV_FEED_ID are provided.
 *      If not provided, NAV_ORACLE_UPDATER is left with the deployer for PHASE=finalize.
 *   5. Renounces deployer's PAUSER, UPGRADER, DEFAULT_ADMIN (DEFAULT_ADMIN last — irreversible).
 *      Also renounces NAV_ORACLE_UPDATER if setNavOracle was called in step 4.
 *
 *   Required:
 *     PROXY_ADDRESS=0x...  PHASE=setup  PRIVATE_KEY=0x...
 *
 *   Optional (wire oracle in same transaction batch):
 *     NAV_ORACLE=0xdF4ab20fA7752Be52E41e42F1FD667f37964d6a3
 *     NAV_FEED_ID=0x<mainnet-auto-feed-id>
 *
 *   npx hardhat run scripts/admin/post-deploy-auto-staking.ts --network mainnet
 *
 * ── PHASE=finalize (run once AUTO mainnet feed ID is known, if skipped in setup) ─
 *   Calls setNavOracle, then renounces NAV_ORACLE_UPDATER from the deployer.
 *   After this the deployer holds no roles on the vault.
 *
 *   Required:
 *     PROXY_ADDRESS=0x...  PHASE=finalize
 *     NAV_ORACLE=0xdF4ab20fA7752Be52E41e42F1FD667f37964d6a3
 *     NAV_FEED_ID=0x<mainnet-auto-feed-id>
 *     PRIVATE_KEY=0x...
 *
 *   npx hardhat run scripts/admin/post-deploy-auto-staking.ts --network mainnet
 *
 * Optional for both phases:
 *   DRY_RUN=true — print all actions without sending transactions
 *
 * Reward guard overrides (PHASE=setup only, defaults read from PRIME):
 *   MAX_REWARD_PERCENT=<uint256>     override maxRewardPercent
 *   MAX_PERIOD_REWARDS=<uint256>     override maxPeriodRewards
 *   REWARD_PERIOD_SECONDS=<uint256>  override rewardPeriodSeconds
 *   MAX_TOTAL_REWARDS=<uint256>      override maxTotalRewards
 *
 * Hardcoded mainnet role targets (mirrors PRIME StakingVault role layout):
 *   ADMIN_TARGET = 0x8D358B8aE881F8ea92C3d07783aBCA21727C6309  (Safe / timelock)
 *   OPERATOR_EOA = 0xA8C3CF6183D49d5D372f8FC149BD2cb5CFC0faCd  (FACD operator)
 *   PRIME_VAULT  = 0x19ebb35279A16207Ec4ba82799CC64715065F7F6  (reward config source)
 *
 * Note: FREEZE_ADMIN and REWARDS_ADMIN are granted to OPERATOR_EOA at deploy
 * time via FREEZE_ADMIN_ADDRESS / REWARDS_ADMIN_ADDRESS env vars in
 * deployAutoStaking.ts — not handled here.
 */

// ── Constants ─────────────────────────────────────────────────────────────────
const ADMIN_TARGET   = "0x8D358B8aE881F8ea92C3d07783aBCA21727C6309";
const OPERATOR_EOA   = "0xA8C3CF6183D49d5D372f8FC149BD2cb5CFC0faCd";
const FEED_VERIFIER  = "0xdF4ab20fA7752Be52E41e42F1FD667f37964d6a3";

async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("PROXY_ADDRESS env var required (AutoStakingVault proxy)");

  const phase = (process.env.PHASE || "").toLowerCase();
  if (phase !== "setup" && phase !== "finalize") {
    throw new Error('PHASE env var required: "setup" or "finalize"');
  }

  const isDryRun = process.env.DRY_RUN === "true";
  const [deployer] = await ethers.getSigners();

  const vault = await ethers.getContractAt("AutoStakingVault", proxyAddress, deployer);

  const DEFAULT_ADMIN_ROLE      = await vault.DEFAULT_ADMIN_ROLE();
  const UPGRADER_ROLE           = await vault.UPGRADER_ROLE();
  const PAUSER_ROLE             = await vault.PAUSER_ROLE();
  const NAV_ORACLE_UPDATER_ROLE = await vault.NAV_ORACLE_UPDATER_ROLE();

  console.log("═".repeat(64));
  console.log(`  POST-DEPLOY AUTO STAKING — ${phase.toUpperCase()}${isDryRun ? " (DRY RUN)" : ""}`);
  console.log("═".repeat(64));
  console.log(`  Network:      ${network.name}`);
  console.log(`  Proxy:        ${proxyAddress}`);
  console.log(`  Deployer:     ${deployer.address}`);
  console.log(`  Admin target: ${ADMIN_TARGET}`);
  console.log(`  Operator EOA: ${OPERATOR_EOA}`);
  console.log("═".repeat(64));

  // ── PHASE: setup ─────────────────────────────────────────────────────────────
  if (phase === "setup") {
    const deployerHasAdmin = await vault.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    if (!deployerHasAdmin) {
      throw new Error(`Deployer ${deployer.address} does not hold DEFAULT_ADMIN_ROLE. Wrong signer?`);
    }

    // ── 1. Role grants ─────────────────────────────────────────────────────────
    console.log("\n  ── Step 1: Role grants ──");
    await grantIfMissing(vault, PAUSER_ROLE,        "PAUSER_ROLE",        OPERATOR_EOA, isDryRun);
    await grantIfMissing(vault, DEFAULT_ADMIN_ROLE, "DEFAULT_ADMIN_ROLE", ADMIN_TARGET, isDryRun);
    await grantIfMissing(vault, UPGRADER_ROLE,      "UPGRADER_ROLE",      ADMIN_TARGET, isDryRun);

    // Safety gate: admin target must hold DEFAULT_ADMIN before deployer renounces
    if (!isDryRun) {
      const adminHasRole = await vault.hasRole(DEFAULT_ADMIN_ROLE, ADMIN_TARGET);
      if (!adminHasRole) throw new Error("⚠️  Abort: admin target does not hold DEFAULT_ADMIN — do NOT proceed");
    }

    // ── 2. Optional: setNavOracle (if feed ID is already available) ─────────────
    const navOracle = process.env.NAV_ORACLE ?? FEED_VERIFIER;
    const navFeedId = process.env.NAV_FEED_ID ?? "";
    let oracleSet = false;

    if (navFeedId) {
      console.log("\n  ── Step 2: Wire NAV oracle ──");
      if (!navFeedId.startsWith("0x") || navFeedId.length !== 66) {
        throw new Error(`NAV_FEED_ID must be a 32-byte hex string (66 chars). Got: ${navFeedId}`);
      }
      console.log(`  NAV_ORACLE:  ${navOracle}`);
      console.log(`  NAV_FEED_ID: ${navFeedId}`);
      if (isDryRun) {
        console.log(`  [dry] setNavOracle(${navOracle}, ${navFeedId})`);
      } else {
        const tx = await vault.setNavOracle(navOracle, navFeedId);
        await tx.wait();
        console.log(`  ✅ setNavOracle — tx: ${tx.hash}`);
        console.log(`     navOracle:  ${await vault.navOracle()}`);
        console.log(`     navFeedId:  ${await vault.navFeedId()}`);
      }
      oracleSet = true;
    } else {
      console.log("\n  ── Step 3: Wire NAV oracle — SKIPPED (NAV_FEED_ID not provided) ──");
      console.log("  ⏳ NAV_ORACLE_UPDATER retained by deployer until PHASE=finalize.");
    }

    // ── 4. Deployer renounces — DEFAULT_ADMIN last ──────────────────────────────
    console.log("\n  ── Step 4: Deployer renounces ──");
    await renounceIfHeld(vault, PAUSER_ROLE,   "PAUSER_ROLE",   deployer, isDryRun);
    await renounceIfHeld(vault, UPGRADER_ROLE, "UPGRADER_ROLE", deployer, isDryRun);
    if (oracleSet) {
      await renounceIfHeld(vault, NAV_ORACLE_UPDATER_ROLE, "NAV_ORACLE_UPDATER_ROLE", deployer, isDryRun);
    }
    await renounceIfHeld(vault, DEFAULT_ADMIN_ROLE, "DEFAULT_ADMIN_ROLE ⚠️  IRREVERSIBLE", deployer, isDryRun);

    // ── Summary ────────────────────────────────────────────────────────────────
    console.log("\n  ✅ Setup complete.\n");
    console.log("  ── Verify role state ──");
    console.log(`  cast call ${proxyAddress} "hasRole(bytes32,address)(bool)" ${DEFAULT_ADMIN_ROLE} ${ADMIN_TARGET} --rpc-url $RPC   # expect: true`);
    console.log(`  cast call ${proxyAddress} "hasRole(bytes32,address)(bool)" ${UPGRADER_ROLE} ${ADMIN_TARGET} --rpc-url $RPC         # expect: true`);
    console.log(`  cast call ${proxyAddress} "hasRole(bytes32,address)(bool)" ${PAUSER_ROLE} ${OPERATOR_EOA} --rpc-url $RPC           # expect: true`);
    console.log(`  cast call ${proxyAddress} "hasRole(bytes32,address)(bool)" ${DEFAULT_ADMIN_ROLE} ${deployer.address} --rpc-url $RPC # expect: false`);
    if (!oracleSet) {
      console.log(`  cast call ${proxyAddress} "hasRole(bytes32,address)(bool)" ${NAV_ORACLE_UPDATER_ROLE} ${deployer.address} --rpc-url $RPC # expect: true (until finalize)`);
      console.log(`\n  ⏳ When AUTO mainnet feed ID is available, run PHASE=finalize:`);
      console.log(`     PROXY_ADDRESS=${proxyAddress} PHASE=finalize \\`);
      console.log(`     NAV_ORACLE=${FEED_VERIFIER} \\`);
      console.log(`     NAV_FEED_ID=0x<mainnet-auto-feed-id> \\`);
      console.log(`     PRIVATE_KEY=$PRIVATE_KEY \\`);
      console.log(`       npx hardhat run scripts/admin/post-deploy-auto-staking.ts --network mainnet`);
    }
    console.log(`\n  ── Next step (via Safe) ──`);
    console.log(`  Grant REWARDS_ADMIN on YieldVault to AutoStakingVault proxy:`);
    console.log(`     YIELD_VAULT_ADDRESS=0x6aD038cA6C04e885630851278ca0a856Ad9a66Cc \\`);
    console.log(`     VAULT_ADDRESS=${proxyAddress} \\`);
    console.log(`       npx hardhat run scripts/admin/grant_yield_vault_rewards_admin.ts --network mainnet`);
  }

  // ── PHASE: finalize ───────────────────────────────────────────────────────────
  if (phase === "finalize") {
    const navOracle = process.env.NAV_ORACLE ?? FEED_VERIFIER;
    const navFeedId = process.env.NAV_FEED_ID;
    if (!navFeedId) throw new Error("NAV_FEED_ID env var required");
    if (!navFeedId.startsWith("0x") || navFeedId.length !== 66) {
      throw new Error(`NAV_FEED_ID must be a 32-byte hex string (66 chars). Got: ${navFeedId}`);
    }

    const hasUpdater = await vault.hasRole(NAV_ORACLE_UPDATER_ROLE, deployer.address);
    if (!hasUpdater) throw new Error("Deployer does not hold NAV_ORACLE_UPDATER_ROLE. Already finalized?");

    console.log(`\n  NAV_ORACLE:  ${navOracle}`);
    console.log(`  NAV_FEED_ID: ${navFeedId}\n`);

    if (isDryRun) {
      console.log(`  [dry] setNavOracle(${navOracle}, ${navFeedId})`);
    } else {
      const tx = await vault.setNavOracle(navOracle, navFeedId);
      await tx.wait();
      console.log(`  ✅ setNavOracle — tx: ${tx.hash}`);
      console.log(`     navOracle:  ${await vault.navOracle()}`);
      console.log(`     navFeedId:  ${await vault.navFeedId()}`);
    }

    await renounceIfHeld(vault, NAV_ORACLE_UPDATER_ROLE, "NAV_ORACLE_UPDATER_ROLE", deployer, isDryRun);

    console.log("\n  ✅ Finalize complete. Deployer holds no roles on AutoStakingVault.");
    console.log(`\n  ── Next step (via Safe) ──`);
    console.log(`  Grant REWARDS_ADMIN on YieldVault to AutoStakingVault proxy:`);
    console.log(`     YIELD_VAULT_ADDRESS=0x6aD038cA6C04e885630851278ca0a856Ad9a66Cc \\`);
    console.log(`     VAULT_ADDRESS=${proxyAddress} \\`);
    console.log(`       npx hardhat run scripts/admin/grant_yield_vault_rewards_admin.ts --network mainnet`);
  }

  console.log("\n" + "═".repeat(64));
}

async function grantIfMissing(
  vault: any, roleHash: string, roleName: string,
  target: string, isDryRun: boolean
): Promise<void> {
  const already = await vault.hasRole(roleHash, target);
  if (already) {
    console.log(`  ℹ️  ${roleName}: ${target} already has this role — skipping`);
    return;
  }
  if (isDryRun) {
    console.log(`  [dry] grantRole(${roleName}, ${target})`);
    return;
  }
  const tx = await vault.grantRole(roleHash, target);
  await tx.wait();
  console.log(`  ✅ grantRole(${roleName}, ${target}) — tx: ${tx.hash}`);
}

async function renounceIfHeld(
  vault: any, roleHash: string, roleName: string,
  signer: any, isDryRun: boolean
): Promise<void> {
  const has = await vault.hasRole(roleHash, signer.address);
  if (!has) {
    console.log(`  ℹ️  ${roleName}: deployer doesn't have this role — skipping`);
    return;
  }
  if (isDryRun) {
    console.log(`  [dry] renounceRole(${roleName}, ${signer.address})`);
    return;
  }
  const tx = await vault.renounceRole(roleHash, signer.address);
  await tx.wait();
  console.log(`  ✅ renounceRole(${roleName}) — tx: ${tx.hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
