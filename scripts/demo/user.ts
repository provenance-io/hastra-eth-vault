/**
 * [DEMO] User operations for YieldVault and StakingVault — deposit, stake, redeem, claim.
 * Contract addresses are read from USDC_ADDRESS, YIELD_VAULT_ADDRESS, STAKING_VAULT_ADDRESS env vars.
 *
 * Usage:
 *   npx hardhat run scripts/demo/user.ts --network sepolia
 *   npx hardhat run scripts/demo/user.ts --network hoodi
 */
// @ts-ignore
import { ethers } from "hardhat";

// Contract addresses (update these after deployment)
const USDC_ADDRESS = process.env.USDC_ADDRESS || "";
const YIELD_VAULT_ADDRESS = process.env.YIELD_VAULT_ADDRESS || "";
const STAKING_VAULT_ADDRESS = process.env.STAKING_VAULT_ADDRESS || "";

/**
 * Deposit USDC to YieldVault and receive wYLDS
 */
async function depositToYieldVault(amount: string) {
  const [user] = await ethers.getSigners();
  
  const usdc = await ethers.getContractAt("MockUSDC", USDC_ADDRESS);
  const vault = await ethers.getContractAt("YieldVault", YIELD_VAULT_ADDRESS);
  
  const depositAmount = ethers.parseUnits(amount, 6);
  
  console.log(`Depositing ${amount} USDC...`);
  
  // Check balance
  const balance = await usdc.balanceOf(user.address);
  console.log(`USDC balance: ${ethers.formatUnits(balance, 6)}`);
  
  if (balance < depositAmount) {
    throw new Error("Insufficient USDC balance");
  }
  
  // Approve vault
  console.log("Approving vault...");
  const approveTx = await usdc.approve(await vault.getAddress(), depositAmount);
  await approveTx.wait();
  console.log(`✓ Approved in tx: ${approveTx.hash}`);
  
  // Deposit
  console.log("Depositing...");
  const depositTx = await vault.deposit(depositAmount, user.address);
  await depositTx.wait();
  console.log(`✓ Deposited in tx: ${depositTx.hash}`);
  
  // Check wYLDS balance
  const wyldsBalance = await vault.balanceOf(user.address);
  console.log(`wYLDS balance: ${ethers.formatUnits(wyldsBalance, 6)}`);
}

/**
 * Request redemption of wYLDS for USDC
 */
async function requestRedemption(amount: string) {
  const [user] = await ethers.getSigners();
  const vault = await ethers.getContractAt("YieldVault", YIELD_VAULT_ADDRESS);
  
  const redeemAmount = ethers.parseUnits(amount, 6);
  
  console.log(`Requesting redemption of ${amount} wYLDS...`);
  
  // Check balance
  const balance = await vault.balanceOf(user.address);
  console.log(`wYLDS balance: ${ethers.formatUnits(balance, 6)}`);
  
  if (balance < redeemAmount) {
    throw new Error("Insufficient wYLDS balance");
  }
  
  // Check for existing pending redemption
  const pending = await vault.pendingRedemptions(user.address);
  if (pending.shares > 0n) {
    console.log("⚠ You already have a pending redemption:");
    console.log(`  Shares: ${ethers.formatUnits(pending.shares, 6)}`);
    console.log(`  Assets: ${ethers.formatUnits(pending.assets, 6)}`);
    throw new Error("Cancel existing redemption first");
  }
  
  // Request redemption
  const tx = await vault.requestRedeem(redeemAmount);
  await tx.wait();
  console.log(`✓ Redemption requested in tx: ${tx.hash}`);
  console.log("\nNext steps:");
  console.log("1. Off-chain system will fund the redeem vault");
  console.log("2. Rewards admin will call completeRedeem");
  console.log("3. You will receive your USDC");
}

/**
 * Cancel pending redemption
 */
