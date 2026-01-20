import {ethers} from "hardhat";

/**
 * Admin operations for managing YieldVault and StakingVault
 * 
 * This script provides functions for common administrative tasks:
 * - Granting and revoking roles
 * - Pausing and unpausing contracts
 * - Creating rewards epochs
 * - Freezing and thawing accounts
 * - Updating configuration
 */

// Contract addresses (update these after deployment)
const YIELD_VAULT_ADDRESS = process.env.YIELD_VAULT_ADDRESS || "";
const STAKING_VAULT_ADDRESS = process.env.STAKING_VAULT_ADDRESS || "";

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
  
  switch (roleName.toUpperCase()) {
    case "FREEZE_ADMIN":
      role = await vault.FREEZE_ADMIN_ROLE();
      break;
    case "REWARDS_ADMIN":
      role = await vault.REWARDS_ADMIN_ROLE();
      break;
    case "PAUSER":
      role = await vault.PAUSER_ROLE();
      break;
    default:
      throw new Error(`Unknown role: ${roleName}`);
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
  
  switch (roleName.toUpperCase()) {
    case "FREEZE_ADMIN":
      role = await vault.FREEZE_ADMIN_ROLE();
      break;
    case "REWARDS_ADMIN":
      role = await vault.REWARDS_ADMIN_ROLE();
      break;
    case "PAUSER":
      role = await vault.PAUSER_ROLE();
      break;
    default:
      throw new Error(`Unknown role: ${roleName}`);
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
 * Check role membership
 */
async function checkRole(
  contractAddress: string,
  roleName: string,
  account: string
) {
  const vault = await ethers.getContractAt("YieldVault", contractAddress);

  let role: string;
  
  switch (roleName.toUpperCase()) {
    case "ADMIN":
      role = await vault.DEFAULT_ADMIN_ROLE();
      break;
    case "FREEZE_ADMIN":
      role = await vault.FREEZE_ADMIN_ROLE();
      break;
    case "REWARDS_ADMIN":
      role = await vault.REWARDS_ADMIN_ROLE();
      break;
    case "PAUSER":
      role = await vault.PAUSER_ROLE();
      break;
    default:
      throw new Error(`Unknown role: ${roleName}`);
  }

  const hasRole = await vault.hasRole(role, account);
  console.log(`${account} has ${roleName} role: ${hasRole}`);
  
  return hasRole;
}

/**
 * Main function for CLI usage
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "grant-role":
      await grantRole(args[1], args[2], args[3]);
      break;
    case "revoke-role":
      await revokeRole(args[1], args[2], args[3]);
      break;
    case "pause":
      await pauseVault(args[1]);
      break;
    case "unpause":
      await unpauseVault(args[1]);
      break;
    case "freeze":
      await freezeAccount(args[1], args[2]);
      break;
    case "thaw":
      await thawAccount(args[1], args[2]);
      break;
    case "create-epoch":
      await createRewardsEpoch(
        parseInt(args[1]),
        args[2],
        ethers.parseUnits(args[3], 6)
      );
      break;
    case "complete-redeem":
      await completeRedemption(args[1]);
      break;
    case "distribute-rewards":
      await distributeStakingRewards(ethers.parseUnits(args[1], 6));
      break;
    case "update-redeem-vault":
      await updateRedeemVault(args[1]);
      break;
    case "check-role":
      await checkRole(args[1], args[2], args[3]);
      break;
    default:
      console.log("Unknown command");
      console.log("\nAvailable commands:");
      console.log("  grant-role <contract> <role> <address>");
      console.log("  revoke-role <contract> <role> <address>");
      console.log("  pause <contract>");
      console.log("  unpause <contract>");
      console.log("  freeze <contract> <account>");
      console.log("  thaw <contract> <account>");
      console.log("  create-epoch <index> <root> <total>");
      console.log("  complete-redeem <user>");
      console.log("  distribute-rewards <amount>");
      console.log("  update-redeem-vault <address>");
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
