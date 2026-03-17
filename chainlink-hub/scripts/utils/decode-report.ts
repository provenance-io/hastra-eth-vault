// @ts-ignore
import { ethers } from "hardhat";
import * as crypto from "crypto";

/**
 * Fetch and decode a Chainlink Data Streams report (Schema v7).
 * Prints all fields in human-readable form. No on-chain tx.
 *
 * Usage:
 *   CHAINLINK_CLIENT_ID=<id> \
 *   CHAINLINK_CLIENT_SECRET=<secret> \
 *   npx hardhat run scripts/utils/decode-report.ts --network sepolia
 *
 * Or decode a raw hex blob directly:
 *   FULL_REPORT=0x... \
 *   npx hardhat run scripts/utils/decode-report.ts --network sepolia
 */

// this is the sepolia testnet feed_id
const FEED_ID =
  process.env.FEED_ID ||
  "0x000700f43b35146a1cb16373ac6225ad597535e928e6dc4d179c3b4225f2b6d3";

const API_BASE =
  process.env.CHAINLINK_API_URL || "https://api.testnet-dataengine.chain.link";

// ── HMAC auth ─────────────────────────────────────────────────────────────────

function buildHeaders(method: string, urlPath: string, clientId: string, clientSecret: string) {
  const timestamp = Date.now().toString();
  const bodyHash = crypto.createHash("sha256").update("").digest("hex");
  const stringToSign = `${method.toUpperCase()} ${urlPath} ${bodyHash} ${clientId} ${timestamp}`;
  const signature = crypto.createHmac("sha256", clientSecret).update(stringToSign).digest("hex");
  return {
    Authorization: clientId,
    "X-Authorization-Timestamp": timestamp,
    "X-Authorization-Signature-SHA256": signature,
  };
}

// ── Decoder ───────────────────────────────────────────────────────────────────

function decodeReport(fullReport: string) {
  // Strip 0x
  const data = Buffer.from(fullReport.replace(/^0x/, ""), "hex");

  // Outer: abi.decode(fullReport, (bytes32[3], bytes))
  // words 0-2: context[0..2], word 3: offset to reportData bytes
  const reportDataOffset = Number(BigInt("0x" + data.slice(96, 128).toString("hex")));
  const reportDataLen    = Number(BigInt("0x" + data.slice(reportDataOffset, reportDataOffset + 32).toString("hex")));
  const rd = data.slice(reportDataOffset + 32, reportDataOffset + 32 + reportDataLen);

  const version = (rd[0] << 8) | rd[1];

  // Each ABI field is padded to 32 bytes
  const word  = (i: number) => BigInt("0x" + rd.slice(i * 32, (i + 1) * 32).toString("hex"));
  const sword = (i: number) => { const v = word(i); return v >= (1n << 255n) ? v - (1n << 256n) : v; };

  const feedId    = "0x" + rd.slice(0, 32).toString("hex");
  const validFrom = Number(word(1));
  const obsTs     = Number(word(2));
  const nativeFee = word(3);
  const linkFee   = word(4);
  const expiresAt = Number(word(5));
  const price     = sword(6);

  return { version, feedId, validFrom, obsTs, nativeFee, linkFee, expiresAt, price };
}

function formatTs(ts: number) {
  return `${ts}  (${new Date(ts * 1000).toISOString()})`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let fullReport = process.env.FULL_REPORT;

  if (!fullReport) {
    const clientId = process.env.CHAINLINK_CLIENT_ID;
    const clientSecret = process.env.CHAINLINK_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error(
        "Set CHAINLINK_CLIENT_ID + CHAINLINK_CLIENT_SECRET to fetch, or FULL_REPORT=0x... to decode directly."
      );
    }

    console.log(`\n📡 Fetching latest report for feed ${FEED_ID}...`);
    const urlPath = `/api/v1/reports/latest?feedID=${FEED_ID}`;
    const headers = buildHeaders("GET", urlPath, clientId, clientSecret);
    const response = await fetch(`${API_BASE}${urlPath}`, { headers });
    if (!response.ok) throw new Error(`API error ${response.status}: ${await response.text()}`);
    const data = (await response.json()) as any;
    fullReport = data.report.fullReport;
    console.log(`✅ Report fetched\n`);
  } else {
    console.log(`\n📋 Decoding provided FULL_REPORT...\n`);
  }

  const r = decodeReport(fullReport!);

  console.log("═".repeat(55));
  console.log(" Chainlink Data Streams Report");
  console.log("═".repeat(55));
  console.log(`Schema version:        v${r.version} (0x${r.version.toString(16).padStart(4, "0")})`);
  console.log(`feedId:                ${r.feedId}`);
  console.log(`validFromTimestamp:    ${formatTs(r.validFrom)}`);
  console.log(`observationsTimestamp: ${formatTs(r.obsTs)}`);
  console.log(`expiresAt:             ${formatTs(r.expiresAt)}`);
  console.log(`nativeFee:             ${r.nativeFee.toString()} (${(Number(r.nativeFee) / 1e18).toFixed(8)} ETH)`);
  console.log(`linkFee:               ${r.linkFee.toString()} (${(Number(r.linkFee) / 1e18).toFixed(8)} LINK)`);
  console.log(`price (raw int192):    ${r.price.toString()}`);
  console.log(`price (1e18 scaled):   ${(Number(r.price) / 1e18).toFixed(8)}  ← NAV per share`);
  console.log("═".repeat(55));
  console.log(`\nfullReport hex:\n${fullReport}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
