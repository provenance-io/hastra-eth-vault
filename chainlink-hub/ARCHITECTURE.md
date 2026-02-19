# Chainlink Integration Architecture

## Two-Contract System

### 1. HastraNavEngine.sol (Main Project)
**Location:** `/contracts/HastraNavEngine.sol`  
**Dependencies:** OpenZeppelin v5.4.0 (main project dependencies)  
**Purpose:** On-chain NAV calculation that Chainlink DON reads FROM

**Schema v7 Compliance:**
✅ Returns `int192` for `getRate()` - matches Chainlink Schema v7 exchangeRate field type
✅ 18 decimal precision
✅ Signed integer (int192) per official schema spec

**What it does:**
- Bot calls `updateRate(totalSupply, totalTVL)`
- Calculates: `rate = totalTVL / totalSupply` (as int192)
- Validates rate (bounds, max change %)
- Chainlink DON reads `getRate()` → returns int192
- DON signs this int192 value into Schema v7 report

**Why separate from chainlink-hub:**
- No Chainlink dependencies  
- Uses latest OZ v5.x from main project
- Independent deployment/upgrade cycle

### 2. HastraHub.sol (Chainlink Hub Subproject)
**Location:** `/chainlink-hub/contracts/HastraHub.sol`  
**Dependencies:** OpenZeppelin v4.9.6 + Chainlink v1.5.0  
**Purpose:** Receives and verifies signed reports FROM Chainlink DON

**What it does:**
- Receives Schema v7 signed reports from bot
- Verifies signatures with Chainlink Verifier Proxy
- Extracts int192 exchangeRate from verified report
- Stores verified rate
- Vaults call `getExchangeRate()` to read verified rate

**Why separate subproject:**
- Requires Chainlink dependencies (OZ v4.9.6 compatible)
- Main project stays on OZ v5.x
- Clean separation of concerns

## Complete Flow

```
┌─────────────────────┐
│ Your Bot            │
│ Calculates TVL      │
└──────┬──────────────┘
       │
       ▼
┌────────────────────────────────┐
│ HastraNavEngine (Main Project) │  
│ - OZ v5.x                      │
│ - updateRate(supply, TVL)      │
│ - Stores int192 rate           │
│ - getRate() → int192           │ ← Chainlink DON reads this
└────────────────┬───────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ Chainlink DON                   │
│ - Reads int192 from NavEngine   │
│ - Signs as Schema v7 report     │
│ - exchangeRate field: int192    │
└──────────────┬──────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│ Your Bot (fetches signed report) │
└──────────────┬───────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│ HastraHub (chainlink-hub subproj)  │
│ - OZ v4.9.6 + Chainlink v1.5.0     │
│ - Verifies report with Verifier    │
│ - Extracts int192 exchangeRate     │
│ - Stores verified rate             │
└──────────────┬─────────────────────┘
               │
               ▼
┌──────────────────────────────┐
│ StakingVault (Main Project)  │
│ - Calls hub.getExchangeRate()│
│ - Uses for vault operations  │
└──────────────────────────────┘
```

## Chainlink Schema v7 Reference

From https://docs.chain.link/data-streams/reference/report-schema-v7:

| Field | Type | Description |
|-------|------|-------------|
| feedId | bytes32 | Unique identifier |
| validFromTimestamp | uint32 | Earliest valid time |
| observationsTimestamp | uint32 | Latest valid time |
| nativeFee | uint192 | Verification cost (native) |
| linkFee | uint192 | Verification cost (LINK) |
| expiresAt | uint32 | Expiration time |
| **exchangeRate** | **int192** | **DON's consensus median rate** |

✅ Our HastraNavEngine returns int192 - fully compliant with schema v7

## Deployment

### HastraNavEngine (Main Project)
```solidity
initialize(
  owner: <admin>,
  updater: <bot-address>,
  maxDifferencePercent: 0.1e18,  // 10%
  minRate: int192(0.5e18),       // 0.5 (int192!)
  maxRate: int192(3e18)          // 3.0 (int192!)
)
```

### HastraHub (Chainlink Hub)
```solidity
initialize(
  admin: <admin>,
  verifierProxyAddress: <chainlink-verifier>,
  feedId: <your-feed-id>,
  minRate: int192(0.5e18),
  maxRate: int192(3e18),
  maxChangePercent: 0.1e18,
  maxStaleness: 86400
)
```

## Dependencies & Security

**Main Project (HastraNavEngine):**
- OpenZeppelin v5.4.0 (latest, no vulnerabilities)
- No Chainlink dependencies

**Chainlink Hub (HastraHub):**
- OpenZeppelin v4.9.6 (patched - fixes CVE-2024-27094, CVE-2023-34234, CVE-2023-34459, CVE-2023-40014)
- Chainlink v1.5.0 (official Data Streams SDK)
- Symlinks resolve Chainlink's OZ v4.8.3 imports → v4.9.6 (patched)
