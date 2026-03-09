/**
 * read-nav.ts
 *
 * Reads the latest verified NAV from FeedVerifier and shows:
 *   - Current verified exchange rate (per feedId)
 *   - StakingVault totalAssets / totalSupply
 *   - What redeeming/depositing looks like at the verified NAV
 *
 * Supports both FeedVerifier versions:
 *   - New: priceOf(feedId) / timestampOf(feedId) (per-feed mapping)
 *   - Old: lastDecodedPrice / lastObservationsTimestamp (single slot)
 *
 * Usage:
 *   npx hardhat run scripts/read-nav.ts --network sepolia
 *   FEED_VERIFIER_ADDRESS=<addr> npx hardhat run scripts/read-nav.ts --network sepolia
 *   FEED_ID=0x... npx hardhat run scripts/read-nav.ts --network sepolia
 */

// @ts-ignore
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { getDeploymentFile } from "./utils/getDeploymentFile";

const NEW_ABI = [
  "function priceOf(bytes32 feedId) view returns (int192)",
  "function timestampOf(bytes32 feedId) view returns (uint32)",
  "function lastFeedId() view returns (bytes32)",
];

const OLD_ABI = [
  "function lastDecodedPrice() view returns (int192)",
  "function lastObservationsTimestamp() view returns (uint32)",
  "function lastFeedId() view returns (bytes32)",
];

async function main() {
  const net = network.name;
  console.log(`\n📊 NAV Oracle Reader`);
  console.log("=".repeat(50));
  console.log(`Network: ${net}`);

  // ── 1. Resolve FeedVerifier address ──────────────────────────────────────
  let feedVerifierAddress = process.env.FEED_VERIFIER_ADDRESS;
  if (!feedVerifierAddress) {
    const hubDeployFile = path.join(
      __dirname,
      `../../chainlink-hub/deployment_feed_verifier_${net}.json`
    );
    if (fs.existsSync(hubDeployFile)) {
      feedVerifierAddress = JSON.parse(fs.readFileSync(hubDeployFile, "utf8")).feedVerifier;
    } else {
      throw new Error(
        "FEED_VERIFIER_ADDRESS not set and no chainlink-hub deployment file found.\n" +
        `Expected: chainlink-hub/deployment_feed_verifier_${net}.json`
      );
    }
  }
  console.log(`FeedVerifier: ${feedVerifierAddress}`);

  // ── 2. Resolve vault addresses ────────────────────────────────────────────
  const deployFile = getDeploymentFile(net);
  const deployment = JSON.parse(fs.readFileSync(path.join(__dirname, "../", deployFile), "utf8"));
  const contracts = deployment.contracts ?? deployment;
  console.log(`StakingVault: ${contracts.stakingVault}`);
  console.log(`YieldVault:   ${contracts.yieldVault}`);

  // ── 3. Detect contract version and read NAV ───────────────────────────────
  // Try new interface first (priceOf/timestampOf), fall back to old
  let price: bigint;
  let ts: number;
  let feedId: string;
  let isNewVersion = false;

  const feedIdOverride = process.env.FEED_ID;

  try {
    const fv = await ethers.getContractAt(NEW_ABI, feedVerifierAddress!);
    feedId = feedIdOverride ?? await fv.lastFeedId();
    if (feedId === ethers.ZeroHash) {
      throw new Error("No feed stored yet");
    }
    price = await fv.priceOf(feedId);
    ts = Number(await fv.timestampOf(feedId));
    isNewVersion = true;
  } catch {
    // Fall back to old interface
    const fv = await ethers.getContractAt(OLD_ABI, feedVerifierAddress!);
    feedId = await fv.lastFeedId();
    price = await fv.lastDecodedPrice();
    ts = Number(await fv.lastObservationsTimestamp());
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - ts;
  const ageMinutes = Math.floor(ageSeconds / 60);
  const ageHours   = Math.floor(ageMinutes / 60);
  const stale      = ageSeconds > 3600;

  console.log(`\n🔗 Chainlink Verified NAV ${isNewVersion ? "(new interface)" : "(legacy interface)"}`);
  console.log(`  Feed ID:               ${feedId}`);
  console.log(`  Exchange Rate (raw):   ${price.toString()}`);
  console.log(`  Exchange Rate (human): ${(Number(price) / 1e18).toFixed(8)} wYLDS per PRIME`);
  console.log(
    `  Last Updated:          ${
      ts > 0
        ? `${new Date(ts * 1000).toISOString()}  (${ageHours}h ${ageMinutes % 60}m ago)  ${stale ? "⚠️  STALE" : "✅ fresh"}`
        : "⚠️  Never updated — run verifyReport first"
    }`
  );

  if (price === 0n) {
    console.log("\n⚠️  Price is 0. Run test-feed-verifier.ts (MODE=publish) to push a verified report.");
    return;
  }

  // ── 4. StakingVault state ─────────────────────────────────────────────────
  const vault = await ethers.getContractAt("StakingVault", contracts.stakingVault);
  const totalAssets = await vault.totalAssets();
  const totalSupply = await vault.totalSupply();
  const decimals = 6; // wYLDS and PRIME are 6 decimals

  console.log(`\n🏦 StakingVault State`);
  console.log(`  totalAssets (wYLDS): ${ethers.formatUnits(totalAssets, decimals)}`);
  console.log(`  totalSupply (PRIME): ${ethers.formatUnits(totalSupply, decimals)}`);

  // ── 5. NAV-adjusted simulation ────────────────────────────────────────────
  const navRate = Number(price) / 1e18;
  const example = 1000;
  console.log(`\n💱 At NAV = ${navRate.toFixed(6)} wYLDS/PRIME`);
  console.log(`  Deposit ${example} wYLDS  → mints  ${(example / navRate).toFixed(6)} PRIME`);
  console.log(`  Redeem  ${example} PRIME  → returns ${(example * navRate).toFixed(6)} wYLDS`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

