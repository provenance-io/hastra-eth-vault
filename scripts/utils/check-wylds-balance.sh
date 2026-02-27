#!/bin/bash

# Script to check wYLDS balance for an address
# Usage: ./scripts/utils/check-wylds-balance.sh [address] [network]

ADDRESS=${1:-"0x3778f66336f79b2b0d86e759499d191ea030a4c6"}
NETWORK=${2:-"hoodi"}

echo "════════════════════════════════════════════════════════════"
echo "           wYLDS BALANCE CHECKER"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Address: $ADDRESS"
echo "Network: $NETWORK"
echo ""

# Load deployment file
if [ -z "$DEPLOYMENT_FILE" ] || [ ! -f "$DEPLOYMENT_FILE" ]; then
  DEPLOYMENT_FILE="deployment_testnet_${NETWORK}.json"
fi
# backward compat fallback
if [ ! -f "$DEPLOYMENT_FILE" ] && [ -f "deployment_testnet.json" ]; then
  DEPLOYMENT_FILE="deployment_testnet.json"
fi

if [ ! -f "$DEPLOYMENT_FILE" ]; then
    echo "❌ Error: $DEPLOYMENT_FILE not found!"
    exit 1
fi

YIELD_VAULT=$(jq -r '.contracts.yieldVault' "$DEPLOYMENT_FILE")
USDC_ADDRESS=$(jq -r '.contracts.usdc' "$DEPLOYMENT_FILE")

echo "YieldVault: $YIELD_VAULT"
echo "USDC:       $USDC_ADDRESS"
echo ""

# Create a temporary script to get balance
cat > /tmp/check_balance.js << EOF
const { ethers } = require("hardhat");

async function main() {
  const yieldVault = await ethers.getContractAt("YieldVault", "$YIELD_VAULT");
  const usdc = await ethers.getContractAt("MockUSDC", "$USDC_ADDRESS");
  
  const wyldsBalance = await yieldVault.balanceOf("$ADDRESS");
  const usdcBalance = await usdc.balanceOf("$ADDRESS");
  
  console.log("💰 Balances:");
  console.log("   wYLDS: " + ethers.formatUnits(wyldsBalance, 6) + " wYLDS");
  console.log("   USDC:  " + ethers.formatUnits(usdcBalance, 6) + " USDC");
  console.log("");
  
  // Get total supply for context
  const totalSupply = await yieldVault.totalSupply();
  const totalAssets = await yieldVault.totalAssets();
  
  console.log("📊 YieldVault Stats:");
  console.log("   Total Supply: " + ethers.formatUnits(totalSupply, 6) + " wYLDS");
  console.log("   Total Assets: " + ethers.formatUnits(totalAssets, 6) + " USDC");
  
  if (totalSupply > 0n) {
    const percentage = (wyldsBalance * 10000n) / totalSupply;
    console.log("   Your Share:   " + (Number(percentage) / 100).toFixed(2) + "%");
  }
  
  console.log("");
  
  // Check if user has pending redemption
  const pending = await yieldVault.pendingRedemptions("$ADDRESS");
  if (pending.shares > 0n) {
    console.log("⏳ Pending Redemption:");
    console.log("   Shares: " + ethers.formatUnits(pending.shares, 6) + " wYLDS");
    console.log("   Assets: " + ethers.formatUnits(pending.assets, 6) + " USDC");
    console.log("");
  }
  
  // Suggest next steps
  if (wyldsBalance === 0n && usdcBalance > 0n) {
    console.log("💡 You have USDC but no wYLDS. To get wYLDS:");
    console.log("   npx hardhat run scripts/utils/approve-usdc.ts --network $NETWORK");
    console.log("   npx hardhat run scripts/deposit-usdc.ts --network $NETWORK");
  } else if (wyldsBalance > 0n) {
    console.log("✅ You have wYLDS! You can:");
    console.log("   - Transfer: npx hardhat run scripts/utils/transfer-wylds.ts --network $NETWORK");
    console.log("   - Stake for PRIME: Check StakingVault");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
EOF

# Run the script
npx hardhat run /tmp/check_balance.js --network $NETWORK

# Cleanup
rm /tmp/check_balance.js
