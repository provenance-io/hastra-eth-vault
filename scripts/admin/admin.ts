// @ts-nocheck
import { ethers, network } from "hardhat";
import * as fs from "fs";
import { getDeploymentFile } from "../utils/getDeploymentFile";

/**
 * Admin operations for managing YieldVault and StakingVault
 * 
 * This script provides functions for common administrative tasks:
 * - Granting and revoking roles
 * - Pausing and unpausing contracts
 * - Creating rewards epochs
 * - Freezing and thawing accounts
 * - Updating configuration
 * - Delegating REWARDS_ADMIN role
 */

// Load deployment file
function loadDeployment() {
  const deploymentFile = getDeploymentFile(network.name);
  
  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`Deployment file ${deploymentFile} not found!`);
  }
  
  return JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
}

// Get contract addresses from deployment
const deployment = loadDeployment();
const YIELD_VAULT_ADDRESS = process.env.YIELD_VAULT_ADDRESS || deployment.contracts.yieldVault;
const STAKING_VAULT_ADDRESS = process.env.STAKING_VAULT_ADDRESS || deployment.contracts.stakingVault;

/**
 * Grant a role to an address
 */
async function grantRole(
  contractAddress: string,
  roleName: string,
  grantee: string
) {
  const [admin] = await ethers.getSigners();
  const vault = await ethers.getContractAt("YieldVault", contractAddress);

  let role: string;
  
  switch (roleName.toUpperCase().replace(/_ROLE$/, "")) {
    case "DEFAULT_ADMIN":
    case "ADMIN":
      role = ethers.ZeroHash;
      break;
    case "FREEZE_ADMIN":
      role = await vault.FREEZE_ADMIN_ROLE();
      break;
    case "REWARDS_ADMIN":
      role = await vault.REWARDS_ADMIN_ROLE();
      break;
    case "NAV_ORACLE_UPDATER":
      role = await vault.NAV_ORACLE_UPDATER_ROLE();
      break;
    case "PAUSER":
      role = await vault.PAUSER_ROLE();
      break;
    case "UPGRADER":
      role = await vault.UPGRADER_ROLE();
      break;
    case "WHITELIST_ADMIN":
      role = await vault.WHITELIST_ADMIN_ROLE();
      break;
    case "WITHDRAWAL_ADMIN":
      role = await vault.WITHDRAWAL_ADMIN_ROLE();
      break;
    default:
      throw new Error(`Unknown role: ${roleName}. Available: DEFAULT_ADMIN, FREEZE_ADMIN, REWARDS_ADMIN, NAV_ORACLE_UPDATER, PAUSER, UPGRADER, WHITELIST_ADMIN, WITHDRAWAL_ADMIN`);
  }

  console.log(`Granting ${roleName} role to ${grantee}...`);
  const tx = await vault.grantRole(role, grantee);
  await tx.wait();
  
  console.log(`✓ Role granted in tx: ${tx.hash}`);
}

/**
 * Revoke a role from an address
 */
async function revokeRole(
  contractAddress: string,
  roleName: string,
  revokee: string
) {
  const [admin] = await ethers.getSigners();
  const vault = await ethers.getContractAt("YieldVault", contractAddress);

  let role: string;
  
  switch (roleName.toUpperCase().replace(/_ROLE$/, "")) {
    case "DEFAULT_ADMIN":
    case "ADMIN":
      role = ethers.ZeroHash;
      break;
    case "FREEZE_ADMIN":
      role = await vault.FREEZE_ADMIN_ROLE();
      break;
    case "REWARDS_ADMIN":
      role = await vault.REWARDS_ADMIN_ROLE();
      break;
    case "NAV_ORACLE_UPDATER":
      role = await vault.NAV_ORACLE_UPDATER_ROLE();
      break;
    case "PAUSER":
      role = await vault.PAUSER_ROLE();
      break;
    case "UPGRADER":
      role = await vault.UPGRADER_ROLE();
      break;
    case "WHITELIST_ADMIN":
      role = await vault.WHITELIST_ADMIN_ROLE();
      break;
    case "WITHDRAWAL_ADMIN":
      role = await vault.WITHDRAWAL_ADMIN_ROLE();
      break;
    default:
      throw new Error(`Unknown role: ${roleName}. Available: DEFAULT_ADMIN, FREEZE_ADMIN, REWARDS_ADMIN, NAV_ORACLE_UPDATER, PAUSER, UPGRADER, WHITELIST_ADMIN, WITHDRAWAL_ADMIN`);
  }

  console.log(`Revoking ${roleName} role from ${revokee}...`);
  const tx = await vault.revokeRole(role, revokee);
  await tx.wait();
  
  console.log(`✓ Role revoked in tx: ${tx.hash}`);
}

