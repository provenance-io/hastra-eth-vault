---
name: plan-ticket
description: Build a practical implementation plan for a Solidity/Hardhat ticket
---

# Plan ticket

Build a practical implementation plan for the provided ticket, task, or work request.
Ground the plan in the actual architecture of this Hardhat/Foundry EVM repo.

Return:

- `Goal:` one or two sentences defining the intended outcome
- `Scope:` affected contracts, roles, storage, scripts, and tests
- `Likely files:` concrete file references in `contracts/`, `scripts/`, `test/`
- `Plan:` a small numbered list of reviewable implementation steps
- `Risks:` key blockers, storage layout issues, upgrade safety, role gaps
- `Split options:` whether work should be broken into smaller tasks or stacked PRs

Guidelines:

- always check `__gap` slot counts before adding new storage variables to upgradeable contracts
- if a storage variable is added, decrement `__gap` by the same number of slots — never shrink existing storage
- flag if a change requires a UUPS upgrade (`npx hardhat run scripts/admin/upgrade_*.ts`)
- note which roles are required to call new/changed functions and whether those roles are already granted
- if ERC-4626 share math is touched, flag precision/rounding edge cases (especially with NAV oracle)
- call out if `HastraNavEngine` rate bounds or `maxDifference` need adjusting
- note if Etherscan verification is needed post-deploy (`hardhat verify`)
- do not pad with boilerplate — keep it concrete and file-aware

EVM-specific risks to always consider:

- **Storage layout**: adding/reordering variables in upgradeable contracts corrupts proxy state
- **Initializer**: never add a second `initialize()` — use `reinitializer(N)` for upgrade migrations
- **Role assignment**: missing role grants after deploy will silently block operations
- **ERC-4626 rounding**: `convertToShares` / `convertToAssets` must be consistent; check with 0 totalSupply edge case
- **NAV oracle**: StakingVault reverts on deposit/withdraw if `navOracle` is address(0) — always set before going live
