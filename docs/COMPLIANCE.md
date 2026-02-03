# Compliance and Regulatory Features

The Hastra Vault Protocol includes institutional-grade compliance features for regulatory requirements, including account freezing, two-step redemptions, and whitelist controls.

## Overview

```
Compliance Layers:
├─ Account Freeze/Thaw (Both Vaults)
├─ Two-Step Redemption (YieldVault)
├─ Whitelist Controls (YieldVault)
└─ Role-Based Access (Both Vaults)
```

## Freeze/Thaw Functionality

### Purpose

Account freezing allows compliance officers to restrict accounts that violate regulations or are subject to legal holds.

### How It Works

```
NORMAL ACCOUNT:
  ✅ Transfer tokens
  ✅ Deposit assets
  ✅ Request redemptions
  ✅ Claim rewards

FROZEN ACCOUNT:
  ❌ Transfer tokens (blocked)
  ❌ Receive tokens (blocked)
  ❌ Deposit assets (blocked via transfer check)
  ❌ Request redemptions (blocked via transfer check)
  ✅ View balances (read-only)
  ✅ Can be burned by admin (for redemption completion)
```

### Freeze Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Compliance Officer Detects Issue                    │
│   - AML/KYC violation                                        │
│   - Court order received                                     │
│   - Suspicious activity flagged                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 2: FREEZE_ADMIN Freezes Account                        │
│   vault.freezeAccount(suspiciousAddress)                    │
│   → Event: AccountFrozen(address)                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Account Restricted                                  │
│   ❌ All transfers blocked                                  │
│   ❌ Cannot deposit                                          │
│   ❌ Cannot withdraw                                         │
│   ✅ Balances visible                                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 4: Investigation/Resolution                            │
│   - Legal review                                             │
│   - User verification                                        │
│   - Document collection                                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 5: FREEZE_ADMIN Thaws Account (if cleared)            │
│   vault.thawAccount(address)                                │
│   → Event: AccountThawed(address)                           │
│   ✅ Full access restored                                   │
└─────────────────────────────────────────────────────────────┘
```

### Code Examples

**Freeze Account**:
```javascript
const vault = await ethers.getContractAt("YieldVault", proxyAddress);

// Freeze suspicious account
await vault.connect(freezeAdmin).freezeAccount(userAddress);

// Check if frozen
const isFrozen = await vault.frozen(userAddress);
console.log("Account frozen:", isFrozen);  // true
```

**Thaw Account**:
```javascript
// After investigation clears user
await vault.connect(freezeAdmin).thawAccount(userAddress);

// Verify access restored
const isFrozen = await vault.frozen(userAddress);
console.log("Account frozen:", isFrozen);  // false
```

**Check Before Transfer**:
```javascript
// Transfers automatically check freeze status
try {
  await vault.connect(user).transfer(recipient, amount);
} catch (error) {
  if (error.message.includes("AccountIsFrozen")) {
    console.log("❌ Account is frozen - contact support");
  }
}
```

### Implementation Details

The freeze check happens in `_update()` hook (called on all transfers):

```solidity
function _update(address from, address to, uint256 amount) internal override {
    // Check sender not frozen
    if (from != address(0) && frozen[from]) revert AccountIsFrozen();
    
    // Check recipient not frozen
    if (to != address(0) && frozen[to]) revert AccountIsFrozen();
    
    // Proceed with transfer
    super._update(from, to, amount);
}
```

**Why Burns Still Work**:
- Burning (to address(0)) bypasses the frozen check
- Allows admin to complete redemptions for frozen accounts
- Prevents locked funds in compliance scenarios

---

## Two-Step Redemption (YieldVault)

### Purpose

Two-step redemption allows off-chain verification and liquidity management before releasing USDC.

### Why It's Needed

Standard ERC-4626 instant redemption doesn't work for regulated stablecoins because:
- Need KYC/AML verification before release
- May need legal approval
- Liquidity not always on-chain
- Compliance checks required

### Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: User Requests Redemption                            │
│   yieldVault.requestRedeem(shares)                          │
│   → Shares locked in vault                                  │
│   → Event: RedemptionRequested(user, shares, assets, time)  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Off-Chain Verification                              │
│   - KYC/AML check                                            │
│   - Compliance screening                                     │
│   - Legal review (if needed)                                 │
│   - Liquidity preparation                                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Admin Moves USDC to Redeem Vault                   │
│   (Off-chain or via withdrawUSDC to whitelisted address)    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 4: REWARDS_ADMIN Completes Redemption                 │
│   yieldVault.completeRedeem(userAddress)                    │
│   → wYLDS burned from vault                                  │
│   → USDC sent to user                                        │
│   → Pending redemption cleared                               │
│   → Event: RedemptionCompleted(user, shares, assets, time)  │
└─────────────────────────────────────────────────────────────┘
```