/**
 * Pause a vault
 */
async function pauseVault(contractAddress: string) {
  const [pauser] = await ethers.getSigners();
  const vault = await ethers.getContractAt("YieldVault", contractAddress);

  console.log(`Pausing vault at ${contractAddress}...`);
  const tx = await vault.pause();
  await tx.wait();
  
  console.log(`✓ Vault paused in tx: ${tx.hash}`);
}

/**
 * Unpause a vault
 */
async function unpauseVault(contractAddress: string) {
  const [pauser] = await ethers.getSigners();
  const vault = await ethers.getContractAt("YieldVault", contractAddress);

  console.log(`Unpausing vault at ${contractAddress}...`);
  const tx = await vault.unpause();
  await tx.wait();
  
  console.log(`✓ Vault unpaused in tx: ${tx.hash}`);
}

/**
 * Freeze an account
 */
async function freezeAccount(
  contractAddress: string,
  accountAddress: string
) {
  const [freezeAdmin] = await ethers.getSigners();
  const vault = await ethers.getContractAt("YieldVault", contractAddress);

  console.log(`Freezing account ${accountAddress}...`);
  const tx = await vault.freezeAccount(accountAddress);
  await tx.wait();
  
  console.log(`✓ Account frozen in tx: ${tx.hash}`);
}

/**
 * Thaw an account
 */
async function thawAccount(
  contractAddress: string,
  accountAddress: string
) {
  const [freezeAdmin] = await ethers.getSigners();
  const vault = await ethers.getContractAt("YieldVault", contractAddress);

  console.log(`Thawing account ${accountAddress}...`);
  const tx = await vault.thawAccount(accountAddress);
  await tx.wait();
  
  console.log(`✓ Account thawed in tx: ${tx.hash}`);
}

/**
 * Create a rewards epoch
 */
async function createRewardsEpoch(
  epochIndex: number,
  merkleRoot: string,
  totalRewards: bigint
) {
  const [rewardsAdmin] = await ethers.getSigners();
  const vault = await ethers.getContractAt("YieldVault", YIELD_VAULT_ADDRESS);

  console.log(`Creating rewards epoch ${epochIndex}...`);
  console.log(`Merkle root: ${merkleRoot}`);
  console.log(`Total rewards: ${ethers.formatUnits(totalRewards, 6)} wYLDS`);
  
  const tx = await vault.createRewardsEpoch(epochIndex, merkleRoot, totalRewards);
  await tx.wait();
  
  console.log(`✓ Epoch created in tx: ${tx.hash}`);
}

/**
 * Complete a pending redemption
 */
async function completeRedemption(userAddress: string) {
  const [rewardsAdmin] = await ethers.getSigners();
  const vault = await ethers.getContractAt("YieldVault", YIELD_VAULT_ADDRESS);

  console.log(`Completing redemption for ${userAddress}...`);
  
  // Check pending redemption
  const pending = await vault.pendingRedemptions(userAddress);
  console.log(`Pending shares: ${ethers.formatUnits(pending.shares, 6)}`);
  console.log(`Pending assets: ${ethers.formatUnits(pending.assets, 6)}`);
  
  const tx = await vault.completeRedeem(userAddress);
  await tx.wait();
  
  console.log(`✓ Redemption completed in tx: ${tx.hash}`);
}

/**
 * Distribute rewards to staking vault
 */
