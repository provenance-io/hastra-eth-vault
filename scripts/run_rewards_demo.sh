#!/bin/bash

# Exit on error
set -e

echo "Starting Full Rewards Capture Demo..."

# Determine deployment file
DEPLOYMENT_FILE=${DEPLOYMENT_FILE:-"deployment.json"}
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
echo "STEP 1: Staking 100 wYLDS (to capture future rewards)"
echo "--------------------------------------------------"
export STAKE_AMOUNT="100"
npx hardhat run scripts/stake-wylds.ts --network hoodi

echo ""
echo "--------------------------------------------------"
echo "STEP 2: Distributing 500 wYLDS Rewards"
echo "--------------------------------------------------"
export REWARD_AMOUNT="500"
npx hardhat run scripts/distribute-rewards.ts --network hoodi

echo ""
echo "--------------------------------------------------"
echo "STEP 3: Unstaking to capture increased value"
echo "--------------------------------------------------"
npx hardhat run scripts/unstake-and-redeem.ts --network hoodi

echo ""
echo "--------------------------------------------------"
echo "Rewards Capture Demo Complete!"
echo "--------------------------------------------------"