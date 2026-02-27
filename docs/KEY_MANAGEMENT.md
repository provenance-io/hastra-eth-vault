# Key Management & Role Distribution

This document describes how protocol keys should be distributed across role holders, with the admin controlled by a Safe multisig wallet. Intended for both Sepolia testnet setup and mainnet production.

---

## Role → Key Assignment

```
┌─────────────────────┬───────────────────────────┬─────────────────────────────────────────────┐
│ Role                │ Key Type (Production)      │ Key Type (Testnet)                          │
├─────────────────────┼───────────────────────────┼─────────────────────────────────────────────┤
│ DEFAULT_ADMIN_ROLE  │ Safe Multisig (3-of-5)    │ Safe Multisig on Sepolia                    │
│ UPGRADER_ROLE       │ Safe Multisig (3-of-5)    │ Same Safe (grant after deploy)              │
│ PAUSER_ROLE         │ EOA — ops on-call key     │ Deployer EOA (for speed)                    │
│ REWARDS_ADMIN_ROLE  │ EOA — automation/bot key  │ Deployer EOA                                │
│ FREEZE_ADMIN_ROLE   │ EOA — compliance key      │ Deployer EOA                                │
│ WHITELIST_ADMIN     │ EOA — treasury ops key    │ Deployer EOA                                │
│ WITHDRAWAL_ADMIN    │ EOA — treasury ops key    │ Deployer EOA                                │
└─────────────────────┴───────────────────────────┴─────────────────────────────────────────────┘
```

---

## Safe Wallet Setup (Sepolia)

### 1. Create the Safe

1. Go to [app.safe.global](https://app.safe.global) and connect to **Sepolia**
2. Create a new Safe with your desired signers and threshold (e.g. 2-of-3 for testnet, 3-of-5 for mainnet)
3. Record the Safe address — this becomes `DEFAULT_ADMIN_ROLE` and `UPGRADER_ROLE`

### 2. Deploy Contracts with Safe as Admin

Set the Safe address as `ADMIN_ADDRESS` in your `.env` before deploying:

```bash
ADMIN_ADDRESS=<your-safe-address>
npx hardhat run scripts/deploy.ts --network sepolia
```

The deploy script grants `DEFAULT_ADMIN_ROLE`, `PAUSER_ROLE`, and `UPGRADER_ROLE` to `ADMIN_ADDRESS` at deploy time.

### 3. Grant Remaining Roles via Safe

After deployment, use the Safe UI to send transactions that grant operational roles to their respective EOAs:

```solidity
// Grant REWARDS_ADMIN_ROLE to the bot/automation EOA
yieldVault.grantRole(REWARDS_ADMIN_ROLE, <rewards-eoa>)
stakingVault.grantRole(REWARDS_ADMIN_ROLE, <rewards-eoa>)

// Grant FREEZE_ADMIN_ROLE to compliance EOA
yieldVault.grantRole(FREEZE_ADMIN_ROLE, <compliance-eoa>)
stakingVault.grantRole(FREEZE_ADMIN_ROLE, <compliance-eoa>)

// Grant WHITELIST_ADMIN_ROLE and WITHDRAWAL_ADMIN_ROLE to treasury EOA
yieldVault.grantRole(WHITELIST_ADMIN_ROLE, <treasury-eoa>)
yieldVault.grantRole(WITHDRAWAL_ADMIN_ROLE, <treasury-eoa>)
```

---

## Role Security Requirements

### DEFAULT_ADMIN_ROLE + UPGRADER_ROLE → Safe Multisig

**Why Safe**: These roles can change any other role assignment and upgrade the contract implementation. A compromised admin key means total protocol control.

- Use Safe with **threshold ≥ 2** for testnet, **≥ 3** for mainnet
- Store signer keys on hardware wallets (Ledger/Trezor)
- Never use a hot wallet as a Safe signer in production
- Rotate signers if any signer key is suspected compromised
- All Safe transactions should include a description/reason visible in the UI

---

### PAUSER_ROLE → On-Call EOA

**Why EOA**: Pausing must be fast — a multisig adds latency that could matter during an active exploit.

- Store on a hardware wallet with the on-call engineer
- Key should be accessible within minutes, not hours
- Rotate this key when team membership changes
- Never leave pauser key on a shared machine or CI system
- Monitor for unauthorized pause/unpause events

---

### REWARDS_ADMIN_ROLE → Automation/Bot EOA

**Why EOA**: Called programmatically by the NAV bot or rewards distribution service.

- Store private key in a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
- Never commit to source control or `.env` files in version control
- Scope the key to only what it needs — no ETH balance beyond gas
- Rotate regularly (quarterly minimum)
- Alert on any unexpected calls to `distributeRewards` or `createRewardsEpoch`

---

### FREEZE_ADMIN_ROLE → Compliance EOA

**Why EOA**: Compliance actions (freeze/thaw) may need to happen quickly under legal obligation.

- Held by the compliance officer or legal team
- Store on a hardware wallet
- Document every freeze/thaw action with reason and date
- This key should never be used for any other purpose
- In production, consider a 2-of-2 with a legal counsel co-signer

---

### WHITELIST_ADMIN_ROLE + WITHDRAWAL_ADMIN_ROLE → Treasury EOA

**Why EOA**: Treasury operations are periodic but not automated — a single accountable signer is acceptable.

- Store on a hardware wallet used exclusively for treasury ops
- Whitelist only pre-approved addresses (cold storage, exchange wallets)
- Never whitelist an address without an off-chain approval record
- Withdrawal amounts should be reconciled against off-chain records before executing
- Consider separating these two roles in production (separate whitelist manager vs. executor)

---

## Handoff Checklist (Before Mainnet)

- [ ] Safe created with hardware-wallet signers
- [ ] `DEFAULT_ADMIN_ROLE` held only by Safe (deployer EOA removed)
- [ ] `UPGRADER_ROLE` held only by Safe (deployer EOA removed)
- [ ] Each operational role assigned to a dedicated key (not the deployer)
- [ ] Deployer EOA has NO remaining roles
- [ ] All role assignments verified on-chain via `hasRole()`
- [ ] Emergency contact list established for each role holder
- [ ] Pause/unpause tested with the correct key

### Remove Deployer from Admin (after role handoff)

```solidity
// Once Safe has DEFAULT_ADMIN_ROLE, use Safe to revoke deployer
yieldVault.revokeRole(DEFAULT_ADMIN_ROLE, <deployer-eoa>)
yieldVault.revokeRole(UPGRADER_ROLE, <deployer-eoa>)
yieldVault.revokeRole(PAUSER_ROLE, <deployer-eoa>)
stakingVault.revokeRole(DEFAULT_ADMIN_ROLE, <deployer-eoa>)
stakingVault.revokeRole(UPGRADER_ROLE, <deployer-eoa>)
stakingVault.revokeRole(PAUSER_ROLE, <deployer-eoa>)
```

---

## See Also

- [ROLES.md](./ROLES.md) — full permissions reference for each role
- [UPGRADES.md](./UPGRADES.md) — upgrade process using UPGRADER_ROLE
- [Safe documentation](https://docs.safe.global)