async function distributeStakingRewards(amount: bigint) {
  const [rewardsAdmin] = await ethers.getSigners();
  const stakingVault = await ethers.getContractAt(
    "StakingVault",
    STAKING_VAULT_ADDRESS
  );
  const yieldVault = await ethers.getContractAt(
    "YieldVault",
    YIELD_VAULT_ADDRESS
  );

  console.log(`Distributing ${ethers.formatUnits(amount, 6)} wYLDS to staking vault...`);
  
  // Approve staking vault to pull wYLDS
  const approveTx = await yieldVault.approve(STAKING_VAULT_ADDRESS, amount);
  await approveTx.wait();
  console.log(`✓ Approved in tx: ${approveTx.hash}`);
  
  // Distribute rewards
  const distributeTx = await stakingVault.distributeRewards(amount);
  await distributeTx.wait();
  
  console.log(`✓ Rewards distributed in tx: ${distributeTx.hash}`);
}

/**
 * Set max reward percent on StakingVault
 */
async function setMaxRewardPercent(percent: bigint) {
  const [admin] = await ethers.getSigners();
  const contractAddress = process.env.CONTRACT_ADDRESS || STAKING_VAULT_ADDRESS;
  const vault = await ethers.getContractAt("StakingVault", contractAddress, admin);
  const current = await vault.maxRewardPercent();
  console.log(`Current maxRewardPercent: ${current.toString()} (${(Number(current) / 1e18 * 100).toFixed(2)}%)`);
  const tx = await vault.setMaxRewardPercent(percent);
  await tx.wait();
  const updated = await vault.maxRewardPercent();
  console.log(`✓ Updated maxRewardPercent: ${updated.toString()} (${(Number(updated) / 1e18 * 100).toFixed(2)}%)`);
  console.log(`  Tx: ${tx.hash}`);
}

/**
 * Update redeem vault address
 */
async function updateRedeemVault(newRedeemVault: string) {
  const [admin] = await ethers.getSigners();
  const vault = await ethers.getContractAt("YieldVault", YIELD_VAULT_ADDRESS);

  console.log(`Updating redeem vault to ${newRedeemVault}...`);
  const tx = await vault.setRedeemVault(newRedeemVault);
  await tx.wait();
  
  console.log(`✓ Redeem vault updated in tx: ${tx.hash}`);
}

/**
 * Delegate a role to specified address on both vaults (or single vault)
 */
