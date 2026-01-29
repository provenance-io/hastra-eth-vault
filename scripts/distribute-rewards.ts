import { ethers } from "hardhat";

/**
 * Distribute Rewards to StakingVault
 * 
 * Usage: 
 *   npx hardhat run scripts/distribute-rewards.ts --network hoodi
 * 
 * Required env vars:
 *   STAKING_VAULT_ADDRESS - The StakingVault contract address
 *   REWARD_AMOUNT - Amount of wYLDS to distribute as rewards
 */
async function main() {
  const [admin] = await ethers.getSigners();
  
  const stakingVaultAddress = process.env.STAKING_VAULT_ADDRESS;
  const rewardAmountStr = process.env.REWARD_AMOUNT || "1000";
  
  if (!stakingVaultAddress) {
    throw new Error("Env var STAKING_VAULT_ADDRESS must be set");
  }

  console.log("\n--- Distributing Rewards ---");
  console.log("Admin:", admin.address);
  console.log("StakingVault:", stakingVaultAddress);
  console.log("Reward Amount:", rewardAmountStr, "wYLDS");
  
  const stakingVault = await ethers.getContractAt("StakingVault", stakingVaultAddress);
  
  // 1. Check current exchange rate
  const oneShare = ethers.parseUnits("1", 6);
  const assetsPerShareBefore = await stakingVault.convertToAssets(oneShare);
  console.log("\nExchange Rate BEFORE:");
  console.log("1 PRIME =", ethers.formatUnits(assetsPerShareBefore, 6), "wYLDS");
  
  // 2. Distribute Rewards
  const amount = ethers.parseUnits(rewardAmountStr, 6);
  console.log(`\nDistributing ${rewardAmountStr} wYLDS...`);
  
  // Check role
  const REWARDS_ADMIN_ROLE = await stakingVault.REWARDS_ADMIN_ROLE();
  if (!(await stakingVault.hasRole(REWARDS_ADMIN_ROLE, admin.address))) {
      console.warn("⚠️  Warning: Caller might missing REWARDS_ADMIN_ROLE on StakingVault");
  }

  const tx = await stakingVault.distributeRewards(amount);
  console.log("Tx Hash:", tx.hash);
  await tx.wait();
  
  // 3. Check new exchange rate
  const assetsPerShareAfter = await stakingVault.convertToAssets(oneShare);
  console.log("\n✅ Rewards Distributed!");
  console.log("Exchange Rate AFTER:");
  console.log("1 PRIME =", ethers.formatUnits(assetsPerShareAfter, 6), "wYLDS");
  
  const increase = assetsPerShareAfter - assetsPerShareBefore;
  console.log("Value Increase per PRIME:", ethers.formatUnits(increase, 6), "wYLDS");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
