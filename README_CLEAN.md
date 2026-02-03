# Hastra Ethereum Vault Protocol

ERC-4626 tokenized vaults with two-step redemptions, merkle rewards, and UUPS upgradeability.

## 🚀 Deployment Information

### Testnet (Hoodi) - **ACTIVE**

Deployment addresses available in [`deployment_testnet.json`](./deployment_testnet.json):

```bash
# View deployed contracts
npx hardhat run scripts/upgrade_test/check_version.ts --network hoodi

# Get implementation addresses
npx hardhat run scripts/get_implementations.ts --network hoodi
```

**Quick Access:**
- **YieldVault (Proxy)**: `0xBf000e0362d967B3583fdE2451BeA11b3723b81C`
- **StakingVault (Proxy)**: `0x14D815D29F9b39859a55F1392cff217ED642a8Ea`
- **USDC (Test)**: `0xBa16F5b2fDF7D5686D55c2917F323feCbFef76e6`

[View on Hoodi Explorer →](https://hoodi.etherscan.io/address/0xBf000e0362d967B3583fdE2451BeA11b3723b81C)

## Key Features

### Two-Vault System

```
USDC → [YieldVault] → wYLDS → [StakingVault] → PRIME
       (1:1 ratio)            (appreciation)
```

| Contract | Token | Asset | Type | Features |
|----------|-------|-------|------|----------|
| **YieldVault** | wYLDS | USDC | ERC-4626 (Modified) | Two-step redemption, Merkle rewards, 1:1 peg |
| **StakingVault** | PRIME | wYLDS | ERC-4626 (Standard) | Instant redemption, Share appreciation |

### Contract Comparison

```
┌──────────────────────┬───────────────────────────┬─────────────────────────────────────┐
│ Feature              │ YieldVault                │ StakingVault                        │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ ERC-4626 Compliant?  │ ❌ Modified               │ ✅ Yes, fully compliant             │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ withdraw()/redeem()  │ ❌ Disabled (reverts)     │ ✅ Works normally                   │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Conversion functions │ ❌ Overridden to 1:1      │ ✅ Uses standard share appreciation │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Share value changes? │ ❌ Always 1:1             │ ✅ Yes, increases with rewards      │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Redemption           │ Two-step (admin approval) │ Instant (standard ERC-4626)         │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Use Case             │ Regulatory compliance     │ Yield generation                    │
└──────────────────────┴───────────────────────────┴─────────────────────────────────────┘
```

### Core Features
- **Two-Step Redemption** - Admin-approved withdrawals for regulatory compliance
- **Merkle Rewards** - Gas-efficient epoch-based reward distribution
- **Freeze/Thaw** - Compliance controls for account restrictions
- **UUPS Upgradeable** - Secure proxy pattern with UPGRADER_ROLE
- **Role-Based Access** - OpenZeppelin AccessControl

## Error Codes

If a transaction fails, check the error:

| Error Name | Meaning | Resolution |
|-----------|---------|------------|
| **AccountIsFrozen** | Account frozen by compliance | Contact admin to thaw account |
| **AccountNotFrozen** | Account not frozen | Cannot thaw unfrozen account |
| **InvalidAmount** | Amount must be > 0 | Provide non-zero amount |
| **InvalidAddress** | Address cannot be zero | Check address parameter |
| **RedemptionAlreadyPending** | Redemption in progress | Cancel existing redemption first |
| **NoRedemptionPending** | No active redemption | Call requestRedeem() first |
| **RewardsAlreadyClaimed** | Rewards claimed for epoch | Each user can claim once per epoch |
| **InvalidProof** | Merkle proof invalid | Verify proof matches merkle root |
| **InsufficientVaultBalance** | Redeem vault has low USDC | Wait for vault to be funded |

## Documentation

- **[docs/ROLES.md](docs/ROLES.md)** - Access control roles and permissions
- **[docs/UPGRADES.md](docs/UPGRADES.md)** - UUPS upgrade guide and testing
- **[docs/COMPLIANCE.md](docs/COMPLIANCE.md)** - Freeze/thaw and regulatory features
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Flow diagrams for wYLDS and PRIME vaults

## Quick Start

```bash
# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Run all tests
npm test

# Check coverage
npm run test:coverage

# Deploy to testnet
npx hardhat run scripts/deploy.ts --network hoodi

# Run demo interactions
./scripts/run_demo_interactions.sh
```

## Testing

```
113 passing (2s)

Coverage:
- Statements: 99.25%
- Functions: 100%
- Lines: 98.72%
```

Key test suites:
- `YieldVault.test.ts` - Core vault functionality
- `StakingVault.test.ts` - Staking and rewards
- `YieldVault_Ratio.test.ts` - 1:1 ratio enforcement
- `*_Upgrade.test.ts` - UUPS upgrade mechanics
- `*_Compliance.test.ts` - Freeze/thaw features

## Development

```bash
# Local development network
npx hardhat node

# Deploy locally
npx hardhat run scripts/deploy.ts --network localhost

# Run specific test
npx hardhat test --grep "YieldVault"

# Check contract versions
npx hardhat run scripts/upgrade_test/check_version.ts --network hoodi

# Upgrade to V2 (test)
npx hardhat run scripts/upgrade_to_v2.ts --network hoodi
```

## License

Apache 2.0 - See [LICENSE](./LICENSE)

## Related

- [Sui YLDS](../sui_ylds) - Sui blockchain implementation
- [Figure Markets](https://figure.com) - Parent organization

---

**⚠️ Status**: Testnet deployment. Not audited. Use at your own risk.
