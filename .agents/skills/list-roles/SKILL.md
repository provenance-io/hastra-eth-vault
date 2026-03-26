---
name: list-roles
description: Show all AccessControl role holders for a deployed contract
---

# List Roles

Prints every role and its current holders for any deployed Hastra contract.
Uses `hasRole()` view calls — fast, no event scanning required.

Supports `yieldvault`, `stakingvault`, `feedverifier`, and `navengine` (Ownable2Step).

## Prerequisites

```bash
# .env
PRIVATE_KEY=<any_funded_wallet>       # read-only calls, any key works
SEPOLIA_RPC_URL=https://...
# or MAINNET_RPC_URL for mainnet
```

## Usage

```bash
CONTRACT_ADDRESS=<proxy_address> CONTRACT_TYPE=<type> \
  npx hardhat run scripts/ops/list-roles.ts --network <network>
```

**CONTRACT_TYPE options:** `yieldvault` | `stakingvault` | `feedverifier` | `navengine`

### Optional: check additional addresses (Safe, bots, etc.)

```bash
CONTRACT_ADDRESS=<proxy> CONTRACT_TYPE=yieldvault \
  EXTRA_ADDRESSES=0xSafeAddr,0xBotAddr \
  npx hardhat run scripts/ops/list-roles.ts --network sepolia
```

## Examples

```bash
# YieldVault roles on Sepolia
CONTRACT_ADDRESS=0x0258787Eb97DD01436B562943D8ca85B772D7b98 CONTRACT_TYPE=yieldvault \
  npx hardhat run scripts/ops/list-roles.ts --network sepolia

# StakingVault roles on Sepolia
CONTRACT_ADDRESS=0xFf22361Ca2590761A2429D4127b7FF25E79fdC04 CONTRACT_TYPE=stakingvault \
  npx hardhat run scripts/ops/list-roles.ts --network sepolia

# FeedVerifier roles on Sepolia
CONTRACT_ADDRESS=0xCd9DC3EFaE333Be42d9CbAc0B4F8A4af8f3C8f3D CONTRACT_TYPE=feedverifier \
  npx hardhat run scripts/ops/list-roles.ts --network sepolia

# NavEngine owner/updater on Sepolia
CONTRACT_ADDRESS=0xBc494b33Cd67e8033644608876b10BB84d0eDF55 CONTRACT_TYPE=navengine \
  npx hardhat run scripts/ops/list-roles.ts --network sepolia
```

## What it checks

The script automatically scans all `deployment_*.json` files to build the address list.
Add `EXTRA_ADDRESSES` for any addresses not in those files (e.g. Safe, new bots).

### YieldVault roles
- `DEFAULT_ADMIN_ROLE` — full admin
- `UPGRADER_ROLE` — can upgrade proxy
- `PAUSER_ROLE` — can pause/unpause
- `FREEZE_ADMIN_ROLE` — can freeze accounts
- `REWARDS_ADMIN_ROLE` — can mint wYLDS (should include StakingVault contract)
- `WHITELIST_ADMIN_ROLE` — can manage withdrawal whitelist
- `WITHDRAWAL_ADMIN_ROLE` — can execute whitelisted withdrawals

### StakingVault roles
- `DEFAULT_ADMIN_ROLE`, `UPGRADER_ROLE`, `PAUSER_ROLE`, `FREEZE_ADMIN_ROLE`
- `REWARDS_ADMIN_ROLE` — calls `distributeRewards()`
- `NAV_ORACLE_UPDATER_ROLE` — sets FeedVerifier oracle address

### FeedVerifier roles
- `DEFAULT_ADMIN_ROLE`, `UPGRADER_ROLE`, `PAUSER_ROLE`
- `UPDATER_ROLE` — submits Chainlink price reports (NAV bot)

### NavEngine (Ownable2Step)
- `owner` — sole admin
- `pendingOwner` — address waiting to accept ownership (2-step transfer)
- `updater` — submits NAV rates

## Sample output

```
══════════════════════════════════════════════════════════════
  ROLE REPORT — YIELDVAULT
  Address: 0x0258787Eb97DD01436B562943D8ca85B772D7b98
  Network: sepolia
  Checking 19 addresses
══════════════════════════════════════════════════════════════

  ✅ DEFAULT_ADMIN_ROLE
     0x3778F66336F79B2B0D86E759499D191EA030a4c6

  ✅ REWARDS_ADMIN_ROLE
     0x3778F66336F79B2B0D86E759499D191EA030a4c6
     0xFf22361Ca2590761A2429D4127b7FF25E79fdC04   ← StakingVault contract

  ⬜ WHITELIST_ADMIN_ROLE
     (none of the checked addresses hold this role)
```

## When to use

- Before and after Safe handover — confirm who holds what
- Before revoking deployer — verify Safe has all required roles first
- After any `grantRole` / `revokeRole` — verify the change took effect
- Audit / compliance checks

## Existing deployments

| Contract | Network | Proxy Address |
|----------|---------|---------------|
| YieldVault | sepolia | `0x0258787Eb97DD01436B562943D8ca85B772D7b98` |
| StakingVault | sepolia | `0xFf22361Ca2590761A2429D4127b7FF25E79fdC04` |
| FeedVerifier | sepolia | `0xCd9DC3EFaE333Be42d9CbAc0B4F8A4af8f3C8f3D` |
| NavEngine | sepolia | `0xBc494b33Cd67e8033644608876b10BB84d0eDF55` |
