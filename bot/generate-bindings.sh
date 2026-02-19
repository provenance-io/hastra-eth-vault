#!/bin/bash
set -e

echo "Generating contract bindings..."
mkdir -p pkg/contracts

# Compile contracts first
echo "Compiling contracts..."
cd ..
npx hardhat compile --quiet
cd bot

# Check abigen
if ! command -v abigen &> /dev/null; then
    echo "❌ abigen not found. Install with:"
    echo "   go install github.com/ethereum/go-ethereum/cmd/abigen@latest"
    echo "   export PATH=\$PATH:~/go-1.24/bin"
    exit 1
fi

# Extract ABI from Hardhat artifact
echo "Extracting ABI..."
cat ../artifacts/contracts/chainlink/HastraNavEngine.sol/HastraNavEngine.json | \
    jq -r '.abi' > navengine-abi.json

# Generate from ABI
echo "Generating Go bindings..."
abigen \
    --abi navengine-abi.json \
    --pkg contracts \
    --type NavEngine \
    --out pkg/contracts/navengine.go

# Cleanup temp file
rm navengine-abi.json

echo "✅ Bindings generated at pkg/contracts/navengine.go"
