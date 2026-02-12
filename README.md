# Hastra Ethereum Vault Protocol

ERC-4626 tokenized vaults with two-step redemptions, merkle-based rewards, and UUPS upgradeability.

## 📚 Documentation

- **[Quick Start Guide](docs/QUICKSTART.md)** - Setup, local development, and common workflows
- **[Architecture & Flow Diagrams](docs/ARCHITECTURE.md)** - Visual guides for both vaults
- **[Roles & Permissions](docs/ROLES.md)** - Access control documentation
- **[Upgrade Guide](docs/UPGRADES.md)** - UUPS proxy upgrade process
- **[Compliance Features](docs/COMPLIANCE.md)** - Freeze/thaw and regulatory controls
- **[Error Codes](docs/ERROR_CODES.md)** - Troubleshooting transaction failures

## Overview

The Hastra Ethereum Vault Protocol consists of two ERC-4626 vaults:

```
USDC → [YieldVault] → wYLDS → [StakingVault] → PRIME
       (1:1 ratio)             (appreciation)
```

### YieldVault (wYLDS)

Deposit USDC and receive wYLDS tokens at a 1:1 ratio.

**Features:**
- ✅ ERC-4626 compliant (with modifications)
- ✅ Two-step redemption (regulatory compliance)
- ✅ Merkle-tree rewards distribution
- ✅ Account freeze/thaw functionality
- ✅ Whitelist for USDC withdrawals
- ⚠️ No instant redemption (use `requestRedeem` → admin `completeRedeem`)

### StakingVault (PRIME)

Stake wYLDS and receive PRIME tokens with share value appreciation.

**Features:**
- ✅ Fully ERC-4626 compliant
- ✅ Instant redemption (`withdraw` / `redeem`)
- ✅ Share-based rewards (value increases automatically)
- ✅ Account freeze/thaw functionality
- ✅ No unbonding period

## 🌐 Deployment

### Testnet (Hoodi) - **ACTIVE**

View deployment info: [`deployment_testnet.json`](./deployment_testnet.json)

