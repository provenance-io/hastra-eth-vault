---
name: implement-next-step
description: Implement the next step in the current plan, one task at a time
---

# Implement next step

Implement the next pending step from the current plan, one task at a time.

Before implementing:

- confirm which step is next (ask if unclear)
- re-read the relevant source files before touching them
- check `__gap` slot count in the target contract before adding storage

After implementing:

- show a summary of every file changed and why
- call out any follow-up actions needed (compile, test, upgrade script, verify)
- stop and wait for review before proceeding to the next step

Guidelines for Solidity changes:

- for upgradeable contracts: never add storage above existing vars, always adjust `__gap`
- new functions should emit events following existing naming patterns (e.g. `RewardsEpochCreated`, `TokensFrozen`)
- access control: use `onlyRole(ROLE)` modifier, not `require(hasRole(...))` directly
- use `ReentrancyGuardUpgradeable` guard on any function that moves tokens
- if adding a new role, define its `bytes32` constant at the top of the contract and grant it in the deploy/upgrade script
- follow existing NatSpec comment style on all public/external functions
- for ERC-4626 overrides, test `deposit`, `withdraw`, `redeem`, `mint` paths with both zero and non-zero totalSupply

After a Solidity change, remind to run:

```bash
npx hardhat compile
yarn test
yarn test:fuzz
```

And if a UUPS upgrade is needed:
```bash
npx hardhat run scripts/admin/upgrade_<contract>.ts --network hoodi
npx hardhat verify <new_impl_address> --network hoodi
```
