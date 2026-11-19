/**
 * Fetch the latest signed Chainlink Data Streams report for a feedId and
 * print its `fullReport` hex to stdout. Plain node/ts-node script — no
 * hardhat dependency — so it can be used standalone by shell loops (e.g.
 * keep-fuji-feed-fresh.sh) without paying hardhat's startup cost per call.
 *
 * Usage:
 *   CHAINLINK_CLIENT_ID=<id> CHAINLINK_CLIENT_SECRET=<secret> \
 *     npx ts-node scripts/ops/fetch-report.ts [feedId]
 *
 * feedId defaults to the PRIME redemption-rate feed used across all networks.
 */
import * as crypto from "crypto";

const FEED_ID =
  process.argv[2] ||
  process.env.FEED_ID ||
  "0x000700f43b35146a1cb16373ac6225ad597535e928e6dc4d179c3b4225f2b6d3";

const API_BASE =
  process.env.CHAINLINK_API_URL || "https://api.testnet-dataengine.chain.link";

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

async function main() {
  const clientId = process.env.CHAINLINK_CLIENT_ID;
  const clientSecret = process.env.CHAINLINK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("CHAINLINK_CLIENT_ID and CHAINLINK_CLIENT_SECRET are required.");
  }

  const urlPath = `/api/v1/reports/latest?feedID=${FEED_ID}`;
  const headers = buildHeaders("GET", urlPath, clientId, clientSecret);
  const response = await fetch(`${API_BASE}${urlPath}`, { headers });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as any;
  process.stdout.write(data.report.fullReport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
