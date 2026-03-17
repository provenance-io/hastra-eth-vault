// @ts-ignore
import { ethers, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { getDeploymentFile } from "../utils/getDeploymentFile";

/**
 * [ADMIN] Upgrade StakingVault proxy to the latest implementation.
 * Requires UPGRADER_ROLE on the proxy.
 *
 * Usage:
 *   npx hardhat run scripts/admin/upgrade_staking_vault.ts --network sepolia
 *   npx hardhat run scripts/admin/upgrade_staking_vault.ts --network hoodi
 */
async function main() {
  console.log("\n🚀 UPGRADING STAKING VAULT");
  console.log("=".repeat(70));

  const [deployer] = await ethers.getSigners();
  console.log("Upgrading with account:", deployer.address);

  const network = await ethers.provider.getNetwork();
  const deploymentFile = getDeploymentFile(network.name);
  console.log("Network:", network.name, "(Chain ID:", network.chainId.toString() + ")");

  const deploymentPath = path.join(__dirname, "../..", deploymentFile);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentFile}`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const stakingVaultProxy = deployment.contracts.stakingVault;

  console.log("\n📍 PROXY ADDRESS:", stakingVaultProxy);

  const oldImpl = await upgrades.erc1967.getImplementationAddress(stakingVaultProxy);
  console.log("Current implementation:", oldImpl);

  // Snapshot state before upgrade
  const vault = await ethers.getContractAt("StakingVault", stakingVaultProxy);
  const [totalSupply, totalAssets, asset, paused] = await Promise.all([
    vault.totalSupply(),
    vault.totalAssets(),
    vault.asset(),
    vault.paused(),
  ]);

  console.log("\n📊 STATE BEFORE UPGRADE:");
  console.log("  Total Supply:", ethers.formatUnits(totalSupply, 6), "PRIME");
  console.log("  Total Assets:", ethers.formatUnits(totalAssets, 6), "wYLDS");
  console.log("  Asset (wYLDS):", asset);
  console.log("  Paused:", paused);

  console.log("\n🔄 DEPLOYING NEW IMPLEMENTATION...");
  const StakingVaultNew = await ethers.getContractFactory("StakingVault");

  // Deploy using plain deploy() so address is nonce-based (not CREATE2/bytecode-cached).
  const implContract = await StakingVaultNew.deploy();
  await implContract.waitForDeployment();
  const newImpl = await implContract.getAddress();
  console.log("New implementation deployed:", newImpl);

  const upgraded = await ethers.getContractAt("StakingVault", stakingVaultProxy);
  const upgradeTx = await (upgraded as any).upgradeToAndCall(newImpl, "0x");
  await upgradeTx.wait();

  console.log("✅ Upgraded successfully");
  console.log("New implementation:", newImpl);

  // Verify state preserved
  const [supplyAfter, assetsAfter, assetAfter, pausedAfter] = await Promise.all([
    upgraded.totalSupply(),
    upgraded.totalAssets(),
    upgraded.asset(),
    upgraded.paused(),
  ]);

  console.log("\n🔍 STATE VERIFICATION:");
  const checks: [string, boolean][] = [
    ["Total Supply",  totalSupply  === supplyAfter],
    ["Total Assets",  totalAssets  === assetsAfter],
    ["Asset address", asset        === assetAfter],
    ["Paused state",  paused       === pausedAfter],
  ];
  let allOk = true;
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? "✅" : "❌"} ${label} preserved`);
    if (!ok) allOk = false;
  }

  if (!allOk) {
    console.log("\n❌ State mismatch — investigate before proceeding!");
    process.exitCode = 1;
    return;
  }

  // Update deployment file
  deployment.contracts.stakingVaultImplementation = newImpl;
  deployment.lastUpgrade = { timestamp: new Date().toISOString(), oldImpl, newImpl };
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log("\n✅ UPGRADE COMPLETE!");
  console.log("  Proxy (unchanged):  ", stakingVaultProxy);
  console.log("  Implementation:     ", oldImpl, "→", newImpl);
  console.log("  Deployment file:    ", deploymentFile, "(updated)");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