| Contract | Address | Explorer |
|----------|---------|----------|
| YieldVault (Proxy) | `0x1355eBe3669FA92c1eD94c434aCF9d06E2BF7CC8` | [View →](https://hoodi.etherscan.io/address/0x1355eBe3669FA92c1eD94c434aCF9d06E2BF7CC8) |
| StakingVault (Proxy) | `0x45c3Ce1a86d25a25F7241f1973f12ff1D3D218f3` | [View →](https://hoodi.etherscan.io/address/0x45c3Ce1a86d25a25F7241f1973f12ff1D3D218f3) |
| USDC (Test) | `0xBa16F5b2fDF7D5686D55c2917F323feCbFef76e6` | [View →](https://hoodi.etherscan.io/address/0xBa16F5b2fDF7D5686D55c2917F323feCbFef76e6) |

**Network:** Hoodi Testnet (Chain ID: 560048)

```bash
# Check deployed versions
npx hardhat run scripts/upgrade_test/check_version.ts --network hoodi
```

### Mainnet

**Not yet deployed** - Pending audit and security review.

## Quick Start

**New to the project?** See [docs/QUICKSTART.md](./docs/QUICKSTART.md) for complete setup guide including:
- Installation and environment setup
- Local development with Hardhat node
- Running tests and demo flows
- Deploying to testnets
- Interactive console usage
- Common workflows and scripts

**Quick commands:**
```bash
# Install and compile
npm install && npx hardhat compile

# Run tests
npm test

# Deploy to testnet
npx hardhat run scripts/deploy.ts --network hoodi
```

## Usage Examples

### Deposit USDC → Receive wYLDS

```typescript
import { ethers } from "hardhat";

const usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS);
const vault = await ethers.getContractAt("YieldVault", VAULT_ADDRESS);

const amount = ethers.parseUnits("1000", 6); // 1000 USDC

// Approve and deposit
await usdc.approve(await vault.getAddress(), amount);
await vault.deposit(amount, user.address);

// User receives 1000 wYLDS (1:1 ratio)
```

### Request Redemption (Two-Step Process)

```typescript
const vault = await ethers.getContractAt("YieldVault", VAULT_ADDRESS);

// Step 1: User requests redemption
await vault.requestRedeem(ethers.parseUnits("500", 6));

// Step 2: Admin completes (requires REWARDS_ADMIN_ROLE)
// Off-chain: Compliance check, fund redeemVault
await vault.connect(admin).completeRedeem(user.address);

// User receives USDC
```

### Stake wYLDS → Receive PRIME

```typescript
const wYLDS = await ethers.getContractAt("YieldVault", WYLDS_ADDRESS);
const staking = await ethers.getContractAt("StakingVault", STAKING_ADDRESS);

const amount = ethers.parseUnits("1000", 6);

await wYLDS.approve(await staking.getAddress(), amount);
await staking.deposit(amount, user.address);

// User receives PRIME (share value appreciates with rewards)
```

### Claim Merkle Rewards

```typescript
const vault = await ethers.getContractAt("YieldVault", VAULT_ADDRESS);

// Load distribution file (generated off-chain)
const distribution = require("./distributions/epoch-0.json");
const userReward = distribution.rewards.find(r => r.address === user.address);

await vault.claimRewards(
  distribution.epochIndex,
  userReward.amount,
  userReward.proof
);
```

## Contract Comparison

```
┌──────────────────────┬───────────────────────────┬─────────────────────────────────────┐
│ Feature              │ YieldVault                │ StakingVault                        │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Asset                │ USDC (6 decimals)         │ wYLDS (6 decimals)                  │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Share Token          │ wYLDS (6 decimals)        │ PRIME (6 decimals)                  │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ ERC-4626 Compliant?  │ ❌ Modified               │ ✅ Yes, fully compliant             │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Conversion Ratio     │ Always 1:1                │ Appreciates with rewards            │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Instant Redemption   │ ❌ Disabled (reverts)     │ ✅ withdraw() / redeem()            │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Custom Redemption    │ ✅ Two-step process       │ ❌ Not needed                       │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Rewards              │ Merkle epochs             │ Direct minting to vault             │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Upgradeable          │ ✅ UUPS                   │ ✅ UUPS                             │
└──────────────────────┴───────────────────────────┴─────────────────────────────────────┘
```

**See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed flow diagrams.**

## Access Control Roles

| Role | YieldVault | StakingVault | Permissions |
|------|------------|--------------|-------------|
| `DEFAULT_ADMIN_ROLE` | ✅ | ✅ | Grant/revoke all roles ⚠️ **Protect with multisig** |
| `FREEZE_ADMIN_ROLE` | ✅ | ✅ | Freeze/thaw accounts |
| `REWARDS_ADMIN_ROLE` | ✅ | ✅ | Create epochs, mint rewards, complete redemptions |
| `PAUSER_ROLE` | ✅ | ✅ | Pause/unpause contract |
| `UPGRADER_ROLE` | ✅ | ✅ | Upgrade implementation |
| `WHITELIST_ADMIN_ROLE` | ✅ | ❌ | Manage USDC withdrawal whitelist |
| `WITHDRAWAL_ADMIN_ROLE` | ✅ | ❌ | Withdraw USDC to whitelisted addresses |

**See [docs/ROLES.md](docs/ROLES.md) for detailed role documentation.**

## Testing

```bash
# Run all tests
npm test

# Run specific test suite
npx hardhat test test/YieldVault.test.ts

# Coverage report
npm run test:coverage
```

**Test Coverage:**
```
113 passing (2s)

Coverage:
- Statements: 99.25%
- Functions: 100%
- Lines: 98.72%
```

**Key Test Suites:**
- `YieldVault.test.ts` - Core vault functionality
- `StakingVault.test.ts` - Staking and rewards
- `YieldVault_Ratio.test.ts` - 1:1 ratio enforcement
- `*_Upgrade.test.ts` - UUPS upgrade mechanics
- `*_Compliance.test.ts` - Freeze/thaw features
- `FullSystemFlow.test.ts` - End-to-end integration

## Troubleshooting

If a transaction fails, check [docs/ERROR_CODES.md](docs/ERROR_CODES.md) for common errors and solutions.

Common issues:
- `AccountIsFrozen` - Account frozen by compliance admin
- `RedemptionAlreadyPending` - Active redemption exists
- `AddressNotWhitelisted` - USDC withdrawal target not whitelisted
- `InsufficientVaultBalance` - Redeem vault lacks USDC

## Security

### ⚠️ Critical Security Requirements

1. **Multisig Protection** - Transfer `DEFAULT_ADMIN_ROLE` to multisig before production
   ```bash
   # See docs/MULTISIG_SETUP.md for setup guide
   MULTISIG_ADDRESS=0x... npx hardhat run scripts/setup-multisig-admin.ts --network mainnet
   ```

2. **Private Keys** - Never commit private keys to version control

3. **Audits** - Get professional security audits before mainnet deployment

4. **Testing** - Thoroughly test all operations on testnet first

### Security Features

- ✅ **Role-based access control** - OpenZeppelin AccessControl
- ✅ **Pause mechanism** - Emergency stops
- ✅ **Reentrancy protection** - All critical functions protected
- ✅ **Freeze/thaw** - Compliance controls
- ✅ **UUPS upgradeable** - Secure proxy pattern
- ✅ **Double-claim prevention** - Merkle rewards tracking

**See [docs/UPGRADES.md](docs/UPGRADES.md) for upgrade process.**

## Scripts

### Deployment
```bash
# Deploy to testnet
npx hardhat run scripts/deploy.ts --network hoodi

# Deploy to mainnet
npx hardhat run scripts/deploy.ts --network mainnet
```

### Admin Operations
```bash
# Grant/revoke roles
npx hardhat run scripts/admin.ts --network hoodi

# Manage whitelist
npx hardhat run scripts/manage-whitelist.ts --network hoodi

# Distribute rewards
npx hardhat run scripts/distribute-rewards.ts --network hoodi
```

### User Operations
```bash
# Deposit USDC
npx hardhat run scripts/deposit-usdc.ts --network hoodi

# Stake wYLDS
npx hardhat run scripts/stake-wylds.ts --network hoodi

# Request redemption
npx hardhat run scripts/unstake-and-redeem.ts --network hoodi
```

### Upgrade & Maintenance
```bash
# Check version
npx hardhat run scripts/upgrade_test/check_version.ts --network hoodi

# Upgrade to V2
npx hardhat run scripts/upgrade_to_v2.ts --network hoodi

# Check multisig status
npx hardhat run scripts/check-multisig-status.ts --network hoodi
```

## Local Development

See [docs/QUICKSTART.md](./docs/QUICKSTART.md) for detailed local development guide including:
- Setting up local Hardhat node
- Deploying contracts locally
- Running demo flows
- Interactive console usage
- Complete command reference

## Gas Costs (Approximate)

| Operation | Gas Cost |
|-----------|----------|
| YieldVault.deposit | ~150,000 |
| YieldVault.requestRedeem | ~100,000 |
| YieldVault.completeRedeem | ~120,000 |
| YieldVault.claimRewards | ~80,000 |
| StakingVault.deposit | ~150,000 |
| StakingVault.withdraw | ~100,000 |
| StakingVault.distributeRewards | ~120,000 |

## License

Apache-2.0 - See [LICENSE](./LICENSE)

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## Support

- **GitHub Issues**: [Create an issue](https://github.com/provenance-io/hastra-eth-vault/issues)
- **Documentation**: See `/docs` folder for detailed guides

## Acknowledgments

- OpenZeppelin for battle-tested contract libraries
- ERC-4626 standard authors
- Solana Hastra Vault for the original implementation

---

**⚠️ Status**: Testnet deployment. Not audited. Use at your own risk.
