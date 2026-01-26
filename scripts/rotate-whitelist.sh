#!/bin/bash
set -e

# Ensure we are in the project root
cd "$(dirname "$0")/.."

# Set addresses
YIELD_VAULT="0x4A5042bA80477ea51Ede73c39a6e620750AC2cFA"
ADD_ADDR="0x3778F66336F79B2B0D86E759499D191EA030a4c6"
REMOVE_ADDR="0x803AdF8d4F036134070Bde997f458502Ade2f834"

echo "Rotating whitelist..."
echo "Vault: $YIELD_VAULT"

# 1. Add new address
echo ""
echo "Adding $ADD_ADDR..."
export YIELD_VAULT_ADDRESS=$YIELD_VAULT
export TARGET_ADDRESS=$ADD_ADDR
export ACTION="add"
npx hardhat run scripts/manage-whitelist.ts --network hoodi

# 2. Remove old address
echo ""
echo "Removing $REMOVE_ADDR..."
export TARGET_ADDRESS=$REMOVE_ADDR
export ACTION="remove"
npx hardhat run scripts/manage-whitelist.ts --network hoodi

echo ""
echo "Rotation complete!"
