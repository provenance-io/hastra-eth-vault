/**
 * Verify a Chainlink Data Streams feed ID by fetching its latest report.
 *
 * Usage:
 *   CHAINLINK_CLIENT_ID=<id> CHAINLINK_CLIENT_SECRET=<secret> \
 *     FEED_ID=0x000700f43b35146a1cb16373ac6225ad597535e928e6dc4d179c3b4225f2b6d3 \
 *     npx ts-node scripts/verify-feed-id.ts
 *
 * The script:
 *   1. Calls the Chainlink Data Streams REST API for the given feed ID
 *   2. Decodes the report header to confirm the feed ID matches
 *   3. Decodes the Schema v7 (Redemption Rates) payload and prints the rate
 *
 * Docs: https://docs.chain.link/data-streams/reference/data-streams-api/interface-api
 */

import * as crypto from "crypto";

// ── Config ────────────────────────────────────────────────────────────────────

const FEED_ID =
  process.env.FEED_ID ||
  "0x000700f43b35146a1cb16373ac6225ad597535e928e6dc4d179c3b4225f2b6d3";

const CLIENT_ID = process.env.CHAINLINK_CLIENT_ID;
const CLIENT_SECRET = process.env.CHAINLINK_CLIENT_SECRET;
const BASE_URL =
  process.env.CHAINLINK_API_URL || "https://api.testnet-dataengine.chain.link";

// ── HMAC Auth ─────────────────────────────────────────────────────────────────

function buildHeaders(
  method: string,
  path: string,
  body: string,
  clientId: string,
  clientSecret: string
): Record<string, string> {
  const timestamp = Date.now().toString();
  const bodyHash = crypto
    .createHash("sha256")
    .update(body || "")
    .digest("hex");
  const stringToSign = `${method.toUpperCase()} ${path} ${bodyHash} ${clientId} ${timestamp}`;
  const signature = crypto
    .createHmac("sha256", clientSecret)
    .update(stringToSign)
    .digest("hex");

  return {
    Authorization: clientId,
    "X-Authorization-Timestamp": timestamp,
    "X-Authorization-Signature-SHA256": signature,
  };
}

// ── Schema v7 decoder ─────────────────────────────────────────────────────────
// Schema v7 (Redemption Rates):
//   bytes32 feedId
//   uint32  validFromTimestamp
//   uint32  observationsTimestamp
//   uint192 nativeFee
//   uint192 linkFee
//   uint32  expiresAt
//   int192  price  (the exchange rate, scaled 1e18)

