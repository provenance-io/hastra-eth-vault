#!/bin/bash

# Exit on error
set -e

# Ensure we are in the project root (go up 2 levels from scripts/demo/)
cd "$(dirname "$0")/../.."

# Network selection: NETWORK=sepolia ./scripts/demo/demo_flow.sh
# Defaults to hoodi if not set.
NETWORK=${NETWORK:-hoodi}

echo "Starting Hastra Vault Protocol Demo Flow..."
echo "Network: $NETWORK"

# 1. Deploy Contracts
echo ""
echo "--------------------------------------------------"
echo "STEP 1: Deploying Contracts"
echo "--------------------------------------------------"
# Set an initial whitelist address for demonstration
export INITIAL_WHITELIST_ADDRESS="0x803AdF8d4F036134070Bde997f458502Ade2f834"

npx hardhat run scripts/deploy.ts --network "$NETWORK"

# Resolve network-specific deployment file
DEPLOYMENT_FILE="deployment_testnet_${NETWORK}.json"
# backward compat fallback
if [ ! -f "$DEPLOYMENT_FILE" ] && [ -f "deployment_testnet.json" ]; then
  DEPLOYMENT_FILE="deployment_testnet.json"
fi

if [ ! -f "$DEPLOYMENT_FILE" ]; then
    echo "Error: Deployment file $DEPLOYMENT_FILE not found! Deployment failed?"
    exit 1
fi

# Read addresses from deployment file
USDC_ADDRESS=$(grep -A 5 '"contracts":' "$DEPLOYMENT_FILE" | grep '"usdc":' | cut -d '"' -f 4)
YIELD_VAULT_ADDRESS=$(grep -A 5 '"contracts":' "$DEPLOYMENT_FILE" | grep '"yieldVault":' | cut -d '"' -f 4)
STAKING_VAULT_ADDRESS=$(grep -A 5 '"contracts":' "$DEPLOYMENT_FILE" | grep '"stakingVault":' | cut -d '"' -f 4)

echo ""
echo "Captured Addresses:"
echo "USDC: $USDC_ADDRESS"
echo "YieldVault: $YIELD_VAULT_ADDRESS"
echo "StakingVault: $STAKING_VAULT_ADDRESS"

# 2. Mint USDC
echo ""
echo "--------------------------------------------------"
echo "STEP 2: Minting USDC"
echo "--------------------------------------------------"
export MOCK_USDC_ADDRESS=$USDC_ADDRESS
export MINT_AMOUNT="10000"
npx hardhat run scripts/demo/mint-usdc.ts --network "$NETWORK"

# 3. Deposit USDC into YieldVault (Get wYLDS)
echo ""
echo "--------------------------------------------------"
echo "STEP 3: Depositing USDC for wYLDS"
echo "--------------------------------------------------"
export YIELD_VAULT_ADDRESS=$YIELD_VAULT_ADDRESS
export DEPOSIT_AMOUNT="5000"
npx hardhat run scripts/demo/deposit-usdc.ts --network "$NETWORK"

# 4. Stake wYLDS into StakingVault (Get PRIME)
echo ""
echo "--------------------------------------------------"
echo "STEP 4: Staking wYLDS for PRIME"
echo "--------------------------------------------------"
export STAKING_VAULT_ADDRESS=$STAKING_VAULT_ADDRESS
export STAKE_AMOUNT="2000"
npx hardhat run scripts/demo/stake-wylds.ts --network "$NETWORK"

# 5. Unstake and Redeem (Verify Unbonding)
echo ""
echo "--------------------------------------------------"
echo "STEP 5: Instant Redeem (Verification)"
echo "--------------------------------------------------"
npx hardhat run scripts/demo/unstake-and-redeem.ts --network "$NETWORK"

echo ""
echo "--------------------------------------------------"
echo "Demo Flow Complete!"
echo "--------------------------------------------------"