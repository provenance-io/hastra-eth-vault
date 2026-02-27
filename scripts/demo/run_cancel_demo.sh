#!/bin/bash

# Exit on error
set -e

# Ensure we are in the project root (go up 2 levels from scripts/demo/)
cd "$(dirname "$0")/../.."

echo "Starting Redemption Cancellation Demo..."

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

export MOCK_USDC_ADDRESS=$USDC_ADDRESS
export YIELD_VAULT_ADDRESS=$YIELD_VAULT_ADDRESS

# Ensure we have wYLDS first
echo ""
echo "--------------------------------------------------"
echo "PRE-STEP: Ensuring wYLDS Balance"
echo "--------------------------------------------------"
export MINT_AMOUNT="500"
npx hardhat run scripts/demo/mint-usdc.ts --network hoodi
export DEPOSIT_AMOUNT="500"
npx hardhat run scripts/demo/deposit-usdc.ts --network hoodi

echo ""
echo "--------------------------------------------------"
echo "STEP 1: Requesting Redemption (50 wYLDS)"
echo "--------------------------------------------------"
# We can reuse request_redeem.ts from the vault-mint folder? No, we don't have one in scripts root.
# I'll create a quick inline script runner or just use a helper.
# Let's create a dedicated request script if it doesn't exist.
# Checking scripts... we have unstake-and-redeem.ts but not just 'request-redeem.ts'.
# I'll use a one-liner hardhat script for now.

cat <<EOF > scripts/demo/request-redeem.ts
import { ethers } from "hardhat";
async function main() {
  const [user] = await ethers.getSigners();
  const vault = await ethers.getContractAt("YieldVault", process.env.YIELD_VAULT_ADDRESS!);
  const amount = ethers.parseUnits("50", 6);
  console.log("Requesting redeem for 50 wYLDS...");
  const tx = await vault.requestRedeem(amount);
  await tx.wait();
  console.log("Requested!");
}
main().catch(console.error);
EOF

npx hardhat run scripts/demo/request-redeem.ts --network hoodi

echo ""
echo "--------------------------------------------------"
echo "STEP 2: Cancelling Redemption"
echo "--------------------------------------------------"
npx hardhat run scripts/demo/cancel-redemption.ts --network hoodi

echo ""
echo "--------------------------------------------------"
echo "Cancellation Demo Complete!"
echo "--------------------------------------------------"
rm scripts/demo/request-redeem.ts
