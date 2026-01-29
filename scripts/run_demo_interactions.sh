#!/bin/bash

set -e
# Ensure we are in the project root
cd "$(dirname "$0")/.."

echo "Starting Hastra Vault Protocol Interaction Flow (No Deployment)..."

# Determine deployment file
DEPLOYMENT_FILE=${DEPLOYMENT_FILE:-"deployment.json"}
if [ ! -f "$DEPLOYMENT_FILE" ] && [ -f "deployment_testnet.json" ]; then
    DEPLOYMENT_FILE="deployment_testnet.json"
fi

if [ ! -f "$DEPLOYMENT_FILE" ]; then
    echo "Error: Deployment file $DEPLOYMENT_FILE not found! Cannot run interactions without deployment info."
    echo "Please run 'scripts/demo_flow.sh' first or ensure deployment.json exists."
    exit 1
fi

echo "Using deployment file: $DEPLOYMENT_FILE"

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
echo "STEP 1: Minting USDC"
echo "--------------------------------------------------"
export MOCK_USDC_ADDRESS=$USDC_ADDRESS
export MINT_AMOUNT="10000"
npx hardhat run scripts/mint-usdc.ts --network hoodi

# 3. Deposit USDC into YieldVault (Get wYLDS)
echo ""
echo "--------------------------------------------------"
echo "STEP 2: Depositing USDC for wYLDS"
echo "--------------------------------------------------"
export YIELD_VAULT_ADDRESS=$YIELD_VAULT_ADDRESS
export DEPOSIT_AMOUNT="5000"
npx hardhat run scripts/deposit-usdc.ts --network hoodi

# 4. Stake wYLDS into StakingVault (Get PRIME)
echo ""
echo "--------------------------------------------------"
echo "STEP 3: Staking wYLDS for PRIME"
echo "--------------------------------------------------"
export STAKING_VAULT_ADDRESS=$STAKING_VAULT_ADDRESS
export STAKE_AMOUNT="2000"
npx hardhat run scripts/stake-wylds.ts --network hoodi

# 5. Unstake and Redeem (Verify Unbonding)
echo ""
echo "--------------------------------------------------"
echo "STEP 4: Instant Redeem (Verification)"
echo "--------------------------------------------------"
npx hardhat run scripts/unstake-and-redeem.ts --network hoodi

echo ""
echo "--------------------------------------------------"
echo "Interaction Flow Complete!"
echo "--------------------------------------------------"
