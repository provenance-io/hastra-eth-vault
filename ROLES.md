# Hastra Vault Access Control Roles

This document describes all roles used in the Hastra Vault Protocol, their permissions, and recommended assignment strategies.

## Overview

Both **YieldVault** and **StakingVault** use OpenZeppelin's `AccessControl` for role-based permissions. Roles are defined as `bytes32` constants using `keccak256` hashing.

---

## YieldVault Roles

### DEFAULT_ADMIN_ROLE
**Constant:** `0x00` (inherited from OpenZeppelin)

| Permission | Description |
|------------|-------------|
| Grant/revoke all roles | Can assign or remove any role from any address |
| `setRedeemVault()` | Update the address that funds redemptions |

**Recommended Assignment:** Multisig wallet (e.g., Gnosis Safe)

**Granted at deployment:** ✅ Yes (to `admin_` constructor parameter)

---

### PAUSER_ROLE
**Constant:** `keccak256("PAUSER_ROLE")`

| Permission | Description |
|------------|-------------|
| `pause()` | Pause all user operations (deposits, redemptions, claims) |
| `unpause()` | Resume operations |

**Recommended Assignment:** Security team or automated monitoring system

**Granted at deployment:** ✅ Yes (to `admin_` constructor parameter)

---

### FREEZE_ADMIN_ROLE
**Constant:** `keccak256("FREEZE_ADMIN")`

| Permission | Description |
|------------|-------------|
| `freezeAccount(address)` | Prevent an account from transferring tokens |
| `thawAccount(address)` | Re-enable transfers for a frozen account |

**Recommended Assignment:** Compliance team

**Granted at deployment:** ❌ No (must be granted separately)

---

### REWARDS_ADMIN_ROLE
**Constant:** `keccak256("REWARDS_ADMIN")`

| Permission | Description |
|------------|-------------|
| `completeRedeem(user)` | Complete a pending redemption (step 2 of 2) |
| `createRewardsEpoch(...)` | Create a new merkle rewards epoch |
| `mintRewards(to, amount)` | Mint wYLDS rewards (used by StakingVault) |

**Recommended Assignment:** Operations team or backend service

**Granted at deployment:** ❌ No (must be granted separately)

---

### WHITELIST_ADMIN_ROLE
**Constant:** `keccak256("WHITELIST_ADMIN")`

| Permission | Description |
|------------|-------------|
| `addToWhitelist(address)` | Add address to USDC withdrawal whitelist |
| `removeFromWhitelist(address)` | Remove address from whitelist |

**Recommended Assignment:** Treasury/Finance team

**Granted at deployment:** ❌ No (must be granted separately)

---

### WITHDRAWAL_ADMIN_ROLE
**Constant:** `keccak256("WITHDRAWAL_ADMIN")`

| Permission | Description |
|------------|-------------|
| `withdrawUSDC(to, amount)` | Withdraw USDC to a **whitelisted address only** |

**Recommended Assignment:** Treasury operations (separate from whitelist management)

**Granted at deployment:** ❌ No (must be granted separately)

**Role Separation:**

1. **WHITELIST_ADMIN_ROLE** (The "Gatekeeper")
   * **Responsibility:** Manages the list of valid destination addresses.
   * **Capabilities:** Can call `addToWhitelist()` and `removeFromWhitelist()`.
   * **Restriction:** Cannot move funds. They can add an address to the list, but they cannot trigger the transfer itself.
   * **Analogy:** Like a Compliance Officer who approves a list of verified vendors but has no access to the company bank account.

2. **WITHDRAWAL_ADMIN_ROLE** (The "Operator")
   * **Responsibility:** Executes the actual transfer of USDC.
   * **Capabilities:** Can call `withdrawUSDC()`.
   * **Restriction:** Can ONLY send to addresses on the whitelist. They cannot send funds to an arbitrary address (like their own personal wallet) unless that address was pre-approved by the Whitelist Admin.
   * **Analogy:** Like a Treasurer who cuts the checks but is only allowed to pay vendors that Compliance has approved.

