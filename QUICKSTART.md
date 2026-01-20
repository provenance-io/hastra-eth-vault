# Hastra Ethereum Vault - Quick Start Guide

This guide will help you get started with the Hastra Ethereum Vault Protocol in under 10 minutes.

## Prerequisites

- Node.js >= 18
- Yarn
- Git

## 1. Installation

```bash
# Clone the repository
git clone https://github.com/your-org/hastra-eth-vault.git
cd hastra-eth-vault

# Install dependencies
yarn install
```

## 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your settings (for local development, defaults are fine)
```

## 3. Compile Contracts

```bash
yarn compile
```

This generates:
- Contract artifacts in `artifacts/`
- TypeScript types in `typechain-types/`

## 4. Run Tests

```bash
# Run all tests
yarn test

# Run with coverage
yarn test:coverage
```

## 5. Local Deployment

```bash
# Terminal 1: Start local Hardhat node
yarn node

# Terminal 2: Deploy contracts
yarn deploy:local
```

Save the deployment addresses shown in the output!

## 6. Interact with Contracts

### Using Hardhat Console

```bash
npx hardhat console --network localhost
```

```javascript
// In console
const YieldVault = await ethers.getContractFactory("YieldVault");
const vault = await YieldVault.attach("YOUR_VAULT_ADDRESS");

// Check your balance
const [user] = await ethers.getSigners();
const balance = await vault.balanceOf(user.address);
console.log("Balance:", ethers.formatUnits(balance, 6));
```

### Using Scripts

```bash
# Set environment variables
export USDC_ADDRESS="0x..."
export YIELD_VAULT_ADDRESS="0x..."
export STAKING_VAULT_ADDRESS="0x..."

# View balances
npx hardhat run scripts/user.ts balances --network localhost

# Deposit 1000 USDC
npx hardhat run scripts/user.ts deposit 1000 --network localhost

# Stake 500 wYLDS
npx hardhat run scripts/user.ts stake 500 --network localhost
```

## 7. Common Workflows

### User Flow: Deposit → Stake → Unbond

```bash
# 1. Deposit USDC to get wYLDS
npx hardhat run scripts/user.ts deposit 1000

# 2. Stake wYLDS to get PRIME
npx hardhat run scripts/user.ts stake 1000

# 3. Unbond PRIME
npx hardhat run scripts/user.ts unbond 500

# 4. Wait 21 days...

# 5. Complete unbonding
npx hardhat run scripts/user.ts complete-unbonding 0
```

### Admin Flow: Create Rewards Epoch

```bash
# 1. Generate merkle tree (see example in scripts/utils/merkle.ts)
node -r ts-node/register scripts/utils/merkle.ts

# 2. Create epoch on-chain
npx hardhat run scripts/admin.ts create-epoch 0 <MERKLE_ROOT> <TOTAL_REWARDS>

# 3. Users can now claim
npx hardhat run scripts/user.ts claim-rewards 0 distributions/epoch-0.json
```

## 8. Testing Rewards Distribution

```javascript
// scripts/test-rewards.ts
import { generateDistributionFile } from "./utils/merkle";

const rewards = [
  { address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", amount: ethers.parseUnits("100", 6) },
  { address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", amount: ethers.parseUnits("200", 6) },
];

generateDistributionFile(rewards, 0, "distributions/epoch-0.json");
```

## 9. Deployment to Testnet (Sepolia)

```bash
# 1. Fund your deployer account with Sepolia ETH
# Get from: https://sepoliafaucet.com/

# 2. Update .env with Sepolia RPC URL and private key

# 3. Deploy
yarn deploy:sepolia

# 4. Verify contracts
npx hardhat verify --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

## 10. Common Commands Reference

### Testing
```bash
yarn test                    # Run all tests
yarn test:coverage          # Run with coverage
REPORT_GAS=true yarn test   # Run with gas reporting
```

### Compilation
```bash
yarn compile            # Compile contracts
yarn clean              # Clean artifacts
yarn typechain          # Generate TypeScript types
```

### Deployment
```bash
yarn deploy:local       # Deploy to local network
yarn deploy:sepolia     # Deploy to Sepolia
yarn deploy:mainnet     # Deploy to mainnet
```

### User Operations
```bash
npx hardhat run scripts/user.ts deposit <amount>
npx hardhat run scripts/user.ts stake <amount>
npx hardhat run scripts/user.ts unbond <amount>
npx hardhat run scripts/user.ts balances
```

### Admin Operations
```bash
npx hardhat run scripts/admin.ts pause <contract>
npx hardhat run scripts/admin.ts freeze <contract> <account>
npx hardhat run scripts/admin.ts create-epoch <index> <root> <total>
```

## Troubleshooting

### Issue: "Cannot find module"
**Solution**: Run `yarn install` again

### Issue: "Invalid nonce"
**Solution**: Reset your account nonce:
```bash
npx hardhat clean
# Restart local node
```

### Issue: "Transaction underpriced"
**Solution**: Increase gas price in hardhat.config.ts

### Issue: Compilation errors
**Solution**: Check Solidity version compatibility:
```bash
yarn clean
yarn compile
```

## Next Steps

1. Read the [full README](./README.md) for detailed documentation
2. Explore the [test files](./test/) for usage examples
3. Check out [contract documentation](./docs/) (generate with `yarn docs`)
4. Join our [Discord](https://discord.gg/hastra) for support

## Architecture Diagram

```
┌─────────────────────────────────────────────┐
│             User Actions                     │
├─────────────────────────────────────────────┤
│                                              │
│  Deposit USDC ──> Get wYLDS (1:1)           │
│       │                                      │
│       └──> Stake wYLDS ──> Get PRIME        │
│                  │                           │
│                  └──> Earn Rewards          │
│                       (Share value ↑)        │
│                                              │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│           Admin Actions                      │
├─────────────────────────────────────────────┤
│                                              │
│  Create Epochs ──> Users Claim Rewards      │
│  Distribute Rewards ──> PRIME Value ↑       │
│  Complete Redeems ──> Users Get USDC        │
│                                              │
└─────────────────────────────────────────────┘
```

## Security Reminders

- ⚠️ Never commit `.env` file
- ⚠️ Use separate wallets for testnet and mainnet
- ⚠️ Always test on testnet first
- ⚠️ Get professional audits before mainnet deployment
- ⚠️ Use multi-sig for admin roles on mainnet

## Support

- GitHub Issues: [Report a bug](https://github.com/your-org/hastra-eth-vault/issues)
- Discord: [Join community](https://discord.gg/hastra)
- Docs: [Full documentation](https://docs.hastra.io)

---

**Happy Building! 🚀**
