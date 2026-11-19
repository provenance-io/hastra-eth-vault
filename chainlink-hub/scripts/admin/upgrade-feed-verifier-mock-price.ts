// @ts-ignore
import { ethers, run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { patchProviderForPendingBlockBug } from "../deploy/lib/patchProvider";

/**
 * Upgrade FeedVerifier to a new implementation and atomically enable the
 * testnet-only mock price fallback (setMockPrice), for deployments that have
 * no real allowedFeedId configured yet.
 *
 * NOTE: Uses Factory.deploy() + upgradeToAndCall() directly — never uses the OZ
 * upgrades plugin — to avoid manifest cache issues with existing proxies.
 *
 * Usage:
 *   npx hardhat run scripts/admin/upgrade-feed-verifier-mock-price.ts --network fuji
 *
 * Required .env:
 *   PRIVATE_KEY   — must hold UPGRADER_ROLE + DEFAULT_ADMIN_ROLE on the proxy
 *   FUJI_RPC_URL
 *
 * Optional .env:
 *   MOCK_PRICE          — 1e18-scaled int192, defaults to 1e18 (1.0)
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
  const mockPrice: bigint = process.env.MOCK_PRICE ? BigInt(process.env.MOCK_PRICE) : ethers.parseUnits("1", 18);

  console.log(`Network:         ${net}`);
  console.log(`Upgrader:        ${deployer.address}`);
  console.log(`Proxy:           ${proxyAddress}`);
  console.log(`Mock price:      ${mockPrice}`);
  console.log("");

  const Factory = await ethers.getContractFactory("FeedVerifier", deployer);

  console.log("🚀 Deploying new FeedVerifier implementation...");
  const impl = await Factory.deploy();
  await impl.waitForDeployment();
  const newImplAddress = await impl.getAddress();
  console.log(`   New implementation: ${newImplAddress}`);

  const calldata = Factory.interface.encodeFunctionData("setMockPrice", [true, mockPrice]);
  console.log("🚀 Upgrading proxy (upgradeToAndCall + setMockPrice atomically)...");
  const proxy = await ethers.getContractAt("FeedVerifier", proxyAddress, deployer);
  await (await proxy.upgradeToAndCall(newImplAddress, calldata)).wait();

  console.log(`✅ Upgrade complete`);
  console.log(`   Proxy (unchanged):  ${proxyAddress}`);
  console.log(`   New implementation: ${newImplAddress}`);
  console.log(`   mockPriceEnabled:   true`);
  console.log(`   mockPrice:          ${mockPrice}`);

  // Update artifact in place
  artifact.feedVerifierImplementation = newImplAddress;
  artifact.mockPriceEnabled = true;
  artifact.mockPrice = mockPrice.toString();
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
