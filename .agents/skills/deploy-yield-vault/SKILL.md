---
name: deploy-yield-vault
description: Deploy YieldVault (wYLDS) UUPS proxy to a target network
---

# Deploy YieldVault (wYLDS)

Deploys the YieldVault UUPS proxy — the entry vault that accepts USDC deposits
and mints wYLDS tokens 1:1. Must be deployed before StakingVault.

## Prerequisites

- MockUSDC (or real USDC) already deployed — set `USDC_ADDRESS`
- Deployer wallet funded with ETH for gas

```bash
# .env
PRIVATE_KEY=<deployer_private_key>
HOODI_RPC_URL=https://rpc.hoodi.tech

# Optional role addresses (default to deployer if not set)
USDC_ADDRESS=<usdc_address>
REDEEM_VAULT_ADDRESS=<address_that_receives_usdc_redemptions>
FREEZE_ADMIN_ADDRESS=<freeze_admin>
REWARDS_ADMIN_ADDRESS=<rewards_admin>
WHITELIST_ADMIN_ADDRESS=<whitelist_admin>
WITHDRAWAL_ADMIN_ADDRESS=<withdrawal_admin>
```

## Deploy

```bash
npx hardhat run scripts/deploy/deploy.ts --network hoodi
# or dry-run to preview without sending txs:
DRY_RUN=true npx hardhat run scripts/deploy/deploy.ts --network hoodi
```

## What it does

1. Deploys `YieldVault` as a **UUPS proxy** via `upgrades.deployProxy`
   - Asset: USDC
   - Name: `"Wrapped YLDS"`, Symbol: `"wYLDS"`, Decimals: 6
   - Admin: deployer
   - RedeemVault: `REDEEM_VAULT_ADDRESS` (defaults to deployer)
2. Grants roles on YieldVault:
   - `FREEZE_ADMIN_ROLE` → `FREEZE_ADMIN_ADDRESS`
   - `REWARDS_ADMIN_ROLE` → `REWARDS_ADMIN_ADDRESS` *(StakingVault added separately after its deploy)*
   - `WHITELIST_ADMIN_ROLE` → `WHITELIST_ADMIN_ADDRESS`
   - `WITHDRAWAL_ADMIN_ROLE` → `WITHDRAWAL_ADMIN_ADDRESS`
3. Saves addresses to `deployment_testnet_<network>.json`

## Output

```
YieldVault (proxy) deployed at: 0x...
YieldVault implementation:      0x...
```

## Verify on Etherscan

```bash
# Verify implementation (proxy is auto-verified by OZ plugin)
npx hardhat verify <IMPL_ADDRESS> --network hoodi
```

## Post-deploy checklist

- [ ] `REWARDS_ADMIN_ROLE` granted to StakingVault address (done in StakingVault deploy step)
- [ ] `redeemVault` address set correctly and funded with USDC
- [ ] Whitelist populated for any addresses that need to withdraw USDC
- [ ] Pause status: contract starts **unpaused**

## Key contract facts

- Two-step redemption: `requestRedeem(shares)` → wait → `completeRedeem()`
- Reward epochs use Merkle proofs: `createRewardsEpoch` + `claimRewards`
- Freeze/thaw individual accounts via `FREEZE_ADMIN_ROLE`
- UUPS upgrade: `UPGRADER_ROLE` required to call `upgradeTo`
- Storage: 42 `__gap` slots reserved (50 total slots used)

## Existing deployments

| Network | Proxy Address |
|---------|--------------|
| hoodi   | `0x1355eBe3669FA92c1eD94c434aCF9d06E2BF7CC8` |
| sepolia | `0x0258787Eb97DD01436B562943D8ca85B772D7b98` |
