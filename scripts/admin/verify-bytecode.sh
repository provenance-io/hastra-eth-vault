#!/bin/bash
#
# Verifies that a deployed contract's on-chain runtime bytecode matches a
# recompile of a specific git commit, from a FRESH clone (not this working
# copy) — see local_docs/remediations_deploy.md §12.
#
# This is independent of Etherscan's own "verified" badge: Etherscan verify
# only proves "bytecode compiles from whatever source was uploaded to it".
# This script proves "on-chain bytecode == a byte-for-byte recompile of
# commit $SHA, using `yarn install --frozen-lockfile` so the exact locked
# dependency versions in yarn.lock are used (this repo's package.json pins
# "packageManager": "yarn@1.22.19" and .gitignore excludes package-lock.json
# — yarn.lock is the only lockfile actually committed to git)".
#
# Usage:
#   TIMELOCK=0x4Acd2c83616D42b87788ECeF4039e7355Dd23a39 \
#   SHA=15fc053432e8ce911362a885dc094e0f657df442 \
#   RPC=$MAINNET_RPC_URL \
#     ./scripts/admin/verify-bytecode.sh
#
# Env vars:
#   TIMELOCK       - Deployed contract address to check. Required (or set
#                    NETWORK and let it fall back to deployment_timelock_<NETWORK>.json).
#   SHA            - Git commit to recompile and compare against. Falls back
#                    to deployment_timelock_<NETWORK>.json's "gitCommit" field.
#   RPC            - RPC URL to fetch on-chain bytecode from. Falls back to
#                    $MAINNET_RPC_URL / $SEPOLIA_RPC_URL based on NETWORK.
#   NETWORK        - "mainnet" (default) or "sepolia" — only used for the
#                    TIMELOCK/SHA/RPC fallbacks above.
#   REPO_URL       - Git remote to clone. Default: this repo's own origin.
#   CONTRACT_PATH  - Contract source path relative to contracts/. Default:
#                    utils/HastraTimelockController.sol
#   CONTRACT_NAME  - Contract name (must match the .sol file's contract).
#                    Default: HastraTimelockController
#   KEEP_CLONE     - If "true", don't delete the temporary clone afterward.
#
# Requires: git, yarn, npx, jq, cast (foundry) on PATH.

set -euo pipefail
cd "$(dirname "$0")/../.."

NETWORK="${NETWORK:-mainnet}"
REPO_URL="${REPO_URL:-git@github.com:provenance-io/hastra-eth-vault.git}"
CONTRACT_PATH="${CONTRACT_PATH:-utils/HastraTimelockController.sol}"
CONTRACT_NAME="${CONTRACT_NAME:-HastraTimelockController}"
DEPLOYMENT_FILE="deployment_timelock_${NETWORK}.json"

for bin in git yarn npx jq cast; do
  command -v "$bin" >/dev/null 2>&1 || { echo "❌ required binary not found on PATH: $bin"; exit 1; }
done

# ── Resolve TIMELOCK / SHA / RPC, falling back to the deployment record ─────
if [ -z "${TIMELOCK:-}" ] && [ -f "$DEPLOYMENT_FILE" ]; then
  TIMELOCK=$(jq -r '.address' "$DEPLOYMENT_FILE")
  echo "ℹ️  TIMELOCK not set — using .address from $DEPLOYMENT_FILE: $TIMELOCK"
fi
if [ -z "${SHA:-}" ] && [ -f "$DEPLOYMENT_FILE" ]; then
  SHA=$(jq -r '.gitCommit // empty' "$DEPLOYMENT_FILE")
  [ -n "$SHA" ] && echo "ℹ️  SHA not set — using .gitCommit from $DEPLOYMENT_FILE: $SHA"
fi
if [ -z "${RPC:-}" ]; then
  if [ "$NETWORK" = "mainnet" ]; then RPC="${MAINNET_RPC_URL:-}"; else RPC="${SEPOLIA_RPC_URL:-}"; fi
fi

: "${TIMELOCK:?TIMELOCK address required (env var, or present in $DEPLOYMENT_FILE)}"
: "${SHA:?SHA (git commit) required (env var, or present in $DEPLOYMENT_FILE as gitCommit)}"
: "${RPC:?RPC url required (env var, or MAINNET_RPC_URL/SEPOLIA_RPC_URL)}"

echo "═══════════════════════════════════════════════════════════"
echo "  BYTECODE-TO-COMMIT VERIFICATION"
echo "═══════════════════════════════════════════════════════════"
echo "  Network:   $NETWORK"
echo "  Contract:  $TIMELOCK"
echo "  Commit:    $SHA"
echo "  Repo:      $REPO_URL"
echo "  Source:    contracts/$CONTRACT_PATH:$CONTRACT_NAME"
echo "═══════════════════════════════════════════════════════════"

WORKDIR=$(mktemp -d -t verify-bytecode)
cleanup() {
  local exit_code=$?
  if [ "$exit_code" -ne 0 ]; then
    echo ""
    echo "❌ Script exited with an error (exit code $exit_code) — see output above."
    echo "   Temp workdir: $WORKDIR"
  fi
  if [ "${KEEP_CLONE:-false}" != "true" ]; then
    rm -rf "$WORKDIR"
  else
    echo "ℹ️  KEEP_CLONE=true — leaving clone at $WORKDIR"
  fi
}
trap cleanup EXIT

# ── 1. Pull on-chain runtime bytecode ───────────────────────────────────────
echo ""
echo "⏳ Fetching on-chain bytecode for $TIMELOCK ..."
ONCHAIN_RAW=$(cast code "$TIMELOCK" --rpc-url "$RPC")
if [ -z "$ONCHAIN_RAW" ] || [ "$ONCHAIN_RAW" = "0x" ]; then
  echo "❌ No bytecode at $TIMELOCK on this RPC — wrong address or wrong network?"
  exit 1