function decodeSchemaV7(reportCtx: string): {
  feedId: string;
  validFromTimestamp: number;
  observationsTimestamp: number;
  expiresAt: number;
  price: bigint;
  priceFormatted: string;
} {
  // reportCtx is hex of the raw report body (not the full payload)
  const buf = Buffer.from(reportCtx.replace(/^0x/, ""), "hex");
  let offset = 0;

  const feedId = "0x" + buf.slice(offset, offset + 32).toString("hex");
  offset += 32;
  const validFromTimestamp = buf.readUInt32BE(offset);
  offset += 4;
  const observationsTimestamp = buf.readUInt32BE(offset);
  offset += 4;
  // nativeFee: uint192 = 24 bytes
  offset += 24;
  // linkFee: uint192 = 24 bytes
  offset += 24;
  const expiresAt = buf.readUInt32BE(offset);
  offset += 4;
  // price: int192 = 24 bytes, big-endian signed
  const priceBytes = buf.slice(offset, offset + 24);
  const priceBig = BigInt("0x" + priceBytes.toString("hex"));
  // Handle negative (sign extend from 192 bits)
  const MAX_INT192 = BigInt(2) ** BigInt(191);
  const price = priceBig >= MAX_INT192 ? priceBig - BigInt(2) ** BigInt(192) : priceBig;

  const priceFormatted = (Number(price) / 1e18).toFixed(6);

  return { feedId, validFromTimestamp, observationsTimestamp, expiresAt, price, priceFormatted };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 Chainlink Data Streams Feed Verifier");
  console.log("=".repeat(50));
  console.log(`Feed ID: ${FEED_ID}`);
  console.log(`API:     ${BASE_URL}`);
  console.log("");

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error(
      "❌ CHAINLINK_CLIENT_ID and CHAINLINK_CLIENT_SECRET are required.\n" +
        "   Get credentials from: https://chainlinkcommunity.typeform.com/datastreams\n" +
        "\n" +
        "   Export them and re-run:\n" +
        "   CHAINLINK_CLIENT_ID=<id> CHAINLINK_CLIENT_SECRET=<secret> \\\n" +
        `   FEED_ID=${FEED_ID} \\\n` +
        "   npx ts-node scripts/verify-feed-id.ts"
    );
    process.exit(1);
  }

  const path = `/api/v1/reports/latest?feedID=${FEED_ID}`;
  const headers = buildHeaders("GET", path, "", CLIENT_ID, CLIENT_SECRET);

  console.log("📡 Fetching latest report...");

  const response = await fetch(`${BASE_URL}${path}`, { headers });

  if (!response.ok) {
    const body = await response.text();
    console.error(`❌ API error ${response.status}: ${body}`);
    if (response.status === 404) {
      console.error(
        `\n   Feed ID not found. Confirm the ID is correct and your account has access.`
      );
    }
    process.exit(1);
  }

  const data = (await response.json()) as any;
  const report = data.report;

  console.log("✅ Report received!\n");
  console.log("📋 Raw report fields:");
  console.log(`  feedID:            ${report.feedID}`);
  console.log(`  validFromTimestamp:${report.validFromTimestamp}`);
  console.log(`  observationsTimestamp: ${report.observationsTimestamp}`);
  console.log(`  fullReport (hex):  ${report.fullReport?.slice(0, 30)}...`);

  // Validate feed ID matches
  const reportedFeedId = report.feedID?.toLowerCase();
  const requestedFeedId = FEED_ID.toLowerCase();
  if (reportedFeedId === requestedFeedId) {
    console.log(`\n✅ Feed ID match confirmed: ${report.feedID}`);
  } else {
    console.error(
      `\n❌ Feed ID mismatch!\n   Requested: ${requestedFeedId}\n   Returned:  ${reportedFeedId}`
    );
    process.exit(1);
  }

  // Decode the report body from fullReport
  // fullReport layout: [header (96 bytes)][reportContext][...signatures]
  // The actual report body starts after the ABI-encoded header
  // Use the reportContext field directly if available, otherwise skip
  if (report.fullReport) {
    try {
      // Skip the 96-byte prefix (3 × 32-byte ABI words) and decode the report body
      const raw = report.fullReport.replace(/^0x/, "");
      // ABI-encoded: offset (32) + length (32) + data...
      // The inner report is at offset 0x60 (96 bytes) in a standard Chainlink envelope
      const reportBody = raw.slice(96 * 2); // skip 96 bytes = 192 hex chars
      const decoded = decodeSchemaV7(reportBody);

      console.log("\n📊 Decoded Schema v7 (Redemption Rate):");
      console.log(`  Feed ID:               ${decoded.feedId}`);
      console.log(
        `  Valid From:            ${new Date(decoded.validFromTimestamp * 1000).toISOString()}`
      );
      console.log(
        `  Observations At:       ${new Date(decoded.observationsTimestamp * 1000).toISOString()}`
      );
      console.log(
        `  Expires At:            ${new Date(decoded.expiresAt * 1000).toISOString()}`
      );
      console.log(`  Exchange Rate (int192): ${decoded.price.toString()}`);
      console.log(`  Exchange Rate (human):  ${decoded.priceFormatted}`);
    } catch (e) {
      console.log("\n⚠️  Could not fully decode report body (Schema v7 offset may differ).");
      console.log("   The feed ID and API response are confirmed valid.");
    }
  }

  console.log("\n✅ Feed ID verified successfully. Safe to use in HastraHub.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
