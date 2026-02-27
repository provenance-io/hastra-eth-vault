#!/bin/bash
set -e

# Ensure we are in the project root
cd "$(dirname "$0")/../.."

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
  echo "Error: No deployment file found!"
  exit 1
fi

YIELD_VAULT=$(grep -A 3 '"contracts":' "$DEPLOYMENT_FILE" | grep '"yieldVault":' | cut -d '"' -f 4)

# Set addresses to rotate
ADD_ADDR="0xc973c6b2c83dcd8793d2b280471f7ea249c0ad5d"
REMOVE_ADDR="0x803AdF8d4F036134070Bde997f458502Ade2f834"

echo "Rotating whitelist..."
echo "Vault: $YIELD_VAULT"

# 1. Add new address
echo ""
echo "Adding $ADD_ADDR..."
export YIELD_VAULT_ADDRESS=$YIELD_VAULT
export TARGET_ADDRESS=$ADD_ADDR
export ACTION="add"
npx hardhat run scripts/admin/manage-whitelist.ts --network hoodi

# 2. Remove old address
echo ""
echo "Removing $REMOVE_ADDR..."
export TARGET_ADDRESS=$REMOVE_ADDR
export ACTION="remove"
npx hardhat run scripts/admin/manage-whitelist.ts --network hoodi

echo ""
echo "Rotation complete!"
