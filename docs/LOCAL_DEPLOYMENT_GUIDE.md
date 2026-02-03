# Local Deployment Guide

This guide explains how to run the Hastra Vault Protocol on a local Ethereum node using Hardhat.

## What is Hardhat?

**Hardhat** is a development environment for Ethereum that provides:

- **Local Ethereum Node**: A test blockchain that runs on your computer
- **Solidity Compiler**: Compiles your smart contracts
- **Testing Framework**: Built-in testing with Mocha/Chai
- **Deployment Scripts**: Automated contract deployment
- **Console**: Interactive JavaScript console for contract interaction
- **Debugging**: Stack traces and console.log support

## Prerequisites

Make sure you have:
- Node.js (v18 or higher)
- Yarn or npm
- Git

## Quick Start

### 1. Install Dependencies

```bash
yarn install
# or
npm install
```

### 2. Compile Contracts

```bash
yarn compile
# or
npx hardhat compile
```

This compiles your Solidity contracts into bytecode and generates TypeScript types.

### 3. Run Tests

```bash
yarn test
# or
npx hardhat test
```

### 4. Start Local Ethereum Node

Open a **new terminal window** and run:

```bash
npx hardhat node
```

This starts a local Ethereum blockchain on `http://127.0.0.1:8545` with:
- 20 test accounts pre-funded with 10,000 ETH each
- Instant block mining (no waiting)
- Full Ethereum JSON-RPC API support
- Detailed transaction logs

**Keep this terminal running!** This is your local blockchain.

### 5. Deploy Contracts (in a new terminal)

In a **separate terminal** (while the node is running), deploy the contracts:

```bash
npx hardhat run scripts/deploy.ts --network localhost
```

This will:
1. Deploy MockUSDC (test token)
2. Deploy YieldVault (wYLDS)
3. Deploy StakingVault (PRIME)
4. Setup roles and permissions
5. Print deployment addresses

## Understanding the Deployment

### Contract Architecture

```
USDC (ERC20)
    ↓ (deposit)
YieldVault (wYLDS - ERC4626 vault)
    ↓ (stake)
StakingVault (PRIME - ERC4626 vault with unbonding)
```

### Default Accounts

Hardhat provides test accounts (visible when you start the node):

- **Account #0** (Deployer/Admin): Has DEFAULT_ADMIN_ROLE
- **Account #1** (Redeem Vault): Holds USDC for redemptions
- **Account #2** (Freeze Admin): Can freeze/thaw accounts
- **Account #3** (Rewards Admin): Can distribute rewards

## Interacting with Contracts

### Option 1: Hardhat Console

Start an interactive console connected to your local node:

```bash
npx hardhat console --network localhost
```

Then you can interact with contracts:

```javascript
// Get contract instances
const YieldVault = await ethers.getContractFactory("YieldVault");
const yieldVault = await YieldVault.attach("0x..."); // Use deployed address

// Get signers
const [deployer, , , , user1] = await ethers.getSigners();

// Interact
const balance = await yieldVault.balanceOf(user1.address);
console.log("Balance:", ethers.formatUnits(balance, 6));
```

### Option 2: Custom Scripts

Create a script in `scripts/interact.ts`:

```typescript
import { ethers } from "hardhat";

async function main() {
  const yieldVault = await ethers.getContractAt(
    "YieldVault",
    "0x..." // Deployed address
  );

  // Your interactions here
}

main().catch(console.error);
```

Run it:
```bash
npx hardhat run scripts/interact.ts --network localhost
```

### Option 3: Use Existing Scripts

We have pre-built scripts:

```bash
# User operations (deposit, stake, unbond)
npx hardhat run scripts/user.ts --network localhost

# Admin operations (rewards, freeze)
npx hardhat run scripts/admin.ts --network localhost
```

## Common Operations

### Deposit USDC → Get wYLDS

```javascript
const usdc = await ethers.getContractAt("MockUSDC", usdcAddress);
const yieldVault = await ethers.getContractAt("YieldVault", vaultAddress);

// Approve
await usdc.approve(vaultAddress, ethers.parseUnits("1000", 6));

// Deposit
await yieldVault.deposit(
  ethers.parseUnits("1000", 6), // 1000 USDC
  user.address // receiver
);
```

### Stake wYLDS → Get PRIME

```javascript
const wYLDS = await ethers.getContractAt("YieldVault", yieldVaultAddress);
const stakingVault = await ethers.getContractAt("StakingVault", stakingAddress);

// Approve
await wYLDS.approve(stakingAddress, ethers.parseUnits("500", 6));

// Stake
await stakingVault.deposit(
  ethers.parseUnits("500", 6), // 500 wYLDS
  user.address
);
```