async function delegateRole(
  roleName: string,
  targetAddress: string,
  vaultType: "both" | "yield" | "staking" = "both"
) {
  if (!targetAddress) {
    throw new Error("Target address is required for delegation");
  }
  
  const [admin] = await ethers.getSigners();
  
  console.log(`🔐 DELEGATING ${roleName.toUpperCase()} ROLE`);
  console.log("=".repeat(60));
  console.log("Admin:", admin.address);
  console.log("Target:", targetAddress);
  console.log("Vault Type:", vaultType);
  console.log("");
  console.log("📍 Contract Addresses:");
  console.log("YieldVault:   ", YIELD_VAULT_ADDRESS);
  console.log("StakingVault: ", STAKING_VAULT_ADDRESS);
  console.log("");
  
  // Get contracts
  const yieldVault = await ethers.getContractAt("YieldVault", YIELD_VAULT_ADDRESS);
  const stakingVault = await ethers.getContractAt("StakingVault", STAKING_VAULT_ADDRESS);
  
  // Get role identifier
  let roleHash: string;
  const upperRoleName = roleName.toUpperCase().replace(/-/g, '_');
  
  switch (upperRoleName) {
    case "DEFAULT_ADMIN":
    case "ADMIN":
      roleHash = ethers.ZeroHash;
      break;
    case "FREEZE_ADMIN":
      roleHash = await yieldVault.FREEZE_ADMIN_ROLE();
      break;
    case "REWARDS_ADMIN":
      roleHash = await yieldVault.REWARDS_ADMIN_ROLE();
      break;
    case "NAV_ORACLE_UPDATER":
      if (vaultType === "yield") {
        throw new Error("NAV_ORACLE_UPDATER is only available on StakingVault");
      }
      roleHash = await stakingVault.NAV_ORACLE_UPDATER_ROLE();
      break;
    case "PAUSER":
      roleHash = await yieldVault.PAUSER_ROLE();
      break;
    case "UPGRADER":
      roleHash = await yieldVault.UPGRADER_ROLE();
      break;
    case "WHITELIST_ADMIN":
      if (vaultType === "staking") {
        throw new Error("WHITELIST_ADMIN is only available on YieldVault");
      }
      roleHash = await yieldVault.WHITELIST_ADMIN_ROLE();
      break;
    case "WITHDRAWAL_ADMIN":
      if (vaultType === "staking") {
        throw new Error("WITHDRAWAL_ADMIN is only available on YieldVault");
      }
      roleHash = await yieldVault.WITHDRAWAL_ADMIN_ROLE();
      break;
    default:
      throw new Error(`Unknown role: ${roleName}. Available: DEFAULT_ADMIN, FREEZE_ADMIN, REWARDS_ADMIN, NAV_ORACLE_UPDATER, PAUSER, UPGRADER, WHITELIST_ADMIN, WITHDRAWAL_ADMIN`);
  }
  
  // Check current status
  console.log("📊 CURRENT STATUS:");
  
  let hasYieldRole = false;
  let hasStakingRole = false;
  
  if (vaultType === "both" || vaultType === "yield") {
    hasYieldRole = await yieldVault.hasRole(roleHash, targetAddress);
    console.log(`  YieldVault:   ${hasYieldRole ? "✅ Already granted" : "❌ Not granted"}`);
  }
  
  if (vaultType === "both" || vaultType === "staking") {
    // Skip vault-specific roles for StakingVault
    if (upperRoleName !== "WHITELIST_ADMIN" && upperRoleName !== "WITHDRAWAL_ADMIN") {
      hasStakingRole = await stakingVault.hasRole(roleHash, targetAddress);
      console.log(`  StakingVault: ${hasStakingRole ? "✅ Already granted" : "❌ Not granted"}`);
    }
  }
  
  console.log("");
  
  // Grant to YieldVault
  if ((vaultType === "both" || vaultType === "yield") && !hasYieldRole) {
    console.log("1️⃣ Granting role to YieldVault...");
    const tx = await yieldVault.grantRole(roleHash, targetAddress);
    console.log(`   Tx: ${tx.hash}`);
    await tx.wait();
    console.log("   ✅ Granted!");
  } else if (vaultType === "both" || vaultType === "yield") {
    console.log("1️⃣ YieldVault already granted - skipping");
  }
  
  console.log("");
  
  // Grant to StakingVault (skip vault-specific roles)
  if ((vaultType === "both" || vaultType === "staking") && 
      upperRoleName !== "WHITELIST_ADMIN" && 
      upperRoleName !== "WITHDRAWAL_ADMIN" &&
      !hasStakingRole) {
    console.log("2️⃣ Granting role to StakingVault...");
    const tx = await stakingVault.grantRole(roleHash, targetAddress);
    console.log(`   Tx: ${tx.hash}`);
    await tx.wait();
    console.log("   ✅ Granted!");
  } else if ((vaultType === "both" || vaultType === "staking") && 
             upperRoleName !== "WHITELIST_ADMIN" && 
             upperRoleName !== "WITHDRAWAL_ADMIN") {
    console.log("2️⃣ StakingVault already granted - skipping");
  }
  
  console.log("");
  console.log("=".repeat(60));
  console.log("✅ DELEGATION COMPLETE!");
  console.log(`${targetAddress} now has ${roleName.toUpperCase()} role`);
  console.log("=".repeat(60));
}

/**
 * Check role membership
 */
async function checkRole(
  contractAddress: string,
  roleName: string,
  account: string
) {
  const vault = await ethers.getContractAt("YieldVault", contractAddress);

  let role: string;
  
  switch (roleName.toUpperCase().replace(/_ROLE$/, "")) {
    case "DEFAULT_ADMIN":
    case "ADMIN":
      role = ethers.ZeroHash;
      break;
    case "FREEZE_ADMIN":
      role = await vault.FREEZE_ADMIN_ROLE();
      break;
    case "REWARDS_ADMIN":
      role = await vault.REWARDS_ADMIN_ROLE();
      break;
    case "NAV_ORACLE_UPDATER":
      role = await vault.NAV_ORACLE_UPDATER_ROLE();
      break;
    case "PAUSER":
      role = await vault.PAUSER_ROLE();
      break;
    case "UPGRADER":
      role = await vault.UPGRADER_ROLE();
      break;
    case "WHITELIST_ADMIN":
      role = await vault.WHITELIST_ADMIN_ROLE();
      break;
    case "WITHDRAWAL_ADMIN":
      role = await vault.WITHDRAWAL_ADMIN_ROLE();
      break;
    default:
      throw new Error(`Unknown role: ${roleName}. Available: DEFAULT_ADMIN, FREEZE_ADMIN, REWARDS_ADMIN, NAV_ORACLE_UPDATER, PAUSER, UPGRADER, WHITELIST_ADMIN, WITHDRAWAL_ADMIN`);
  }

  const hasRole = await vault.hasRole(role, account);
  console.log(`${account} has ${roleName} role: ${hasRole}`);
  
  return hasRole;
}

