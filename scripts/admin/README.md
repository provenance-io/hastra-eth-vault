# Admin Scripts

Administrative tools for managing YieldVault and StakingVault contracts.

## Overview

This folder contains scripts for contract administration including role management, pausing/unpausing, and other privileged operations.

## Setup

The script automatically reads contract addresses from deployment files:
- `deployment_testnet.json` (checked first)
- `deployment.json` (fallback)

You can also override addresses with environment variables:
```bash
export YIELD_VAULT_ADDRESS=0x...
export STAKING_VAULT_ADDRESS=0x...
```

## Whitelist Management

### Check Current Whitelist

```bash
npx hardhat run scripts/admin/check-whitelist.ts --network hoodi
```

Shows all whitelisted addresses on YieldVault.

### Add/Remove Whitelist Addresses

```bash
# Add an address
YIELD_VAULT_ADDRESS=0x... TARGET_ADDRESS=0x... ACTION=add \
  npx hardhat run scripts/admin/manage-whitelist.ts --network hoodi

# Remove an address
YIELD_VAULT_ADDRESS=0x... TARGET_ADDRESS=0x... ACTION=remove \
  npx hardhat run scripts/admin/manage-whitelist.ts --network hoodi
```

### Rotate Whitelist (Add New, Remove Old)

```bash
# Edit rotate-whitelist.sh to set addresses, then run:
/bin/bash scripts/admin/rotate-whitelist.sh
```

---

## Usage

### Delegate Any Role

Grant any role to an address on both vaults (or specific vault):

```bash
# Delegate to both vaults (default)
COMMAND=delegate-role ROLE=REWARDS_ADMIN TARGET_ADDRESS=0x803AdF8d4F036134070Bde997f458502Ade2f834 \
  npx hardhat run scripts/admin/admin.ts --network hoodi

# Delegate to YieldVault only
COMMAND=delegate-role ROLE=WHITELIST_ADMIN TARGET_ADDRESS=0x... VAULT_TYPE=yield \
  npx hardhat run scripts/admin/admin.ts --network hoodi

# Delegate to StakingVault only
COMMAND=delegate-role ROLE=PAUSER TARGET_ADDRESS=0x... VAULT_TYPE=staking \
  npx hardhat run scripts/admin/admin.ts --network hoodi

# For mainnet
COMMAND=delegate-role ROLE=FREEZE_ADMIN TARGET_ADDRESS=0x... \
  npx hardhat run scripts/admin/admin.ts --network mainnet
```

**Environment Variables:**
- `COMMAND` - Command to execute (required)
- `ROLE` - Role name (required for delegate-role)
- `TARGET_ADDRESS` - Address to grant role to (required)
- `VAULT_TYPE` - Target vault: `both` (default), `yield`, or `staking`

**Available Roles:**
- `REWARDS_ADMIN` - Complete redemptions, create epochs, distribute rewards
- `FREEZE_ADMIN` - Freeze/thaw accounts
- `PAUSER` - Pause/unpause contracts
- `UPGRADER` - Upgrade contract implementations
- `DEFAULT_ADMIN` - Grant/revoke all roles
- `WHITELIST_ADMIN` - Manage withdrawal whitelist (YieldVault only)
- `WITHDRAWAL_ADMIN` - Withdraw USDC to whitelist (YieldVault only)

**Vault Types:**
- `both` (default) - Grant on both YieldVault and StakingVault
- `yield` - Grant on YieldVault only
- `staking` - Grant on StakingVault only

### Grant a Specific Role

```bash
COMMAND=grant-role CONTRACT_ADDRESS=0x... ROLE=FREEZE_ADMIN TARGET_ADDRESS=0x... \
  npx hardhat run scripts/admin/admin.ts --network hoodi
```

### Revoke a Role

```bash
COMMAND=revoke-role CONTRACT_ADDRESS=0x... ROLE=PAUSER TARGET_ADDRESS=0x... \
  npx hardhat run scripts/admin/admin.ts --network hoodi
```

### Pause/Unpause a Vault

