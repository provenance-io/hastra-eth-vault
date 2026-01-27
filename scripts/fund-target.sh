#!/bin/bash
set -e
# Ensure we are in the project root
cd "$(dirname "$0")/.."

# Configuration
TARGET="0xF4B35857A657eaFE095D1FCeB2bcAf09921E24DB"
AMOUNT=${1:-1000000} # Default to 1M if no argument provided

# Get USDC address from deployment info
USDC_ADDRESS=$(grep -A 5 '"contracts":' deployment.json | grep '"usdc":' | cut -d '"' -f 4)

echo "Funding $TARGET with $AMOUNT USDC..."
echo "Using USDC Contract: $USDC_ADDRESS"

export MOCK_USDC_ADDRESS=$USDC_ADDRESS
export MINT_TO_ADDRESS=$TARGET
export MINT_AMOUNT=$AMOUNT

npx hardhat run scripts/mint-usdc.ts --network hoodi
