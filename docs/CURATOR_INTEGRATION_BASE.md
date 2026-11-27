# Hastra Vault Protocol on Base — Curator Integration Guide

> Base mainnet (Chain ID: **8453**) companion to [CURATOR_INTEGRATION.md](./CURATOR_INTEGRATION.md). The vault logic, ABIs and user flows (deposit, two-step redemption, staking, merkle claims, compliance, events, errors) are the same as on Ethereum. This page lists what differs on Base.

---

## 1. Contract Addresses (Base mainnet, Chain ID: 8453)

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

> [!IMPORTANT]
> Always interact with the **proxy address**, never the implementation. Implementations: wYLDS `0x244870bD1BD57853965917c9b3E1143E7dB8839c`, PRIME `0x8F602ab04c7d33E8c6a820692E5dBB3257cbd175`, AUTO `0xE661366764d23B3dC52385E63c712Ba89AF5Bc10`, SMB `0x997E2Efbce91D170B00EA402e35a66C887EE1da9`, FeedVerifier `0xfEd839B6BA09c1aBf4C768abA0ECA50746E4eca9`.

---

## 2. Differences from Ethereum

| Topic | Ethereum | Base |
|-------|----------|------|
| Chain ID | 1 | 8453 |
| USDC | `0xA0b8…eB48` | `0x8335…2913` (6 decimals, same flow) |
| Share price source | Per-vault `HastraNavEngine` (`getRate()`) | Shared `FeedVerifier`, one Chainlink Data Streams feed per staking vault. No NavEngine |
| Explorer | etherscan.io | basescan.org |
| Safe owner set | 7 owners | 7 owners, **not identical** to Ethereum (to be aligned before go-live) |

Chainlink Data Streams feed IDs on the Base FeedVerifier:

| Vault | Feed ID |
|-------|---------|
| PRIME | `0x0007c8ed155d952e003b1e15ce7666fea785cfbe216577d578fce3920e997271` |
| AUTO | `0x00076185d4b7a4961db969a90353e84a18a0125388535e6dda0f0faeeb4e8f51` |
| SMB | `0x00076f0ebf018138682718578c470922765bbc424d02aef426ddfb6f37a623b4` |

---

## 3. Quick Start

```typescript
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("https://mainnet.base.org"); // chainId 8453

const YIELD_VAULT  = "0x85ADB3Fdc2b052Cd178089DF87B79FBfdafe3cf4";
const STAKING_VAULT = "0x91cea5EE73eEd4fa2bEde28C1f86128D725e523c"; // PRIME
const USDC         = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Deposit USDC → wYLDS (1:1)
await usdc.approve(YIELD_VAULT, amount);
await yieldVault.deposit(amount, receiver);

// Stake wYLDS → PRIME
await yieldVault.approve(STAKING_VAULT, amount);
await stakingVault.deposit(amount, receiver);
```

See sections 4–5 of the Ethereum guide for redemption, unstaking, claims and state queries. They work unchanged with the Base addresses above.

---

## 4. NAV and Share Price on Base

```
Chainlink Data Streams
        │  (signed report)
        ▼
  [FeedVerifier] ── verifies via Chainlink VerifierProxy, stores price per feed ID
        │  priceOf(feedId)
        ▼
  [StakingVault / AUTO / SMB] ── navOracle() = FeedVerifier, navFeedId() = vault's feed
```

```typescript
const vault = new ethers.Contract(STAKING_VAULT, STAKING_VAULT_ABI, provider);

const oracle = await vault.navOracle();   // FeedVerifier address
const feedId = await vault.navFeedId();   // feed ID from the table above
```

> [!WARNING]
> `FeedVerifier.priceOf(feedId)` **reverts if the last verified price is older than the max staleness (3600s)**. A price must be published regularly by the FeedVerifier `UPDATER`. Integrators should handle a revert as "NAV stale" and not as a zero price.

---

## 5. Access Control on Base

Role bytes and capabilities are the same as the Ethereum guide. Current holders:

| Contract | Role | Holder |
|----------|------|--------|
| All 4 vaults + FeedVerifier | `DEFAULT_ADMIN`, `UPGRADER` | Timelock (24h delay; proposer is the Safe) |
| wYLDS | `WHITELIST_ADMIN`, `EPOCH_ADMIN` | Timelock |
| wYLDS | `PAUSER` | Safe, ops EOA `0x8571De3d27a9190AF98260C3B54aB7ff79048926` |
| wYLDS | `FREEZE_ADMIN` | ops EOA |
| wYLDS | `WITHDRAWAL_ADMIN` | `0x10980735fCa44C78D60A6C6edC7BbFCEe3F2eb92` |
| wYLDS | `REDEEM_OPERATOR` | `0x9F1Ca6d3931551cbFD571706acecd64C6E619ED1` |
| wYLDS | `REWARDS_ADMIN` | PRIME, AUTO, SMB vaults |
| PRIME, AUTO | `PAUSER` | Safe, ops EOA |
| SMB | `PAUSER` | ops EOA only |
| PRIME, AUTO, SMB | `FREEZE_ADMIN` | ops EOA |
| PRIME, AUTO, SMB | `REWARDS_ADMIN` | Redeem Vault EOA `0xA8C3…faCd` |
| FeedVerifier | `UPDATER` | `0xF0a5baEBF749562fAe5f3d9d2928357ae6cd73cd` |

Role changes and upgrades go through the Timelock: the Safe schedules, then anyone can execute after 24h.


---

## 6. Notes

- Base mainnet addresses for operational EOAs match Ethereum mainnet by design (same KMS keys).
- Gas on Base is much cheaper than the Ethereum figures in section 11 of the main guide.
- Always interact with the proxy address.

Last updated: 2026-11-27.
