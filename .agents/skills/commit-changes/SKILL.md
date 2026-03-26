---
name: commit-changes
description: Draft a conventional commit message for current Solidity/Hardhat changes
---

# Commit changes

Review the current git changes and prepare a conventional commit message that matches
the repository's existing style.

Default behavior:

- inspect staged and unstaged changes
- summarize what changed and why
- draft a conventional commit message

Only create the actual git commit if the user explicitly asks you to commit.

Return:

- `Proposed commit:` the conventional commit message
- `Rationale:` a short explanation of why the message fits the change
- `Concerns:` any issues if the diff looks too broad, mixed in scope, or unclear in intent

Guidelines:

- use scopes that reflect the contract or area changed: `yield-vault`, `staking-vault`, `auto-staking`, `nav-engine`, `scripts`, `test`
- examples: `feat(yield-vault): add multi-address whitelist batch approval`
- examples: `fix(staking-vault): revert on zero-share deposit with NAV oracle set`
- examples: `chore(scripts): add hoodi deploy verification step`
- if `__gap` was adjusted, always mention it in the commit body — it's a storage layout change
- if a UUPS upgrade is required to ship the change, note it in the body
- if new roles were added or granted, call that out
- flag if the diff spans multiple contracts — suggest splitting if concerns are independent
