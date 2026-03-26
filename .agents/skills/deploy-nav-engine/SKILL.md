---
name: deploy-nav-engine
description: Deploy HastraNavEngine UUPS proxy — Chainlink NAV rate oracle
---

# Deploy HastraNavEngine

Deploys the HastraNavEngine UUPS proxy — the on-chain NAV rate calculator that
feeds the StakingVault share price. Uses Chainlink Data Streams (int192 schema v7).

Deploy this **before** linking StakingVault to an oracle, or after if you're adding
the feed post-launch.

## Prerequisites

```bash
# .env
PRIVATE_KEY=<deployer_private_key>
HOODI_RPC_URL=https://rpc.hoodi.tech   # or SEPOLIA_RPC_URL

# Optional — defaults to deployer if not set
NAV_OWNER_ADDRESS=<owner_of_nav_engine>
NAV_UPDATER_ADDRESS=<bot_address_that_pushes_rate_updates>
```

## Deploy

```bash
npx hardhat run scripts/deploy/deployNavEngine.ts --network hoodi
# or
npx hardhat run scripts/deploy/deployNavEngine.ts --network sepolia
```

## What it does

1. Deploys `HastraNavEngine` as a **UUPS proxy** via `upgrades.deployProxy`
   - Owner: `NAV_OWNER_ADDRESS` (deployer by default)
   - Updater: `NAV_UPDATER_ADDRESS` (deployer by default)
   - Max rate difference: **10%** (`0.1e18`) — reverts if a single update moves rate >10%
   - Min rate: **0.5** (`500000000000000000`)
   - Max rate: **3.0** (`3000000000000000000`)
2. Saves address to `deployment_nav_testnet_<network>.json`

## Output

```
HastraNavEngine (proxy) deployed at: 0x...
HastraNavEngine implementation:      0x...
```

## Verify on Etherscan

```bash
npx hardhat verify <IMPL_ADDRESS> --network hoodi
```

## Link to StakingVault after deploy

```bash
cast send <STAKING_VAULT_ADDRESS> "setNavOracle(address)" <NAV_ENGINE_ADDRESS> \
  --private-key $PRIVATE_KEY --rpc-url $HOODI_RPC_URL
```

Or via admin script:
```bash
npx hardhat run scripts/admin/set_nav_oracle.ts --network hoodi
```

## Post-deploy checklist

- [ ] Verify initial rate is within `[minRate, maxRate]` bounds
- [ ] Confirm `updater` role is set to the bot/service that will push rate updates
- [ ] StakingVault linked via `setNavOracle`
- [ ] First rate update sent and confirmed on-chain before opening deposits
- [ ] Monitor: if NAV engine is paused or rate goes stale, StakingVault deposits/withdrawals will revert

## Key contract facts

- Uses `Ownable2StepUpgradeable` — ownership transfer requires two-step confirmation
- Rate stored as `int192` (Chainlink Data Streams schema v7)
- Rate bounds enforced on every update — protects against oracle manipulation
- Uses ERC-7201 namespaced storage (not `__gap` pattern)
- UUPS upgrade: owner required to call `upgradeTo`

## Existing deployments

| Network | Proxy Address |
|---------|--------------|
| sepolia | `0xBc494b33Cd67e8033644608876b10BB84d0eDF55` |
| hoodi   | see `deployment_nav_testnet_hoodi.json` |
