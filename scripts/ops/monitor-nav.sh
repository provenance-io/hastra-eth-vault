#!/bin/bash
#
# Prints the current NAV and last-feed-update age for a StakingVault, reading
# straight from the vault + its configured FeedVerifier (StakingVault.sol's
# getVerifiedNav()/navFeedId()/navOracle(), FeedVerifier's priceOf/timestampOf).
#
# Usage:
#   MAINNET_RPC_URL=https://... ./scripts/ops/monitor-nav.sh
#
# Env vars:
#   RPC              - RPC URL. Falls back to $MAINNET_RPC_URL. Required.
#   STAKING_VAULT     - Vault proxy to check. Default: AUTO StakingVault mainnet
#                       (0x997E2Efbce91D170B00EA402e35a66C887EE1da9).
#   STALE_AFTER_SECS  - Warn if the feed is older than this. Default: 3600 (1h).
#
# Requires: cast (foundry) on PATH.

set -euo pipefail

RPC="${RPC:-${MAINNET_RPC_URL:-}}"
STAKING_VAULT="${STAKING_VAULT:-0x997E2Efbce91D170B00EA402e35a66C887EE1da9}"
STALE_AFTER_SECS="${STALE_AFTER_SECS:-3600}"

command -v cast >/dev/null 2>&1 || { echo "❌ cast (foundry) not found on PATH"; exit 1; }
: "${RPC:?RPC required (env var, or MAINNET_RPC_URL)}"

FEED=$(cast call "$STAKING_VAULT" "navFeedId()(bytes32)" --rpc-url "$RPC")
ORACLE=$(cast call "$STAKING_VAULT" "navOracle()(address)" --rpc-url "$RPC")
PRICE_RAW=$(cast call "$ORACLE" "priceOf(bytes32)(int192)" "$FEED" --rpc-url "$RPC" | awk '{print $1}')
TS_RAW=$(cast call "$ORACLE" "timestampOf(bytes32)(uint32)" "$FEED" --rpc-url "$RPC" | awk '{print $1}')

NOW=$(date -u +%s)
AGE=$(( NOW - TS_RAW ))
NAV=$(awk -v p="$PRICE_RAW" 'BEGIN { printf "%.6f", p/1e18 }')
UPDATED_AT=$(date -u -r "$TS_RAW" "+%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "@$TS_RAW" "+%Y-%m-%dT%H:%M:%SZ")
NOW_STR=$(date -u -r "$NOW" "+%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "@$NOW" "+%Y-%m-%dT%H:%M:%SZ")

echo "[$NOW_STR] vault=$STAKING_VAULT nav=$NAV last_update=$UPDATED_AT age=${AGE}s"

if [ "$AGE" -gt "$STALE_AFTER_SECS" ]; then
  echo "⚠️  STALE: feed hasn't updated in ${AGE}s (threshold ${STALE_AFTER_SECS}s)"
  exit 2
fi
