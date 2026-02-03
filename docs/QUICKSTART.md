# Hastra Ethereum Vault - Quick Start Guide

Get started with the Hastra Ethereum Vault Protocol in under 10 minutes.

## Prerequisites

- Node.js >= 18
- npm or yarn
- Git

## 1. Installation & Setup

```bash
# Clone repository
git clone https://github.com/your-org/hastra-eth-vault.git
cd hastra-eth-vault

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### Environment Configuration

Edit `.env` with your settings:

```env
# Network RPC URLs
HOODI_RPC_URL=https://rpc.hoodi.ethpandaops.io/
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY

# Deployment private key (DO NOT COMMIT)
PRIVATE_KEY=your_private_key_here

# Optional: Use existing USDC (mainnet)
USDC_ADDRESS=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48

# Optional: Custom admin addresses
REDEEM_VAULT_ADDRESS=0x...
FREEZE_ADMIN_ADDRESS=0x...
REWARDS_ADMIN_ADDRESS=0x...
WHITELIST_ADMIN_ADDRESS=0x...
WITHDRAWAL_ADMIN_ADDRESS=0x...

# Gas reporting (optional)
REPORT_GAS=true
COINMARKETCAP_API_KEY=your_api_key
```

For local development, the defaults are fine - no need to configure anything!

## 2. Compile Contracts

```bash
npx hardhat compile
```

This generates:
- Contract artifacts in `artifacts/`
- TypeScript types in `typechain-types/`

## 3. Run Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run with gas reporting
REPORT_GAS=true npm test

# Run specific test file
npx hardhat test test/YieldVault.test.ts
```

**Expected Output:**
```
113 passing (2s)

Coverage:
- Statements: 99.25%
- Functions: 100%
- Lines: 98.72%
```

## 4. Local Development

### Start Local Hardhat Node

```bash
# Terminal 1: Start local node
npx hardhat node

# Keep this running...
```

This starts a local Ethereum node at `http://127.0.0.1:8545/` with 20 pre-funded accounts.

### Deploy Contracts Locally

```bash
# Terminal 2: Deploy to local network
npx hardhat run scripts/deploy.ts --network localhost
```

**Save the deployment addresses from the output!** Example:
```
MockUSDC deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
YieldVault deployed to: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
StakingVault deployed to: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
```

### Run Demo Interactions

```bash
# Run full demo flow
./scripts/run_demo_interactions.sh

# Run rewards distribution demo
./scripts/run_rewards_demo.sh

# Run cancellation demo
./scripts/run_cancel_demo.sh
```

## 5. Interact with Contracts

### Using Hardhat Console

```bash
npx hardhat console --network localhost
```

```javascript
// Get signers
const [deployer, user1, user2] = await ethers.getSigners();

// Attach to deployed contracts
const usdc = await ethers.getContractAt("MockUSDC", "0x5FbDB2315678afecb367f032d93F642f64180aa3");
const yieldVault = await ethers.getContractAt("YieldVault", "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512");
const stakingVault = await ethers.getContractAt("StakingVault", "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0");

// Check balances
const usdcBalance = await usdc.balanceOf(deployer.address);
console.log("USDC Balance:", ethers.formatUnits(usdcBalance, 6));

const wyldsBalance = await yieldVault.balanceOf(deployer.address);
console.log("wYLDS Balance:", ethers.formatUnits(wyldsBalance, 6));

// Approve and deposit
await usdc.approve(await yieldVault.getAddress(), ethers.parseUnits("1000", 6));
await yieldVault.deposit(ethers.parseUnits("1000", 6), deployer.address);
console.log("Deposited 1000 USDC!");
```

### Using Scripts

Set environment variables for your local deployment:

```bash
export USDC_ADDRESS="0x5FbDB2315678afecb367f032d93F642f64180aa3"
export YIELD_VAULT_ADDRESS="0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
export STAKING_VAULT_ADDRESS="0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"
```

Then run operations:

```bash
# Deposit USDC
npx hardhat run scripts/deposit-usdc.ts --network localhost

# Stake wYLDS
npx hardhat run scripts/stake-wylds.ts --network localhost

# Check whitelist
npx hardhat run scripts/check-whitelist.ts --network localhost

# Distribute rewards
npx hardhat run scripts/distribute-rewards.ts --network localhost
```

## 6. Common Workflows

### User Flow: Deposit → Stake → Unstake

