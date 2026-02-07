import { ethers } from "hardhat";

/**
 * Unstake PRIME and Redeem wYLDS
 * 
 * Usage: 
 *   npx hardhat run scripts/unstake-and-redeem.ts --network hoodi
 * 
 * Required env vars:
 *   YIELD_VAULT_ADDRESS - The YieldVault contract address (wYLDS)
 *   STAKING_VAULT_ADDRESS - The StakingVault contract address (PRIME)
 */
async function main() {
  const [staker] = await ethers.getSigners();
  
  const yieldVaultAddress = process.env.YIELD_VAULT_ADDRESS;
  const stakingVaultAddress = process.env.STAKING_VAULT_ADDRESS;
  
  if (!yieldVaultAddress || !stakingVaultAddress) {
    throw new Error("Env vars YIELD_VAULT_ADDRESS and STAKING_VAULT_ADDRESS must be set");
  }

  console.log("\nStarting Unstake & Redeem Flow...");
  console.log("Staker:", staker.address);
  
  const yieldVault = await ethers.getContractAt("YieldVault", yieldVaultAddress);
  const stakingVault = await ethers.getContractAt("StakingVault", stakingVaultAddress);
  
  // 1. Check PRIME Balance
  const primeBalance = await stakingVault.balanceOf(staker.address);
  console.log("Current PRIME Balance:", ethers.formatUnits(primeBalance, 6));
  
  let positionIndex;
  let unlockTime;

  if (primeBalance > 0n) {
    // 2. Instant Redeem (Standard ERC-4626)
    // Redeem only 50% to leave some staked
    const redeemAmount = primeBalance / 2n;
    console.log("\nInitiating Partial Redeem...");
    console.log("Redeeming:", ethers.formatUnits(redeemAmount, 6), "PRIME");
    console.log("Keeping staked:", ethers.formatUnits(primeBalance - redeemAmount, 6), "PRIME");
    
    const redeemTx = await stakingVault.redeem(redeemAmount, staker.address, staker.address);
    console.log("Redeem Tx:", redeemTx.hash);
    await redeemTx.wait();
  } else {
    console.log("No PRIME balance to redeem.");
    return;
  }
  
  // 3. Verify
  const wYLDSBalanceAfter = await yieldVault.balanceOf(staker.address);
  // wYLDSBalanceBefore is not defined in this scope if we removed the old code block, 
  // let's fetch it at the start or just show final balance.
  
  console.log("\n✅ Redeem Successful!");
  console.log("Final wYLDS Balance:", ethers.formatUnits(wYLDSBalanceAfter, 6));

  // 4. Request Redeem (wYLDS -> USDC)
  // Calculate received based on balance change is tricky without 'before', 
  // but we can assume we want to redeem everything we have now.
  const received = wYLDSBalanceAfter; // Assuming we started with 0 or want to exit all

  if (received > 0n) {
    console.log("\n--- Starting Redemption Flow (wYLDS -> USDC) ---");
    console.log("Requesting redemption for", ethers.formatUnits(received, 6), "wYLDS...");
    
    const requestTx = await yieldVault.requestRedeem(received);
    console.log("Request Tx:", requestTx.hash);
    await requestTx.wait();
    console.log("Redemption requested.");
  } else {
    console.log("No wYLDS received, skipping redemption.");
    return;
  }

  // 7. Complete Redeem (Admin Step)
  // Check if we have the role
  const REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
  const hasRole = await yieldVault.hasRole(REWARDS_ADMIN_ROLE, staker.address);
  
  if (hasRole) {
    console.log("\nUser has REWARDS_ADMIN_ROLE. Attempting to complete redemption...");
    
    const redeemVaultAddr = await yieldVault.redeemVault();
    console.log("Redeem Vault Address:", redeemVaultAddr);
    
    // Check if we are the redeem vault (or control it)
    if (redeemVaultAddr.toLowerCase() === staker.address.toLowerCase()) {
        const assetAddress = await yieldVault.asset();
        const usdc = await ethers.getContractAt("IERC20", assetAddress); // Use generic IERC20
        
        // Check allowance
        const allowance = await usdc.allowance(staker.address, yieldVaultAddress);
        if (allowance < received) {
            console.log("Approving YieldVault to spend USDC from RedeemVault...");
            const approveTx = await usdc.approve(yieldVaultAddress, ethers.MaxUint256);
            await approveTx.wait();
            console.log("Approved.");
        }
        
        // Complete
        const completeRedeemTx = await yieldVault.completeRedeem(staker.address);
        console.log("Complete Redeem Tx:", completeRedeemTx.hash);
        await completeRedeemTx.wait();
        
        console.log("✅ Redemption Completed! USDC received.");
    } else {
        console.log("⚠️  Current user is Admin but NOT the RedeemVault address.");
        console.log(`Please ensure ${redeemVaultAddr} has approved YieldVault and has sufficient USDC.`);
        console.log("Then run completeRedeem manually.");
    }
  } else {
    console.log("\n⚠️  User does NOT have REWARDS_ADMIN_ROLE.");
    console.log("Cannot complete redemption automatically.");
    console.log("An admin must call yieldVault.completeRedeem(userAddress).");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });