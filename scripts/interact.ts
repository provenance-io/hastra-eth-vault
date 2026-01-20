import { ethers } from "hardhat";

/**
 * Interactive script demonstrating the full user flow
 *
 * Flow:
 * 1. User deposits USDC → receives wYLDS
 * 2. User stakes wYLDS → receives PRIME
 * 3. User earns rewards (PRIME value increases)
 * 4. User unbonds PRIME → starts 21-day waiting period
 * 5. User completes unbonding → receives wYLDS back
 * 6. User redeems wYLDS → receives USDC back
 */

async function main() {
  console.log("\n===========================================");
  console.log("Hastra Vault Protocol - Interactive Demo");
  console.log("===========================================\n");

  // Get signers
  const [deployer, redeemVault, freezeAdmin, rewardsAdmin, user1] =
    await ethers.getSigners();

  console.log("Accounts:");
  console.log("  User:", user1.address);
  console.log("  Rewards Admin:", rewardsAdmin.address);

  // NOTE: Replace these with your actual deployed addresses
  // You can get them from the deployment script output
  const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x...";
  const YIELD_VAULT_ADDRESS = process.env.YIELD_VAULT_ADDRESS || "0x...";
  const STAKING_VAULT_ADDRESS = process.env.STAKING_VAULT_ADDRESS || "0x...";

  // Get contract instances
  const usdc = await ethers.getContractAt("MockUSDC", USDC_ADDRESS);
  const yieldVault = await ethers.getContractAt("YieldVault", YIELD_VAULT_ADDRESS);
  const stakingVault = await ethers.getContractAt("StakingVault", STAKING_VAULT_ADDRESS);

  console.log("\nContract Addresses:");
  console.log("  USDC:", await usdc.getAddress());
  console.log("  YieldVault (wYLDS):", await yieldVault.getAddress());
  console.log("  StakingVault (PRIME):", await stakingVault.getAddress());

  // ============ Step 1: Mint USDC for user ============

  console.log("\n--- Step 1: Mint USDC for User ---");
  const mintAmount = ethers.parseUnits("10000", 6); // 10,000 USDC
  await usdc.mint(user1.address, mintAmount);

  let usdcBalance = await usdc.balanceOf(user1.address);
  console.log("User USDC balance:", ethers.formatUnits(usdcBalance, 6), "USDC");

  // ============ Step 2: Deposit USDC → Get wYLDS ============

  console.log("\n--- Step 2: Deposit USDC to YieldVault ---");
  const depositAmount = ethers.parseUnits("5000", 6); // 5,000 USDC

  await usdc.connect(user1).approve(await yieldVault.getAddress(), depositAmount);
  console.log("Approved YieldVault to spend", ethers.formatUnits(depositAmount, 6), "USDC");

  await yieldVault.connect(user1).deposit(depositAmount, user1.address);
  console.log("Deposited", ethers.formatUnits(depositAmount, 6), "USDC");

  let wyldsBalance = await yieldVault.balanceOf(user1.address);
  console.log("User wYLDS balance:", ethers.formatUnits(wyldsBalance, 6), "wYLDS");

  // ============ Step 3: Stake wYLDS → Get PRIME ============

  console.log("\n--- Step 3: Stake wYLDS in StakingVault ---");
  const stakeAmount = ethers.parseUnits("3000", 6); // 3,000 wYLDS

  await yieldVault.connect(user1).approve(await stakingVault.getAddress(), stakeAmount);
  console.log("Approved StakingVault to spend", ethers.formatUnits(stakeAmount, 6), "wYLDS");

  await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
  console.log("Staked", ethers.formatUnits(stakeAmount, 6), "wYLDS");

  let primeBalance = await stakingVault.balanceOf(user1.address);
  console.log("User PRIME balance:", ethers.formatUnits(primeBalance, 6), "PRIME");

  // Check conversion
  let primeValue = await stakingVault.convertToAssets(primeBalance);
  console.log("PRIME value in wYLDS:", ethers.formatUnits(primeValue, 6), "wYLDS");

  // ============ Step 4: Distribute Rewards ============

  console.log("\n--- Step 4: Distribute Rewards to Stakers ---");

  // Mint wYLDS to rewards admin
  await usdc.mint(rewardsAdmin.address, ethers.parseUnits("1000", 6));
  await usdc.connect(rewardsAdmin).approve(
    await yieldVault.getAddress(),
    ethers.parseUnits("1000", 6)
  );
  await yieldVault.connect(rewardsAdmin).deposit(
    ethers.parseUnits("1000", 6),
    rewardsAdmin.address
  );

  // Distribute rewards
  const rewardAmount = ethers.parseUnits("300", 6); // 300 wYLDS rewards
  await yieldVault.connect(rewardsAdmin).approve(
    await stakingVault.getAddress(),
    rewardAmount
  );
  await stakingVault.connect(rewardsAdmin).distributeRewards(rewardAmount);
  console.log("Distributed", ethers.formatUnits(rewardAmount, 6), "wYLDS as rewards");

  // Check new value
  primeValue = await stakingVault.convertToAssets(primeBalance);
  console.log("New PRIME value:", ethers.formatUnits(primeValue, 6), "wYLDS");
  console.log("Rewards earned:", ethers.formatUnits(primeValue - stakeAmount, 6), "wYLDS");

  // ============ Step 5: Unbond PRIME ============

  console.log("\n--- Step 5: Unbond PRIME (Start 21-day Waiting) ---");
  const unbondAmount = ethers.parseUnits("1000", 6); // 1,000 PRIME

  const tx = await stakingVault.connect(user1).unbond(unbondAmount);
  const receipt = await tx.wait();
  console.log("Unbonded", ethers.formatUnits(unbondAmount, 6), "PRIME");

  // Get unbonding positions
  const positions = await stakingVault.getUnbondingPositions(user1.address);
  console.log("\nUnbonding Positions:");
  positions.forEach((pos, idx) => {
    const unlockDate = new Date(Number(pos.unlockTime) * 1000);
    console.log(`  Position ${idx}:`);
    console.log(`    Shares: ${ethers.formatUnits(pos.shares, 6)} PRIME`);
    console.log(`    Assets: ${ethers.formatUnits(pos.assets, 6)} wYLDS`);
    console.log(`    Unlock: ${unlockDate.toLocaleString()}`);
  });

  // ============ Step 6: Fast-forward Time (Hardhat Only!) ============

  console.log("\n--- Step 6: Fast-forward 21 Days (Testing) ---");
  const unbondingPeriod = 21 * 24 * 60 * 60; // 21 days
  await ethers.provider.send("evm_increaseTime", [unbondingPeriod]);
  await ethers.provider.send("evm_mine", []);
  console.log("Time increased by 21 days");

  // Check if unlocked
  const isUnlocked = await stakingVault.isUnbondingUnlocked(user1.address, 0);
  console.log("Position 0 unlocked:", isUnlocked);

  // ============ Step 7: Complete Unbonding ============

  console.log("\n--- Step 7: Complete Unbonding ---");
  const wyldsBeforeUnbond = await yieldVault.balanceOf(user1.address);

  await stakingVault.connect(user1).completeUnbonding(0);
  console.log("Completed unbonding of position 0");

  const wyldsAfterUnbond = await yieldVault.balanceOf(user1.address);
  const wyldsReceived = wyldsAfterUnbond - wyldsBeforeUnbond;
  console.log("Received", ethers.formatUnits(wyldsReceived, 6), "wYLDS");

  wyldsBalance = await yieldVault.balanceOf(user1.address);
  console.log("Total wYLDS balance:", ethers.formatUnits(wyldsBalance, 6), "wYLDS");

  // ============ Step 8: Request Redemption ============

  console.log("\n--- Step 8: Request Redemption (wYLDS → USDC) ---");
  const redeemAmount = ethers.parseUnits("1000", 6); // 1,000 wYLDS

  await yieldVault.connect(user1).requestRedeem(redeemAmount);
  console.log("Requested redemption of", ethers.formatUnits(redeemAmount, 6), "wYLDS");

  // Check pending redemption
  const pending = await yieldVault.pendingRedemptions(user1.address);
  console.log("Pending redemption:");
  console.log("  Shares:", ethers.formatUnits(pending.shares, 6), "wYLDS");
  console.log("  Assets:", ethers.formatUnits(pending.assets, 6), "USDC");

  // ============ Step 9: Complete Redemption (Admin) ============

  console.log("\n--- Step 9: Complete Redemption (Admin) ---");

  const usdcBeforeRedeem = await usdc.balanceOf(user1.address);

  // Redeem vault completes the redemption
  await yieldVault.connect(rewardsAdmin).completeRedeem(user1.address);
  console.log("Redemption completed by admin");

  const usdcAfterRedeem = await usdc.balanceOf(user1.address);
  const usdcReceived = usdcAfterRedeem - usdcBeforeRedeem;
  console.log("User received", ethers.formatUnits(usdcReceived, 6), "USDC");

  // ============ Final Balances ============

  console.log("\n===========================================");
  console.log("Final Balances");
  console.log("===========================================");

  usdcBalance = await usdc.balanceOf(user1.address);
  wyldsBalance = await yieldVault.balanceOf(user1.address);
  primeBalance = await stakingVault.balanceOf(user1.address);

  console.log("USDC:", ethers.formatUnits(usdcBalance, 6));
  console.log("wYLDS:", ethers.formatUnits(wyldsBalance, 6));
  console.log("PRIME:", ethers.formatUnits(primeBalance, 6));

  if (primeBalance > 0) {
    const primeAssets = await stakingVault.convertToAssets(primeBalance);
    console.log("PRIME value:", ethers.formatUnits(primeAssets, 6), "wYLDS");
  }

  console.log("\n===========================================");
  console.log("Demo Complete!");
  console.log("===========================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
