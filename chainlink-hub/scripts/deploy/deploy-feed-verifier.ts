// @ts-ignore
import { ethers, upgrades, run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { patchProviderForPendingBlockBug } from "./lib/patchProvider";

/**
 * Deploy FeedVerifier.sol (UUPS proxy).
 *
 * Mirrors the NavEngine deploy pattern: dry-run on hardhat first, then pass env vars for live networks.
 * Saves deployment artifact at chainlink-hub/deployment_feed_verifier_<network>.json.
 *
 * Usage:
 *   # Dry run (local hardhat — no private key needed)
 *   npx hardhat run chainlink-hub/scripts/deploy/deploy-feed-verifier.ts --network hardhat
 *
 *   # Sepolia
 *   FEED_ID=0x<bytes32> \
 *     npx hardhat run chainlink-hub/scripts/deploy/deploy-feed-verifier.ts --network sepolia
 *
 *   # Mainnet (fill VERIFIER_PROXY mainnet value first)
 *   FEED_ID=0x<bytes32> \
 *   ADMIN_ADDRESS=<safe>   \
 *   UPDATER_ADDRESS=<bot>  \
 *     npx hardhat run chainlink-hub/scripts/deploy/deploy-feed-verifier.ts --network mainnet
 *
 * Env vars:
 *   FEED_ID          — bytes32 feedId to lock the verifier to (optional — omit or set to 0x00..00
 *                      to accept any feed; update later via set-feed-id.ts admin script)
 *   ADMIN_ADDRESS    — defaults to deployer (hand off to Safe after deploy)
 *   UPDATER_ADDRESS  — defaults to deployer (set to bot wallet for production)
 *   DRY_RUN          — set to "true" to print config and check the VerifierProxy has code, without deploying
 *   ETHERSCAN_API_KEY — required for on-chain verification
 *
 * Mainnet: fill in the mainnet VerifierProxy below before deploying.
 * Get address from: https://docs.chain.link/data-streams/supported-networks
 */

const VERIFIER_PROXY: Record<string, string> = {
  hardhat:  "0x0000000000000000000000000000000000000001", // dummy for dry run
  sepolia:  "0x4e9935be37302B9C97Ff4ae6868F1b566ade26d2",
  hoodi:    "",
  mainnet:  "0x5A1634A86e9b7BfEf33F0f3f3EA3b1aBBc4CC85F", // Chainlink Data Streams Verifier — Ethereum mainnet
  fuji:     "0x2bf612C65f5a4d388E687948bb2CF842FFb8aBB3", // Chainlink Data Streams Verifier — Avalanche Fuji testnet
  base:     "0xDE1A28D87Afd0f546505B28AB50410A5c3a7387a", // Chainlink Data Streams Verifier — Base mainnet
  "base-sepolia": "0x8Ac491b7c118a0cdcF048e0f707247fD8C9575f9", // Chainlink Data Streams Verifier — Base Sepolia testnet
  "ink-sepolia": "0x1f27392cC2394d54fFBA83B89C881200b5d5632C", // Chainlink Data Streams Verifier — Ink Sepolia testnet
  "robinhood-testnet": "0x72790f9eB82db492a7DDb6d2af22A270Dcc3Db64", // Chainlink Data Streams Verifier — Robinhood Chain testnet
  // Not yet listed in Chainlink's docs; confirmed on-chain (VerifierProxy 2.0.0) and by verifying a live report.
  "tempo-moderato": "0x72790f9eB82db492a7DDb6d2af22A270Dcc3Db64", // Chainlink Data Streams Verifier — Tempo Moderato testnet
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = network.name;
  // Only apply on networks confirmed to hard-error on the "pending" block tag
  // (e.g. Fuji). On networks where "pending" works, rewriting it to "latest"
  // can race against still-propagating blocks and produce bogus low gas
  // estimates instead of an error (observed on Base Sepolia).
  if (net === "fuji") {
    patchProviderForPendingBlockBug(deployer.provider);
  }

  const verifierProxy = VERIFIER_PROXY[net];
  if (!verifierProxy) throw new Error(`No VerifierProxy configured for network "${net}". Fill it in VERIFIER_PROXY map.`);

  const admin   = process.env.ADMIN_ADDRESS   || deployer.address;
  const updater = process.env.UPDATER_ADDRESS || deployer.address;
  // If FEED_ID is omitted the verifier accepts any feedId — call setAllowedFeedId later
  const feedId  = process.env.FEED_ID || ethers.ZeroHash;

  console.log("=".repeat(50));
  console.log("Deploy FeedVerifier");
  console.log("=".repeat(50));
  console.log(`Network:        ${net}`);
  console.log(`Deployer:       ${deployer.address}`);
  console.log(`Balance:        ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log(`Admin:          ${admin}`);
  console.log(`Updater (bot):  ${updater}`);
  console.log(`VerifierProxy:  ${verifierProxy}`);
  console.log(`Feed ID:        ${feedId === ethers.ZeroHash ? "(none — any feedId accepted; set later)" : feedId}`);
  console.log("");

  if (net === "hardhat") {
    console.log("🔍 DRY RUN — no real transactions. Re-run with --network sepolia or --network mainnet to deploy.");
    console.log("");
  }

  if (process.env.DRY_RUN === "true" && net !== "hardhat") {
    const code = await ethers.provider.getCode(verifierProxy);
    console.log(`VerifierProxy has code: ${code !== "0x"}`);
    console.log("🔍 DRY RUN — no transaction sent.");
    return;
  }

  console.log("🚀 Deploying FeedVerifier (UUPS proxy)...");
  const Factory = await ethers.getContractFactory("FeedVerifier");
  const proxy = await upgrades.deployProxy(Factory, [admin, updater, verifierProxy, feedId], {
    kind: "uups",
    initializer: "initialize",
  });
  await proxy.waitForDeployment();

  const proxyAddress = await proxy.getAddress();
  const implAddress  = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log(`\n✅ Proxy deployed:          ${proxyAddress}`);
  console.log(`✅ Implementation deployed: ${implAddress}`);

  // Verify on-chain state
  const fv = await ethers.getContractAt("FeedVerifier", proxyAddress);
  const storedFeedId    = await fv.allowedFeedId();
  const storedStaleness = await fv.defaultMaxStaleness();
  console.log(`\n📊 On-chain state:`);
  console.log(`   allowedFeedId:      ${storedFeedId}`);
  console.log(`   defaultMaxStaleness: ${storedStaleness}s`);

  if (net === "hardhat") {
    console.log("\n✅ Dry run complete. Contracts deployed to local hardhat network (addresses are ephemeral).");
    return;
  }

  // Save artifact
  const deploymentFile = path.join(__dirname, `../../deployment_feed_verifier_${net}.json`);
  const artifact = {
    network: net,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    feedVerifier: proxyAddress,
    feedVerifierImplementation: implAddress,
    verifierProxy,
    feedId: feedId === ethers.ZeroHash ? "" : feedId,
    deployer: deployer.address,
    admin,
    updater,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(deploymentFile, JSON.stringify(artifact, null, 2));
  console.log(`\n📄 Artifact saved to: ${deploymentFile}`);

  // Etherscan verification
  if (process.env.ETHERSCAN_API_KEY) {
    console.log("\n⏳ Waiting 30s for Etherscan to index...");
    await new Promise(r => setTimeout(r, 30000));
    try {
      await run("verify:verify", { address: implAddress, constructorArguments: [] });
      console.log("✅ Implementation verified on Etherscan");
    } catch (e: any) {
      if (e.message?.includes("Already Verified")) {
        console.log("✅ Already verified");
      } else {
        console.log(`⚠️  Verification failed: ${e.message}`);
      }
    }
  }

  console.log(`\n📋 Next steps:`);
  console.log(`  1. Set feedId when Chainlink provides it:`);
  console.log(`     PROXY=${proxyAddress} FEED_ID=0x<bytes32> \\`);
  console.log(`       npx hardhat run chainlink-hub/scripts/admin/set-feed-id.ts --network ${net}`);
  console.log(`  2. Test feed with:`);
  console.log(`     FEED_VERIFIER_ADDRESS=${proxyAddress} MODE=read \\`);
  console.log(`       CHAINLINK_CLIENT_ID=<id> CHAINLINK_CLIENT_SECRET=<secret> \\`);
  console.log(`       npx hardhat run chainlink-hub/scripts/ops/test-feed-verifier.ts --network ${net}`);
  console.log(`  3. Transfer admin to Safe and revoke deployer roles`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
