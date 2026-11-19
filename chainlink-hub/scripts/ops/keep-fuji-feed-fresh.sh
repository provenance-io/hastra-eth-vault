#!/bin/bash
# Keep the Fuji PRIME feed fresh by re-publishing a signed Chainlink Data
# Streams report on a fixed interval, well under FeedVerifier's
# defaultMaxStaleness (3600s / 1hr on Fuji). Prevents getVerifiedNav() /
# priceOf() from reverting with StalePrice between manual test runs.
#
# Uses `cast send --legacy --gas-limit` instead of a hardhat script because
# hardhat's automatic gas estimation intermittently reverts against Fuji's
# public RPC (observed this session) even though the underlying tx is valid.
#
# Usage:
#   ./scripts/ops/keep-fuji-feed-fresh.sh            # runs forever, 25 min interval
#   INTERVAL_SECONDS=600 ./scripts/ops/keep-fuji-feed-fresh.sh
#
# Stop with Ctrl-C (foreground) or `kill <pid>` (background/detached).
set -euo pipefail
cd "$(dirname "$0")/../.."

set -a
source .env
set +a

PRIVATE_KEY=$(grep -E "^[[:space:]]*PRIVATE_KEY=" .env | tail -1 | sed 's/^[[:space:]]*PRIVATE_KEY=//')
FEED_VERIFIER="${FEED_VERIFIER_ADDRESS:-0x249bf835053FB1782F6751f8e478bf3d26d7786A}"
RPC_URL="${FUJI_RPC_URL:-https://api.avax-test.network/ext/bc/C/rpc}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-1500}"  # 25 min, safely under the 1hr staleness limit

echo "Keeping FeedVerifier fresh: $FEED_VERIFIER on Fuji (interval ${INTERVAL_SECONDS}s)"

while true; do
  echo "[$(date -u +%FT%TZ)] Fetching fresh report..."
  REPORT=$(npx ts-node scripts/ops/fetch-report.ts)

  echo "[$(date -u +%FT%TZ)] Publishing verifyReport()..."
  cast send "$FEED_VERIFIER" "verifyReport(bytes)" "$REPORT" \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --gas-limit 500000 \
    --legacy

  echo "[$(date -u +%FT%TZ)] Published. Sleeping ${INTERVAL_SECONDS}s..."
  sleep "$INTERVAL_SECONDS"
done