async function cancelRedemption() {
  const [user] = await ethers.getSigners();
  const vault = await ethers.getContractAt("YieldVault", YIELD_VAULT_ADDRESS);
  
  console.log("Canceling redemption...");
  
  // Check pending redemption
  const pending = await vault.pendingRedemptions(user.address);
  if (pending.shares === 0n) {
    throw new Error("No pending redemption");
  }
  
  console.log(`Canceling redemption of ${ethers.formatUnits(pending.shares, 6)} wYLDS`);
  
  const tx = await vault.cancelRedeem();
  await tx.wait();
  console.log(`✓ Redemption canceled in tx: ${tx.hash}`);
  console.log("Your wYLDS have been returned");
}

/**
 * Claim rewards from a specific epoch
 */
async function claimRewards(epochIndex: number, distributionFile: string) {
  const [user] = await ethers.getSigners();
  const vault = await ethers.getContractAt("YieldVault", YIELD_VAULT_ADDRESS);
  
  console.log(`Claiming rewards for epoch ${epochIndex}...`);
  
  // Load distribution file
  if (!fs.existsSync(distributionFile)) {
    throw new Error(`Distribution file not found: ${distributionFile}`);
  }
  
  const distribution = JSON.parse(fs.readFileSync(distributionFile, "utf-8"));
  
  // Find user's reward
  const userReward = distribution.rewards.find(
    (r: any) => r.address.toLowerCase() === user.address.toLowerCase()
  );
  
  if (!userReward) {
    throw new Error("No rewards for your address in this epoch");
  }
  
  console.log(`Reward amount: ${ethers.formatUnits(userReward.amount, 6)} wYLDS`);
  
  // Check if already claimed
  const claimed = await vault.hasClaimedRewards(user.address, epochIndex);
  if (claimed) {
    throw new Error("Rewards already claimed for this epoch");
  }
  
  // Claim
  const tx = await vault.claimRewards(
    epochIndex,
    userReward.amount,
    userReward.proof
  );
  await tx.wait();
  console.log(`✓ Rewards claimed in tx: ${tx.hash}`);
  
  // Show updated balance
  const balance = await vault.balanceOf(user.address);
  console.log(`New wYLDS balance: ${ethers.formatUnits(balance, 6)}`);
}

/**
 * Stake wYLDS in StakingVault to receive PRIME
 */
async function stakeWYLDS(amount: string) {
  const [user] = await ethers.getSigners();
  
  const yieldVault = await ethers.getContractAt("YieldVault", YIELD_VAULT_ADDRESS);
  const stakingVault = await ethers.getContractAt("StakingVault", STAKING_VAULT_ADDRESS);
  
  const stakeAmount = ethers.parseUnits(amount, 6);
  
  console.log(`Staking ${amount} wYLDS...`);
  
  // Check balance
  const balance = await yieldVault.balanceOf(user.address);
  console.log(`wYLDS balance: ${ethers.formatUnits(balance, 6)}`);
  
  if (balance < stakeAmount) {
    throw new Error("Insufficient wYLDS balance");
  }
  
  // Approve staking vault
  console.log("Approving staking vault...");
  const approveTx = await yieldVault.approve(
    await stakingVault.getAddress(),
    stakeAmount
  );
  await approveTx.wait();
  console.log(`✓ Approved in tx: ${approveTx.hash}`);
  
  // Stake
  console.log("Staking...");
  const stakeTx = await stakingVault.deposit(stakeAmount, user.address);
  await stakeTx.wait();
  console.log(`✓ Staked in tx: ${stakeTx.hash}`);
  
  // Check PRIME balance
  const primeBalance = await stakingVault.balanceOf(user.address);
  console.log(`PRIME balance: ${ethers.formatUnits(primeBalance, 6)}`);
}

/**
 * Unbond PRIME tokens (instant redemption using ERC-4626)
 */
