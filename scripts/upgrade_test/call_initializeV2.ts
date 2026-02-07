// @ts-ignore
import { ethers } from "hardhat";

async function main() {
  console.log("\n🔧 CALLING initializeV2() ON STAKINGVAULT");
  console.log("=" + "=".repeat(60));
  
  const stakingVaultAddress = "0x14D815D29F9b39859a55F1392cff217ED642a8Ea";
  const stakingVault = await ethers.getContractAt("StakingVaultV2", stakingVaultAddress);
  
  const [deployer] = await ethers.getSigners();
  console.log("Calling with account:", deployer.address);
  
  // Check state before
  console.log("\n📊 STATE BEFORE initializeV2():");
  const totalAssetsBefore = await stakingVault.totalAssets();
  const assetAddr = await stakingVault.asset();
  const wYLDS = await ethers.getContractAt("IERC20", assetAddr);
  const balanceBefore = await wYLDS.balanceOf(stakingVaultAddress);
  
  console.log("  totalAssets():", ethers.formatUnits(totalAssetsBefore, 6), "wYLDS");
  console.log("  balanceOf():", ethers.formatUnits(balanceBefore, 6), "wYLDS");
  console.log("  Difference:", ethers.formatUnits(balanceBefore - totalAssetsBefore, 6), "wYLDS");
  
  // Check if already initialized
  const INIT_STORAGE = "0xf0c57e16840df040f15088dc2f81fe391c3923bec73e23a9662efc9c229c6a00";
  const storageBefore = await ethers.provider.getStorage(stakingVaultAddress, INIT_STORAGE);
  const initVerBefore = BigInt(storageBefore) & BigInt(0xFFFFFFFFFFFFFFFF);
  
  if (initVerBefore >= 2n) {
    console.log("\n⚠️  initializeV2() already called (version:", initVerBefore.toString() + ")");
    console.log("This is unexpected - the state should be synced.");
    return;
  }
  
  console.log("\n🔄 Calling initializeV2()...");
  
  try {
    const tx = await stakingVault.initializeV2({
      gasLimit: 500000 // Set explicit gas limit
    });
    console.log("Transaction hash:", tx.hash);
    console.log("Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed!");
    console.log("Gas used:", receipt?.gasUsed.toString());
    
    // Check state after
    console.log("\n📊 STATE AFTER initializeV2():");
    const totalAssetsAfter = await stakingVault.totalAssets();
    const balanceAfter = await wYLDS.balanceOf(stakingVaultAddress);
    
    console.log("  totalAssets():", ethers.formatUnits(totalAssetsAfter, 6), "wYLDS");
    console.log("  balanceOf():", ethers.formatUnits(balanceAfter, 6), "wYLDS");
    
    const storageAfter = await ethers.provider.getStorage(stakingVaultAddress, INIT_STORAGE);
    const initVerAfter = BigInt(storageAfter) & BigInt(0xFFFFFFFFFFFFFFFF);
    console.log("  Internal _initialized:", initVerAfter.toString());
    
    if (totalAssetsAfter === balanceAfter && initVerAfter === 2n) {
      console.log("\n🎉 SUCCESS! _totalManagedAssets is now synced!");
      console.log("Inflation attack protection is ACTIVE!");
    } else {
      console.log("\n⚠️  Something unexpected happened:");
      console.log("  Synced?", totalAssetsAfter === balanceAfter);
      console.log("  Init version correct?", initVerAfter === 2n);
    }
    
  } catch (error: any) {
    console.error("\n❌ Error calling initializeV2():", error.message);
    
    if (error.message.includes("InvalidInitialization")) {
      console.log("\n💡 The function may have already been called.");
    } else if (error.message.includes("AccessControl")) {
      console.log("\n💡 You may not have UPGRADER_ROLE.");
    } else {
      console.log("\nFull error:", error);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
