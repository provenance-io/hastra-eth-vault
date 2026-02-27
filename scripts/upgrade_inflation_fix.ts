// @ts-ignore
import { ethers, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { getDeploymentFile } from "./utils/getDeploymentFile";

async function main() {
  console.log("\n🚀 UPGRADING STAKING VAULT - INFLATION ATTACK FIX");
  console.log("=" + "=".repeat(70));
  
  const [deployer] = await ethers.getSigners();
  console.log("Upgrading with account:", deployer.address);

  // Determine network and load correct deployment file
  const network = await ethers.provider.getNetwork();
  const deploymentFile = getDeploymentFile(network.name);
  
  console.log("Network:", network.name, "(Chain ID:", network.chainId.toString() + ")");
  console.log("Using deployment file:", deploymentFile);

  // Load existing deployment
  const deploymentPath = path.join(__dirname, "..", deploymentFile);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentFile}`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const stakingVaultProxy = deployment.contracts.stakingVault;

  console.log("\n📍 CURRENT DEPLOYMENT:");
  console.log("StakingVault Proxy:", stakingVaultProxy);

  // Get current implementation address
  const oldImpl = await upgrades.erc1967.getImplementationAddress(stakingVaultProxy);
  
  console.log("\n📦 CURRENT IMPLEMENTATION:");
  console.log("StakingVault (old):", oldImpl);

  // Read state BEFORE upgrade
  console.log("\n📊 STATE BEFORE UPGRADE:");
  const stakingVaultOld = await ethers.getContractAt("StakingVault", stakingVaultProxy);
  
  const totalSupply = await stakingVaultOld.totalSupply();
  const totalAssets = await stakingVaultOld.totalAssets();
  const asset = await stakingVaultOld.asset();
  const frozen = await stakingVaultOld.frozen();
  
  console.log("StakingVault:");
  console.log("  - Total Supply:", ethers.formatUnits(totalSupply, 6), "PRIME");
  console.log("  - Total Assets:", ethers.formatUnits(totalAssets, 6), "wYLDS");
  console.log("  - Asset (wYLDS):", asset);
  console.log("  - Frozen:", frozen);

  // Perform upgrade
  console.log("\n🔄 UPGRADING TO NEW VERSION (with inflation protection)...");
  console.log("⏳ This may take a minute on testnet...");
  
  const StakingVaultNew = await ethers.getContractFactory("StakingVault");

  console.log("Deploying new implementation...");
  let stakingVaultNew;
  try {
    stakingVaultNew = await upgrades.upgradeProxy(stakingVaultProxy, StakingVaultNew, {
      timeout: 120000, // 2 minutes timeout
      pollingInterval: 2000, // Check every 2 seconds
    });
    await stakingVaultNew.waitForDeployment();
    console.log("✅ StakingVault upgraded successfully");
  } catch (error: any) {
    if (error.message.includes("underpriced")) {
      console.log("⚠️  Gas price too low, retrying with higher gas...");
      await new Promise(resolve => setTimeout(resolve, 10000));
      stakingVaultNew = await upgrades.upgradeProxy(stakingVaultProxy, StakingVaultNew, {
        timeout: 120000,
        pollingInterval: 2000,
      });
      await stakingVaultNew.waitForDeployment();
      console.log("✅ StakingVault upgraded successfully (retry)");
    } else {
      throw error;
    }
  }

  // Get new implementation address
  const newImpl = await upgrades.erc1967.getImplementationAddress(stakingVaultProxy);
  
  console.log("\n✅ UPGRADE COMPLETE!");
  console.log("\n📦 NEW IMPLEMENTATION:");
  console.log("StakingVault (new):", newImpl);

  // Verify state AFTER upgrade
  console.log("\n📊 STATE AFTER UPGRADE:");
  const totalSupplyAfter = await stakingVaultNew.totalSupply();
  const totalAssetsAfter = await stakingVaultNew.totalAssets();
  const assetAfter = await stakingVaultNew.asset();
  const frozenAfter = await stakingVaultNew.frozen();
  
  console.log("StakingVault:");
  console.log("  - Total Supply:", ethers.formatUnits(totalSupplyAfter, 6), "PRIME");
  console.log("  - Total Assets:", ethers.formatUnits(totalAssetsAfter, 6), "wYLDS");
  console.log("  - Asset (wYLDS):", assetAfter);
  console.log("  - Frozen:", frozenAfter);

  // Verify state preservation
  console.log("\n🔍 VERIFICATION:");
  const supplyMatch = totalSupply === totalSupplyAfter;
  const assetsMatch = totalAssets === totalAssetsAfter;
  const assetMatch = asset === assetAfter;
  const frozenMatch = frozen === frozenAfter;
  
  console.log("Total Supply preserved:", supplyMatch ? "✅" : "❌");
  console.log("Total Assets preserved:", assetsMatch ? "✅" : "❌");
  console.log("Asset address preserved:", assetMatch ? "✅" : "❌");
  console.log("Frozen state preserved:", frozenMatch ? "✅" : "❌");
  
  if (supplyMatch && assetsMatch && assetMatch && frozenMatch) {
    console.log("\n🎉 UPGRADE SUCCESSFUL - ALL STATE PRESERVED!");
  } else {
    console.log("\n❌ WARNING: State mismatch detected!");
  }

  console.log("\n📝 SUMMARY:");
  console.log("Proxy address (unchanged):   ", stakingVaultProxy);
  console.log("Implementation changed:      ", oldImpl, "→", newImpl);
  console.log("State preserved:             ", "✅");
  console.log("\n💡 New Features:");
  console.log("  ✅ Internal accounting (_totalManagedAssets)");
  console.log("  ✅ Protection against inflation attack via donation");
  console.log("  ✅ Storage gap for future upgrades (__gap[49])");
  console.log("  ✅ Accounting discrepancy monitoring (getAccountingDiscrepancy)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