async function unbondPRIME(amount: string) {
  const [user] = await ethers.getSigners();
  const stakingVault = await ethers.getContractAt("StakingVault", STAKING_VAULT_ADDRESS);
  const yieldVault = await ethers.getContractAt("YieldVault", YIELD_VAULT_ADDRESS);
  
  const unbondAmount = ethers.parseUnits(amount, 6);
  
  console.log(`Redeeming ${amount} PRIME for wYLDS (instant)...`);
  
  // Check balance
  const balance = await stakingVault.balanceOf(user.address);
  console.log(`PRIME balance: ${ethers.formatUnits(balance, 6)}`);
  
  if (balance < unbondAmount) {
    throw new Error("Insufficient PRIME balance");
  }
  
  // Check wYLDS balance before
  const wyldsBalanceBefore = await yieldVault.balanceOf(user.address);
  
  // Redeem PRIME for wYLDS (instant redemption)
  const tx = await stakingVault.redeem(unbondAmount, user.address, user.address);
  const receipt = await tx.wait();
  
  console.log(`✓ Redeemed in tx: ${tx.hash}`);
  
  // Show updated balances
  const wyldsBalanceAfter = await yieldVault.balanceOf(user.address);
  const received = wyldsBalanceAfter - wyldsBalanceBefore;
  
  console.log(`Received: ${ethers.formatUnits(received, 6)} wYLDS`);
  console.log(`New wYLDS balance: ${ethers.formatUnits(wyldsBalanceAfter, 6)}`);
  console.log(`\nNote: Redemption is instant (no unbonding period)`);
}

/**
 * View balances
 */
async function viewBalances() {
  const [user] = await ethers.getSigners();
  
  const usdc = await ethers.getContractAt("MockUSDC", USDC_ADDRESS);
  const yieldVault = await ethers.getContractAt("YieldVault", YIELD_VAULT_ADDRESS);
  const stakingVault = await ethers.getContractAt("StakingVault", STAKING_VAULT_ADDRESS);
  
  console.log(`\nBalances for ${user.address}:`);
  console.log("========================================");
  
  const usdcBalance = await usdc.balanceOf(user.address);
  console.log(`USDC: ${ethers.formatUnits(usdcBalance, 6)}`);
  
  const wyldsBalance = await yieldVault.balanceOf(user.address);
  console.log(`wYLDS: ${ethers.formatUnits(wyldsBalance, 6)}`);
  
  const primeBalance = await stakingVault.balanceOf(user.address);
  const primeAssets = await stakingVault.convertToAssets(primeBalance);
  console.log(`PRIME: ${ethers.formatUnits(primeBalance, 6)}`);
  console.log(`PRIME value in wYLDS: ${ethers.formatUnits(primeAssets, 6)}`);
  
  // Check pending redemption
  const pending = await yieldVault.pendingRedemptions(user.address);
  if (pending.shares > 0n) {
    console.log("\nPending Redemption:");
    console.log(`  Shares: ${ethers.formatUnits(pending.shares, 6)}`);
    console.log(`  Assets: ${ethers.formatUnits(pending.assets, 6)}`);
  }
  
  console.log("========================================\n");
}

/**
 * Main function for CLI usage
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "deposit":
      await depositToYieldVault(args[1]);
      break;
    case "request-redeem":
      await requestRedemption(args[1]);
      break;
    case "cancel-redeem":
      await cancelRedemption();
      break;
    case "claim-rewards":
      await claimRewards(parseInt(args[1]), args[2]);
      break;
    case "stake":
      await stakeWYLDS(args[1]);
      break;
    case "unbond":
      await unbondPRIME(args[1]);
      break;
    case "balances":
      await viewBalances();
      break;
    default:
      console.log("Unknown command");
      console.log("\nAvailable commands:");
      console.log("  deposit <amount>              - Deposit USDC to get wYLDS");
      console.log("  request-redeem <amount>       - Request redemption of wYLDS");
      console.log("  cancel-redeem                 - Cancel pending redemption");
      console.log("  claim-rewards <epoch> <file>  - Claim rewards");
      console.log("  stake <amount>                - Stake wYLDS to get PRIME");
      console.log("  unbond <amount>               - Redeem PRIME for wYLDS (instant)");
      console.log("  balances                      - View all balances");
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
  depositToYieldVault,
  requestRedemption,
  cancelRedemption,
  claimRewards,
  stakeWYLDS,
  unbondPRIME,
  viewBalances,
};
