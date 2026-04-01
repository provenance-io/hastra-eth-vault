// @ts-ignore
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { getDeploymentFile } from "../utils/getDeploymentFile";

/**
 * [ADMIN] Set maxRewardPercent on StakingVault to 75 BPS (0.75%).
 * Requires DEFAULT_ADMIN_ROLE on the proxy.
 *
 * Usage:
 *   npx hardhat run scripts/admin/set-max-reward-bps.ts --network hoodi
 *   npx hardhat run scripts/admin/set-max-reward-bps.ts --network sepolia
 */

// 75 BPS = 0.75% = 0.0075e18
const TARGET_BPS = 75n;
const NEW_MAX_REWARD_PERCENT = (TARGET_BPS * 10n ** 18n) / 10000n; // 7500000000000000

async function main() {
  console.log("\n⚙️  SET MAX REWARD PERCENT — StakingVault");
  console.log("=".repeat(70));

  const [deployer] = await ethers.getSigners();
  console.log("Signer:", deployer.address);

  const network = await ethers.provider.getNetwork();
  const deploymentFile = getDeploymentFile(network.name);
  console.log("Network:", network.name, "(Chain ID:", network.chainId.toString() + ")");

  const deploymentPath = path.join(__dirname, "../..", deploymentFile);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentFile}`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const stakingVaultProxy = deployment.contracts.stakingVault;
  console.log("StakingVault proxy:", stakingVaultProxy);

  const vault = await ethers.getContractAt("StakingVault", stakingVaultProxy);

  // Verify signer has DEFAULT_ADMIN_ROLE
  const DEFAULT_ADMIN_ROLE = await vault.DEFAULT_ADMIN_ROLE();
  const hasRole = await vault.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
  if (!hasRole) {
    throw new Error(`Signer ${deployer.address} does not have DEFAULT_ADMIN_ROLE`);
  }

  const currentPercent = await vault.maxRewardPercent();
  const currentBps = (currentPercent * 10000n) / 10n ** 18n;

  console.log("\n📊 CURRENT:");
  console.log("  maxRewardPercent:", currentPercent.toString(), `(${currentBps} BPS / ${ethers.formatUnits(currentPercent, 16)}%)`);

  console.log("\n🎯 TARGET:");
  console.log("  maxRewardPercent:", NEW_MAX_REWARD_PERCENT.toString(), `(${TARGET_BPS} BPS / 0.75%)`);

  if (currentPercent === NEW_MAX_REWARD_PERCENT) {
    console.log("\n✅ Already set to 75 BPS — no action needed.");
    return;
  }

  console.log("\n🔄 Sending transaction...");
  const tx = await vault.setMaxRewardPercent(NEW_MAX_REWARD_PERCENT);
  console.log("  tx hash:", tx.hash);
  await tx.wait();

  // Verify
  const updatedPercent = await vault.maxRewardPercent();
  const updatedBps = (updatedPercent * 10000n) / 10n ** 18n;

  if (updatedPercent !== NEW_MAX_REWARD_PERCENT) {
    console.log("\n❌ Verification failed — value did not update!");
    process.exitCode = 1;
    return;
  }

  console.log("\n✅ SUCCESS!");
  console.log("  Old:", currentPercent.toString(), `(${currentBps} BPS)`);
  console.log("  New:", updatedPercent.toString(), `(${updatedBps} BPS / 0.75%)`);
  console.log("  Tx: ", tx.hash);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
