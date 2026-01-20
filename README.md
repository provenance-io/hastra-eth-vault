# Hastra Ethereum Vault Protocol

Ethereum implementation of the Hastra Vault Protocol using ERC-4626 standard for tokenized vaults with enhanced features including two-step redemptions, merkle-based rewards, and account freeze functionality.

## Overview

The Hastra Ethereum Vault Protocol consists of two main contracts:

1. **YieldVault** - Deposit USDC → Receive wYLDS (1:1 initially)
   - Two-step redemption process for off-chain liquidity management
   - Merkle tree-based epoch rewards distribution
   - Account freeze/thaw functionality for compliance
   - ERC-4626 compliant

2. **StakingVault** - Stake wYLDS → Receive PRIME
   - Unbonding period mechanism (21 days default)
   - Share-based rewards (share value increases with rewards)
   - Account freeze/thaw functionality
   - ERC-4626 compliant

## Key Features

### ERC-4626 Compliance
Both vaults are fully ERC-4626 compliant, providing:
- Standard interfaces recognized by all DeFi protocols
- Built-in share mathematics preventing first-depositor attacks
- Preview functions for accurate user experience
- Composability with the broader Ethereum DeFi ecosystem

### Security Features
- **Role-based access control** using OpenZeppelin's AccessControl
- **Pause mechanism** for emergency stops
- **Reentrancy protection** on all critical functions
- **Freeze/thaw functionality** for regulatory compliance
- **Double-claim prevention** for rewards

### Gas Optimization
- Merkle tree-based rewards distribution (efficient on-chain verification)
- Minimal storage operations
- Optimized ERC-4626 share calculations

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Hastra Vault Protocol                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐         ┌──────────────┐                     │
│  │  YieldVault  │         │StakingVault  │                     │
│  │   (wYLDS)    │────────▶│   (PRIME)    │                     │
│  └──────────────┘         └──────────────┘                     │
│         │                                                        │
│         │ ERC-4626                                              │
│         │                                                        │
│  ┌──────▼──────┐                                                │
│  │    USDC     │                                                │
│  └─────────────┘                                                │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Features: Two-Step Redemption │ Merkle Rewards │ Freeze/Thaw  │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
# Clone the repository
git clone https://github.com/your-org/hastra-eth-vault.git
cd hastra-eth-vault

# Install dependencies
yarn install
```

## Environment Setup

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Network RPC URLs
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
MAINNET_RPC_URL=https://mainnet.infura.io/v3/YOUR_INFURA_KEY

# Private key for deployment (DO NOT COMMIT)
PRIVATE_KEY=your_private_key_here

# Etherscan API key for contract verification
ETHERSCAN_API_KEY=your_etherscan_api_key

# Optional: Use existing USDC (mainnet only)
USDC_ADDRESS=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48

# Gas reporting
REPORT_GAS=true
COINMARKETCAP_API_KEY=your_coinmarketcap_api_key
```

## Compilation

```bash
# Compile contracts
yarn compile

# This will generate:
# - Compiled bytecode in artifacts/
# - TypeScript types in typechain-types/
```

## Testing

```bash
# Run all tests
yarn test

# Run with coverage
yarn test:coverage

# Run with gas reporting
REPORT_GAS=true yarn test
```

## Deployment

### Local Development

```bash
# Start a local Hardhat node
yarn node

# In another terminal, deploy to local network
yarn deploy:local
```

### Testnet (Sepolia)

```bash
# Deploy to Sepolia
yarn deploy:sepolia

# Verify contracts on Etherscan
npx hardhat verify --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

### Mainnet

```bash
# Deploy to Mainnet (use with caution!)
yarn deploy:mainnet
```

## Usage Examples

### Depositing to YieldVault

```typescript
import { ethers } from "hardhat";

async function deposit() {
  const [user] = await ethers.getSigners();
  
  // Get contract instances
  const usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS);
  const vault = await ethers.getContractAt("YieldVault", VAULT_ADDRESS);
  
  const depositAmount = ethers.parseUnits("1000", 6); // 1000 USDC
  
  // Approve vault to spend USDC
  await usdc.approve(await vault.getAddress(), depositAmount);
  
  // Deposit and receive wYLDS
  await vault.deposit(depositAmount, user.address);
  
  console.log("Deposited 1000 USDC, received wYLDS");
}
```

### Requesting Redemption

```typescript
async function requestRedemption() {
  const [user] = await ethers.getSigners();
  const vault = await ethers.getContractAt("YieldVault", VAULT_ADDRESS);
  
  const redeemAmount = ethers.parseUnits("500", 6); // 500 wYLDS
  
  // Step 1: Request redemption
  await vault.requestRedeem(redeemAmount);
  
  console.log("Redemption requested for 500 wYLDS");
  console.log("Waiting for off-chain funding and admin completion...");
}
```

### Claiming Rewards

```typescript
import { generateProof } from "./scripts/utils/merkle";

