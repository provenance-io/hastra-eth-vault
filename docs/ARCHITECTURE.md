# Architecture and Flow Diagrams

Complete system architecture for the Hastra Ethereum Vault Protocol, including detailed flow diagrams for wYLDS (YieldVault) and PRIME (StakingVault).

## 🚀 Current Deployment Information
### Mainnet Deployment - **NOT YET DEPLOYED**

### Testnet Deployment - **ACTIVE ON HOODI**

See [`deployment_testnet.json`](../deployment_testnet.json) for current addresses.

```bash
# View deployment info
npx hardhat run scripts/upgrade_test/check_version.ts --network hoodi
```

**Network**: Hoodi Testnet (Chain ID: 560048)  
**Status**: Active  
**Version**: V1 (upgradeable to V2)

#### Key Contracts (Proxy Addresses)
- **YieldVault**: `0xBf000e0362d967B3583fdE2451BeA11b3723b81C`
- **StakingVault**: `0x14D815D29F9b39859a55F1392cff217ED642a8Ea`
- **USDC (Test)**: `0xBa16F5b2fDF7D5686D55c2917F323feCbFef76e6`

[View on Hoodi Explorer](https://hoodi.etherscan.io/address/0xBf000e0362d967B3583fdE2451BeA11b3723b81C)

---

## System Architecture

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                    HASTRA ETHEREUM VAULT PROTOCOL                          ┃
┃                        (Two-Vault Architecture)                            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┌─────────────────────────────────────────────────────────────────────────┐
│                         USER ENTRY POINT: USDC                           │
│                    (Circle USD Coin - 6 decimals)                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ deposit()
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         YIELDVAULT (wYLDS)                               │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Proxy: 0xBf00...b81C (NEVER changes)                             │  │
│  │ Implementation: 0xE724...3ed5 (upgradeable)                       │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │ Token: wYLDS (Wrapped YLDS)                                       │  │
│  │ Type: ERC-4626 (Modified - no instant redeem)                     │  │
|  │  withdraw() and redeem() are disabled (they revert with           │  │
|  │   "Use requestRedeem/completeRedeem")                             │  │
│  │ Ratio: 1:1 with USDC (always)                                     │  │
│  │ Redemption: Two-step (request → admin complete)                   │  │
│  │ Rewards: Merkle-based epochs                                      │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ wYLDS tokens
                                    │ (can stake for yield)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       STAKINGVAULT (PRIME)                               │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Proxy: 0x14D8...a8Ea (NEVER changes)                              │  │
│  │ Implementation: 0xc3C7...3A7 (upgradeable)                        │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │ Token: PRIME (Prime Staked YLDS)                                  │  │
│  │ Type: ERC-4626 (Standard - full compliance)                       │  │
│  │ Ratio: Appreciates with rewards                                   │  │
│  │ Redemption: Instant (standard ERC-4626)                           │  │
│  │ Rewards: Minted to vault, increases share value                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ redeem() / withdraw()
                                    ▼
                              wYLDS (increased for the USER/redeemer, can then exchange for USDC on YIELDVAULT)
```

---

## 🔄 YieldVault (wYLDS) - Complete Flow Diagram

### Deposit Flow

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                         YIELDVAULT DEPOSIT PROCESS                          ┃
┃                            (USDC → wYLDS)                                   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐
│   👤 USER   │───▶│  📝 APPROVE     │───▶│  💰 DEPOSIT     │───▶│ ✅ RECEIVE   │
│             │    │                 │    │                 │    │              │
│Has USDC     │    │ approve(vault,  │    │ vault.deposit(  │    │ wYLDS minted │
│100 USDC     │    │  amount)        │    │   100e6,        │    │ 100 wYLDS    │
│             │    │                 │    │   receiver)     │    │ (1:1 ratio)  │
└─────────────┘    └─────────────────┘    └─────────────────┘    └──────────────┘
                            │                       │                      │
                            ▼                       ▼                      ▼
                   ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐
                   │ 🔍 CHECKS       │    │ 🔒 TRANSFER     │    │ 📊 UPDATE    │
                   │ • Not paused    │    │ USDC from user  │    │ • totalSupply│
                   │ • Amount > 0    │    │ to vault        │    │ • balances[] │
                   │ • Not frozen    │    │ via safeTransfer│    │ • Emit event │
                   └─────────────────┘    └─────────────────┘    └──────────────┘
```

**Key Points**:
- ✅ 1:1 ratio: 100 USDC = 100 wYLDS
- ✅ `convertToShares()` hardcoded to return assets (no calculation)
- ✅ Uses standard ERC-4626 `deposit()` function or can use depositWithPermit
- ✅ Alternative: `mint()` to specify exact shares

### Two-Step Redemption Flow

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                    YIELDVAULT TWO-STEP REDEMPTION                           ┃
┃                         (wYLDS → USDC via Admin)                            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

STEP 1: USER REQUESTS
┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   👤 USER   │───▶│ 📝 REQUEST      │───▶│ 🔒 LOCKED       │
│             │    │                 │    │                 │
│Has 100 wYLDS│    │requestRedeem(   │    │ 100 wYLDS moved │
│             │    │  100e6)         │    │ to vault address│
│             │    │                 │    │ User bal: 0     │
└─────────────┘    └─────────────────┘    └─────────────────┘
                            │                       │
                            ▼                       ▼
                   ┌─────────────────┐    ┌─────────────────┐
                   │ 📊 RECORD       │    │ ⏳ PENDING      │
                   │ pendingRedempt- │    │ Status: Waiting │
                   │ ions[user] =    │    │ for admin       │
                   │ {shares: 100,   │    │                 │
                   │  assets: 100,   │    │ Event:          │
                   │  timestamp}     │    │ RedemptionReq() │
                   └─────────────────┘    └─────────────────┘

STEP 2: OFF-CHAIN PROCESSING
┌─────────────────────────────────────────────────────────────┐
│ 🔍 COMPLIANCE CHECKS (Off-chain)                            │
│ ├─ KYC/AML verification                                     │
│ ├─ Sanctions screening                                      │
│ ├─ Legal review (if needed)                                 │
│ └─ Approve/Reject decision                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 💰 LIQUIDITY PREPARATION                                     │
│ ├─ Ensure USDC in redeemVault                               │
│ ├─ withdrawUSDC(whitelistedAddress, amount) if needed       │
│ └─ Verify sufficient balance                                │
└─────────────────────────────────────────────────────────────┘

STEP 3: ADMIN COMPLETES
┌──────────────────┐    ┌─────────────────┐    ┌──────────────┐
│ 👨‍💼 REWARDS_ADMIN│───▶│ ✅ COMPLETE     │───▶│ 💸 SEND USDC │
│                  │    │                 │    │              │
│Verified & ready  │    │completeRedeem(  │    │ Transfer 100 │
│                  │    │  userAddress)   │    │ USDC from    │
│                  │    │                 │    │ redeemVault  │
└──────────────────┘    └─────────────────┘    └──────────────┘
                                 │                      │
                                 ▼                      ▼
                        ┌─────────────────┐    ┌──────────────┐
                        │ 🔥 BURN         │    │ 🧹 CLEANUP   │
                        │ Burn 100 wYLDS  │    │ Clear pending│
                        │ from vault      │    │ redemption   │
                        │                 │    │ Event:       │
                        │ totalSupply -100│    │ RedemptionCo │
                        └─────────────────┘    └──────────────┘

ALTERNATIVE: USER CANCELS
┌─────────────┐    ┌─────────────────┐    ┌──────────────┐
│   👤 USER   │───▶│ ❌ CANCEL       │───▶│ 🔄 RETURN    │
│             │    │                 │    │              │
│Changes mind │    │cancelRedeem()   │    │ 100 wYLDS    │
│             │    │                 │    │ returned     │
│             │    │                 │    │ to user      │
└─────────────┘    └─────────────────┘    └──────────────┘
                            │                      │
                            ▼                      ▼
                   ┌─────────────────┐    ┌──────────────┐
                   │ 🧹 CLEANUP      │    │ Event:       │
                   │ Clear pending   │    │ RedemptionCa │
                   │ redemption      │    │ ncelled()    │
                   └─────────────────┘    └──────────────┘
```

### Merkle Rewards Flow

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                      YIELDVAULT MERKLE REWARDS                              ┃
┃                    (Epoch-Based Reward Distribution)                        ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

EPOCH CREATION (Admin)
┌──────────────────┐    ┌─────────────────┐    ┌──────────────┐
│ 👨‍💼 REWARDS_ADMIN│───▶│ 🌳 MERKLE TREE  │───▶│ 📋 CREATE    │
│                  │    │                 │    │ EPOCH        │
│Calculated rewards│    │ Off-chain:      │    │              │
│User A: 100 wYLDS │    │ Build tree from │    │createRewards │
│User B: 200 wYLDS │    │ user rewards    │    │Epoch(0,root, │
│User C: 150 wYLDS │    │ Root: 0x1234... │    │ 450e6)       │
└──────────────────┘    └─────────────────┘    └──────────────┘
                                 │                      │
                                 ▼                      ▼
                        ┌─────────────────┐    ┌──────────────┐
                        │ 📊 STORE        │    │ Event:       │
                        │ rewardsEpochs[0]│    │ RewardsEpoch │
                        │ = {root, total, │    │ Created()    │
                        │    timestamp}   │    │              │
                        └─────────────────┘    └──────────────┘

CLAIMING REWARDS (Users)
┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐
│   👤 USER A │───▶│ 🔐 PROVE        │───▶│ ✅ VERIFY       │───▶│ 💰 MINT      │
│             │    │                 │    │                 │    │              │
│Has proof for│    │claimRewards(    │    │ Verify proof    │    │ Mint 100     │
│100 wYLDS    │    │  epochIndex: 0, │    │ against root    │    │ wYLDS to     │
│             │    │  amount: 100e6, │    │                 │    │ User A       │
│             │    │  proof: [...]   │    │ MerkleProof.    │    │              │
└─────────────┘    └─────────────────┘    └─verify()────────┘    └──────────────┘
                            │                       │                      │
                            ▼                       ▼                      ▼
                   ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐
                   │ 🔍 CHECKS       │    │ 🚫 MARK CLAIMED │    │ 📊 UPDATE    │
                   │ • Not claimed   │    │ claimedRewards  │    │ • totalSupply│
                   │ • Valid epoch   │    │ [userEpochKey]  │    │ • User balance│
                   │ • Valid proof   │    │ = true          │    │ Event: Claim │
                   └─────────────────┘    └─────────────────┘    └──────────────┘

DOUBLE-CLAIM PREVENTION
┌─────────────┐    ┌─────────────────┐
│   👤 USER A │───▶│ ❌ REJECTED     │
│  (again)    │    │                 │
│Tries to claim│    │ Revert:        │
│same epoch   │    │ RewardsAlready  │
│             │    │ Claimed         │
└─────────────┘    └─────────────────┘
```

---

## 🔄 StakingVault (PRIME) - Complete Flow Diagram

### Staking Flow (wYLDS → PRIME)

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                      STAKINGVAULT DEPOSIT PROCESS                           ┃
┃                           (wYLDS → PRIME)                                   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐
│   👤 USER   │───▶│  📝 APPROVE     │───▶│  🔒 DEPOSIT     │───▶│ ✅ RECEIVE   │
│             │    │                 │    │                 │    │              │
│Has 1000     │    │ approve(        │    │ vault.deposit(  │    │ PRIME minted │
│wYLDS        │    │  stakingVault,  │    │   1000e6,       │    │              │
│             │    │  amount)        │    │   receiver)     │    │ Initial:     │
│             │    │                 │    │                 │    │ 1000 PRIME   │
└─────────────┘    └─────────────────┘    └─────────────────┘    └──────────────┘
                            │                       │                      │
                            ▼                       ▼                      ▼
                   ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐
                   │ 🔍 CHECKS       │    │ 💰 TRANSFER     │    │ 📊 CONVERSION│
                   │ • Not paused    │    │ wYLDS from user │    │ shares =     │
                   │ • Amount > 0    │    │ to vault via    │    │ convertTo    │
                   │ • Not frozen    │    │ safeTransferFrom│    │ Shares()     │
                   └─────────────────┘    └─────────────────┘    └──────────────┘

SHARE CALCULATION (No Rewards Yet)
  shares = assets * totalSupply() / totalAssets()
  shares = 1000 * 0 / 0 = 1000 (first deposit, 1:1 ratio)
```

### Rewards Distribution Flow

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                   STAKINGVAULT REWARDS DISTRIBUTION                         ┃
┃                  (Increases Share Value Automatically)                      ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

BEFORE REWARDS
┌────────────────────────────────────────┐
│ Vault State:                            │
│ • totalAssets: 10,000 wYLDS            │
│ • totalSupply: 10,000 PRIME            │
│ • Ratio: 1 PRIME = 1.0 wYLDS          │
└────────────────────────────────────────┘

DISTRIBUTE REWARDS
┌──────────────────┐    ┌─────────────────┐    ┌──────────────┐
│ 👨‍💼 REWARDS_ADMIN│───▶│ 💎 DISTRIBUTE   │───▶│ 🏦 MINT      │
│                  │    │                 │    │              │
│Calculated rewards│    │distributeRewards│    │ YieldVault.  │
│500 wYLDS        │    │ (500e6)         │    │ mintRewards( │
│                  │    │                 │    │  vault, 500) │
└──────────────────┘    └─────────────────┘    └──────────────┘
                                 │                      │
                                 ▼                      ▼
                        ┌─────────────────┐    ┌──────────────┐
                        │ 📊 VAULT GETS   │    │ Event:       │
                        │ 500 wYLDS       │    │ RewardsDist  │
                        │                 │    │ ributed()    │
                        │ totalAssets:    │    │              │
                        │ 10,500 wYLDS ✅ │    │              │
                        └─────────────────┘    └──────────────┘

AFTER REWARDS
┌────────────────────────────────────────┐
│ Vault State:                            │
│ • totalAssets: 10,500 wYLDS ↑         │
│ • totalSupply: 10,000 PRIME (same)    │
│ • Ratio: 1 PRIME = 1.05 wYLDS ↑      │
└────────────────────────────────────────┘

USER IMPACT (Automatic!)
┌────────────────────────────────────────┐
│ User with 1000 PRIME:                   │
│ Before: Worth 1000 wYLDS               │
│ After:  Worth 1050 wYLDS ✨            │
│                                         │
│ No action needed - value increased!     │
└────────────────────────────────────────┘
```

### Unstaking Flow (PRIME → wYLDS)

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                     STAKINGVAULT INSTANT REDEMPTION                         ┃
┃                          (PRIME → wYLDS)                                    ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

OPTION 1: REDEEM (Specify Shares)
┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐
│   👤 USER   │───▶│ 🔥 REDEEM       │───▶│ 📊 CALCULATE    │───▶│ 💸 SEND      │
│             │    │                 │    │                 │    │              │
│Has 1000     │    │vault.redeem(    │    │assets = preview │    │Send 1050     │
│PRIME        │    │  1000e6,        │    │Redeem(1000)     │    │wYLDS to user │
│             │    │  receiver,      │    │                 │    │              │
│             │    │  owner)         │    │= 1050 wYLDS     │    │Burn 1000     │
│             │    │                 │    │(with rewards!)  │    │PRIME         │
└─────────────┘    └─────────────────┘    └─────────────────┘    └──────────────┘

OPTION 2: WITHDRAW (Specify Assets)
┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐
│   👤 USER   │───▶│ 💰 WITHDRAW     │───▶│ 📊 CALCULATE    │───▶│ 💸 SEND      │
│             │    │                 │    │                 │    │              │
│Wants exactly│    │vault.withdraw(  │    │shares = preview │    │Send 525      │
│525 wYLDS    │    │  525e6,         │    │Withdraw(525)    │    │wYLDS to user │
│             │    │  receiver,      │    │                 │    │              │
│             │    │  owner)         │    │= 500 PRIME      │    │Burn 500      │
│             │    │                 │    │                 │    │PRIME         │
└─────────────┘    └─────────────────┘    └─────────────────┘    └──────────────┘
                            │                       │                      │
                            ▼                       ▼                      ▼
                   ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐
                   │ 🔍 CHECKS       │    │ ✅ STANDARD     │    │ Event:       │
                   │ • Not paused    │    │ ERC-4626        │    │ Withdraw()   │
                   │ • Not frozen    │    │ • No unbonding  │    │              │
                   │ • Has balance   │    │ • Instant!      │    │              │
                   └─────────────────┘    └─────────────────┘    └──────────────┘
```

---

## Contract Comparison

### YieldVault vs StakingVault

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
│ convertToShares()    │ return assets (hardcoded) │ Uses OpenZeppelin formula           │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Deposit              │ ✅ deposit() / mint()     │ ✅ deposit() / mint()               │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Instant Redemption   │ ❌ Disabled (reverts)     │ ✅ withdraw() / redeem()            │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Custom Redemption    │ ✅ Two-step process       │ ❌ Not needed                       │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Rewards              │ Merkle epochs             │ Direct minting to vault             │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Share Value Change   │ ❌ No (always 1:1)        │ ✅ Yes (increases)                  │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Whitelist            │ ✅ For USDC withdrawals   │ ❌ Not needed                       │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Freeze/Thaw          │ ✅ Yes                    │ ✅ Yes                              │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Upgradeable          │ ✅ UUPS                   │ ✅ UUPS                             │
├──────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ Use Case             │ Regulatory compliance     │ Yield generation                    │
└──────────────────────┴───────────────────────────┴─────────────────────────────────────┘
```

## State Storage

### YieldVault Storage Layout

```
Slot 0-N: OpenZeppelin Upgradeable base contracts (with gaps)
  ├─ ERC20Upgradeable
  ├─ ERC4626Upgradeable
  ├─ AccessControlUpgradeable
  ├─ PausableUpgradeable
  └─ ReentrancyGuardUpgradeable

Custom State Variables:
  ├─ address redeemVault
  ├─ mapping(address => PendingRedemption) pendingRedemptions
  ├─ mapping(uint256 => RewardsEpoch) rewardsEpochs
  ├─ mapping(bytes32 => bool) claimedRewards
  ├─ mapping(address => bool) frozen
  ├─ uint256 currentEpochIndex
  ├─ mapping(address => bool) whitelistedAddresses
  └─ address[] _whitelistArray
```

### StakingVault Storage Layout

```
Slot 0-N: OpenZeppelin Upgradeable base contracts (with gaps)
  ├─ ERC20Upgradeable
  ├─ ERC4626Upgradeable
  ├─ AccessControlUpgradeable
  ├─ PausableUpgradeable
  └─ ReentrancyGuardUpgradeable

Custom State Variables:
  ├─ address yieldVault
  ├─ mapping(address => bool) frozen
  └─ uint256 _totalManagedAssets
```

## Gas Optimization Notes

**YieldVault**:
- ✅ Merkle proofs for rewards (O(log n) verification)
- ✅ Minimal storage in `convertToShares()` (pure function)
- ✅ Batch whitelist operations possible

**StakingVault**:
- ✅ Standard ERC-4626 math (optimized by OpenZeppelin)
- ✅ No unbonding period (gas-free instant redemption)
- ✅ Rewards via minting (no iterations)

## Security Considerations

1. **Freeze/Thaw**: Can block malicious actors instantly
2. **Two-Step Redemption**: Prevents flash loan attacks on liquidity
3. **Merkle Rewards**: Prevents double-claiming
4. **ReentrancyGuard**: Protects all state-changing functions
5. **Pausable**: Emergency stop for both vaults
6. **UUPS Upgradeable**: Can fix bugs without losing state
7. **Role-Based Access**: Separation of duties
8. **Inflation Attack Protection**: Internal accounting via `_totalManagedAssets` prevents donation-based inflation attacks on share price

## See Also

- [ROLES.md](./ROLES.md) - All roles and permissions
- [UPGRADES.md](./UPGRADES.md) - UUPS upgrade process
- [COMPLIANCE.md](./COMPLIANCE.md) - Freeze/thaw and two-step redemption details
- [ERC-4626 Standard](https://eips.ethereum.org/EIPS/eip-4626)