/**
 * Main function for CLI usage
 */
async function main() {
  // Use environment variables for command and arguments
  const command = process.env.COMMAND;
  const role = process.env.ROLE;
  const targetAddress = process.env.TARGET_ADDRESS;
  const vaultType = (process.env.VAULT_TYPE || "both") as "both" | "yield" | "staking";
  
  // Also support old process.argv for backward compatibility
  const args = process.argv.slice(2);
  const argCommand = args[0] || command;

  if (!argCommand) {
    console.log("Admin Operations for YieldVault and StakingVault");
    console.log("=".repeat(60));
    console.log("\nUsage:");
    console.log("  COMMAND=<cmd> [options] npx hardhat run scripts/admin/admin.ts --network <network>");
    console.log("\nCommands:");
    console.log("  delegate-role        - Delegate a role to an address");
    console.log("  grant-role           - Grant a role on specific contract");
    console.log("  revoke-role          - Revoke a role from an address");
    console.log("  pause                - Pause a vault");
    console.log("  unpause              - Unpause a vault");
    console.log("  freeze               - Freeze an account");
    console.log("  thaw                 - Thaw an account");
    console.log("  check-role           - Check role membership");
    console.log("\nExamples:");
    console.log("  COMMAND=delegate-role ROLE=REWARDS_ADMIN TARGET_ADDRESS=0x... npx hardhat run scripts/admin/admin.ts --network hoodi");
    console.log("  COMMAND=delegate-role ROLE=PAUSER TARGET_ADDRESS=0x... VAULT_TYPE=yield npx hardhat run scripts/admin/admin.ts --network hoodi");
    console.log("\nSee scripts/admin/README.md for detailed documentation");
    return;
  }

  switch (argCommand) {
    case "delegate-role":
      if (!role || !targetAddress) {
        console.error("❌ Error: ROLE and TARGET_ADDRESS environment variables are required");
        console.log("\nUsage:");
        console.log("  COMMAND=delegate-role ROLE=<role> TARGET_ADDRESS=<address> [VAULT_TYPE=both|yield|staking] npx hardhat run scripts/admin/admin.ts --network hoodi");
        console.log("\nAvailable roles:");
        console.log("  REWARDS_ADMIN, FREEZE_ADMIN, PAUSER, UPGRADER, DEFAULT_ADMIN");
        console.log("  WHITELIST_ADMIN (YieldVault only), WITHDRAWAL_ADMIN (YieldVault only)");
        console.log("\nExample:");
        console.log("  COMMAND=delegate-role ROLE=REWARDS_ADMIN TARGET_ADDRESS=0x803AdF8d4F036134070Bde997f458502Ade2f834 npx hardhat run scripts/admin/admin.ts --network hoodi");
        process.exit(1);
      }
      await delegateRole(role, targetAddress, vaultType);
      break;
    case "grant-role":
      await grantRole(args[1] || process.env.CONTRACT_ADDRESS || "", args[2] || process.env.ROLE || "", args[3] || process.env.TARGET_ADDRESS || "");
      break;
      await grantRole(args[1], args[2], args[3]);
      break;
    case "revoke-role":
      await revokeRole(args[1] || process.env.CONTRACT_ADDRESS || "", args[2] || process.env.ROLE || "", args[3] || process.env.TARGET_ADDRESS || "");
      break;
    case "pause":
      await pauseVault(args[1] || process.env.CONTRACT_ADDRESS || "");
      break;
    case "unpause":
      await unpauseVault(args[1] || process.env.CONTRACT_ADDRESS || "");
      break;
    case "freeze":
      await freezeAccount(args[1] || process.env.CONTRACT_ADDRESS || "", args[2] || process.env.ACCOUNT_ADDRESS || "");
      break;
    case "thaw":
      await thawAccount(args[1] || process.env.CONTRACT_ADDRESS || "", args[2] || process.env.ACCOUNT_ADDRESS || "");
      break;
    case "create-epoch":
      await createRewardsEpoch(
        parseInt(args[1] || process.env.EPOCH_INDEX || "0"),
        args[2] || process.env.MERKLE_ROOT || "",
        ethers.parseUnits(args[3] || process.env.TOTAL_REWARDS || "0", 6)
      );
      break;
    case "complete-redeem":
      await completeRedemption(args[1] || process.env.USER_ADDRESS || "");
      break;
    case "distribute-rewards":
      await distributeStakingRewards(ethers.parseUnits(args[1] || process.env.REWARD_AMOUNT || "0", 6));
      break;
    case "set-max-reward-percent":
      await setMaxRewardPercent(BigInt(args[1] || process.env.PERCENT || "0"));
      break;
    case "update-redeem-vault":
      await updateRedeemVault(args[1] || process.env.NEW_REDEEM_VAULT || "");
      break;
    case "set-nav-oracle": {
      const stakingVaultAddr = deployment.contracts.stakingVault;
      const oracle    = process.env.NAV_ORACLE    || args[1] || "";
      const staleness = process.env.NAV_STALENESS || args[2] || "3600";
      const feedId    = process.env.NAV_FEED_ID   || args[3] || "";
      if (!oracle) throw new Error("NAV_ORACLE env var required");
      if (!feedId) throw new Error("NAV_FEED_ID env var required");
      const [navAdmin] = await ethers.getSigners();
      const sv = await ethers.getContractAt("StakingVault", stakingVaultAddr, navAdmin);
      const tx = await sv.setNavOracle(oracle, BigInt(staleness), feedId);
      await tx.wait();
      console.log(`✅ setNavOracle set on StakingVault`);
      console.log(`   Oracle:    ${oracle}`);
      console.log(`   Staleness: ${staleness}s`);
      console.log(`   FeedId:    ${feedId}`);
      console.log(`   Tx: ${tx.hash}`);
      break;
    }
    case "check-role":
      await checkRole(args[1] || process.env.CONTRACT_ADDRESS || "", args[2] || process.env.ROLE || "", args[3] || process.env.ACCOUNT_ADDRESS || "");
      break;
    default:
      console.log("Unknown command");
      console.log("\nAvailable commands:");
      console.log("  delegate-role <role> <address> [vault]  - Delegate role to address");
      console.log("                                            Roles: REWARDS_ADMIN, FREEZE_ADMIN, PAUSER, UPGRADER, DEFAULT_ADMIN, WHITELIST_ADMIN, WITHDRAWAL_ADMIN");
      console.log("                                            Vaults: both (default), yield, staking");
      console.log("  grant-role <contract> <role> <address>");
      console.log("  revoke-role <contract> <role> <address>");
      console.log("  pause <contract>");
      console.log("  unpause <contract>");
      console.log("  freeze <contract> <account>");
      console.log("  thaw <contract> <account>");
      console.log("  create-epoch <index> <root> <total>");
      console.log("  complete-redeem <user>");
      console.log("  distribute-rewards <amount>");
      console.log("  set-max-reward-percent <percent_1e18>  e.g. 200000000000000000 = 20%");
      console.log("  update-redeem-vault <address>");
      console.log("  set-nav-oracle                           - Set NAV oracle on StakingVault");
      console.log("                                             NAV_ORACLE=<addr> NAV_STALENESS=<secs> NAV_FEED_ID=<bytes32>");
      console.log("  check-role <contract> <role> <account>");
  }
}

// Execute if run directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export {
  delegateRole,
  grantRole,
  revokeRole,
  pauseVault,
  unpauseVault,
  freezeAccount,
  thawAccount,
  createRewardsEpoch,
  completeRedemption,
  distributeStakingRewards,
  updateRedeemVault,
  checkRole,
};
