// @ts-ignore
import { ethers, network } from "hardhat";
import {
  printSafeContext,
  resolveProxyAddress,
  resolveSafeAddress,
} from "./safe-helpers";

/**
 * Generate Safe calldata for setAllowedFeedId() on FeedVerifier.
 * Requires DEFAULT_ADMIN_ROLE — call through Safe.
 *
 * Usage (run from chainlink-hub/):
 *   FEED_ID=<bytes32> SAFE_ADDRESS=<safe> \
 *     npx hardhat run scripts/admin/set-feed-id.ts --network sepolia
 *
 * Examples:
 *   # Rotate to mainnet feed ID
 *   FEED_ID=0x000700f43b35146a1cb16373ac6225ad597535e928e6dc4d179c3b4225f2b6d3 \
 *   SAFE_ADDRESS=0x4E79e5BB88f0596446c615B86D3780A11DB1a2f4 \
 *     npx hardhat run scripts/admin/set-feed-id.ts --network mainnet
 *
 *   # Clear enforcement (accept any feedId)
 *   FEED_ID=0x0000000000000000000000000000000000000000000000000000000000000000 \
 *     npx hardhat run scripts/admin/set-feed-id.ts --network sepolia
 *
 * Optional:
 *   PROXY=<feed-verifier-proxy>  — defaults to deployment_feed_verifier_<network>.json
 */
async function main() {
  const proxyAddress = resolveProxyAddress("FeedVerifier");
  const safeAddress  = resolveSafeAddress();
  const feedId       = process.env.FEED_ID;

  if (!feedId) throw new Error("FEED_ID env var required (bytes32, e.g. 0x000700f4...)");

  if (!/^0x[0-9a-fA-F]{64}$/.test(feedId)) {
    throw new Error(`FEED_ID must be a 32-byte hex string (66 chars incl 0x), got: ${feedId}`);
  }

  console.log(`Network:       ${network.name}`);
  console.log(`FeedVerifier:  ${proxyAddress}`);
  console.log(`New Feed ID:   ${feedId}`);
  printSafeContext(safeAddress);

  const feedVerifier = await ethers.getContractAt("FeedVerifier", proxyAddress);
  const current = await feedVerifier.allowedFeedId();
  console.log(`\nCurrent allowedFeedId: ${current}`);
  console.log(`New allowedFeedId:     ${feedId}`);

  if (current.toLowerCase() === feedId.toLowerCase()) {
    console.log("\n⚠️  Feed ID is already set to this value — no change needed.");
    return;
  }

  const iface = new ethers.Interface([
    "function setAllowedFeedId(bytes32 feedId)"
  ]);
  const calldata = iface.encodeFunctionData("setAllowedFeedId", [feedId]);

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
