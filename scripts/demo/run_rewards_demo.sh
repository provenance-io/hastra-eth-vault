#!/bin/bash

# Exit on error
set -e

# Ensure we are in the project root (go up 2 levels from scripts/demo/)
cd "$(dirname "$0")/../.."

echo "Starting Full Rewards Capture Demo..."

# Resolve network-specific deployment file
NETWORK=${NETWORK:-hoodi}
if [ -z "$DEPLOYMENT_FILE" ] || [ ! -f "$DEPLOYMENT_FILE" ]; then
  DEPLOYMENT_FILE="deployment_testnet_${NETWORK}.json"
fi
# backward compat fallback
if [ ! -f "$DEPLOYMENT_FILE" ] && [ -f "deployment_testnet.json" ]; then
  DEPLOYMENT_FILE="deployment_testnet.json"
fi

if [ ! -f "$DEPLOYMENT_FILE" ]; then
    echo "Error: Deployment file $DEPLOYMENT_FILE not found!"
    exit 1
fi

echo "Using deployment file: $DEPLOYMENT_FILE"

# Read addresses
USDC_ADDRESS=$(grep -A 5 '"contracts":' "$DEPLOYMENT_FILE" | grep '"usdc":' | cut -d '"' -f 4)
YIELD_VAULT_ADDRESS=$(grep -A 5 '"contracts":' "$DEPLOYMENT_FILE" | grep '"yieldVault":' | cut -d '"' -f 4)
STAKING_VAULT_ADDRESS=$(grep -A 5 '"contracts":' "$DEPLOYMENT_FILE" | grep '"stakingVault":' | cut -d '"' -f 4)

export MOCK_USDC_ADDRESS=$USDC_ADDRESS
export YIELD_VAULT_ADDRESS=$YIELD_VAULT_ADDRESS
export STAKING_VAULT_ADDRESS=$STAKING_VAULT_ADDRESS

echo ""
echo "--------------------------------------------------"
echo "PRE-STEP: Ensuring wYLDS Balance"
echo "--------------------------------------------------"
# We need wYLDS to stake. If we have none (because we redeemed all in previous demo),
# we need to get some. We'll run deposit-usdc.ts.
# But deposit-usdc.ts needs USDC. So we might need to mint USDC first.
# Let's just run both to be safe. It's cheap on testnet.

export MINT_AMOUNT="1000"
npx hardhat run scripts/demo/mint-usdc.ts --network hoodi

export DEPOSIT_AMOUNT="1000"
npx hardhat run scripts/demo/deposit-usdc.ts --network hoodi

echo ""
echo "--------------------------------------------------"
echo "STEP 1: Staking 100 wYLDS (to capture future rewards)"
echo "--------------------------------------------------"
export STAKE_AMOUNT="100"
npx hardhat run scripts/demo/stake-wylds.ts --network hoodi

echo ""
echo "--------------------------------------------------"
echo "STEP 2: Distributing 500 wYLDS Rewards"
echo "--------------------------------------------------"
export REWARD_AMOUNT="500"
npx hardhat run scripts/demo/distribute-rewards.ts --network hoodi

echo ""
echo "--------------------------------------------------"
echo "STEP 3: Redeeming to capture increased value"
echo "--------------------------------------------------"
npx hardhat run scripts/demo/unstake-and-redeem.ts --network hoodi

echo ""
echo "--------------------------------------------------"
echo "Rewards Capture Demo Complete!"
echo "--------------------------------------------------"