```bash
# Pause
COMMAND=pause CONTRACT_ADDRESS=0x... \
  npx hardhat run scripts/admin/admin.ts --network hoodi

# Unpause
COMMAND=unpause CONTRACT_ADDRESS=0x... \
  npx hardhat run scripts/admin/admin.ts --network hoodi
```

### Freeze/Thaw an Account

```bash
# Freeze
COMMAND=freeze CONTRACT_ADDRESS=0x... ACCOUNT_ADDRESS=0x... \
  npx hardhat run scripts/admin/admin.ts --network hoodi

# Thaw
COMMAND=thaw CONTRACT_ADDRESS=0x... ACCOUNT_ADDRESS=0x... \
  npx hardhat run scripts/admin/admin.ts --network hoodi
```

### Create Rewards Epoch

```bash
COMMAND=create-epoch EPOCH_INDEX=1 MERKLE_ROOT=0x1234... TOTAL_REWARDS=1000000 \
  npx hardhat run scripts/admin/admin.ts --network hoodi
```

### Complete a Redemption

```bash
COMMAND=complete-redeem USER_ADDRESS=0x... \
  npx hardhat run scripts/admin/admin.ts --network hoodi
```

### Distribute Staking Rewards

```bash
# Distribute 500 wYLDS
COMMAND=distribute-rewards REWARD_AMOUNT=500 \
  npx hardhat run scripts/admin/admin.ts --network hoodi
```

### Update Redeem Vault Address

```bash
COMMAND=update-redeem-vault NEW_REDEEM_VAULT=0x... \
  npx hardhat run scripts/admin/admin.ts --network hoodi
```

### Check Role Membership

```bash
# Check if address has REWARDS_ADMIN
COMMAND=check-role CONTRACT_ADDRESS=0x... ROLE=REWARDS_ADMIN ACCOUNT_ADDRESS=0x... \
  npx hardhat run scripts/admin/admin.ts --network hoodi
```

## Available Roles

- **ADMIN** - Default admin role (can grant/revoke other roles)
- **REWARDS_ADMIN** - Can complete redemptions, create epochs, distribute rewards
- **FREEZE_ADMIN** - Can freeze/thaw accounts
- **PAUSER** - Can pause/unpause contracts

## Security Notes

⚠️ **Important:** These scripts perform privileged operations. Ensure you:
- Are using the correct network
- Have verified the addresses
- Understand the impact of each operation
- Are the authorized admin before running

## All Available Commands

All commands use environment variables:

```bash
# delegate-role - Delegate role to address
COMMAND=delegate-role ROLE=<role> TARGET_ADDRESS=<address> [VAULT_TYPE=both|yield|staking]

# grant-role - Grant a role  
COMMAND=grant-role CONTRACT_ADDRESS=<contract> ROLE=<role> TARGET_ADDRESS=<address>

# revoke-role - Revoke a role
COMMAND=revoke-role CONTRACT_ADDRESS=<contract> ROLE=<role> TARGET_ADDRESS=<address>

# pause - Pause a vault
COMMAND=pause CONTRACT_ADDRESS=<contract>

# unpause - Unpause a vault
COMMAND=unpause CONTRACT_ADDRESS=<contract>

# freeze - Freeze an account
COMMAND=freeze CONTRACT_ADDRESS=<contract> ACCOUNT_ADDRESS=<account>

# thaw - Thaw an account  
COMMAND=thaw CONTRACT_ADDRESS=<contract> ACCOUNT_ADDRESS=<account>

# create-epoch - Create rewards epoch
COMMAND=create-epoch EPOCH_INDEX=<index> MERKLE_ROOT=<root> TOTAL_REWARDS=<total>

# complete-redeem - Complete pending redemption
COMMAND=complete-redeem USER_ADDRESS=<user>

# distribute-rewards - Distribute staking rewards
COMMAND=distribute-rewards REWARD_AMOUNT=<amount>

# update-redeem-vault - Update redeem vault address
COMMAND=update-redeem-vault NEW_REDEEM_VAULT=<address>

# check-role - Check role membership
COMMAND=check-role CONTRACT_ADDRESS=<contract> ROLE=<role> ACCOUNT_ADDRESS=<account>
```