fi
echo "$ONCHAIN_RAW" | tr 'A-F' 'a-f' > "$WORKDIR/onchain.bin"

# ── 2. Fresh clone at the exact commit, deterministic install ───────────────
echo ""
echo "⏳ Cloning $REPO_URL (fresh — avoids any local working-tree drift) ..."
git clone --quiet "$REPO_URL" "$WORKDIR/clone"
cd "$WORKDIR/clone"

echo "⏳ Checking out $SHA ..."
if ! git checkout --quiet "$SHA"; then
  echo "❌ Commit $SHA not found in $REPO_URL — is it pushed?"
  exit 1
fi

echo "⏳ yarn install --frozen-lockfile (uses yarn.lock's exact pinned versions — fails instead of re-resolving if it doesn't satisfy package.json) ..."
yarn install --frozen-lockfile

echo "⏳ npx hardhat compile ..."
npx hardhat compile

# ── 3. Extract recompiled runtime bytecode ──────────────────────────────────
ARTIFACT="artifacts/contracts/${CONTRACT_PATH}/${CONTRACT_NAME}.json"
DBG_FILE="artifacts/contracts/${CONTRACT_PATH}/${CONTRACT_NAME}.dbg.json"
if [ ! -f "$ARTIFACT" ]; then
  echo "❌ Artifact not found at $ARTIFACT — check CONTRACT_PATH/CONTRACT_NAME"
  exit 1
fi
jq -r '.deployedBytecode' "$ARTIFACT" | tr 'A-F' 'a-f' > "$WORKDIR/local.bin"

# ── 4. Mask self-referential immutable slots (e.g. UUPSUpgradeable's
#       `address(this)` guard) before diffing. A deployed contract's runtime
#       bytecode necessarily has its own real address baked into any such
#       slot; a freshly-compiled-but-never-deployed artifact can only ever
#       have a zero placeholder there — that value is unknowable until
#       deployment actually happens, on any machine, by construction. So a
#       byte-for-byte match is impossible for contracts with these slots; the
#       real, achievable guarantee is "matches everywhere except these known
#       slots". Uses solc's own `immutableReferences` (via build-info) for
#       exact offsets — not a heuristic guess at zero-runs.
IMMUTABLE_REFS="{}"
if [ -f "$DBG_FILE" ]; then
  BUILD_INFO_REL=$(jq -r '.buildInfo' "$DBG_FILE")
  BUILD_INFO="$(dirname "$DBG_FILE")/$BUILD_INFO_REL"
  if [ -f "$BUILD_INFO" ]; then
    REFS=$(jq -c --arg src "contracts/${CONTRACT_PATH}" --arg name "$CONTRACT_NAME" \
      '.output.contracts[$src][$name].evm.deployedBytecode.immutableReferences // {}' "$BUILD_INFO")
    [ "$REFS" != "null" ] && IMMUTABLE_REFS="$REFS"
  fi
fi

mask_immutables() {
  local file="$1"
  local content
  content=$(cat "$file")
  local start length hexStart hexLen zeros
  while read -r start length; do
    [ -z "$start" ] && continue
    hexStart=$(( 2 + start * 2 ))   # +2 for the "0x" prefix
    hexLen=$(( length * 2 ))
    zeros=$(printf '0%.0s' $(seq 1 "$hexLen"))
    content="${content:0:$hexStart}${zeros}${content:$((hexStart + hexLen))}"
  done < <(echo "$IMMUTABLE_REFS" | jq -r 'to_entries[] | .value[] | "\(.start) \(.length)"')
  echo "$content" > "$file"
}

REF_COUNT=$(echo "$IMMUTABLE_REFS" | jq '[to_entries[] | .value[]] | length')
if [ "$REF_COUNT" -gt 0 ]; then
  echo ""
  echo "ℹ️  Found $REF_COUNT self-referential immutable slot(s) via solc's immutableReferences"
  echo "    — masking both sides before diffing (see comment above for why)."
  cp "$WORKDIR/onchain.bin" "$WORKDIR/onchain.masked.bin"
  cp "$WORKDIR/local.bin" "$WORKDIR/local.masked.bin"
  mask_immutables "$WORKDIR/onchain.masked.bin"
  mask_immutables "$WORKDIR/local.masked.bin"
  DIFF_ONCHAIN="$WORKDIR/onchain.masked.bin"
  DIFF_LOCAL="$WORKDIR/local.masked.bin"
else
  DIFF_ONCHAIN="$WORKDIR/onchain.bin"
  DIFF_LOCAL="$WORKDIR/local.bin"
fi

# ── 5. Diff ──────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
if diff -q "$DIFF_ONCHAIN" "$DIFF_LOCAL" >/dev/null; then
  if [ "$REF_COUNT" -gt 0 ]; then
    echo "✅ MATCH — on-chain bytecode at $TIMELOCK == commit $SHA"
    echo "   (identical except for $REF_COUNT known self-address immutable slot(s), as expected)"
  else
    echo "✅ MATCH — on-chain bytecode at $TIMELOCK == commit $SHA"
  fi
  exit 0
else
  echo "❌ MISMATCH — on-chain bytecode does NOT match a recompile of commit $SHA"
  echo "   (this is after masking known immutable slots — this is a real difference)"
  echo "   onchain: $DIFF_ONCHAIN"
  echo "   local:   $DIFF_LOCAL"
  echo "   (inspect with: diff $DIFF_ONCHAIN $DIFF_LOCAL)"
  [ "${KEEP_CLONE:-false}" != "true" ] && echo "   Re-run with KEEP_CLONE=true to preserve these files for inspection."
  exit 1
fi
