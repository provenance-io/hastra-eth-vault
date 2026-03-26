---
name: generate-qa-table
description: Generate a QA validation table for Solidity/EVM contract changes
---

# Generate QA table

Build a QA validation table for the current changes. Focus only on scenarios
touched by the current diff.

Return a Markdown table with these columns:

| Area | Scenario | Steps | Expected result | Risk level | Notes |
|------|----------|-------|-----------------|------------|-------|

Prioritize scenarios around:

- ERC-4626 deposit / withdraw / redeem / mint flows
- two-step redemption (`requestRedeem` → `completeRedeem`) on YieldVault
- NAV oracle integration (set / not set / stale / out-of-bounds)
- role-based access control (correct role, missing role, role revocation)
- UUPS upgrade (new implementation deployed, proxy storage intact post-upgrade)
- freeze / thaw / whitelist logic
- Merkle reward epoch creation and claiming (valid proof, replay attempt)
- ReentrancyGuard (re-entrant deposit/withdraw attempt)
- pause / unpause state
- storage layout (verify `__gap` slots not corrupted post-upgrade via `storageLayout`)

Guidelines:

- test steps should reference actual Hardhat commands or test file names where possible
- for proxy upgrades, include a step to verify storage with `hardhat-storage-layout`
- mark risk level as Low / Medium / High:
  - High: proxy upgrades, role transfers, token minting, irreversible state
  - Medium: new access-controlled functions, NAV oracle changes, ERC-4626 math
  - Low: view functions, event changes, comment/docs only
- note scenarios that require a specific network state (e.g. hoodi deployed contracts, live NAV feed)
- flag scenarios that are hard to reproduce locally (e.g. Chainlink Data Streams feed verification)
