# Hastra Ethereum Vault Protocol — Curator Integration Guide

> This guide is for **curators** and **institutional integrators** who want to interact with the Hastra Vault Protocol on-chain, query vault state, or build tooling on top of it.

---

## Table of Contents

1. [Protocol Overview](#1-protocol-overview)
2. [Contract Addresses](#2-contract-addresses)
3. [Token Model](#3-token-model)
4. [Core Vault Operations](#4-core-vault-operations)
   - 4.1 [Deposit USDC → Receive wYLDS (YieldVault)](#41-deposit-usdc--receive-wylds-yieldvault)
   - 4.2 [Two-Step Redemption: wYLDS → USDC](#42-two-step-redemption-wylds--usdc)
   - 4.3 [Stake wYLDS → Receive PRIME (StakingVault)](#43-stake-wylds--receive-prime-stakingvault)
   - 4.4 [Instant Unstake: PRIME → wYLDS](#44-instant-unstake-prime--wylds)
   - 4.5 [Claim Merkle Rewards (YieldVault)](#45-claim-merkle-rewards-yieldvault)
5. [Querying Vault State](#5-querying-vault-state)
6. [NAV Engine & Share Price](#6-nav-engine--share-price)
7. [Access Control Roles](#7-access-control-roles)
8. [Compliance Controls](#8-compliance-controls)
9. [Events Reference](#9-events-reference)
10. [Error Reference](#10-error-reference)
11. [Gas Cost Reference](#11-gas-cost-reference)
12. [Security Notes](#12-security-notes)

---

## 1. Protocol Overview

The Hastra Ethereum Vault Protocol is a multi-vault architecture built on the [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) tokenized vault standard, deployed on Ethereum mainnet (Chain ID: 1).

```
USDC ──▶ [YieldVault] ──▶ wYLDS ──▶ [StakingVault] ──▶ PRIME
          (1:1 peg)                   (share appreciation)
```

| Vault | Token | Ratio | Redemption |
|-------|-------|-------|------------|
| **YieldVault** | wYLDS (Wrapped YLDS) | Always 1:1 with USDC | Two-step (admin-gated) |
| **StakingVault** | PRIME (Prime Staked YLDS) | Appreciates with rewards | Instant ERC-4626 |

Both vaults are **UUPS upgradeable proxies** with role-based access control via OpenZeppelin `AccessControl`.

---

## 2. Contract Addresses

### Mainnet (Chain ID: 1)

| Contract | Proxy Address | Explorer |
|----------|--------------|---------|
| YieldVault (wYLDS) | `0x6aD038cA6C04e885630851278ca0a856Ad9a66Cc` | [View →](https://etherscan.io/address/0x6aD038cA6C04e885630851278ca0a856Ad9a66Cc) |
| StakingVault (PRIME) | `0x19ebb35279A16207Ec4ba82799CC64715065F7F6` | [View →](https://etherscan.io/address/0x19ebb35279A16207Ec4ba82799CC64715065F7F6) |
| AutoStakingVault (AUTO) | `0x997E2Efbce91D170B00EA402e35a66C887EE1da9` | [View →](https://etherscan.io/address/0x997E2Efbce91D170B00EA402e35a66C887EE1da9) |
| SMB StakingVault (SMB) | `0xBd49537Cc9105E8c1651Ed12b94cD9A3D79Bf3d9` | [View →](https://etherscan.io/address/0xBd49537Cc9105E8c1651Ed12b94cD9A3D79Bf3d9) |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | [View →](https://etherscan.io/address/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48) |
| HastraNavEngine (PRIME) | `0xfEd839B6BA09c1aBf4C768abA0ECA50746E4eca9` | [View →](https://etherscan.io/address/0xfEd839B6BA09c1aBf4C768abA0ECA50746E4eca9) |
| HastraAutoNavEngine (AUTO) | `0xC38479C4f1155A6b3d839F33f70D4A9923e24Af3` | [View →](https://etherscan.io/address/0xC38479C4f1155A6b3d839F33f70D4A9923e24Af3) |
| HastraSMBNavEngine (SMB) | `0xbeA0BFc28861eb1D0832A9D5689AA7C558E9D76d` | [View →](https://etherscan.io/address/0xbeA0BFc28861eb1D0832A9D5689AA7C558E9D76d) |
| FeedVerifier | `0xdF4ab20fA7752Be52E41e42F1FD667f37964d6a3` | [View →](https://etherscan.io/address/0xdF4ab20fA7752Be52E41e42F1FD667f37964d6a3) |

> [!IMPORTANT]
> Always interact with the **proxy address**, never the implementation address directly. The proxy address never changes across upgrades; the implementation address may change.

---

## 3. Token Model

### wYLDS (YieldVault shares)

- **Decimals**: 6
- **Peg**: Hard 1:1 with USDC — `convertToShares()` always returns the asset amount unchanged
- **Transferable**: Yes (subject to freeze/compliance controls)
- **Mintable by**: `YieldVault.deposit()` / `YieldVault.mint()`
- **Burnable by**: `YieldVault.requestRedeem()` → admin `completeRedeem()`

### PRIME (StakingVault shares)

- **Decimals**: 6
- **Peg**: Floating — share value appreciates as `distributeRewards()` is called
- **Transferable**: Yes (subject to freeze/compliance controls)
- **Mintable by**: `StakingVault.deposit()` / `StakingVault.mint()`
- **Burnable by**: `StakingVault.withdraw()` / `StakingVault.redeem()` (instant)

### Share Price Calculation (PRIME)

```
sharePrice = totalAssets() / totalSupply()
           = (wYLDS held by vault + distributed rewards) / PRIME supply
```

When `distributeRewards(amount)` is called, wYLDS are minted into the vault and the price per PRIME share increases proportionally.

---

## 4. Core Vault Operations

### 4.1 Deposit USDC → Receive wYLDS (YieldVault)

**ERC-4626 standard `deposit()` or `mint()`**

```typescript
import { ethers } from "ethers";

const YIELD_VAULT = "0x6aD038cA6C04e885630851278ca0a856Ad9a66Cc"; // Mainnet
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const usdc = new ethers.Contract(USDC, ERC20_ABI, signer);
const vault = new ethers.Contract(YIELD_VAULT, YIELD_VAULT_ABI, signer);

const amount = ethers.parseUnits("1000", 6); // 1,000 USDC

// Step 1: Approve vault to spend USDC
await usdc.approve(YIELD_VAULT, amount);

// Step 2: Deposit — receiver gets wYLDS (1:1 ratio)
const tx = await vault.deposit(amount, receiverAddress);
await tx.wait();

// Alternative: use depositWithPermit() to combine approve+deposit in one tx
// (requires EIP-2612 permit signature)
```

**Key facts**:
- No fee on deposit
- Ratio is always 1:1 (1,000 USDC → 1,000 wYLDS)
- `convertToShares(assets)` = `assets` (hardcoded, no oracle needed)
- Account must not be frozen; contract must not be paused

---

### 4.2 Two-Step Redemption: wYLDS → USDC

> [!IMPORTANT]
> The standard ERC-4626 `withdraw()` and `redeem()` functions are **disabled** on the YieldVault. They revert with `"Use requestRedeem/completeRedeem"`. Redemption is a two-step, admin-gated process.

#### Step 1 — User: `requestRedeem(shares)`

```typescript
const amount = ethers.parseUnits("500", 6); // 500 wYLDS

// Locks wYLDS in the vault and registers pending redemption
await yieldVault.requestRedeem(amount);

// Emits: RedemptionRequested(address user, uint256 shares, uint256 assets, uint256 timestamp)
```

After this call:
- `500 wYLDS` are transferred from the user to the vault address
- `pendingRedemptions[user]` is recorded on-chain

#### Step 2 — Off-chain (Hastra): Compliance + Fund Movement

The protocol operator:
1. Runs KYC/AML and sanctions screening
2. Calls `withdrawUSDC(to, amount)` using the `WITHDRAWAL_ADMIN_ROLE` to move USDC to a whitelisted redeemVault address
3. Calls `completeRedeem(user)` using the `REWARDS_ADMIN_ROLE`

```typescript
// Admin-only: Complete the redemption for the user
await yieldVault.connect(rewardsAdmin).completeRedeem(userAddress);

// Emits: RedemptionCompleted(address user, uint256 shares, uint256 assets)
```

After `completeRedeem`:
- Locked wYLDS are burned
- USDC is sent to the user from the redeemVault

#### Checking a Pending Redemption

```typescript
const pending = await yieldVault.pendingRedemptions(userAddress);
// Returns: { shares: bigint, assets: bigint, timestamp: bigint }

if (pending.shares > 0n) {
  console.log(`Pending: ${ethers.formatUnits(pending.shares, 6)} wYLDS`);
}
```

> [!NOTE]
> Only one redemption request can be active per user at a time. A second call to `requestRedeem` while one is pending will revert with `RedemptionAlreadyPending`.

---

### 4.3 Stake wYLDS → Receive PRIME (StakingVault)

```typescript
const STAKING_VAULT = "0x19ebb35279A16207Ec4ba82799CC64715065F7F6"; // Mainnet
const YIELD_VAULT   = "0x6aD038cA6C04e885630851278ca0a856Ad9a66Cc";

const yieldVault  = new ethers.Contract(YIELD_VAULT, ERC20_ABI, signer);
const stakingVault = new ethers.Contract(STAKING_VAULT, STAKING_VAULT_ABI, signer);

const amount = ethers.parseUnits("1000", 6); // 1,000 wYLDS

// Step 1: Approve StakingVault to spend wYLDS
await yieldVault.approve(STAKING_VAULT, amount);

// Step 2: Deposit — receiver gets PRIME shares
await stakingVault.deposit(amount, receiverAddress);

// Preview how many shares you'll receive before depositing:
const sharesOut = await stakingVault.previewDeposit(amount);
console.log(`Will receive: ${ethers.formatUnits(sharesOut, 6)} PRIME`);
```

**Key facts**:
- PRIME/wYLDS ratio increases over time as rewards are distributed
- Use `previewDeposit(assets)` and `previewRedeem(shares)` for accurate quotes
- No unbonding period — unstaking is instant

---

### 4.4 Instant Unstake: PRIME → wYLDS

The StakingVault is **fully ERC-4626 compliant** — standard `withdraw()` and `redeem()` work immediately.

```typescript
// Option A: Redeem exact shares → receive proportional assets
const shares = ethers.parseUnits("100", 6);
await stakingVault.redeem(shares, receiverAddress, ownerAddress);

// Option B: Withdraw exact asset amount → burn required shares
const assets = ethers.parseUnits("100", 6);
await stakingVault.withdraw(assets, receiverAddress, ownerAddress);

// Preview before transacting:
const assetsOut = await stakingVault.previewRedeem(shares);
const sharesNeeded = await stakingVault.previewWithdraw(assets);
```

---

### 4.5 Claim Merkle Rewards (YieldVault)

The YieldVault distributes bonus yield to wYLDS holders via merkle-based epochs. Proof data is published off-chain per epoch.

```typescript
// Load the epoch distribution file (provided by protocol operator)
const distribution = {
  epochIndex: 0,
  rewards: [
    { address: "0xABC...", amount: "500000", proof: ["0x...", "0x..."] }
  ]
};

const userReward = distribution.rewards.find(
  r => r.address.toLowerCase() === userAddress.toLowerCase()
);

if (userReward) {
  await yieldVault.claimRewards(
    distribution.epochIndex,
    BigInt(userReward.amount),
    userReward.proof
  );
  // Emits: RewardsClaimed(address user, uint256 epochIndex, uint256 amount)
}
```

**Checking claim status**:
```typescript
// Returns true if user has already claimed for this epoch
const claimed = await yieldVault.hasClaimed(epochIndex, userAddress);
```

---

## 5. Querying Vault State

### YieldVault State

```typescript
// ERC-4626 standard reads
const totalAssets    = await yieldVault.totalAssets();    // Total USDC held
const totalSupply    = await yieldVault.totalSupply();    // Total wYLDS minted
const userBalance    = await yieldVault.balanceOf(user);  // User's wYLDS

// Share ↔ Asset conversions (always 1:1)
const shares = await yieldVault.convertToShares(assets);
const assets2 = await yieldVault.convertToAssets(shares);

// Redemption state
const pending = await yieldVault.pendingRedemptions(user);
// { shares: bigint, assets: bigint, timestamp: bigint }

// Epoch info
const latestEpoch = await yieldVault.latestEpochIndex();
const epochRoot   = await yieldVault.epochMerkleRoot(epochIndex);

// Compliance
const isFrozen = await yieldVault.frozen(userAddress);

// Whitelist
const whitelisted = await yieldVault.getWhitelistedAddresses();
const isWhitelisted = await yieldVault.isWhitelisted(address);
```

### StakingVault State

```typescript
// ERC-4626 standard reads
const totalAssets  = await stakingVault.totalAssets();   // Total wYLDS held
const totalSupply  = await stakingVault.totalSupply();   // Total PRIME minted
const userBalance  = await stakingVault.balanceOf(user); // User's PRIME

// Live share price (wYLDS per PRIME)
const pricePerShare = (await stakingVault.totalAssets() * BigInt(1e6))
                      / await stakingVault.totalSupply();

// Conversions
const sharesForAssets = await stakingVault.convertToShares(wyldsAmount);
const assetsForShares = await stakingVault.convertToAssets(primeAmount);

// Max redemption limits
const maxRedeem   = await stakingVault.maxRedeem(userAddress);
const maxWithdraw = await stakingVault.maxWithdraw(userAddress);

// Compliance
const isFrozen = await stakingVault.frozen(userAddress);
```

---

## 6. NAV Engine & Share Price

The PRIME share price is driven by an on-chain **Net Asset Value (NAV)** engine that consumes Chainlink Data Streams price reports.

```
Chainlink Data Streams
        │  (signed report)
        ▼
  [FeedVerifier] ──── verifies report via Chainlink VerifierProxy
        │  (stores verified price)
        ▼
  [HastraNavEngine] ── calculates rate = TVL / totalSupply
        │  (int192 rate, 1e18 scaled)
        ▼
  [StakingVault] ──── uses rate for share ↔ asset conversions
```

### Reading the current NAV rate

```typescript
const navEngine = new ethers.Contract(NAV_ENGINE_ADDRESS, NAV_ENGINE_ABI, provider);

// Returns int192 rate (18 decimals, Schema v7 format)
const rate = await navEngine.getRate();

// Additional diagnostics
const lastUpdate  = await navEngine.getLatestUpdateTime();
const latestTVL   = await navEngine.getLatestTVL();
const latestSupply = await navEngine.getLatestTotalSupply();
const minRate     = await navEngine.getMinRate();
const maxRate     = await navEngine.getMaxRate();
```

### NAV Update events

Monitor `RateUpdated` to track share price changes:
```solidity
event RateUpdated(int192 rate, uint256 totalSupply, uint256 totalTVL, uint256 timestamp);
```

Alert events (graceful degradation — rate is NOT updated when these fire):
```solidity
event AlertInvalidTVL(uint256 tvl, uint256 timestamp);
event AlertInvalidTVLDifference(uint256 previousTVL, uint256 newTVL, uint256 timestamp);
event AlertInvalidRate(int192 rate, uint256 timestamp);
```

---

## 7. Access Control Roles

Both vaults use OpenZeppelin `AccessControl`. Role bytes are constant across deployments.

| Role | YieldVault | StakingVault | Capability |
|------|:----------:|:------------:|------------|
| `DEFAULT_ADMIN_ROLE` | ✅ | ✅ | Grant/revoke all roles — **protect with multi-sig** |
| `FREEZE_ADMIN_ROLE` | ✅ | ✅ | Freeze/thaw accounts |
| `REWARDS_ADMIN_ROLE` | ✅ | ✅ | Create epochs, mint rewards, complete redemptions |
| `PAUSER_ROLE` | ✅ | ✅ | Emergency pause/unpause |
| `UPGRADER_ROLE` | ✅ | ✅ | Upgrade implementation (UUPS) |
| `WHITELIST_ADMIN_ROLE` | ✅ | ❌ | Manage USDC withdrawal whitelist |
| `WITHDRAWAL_ADMIN_ROLE` | ✅ | ❌ | Withdraw USDC to whitelisted addresses |

### Checking roles programmatically

```typescript
const FREEZE_ADMIN_ROLE = await vault.FREEZE_ADMIN_ROLE();
const hasRole = await vault.hasRole(FREEZE_ADMIN_ROLE, address);
```

### Role byte values

```typescript
DEFAULT_ADMIN_ROLE     = "0x0000000000000000000000000000000000000000000000000000000000000000"
FREEZE_ADMIN_ROLE      = keccak256("FREEZE_ADMIN_ROLE")
REWARDS_ADMIN_ROLE     = keccak256("REWARDS_ADMIN_ROLE")
PAUSER_ROLE            = keccak256("PAUSER_ROLE")
UPGRADER_ROLE          = keccak256("UPGRADER_ROLE")
WHITELIST_ADMIN_ROLE   = keccak256("WHITELIST_ADMIN_ROLE")
WITHDRAWAL_ADMIN_ROLE  = keccak256("WITHDRAWAL_ADMIN_ROLE")
```

---

## 8. Compliance Controls

### Account Freeze/Thaw

Compliance officers with `FREEZE_ADMIN_ROLE` can freeze accounts. A frozen account **cannot**:
- Transfer or receive tokens
- Deposit assets
- Request redemptions
- Claim rewards

A frozen account **can**:
- Have balances read (all view functions work)
- Be unfrozen by `FREEZE_ADMIN_ROLE`

```typescript
// Check before transacting to avoid reverts
const isFrozen = await vault.frozen(userAddress);
if (isFrozen) {
  throw new Error("Account is frozen — contact compliance@hastra.io");
}

// Admin: Freeze
await vault.connect(freezeAdmin).freezeAccount(address);
// Admin: Thaw
await vault.connect(freezeAdmin).thawAccount(address);
```

### Pause

When paused, all state-changing operations revert. View functions continue to work.

```typescript
const isPaused = await vault.paused();
```

### USDC Withdrawal Whitelist (YieldVault Only)

USDC can only be withdrawn from the vault to explicitly whitelisted addresses. This governs the redeemVault treasury.

```typescript
const isWhitelisted = await yieldVault.isWhitelisted(address);
const allWhitelisted = await yieldVault.getWhitelistedAddresses();
```

---

## 9. Events Reference

### YieldVault Events

| Event | Signature | Description |
|-------|-----------|-------------|
| `Deposit` | `(address caller, address owner, uint256 assets, uint256 shares)` | USDC deposited, wYLDS minted |
| `RedemptionRequested` | `(address user, uint256 shares, uint256 assets, uint256 timestamp)` | User initiated redemption |
| `RedemptionCompleted` | `(address user, uint256 shares, uint256 assets)` | Admin completed redemption |
| `RewardsClaimed` | `(address user, uint256 epochIndex, uint256 amount)` | User claimed merkle reward |
| `EpochCreated` | `(uint256 epochIndex, bytes32 merkleRoot, uint256 totalRewards)` | New reward epoch created |
| `AccountFrozen` | `(address indexed account)` | Account frozen |
| `AccountThawed` | `(address indexed account)` | Account unfrozen |
| `AddressWhitelisted` | `(address indexed account)` | Address added to whitelist |
| `AddressRemovedFromWhitelist` | `(address indexed account)` | Address removed from whitelist |

### StakingVault Events

| Event | Signature | Description |
|-------|-----------|-------------|
| `Deposit` | `(address caller, address owner, uint256 assets, uint256 shares)` | wYLDS staked, PRIME minted |
| `Withdraw` | `(address caller, address receiver, address owner, uint256 assets, uint256 shares)` | PRIME redeemed for wYLDS |
| `RewardsDistributed` | `(uint256 amount)` | Rewards minted, share value increased |
| `AccountFrozen` | `(address indexed account)` | Account frozen |
| `AccountThawed` | `(address indexed account)` | Account unfrozen |

### Listening for events (ethers.js)

```typescript
// Listen for new redemption requests
yieldVault.on("RedemptionRequested", (user, shares, assets, timestamp, event) => {
  console.log(`Redemption request: ${user} wants ${ethers.formatUnits(shares, 6)} wYLDS`);
});

// Listen for reward distributions
stakingVault.on("RewardsDistributed", (amount, event) => {
  console.log(`Rewards distributed: ${ethers.formatUnits(amount, 6)} wYLDS`);
});
```

---

## 10. Error Reference

| Error | Contract | Cause | Resolution |
|-------|----------|-------|------------|
| `AccountIsFrozen` | Both | Account frozen by compliance | Contact FREEZE_ADMIN |
| `AccountNotFrozen` | Both | Tried to thaw unfrozen account | No action needed |
| `RedemptionAlreadyPending` | YieldVault | Active redemption exists | Wait for `completeRedeem` or cancel |
| `NoRedemptionPending` | YieldVault | `completeRedeem` called with no pending | Check `pendingRedemptions[user]` |
| `AddressNotWhitelisted` | YieldVault | USDC withdraw target not whitelisted | Add to whitelist via `WHITELIST_ADMIN_ROLE` |
| `InsufficientVaultBalance` | YieldVault | Redeem vault lacks USDC | Fund the redeemVault address |
| `InvalidProof` | YieldVault | Merkle proof incorrect | Regenerate proof from latest distribution |
| `AlreadyClaimed` | YieldVault | Reward already claimed for epoch | Check `hasClaimed(epoch, user)` |
| `EpochNotFound` | YieldVault | Invalid epoch index | Use `latestEpochIndex()` to get valid epoch |
| `Pausable: paused` | Both | Contract is paused | Wait for `unpause()` by PAUSER_ROLE |

---

## 11. Gas Cost Reference

| Operation | Approximate Gas |
|-----------|----------------|
| `YieldVault.deposit` | ~150,000 |
| `YieldVault.requestRedeem` | ~100,000 |
| `YieldVault.completeRedeem` (admin) | ~120,000 |
| `YieldVault.claimRewards` | ~80,000 |
| `StakingVault.deposit` | ~150,000 |
| `StakingVault.withdraw` | ~100,000 |
| `StakingVault.distributeRewards` (admin) | ~120,000 |

> [!TIP]
> Gas estimates may vary with network conditions. Use `estimateGas` before submitting production transactions.

---

## 12.  Notes

> [!CAUTION]
> **Always interact with the proxy address.** The implementation address changes on upgrades. The proxy address is permanent.

---


Last updated: 2026-06-29.*
