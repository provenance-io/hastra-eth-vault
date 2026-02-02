# Running Hastra Vault Locally - Simple Guide

## What is Hardhat?

**Hardhat** is like a complete development toolkit for Ethereum smart contracts. Think of it as:
- A **local Ethereum blockchain** that runs on your computer (no internet needed!)
- A **compiler** that turns Solidity code into executable contracts
- A **testing framework** to ensure your contracts work correctly
- A **deployment tool** to publish contracts to networks

It's similar to how you might use Docker for containers, or Jest for JavaScript testing.

## Quick Start (2 Steps)

### Step 1: Start Your Local Blockchain

```bash
npx hardhat node
```

This creates a private Ethereum blockchain on your computer with:
- 20 test accounts, each with 10,000 ETH
- Instant transaction confirmation (no waiting!)
- Detailed logs showing everything that happens

**Keep this terminal window open!**

### Step 2: Deploy & Run Demo

Open a **new terminal** and run:

```bash
# Deploy the smart contracts
npx hardhat run scripts/deploy.ts --network localhost

# Run the interactive demo
npx hardhat run scripts/interact.ts --network localhost
```

That's it! You now have a full DeFi protocol running locally.

## What Just Happened?

1. **Local Blockchain**: You started your own Ethereum network
2. **Smart Contracts Deployed**: Three contracts are now running:
   - MockUSDC (a test stablecoin)
   - YieldVault (deposit USDC, get wYLDS)
   - StakingVault (stake wYLDS, get PRIME, earn rewards)
3. **Deployment Saved**: Contract addresses saved to `deployment.json`
4. **Demo Executed**: The interact script reads from `deployment.json` and runs the full user flow

**Note:** The interact script cannot run on mainnet (safety check built-in).

## Understanding the Flow

```
┌──────────────────────────────────────────────────┐
│  You have USDC (stablecoin)                      │
│      ↓                                            │
│  Step 1: Deposit USDC into YieldVault            │
│      ↓                                            │
│  Step 2: Receive wYLDS tokens (1:1 with USDC)    │
│      ↓                                            │
│  Step 3: Stake wYLDS in StakingVault             │
│      ↓                                            │
│  Receive PRIME tokens (represents your stake)    │
│      ↓                                            │
│  Step 4: Earn rewards (PRIME value increases!)   │
│      ↓                                            │
│  Step 5: Redeem PRIME → wYLDS (specify shares)   │
│      ↓                                            │
│  Step 6: Withdraw PRIME → wYLDS (specify assets) │
│      ↓                                            │
│  Step 7: Request redemption (wYLDS → USDC)       │
│      ↓                                            │
│  Step 8: Admin completes redemption              │
│      ↓                                            │
│  Get USDC back in your wallet!                   │
└──────────────────────────────────────────────────┘
```

### Redeem vs Withdraw (ERC-4626)

The StakingVault follows the ERC-4626 standard with two ways to unstake:

| Method | You Specify | Calculated | Use When |
|--------|-------------|------------|----------|
| `redeem(shares)` | PRIME to burn | wYLDS received | "I want to unstake 1000 PRIME" |
| `withdraw(assets)` | wYLDS to receive | PRIME burned | "I need exactly 500 wYLDS" |

Both are instant - no waiting period required.

## Try It Yourself

### Interactive Console

```bash
npx hardhat console --network localhost
```

Then in the console:

```javascript
// Get a user account
const [deployer] = await ethers.getSigners();
console.log("My address:", deployer.address);

// Get contract (use address from deployment)
const vault = await ethers.getContractAt("YieldVault", "0x...");

// Check balance
const balance = await vault.balanceOf(deployer.address);
console.log("My wYLDS:", ethers.formatUnits(balance, 6));
```

### Useful Commands

```bash
# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Start local blockchain
npx hardhat node

# Deploy contracts
npx hardhat run scripts/deploy.ts --network localhost

# Open interactive console
npx hardhat console --network localhost
```

## How Hardhat Works

### When you run `npx hardhat node`:

```
┌─────────────────────────────────────┐
│  Hardhat Network (EVM)              │
│  ┌───────────────────────────────┐  │
│  │  Blockchain                    │  │
│  │  - Block #0 (genesis)          │  │
│  │  - Block #1 (your tx)          │  │
│  │  - Block #2 (another tx)       │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  Accounts                      │  │
│  │  - Account 0: 10,000 ETH       │  │
│  │  - Account 1: 10,000 ETH       │  │
│  │  - ... (20 total)              │  │
│  └───────────────────────────────┘  │
│                                     │
│  Listening on http://localhost:8545 │
└─────────────────────────────────────┘
```

### When you deploy:

```
Your Script
    ↓
Sends Transaction
    ↓
Hardhat Network
    ↓
Mines Block
    ↓
Contract Deployed!
    ↓
Returns Address (e.g., 0x5FbDB...)
```

## Testing Features

Hardhat lets you do things you **can't do** on a real blockchain:

### Time Travel
```javascript
// Skip forward 21 days (useful for unbonding tests!)
await ethers.provider.send("evm_increaseTime", [21 * 24 * 60 * 60]);
await ethers.provider.send("evm_mine", []);
```

### Snapshots
```javascript
// Save the current state
const snapshot = await ethers.provider.send("evm_snapshot", []);

// Do some operations...
await vault.deposit(...);

// Restore to saved state
await ethers.provider.send("evm_revert", [snapshot]);
```

### Impersonate Anyone
```javascript
// Become any address (for testing admin functions)
await ethers.provider.send("hardhat_impersonateAccount", ["0x..."]);
const signer = await ethers.getSigner("0x...");
await vault.connect(signer).adminFunction();
```

## File Structure

```
hastra-eth-vault/
├── contracts/              # Solidity smart contracts
│   ├── YieldVault.sol     # Main deposit vault
│   ├── StakingVault.sol   # Staking with unbonding
│   └── MockUSDC.sol       # Test USDC token
├── test/                   # Automated tests
│   ├── YieldVault.test.ts
│   └── StakingVault.test.ts
├── scripts/                # Deployment & interaction
│   ├── deploy.ts          # Deploy all contracts
│   ├── interact.ts        # Demo flow
│   ├── user.ts            # User operations
│   └── admin.ts           # Admin operations
├── hardhat.config.ts      # Hardhat configuration
└── package.json           # Dependencies
```

## Common Issues

**"Error: could not detect network"**
→ Make sure `npx hardhat node` is running in another terminal

**"Nonce too high"**
→ Restart the Hardhat node (Ctrl+C and start again)

**"Cannot find module"**
→ Run `yarn install` or `npm install`

**"deployment.json not found"**
→ Run `npx hardhat run scripts/deploy.ts --network localhost` first

**"could not decode result data" or "function selector was not recognized"**
→ The Hardhat node was restarted after deploying. Re-run `deploy.ts` to deploy fresh contracts, then run `interact.ts` again. The contracts from the previous session no longer exist.

## Where to Go From Here

1. **Read the contracts**: Check out `contracts/YieldVault.sol` and `contracts/StakingVault.sol`
2. **Study the tests**: Look at files in `test/` to see how everything works
3. **Modify the demo**: Edit `scripts/interact.ts` to try different scenarios
4. **Deploy to testnet**: See QUICKSTART.md for deploying to Sepolia

## Complete Documentation

- [LOCAL_DEPLOYMENT_GUIDE.md](./LOCAL_DEPLOYMENT_GUIDE.md) - Detailed technical guide
- [QUICKSTART.md](./QUICKSTART.md) - Step-by-step tutorial
- [Hardhat Docs](https://hardhat.org/docs) - Official Hardhat documentation

## What Makes This Different From a Real Blockchain?

| Feature | Local (Hardhat) | Real Blockchain (Mainnet) |
|---------|----------------|---------------------------|
| Speed | Instant | 12-15 seconds per block |
| Cost | Free (fake ETH) | Real money (gas fees) |
| Persistence | Lost when stopped | Permanent |
| Time control | Can fast-forward | Real-time only |
| Debugging | Full stack traces | Limited info |
| Best for | Development & testing | Production use |

---

**Ready to build?** Start with `npx hardhat node` and see your contracts come to life! 🚀