### Alternative: User Cancels

```
User Request → [Waiting] → User Cancels
                            └→ yieldVault.cancelRedeem()
                               → Shares returned to user
                               → Event: RedemptionCancelled(user, shares)
```

### Code Examples

**Request Redemption**:
```javascript
const yieldVault = await ethers.getContractAt("YieldVault", proxyAddress);
const shares = ethers.parseUnits("1000", 6);

// User requests redemption
await yieldVault.connect(user).requestRedeem(shares);

// Check pending redemption
const pending = await yieldVault.pendingRedemptions(user.address);
console.log("Pending shares:", pending.shares);
console.log("Pending assets:", pending.assets);
console.log("Requested at:", new Date(Number(pending.timestamp) * 1000));
```

**Complete Redemption (Admin)**:
```javascript
// 1. Verify USDC in redeem vault
const redeemVault = await yieldVault.redeemVault();
const usdc = await ethers.getContractAt("IERC20", usdcAddress);
const balance = await usdc.balanceOf(redeemVault);
console.log("Redeem vault USDC:", ethers.formatUnits(balance, 6));

// 2. Complete redemption
await yieldVault.connect(rewardsAdmin).completeRedeem(user.address);

// 3. Verify user received USDC
const userBalance = await usdc.balanceOf(user.address);
console.log("User USDC:", ethers.formatUnits(userBalance, 6));
```

**Cancel Redemption (User)**:
```javascript
// User changes mind
await yieldVault.connect(user).cancelRedeem();

// Shares returned
const balance = await yieldVault.balanceOf(user.address);
console.log("wYLDS balance:", ethers.formatUnits(balance, 6));
```

### Security Checks

```solidity
// Cannot request if already pending
if (pendingRedemptions[msg.sender].shares > 0) {
    revert RedemptionAlreadyPending();
}

// Cannot complete if no pending
if (pendingRedemptions[user].shares == 0) {
    revert NoRedemptionPending();
}

// Cannot complete if insufficient USDC
uint256 vaultBalance = IERC20(asset()).balanceOf(redeemVault);
if (vaultBalance < redemption.assets) {
    revert InsufficientVaultBalance();
}
```

---

## Whitelist Controls (YieldVault)

### Purpose

Restrict USDC withdrawals to pre-approved addresses for regulatory compliance.

### How It Works

```
Whitelist:
├─ Managed by WHITELIST_ADMIN_ROLE
├─ Only whitelisted addresses can receive USDC withdrawals
├─ Prevents unauthorized outflows
└─ Compliance with regulatory requirements
```

### Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Add Address to Whitelist                            │
│   yieldVault.addToWhitelist(treasuryAddress)                │
│   → Event: AddressWhitelisted(address)                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 2: WITHDRAWAL_ADMIN Can Withdraw to Whitelisted       │
│   yieldVault.withdrawUSDC(treasuryAddress, amount)         │
│   ✅ Allowed (address is whitelisted)                       │
│   → Event: USDCWithdrawn(to, amount, by)                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Attempt to Non-Whitelisted Address                  │
│   yieldVault.withdrawUSDC(randomAddress, amount)           │
│   ❌ Reverts: "Address not whitelisted"                     │
└─────────────────────────────────────────────────────────────┘
```

### Code Examples

**Manage Whitelist**:
```javascript
const yieldVault = await ethers.getContractAt("YieldVault", proxyAddress);

// Add to whitelist
await yieldVault.connect(whitelistAdmin).addToWhitelist(treasuryAddress);

// Check if whitelisted
const isWhitelisted = await yieldVault.whitelistedAddresses(treasuryAddress);
console.log("Is whitelisted:", isWhitelisted);

// Get all whitelisted addresses
const whitelisted = await yieldVault.getWhitelistedAddresses();
console.log("Whitelisted addresses:", whitelisted);

// Remove from whitelist (if needed)
await yieldVault.connect(whitelistAdmin).removeFromWhitelist(oldAddress);
```

**Withdraw USDC**:
```javascript
// Only works to whitelisted addresses
const amount = ethers.parseUnits("10000", 6);

try {
  await yieldVault.connect(withdrawalAdmin).withdrawUSDC(treasuryAddress, amount);
  console.log("✅ Withdrawal successful");
} catch (error) {
  if (error.message.includes("not whitelisted")) {
    console.log("❌ Address not whitelisted");
  }
}
```

### Restrictions

```solidity
// Cannot add address(0)
if (account == address(0)) revert InvalidAddress();

