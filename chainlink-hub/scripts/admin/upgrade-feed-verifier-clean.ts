// @ts-ignore
import { ethers, run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { patchProviderForPendingBlockBug } from "../deploy/lib/patchProvider";

/**
 * Upgrade FeedVerifier to a clean implementation (no mock-price escape hatch),
 * matching the contract version on main. Used to remove the testnet-only
 * mockPriceEnabled/setMockPrice feature once a real feed is verified working
 * and the mock fallback is no longer needed.
 *
 * NOTE: Uses Factory.deploy() + upgradeToAndCall(impl, "0x") directly — never
 * the OZ upgrades plugin — to avoid manifest cache issues with existing
 * proxies. No re-init calldata needed since removing the flag requires no
 * new storage initialization.
 *
 * Usage:
 *   npx hardhat run scripts/admin/upgrade-feed-verifier-clean.ts --network fuji
 *
 * Required .env:
 *   PRIVATE_KEY   — must hold UPGRADER_ROLE on the proxy
 *   FUJI_RPC_URL
 *
 * Optional .env:
 *   ETHERSCAN_API_KEY   — enables Snowtrace verification of new impl
 */

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = network.name;
  patchProviderForPendingBlockBug(deployer.provider);

  const artifactPath = path.join(__dirname, `../../deployment_feed_verifier_${net}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`No deployment artifact found at ${artifactPath}. Deploy first.`);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const proxyAddress: string = artifact.feedVerifier;

  console.log(`Network:         ${net}`);
  console.log(`Upgrader:        ${deployer.address}`);
  console.log(`Proxy:           ${proxyAddress}`);
  console.log("");

  const Factory = await ethers.getContractFactory("FeedVerifier", deployer);

  console.log("🚀 Deploying new (clean, mock-free) FeedVerifier implementation...");
  const impl = await Factory.deploy();
  await impl.waitForDeployment();
  const newImplAddress = await impl.getAddress();
  console.log(`   New implementation: ${newImplAddress}`);

  console.log("🚀 Upgrading proxy (upgradeToAndCall, no calldata)...");
  const proxy = await ethers.getContractAt("FeedVerifier", proxyAddress, deployer);
  await (await proxy.upgradeToAndCall(newImplAddress, "0x")).wait();

  console.log(`✅ Upgrade complete`);
  console.log(`   Proxy (unchanged):  ${proxyAddress}`);
  console.log(`   New implementation: ${newImplAddress}`);

  // Update artifact in place
  artifact.feedVerifierImplementation = newImplAddress;
  delete artifact.mockPriceEnabled;
  delete artifact.mockPrice;
  artifact.upgradedAt = new Date().toISOString();
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  console.log(`\n📄 Updated ${artifactPath}`);

  if (process.env.ETHERSCAN_API_KEY && net !== "hardhat") {
    console.log("\n⏳ Waiting 15s for explorer to index...");
    await new Promise(r => setTimeout(r, 15000));
    try {
      await run("verify:verify", { address: newImplAddress, constructorArguments: [] });
      console.log("✅ Verified");
    } catch (e: any) {
      if (e.message?.includes("Already Verified")) {
        console.log("✅ Already verified");
      } else {
        console.log(`⚠️  Verification failed: ${e.message}`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
