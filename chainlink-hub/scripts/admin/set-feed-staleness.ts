// @ts-ignore
import { ethers, network } from "hardhat";
import {
  printSafeContext,
  resolveProxyAddress,
  resolveSafeAddress,
} from "./safe-helpers";

/**
 * Generate Safe calldata for setMaxStalenessByFeed() on FeedVerifier.
 * Requires DEFAULT_ADMIN_ROLE — call through Safe.
 *
 * Usage (run from chainlink-hub/):
 *   FEED_ID=<bytes32> MAX_STALENESS=<seconds> SAFE_ADDRESS=<safe> \
 *     npx hardhat run scripts/admin/set-feed-staleness.ts --network sepolia
 *
 * Examples:
 *   # Set Sepolia feed to 2 hours
 *   FEED_ID=0x000700f43b35146a1cb16373ac6225ad597535e928e6dc4d179c3b4225f2b6d3 \
 *   MAX_STALENESS=7200 \
 *   SAFE_ADDRESS=0x4E79e5BB88f0596446c615B86D3780A11DB1a2f4 \
 *     npx hardhat run scripts/admin/set-feed-staleness.ts --network sepolia
 *
 * Optional:
 *   PROXY=<feed-verifier-proxy>  — defaults to deployment_feed_verifier_<network>.json
 */
async function main() {
  const proxyAddress  = resolveProxyAddress("FeedVerifier");
  const safeAddress   = resolveSafeAddress();
  const feedId        = process.env.FEED_ID;
  const maxStaleness  = process.env.MAX_STALENESS;

  if (!feedId)       throw new Error("FEED_ID env var required (bytes32)");
  if (!maxStaleness) throw new Error("MAX_STALENESS env var required (seconds, e.g. 7200 for 2 hours)");

  const maxStalenessSeconds = parseInt(maxStaleness, 10);
  if (isNaN(maxStalenessSeconds) || maxStalenessSeconds <= 0) {
    throw new Error("MAX_STALENESS must be a positive integer (seconds)");
  }

  console.log(`Network:        ${network.name}`);
  console.log(`FeedVerifier:   ${proxyAddress}`);
  console.log(`Feed ID:        ${feedId}`);
  console.log(`Max staleness:  ${maxStalenessSeconds}s (${maxStalenessSeconds / 3600}h)`);
  printSafeContext(safeAddress);

  // Read current value
  const feedVerifier = await ethers.getContractAt("FeedVerifier", proxyAddress);
  const current = await feedVerifier.maxStalenessByFeed(feedId);
  const defaultStaleness = await feedVerifier.defaultMaxStaleness();
  console.log(`\nCurrent per-feed staleness: ${current}s ${current === 0n ? `(falls back to default: ${defaultStaleness}s)` : ""}`);
  console.log(`New per-feed staleness:     ${maxStalenessSeconds}s`);

  // Encode calldata
  const iface = new ethers.Interface([
    "function setMaxStalenessByFeed(bytes32 feedId, uint32 maxStaleness)"
  ]);
  const calldata = iface.encodeFunctionData("setMaxStalenessByFeed", [feedId, maxStalenessSeconds]);

  console.log(`
================================================================
SAFE TRANSACTION DETAILS
================================================================
To:       ${proxyAddress}
Value:    0
Calldata: ${calldata}
================================================================

Paste into Safe → New Transaction → Transaction Builder:
  To:      ${proxyAddress}
  Value:   0
  Data:    ${calldata}
`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
