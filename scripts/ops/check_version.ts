/**
 * [OPS] Check the deployed contract version (V1 vs V2) and implementation addresses.
 * Useful for verifying upgrade success.
 *
 * Usage:
 *   npx hardhat run scripts/ops/check_version.ts --network sepolia
 *   npx hardhat run scripts/ops/check_version.ts --network hoodi
 */
// @ts-ignore
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { getDeploymentFile } from "../utils/getDeploymentFile";

async function main() {
  console.log("\n🔍 CONTRACT VERSION CHECKER");
  console.log("=" + "=".repeat(60));

  // Load deployment
  const deploymentFile = getDeploymentFile(network.name);
  const deployment = JSON.parse(fs.readFileSync(path.join(__dirname, "../../", deploymentFile), "utf8"));
  const yieldVaultProxy = deployment.contracts.yieldVault;
  const stakingVaultProxy = deployment.contracts.stakingVault;

  console.log("\n📍 Checking deployed contracts:");
  console.log("YieldVault:  ", yieldVaultProxy);
  console.log("StakingVault:", stakingVaultProxy);

  // Check YieldVault version
  console.log("\n📦 YieldVault Version:");
  try {
    const yieldVault = await ethers.getContractAt("YieldVaultV2", yieldVaultProxy);
    const version = await yieldVault.version();
    console.log("  ✅ Version:", version);
    console.log("  📝 Status: Upgraded to V2");
  } catch (error: any) {
    if (error.message.includes("version") || error.message.includes("revert")) {
      console.log("  ℹ️  Version: V1 (no version() method exists)");
      console.log("  📝 Status: Original deployment");
    } else {
      console.log("  ❌ Error:", error.message);
    }
  }

  // Check StakingVault version
  console.log("\n📦 StakingVault Version:");
  try {
    const stakingVault = await ethers.getContractAt("StakingVaultV2", stakingVaultProxy);
    
    // Try VERSION constant first
    try {
      const version = await stakingVault.VERSION();
      console.log("  ✅ Version:", version.toString());
      console.log("  📝 Status: Upgraded to V2");
    } catch {
      // Try version() function
      const version = await stakingVault.version();
      console.log("  ✅ Version:", version.toString());
      console.log("  📝 Status: Upgraded to V2");
    }
  } catch (error: any) {
    if (error.message.includes("version") || error.message.includes("revert")) {
      console.log("  ℹ️  Version: V1 (no version() method exists)");
      console.log("  📝 Status: Original deployment");
    } else {
      console.log("  ❌ Error:", error.message);
    }
  }

  // Check implementation addresses
  console.log("\n🔧 Implementation Addresses:");
  const yieldImpl = await ethers.provider.getStorage(
    yieldVaultProxy,
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
  );
  const stakingImpl = await ethers.provider.getStorage(
    stakingVaultProxy,
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
  );
  
  console.log("YieldVault Implementation:  ", "0x" + yieldImpl.slice(-40));
  console.log("StakingVault Implementation:", "0x" + stakingImpl.slice(-40));

  // Test V2 features (if available)
  console.log("\n🧪 Testing V2 Features:");
  try {
    const stakingVault = await ethers.getContractAt("StakingVaultV2", stakingVaultProxy);
    const echoResult = await stakingVault.echo("Hello V2!");
    console.log("  ✅ echo() function:", echoResult);
    console.log("  📝 V2 features are available");
  } catch (error: any) {
    console.log("  ℹ️  V2 features not available (still on V1)");
  }

  console.log("\n" + "=".repeat(62));
  console.log("✅ Version check complete!");
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
