---
name: deploy-staking-vault
description: Deploy StakingVault (PRIME) UUPS proxy to a target network
---

# Deploy StakingVault (PRIME)

Deploys the StakingVault UUPS proxy — accepts wYLDS deposits and mints appreciating
PRIME tokens using a NAV oracle. **Requires YieldVault to be deployed first.**

> ⚠️ StakingVault **reverts on all deposits and withdrawals** if `navOracle` is `address(0)`.
> Set the NAV oracle (HastraNavEngine) before going live or use AutoStakingVault instead.

## Prerequisites

- YieldVault (wYLDS) already deployed
- Deployer wallet funded with ETH for gas

```bash
# .env
PRIVATE_KEY=<deployer_private_key>
HOODI_RPC_URL=https://rpc.hoodi.tech

YIELD_VAULT_ADDRESS=<wYLDS_proxy_address>

# Optional role addresses (default to deployer if not set)
FREEZE_ADMIN_ADDRESS=<freeze_admin>
REWARDS_ADMIN_ADDRESS=<rewards_admin>
NAV_ORACLE_UPDATER_ADDRESS=<nav_oracle_bot_address>
```

## Deploy

```bash
npx hardhat run scripts/deploy/deploy.ts --network hoodi
# or dry-run:
DRY_RUN=true npx hardhat run scripts/deploy/deploy.ts --network hoodi
```

## What it does

1. Deploys `StakingVault` as a **UUPS proxy** via `upgrades.deployProxy`
   - Asset: wYLDS (YieldVault address)
   - Name: `"Prime Staked YLDS"`, Symbol: `"PRIME"`, Decimals: 6
   - Admin: deployer
2. Grants roles on StakingVault:
   - `FREEZE_ADMIN_ROLE` → `FREEZE_ADMIN_ADDRESS`
   - `REWARDS_ADMIN_ROLE` → `REWARDS_ADMIN_ADDRESS`
   - `NAV_ORACLE_UPDATER_ROLE` → `NAV_ORACLE_UPDATER_ADDRESS`
3. Grants `REWARDS_ADMIN_ROLE` on **YieldVault** to StakingVault address
   *(so StakingVault can mint wYLDS rewards via YieldVault)*
4. Saves addresses to `deployment_testnet_<network>.json`

## Output

```
StakingVault (proxy) deployed at: 0x...
StakingVault implementation:      0x...
```

## Verify on Etherscan

```bash
npx hardhat verify <IMPL_ADDRESS> --network hoodi
```

## Post-deploy checklist

- [ ] `REWARDS_ADMIN_ROLE` on YieldVault granted to StakingVault ✅ (done by deploy script)
- [ ] NAV oracle set: `StakingVault.setNavOracle(<HastraNavEngine_address>)`
  - **Do not open deposits until this is set** — vault reverts without it
- [ ] NAV oracle rate is live and within bounds before first user deposit
- [ ] Pause status: contract starts **unpaused**

## Set NAV oracle after deploy

```bash
# Via admin script or direct call:
npx hardhat run scripts/admin/set_nav_oracle.ts --network hoodi
# or via cast:
cast send <STAKING_VAULT_ADDRESS> "setNavOracle(address)" <NAV_ENGINE_ADDRESS> \
  --private-key $PRIVATE_KEY --rpc-url $HOODI_RPC_URL
```

## Key contract facts

- Share price appreciates via NAV oracle — PRIME:wYLDS ratio is not 1:1
- Instant redemption (no two-step, unlike YieldVault)
- Storage: 46 `__gap` slots reserved
- UUPS upgrade: `UPGRADER_ROLE` required

## Existing deployments

| Network | Proxy Address |
|---------|--------------|
| hoodi   | `0x45c3Ce1a86d25a25F7241f1973f12ff1D3D218f3` |
| sepolia | `0xFf22361Ca2590761A2429D4127b7FF25E79fdC04` |
