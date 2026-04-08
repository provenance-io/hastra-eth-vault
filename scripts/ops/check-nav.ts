// @ts-ignore
import { ethers, network } from "hardhat";

/**
 * Snapshot the current state of HastraNavEngine and FeedVerifier.
 * Read-only — safe to run at any time.
 *
 * Usage (run from repo root):
 *   npx hardhat run scripts/ops/check-nav.ts --network sepolia
 *
 * Optional env vars:
 *   NAV_ENGINE=<proxy>     — defaults to deployment_nav_testnet.json
 *   FEED_VERIFIER=<proxy>  — defaults to chainlink-hub/deployment_feed_verifier_<network>.json
 *   FEED_ID=<bytes32>      — defaults to allowedFeedId on FeedVerifier
 */

import * as fs from "fs";
import * as path from "path";

function loadAddress(envVar: string, file: string, key: string): string | undefined {
  if (process.env[envVar]) return process.env[envVar];
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return raw?.contracts?.[key] ?? raw?.[key];
  } catch { return undefined; }
}

async function main() {
  const navEngineAddr = loadAddress(
    "NAV_ENGINE",
    path.join(__dirname, "../../deployment_nav_testnet.json"),
    "navEngine"
  );
  const feedVerifierAddr = loadAddress(
    "FEED_VERIFIER",
    path.join(__dirname, `../../chainlink-hub/deployment_feed_verifier_${network.name}.json`),
    "feedVerifier"
  );

  if (!navEngineAddr)   throw new Error("NAV_ENGINE env var required (or deploy deployment_nav_testnet.json)");
  if (!feedVerifierAddr) throw new Error("FEED_VERIFIER env var required (or deploy deployment_feed_verifier_<network>.json)");

  const now = Math.floor(Date.now() / 1000);

  console.log(`\n${"═".repeat(62)}`);
  console.log(`  NAV Snapshot  —  ${network.name}  —  ${new Date().toISOString()}`);
  console.log(`${"═".repeat(62)}\n`);

  // ── HastraNavEngine ───────────────────────────────────────────
  const navEngine = await ethers.getContractAt("HastraNavEngine", navEngineAddr);

  const rate          = await navEngine.getRate();
  const minRate       = await navEngine.getMinRate();
  const maxRate       = await navEngine.getMaxRate();
  const maxDiffPct    = await navEngine.getMaxDifferencePercent();
  const updater       = await navEngine.getUpdater();
  const latestSupply  = await navEngine.getLatestTotalSupply();
  const latestTVL     = await navEngine.getLatestTVL();
  const lastUpdated   = await navEngine.getLatestUpdateTime();
  const paused        = await navEngine.paused();

  const lastUpdatedSec = Number(lastUpdated);
  const ageSeconds     = lastUpdatedSec > 0 ? now - lastUpdatedSec : null;
  const ageStr         = ageSeconds !== null
    ? `${Math.floor(ageSeconds / 3600)}h ${Math.floor((ageSeconds % 3600) / 60)}m ${ageSeconds % 60}s ago`
    : "never updated";

  console.log(`HastraNavEngine:  ${navEngineAddr}`);
  console.log(`  paused:         ${paused}`);
  console.log(`  rate (NAV):     ${ethers.formatEther(rate)}   (raw: ${rate})`);
  console.log(`  minRate:        ${ethers.formatEther(minRate)}`);
  console.log(`  maxRate:        ${ethers.formatEther(maxRate)}`);
  console.log(`  maxDiffPercent: ${(Number(maxDiffPct) / 1e18 * 100).toFixed(2)}%`);
  console.log(`  updater:        ${updater}`);
  console.log(`  lastUpdated:    ${lastUpdatedSec > 0 ? new Date(lastUpdatedSec * 1000).toISOString() : "never"}  (${ageStr})`);
  console.log(`  totalSupply:    ${ethers.formatUnits(latestSupply, 6)} PRIME`);
  console.log(`  totalTVL:       ${ethers.formatUnits(latestTVL, 6)} wYLDS`);

  // ── FeedVerifier ─────────────────────────────────────────────
  console.log(`\nFeedVerifier:     ${feedVerifierAddr}`);

  const feedVerifier = await ethers.getContractAt([
    "function allowedFeedId() external view returns (bytes32)",
    "function priceByFeed(bytes32) external view returns (int192)",
    "function timestampByFeed(bytes32) external view returns (uint32)",
    "function defaultMaxStaleness() external view returns (uint32)",
    "function maxStalenessByFeed(bytes32) external view returns (uint32)",
    "function paused() external view returns (bool)",
  ], feedVerifierAddr);

  const feedId          = process.env.FEED_ID || await feedVerifier.allowedFeedId();
  const defaultStaleness = await feedVerifier.defaultMaxStaleness();
  const perFeedStaleness = await feedVerifier.maxStalenessByFeed(feedId);
  const effectiveStaleness = perFeedStaleness > 0n ? perFeedStaleness : defaultStaleness;

  const priceRaw    = await feedVerifier.priceByFeed(feedId);
  const timestamp   = await feedVerifier.timestampByFeed(feedId);
  const fvPaused    = await feedVerifier.paused();

  const reportAge   = timestamp > 0 ? now - Number(timestamp) : null;
  const reportAgeStr = reportAge !== null
    ? `${Math.floor(reportAge / 3600)}h ${Math.floor((reportAge % 3600) / 60)}m ${reportAge % 60}s ago`
    : "no report yet";
  const isStale     = reportAge !== null && reportAge > Number(effectiveStaleness);

  console.log(`  paused:            ${fvPaused}`);
  console.log(`  feedId:            ${feedId}`);
  console.log(`  price (raw int192):${priceRaw}`);
  console.log(`  price (formatted): ${priceRaw > 0n ? ethers.formatEther(priceRaw) : "n/a"}`);
  console.log(`  report timestamp:  ${timestamp > 0 ? new Date(Number(timestamp) * 1000).toISOString() : "none"}  (${reportAgeStr})`);
  console.log(`  defaultStaleness:  ${defaultStaleness}s (${Number(defaultStaleness) / 3600}h)`);
  console.log(`  perFeedStaleness:  ${perFeedStaleness > 0n ? `${perFeedStaleness}s (${Number(perFeedStaleness) / 3600}h)` : "not set (uses default)"}`);
  console.log(`  effectiveStaleness:${effectiveStaleness}s`);
  console.log(`  stale?:            ${isStale ? "⚠️  YES — priceOf() will revert" : "✅ no"}`);

  // ── Consistency check ─────────────────────────────────────────
  console.log(`\n${"─".repeat(62)}`);
  if (priceRaw > 0n && rate > 0n) {
    const navRate  = BigInt(rate);
    const feedRate = BigInt(priceRaw);
    const match    = navRate === feedRate;
    console.log(`  NavEngine rate == FeedVerifier price: ${match ? "✅ match" : "⚠️  MISMATCH"}`);
    if (!match) {
      console.log(`    NavEngine:    ${ethers.formatEther(navRate)}`);
      console.log(`    FeedVerifier: ${ethers.formatEther(feedRate)}`);
    }
  }
  console.log(`${"═".repeat(62)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
