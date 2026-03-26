---
name: ticket-scan
description: Scan a ticket and gather Solidity/Hardhat implementation context
---

# Ticket scan

Scan the provided ticket, task, or work request and gather the implementation context
needed to start well in this Hardhat/Foundry EVM repo.

Inspect the most relevant local files and patterns before answering.

Return:

- `Summary:` one or two sentences describing what the work appears to be
- `Scope:` affected contracts, roles, storage slots, or proxy state
- `Likely files:` concrete files in `contracts/`, `scripts/`, or `test/`
- `Existing patterns:` nearby functions, role checks, events, or upgrade patterns to follow
- `Risks and blockers:` storage layout collisions, role gaps, UUPS upgrade safety, missing `__gap` slots, ERC-4626 share math edge cases
- `Open questions:` most important unknowns to resolve before implementation

Key architectural facts to keep in mind:

- All 4 production contracts use **UUPS upgradeable proxies** (OpenZeppelin). Proxy address never changes — only the implementation.
- **YieldVault (wYLDS):** ERC-4626, USDC → wYLDS 1:1, two-step redemption (`requestRedeem` → `completeRedeem`), Merkle reward epochs, freeze/thaw/whitelist
- **StakingVault (PRIME):** ERC-4626, wYLDS → PRIME (appreciating via NAV oracle), NAV oracle is **required** (reverts if not set)
- **AutoStakingVault:** StakingVault variant that **falls back** to standard ERC-4626 ratio when NAV oracle is not set
- **HastraNavEngine:** Chainlink Data Streams NAV rate calculator, `Ownable2StepUpgradeable`
- StakingVault is granted `REWARDS_ADMIN_ROLE` on YieldVault to mint rewards via CPI-equivalent
- Contracts have `__gap` reserved slots — always check slot count before adding storage vars

Networks: `hoodi` (active testnet, chainId 560048), `sepolia`, `localhost`, `mainnet` (not yet deployed)
