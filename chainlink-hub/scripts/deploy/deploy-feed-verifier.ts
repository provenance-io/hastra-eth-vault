// @ts-ignore
import { ethers, upgrades, run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy FeedVerifier.sol (UUPS proxy) to Sepolia or Hoodi.
 *
 * Saves a deployment artifact at chainlink-hub/deployment_feed_verifier_<network>.json
 * containing proxy address, implementation address, verifierProxy, feedId, and deployer.
 *
 * Usage:
 *   npx hardhat run scripts/deploy/deploy-feed-verifier.ts --network sepolia
 *   npx hardhat run scripts/deploy/deploy-feed-verifier.ts --network hoodi
 *
 * Required .env:
 *   PRIVATE_KEY, SEPOLIA_RPC_URL (or HOODI_RPC_URL), ETHERSCAN_API_KEY
 *
 * Optional .env:
 *   ADMIN_ADDRESS    — defaults to deployer
 *   UPDATER_ADDRESS  — defaults to deployer (set to bot wallet in production)
 */

const VERIFIER_PROXY: Record<string, string> = {
  sepolia:  "0x4e9935be37302B9C97Ff4ae6868F1b566ade26d2",
  hoodi:    "", // fill when known
  mainnet:  "", // fill when known
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = network.name;

  const verifierProxy = VERIFIER_PROXY[net];
  if (!verifierProxy) throw new Error(`No VerifierProxy address configured for network: ${net}`);

  const admin   = process.env.ADMIN_ADDRESS   || deployer.address;
  const updater = process.env.UPDATER_ADDRESS || deployer.address;

  console.log(`Network:         ${net}`);
  console.log(`Deployer:        ${deployer.address}`);
  console.log(`Admin:           ${admin}`);
  console.log(`Updater (bot):   ${updater}`);
  console.log(`VerifierProxy:   ${verifierProxy}`);
  console.log("");

  console.log("🚀 Deploying FeedVerifier (UUPS proxy)...");
  const Factory = await ethers.getContractFactory("FeedVerifier");
  const proxy = await upgrades.deployProxy(Factory, [admin, updater, verifierProxy], {
    kind: "uups",
    initializer: "initialize",
  });
  await proxy.waitForDeployment();

  const proxyAddress = await proxy.getAddress();
  const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log(`✅ Proxy deployed:          ${proxyAddress}`);
  console.log(`✅ Implementation deployed: ${implAddress}`);

  const deploymentFile = path.join(__dirname, `../../deployment_feed_verifier_${net}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify({
    network: net,
    feedVerifier: proxyAddress,
    feedVerifierImplementation: implAddress,
    verifierProxy,
    feedId: "0x000700f43b35146a1cb16373ac6225ad597535e928e6dc4d179c3b4225f2b6d3",
    deployer: deployer.address,
    admin,
    updater,
    deployedAt: new Date().toISOString(),
  }, null, 2));
  console.log(`📄 Saved to ${deploymentFile}`);

  // Verify implementation on Etherscan (proxy is auto-verified by hardhat-upgrades)
  if (process.env.ETHERSCAN_API_KEY && net !== "hardhat") {
    console.log("\n⏳ Waiting 15s for Etherscan to index...");
    await new Promise(r => setTimeout(r, 15000));
    try {
      await run("verify:verify", { address: implAddress, constructorArguments: [] });
      console.log("✅ Verified on Etherscan");
    } catch (e: any) {
      if (e.message?.includes("Already Verified")) {
        console.log("✅ Already verified");
      } else {
        console.log(`⚠️  Verification failed: ${e.message}`);
      }
    }
  }

  console.log(`\n📋 Next step — run the test:`);
  console.log(`  FEED_VERIFIER_ADDRESS=${proxyAddress} \\`);
  console.log(`  CHAINLINK_CLIENT_ID=<id> CHAINLINK_CLIENT_SECRET=<secret> \\`);
  console.log(`  npx hardhat run scripts/test-feed-verifier.ts --network ${net}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
