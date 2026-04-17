// @ts-ignore
import { ethers, upgrades, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { getDeploymentFile } from "../utils/getDeploymentFile";

/**
 * [ADMIN] Prepare Safe upgrade: StakingVault → StakingVaultV5 ("Hastra PRIME" rename + contractURI).
 * Deploys the new implementation (no admin role needed), then prints calldata
 * to paste into the Safe UI. Nothing is executed on the proxy.
 *
 * Usage:
 *   SAFE_ADDRESS=0x4E79e5BB88f0596446c615B86D3780A11DB1a2f4 \
 *     npx hardhat run scripts/admin/upgrade_staking_vault_rename.ts --network sepolia
 *   SAFE_ADDRESS=0x... \
 *     npx hardhat run scripts/admin/upgrade_staking_vault_rename.ts --network mainnet
 */
async function main() {
  const safeAddress = process.env.SAFE_ADDRESS;
  if (!safeAddress) throw new Error("SAFE_ADDRESS env var required");

  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const deploymentFile = getDeploymentFile(net.name);

  console.log("\n🔧 PREPARE SAFE UPGRADE — StakingVault → Hastra PRIME");
  console.log("=".repeat(70));
  console.log("Network:   ", net.name);
  console.log("Deployer:  ", deployer.address);
  console.log("Safe:      ", safeAddress);

  const deploymentPath = path.join(__dirname, "../..", deploymentFile);
  if (!fs.existsSync(deploymentPath)) throw new Error(`Deployment file not found: ${deploymentFile}`);

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const proxyAddress = deployment.contracts.stakingVault;
  if (!proxyAddress) throw new Error("stakingVault not found in deployment file");

  console.log("Proxy:     ", proxyAddress);

  const currentImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("Current impl:", currentImpl);

  const proxy = await ethers.getContractAt("StakingVaultV5", proxyAddress);
  const currentName = await proxy.name();
  console.log("Current name:", currentName);

  if (currentName === "Hastra PRIME") {
    console.log("\n✅ Already named 'Hastra PRIME' — nothing to do.");
    return;
  }

  console.log("\n🚀 Deploying StakingVaultV5 implementation...");
  const Factory = await ethers.getContractFactory("StakingVaultV5");
  try {
    await upgrades.forceImport(proxyAddress, Factory, { kind: "uups" });
  } catch (e: any) {
    if (!e.message?.includes("already registered") && !e.message?.includes("Found existing")) throw e;
  }
  const newImpl = await upgrades.prepareUpgrade(proxyAddress, Factory, {
    redeployImplementation: "always",
  }) as string;
  console.log("✅ New implementation deployed:", newImpl);

  const initData = Factory.interface.encodeFunctionData("initializeV5", []);
  const upgradeIface = new ethers.Interface(["function upgradeToAndCall(address,bytes)"]);
  const calldata = upgradeIface.encodeFunctionData("upgradeToAndCall", [newImpl, initData]);

  const networkPrefix = net.name === "mainnet" ? "eth" : "sep";
  console.log(`\n${"=".repeat(70)}`);
  console.log("📋 SAFE TRANSACTION");
  console.log(`${"=".repeat(70)}`);
  console.log(`Safe URL:   https://app.safe.global/${networkPrefix}:${safeAddress}`);
  console.log(`To:         ${proxyAddress}`);
  console.log(`Value:      0`);
  console.log(`Calldata:`);
  console.log(calldata);
  console.log(`\nDecoded:`);
  console.log(`  upgradeToAndCall(`);
  console.log(`    newImplementation: ${newImpl}`);
  console.log(`    data: ${initData}  // initializeV5()`);
  console.log(`  )`);
  console.log(`${"=".repeat(70)}`);
  console.log("⚠️  After Safe executes, run verify-safe-upgrade.ts to confirm.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
