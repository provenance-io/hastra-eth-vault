// @ts-ignore
import { ethers, run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Upgrade FeedVerifier to a new implementation.
 *
 * Deploys a fresh implementation bypassing the OZ manifest cache, then calls
 * upgradeToAndCall() atomically with setAllowedFeedId() in a single transaction.
 *
 * NOTE: Uses Factory.deploy() + upgradeToAndCall() directly — never uses the OZ
 * upgrades plugin — to avoid manifest cache issues with existing proxies.
 *
 * Usage:
 *   npx hardhat run scripts/admin/upgrade-feed-verifier.ts --network sepolia
 *   npx hardhat run scripts/admin/upgrade-feed-verifier.ts --network hoodi
 *
 * Required .env:
 *   PRIVATE_KEY        — must hold UPGRADER_ROLE + DEFAULT_ADMIN_ROLE on the proxy
 *   SEPOLIA_RPC_URL    (or HOODI_RPC_URL)
 *
 * Optional .env:
 *   FEED_ID            — overrides feedId from deployment artifact
 *   ETHERSCAN_API_KEY  — enables Etherscan verification of new impl
 */

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = network.name;

  const artifactPath = path.join(__dirname, `../../deployment_feed_verifier_${net}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`No deployment artifact found at ${artifactPath}. Deploy first.`);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const proxyAddress: string = artifact.feedVerifier;
  const feedId: string = process.env.FEED_ID || artifact.feedId;

  if (!feedId || feedId === ethers.ZeroHash) {
    throw new Error("No feedId available — set FEED_ID env var or ensure it exists in the deployment artifact.");
  }

  console.log(`Network:         ${net}`);
  console.log(`Upgrader:        ${deployer.address}`);
  console.log(`Proxy:           ${proxyAddress}`);
  console.log(`Feed ID:         ${feedId}`);
  console.log("");

  const Factory = await ethers.getContractFactory("FeedVerifier", deployer);

  console.log("🚀 Deploying new FeedVerifier implementation...");
  const impl = await Factory.deploy();
  await impl.waitForDeployment();
  const newImplAddress = await impl.getAddress();
  console.log(`   New implementation: ${newImplAddress}`);

  const calldata = Factory.interface.encodeFunctionData("setAllowedFeedId", [feedId]);
  console.log("🚀 Upgrading proxy (upgradeToAndCall + setAllowedFeedId atomically)...");
  const proxy = await ethers.getContractAt("FeedVerifier", proxyAddress, deployer);
  await (await proxy.upgradeToAndCall(newImplAddress, calldata)).wait();

  console.log(`✅ Upgrade complete`);
  console.log(`   Proxy (unchanged):  ${proxyAddress}`);
  console.log(`   New implementation: ${newImplAddress}`);
  console.log(`   allowedFeedId set:  ${feedId}`);

  // Update artifact in place
  artifact.feedVerifierImplementation = newImplAddress;
  artifact.allowedFeedId = feedId;
  artifact.upgradedAt = new Date().toISOString();
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  console.log(`\n📄 Updated ${artifactPath}`);

  if (process.env.ETHERSCAN_API_KEY && net !== "hardhat") {
    console.log("\n⏳ Waiting 15s for Etherscan to index...");
    await new Promise(r => setTimeout(r, 15000));
    try {
      await run("verify:verify", { address: newImplAddress, constructorArguments: [] });
      console.log("✅ Verified on Etherscan");
    } catch (e: any) {
      if (e.message?.includes("Already Verified")) {
        console.log("✅ Already verified");
      } else {
        console.log(`⚠️  Verification failed: ${e.message}`);
      }
    }
  }

  console.log(`\n📋 Verify the upgrade:`);
  console.log(`  npx hardhat run scripts/admin/verify-safe-upgrade.ts --network ${net}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
