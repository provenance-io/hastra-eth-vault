---
name: deploy-auto-staking-vault
description: Deploy AutoStakingVault UUPS proxy — StakingVault with NAV fallback
---

# Deploy AutoStakingVault

Deploys the AutoStakingVault UUPS proxy — a variant of StakingVault that **does not
revert** when no NAV oracle is set. Falls back to standard ERC-4626 1:1 share ratio.

Use this when:
- Chainlink Data Streams feed is not yet live for your network
- You want the vault open for deposits before the NAV oracle is ready
- Testing pre-oracle behavior

**Requires YieldVault to be deployed first.**

## Prerequisites

```bash
# .env
PRIVATE_KEY=<deployer_private_key>
HOODI_RPC_URL=https://rpc.hoodi.tech

YIELD_VAULT_ADDRESS=<wYLDS_proxy_address>

FREEZE_ADMIN_ADDRESS=<freeze_admin>
REWARDS_ADMIN_ADDRESS=<rewards_admin>
NAV_ORACLE_UPDATER_ADDRESS=<nav_oracle_bot_address>
```

## Deploy

```bash
npx hardhat run scripts/deploy/deployAutoStaking.ts --network hoodi
# or
npx hardhat run scripts/deploy/deployAutoStaking.ts --network sepolia
```

## What it does

1. Deploys `AutoStakingVault` as a **UUPS proxy**
   - Asset: wYLDS (YieldVault address)
   - Name/Symbol configurable (defaults to PRIME variant)
   - NAV oracle: optional — falls back to ERC-4626 ratio if not set
2. Grants roles (same as StakingVault)
3. Saves addresses to `deployment_auto_staking_<network>.json`

## Output

```
AutoStakingVault (proxy) deployed at: 0x...
AutoStakingVault implementation:      0x...
```

## Verify on Etherscan

```bash
npx hardhat verify <IMPL_ADDRESS> --network hoodi
```

## AutoStakingVault vs StakingVault

| Feature | StakingVault | AutoStakingVault |
|---------|-------------|-----------------|
| NAV oracle required | ✅ Yes (reverts without) | ❌ No (falls back to 1:1) |
| Share appreciation | Via NAV oracle | Via NAV oracle (when set) |
| Pre-oracle deposits | ❌ Blocked | ✅ Allowed |
| Production use | When feed is live | Bridge period / testing |

## Post-deploy checklist

- [ ] `REWARDS_ADMIN_ROLE` on YieldVault granted to AutoStakingVault
  ```bash
  cast send <YIELD_VAULT> "grantRole(bytes32,address)" \
    $(cast keccak "REWARDS_ADMIN_ROLE") <AUTO_STAKING_VAULT> \
    --private-key $PRIVATE_KEY --rpc-url $HOODI_RPC_URL
  ```
- [ ] Set NAV oracle when Chainlink feed goes live: `setNavOracle(<HastraNavEngine_address>)`
- [ ] Transition plan: if replacing StakingVault with AutoStakingVault, ensure users migrate shares

## Existing deployments

| Network | Proxy Address |
|---------|--------------|
| sepolia | `deployment_auto_staking_sepolia.json` |
