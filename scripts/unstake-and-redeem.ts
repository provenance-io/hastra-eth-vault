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
    // 2. Unbond
    console.log("\nInitiating Unbonding...");
    const unbondTx = await stakingVault.unbond(primeBalance);
    console.log("Unbond Tx:", unbondTx.hash);
    const receipt = await unbondTx.wait();
    
    // Find event
    const log = receipt?.logs.find(x => {
      try { return stakingVault.interface.parseLog(x)?.name === "Unbonded" } catch(e) { return false }
    });
    const parsedLog = log ? stakingVault.interface.parseLog(log) : null;
    positionIndex = parsedLog?.args[1];
    unlockTime = parsedLog?.args[4];
  } else {
    console.log("No PRIME balance to unbond. Checking for existing positions...");
    const positions = await stakingVault.getUnbondingPositions(staker.address);
    if (positions.length === 0) {
        throw new Error("No PRIME tokens and no unbonding positions found.");
    }
    // Use the last position for demo purposes
    positionIndex = positions.length - 1;
    const position = positions[positionIndex];
    unlockTime = position.unlockTime;
    console.log(`Found existing position at index ${positionIndex}`);
  }
  
  console.log(`Unbonded! Position Index: ${positionIndex}`);
  console.log(`Unlock Time: ${new Date(Number(unlockTime) * 1000).toISOString()}`);

  // 3. Wait until unlocked
  const unbondingPeriod = await stakingVault.UNBONDING_PERIOD();
  console.log(`\nContract Unbonding Period: ${unbondingPeriod} seconds`);

  console.log("\nWaiting for unbonding period to elapse...");
  
  while (true) {
    const isUnlocked = await stakingVault.isUnbondingUnlocked(staker.address, positionIndex);
    if (isUnlocked) {
        console.log("Position is now UNLOCKED!");
        break;
    }
    
    // Calculate remaining time
    const currentBlock = await ethers.provider.getBlock("latest");
    const currentTime = currentBlock?.timestamp || Math.floor(Date.now() / 1000);
    const remaining = Number(unlockTime) - currentTime;
    
    if (remaining > 0) {
        console.log(`Still locked. Approximately ${remaining} seconds remaining...`);
        // Wait 10s or the remaining time if it's shorter
        const sleepTime = Math.min(remaining + 2, 10); 
        await new Promise(resolve => setTimeout(resolve, sleepTime * 1000));
    } else {
        console.log("Time has passed, waiting for next block confirmation...");
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  // 4. Complete Unbonding
  console.log("\nCompleting Unbonding...");
  const wYLDSBalanceBefore = await yieldVault.balanceOf(staker.address);
  
  // Check if unlocked
  const isUnlocked = await stakingVault.isUnbondingUnlocked(staker.address, positionIndex);
  if (!isUnlocked) {
    throw new Error("Position is still locked! Wait time might have been insufficient.");
  }
  
  const completeTx = await stakingVault.completeUnbonding(positionIndex);
  console.log("Complete Unbonding Tx:", completeTx.hash);
  await completeTx.wait();
  
  // 5. Verify
  const wYLDSBalanceAfter = await yieldVault.balanceOf(staker.address);
  const received = wYLDSBalanceAfter - wYLDSBalanceBefore;
  
  console.log("\n✅ Unstake Successful!");
  console.log("wYLDS Received:", ethers.formatUnits(received, 6));
  console.log("Final wYLDS Balance:", ethers.formatUnits(wYLDSBalanceAfter, 6));

  // 6. Request Redeem (wYLDS -> USDC)
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