---

## StakingVault Roles

### DEFAULT_ADMIN_ROLE
**Constant:** `0x00` (inherited from OpenZeppelin)

| Permission | Description |
|------------|-------------|
| Grant/revoke all roles | Can assign or remove any role from any address |

**Granted at deployment:** ✅ Yes

---

### PAUSER_ROLE
**Constant:** `keccak256("PAUSER_ROLE")`

| Permission | Description |
|------------|-------------|
| `pause()` | Pause staking operations |
| `unpause()` | Resume operations |

**Granted at deployment:** ✅ Yes

---

### FREEZE_ADMIN_ROLE
**Constant:** `keccak256("FREEZE_ADMIN")`

| Permission | Description |
|------------|-------------|
| `freezeAccount(address)` | Prevent account from transferring PRIME |
| `thawAccount(address)` | Re-enable transfers |

**Granted at deployment:** ❌ No

---

### REWARDS_ADMIN_ROLE
**Constant:** `keccak256("REWARDS_ADMIN")`

| Permission | Description |
|------------|-------------|
| `distributeRewards(amount)` | Mint wYLDS rewards to staking vault (increases share value) |

**Granted at deployment:** ❌ No

---

## Role Hierarchy Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DEFAULT_ADMIN_ROLE                                 │
│                         (Owner / Multisig Wallet)                            │
│                                                                              │
│   • Can grant/revoke ALL roles                                               │
│   • setRedeemVault() [YieldVault only]                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐      ┌─────────────────────┐      ┌─────────────────────┐
│   PAUSER_ROLE   │      │  FREEZE_ADMIN_ROLE  │      │ REWARDS_ADMIN_ROLE  │
│                 │      │                     │      │                     │
│ • pause()       │      │ • freezeAccount()   │      │ • completeRedeem()  │
│ • unpause()     │      │ • thawAccount()     │      │ • createRewardsEpoch│
└─────────────────┘      └─────────────────────┘      │ • mintRewards()     │
                                                      │ • distributeRewards │
                                                      └─────────────────────┘
         │
         ├─────────────────────────────────────┐
         │                                     │
         ▼                                     ▼
