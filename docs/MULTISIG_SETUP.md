# Multisig Admin Setup Guide

## Overview

The `DEFAULT_ADMIN_ROLE` is the most powerful role in the Hastra Vault Protocol. It controls:

- ✅ Granting/revoking all other roles
- ✅ Emergency pause/unpause
- ✅ Upgrade authorization
- ✅ Critical parameter updates
- ✅ Vault configuration changes

**⚠️ This role MUST be protected with a multisig wallet for production deployments.**

## Prerequisites

### 1. Deploy a Multisig Wallet

**Recommended: Gnosis Safe**

Visit [https://safe.global](https://safe.global) to deploy a Safe wallet, or use existing multisig solutions:

- **Gnosis Safe** (recommended)
- **MultiSigWallet**
- **Custom governance contract**

**Example Configuration:**
```
Owners: 5 addresses
Threshold: 3 of 5 signatures required
```

### 2. Verify Multisig Setup

Before transferring admin rights, verify:

- ✅ All multisig owners are known and trusted
- ✅ Threshold is appropriate (not too low, not too high)
- ✅ Owners have secure key management
- ✅ Backup recovery process is documented
- ✅ Test transaction capability on the multisig

### 3. Test on Testnet FIRST

**Never run this on mainnet without testing on testnet first!**

```bash
# Deploy to testnet
npx hardhat run scripts/deploy.ts --network hoodi

# Transfer to multisig on testnet
MULTISIG_ADDRESS=0x... npx hardhat run scripts/setup-multisig-admin.ts --network hoodi

# Test multisig operations
# (Try granting a role through multisig interface)
```

## Usage

### Step 1: Set Multisig Address

```bash
export MULTISIG_ADDRESS=0x1234567890123456789012345678901234567890
```

### Step 2: Run Transfer Script

**Testnet:**
```bash
npx hardhat run scripts/setup-multisig-admin.ts --network hoodi
```

**Mainnet (only after testnet success):**
```bash
npx hardhat run scripts/setup-multisig-admin.ts --network mainnet
```

### Step 3: Verify Transfer

The script will output:

```
✅ SUCCESS! DEFAULT_ADMIN_ROLE transferred to multisig

YieldVault:
  Multisig has DEFAULT_ADMIN_ROLE: ✅ Yes
  Current admin has DEFAULT_ADMIN_ROLE: ✅ No

StakingVault:
  Multisig has DEFAULT_ADMIN_ROLE: ✅ Yes
  Current admin has DEFAULT_ADMIN_ROLE: ✅ No
```

## What the Script Does

```
┌─────────────────────────────────────────────────────────────┐
│                    TRANSFER SEQUENCE                        │
└─────────────────────────────────────────────────────────────┘

Step 1: Grant DEFAULT_ADMIN_ROLE to multisig on YieldVault
        ├─ tx: yieldVault.grantRole(DEFAULT_ADMIN_ROLE, multisig)
        └─ Now: Both deployer AND multisig have admin role

Step 2: Grant DEFAULT_ADMIN_ROLE to multisig on StakingVault
        ├─ tx: stakingVault.grantRole(DEFAULT_ADMIN_ROLE, multisig)
        └─ Now: Both deployer AND multisig have admin role

Step 3: Renounce DEFAULT_ADMIN_ROLE from deployer on YieldVault
        ├─ tx: yieldVault.renounceRole(DEFAULT_ADMIN_ROLE, deployer)
        └─ Now: Only multisig has admin role

Step 4: Renounce DEFAULT_ADMIN_ROLE from deployer on StakingVault
        ├─ tx: stakingVault.renounceRole(DEFAULT_ADMIN_ROLE, deployer)
        └─ Now: Only multisig has admin role

Step 5: Verify transfer successful
        └─ Check both vaults confirm multisig-only access
```

## After Transfer: Multisig Operations

### Granting a Role via Multisig

All admin operations must now be executed through the multisig interface:

**Example: Grant PAUSER_ROLE to new address**

1. Go to Safe UI (https://app.safe.global)
2. Select your Safe wallet
3. Create new transaction
4. Contract interaction: `YieldVault` at `0x...`
5. Function: `grantRole`
6. Parameters:
   - `role`: `0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a` (PAUSER_ROLE)
   - `account`: `0x...` (new pauser address)
7. Submit transaction
8. Collect signatures from multisig owners
9. Execute transaction when threshold reached

### Emergency Operations

**Pause the vaults:**
```javascript
// Through multisig UI
yieldVault.pause()
stakingVault.pause()
```

**Upgrade contracts:**
```javascript
// Through multisig UI  
yieldVault.upgradeToAndCall(newImplementation, data)
stakingVault.upgradeToAndCall(newImplementation, data)
```

## Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `MULTISIG_ADDRESS` | ✅ Yes | Address of multisig wallet | `0x1234...` |
| `YIELD_VAULT_ADDRESS` | Optional | YieldVault proxy address | `0xBf00...` |
| `STAKING_VAULT_ADDRESS` | Optional | StakingVault proxy address | `0x14D8...` |

If vault addresses not provided, script loads from `deployment_testnet.json`.

## Security Checklist

Before running on mainnet:

- [ ] Multisig deployed and verified
- [ ] All multisig owners identified and confirmed
- [ ] Threshold configured appropriately (recommend 3-of-5 or 4-of-7)
- [ ] Tested on testnet successfully
- [ ] Multisig owners can create and execute transactions
- [ ] Backup recovery process documented
- [ ] Team trained on multisig operations
- [ ] Emergency response procedures defined

## Troubleshooting

### Error: "Current signer does not have DEFAULT_ADMIN_ROLE"

**Solution:** You must run this script with the deployer account that currently has admin rights.

```bash
# Check who has admin role
npx hardhat run scripts/admin.ts --network hoodi
```

### Error: "Multisig address has no code"

**Warning:** The address you provided is not a contract. Are you sure it's a multisig?

**Solution:** Deploy a multisig wallet first or verify the address.

### Transfer Failed: Multisig doesn't have role after script

**Solution:** 
1. Check transaction logs for reverts
2. Ensure deployer had admin role before running
3. Verify multisig address is correct
4. Check network configuration

## Recommended Multisig Configurations

### Production Mainnet
```
Owners: 5-7 addresses
Threshold: 3-4 signatures
Recommended: 4-of-7 for balance of security and availability
```

### Testnet
```
Owners: 3 addresses  
Threshold: 2 signatures
Recommended: 2-of-3 for easier testing
```

## Related Documentation

- [ROLES.md](../docs/ROLES.md) - Complete role documentation
- [ARCHITECTURE.md](../docs/ARCHITECTURE.md) - System architecture
- [Gnosis Safe Documentation](https://docs.safe.global)

## Emergency Recovery

If multisig is compromised or owners lose access:

1. **If upgrader role is separate:** Can upgrade to new implementation that resets admin
2. **If no separate upgrader:** Funds may be locked - this is why testing is critical
3. **Prevention:** Always maintain secure backup of multisig owner keys

---

**⚠️ REMEMBER: Test everything on testnet first! ⚠️**
