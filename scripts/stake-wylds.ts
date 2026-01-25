import { ethers } from "hardhat";

/**
 * Stake wYLDS into StakingVault to receive PRIME
 * 
 * Usage: 
 *   npx hardhat run scripts/stake-wylds.ts --network hoodi
 * 
 * Required env vars:
 *   YIELD_VAULT_ADDRESS - The YieldVault contract address (wYLDS)
 *   STAKING_VAULT_ADDRESS - The StakingVault contract address (PRIME)
 * 
 * Optional env vars:
 *   STAKE_AMOUNT - Amount to stake in wYLDS (defaults to 500)
 */
async function main() {
  const [staker] = await ethers.getSigners();
  
  const yieldVaultAddress = process.env.YIELD_VAULT_ADDRESS;
  const stakingVaultAddress = process.env.STAKING_VAULT_ADDRESS;
  
  if (!yieldVaultAddress) {
    throw new Error("YIELD_VAULT_ADDRESS not set in .env");
  }
  if (!stakingVaultAddress) {
    throw new Error("STAKING_VAULT_ADDRESS not set in .env");
  }
  
  const stakeAmount = process.env.STAKE_AMOUNT || "500"; // Default 500 wYLDS
  
  console.log("Staking wYLDS into StakingVault...");
  console.log("Staker:", staker.address);
  console.log("YieldVault (wYLDS):", yieldVaultAddress);
  console.log("StakingVault (PRIME):", stakingVaultAddress);
  console.log("Amount:", stakeAmount, "wYLDS");
  
  const yieldVault = await ethers.getContractAt("YieldVault", yieldVaultAddress);
  const stakingVault = await ethers.getContractAt("StakingVault", stakingVaultAddress);
  
  const amount = ethers.parseUnits(stakeAmount, 6);
  
  // Check wYLDS balance
  const wyldsBalance = await yieldVault.balanceOf(staker.address);
  console.log("\nwYLDS balance:", ethers.formatUnits(wyldsBalance, 6));
  
  if (wyldsBalance < amount) {
    throw new Error(`Insufficient wYLDS balance. Have ${ethers.formatUnits(wyldsBalance, 6)}, need ${stakeAmount}`);
  }
  
  // Check current allowance
  const allowance = await yieldVault.allowance(staker.address, stakingVaultAddress);
  console.log("Current allowance:", ethers.formatUnits(allowance, 6));
  
  // Approve if needed
  if (allowance < amount) {
    console.log("\nApproving StakingVault to spend wYLDS...");
    const approveTx = await yieldVault.approve(stakingVaultAddress, ethers.MaxUint256);
    await approveTx.wait();
    console.log("Approved!");
  }
  
  // Get PRIME balance before
  const primeBalanceBefore = await stakingVault.balanceOf(staker.address);
  console.log("\nPRIME balance before:", ethers.formatUnits(primeBalanceBefore, 6));
  
  // Stake
  console.log("\nStaking", stakeAmount, "wYLDS...");
  const depositTx = await stakingVault.deposit(amount, staker.address);
  console.log("Transaction hash:", depositTx.hash);
  await depositTx.wait();
  
  // Get balances after
  const wyldsBalanceAfter = await yieldVault.balanceOf(staker.address);
  const primeBalanceAfter = await stakingVault.balanceOf(staker.address);
  
  console.log("\n✅ Staking successful!");
  console.log("wYLDS balance after:", ethers.formatUnits(wyldsBalanceAfter, 6));
  console.log("PRIME balance after:", ethers.formatUnits(primeBalanceAfter, 6));
  console.log("PRIME received:", ethers.formatUnits(primeBalanceAfter - primeBalanceBefore, 6));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
