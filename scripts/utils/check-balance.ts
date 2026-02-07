// @ts-nocheck
import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * Check wYLDS balance for an address
 * 
 * Usage:
 *   npx hardhat run scripts/utils/check-balance.ts --network hoodi
 * 
 * Set ADDRESS environment variable to check a specific address:
 *   ADDRESS=0x... npx hardhat run scripts/utils/check-balance.ts --network hoodi
 */

async function main() {
  const network = await ethers.provider.getNetwork();
  const address = process.env.ADDRESS || (await ethers.getSigners())[0].address;

  console.log("════════════════════════════════════════════════════════════");
  console.log("           wYLDS BALANCE CHECKER");
  console.log("════════════════════════════════════════════════════════════");
  console.log("");
  console.log(`Address: ${address}`);
  console.log(`Network: ${network.name} (Chain ID: ${network.chainId})`);
  console.log("");

  // Load deployment file
  const deploymentFile = fs.existsSync("deployment_testnet.json") 
    ? "deployment_testnet.json" 
    : "deployment.json";
  
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
  const yieldVaultAddress = deployment.contracts.yieldVault;
  const usdcAddress = deployment.contracts.usdc;

  console.log(`YieldVault: ${yieldVaultAddress}`);
  console.log(`USDC:       ${usdcAddress}`);
  console.log("");

  const yieldVault = await ethers.getContractAt("YieldVault", yieldVaultAddress);
  const usdc = await ethers.getContractAt("MockUSDC", usdcAddress);
  
  const wyldsBalance = await yieldVault.balanceOf(address);
  const usdcBalance = await usdc.balanceOf(address);
  
  // Get PRIME balance if StakingVault exists
  let primeBalance = 0n;
  const stakingVaultAddress = deployment.contracts.stakingVault;
  if (stakingVaultAddress) {
    const stakingVault = await ethers.getContractAt("StakingVault", stakingVaultAddress);
    primeBalance = await stakingVault.balanceOf(address);
  }
  
  console.log("💰 Balances:");
  console.log(`   USDC:  ${ethers.formatUnits(usdcBalance, 6)} USDC`);
  console.log(`   wYLDS: ${ethers.formatUnits(wyldsBalance, 6)} wYLDS`);
  if (stakingVaultAddress) {
    console.log(`   PRIME: ${ethers.formatUnits(primeBalance, 6)} PRIME`);
  }
  console.log("");
  
  // Get total supply for context
  const totalSupply = await yieldVault.totalSupply();
  const totalAssets = await yieldVault.totalAssets();
  
  console.log("📊 YieldVault Stats:");
  console.log(`   Total Supply: ${ethers.formatUnits(totalSupply, 6)} wYLDS`);
  console.log(`   Total Assets: ${ethers.formatUnits(totalAssets, 6)} USDC`);
  
  // Also check StakingVault if it exists
  if (stakingVaultAddress) {
    console.log("");
    console.log("📊 StakingVault Stats:");
    const stakingVault = await ethers.getContractAt("StakingVault", stakingVaultAddress);
    const stakingTotalSupply = await stakingVault.totalSupply();
    const stakingTotalAssets = await stakingVault.totalAssets();
    const stakingActualBalance = await yieldVault.balanceOf(stakingVaultAddress);
    
    console.log(`   PRIME Total Supply:       ${ethers.formatUnits(stakingTotalSupply, 6)} PRIME`);
    console.log(`   totalAssets() [internal]: ${ethers.formatUnits(stakingTotalAssets, 6)} wYLDS`);
    console.log(`   balanceOf() [actual]:     ${ethers.formatUnits(stakingActualBalance, 6)} wYLDS`);
    console.log(`   Synced: ${stakingTotalAssets === stakingActualBalance ? "✅ YES" : "❌ NO"}`);
    
    if (stakingTotalSupply > 0n) {
      const sharePrice = (Number(stakingTotalAssets) / Number(stakingTotalSupply));
      console.log(`   Share Price: ${sharePrice.toFixed(6)} wYLDS per PRIME`);
      
      // Show your position if you have PRIME
      if (primeBalance > 0n) {
        const yourShare = (Number(primeBalance) / Number(stakingTotalSupply)) * 100;
        const yourAssets = (primeBalance * stakingTotalAssets) / stakingTotalSupply;
        console.log("");
        console.log(`   📈 Your Position:`);
        console.log(`      PRIME owned: ${ethers.formatUnits(primeBalance, 6)}`);
        console.log(`      Your share: ${yourShare.toFixed(2)}%`);
        console.log(`      Can claim: ${ethers.formatUnits(yourAssets, 6)} wYLDS`);
      }
    }
  }
  
  if (totalSupply > 0n) {
    const percentage = (wyldsBalance * 10000n) / totalSupply;
    console.log("");
    console.log(`   Your wYLDS Share: ${(Number(percentage) / 100).toFixed(2)}%`);
  }
  
  console.log("");
  
  // Check if user has pending redemption
  const pending = await yieldVault.pendingRedemptions(address);
  if (pending.shares > 0n) {
    console.log("⏳ Pending Redemption:");
    console.log(`   Shares: ${ethers.formatUnits(pending.shares, 6)} wYLDS`);
    console.log(`   Assets: ${ethers.formatUnits(pending.assets, 6)} USDC`);
    console.log("");
  }
  
  // Suggest next steps
  if (wyldsBalance === 0n && usdcBalance > 0n) {
    console.log("💡 You have USDC but no wYLDS. To get wYLDS:");
    console.log(`   npx hardhat run scripts/utils/approve-usdc.ts --network ${network.name}`);
    console.log("   Then deposit USDC to YieldVault");
  } else if (wyldsBalance === 0n && usdcBalance === 0n) {
    console.log("💡 You have no USDC or wYLDS. Get USDC from:");
    console.log("   - Hoodi faucet");
    console.log("   - Or mint MockUSDC on testnet");
  } else if (wyldsBalance > 0n) {
    console.log("✅ You have wYLDS! You can:");
    console.log(`   - Transfer: npx hardhat run scripts/utils/transfer-wylds.ts --network ${network.name}`);
    console.log("   - Stake for PRIME: Check StakingVault");
  }
  
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