### Unbond PRIME → Start Unbonding

```javascript
// Initiate unbonding (locks PRIME for 21 days)
await stakingVault.unbond(ethers.parseUnits("100", 6));

// Fast-forward time in Hardhat (for testing)
await ethers.provider.send("evm_increaseTime", [21 * 24 * 60 * 60]); // 21 days
await ethers.provider.send("evm_mine", []); // Mine a block

// Complete unbonding (receive wYLDS)
await stakingVault.completeUnbonding(0); // Position index 0
```

### Request Redemption (wYLDS → USDC)

```javascript
// Request redemption
await yieldVault.requestRedeem(ethers.parseUnits("100", 6));

// Admin completes redemption (requires redeem vault to have USDC)
await yieldVault.connect(rewardsAdmin).completeRedeem(userAddress);
```

## Advanced Features

### Time Manipulation (Testing Only)

Hardhat allows you to manipulate blockchain time:

```javascript
// Increase time by 21 days
await ethers.provider.send("evm_increaseTime", [21 * 24 * 60 * 60]);
await ethers.provider.send("evm_mine", []); // Mine block to apply

// Set exact timestamp
await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
await ethers.provider.send("evm_mine", []);
```

### Snapshot & Revert (Testing)

Save and restore blockchain state:

```javascript
// Take snapshot
const snapshotId = await ethers.provider.send("evm_snapshot", []);

// Do some operations...
await yieldVault.deposit(...);

// Revert to snapshot
await ethers.provider.send("evm_revert", [snapshotId]);
```

### Impersonate Accounts

Act as any address (useful for testing):

```javascript
await ethers.provider.send("hardhat_impersonateAccount", [address]);
const signer = await ethers.getSigner(address);

// Use the signer
await yieldVault.connect(signer).someFunction();

await ethers.provider.send("hardhat_stopImpersonatingAccount", [address]);
```

## Network Configuration

Your `hardhat.config.ts` defines networks:

```typescript
networks: {
  hardhat: {
    chainId: 31337,  // Local testing
  },
  localhost: {
    url: "http://127.0.0.1:8545",  // Connected to `npx hardhat node`
  },
  sepolia: {
    url: process.env.SEPOLIA_RPC_URL,
    accounts: [process.env.PRIVATE_KEY],
  },
}
```

## Useful Commands

```bash
# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Run specific test file
npx hardhat test test/StakingVault.test.ts

# Start local node
npx hardhat node

# Deploy to local network
npx hardhat run scripts/deploy.ts --network localhost

# Open console
npx hardhat console --network localhost

# Clean artifacts and cache
npx hardhat clean

# Get network accounts
npx hardhat accounts

# Check contract size
npx hardhat size-contracts

# Generate gas report
REPORT_GAS=true npx hardhat test
```

## Troubleshooting

### "Error: network does not exist"
Make sure `npx hardhat node` is running in a separate terminal.

### "Nonce too high" errors
Restart the local node:
```bash
# Stop the node (Ctrl+C)
# Start it again
npx hardhat node
```

### Contracts not deploying
1. Check if the node is running
2. Verify network in hardhat.config.ts
3. Try cleaning: `npx hardhat clean`

### TypeScript errors
Regenerate types:
```bash
npx hardhat clean
npx hardhat compile
```

## What Happens Under the Hood

When you run `npx hardhat node`:

1. **Hardhat EVM** starts a local Ethereum blockchain
2. Creates 20 accounts with 10,000 ETH each
3. Listens on port 8545 for JSON-RPC calls
4. Auto-mines blocks when transactions are submitted
5. Provides detailed logs and stack traces

When you deploy:

1. Contracts are compiled to bytecode
2. Deployment transactions are sent to the local node
3. Contracts are deployed to addresses (deterministic on local network)
4. Constructor arguments are encoded and passed
5. Initialization code runs
6. Contract addresses are returned

## Next Steps

- Read the [User Guide](./USER_GUIDE.md) for protocol mechanics
- Review the [Architecture](./ARCHITECTURE.md) document
- Check out test files for usage examples
- Try modifying contracts and redeploying locally
- Use Hardhat's debugging features with `console.log`

## Resources

- [Hardhat Documentation](https://hardhat.org/docs)
- [Hardhat Network Reference](https://hardhat.org/hardhat-network/docs)
- [Ethers.js Documentation](https://docs.ethers.org/v6/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
