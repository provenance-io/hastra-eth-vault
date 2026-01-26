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

  // 3. Wait if reasonable
  const unbondingPeriod = await stakingVault.UNBONDING_PERIOD();
  console.log(`\nContract Unbonding Period: ${unbondingPeriod} seconds`);

  if (unbondingPeriod > 60n) {
    console.log("Unbonding period is > 60s. Skipping the automated wait and completion step.");
    console.log("You will need to run completeUnbonding manually after the period expires.");
    return;
  }

  const waitTime = Number(unbondingPeriod) + 60; // wait unbonding + 60s to account for slow block cut times.
  console.log(`Waiting for ${waitTime} seconds...`);
  await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
  
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
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });