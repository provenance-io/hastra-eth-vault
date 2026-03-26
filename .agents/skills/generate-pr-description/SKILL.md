---
name: generate-pr-description
description: Generate a reviewer-friendly PR title and description for EVM contract changes
---

# Generate PR description

Use the current diff and repo context to write a reviewer-friendly pull request
title and description.

Return the following in Markdown format:

- `Title:` a PR title following conventional commit style (e.g. `feat(staking-vault): add AutoStakingVault NAV fallback`)
- `Problem:` a concise explanation (2-4 sentences) of the issue or motivation
- `Solution:` a concise summary (2-4 sentences) of what changed and how it addresses the problem
- `How to review:` a short ordered list of the best places for a human reviewer to start
- `Storage & upgrade impact:` any changes to storage layout (`__gap` adjustments, new vars), UUPS upgrade requirement, or initializer version bump
- `Deploy notes:` what's required to ship — compile, run upgrade script, grant roles, verify on Etherscan, update deployment JSON
- `Risk areas:` highest-risk behavior changes to double-check

Guidelines:

- always include `Storage & upgrade impact` and `Deploy notes` — critical for proxy-based contracts
- flag explicitly if this is a **breaking storage change** (variables added/reordered without `__gap` adjustment)
- note which network(s) this has been tested on (localhost / hoodi / sepolia)
- if new roles are introduced or granted, list them and who receives them
- if the NAV oracle interface changed, flag that `HastraNavEngine` and `StakingVault` must stay in sync
- keep the output concise and easy to paste into a GitHub PR body