// Cannot add duplicates
if (whitelistedAddresses[account]) revert AddressAlreadyWhitelisted();

// Cannot remove last whitelisted address
if (_whitelistArray.length == 1) revert CannotRemoveLastWhitelisted();
```

---

## Compliance Monitoring

### Events to Monitor

**Freeze/Thaw**:
```javascript
vault.on("AccountFrozen", (account, event) => {
  console.log("⚠️ Account frozen:", account);
  // Alert compliance team
  // Update internal records
});

vault.on("AccountThawed", (account, event) => {
  console.log("✅ Account thawed:", account);
  // Update internal records
  // Notify user
});
```

**Redemptions**:
```javascript
vault.on("RedemptionRequested", (user, shares, assets, timestamp, event) => {
  console.log("📝 Redemption requested by:", user);
  console.log("   Amount:", ethers.formatUnits(assets, 6), "USDC");
  // Trigger compliance check
  // Prepare liquidity
});

vault.on("RedemptionCompleted", (user, shares, assets, timestamp, event) => {
  console.log("✅ Redemption completed for:", user);
  // Update records
  // Generate receipt
});
```

**Whitelist Changes**:
```javascript
vault.on("AddressWhitelisted", (account, event) => {
  console.log("✅ Address whitelisted:", account);
  // Update approved list
});

vault.on("AddressRemovedFromWhitelist", (account, event) => {
  console.log("⚠️ Address removed from whitelist:", account);
  // Update records
});
```

### Compliance Dashboard

Example monitoring script:

```javascript
async function complianceReport() {
  const vault = await ethers.getContractAt("YieldVault", proxyAddress);
  
  // Get pending redemptions
  const filter = vault.filters.RedemptionRequested();
  const events = await vault.queryFilter(filter);
  
  console.log("\n📊 Pending Redemptions:");
  for (const event of events) {
    const pending = await vault.pendingRedemptions(event.args.user);
    if (pending.shares > 0) {
      console.log(`  ${event.args.user}: ${ethers.formatUnits(pending.assets, 6)} USDC`);
    }
  }
  
  // Get frozen accounts
  const freezeFilter = vault.filters.AccountFrozen();
  const freezeEvents = await vault.queryFilter(freezeFilter);
  
  console.log("\n🚫 Frozen Accounts:");
  for (const event of freezeEvents) {
    const isFrozen = await vault.frozen(event.args.account);
    if (isFrozen) {
      console.log(`  ${event.args.account}`);
    }
  }
  
  // Get whitelist
  const whitelisted = await vault.getWhitelistedAddresses();
  console.log("\n✅ Whitelisted Addresses:", whitelisted.length);
}
```

## Best Practices

### Freeze/Thaw
- ✅ Document reason for freeze
- ✅ Set internal review timeline
- ✅ Notify user (off-chain)
- ✅ Regular audit of frozen accounts
- ❌ Don't freeze without cause
- ❌ Don't leave accounts frozen indefinitely

### Two-Step Redemption
- ✅ Process requests promptly
- ✅ Communicate estimated timeline
- ✅ Maintain adequate USDC liquidity
- ✅ Log all completions
- ❌ Don't complete without verification
- ❌ Don't delay without reason

### Whitelist
- ✅ Regularly review whitelist
- ✅ Remove unused addresses
- ✅ Document approval process
- ✅ Audit whitelist changes
- ❌ Don't add without verification
- ❌ Don't allow too many addresses

## Regulatory Scenarios

### AML/KYC Violation Detected

```
1. FREEZE_ADMIN freezes account immediately
2. Compliance team investigates
3. Document findings
4. If cleared: thaw account
5. If violation confirmed: work with legal
```

### Court Order Received

```
1. FREEZE_ADMIN freezes account
2. Legal team reviews order
3. Comply with court requirements
4. Document all actions
5. Thaw when legally permitted
```

### Suspicious Activity

```
1. Flag account for review
2. FREEZE_ADMIN freezes if high risk
3. Investigate transactions
4. KYC re-verification if needed
5. Thaw or escalate based on findings
```

## See Also

- [ROLES.md](./ROLES.md) - FREEZE_ADMIN, REWARDS_ADMIN, WHITELIST_ADMIN
- [OpenZeppelin Pausable](https://docs.openzeppelin.com/contracts/5.x/api/utils#Pausable)
- [ERC-4626 Standard](https://eips.ethereum.org/EIPS/eip-4626)
