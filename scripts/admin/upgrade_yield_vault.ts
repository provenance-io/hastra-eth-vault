// @ts-ignore
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { getDeploymentFile } from "../utils/getDeploymentFile";

/**
 * [ADMIN] Upgrade YieldVault proxy to the latest implementation.
 * Requires UPGRADER_ROLE on the proxy.
 *
 * Usage:
 *   npx hardhat run scripts/admin/upgrade_yield_vault.ts --network sepolia
 *   npx hardhat run scripts/admin/upgrade_yield_vault.ts --network hoodi
 *
 * Deploys the new implementation directly (bypasses OZ manifest) then calls
 * upgradeToAndCall on the proxy.
 */
async function main() {
  console.log("\n🚀 UPGRADING YIELD VAULT");
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
  const yieldVaultProxy = deployment.contracts.yieldVault;
  if (!yieldVaultProxy) throw new Error("yieldVault address not found in deployment file");

  console.log("\n📍 PROXY ADDRESS:", yieldVaultProxy);

  const proxy = await ethers.getContractAt("YieldVault", yieldVaultProxy);

  // Read ERC1967 implementation slot directly (no OZ manifest needed)
  const ERC1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const rawSlot = await ethers.provider.getStorage(yieldVaultProxy, ERC1967_IMPL_SLOT);
  const oldImpl = ethers.getAddress("0x" + rawSlot.slice(-40));
  console.log("Current implementation:", oldImpl);

  // Snapshot state before upgrade
  const [totalSupply, totalAssets, asset, paused] = await Promise.all([
    proxy.totalSupply(),
    proxy.totalAssets(),
    proxy.asset(),
    proxy.paused(),
  ]);

  console.log("\n📊 STATE BEFORE UPGRADE:");
  console.log("  Total Supply:", ethers.formatUnits(totalSupply, 6), "shares");
  console.log("  Total Assets:", ethers.formatUnits(totalAssets, 6), "USDC");
  console.log("  Asset (USDC):", asset);
  console.log("  Paused:", paused);

  console.log("\n🔄 DEPLOYING NEW IMPLEMENTATION...");
  const YieldVaultNew = await ethers.getContractFactory("YieldVault");

  // Deploy using plain deploy() so address is nonce-based (not bytecode-cached).
  const implContract = await YieldVaultNew.deploy();
  await implContract.waitForDeployment();
  const newImpl = await implContract.getAddress();
  console.log("New implementation deployed:", newImpl);

  const upgradeTx = await (proxy as any).upgradeToAndCall(newImpl, "0x");
  await upgradeTx.wait();
  console.log("✅ Upgraded successfully");

  // Verify state preserved
  const [supplyAfter, assetsAfter, assetAfter, pausedAfter] = await Promise.all([
    proxy.totalSupply(),
    proxy.totalAssets(),
    proxy.asset(),
    proxy.paused(),
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
  deployment.contracts.yieldVaultImplementation = newImpl;
  deployment.lastUpgrade = { timestamp: new Date().toISOString(), oldImpl, newImpl };
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log("\n✅ UPGRADE COMPLETE!");
  console.log("  Proxy (unchanged):  ", yieldVaultProxy);
  console.log("  Implementation:     ", oldImpl, "→", newImpl);
  console.log("  Deployment file:    ", deploymentFile, "(updated)");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
