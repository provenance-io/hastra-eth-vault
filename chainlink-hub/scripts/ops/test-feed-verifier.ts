// @ts-ignore
import { ethers, network } from "hardhat";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

/**
 * Fetch and optionally publish a Chainlink Data Streams report.
 *
 * Modes (set via MODE env var):
 *   read    — fetch report from API and print contents. No on-chain tx. (default)
 *   publish — fetch report, call verifyReport() on FeedVerifier, read back price.
 *
 * Usage:
 *   # Read only (no gas, no wallet needed):
 *   MODE=read \
 *   CHAINLINK_CLIENT_ID=<id> \
 *   CHAINLINK_CLIENT_SECRET=<secret> \
 *   npx hardhat run scripts/ops/test-feed-verifier.ts --network sepolia
 *
 *   # Publish on-chain:
 *   MODE=publish \
 *   FEED_VERIFIER_ADDRESS=<addr> \
 *   CHAINLINK_CLIENT_ID=<id> \
 *   CHAINLINK_CLIENT_SECRET=<secret> \
 *   npx hardhat run scripts/ops/test-feed-verifier.ts --network sepolia
 */

const FEED_ID =
  process.env.FEED_ID ||
  "0x000700f43b35146a1cb16373ac6225ad597535e928e6dc4d179c3b4225f2b6d3";

const API_BASE =
  process.env.CHAINLINK_API_URL || "https://api.testnet-dataengine.chain.link";

const MODE = (process.env.MODE || "read").toLowerCase();

// ── HMAC auth ─────────────────────────────────────────────────────────────────

function buildHeaders(
  method: string,
  urlPath: string,
  clientId: string,
  clientSecret: string
): Record<string, string> {
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

// ── Fetch report from Chainlink API ──────────────────────────────────────────

async function fetchReport(clientId: string, clientSecret: string) {
  console.log(`\n📡 Fetching latest report from Chainlink API...`);
  const urlPath = `/api/v1/reports/latest?feedID=${FEED_ID}`;
  const headers = buildHeaders("GET", urlPath, clientId, clientSecret);
  const response = await fetch(`${API_BASE}${urlPath}`, { headers });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as any;
  return data.report;
}

// ── Report body decoder ───────────────────────────────────────────────────────

/**
 * Extract expiresAt from the ABI-encoded fullReport binary.
 *
 * fullReport layout:
 *   bytes32[3] reportContext  (96 bytes, fixed)
 *   bytes      reportBlob     (dynamic, offset-encoded)
 *   bytes32[]  rawRs
 *   bytes32[]  rawSs
 *   bytes32    rawVs
 *
 * reportBlob for the v3 NAV schema is ABI-encoded as:
 *   (bytes32 feedId, uint32 validFromTimestamp, uint32 observationsTimestamp,
 *    uint192 nativeFee, uint192 linkFee, uint32 expiresAt, int192 benchmarkPrice)
 */
function decodeExpiresAt(fullReport: string): number | null {
  try {
    const bytes = ethers.getBytes(fullReport);

    // The head at bytes 96-127 contains the ABSOLUTE offset (from byte 0) to the
    // reportBlob tail. Do NOT slice the context off before reading this offset.
    const blobOffset = Number(ethers.toBigInt(bytes.slice(96, 128)));
    const blobLen    = Number(ethers.toBigInt(bytes.slice(blobOffset, blobOffset + 32)));
    const blobData   = bytes.slice(blobOffset + 32, blobOffset + 32 + blobLen);

    // Report blob (v3 NAV schema) fields, each ABI-padded to 32 bytes:
    //   [0] bytes32  feedId
    //   [1] uint32   validFromTimestamp
    //   [2] uint32   observationsTimestamp
    //   [3] uint192  nativeFee
    //   [4] uint192  linkFee
    //   [5] uint32   expiresAt          ← index 5
    //   [6] int192   benchmarkPrice
    return Number(ethers.toBigInt(blobData.slice(5 * 32, 6 * 32)));
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const net = network.name;
  console.log(`\n📊 Chainlink Feed Report`);
  console.log("=".repeat(50));
  console.log(`Network:  ${net}`);
  console.log(`Feed ID:  ${FEED_ID}`);
  console.log(`Mode:     ${MODE}`);

  const clientId = process.env.CHAINLINK_CLIENT_ID;
  const clientSecret = process.env.CHAINLINK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("CHAINLINK_CLIENT_ID and CHAINLINK_CLIENT_SECRET are required.");
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const report = await fetchReport(clientId, clientSecret);

  const expiresAt = report.expiresAt ?? decodeExpiresAt(report.fullReport);
  const expiresAtStr = expiresAt != null
    ? `${expiresAt} (${new Date(expiresAt * 1000).toISOString()})`
    : "n/a";

  console.log(`\n✅ Report received`);
  console.log(`   feedID:                ${report.feedID}`);
  console.log(`   observationsTimestamp: ${report.observationsTimestamp}`);
  console.log(`   validFromTimestamp:    ${report.validFromTimestamp}`);
  console.log(`   expiresAt:             ${expiresAtStr}`);
  console.log(`   fullReport:            ${report.fullReport}`);

  if (MODE === "read") {
    console.log(`\n✅ Read complete. Use MODE=publish to submit on-chain.`);
    return;
  }

  // ── Publish ───────────────────────────────────────────────────────────────
  if (MODE !== "publish") {
    throw new Error(`Unknown MODE="${MODE}". Use MODE=read or MODE=publish.`);
  }

  let contractAddress = process.env.FEED_VERIFIER_ADDRESS;
  if (!contractAddress) {
    const deployFile = path.join(__dirname, `../../deployment_feed_verifier_${net}.json`);
    if (fs.existsSync(deployFile)) {
      contractAddress = JSON.parse(fs.readFileSync(deployFile, "utf8")).feedVerifier;
    } else {
      throw new Error("FEED_VERIFIER_ADDRESS not set and no deployment file found.");
    }
  }
  console.log(`\n⛓️  Publishing to FeedVerifier: ${contractAddress}`);

  const [signer] = await ethers.getSigners();
  console.log(`   Signer: ${signer.address}`);

  const feedVerifier = await ethers.getContractAt("FeedVerifier", contractAddress!, signer);
  const priceBefore = await feedVerifier.priceOf(FEED_ID);
  console.log(`   priceOf(feedId) before: ${priceBefore.toString()}`);

  const tx = await feedVerifier.verifyReport(report.fullReport);
  console.log(`   Tx hash: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`   Block:   ${receipt!.blockNumber}`);

  const priceAfter   = await feedVerifier.priceOf(FEED_ID);
  const feedIdStored = await feedVerifier.lastFeedId();
  const tsStored     = await feedVerifier.timestampOf(FEED_ID);

  console.log(`\n📊 On-chain state:`);
  console.log(`   priceOf(feedId):           ${priceAfter.toString()}`);
  console.log(`   priceOf(feedId) (human):   ${(Number(priceAfter) / 1e18).toFixed(6)}`);
  console.log(`   lastFeedId:                ${feedIdStored}`);
  console.log(`   observationsTimestamp:     ${new Date(Number(tsStored) * 1000).toISOString()}`);

  const ok = feedIdStored.toLowerCase() === FEED_ID.toLowerCase() && priceAfter !== 0n;
  console.log(ok ? `\n✅ Publish PASSED.` : `\n❌ Publish FAILED.`);
  if (!ok) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