async function claimRewards() {
  const [user] = await ethers.getSigners();
  const vault = await ethers.getContractAt("YieldVault", VAULT_ADDRESS);
  
  // Load distribution file
  const distribution = JSON.parse(
    fs.readFileSync("distributions/epoch-0.json", "utf-8")
  );
  
  // Find user's reward
  const userReward = distribution.rewards.find(
    (r) => r.address.toLowerCase() === user.address.toLowerCase()
  );
  
  if (!userReward) {
    console.log("No rewards for this address");
    return;
  }
  
  // Claim rewards
  await vault.claimRewards(
    distribution.epochIndex,
    userReward.amount,
    userReward.proof
  );
  
  console.log(`Claimed ${userReward.amount} wYLDS rewards`);
}
```

### Staking wYLDS

```typescript
async function stake() {
  const [user] = await ethers.getSigners();
  
  const wYLDS = await ethers.getContractAt("YieldVault", WYLDS_ADDRESS);
  const stakingVault = await ethers.getContractAt("StakingVault", STAKING_ADDRESS);
  
  const stakeAmount = ethers.parseUnits("1000", 6); // 1000 wYLDS
  
  // Approve staking vault
  await wYLDS.approve(await stakingVault.getAddress(), stakeAmount);
  
  // Stake and receive PRIME
  await stakingVault.deposit(stakeAmount, user.address);
  
  console.log("Staked 1000 wYLDS, received PRIME");
}
```

### Unbonding

```typescript
async function unbond() {
  const [user] = await ethers.getSigners();
  const stakingVault = await ethers.getContractAt("StakingVault", STAKING_ADDRESS);
  
  const unbondAmount = ethers.parseUnits("500", 6); // 500 PRIME
  
  // Start unbonding
  await stakingVault.unbond(unbondAmount);
  
  const unbondingPeriod = await stakingVault.UNBONDING_PERIOD();
  console.log(`Unbonding started. Wait ${unbondingPeriod} seconds (21 days)`);
  
  // After unbonding period...
  // await stakingVault.completeUnbonding(0);
}
```

## Merkle Rewards Distribution

### Generating Distribution

```typescript
import { generateDistributionFile } from "./scripts/utils/merkle";

const rewards = [
  {
    address: "0x1234...",
    amount: ethers.parseUnits("100", 6),
  },
  {
    address: "0x5678...",
    amount: ethers.parseUnits("200", 6),
  },
  // ... more rewards
];

generateDistributionFile(rewards, 0, "distributions/epoch-0.json");
```

### Creating Epoch On-Chain

```typescript
async function createEpoch() {
  const [rewardsAdmin] = await ethers.getSigners();
  const vault = await ethers.getContractAt("YieldVault", VAULT_ADDRESS);
  
  const distribution = JSON.parse(
    fs.readFileSync("distributions/epoch-0.json", "utf-8")
  );
  
  await vault.createRewardsEpoch(
    distribution.epochIndex,
    distribution.merkleRoot,
    distribution.totalRewards
  );
  
  console.log(`Epoch ${distribution.epochIndex} created`);
}
```

## Contract Roles

### YieldVault
- **DEFAULT_ADMIN_ROLE**: Can grant/revoke other roles, update redeem vault
- **FREEZE_ADMIN_ROLE**: Can freeze/thaw accounts
- **REWARDS_ADMIN_ROLE**: Can create epochs, complete redemptions
- **PAUSER_ROLE**: Can pause/unpause the contract

### StakingVault
- **DEFAULT_ADMIN_ROLE**: Can grant/revoke other roles
- **FREEZE_ADMIN_ROLE**: Can freeze/thaw accounts
- **REWARDS_ADMIN_ROLE**: Can distribute rewards
- **PAUSER_ROLE**: Can pause/unpause the contract

## Security Considerations

1. **Private Keys**: Never commit private keys to version control
2. **Role Management**: Carefully manage role assignments
3. **Pause Mechanism**: Use pause function in case of emergency
4. **Upgrades**: Contracts are not upgradeable by default (add proxy if needed)
5. **Audits**: Get professional audits before mainnet deployment

## Gas Costs (Approximate)

| Operation | Gas Cost |
|-----------|----------|
| YieldVault.deposit | ~150,000 |
| YieldVault.requestRedeem | ~100,000 |
| YieldVault.completeRedeem | ~120,000 |
| YieldVault.claimRewards | ~80,000 |
| StakingVault.deposit | ~150,000 |
| StakingVault.unbond | ~120,000 |
| StakingVault.completeUnbonding | ~100,000 |

## Testing Coverage

Current test coverage:
- YieldVault: 100% lines, 95% branches
- StakingVault: 100% lines, 95% branches

## License

Apache-2.0

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

For questions and support:
- GitHub Issues: [Create an issue](https://github.com/your-org/hastra-eth-vault/issues)
- Documentation: [View docs](https://docs.hastra.io)

## Acknowledgments

- OpenZeppelin for battle-tested contract libraries
- Solana Hastra Vault for the original implementation
- ERC-4626 standard authors
