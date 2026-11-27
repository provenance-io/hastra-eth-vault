# Hastra Vault Protocol on Base — Curator Integration Guide

> This guide is for **curators** and **institutional integrators** who want to interact with the Hastra Vault Protocol on **Base mainnet** (Chain ID: 8453), query vault state, or build tooling on top of it.

---

## Table of Contents

1. [Protocol Overview](#1-protocol-overview)
2. [Contract Addresses](#2-contract-addresses)
3. [Token Model](#3-token-model)
4. [Core Vault Operations](#4-core-vault-operations)
   - 4.1 [Deposit USDC → Receive wYLDS (YieldVault)](#41-deposit-usdc--receive-wylds-yieldvault)
   - 4.2 [Two-Step Redemption: wYLDS → USDC](#42-two-step-redemption-wylds--usdc)
   - 4.3 [Stake wYLDS → Receive PRIME / AUTO / SMB](#43-stake-wylds--receive-prime--auto--smb)
   - 4.4 [Instant Unstake](#44-instant-unstake)
   - 4.5 [Claim Merkle Rewards (YieldVault)](#45-claim-merkle-rewards-yieldvault)
5. [Querying Vault State](#5-querying-vault-state)
6. [NAV Oracle & Share Price](#6-nav-oracle--share-price)
7. [Access Control Roles](#7-access-control-roles)
8. [Compliance Controls](#8-compliance-controls)
9. [Events Reference](#9-events-reference)
10. [Error Reference](#10-error-reference)
11. [Notes](#11-notes)

---

## 1. Protocol Overview

The Hastra Vault Protocol is a multi-vault architecture built on the [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) tokenized vault standard, deployed on Base mainnet (Chain ID: 8453).

```
USDC ──▶ [YieldVault] ──▶ wYLDS ──▶ [StakingVault: PRIME / AUTO / SMB]
          (1:1 peg)                   (share appreciation, NAV-priced)
```

| Vault | Token | Ratio | Redemption |
|-------|-------|-------|------------|
| **YieldVault** | wYLDS (Wrapped YLDS) | Always 1:1 with USDC | Two-step (admin-gated) |
| **StakingVault** | PRIME (Prime Staked YLDS) | Appreciates with rewards | Instant ERC-4626 |
| **AutoStakingVault** | AUTO | NAV-priced | Instant ERC-4626 |
| **SMBStakingVault** | SMB | NAV-priced | Instant ERC-4626 |

All vaults are **UUPS upgradeable proxies** with role-based access control via OpenZeppelin `AccessControl`. Admin and upgrade rights are held by a 24h Timelock.

---

## 2. Contract Addresses

### Base Mainnet (Chain ID: 8453)

| Contract | Proxy Address | Explorer |
|----------|--------------|---------|
| YieldVault (wYLDS) | `0x85ADB3Fdc2b052Cd178089DF87B79FBfdafe3cf4` | [View →](https://basescan.org/address/0x85ADB3Fdc2b052Cd178089DF87B79FBfdafe3cf4) |
| StakingVault (PRIME) | `0x91cea5EE73eEd4fa2bEde28C1f86128D725e523c` | [View →](https://basescan.org/address/0x91cea5EE73eEd4fa2bEde28C1f86128D725e523c) |
| AutoStakingVault (AUTO) | `0xcB7787e319691e0993103929cF7199bF9dFa4Ec8` | [View →](https://basescan.org/address/0xcB7787e319691e0993103929cF7199bF9dFa4Ec8) |
| SMB StakingVault (SMB) | `0x3a5a9F459Fe22e7F966B0088E655baa50610c849` | [View →](https://basescan.org/address/0x3a5a9F459Fe22e7F966B0088E655baa50610c849) |
| FeedVerifier | `0xbC6023cb49F8E8cA6cef563d5FD97ba4C6A5D937` | [View →](https://basescan.org/address/0xbC6023cb49F8E8cA6cef563d5FD97ba4C6A5D937) |
| Timelock (24h) | `0x1376de100324d42337F1a2C08351d7242f30C3A7` | [View →](https://basescan.org/address/0x1376de100324d42337F1a2C08351d7242f30C3A7) |
| Safe (multisig, 4 of 7) | `0x8D358B8aE881F8ea92C3d07783aBCA21727C6309` | [View →](https://basescan.org/address/0x8D358B8aE881F8ea92C3d07783aBCA21727C6309) |
| Redeem Vault (EOA) | `0xA8C3CF6183D49d5D372f8FC149BD2cb5CFC0faCd` | [View →](https://basescan.org/address/0xA8C3CF6183D49d5D372f8FC149BD2cb5CFC0faCd) |
| USDC (native, Circle) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | [View →](https://basescan.org/address/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) |
| Chainlink VerifierProxy (external) | `0xDE1A28D87Afd0f546505B28AB50410A5c3a7387a` | [View →](https://basescan.org/address/0xDE1A28D87Afd0f546505B28AB50410A5c3a7387a) |

Implementations (for reference only): wYLDS `0x244870bD1BD57853965917c9b3E1143E7dB8839c`, PRIME `0x8F602ab04c7d33E8c6a820692E5dBB3257cbd175`, AUTO `0xE661366764d23B3dC52385E63c712Ba89AF5Bc10`, SMB `0x997E2Efbce91D170B00EA402e35a66C887EE1da9`, FeedVerifier `0xfEd839B6BA09c1aBf4C768abA0ECA50746E4eca9`.

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

### PRIME / AUTO / SMB (StakingVault shares)

- **Decimals**: 6
- **Peg**: Floating — share value appreciates as `distributeRewards()` is called and is NAV-priced via the FeedVerifier
- **Transferable**: Yes (subject to freeze/compliance controls)
- **Mintable by**: `deposit()` / `mint()` on the respective vault
- **Burnable by**: `withdraw()` / `redeem()` (instant)

### Share Price Calculation

```
sharePrice = totalAssets() / totalSupply()
           = (wYLDS held by vault + distributed rewards) / share supply
```

When `distributeRewards(amount)` is called, wYLDS are minted into the vault and the price per share increases proportionally.

---

## 4. Core Vault Operations

### 4.1 Deposit USDC → Receive wYLDS (YieldVault)

**ERC-4626 standard `deposit()` or `mint()`**

```typescript
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("https://mainnet.base.org"); // chainId 8453

const YIELD_VAULT = "0x85ADB3Fdc2b052Cd178089DF87B79FBfdafe3cf4";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // native USDC on Base

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

> [!NOTE]
> `depositWithPermit(assets, receiver, deadline, v, r, s)` calls `USDC.permit()` then `deposit()` atomically, saving one transaction. The permit call is wrapped in a `try/catch` — if a front-runner already consumed the nonce (setting the allowance), the deposit still succeeds via `transferFrom`. Native USDC on Base supports EIP-2612 permits.

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

The redeemVault (`0xA8C3CF6183D49d5D372f8FC149BD2cb5CFC0faCd`) must hold enough USDC and have approved the YieldVault for it.

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

### 4.3 Stake wYLDS → Receive PRIME / AUTO / SMB

```typescript
const STAKING_VAULT = "0x91cea5EE73eEd4fa2bEde28C1f86128D725e523c"; // PRIME
// AUTO: 0xcB7787e319691e0993103929cF7199bF9dFa4Ec8
// SMB:  0x3a5a9F459Fe22e7F966B0088E655baa50610c849
const YIELD_VAULT   = "0x85ADB3Fdc2b052Cd178089DF87B79FBfdafe3cf4";

const yieldVault  = new ethers.Contract(YIELD_VAULT, ERC20_ABI, signer);
const stakingVault = new ethers.Contract(STAKING_VAULT, STAKING_VAULT_ABI, signer);

const amount = ethers.parseUnits("1000", 6); // 1,000 wYLDS

// Step 1: Approve StakingVault to spend wYLDS
await yieldVault.approve(STAKING_VAULT, amount);

// Step 2: Deposit — receiver gets vault shares
await stakingVault.deposit(amount, receiverAddress);

// Preview how many shares you'll receive before depositing:
const sharesOut = await stakingVault.previewDeposit(amount);
console.log(`Will receive: ${ethers.formatUnits(sharesOut, 6)} shares`);
```

**Key facts**:
- Share/wYLDS ratio changes over time (rewards and NAV)
- Use `previewDeposit(assets)` and `previewRedeem(shares)` for accurate quotes
- No unbonding period — unstaking is instant
- NAV-priced vaults depend on a fresh FeedVerifier price (see section 6)

---

### 4.4 Instant Unstake

The StakingVaults are **fully ERC-4626 compliant** — standard `withdraw()` and `redeem()` work immediately.

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
const redeemVault = await yieldVault.redeemVault();

// Epoch info
const latestEpoch = await yieldVault.latestEpochIndex();
const epochRoot   = await yieldVault.epochMerkleRoot(epochIndex);

// Compliance
const isFrozen = await yieldVault.frozen(userAddress);

// Whitelist
const whitelisted = await yieldVault.getWhitelistedAddresses();
const isWhitelisted = await yieldVault.isWhitelisted(address);
```

### StakingVault State (PRIME / AUTO / SMB)

```typescript
// ERC-4626 standard reads
const totalAssets  = await stakingVault.totalAssets();   // Total wYLDS held
const totalSupply  = await stakingVault.totalSupply();   // Total shares minted
const userBalance  = await stakingVault.balanceOf(user); // User's shares

// Live share price (wYLDS per share)
const pricePerShare = (await stakingVault.totalAssets() * BigInt(1e6))
                      / await stakingVault.totalSupply();

// Conversions
const sharesForAssets = await stakingVault.convertToShares(wyldsAmount);
const assetsForShares = await stakingVault.convertToAssets(shareAmount);

// Max redemption limits
const maxRedeem   = await stakingVault.maxRedeem(userAddress);
const maxWithdraw = await stakingVault.maxWithdraw(userAddress);

// Compliance
const isFrozen = await stakingVault.frozen(userAddress);
```

---

## 6. NAV Oracle & Share Price

On Base, the staking vault share price is driven by Chainlink Data Streams reports verified on-chain by a single shared **FeedVerifier**. Each vault reads its own feed. There is no per-vault NavEngine.

```
Chainlink Data Streams
        │  (signed report)
        ▼
  [FeedVerifier] ──── verifies report via Chainlink VerifierProxy
        │  (stores verified price per feed ID)
        ▼
  [StakingVault / AUTO / SMB] ── navOracle() = FeedVerifier, navFeedId() = vault's feed
```

| Vault | Feed ID |
|-------|---------|
| PRIME | `0x0007c8ed155d952e003b1e15ce7666fea785cfbe216577d578fce3920e997271` |
| AUTO | `0x00076185d4b7a4961db969a90353e84a18a0125388535e6dda0f0faeeb4e8f51` |
| SMB | `0x00076f0ebf018138682718578c470922765bbc424d02aef426ddfb6f37a623b4` |

### Reading the current NAV

```typescript
const vault = new ethers.Contract(STAKING_VAULT, STAKING_VAULT_ABI, provider);

const oracleAddress = await vault.navOracle();  // FeedVerifier
const feedId        = await vault.navFeedId();

const feedVerifier = new ethers.Contract(oracleAddress, FEED_VERIFIER_ABI, provider);
const price     = await feedVerifier.priceOf(feedId);     // int192
const updatedAt = await feedVerifier.timestampOf(feedId); // uint32
```

> [!WARNING]
> `FeedVerifier.priceOf(feedId)` **reverts if the last verified price is older than the max staleness (3600s)**. A price must be published regularly by the FeedVerifier `UPDATER`. Treat a revert as "NAV stale", not as a zero price.

Only the FeedVerifier `UPDATER` can publish reports (`verifyReport`). Any verification fee charged by Chainlink is paid from the FeedVerifier's ETH balance (currently zero).

---

## 7. Access Control Roles

All contracts use OpenZeppelin `AccessControl`. Role bytes are constant across deployments.

| Role | YieldVault | StakingVaults | FeedVerifier | Capability |
|------|:----------:|:-------------:|:------------:|------------|
| `DEFAULT_ADMIN_ROLE` | ✅ | ✅ | ✅ | Grant/revoke all roles — held by the Timelock |
| `UPGRADER_ROLE` | ✅ | ✅ | ✅ | Upgrade implementation (UUPS) |
| `PAUSER_ROLE` | ✅ | ✅ | ✅ | Emergency pause/unpause |
| `FREEZE_ADMIN_ROLE` | ✅ | ✅ | ❌ | Freeze/thaw accounts |
| `REWARDS_ADMIN_ROLE` | ✅ | ✅ | ❌ | YieldVault: create epochs, complete redemptions. StakingVaults: distribute rewards |
| `WHITELIST_ADMIN_ROLE` | ✅ | ❌ | ❌ | Manage USDC withdrawal whitelist |
| `WITHDRAWAL_ADMIN_ROLE` | ✅ | ❌ | ❌ | Withdraw USDC to whitelisted addresses |
| `EPOCH_ADMIN_ROLE` | ✅ | ❌ | ❌ | Reward epoch administration |
| `REDEEM_OPERATOR_ROLE` | ✅ | ❌ | ❌ | Redemption operations |
| `NAV_ORACLE_UPDATER_ROLE` | ❌ | ✅ | ❌ | Set the NAV oracle and feed (currently unassigned) |
| `UPDATER_ROLE` | ❌ | ❌ | ✅ | Publish Data Streams reports |

### Current holders (Base mainnet)

| Contract | Role | Holder |
|----------|------|--------|
| All 4 vaults + FeedVerifier | `DEFAULT_ADMIN`, `UPGRADER` | Timelock (24h delay; proposer is the Safe) |
| YieldVault | `WHITELIST_ADMIN`, `EPOCH_ADMIN` | Timelock |
| YieldVault | `PAUSER` | Safe, ops EOA `0x8571De3d27a9190AF98260C3B54aB7ff79048926` |
| YieldVault | `FREEZE_ADMIN` | ops EOA |
| YieldVault | `WITHDRAWAL_ADMIN` | `0x10980735fCa44C78D60A6C6edC7BbFCEe3F2eb92` |
| YieldVault | `REDEEM_OPERATOR` | `0x9F1Ca6d3931551cbFD571706acecd64C6E619ED1` |
| YieldVault | `REWARDS_ADMIN` | PRIME, AUTO, SMB vaults |
| PRIME, AUTO | `PAUSER` | Safe, ops EOA |
| SMB | `PAUSER` | ops EOA only |
| PRIME, AUTO, SMB | `FREEZE_ADMIN` | ops EOA |
| PRIME, AUTO, SMB | `REWARDS_ADMIN` | Redeem Vault EOA `0xA8C3…faCd` |
| FeedVerifier | `PAUSER` | ops EOA |
| FeedVerifier | `UPDATER` | `0xF0a5baEBF749562fAe5f3d9d2928357ae6cd73cd` |

Role changes and upgrades go through the Timelock: the Safe schedules, then anyone can execute after 24h.

> [!NOTE]
> Verify live holders with `hasRole` before relying on this table. The deployer's `DEFAULT_ADMIN`/`UPGRADER` renounce may still be pending.

### Checking roles programmatically

```typescript
const FREEZE_ADMIN_ROLE = await vault.FREEZE_ADMIN_ROLE();
const hasRole = await vault.hasRole(FREEZE_ADMIN_ROLE, address);
```

### Role byte values

```typescript
DEFAULT_ADMIN_ROLE      = "0x0000000000000000000000000000000000000000000000000000000000000000"
FREEZE_ADMIN_ROLE       = keccak256("FREEZE_ADMIN")
REWARDS_ADMIN_ROLE      = keccak256("REWARDS_ADMIN")
WHITELIST_ADMIN_ROLE    = keccak256("WHITELIST_ADMIN")
WITHDRAWAL_ADMIN_ROLE   = keccak256("WITHDRAWAL_ADMIN")
EPOCH_ADMIN_ROLE        = keccak256("EPOCH_ADMIN")
REDEEM_OPERATOR_ROLE    = keccak256("REDEEM_OPERATOR")
NAV_ORACLE_UPDATER_ROLE = keccak256("NAV_ORACLE_UPDATER")
PAUSER_ROLE             = keccak256("PAUSER_ROLE")
UPGRADER_ROLE           = keccak256("UPGRADER_ROLE")
UPDATER_ROLE            = keccak256("UPDATER_ROLE")
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
| `Deposit` | `(address caller, address owner, uint256 assets, uint256 shares)` | wYLDS staked, shares minted |
| `Withdraw` | `(address caller, address receiver, address owner, uint256 assets, uint256 shares)` | Shares redeemed for wYLDS |
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
| `AccountIsFrozen` | All vaults | Account frozen by compliance | Contact FREEZE_ADMIN |
| `AccountNotFrozen` | All vaults | Tried to thaw unfrozen account | No action needed |
| `RedemptionAlreadyPending` | YieldVault | Active redemption exists | Wait for `completeRedeem` or cancel |
| `NoRedemptionPending` | YieldVault | `completeRedeem` called with no pending | Check `pendingRedemptions[user]` |
| `AddressNotWhitelisted` | YieldVault | USDC withdraw target not whitelisted | Add to whitelist via `WHITELIST_ADMIN_ROLE` |
| `InsufficientVaultBalance` | YieldVault | Redeem vault lacks USDC | Fund the redeemVault address |
| `InvalidProof` | YieldVault | Merkle proof incorrect | Regenerate proof from latest distribution |
| `AlreadyClaimed` | YieldVault | Reward already claimed for epoch | Check `hasClaimed(epoch, user)` |
| `EpochNotFound` | YieldVault | Invalid epoch index | Use `latestEpochIndex()` to get valid epoch |
| `EnforcedPause` | All | Contract is paused (OZ v5 custom error) | Wait for `unpause()` by PAUSER_ROLE |
| NAV stale (revert from `priceOf`) | FeedVerifier | Last price older than 3600s | Wait for the next `UPDATER` publish |

---

## 11. Notes

> [!CAUTION]
> **Always interact with the proxy address.** The implementation address changes on upgrades. The proxy address is permanent.

- Operational EOAs use the same addresses as Ethereum mainnet by design (same KMS keys).
- Gas on Base is a small fraction of Ethereum mainnet. Use `estimateGas` before submitting production transactions.

---

Last updated: 2026-11-27.
