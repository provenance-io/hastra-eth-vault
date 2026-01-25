import { ethers } from "hardhat";

/**
 * Unstake PRIME and Redeem wYLDS
 * 
 * Usage: 
 *   npx hardhat run scripts/unstake-and-redeem.ts --network hoodi
 * 
 * Required env vars:
 *   USDC_ADDRESS - The USDC contract address
 *   YIELD_VAULT_ADDRESS - The YieldVault contract address
 *   STAKING_VAULT_ADDRESS - The StakingVault contract address
 */
async function main() {
  const [user] = await ethers.getSigners();
  
  const usdcAddress = process.env.MOCK_USDC_ADDRESS;
  const yieldVaultAddress = process.env.YIELD_VAULT_ADDRESS;
  const stakingVaultAddress = process.env.STAKING_VAULT_ADDRESS;
  
  if (!usdcAddress || !yieldVaultAddress || !stakingVaultAddress) {
    throw new Error("Missing contract addresses in env");
  }
  
  const usdc = await ethers.getContractAt("MockUSDC", usdcAddress);
  const yieldVault = await ethers.getContractAt("YieldVault", yieldVaultAddress);
  const stakingVault = await ethers.getContractAt("StakingVault", stakingVaultAddress);
  
  console.log("\n===========================================");
  console.log("Unstake & Redeem Demo");
  console.log("User:", user.address);
  console.log("===========================================\n");

  // ============ Part 1: Unbond PRIME ============ 
  
  const primeBalance = await stakingVault.balanceOf(user.address);
  console.log("Current PRIME balance:", ethers.formatUnits(primeBalance, 6));
  
  if (primeBalance > 0n) {
    console.log(`\n--- Unbonding ${ethers.formatUnits(primeBalance, 6)} PRIME ---`);
    const unbondTx = await stakingVault.unbond(primeBalance);
    console.log("Unbond Transaction:", unbondTx.hash);
    await unbondTx.wait();
    
    console.log("✅ Unbond initiated! (Assets locked for 21 days)");
    
    const positions = await stakingVault.getUnbondingPositions(user.address);
    const lastPos = positions[positions.length - 1];
    const unlockDate = new Date(Number(lastPos.unlockTime) * 1000);
    console.log(`Unlock Time: ${unlockDate.toLocaleString()}`);
  } else {
    console.log("\nNo PRIME to unbond.");
  }

  // ============ Part 2: Redeem wYLDS ============ 
  
  const wyldsBalance = await yieldVault.balanceOf(user.address);
  console.log(`\nCurrent wYLDS balance: ${ethers.formatUnits(wyldsBalance, 6)}`);
  
  if (wyldsBalance > 0n) {
    console.log(`\n--- Requesting Redemption for ${ethers.formatUnits(wyldsBalance, 6)} wYLDS ---`);
    
    // Step A: Request Redeem
    const requestTx = await yieldVault.requestRedeem(wyldsBalance);
    console.log("Request Transaction:", requestTx.hash);
    await requestTx.wait();
    console.log("✅ Redemption Requested");
    
    // Check pending
    const pending = await yieldVault.pendingRedemptions(user.address);
    console.log(`Pending Assets: ${ethers.formatUnits(pending.assets, 6)} USDC`);
    
    // Step B: Complete Redeem (Admin Action)
    // NOTE: In this script, 'user' is also the 'admin/redeemVault', so we can self-fulfill
    
    console.log("\n--- Completing Redemption (Admin Action) ---");
    
    // Ensure RedeemVault (user) has approved YieldVault to pull USDC
    const allowance = await usdc.allowance(user.address, yieldVaultAddress);
    if (allowance < pending.assets) {
      console.log("Approving YieldVault to spend USDC from RedeemVault...");
      const appTx = await usdc.approve(yieldVaultAddress, ethers.MaxUint256);
      await appTx.wait();
    }
    
    const usdcBefore = await usdc.balanceOf(user.address);
    
    const completeTx = await yieldVault.completeRedeem(user.address);
    console.log("Complete Transaction:", completeTx.hash);
    await completeTx.wait();
    
    const usdcAfter = await usdc.balanceOf(user.address);
    console.log("✅ Redemption Completed");
    console.log(`Received: ${ethers.formatUnits(usdcAfter - usdcBefore, 6)} USDC`);
  } else {
    console.log("\nNo wYLDS to redeem.");
  }
  
  // ============ Part 3: Withdraw via Admin Whitelist (Optional Demo) ============ 
  
  // If the user meant "Withdraw from Treasury", we can demo that too if we have balance
  // But the vault balance comes from deposits.
  // 1. User deposited 1000 USDC. Vault has 1000 USDC.
  // 2. User redeemed 500 wYLDS.
  //    Wait, redemption pulls from RedeemVault (off-chain liquidity), NOT from the YieldVault contract itself.
  //    The YieldVault contract keeps the user's original deposit (backing the shares).
  //    So YieldVault should still have 1000 USDC.
  
  const vaultBalance = await usdc.balanceOf(yieldVaultAddress);
  console.log(`\nYieldVault Contract Balance: ${ethers.formatUnits(vaultBalance, 6)} USDC`);
  
  // We can withdraw this to a whitelisted address
  const WHITELISTED_ADDRESS = "0x803AdF8d4F036134070Bde997f458502Ade2f834";
  const withdrawAmount = ethers.parseUnits("100", 6);
  
  if (vaultBalance >= withdrawAmount) {
     console.log(`\n--- Admin Withdrawal to Whitelisted Address ---`);
     console.log(`Target: ${WHITELISTED_ADDRESS}`);
     console.log(`Amount: 100 USDC`);
     
     const withdrawTx = await yieldVault.withdrawUSDC(WHITELISTED_ADDRESS, withdrawAmount);
     console.log("Withdraw Transaction:", withdrawTx.hash);
     await withdrawTx.wait();
     console.log("✅ Admin Withdrawal Successful");
  }

  console.log("\n===========================================");
  console.log("Demo Complete");
  console.log("===========================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
