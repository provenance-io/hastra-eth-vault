// @ts-ignore
import { ethers, upgrades, run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Upgrade FeedVerifier to V2 (adds allowedFeedId enforcement).
 *
 * Deploys a new implementation and calls setAllowedFeedId(feedId) atomically
 * via upgradeToAndCall in a single transaction.
 *
 * Usage:
 *   npx hardhat run scripts/upgrade-feed-verifier.ts --network sepolia
 *   npx hardhat run scripts/upgrade-feed-verifier.ts --network hoodi
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

  const artifactPath = path.join(__dirname, `../deployment_feed_verifier_${net}.json`);
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

  console.log("🚀 Upgrading FeedVerifier (deploying new implementation + setting feedId atomically)...");
  const upgraded = await upgrades.upgradeProxy(proxyAddress, Factory, {
    kind: "uups",
    call: { fn: "setAllowedFeedId", args: [feedId] },
  });
  await upgraded.waitForDeployment();

  const newImplAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

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
