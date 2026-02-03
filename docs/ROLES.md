# Access Control Roles

The Hastra Vault Protocol uses OpenZeppelin's `AccessControl` for role-based permissions. Each role controls specific operations across both vaults.

## Role Overview

```
┌─────────────────────┬──────────────┬──────────────┬────────────────────────────────┐
│ Role                │ YieldVault   │ StakingVault │ Permissions                    │
├─────────────────────┼──────────────┼──────────────┼────────────────────────────────┤
│ DEFAULT_ADMIN_ROLE  │ ✅           │ ✅           │ Grant/revoke all roles         │
│ FREEZE_ADMIN_ROLE   │ ✅           │ ✅           │ Freeze/thaw accounts           │
│ REWARDS_ADMIN_ROLE  │ ✅           │ ✅           │ Create epochs, mint rewards    │
│ PAUSER_ROLE         │ ✅           │ ✅           │ Pause/unpause contract         │
│ UPGRADER_ROLE       │ ✅           │ ✅           │ Upgrade implementation         │
│ WHITELIST_ADMIN     │ ✅           │ ❌           │ Manage USDC withdrawal whitelist│
│ WITHDRAWAL_ADMIN    │ ✅           │ ❌           │ Withdraw USDC to whitelisted   │
└─────────────────────┴──────────────┴──────────────┴────────────────────────────────┘
```

## Detailed Role Descriptions

### 1. DEFAULT_ADMIN_ROLE

**Purpose**: Master administrator with full control over all roles.

**Permissions**:
- Grant any role to any address
- Revoke any role from any address
- Update critical contract parameters
- Manage role hierarchy

**YieldVault Functions**:
```solidity
setRedeemVault(address newVault)  // Change redeem vault address
grantRole(bytes32 role, address account)
revokeRole(bytes32 role, address account)
```

**StakingVault Functions**:
```solidity
setYieldVault(address newVault)  // Change yield vault address
grantRole(bytes32 role, address account)
revokeRole(bytes32 role, address account)
```

**Security Notes**:
- ⚠️ Most powerful role - protect with multi-sig
- Can grant itself other roles
- Cannot be revoked if it's the only admin
- Consider using Gnosis Safe or similar

**Example**:
```javascript
// Grant REWARDS_ADMIN_ROLE to address
const REWARDS_ADMIN_ROLE = await vault.REWARDS_ADMIN_ROLE();
await vault.grantRole(REWARDS_ADMIN_ROLE, rewardsAdminAddress);
```

---

### 2. FREEZE_ADMIN_ROLE

**Purpose**: Compliance officer role for account restrictions.

**Permissions**:
- Freeze user accounts (block all transfers)
- Thaw frozen accounts (restore access)
- Emergency compliance actions

**YieldVault Functions**:
```solidity
freezeAccount(address account)  // Restrict all transfers
thawAccount(address account)    // Restore access
```

**StakingVault Functions**:
```solidity
freezeAccount(address account)
thawAccount(address account)
```

**Use Cases**:
- Regulatory compliance (AML/KYC violations)
- Court orders or legal holds
- Suspicious activity flagging
- Account recovery during disputes

**Effects of Freezing**:
```
Frozen Account CANNOT:
- Transfer tokens to others
- Receive tokens from others
- Deposit new assets
- Request redemptions

Frozen Account CAN:
- View balances (read-only)
- Be unfrozen by FREEZE_ADMIN
```

**Example**:
```javascript
// Freeze suspicious account
await vault.connect(freezeAdmin).freezeAccount(suspiciousAddress);

// Later, after investigation
await vault.connect(freezeAdmin).thawAccount(suspiciousAddress);
```

---

### 3. REWARDS_ADMIN_ROLE

**Purpose**: Manages reward distribution across both vaults.

**Permissions**:
- Create merkle-based reward epochs (YieldVault)
- Mint rewards to staking vault (StakingVault)
- Distribute yield to users
- Complete user redemptions (YieldVault)

**YieldVault Functions**:
```solidity
createRewardsEpoch(uint256 epochIndex, bytes32 merkleRoot, uint256 totalRewards)
completeRedeem(address user)  // Admin completes user's redemption request
```

**StakingVault Functions**:
```solidity
distributeRewards(uint256 amount)  // Mints wYLDS to vault, increasing share value
```

**Workflow**:

**YieldVault Merkle Rewards**:
```
1. Off-chain: Calculate user rewards
2. Off-chain: Build merkle tree
3. On-chain: createRewardsEpoch(index, root, total)
4. Users: Claim with merkle proof
```

**StakingVault Direct Rewards**:
```
1. Calculate reward amount
2. Call distributeRewards(amount)
3. Share value increases automatically
4. Users redeem for more wYLDS
```

**Example**:
```javascript
// YieldVault: Create epoch
const merkleRoot = "0x1234...";
const totalRewards = ethers.parseUnits("10000", 6);
await yieldVault.connect(rewardsAdmin).createRewardsEpoch(0, merkleRoot, totalRewards);

// StakingVault: Distribute rewards
const rewardAmount = ethers.parseUnits("5000", 6);
await stakingVault.connect(rewardsAdmin).distributeRewards(rewardAmount);
```

---

### 4. PAUSER_ROLE

**Purpose**: Emergency stop mechanism for security incidents.

**Permissions**:
- Pause contract (halt all operations)
- Unpause contract (restore operations)

**Functions (Both Vaults)**:
```solidity
pause()    // Emergency stop
unpause()  // Resume operations
```

**When Paused - ALL of These Stop**:
```
❌ deposit()
❌ mint()
❌ withdraw()
❌ redeem()
❌ requestRedeem()
❌ depositWithPermit()
❌ claimRewards()
❌ distributeRewards()
```

**What Still Works**:
```
✅ View functions (balanceOf, totalSupply, etc.)
✅ Admin functions (freeze, thaw, pause, unpause)
✅ Role management
```

**Use Cases**:
- Security vulnerability discovered
- Oracle manipulation detected
- Smart contract exploit in progress
- Regulatory compliance pause

**Example**:
```javascript
// Emergency: Pause everything
await vault.connect(pauser).pause();

// After fix: Resume
await vault.connect(pauser).unpause();
```

---

### 5. UPGRADER_ROLE

**Purpose**: Authorize contract upgrades via UUPS pattern.

**Permissions**:
- Upgrade to new implementation
- Critical security responsibility

**Functions (Both Vaults)**:
```solidity
upgradeTo(address newImplementation)
upgradeToAndCall(address newImplementation, bytes data)
```

**Upgrade Process**:
```
1. Deploy new implementation (V2)
2. Verify implementation is correct
3. Call upgradeProxy() with UPGRADER_ROLE
4. New implementation active, state preserved
```

**Security Considerations**:
- ⚠️ Can break contract if wrong implementation
- Should require multi-sig approval
- Test on testnet first
- Verify storage layout compatibility

**Example**:
```javascript
// Deploy V2
const YieldVaultV2 = await ethers.getContractFactory("YieldVaultV2");
const upgraded = await upgrades.upgradeProxy(proxyAddress, YieldVaultV2);

// Only works if caller has UPGRADER_ROLE
```

---

### 6. WHITELIST_ADMIN_ROLE (YieldVault Only)

**Purpose**: Manage addresses allowed to receive USDC withdrawals.

**Permissions**:
- Add addresses to whitelist
- Remove addresses from whitelist
- View whitelisted addresses

**Functions**:
```solidity
addToWhitelist(address account)
removeFromWhitelist(address account)
getWhitelistedAddresses() returns (address[])
```

**Use Cases**:
- Regulatory compliance (only approved addresses)
- Treasury management
- Partner organization wallets
- Exchange hot wallets

**Restrictions**:
- Cannot add address(0)
- Cannot remove last whitelisted address (safety check)
- Cannot add duplicates

**Example**:
```javascript
// Add treasury address
await yieldVault.connect(whitelistAdmin).addToWhitelist(treasuryAddress);

// Later remove if needed
await yieldVault.connect(whitelistAdmin).removeFromWhitelist(oldAddress);
```

---

### 7. WITHDRAWAL_ADMIN_ROLE (YieldVault Only)

**Purpose**: Execute USDC withdrawals to whitelisted addresses.

**Permissions**:
- Withdraw USDC from vault to whitelisted addresses only

**Functions**:
```solidity
withdrawUSDC(address to, uint256 amount)
```

**Workflow**:
```
1. User requests redemption → requestRedeem()
2. Off-chain verification occurs
3. WITHDRAWAL_ADMIN withdraws USDC to whitelisted address
4. REWARDS_ADMIN completes redemption → completeRedeem(user)
5. User's wYLDS burned, redemption cleared
```

**Security**:
- Can ONLY withdraw to whitelisted addresses
- Reverts if recipient not whitelisted
- Reverts if vault has insufficient balance
- Cannot withdraw to address(0)

**Example**:
```javascript
// Withdraw USDC to approved treasury
const amount = ethers.parseUnits("10000", 6);
await yieldVault.connect(withdrawalAdmin).withdrawUSDC(treasuryAddress, amount);
```

---

## Role Assignment Best Practices

### Multi-Sig Recommendations

```
┌─────────────────────┬─────────────────┬──────────────────────────────┐
│ Role                │ Recommended     │ Rationale                    │
├─────────────────────┼─────────────────┼──────────────────────────────┤
│ DEFAULT_ADMIN_ROLE  │ 3-of-5 Multi-Sig│ Highest privilege            │
│ UPGRADER_ROLE       │ 3-of-5 Multi-Sig│ Can break contract           │
│ FREEZE_ADMIN_ROLE   │ 2-of-3 Multi-Sig│ Compliance officer + backup  │
│ REWARDS_ADMIN_ROLE  │ 2-of-3 Multi-Sig│ Controls rewards             │
│ PAUSER_ROLE         │ 1-of-3 Multi-Sig│ Emergency response speed     │
│ WHITELIST_ADMIN     │ 2-of-3 Multi-Sig│ Regulatory compliance        │
│ WITHDRAWAL_ADMIN    │ 2-of-3 Multi-Sig│ Treasury operations          │
└─────────────────────┴─────────────────┴──────────────────────────────┘
```

### Separation of Duties

**DO**:
- ✅ Use different addresses for different roles
- ✅ Use multi-sig for admin roles
- ✅ Test on testnet before mainnet
- ✅ Document who has which roles
- ✅ Regular role audits

**DON'T**:
- ❌ Give one address all roles (single point of failure)
- ❌ Use EOA for critical roles (use multi-sig)
- ❌ Share private keys
- ❌ Grant roles without documentation
- ❌ Leave unused roles active

### Emergency Procedures

**If Admin Key Compromised**:
```
1. Use remaining admin to revoke compromised role
2. Grant role to new secure address
3. Investigate scope of compromise
4. Consider pausing contract temporarily
```

**If Pauser Key Compromised**:
```
1. Use DEFAULT_ADMIN to revoke PAUSER_ROLE
2. Grant to new address
3. If contract was paused maliciously, unpause
```

## Code Examples

### Check Role Membership

```javascript
const vault = await ethers.getContractAt("YieldVault", proxyAddress);
const FREEZE_ADMIN_ROLE = await vault.FREEZE_ADMIN_ROLE();

const hasRole = await vault.hasRole(FREEZE_ADMIN_ROLE, userAddress);
console.log("Has freeze admin role:", hasRole);
```

### Grant Multiple Roles

```javascript
const roles = [
  await vault.FREEZE_ADMIN_ROLE(),
  await vault.REWARDS_ADMIN_ROLE(),
  await vault.PAUSER_ROLE()
];

for (const role of roles) {
  await vault.grantRole(role, multiSigAddress);
}
```

### Role Verification Script

```javascript
async function auditRoles(vaultAddress) {
  const vault = await ethers.getContractAt("YieldVault", vaultAddress);
  
  const roles = {
    DEFAULT_ADMIN_ROLE: ethers.ZeroHash,
    FREEZE_ADMIN_ROLE: await vault.FREEZE_ADMIN_ROLE(),
    REWARDS_ADMIN_ROLE: await vault.REWARDS_ADMIN_ROLE(),
    PAUSER_ROLE: await vault.PAUSER_ROLE(),
    UPGRADER_ROLE: await vault.UPGRADER_ROLE(),
    WHITELIST_ADMIN_ROLE: await vault.WHITELIST_ADMIN_ROLE(),
    WITHDRAWAL_ADMIN_ROLE: await vault.WITHDRAWAL_ADMIN_ROLE()
  };

  for (const [name, role] of Object.entries(roles)) {
    console.log(`\n${name}:`);
    // Get role members (requires enumerating events)
  }
}
```

## See Also

- [OpenZeppelin AccessControl](https://docs.openzeppelin.com/contracts/5.x/access-control)
- [COMPLIANCE.md](./COMPLIANCE.md) - Freeze/thaw workflows
- [UPGRADES.md](./UPGRADES.md) - UPGRADER_ROLE usage