```bash
# 1. Deposit USDC to get wYLDS (1:1 ratio)
npx hardhat run scripts/deposit-usdc.ts --network localhost

# 2. Stake wYLDS to get PRIME
npx hardhat run scripts/stake-wylds.ts --network localhost

# 3. Unstake PRIME back to wYLDS (instant!)
npx hardhat run scripts/unstake-and-redeem.ts --network localhost

# 4. Request redemption (wYLDS → USDC requires admin)
# User calls requestRedeem(), admin completes
```

### Admin Flow: Distribute Rewards

```bash
# 1. Distribute rewards to StakingVault (increases PRIME value)
npx hardhat run scripts/distribute-rewards.ts --network localhost

# All PRIME holders automatically benefit - share value increases!
```

### Admin Flow: Create Merkle Rewards Epoch

```bash
# 1. Generate distribution file (off-chain)
# Create distributions/epoch-0.json with addresses and amounts

# 2. Create epoch on YieldVault
npx hardhat run scripts/admin.ts --network localhost
# Then use createRewardsEpoch function

# 3. Users claim rewards with merkle proofs
# Each user can claim their rewards once per epoch
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

## 7. Deploy to Testnet

### Deploy to Hoodi Testnet

```bash
# 1. Get testnet ETH for gas (from faucet)

# 2. Update .env with your private key
PRIVATE_KEY=your_private_key_here
HOODI_RPC_URL=https://rpc.hoodi.ethpandaops.io/

# 3. Deploy
npx hardhat run scripts/deploy.ts --network hoodi

# 4. Save addresses to deployment_testnet.json (auto-saved)
```

### Deploy to Sepolia

```bash
# 1. Get Sepolia ETH from https://sepoliafaucet.com/

# 2. Update .env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY

# 3. Deploy
npx hardhat run scripts/deploy.ts --network sepolia

# 4. Verify on Etherscan
npx hardhat verify --network sepolia <YIELD_VAULT_ADDRESS> \
  <USDC_ADDRESS> "wYLDS" "wYLDS" <ADMIN_ADDRESS> <REDEEM_VAULT_ADDRESS> <INITIAL_WHITELIST>
```

## 8. Command Reference

### Testing & Compilation
```bash
npm test                      # Run all tests
npm run test:coverage         # Coverage report
REPORT_GAS=true npm test      # Gas usage report
npx hardhat compile           # Compile contracts
npx hardhat clean             # Clean artifacts
```

### Deployment
```bash
npx hardhat node                                    # Start local node
npx hardhat run scripts/deploy.ts --network localhost    # Deploy locally
npx hardhat run scripts/deploy.ts --network hoodi        # Deploy to Hoodi
npx hardhat run scripts/deploy.ts --network sepolia      # Deploy to Sepolia
```

### User Operations
```bash
npx hardhat run scripts/deposit-usdc.ts --network localhost
npx hardhat run scripts/stake-wylds.ts --network localhost
npx hardhat run scripts/unstake-and-redeem.ts --network localhost
npx hardhat run scripts/cancel-redemption.ts --network localhost
```

### Admin Operations
```bash
npx hardhat run scripts/admin.ts --network localhost
npx hardhat run scripts/manage-whitelist.ts --network localhost
npx hardhat run scripts/distribute-rewards.ts --network localhost
```

### Maintenance
```bash
npx hardhat run scripts/upgrade_test/check_version.ts --network hoodi
npx hardhat run scripts/upgrade_to_v2.ts --network hoodi
npx hardhat run scripts/check-multisig-status.ts --network hoodi
```

## Troubleshooting

### "Cannot find module" or dependency errors
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

### "Invalid nonce" on local network
```bash
# Reset local node
# Stop the node (Ctrl+C) and restart it
npx hardhat node
```

### "Transaction underpriced"
**Solution**: Increase gas price in `hardhat.config.ts` or wait for network congestion to clear.

### Compilation errors
```bash
# Clean and recompile
npx hardhat clean
npx hardhat compile
```

### "AccountIsFrozen" error
**Solution**: Check if your account is frozen. Contact admin to thaw if needed.

### "AddressNotWhitelisted" error
**Solution**: For USDC withdrawals, the destination address must be whitelisted by admin.

**More errors?** See [docs/ERROR_CODES.md](./docs/ERROR_CODES.md) for complete list.

## Next Steps

- **[README.md](./README.md)** - Full project documentation
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Flow diagrams and system design
- **[docs/ROLES.md](./docs/ROLES.md)** - Access control and permissions
- **[docs/UPGRADES.md](./docs/UPGRADES.md)** - UUPS upgrade process
- **[docs/ERROR_CODES.md](./docs/ERROR_CODES.md)** - Complete error reference
- **[test/](./test/)** - Test files with usage examples

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