┌─────────────────────────┐      ┌─────────────────────────────┐
│  WHITELIST_ADMIN_ROLE   │      │   WITHDRAWAL_ADMIN_ROLE     │
│                         │      │                             │
│ • addToWhitelist()      │      │ • withdrawUSDC()            │
│ • removeFromWhitelist() │      │   (only to whitelisted!)    │
└─────────────────────────┘      └─────────────────────────────┘
```

---

## Function-to-Role Matrix

### YieldVault

| Function | Required Role | Notes |
|----------|---------------|-------|
| `deposit()` | None (public) | `whenNotPaused` |
| `mint()` | None (public) | `whenNotPaused` |
| `requestRedeem()` | None (public) | Token holder, `whenNotPaused` |
| `cancelRedeem()` | None (public) | Token holder only |
| `completeRedeem()` | `REWARDS_ADMIN_ROLE` | After off-chain funding |
| `claimRewards()` | None (public) | Valid merkle proof required |
| `createRewardsEpoch()` | `REWARDS_ADMIN_ROLE` | |
| `mintRewards()` | `REWARDS_ADMIN_ROLE` | Called by StakingVault |
| `freezeAccount()` | `FREEZE_ADMIN_ROLE` | |
| `thawAccount()` | `FREEZE_ADMIN_ROLE` | |
| `addToWhitelist()` | `WHITELIST_ADMIN_ROLE` | |
| `removeFromWhitelist()` | `WHITELIST_ADMIN_ROLE` | |
| `withdrawUSDC()` | `WITHDRAWAL_ADMIN_ROLE` | Only to whitelisted |
| `setRedeemVault()` | `DEFAULT_ADMIN_ROLE` | |
| `pause()` | `PAUSER_ROLE` | |
| `unpause()` | `PAUSER_ROLE` | |

### StakingVault

| Function | Required Role | Notes |
|----------|---------------|-------|
| `deposit()` | None (public) | `whenNotPaused` |
| `mint()` | None (public) | `whenNotPaused` |
| `unbond()` | None (public) | Token holder, `whenNotPaused` |
| `completeUnbonding()` | None (public) | After time lock |
| `cancelUnbonding()` | None (public) | Token holder only |
| `distributeRewards()` | `REWARDS_ADMIN_ROLE` | |
| `freezeAccount()` | `FREEZE_ADMIN_ROLE` | |
| `thawAccount()` | `FREEZE_ADMIN_ROLE` | |
| `pause()` | `PAUSER_ROLE` | |
| `unpause()` | `PAUSER_ROLE` | |

---

## Security Best Practices

### 1. Separation of Duties
- **Never** give the same address multiple critical roles
- Use separate addresses for `WHITELIST_ADMIN` and `WITHDRAWAL_ADMIN`
- Consider using multisig for `DEFAULT_ADMIN_ROLE`

### 2. Multisig Recommendations
| Role | Recommended Signers |
|------|---------------------|
| `DEFAULT_ADMIN_ROLE` | 3-of-5 multisig |
| `PAUSER_ROLE` | 1-of-3 (for fast response) |
| `WITHDRAWAL_ADMIN_ROLE` | 2-of-3 multisig |

### 3. Role Revocation
Always test role revocation in staging:
```typescript
// Grant role
await vault.grantRole(FREEZE_ADMIN_ROLE, newAdmin.address);

// Revoke role
await vault.revokeRole(FREEZE_ADMIN_ROLE, oldAdmin.address);

// User can renounce their own role
await vault.connect(admin).renounceRole(FREEZE_ADMIN_ROLE, admin.address);
```

### 4. Monitoring
Set up alerts for:
- Role grant/revoke events
- Pause/unpause events
- Whitelist changes
- Large USDC withdrawals

---

## Deployment Role Setup

### Example Deployment Script

```typescript
async function setupRoles(vault: YieldVault) {
  const [deployer] = await ethers.getSigners();
  
  // Get role constants
  const FREEZE_ADMIN_ROLE = await vault.FREEZE_ADMIN_ROLE();
  const REWARDS_ADMIN_ROLE = await vault.REWARDS_ADMIN_ROLE();
  const WHITELIST_ADMIN_ROLE = await vault.WHITELIST_ADMIN_ROLE();
  const WITHDRAWAL_ADMIN_ROLE = await vault.WITHDRAWAL_ADMIN_ROLE();
  
  // Grant roles (use your actual addresses)
  await vault.grantRole(FREEZE_ADMIN_ROLE, process.env.FREEZE_ADMIN!);
  await vault.grantRole(REWARDS_ADMIN_ROLE, process.env.REWARDS_ADMIN!);
  await vault.grantRole(WHITELIST_ADMIN_ROLE, process.env.WHITELIST_ADMIN!);
  await vault.grantRole(WITHDRAWAL_ADMIN_ROLE, process.env.WITHDRAWAL_ADMIN!);
  
  console.log("Roles configured successfully");
}
```

---

## Checking Roles

```typescript
// Check if address has role
const hasRole = await vault.hasRole(FREEZE_ADMIN_ROLE, address);

// Get role admin (who can grant/revoke this role)
const roleAdmin = await vault.getRoleAdmin(FREEZE_ADMIN_ROLE);

// Get role member count (AccessControlEnumerable only)
// const count = await vault.getRoleMemberCount(FREEZE_ADMIN_ROLE);
```

---

## Events

All role changes emit events from OpenZeppelin's AccessControl:

```solidity
event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);
```

Monitor these events for security auditing.
