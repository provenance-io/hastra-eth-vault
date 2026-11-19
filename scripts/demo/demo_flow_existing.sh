#!/bin/bash
# Demo flow that reuses an EXISTING deployment (no contract deployment).
# Runs: mint USDC -> deposit for wYLDS -> stake for PRIME -> unstake/redeem.
#
# Reads contract addresses from deployment.json (or DEPLOYMENT_FILE override).
# Requires the StakingVault's NAV oracle feed to be fresh (<1hr on Fuji) —
# see chainlink-hub/scripts/ops/keep-fuji-feed-fresh.sh if getVerifiedNav()
# reverts with StalePrice.
#
# Usage:
#   NETWORK=fuji ./scripts/demo/demo_flow_existing.sh
#   DEPLOYMENT_FILE=deployment_testnet_sepolia.json NETWORK=sepolia ./scripts/demo/demo_flow_existing.sh

set -e

cd "$(dirname "$0")/../.."

NETWORK=${NETWORK:-fuji}
DEPLOYMENT_FILE=${DEPLOYMENT_FILE:-deployment.json}

echo "Starting Hastra Vault Protocol Demo Flow (existing contracts, no deploy)..."
echo "Network:         $NETWORK"
echo "Deployment file: $DEPLOYMENT_FILE"

if [ ! -f "$DEPLOYMENT_FILE" ]; then
    echo "Error: Deployment file $DEPLOYMENT_FILE not found!"
    exit 1
fi

# Parsed via node (not grep -A/cut) — the "transactions" block also has
# "yieldVault"/"stakingVault" keys (tx hashes), so a naive line-window grep
# can silently pick up the wrong value once the "contracts" block grows.
USDC_ADDRESS=$(node -p "require('./$DEPLOYMENT_FILE').contracts.usdc")
YIELD_VAULT_ADDRESS=$(node -p "require('./$DEPLOYMENT_FILE').contracts.yieldVault")
STAKING_VAULT_ADDRESS=$(node -p "require('./$DEPLOYMENT_FILE').contracts.stakingVault")

if [ -z "$USDC_ADDRESS" ] || [ -z "$YIELD_VAULT_ADDRESS" ] || [ -z "$STAKING_VAULT_ADDRESS" ]; then
    echo "Error: Could not parse one or more addresses from $DEPLOYMENT_FILE"
    exit 1
fi

echo ""
echo "Captured Addresses:"
echo "USDC:         $USDC_ADDRESS"
echo "YieldVault:   $YIELD_VAULT_ADDRESS"
echo "StakingVault: $STAKING_VAULT_ADDRESS"

# Both USDC_ADDRESS and MOCK_USDC_ADDRESS are exported — different demo
# scripts expect different names for the same contract (mint-usdc.ts uses
# MOCK_USDC_ADDRESS; deposit-usdc.ts uses USDC_ADDRESS).
export USDC_ADDRESS
export MOCK_USDC_ADDRESS="$USDC_ADDRESS"
export YIELD_VAULT_ADDRESS
export STAKING_VAULT_ADDRESS
export MINT_AMOUNT="${MINT_AMOUNT:-10000}"
export DEPOSIT_AMOUNT="${DEPOSIT_AMOUNT:-5000}"
export STAKE_AMOUNT="${STAKE_AMOUNT:-2000}"

echo ""
echo "--------------------------------------------------"
echo "STEP 1: Minting USDC"
echo "--------------------------------------------------"
npx hardhat run scripts/demo/mint-usdc.ts --network "$NETWORK"

echo ""
echo "--------------------------------------------------"
echo "STEP 2: Depositing USDC for wYLDS"
echo "--------------------------------------------------"
npx hardhat run scripts/demo/deposit-usdc.ts --network "$NETWORK"

echo ""
echo "--------------------------------------------------"
echo "STEP 3: Staking wYLDS for PRIME"
echo "--------------------------------------------------"
npx hardhat run scripts/demo/stake-wylds.ts --network "$NETWORK"

echo ""
echo "--------------------------------------------------"
echo "STEP 4: Unstake and Redeem"
echo "--------------------------------------------------"
npx hardhat run scripts/demo/unstake-and-redeem.ts --network "$NETWORK"

echo ""
echo "--------------------------------------------------"
echo "Demo Flow Complete! (no new contracts deployed)"
echo "--------------------------------------------------"
