# Error Codes Reference

Complete reference for all custom errors in the Hastra Ethereum Vault Protocol.

## Quick Decode

If a transaction fails, check the error name below for meaning and resolution.

```bash
# Check error in transaction on Hoodi Explorer
https://hoodi.etherscan.io/tx/<transaction_hash>

# Common patterns:
❌ "AccountIsFrozen" → Contact compliance officer
❌ "InvalidProof" → Verify merkle proof is correct
❌ "RedemptionAlreadyPending" → Cancel existing redemption first
```

---

## Error Categories

```
├─ Compliance Errors (Freeze/Thaw)
├─ Redemption Errors (YieldVault)
├─ Rewards Errors (YieldVault)
├─ Whitelist Errors (YieldVault)
├─ Validation Errors (Both Vaults)
└─ OpenZeppelin Standard Errors
```

---

## Compliance Errors

### AccountIsFrozen

**Contracts**: YieldVault, StakingVault  
**Severity**: 🔴 High - Account restricted

**Meaning**: 
The account is frozen by a compliance officer and cannot perform transfers or deposits.

**Occurs When**:
- Attempting to transfer tokens while frozen
- Attempting to receive tokens while frozen
- Attempting to deposit while frozen
- Attempting to request redemption while frozen

**Resolution**:
```
1. Contact compliance officer (FREEZE_ADMIN_ROLE)
2. Provide required documentation (KYC/AML)
3. Wait for account to be thawed
4. Retry transaction after thaw
```

**Code Example**:
```solidity
// Revert in _update() hook
if (from != address(0) && frozen[from]) revert AccountIsFrozen();
if (to != address(0) && frozen[to]) revert AccountIsFrozen();
```

**Related**:
- See [COMPLIANCE.md](./COMPLIANCE.md#freezethaw-functionality)
- Event: `AccountFrozen(address indexed account)`

---

### AccountNotFrozen

**Contracts**: YieldVault, StakingVault  
**Severity**: 🟡 Medium - Invalid operation

**Meaning**: 
Attempting to thaw an account that is not currently frozen.

**Occurs When**:
- FREEZE_ADMIN calls `thawAccount()` on unfrozen account

**Resolution**:
```
1. Check account status: vault.frozen(address)
2. Only thaw accounts that are currently frozen
```

**Code Example**:
```solidity
function thawAccount(address account) external onlyRole(FREEZE_ADMIN_ROLE) {
    if (!frozen[account]) revert AccountNotFrozen();
    frozen[account] = false;
    emit AccountThawed(account);
}
```

---

## Redemption Errors (YieldVault)

### RedemptionAlreadyPending

**Contract**: YieldVault  
**Severity**: 🟡 Medium - Operation blocked

**Meaning**: 
User already has a pending redemption request. Only one redemption can be pending at a time.

**Occurs When**:
- Calling `requestRedeem()` while a redemption is already pending

**Resolution**:
```
Option 1: Cancel existing redemption
  → vault.cancelRedeem()
  → Then submit new request

Option 2: Wait for admin to complete
  → Admin calls completeRedeem(user)
  → Then can request again
```

**Check Pending Status**:
```javascript
const pending = await vault.pendingRedemptions(userAddress);
console.log("Shares:", pending.shares);
console.log("Assets:", pending.assets);
console.log("Time:", new Date(pending.timestamp * 1000));

if (pending.shares > 0) {
  console.log("❌ Redemption already pending");
}
```

**Code Example**:
```solidity
function requestRedeem(uint256 shares) external {
    if (pendingRedemptions[msg.sender].shares > 0) {
        revert RedemptionAlreadyPending();
    }
    // Process request...
}
```

**Related**:
- See [COMPLIANCE.md](./COMPLIANCE.md#two-step-redemption-yieldvault)

---

### NoRedemptionPending

**Contract**: YieldVault  
**Severity**: 🟡 Medium - Operation invalid

**Meaning**: 
No redemption request exists for this user.

**Occurs When**:
- Admin calls `completeRedeem(user)` when user has no pending redemption
- User calls `cancelRedeem()` when they have no pending redemption

**Resolution**:
```
1. User must call requestRedeem() first
2. Verify pending status before completing/canceling
```

**Check Before Completing**:
```javascript
const pending = await vault.pendingRedemptions(userAddress);
if (pending.shares == 0) {
  console.log("❌ No redemption pending - cannot complete");
  return;
}

// Safe to complete
await vault.connect(rewardsAdmin).completeRedeem(userAddress);
```

**Code Example**:
```solidity
function completeRedeem(address user) external onlyRole(REWARDS_ADMIN_ROLE) {
    PendingRedemption memory redemption = pendingRedemptions[user];
    if (redemption.shares == 0) revert NoRedemptionPending();
    // Process completion...
}
```

---

### InsufficientVaultBalance

**Contract**: YieldVault  
**Severity**: 🔴 High - Liquidity issue

**Meaning**: 
The redeem vault doesn't have enough USDC to complete the redemption.

**Occurs When**:
- Admin calls `completeRedeem(user)` but redeemVault has insufficient USDC

**Resolution**:
```
1. WITHDRAWAL_ADMIN withdraws USDC to redeemVault
   → vault.withdrawUSDC(redeemVaultAddress, amount)

2. Or transfer USDC directly to redeemVault

3. Retry completeRedeem() after funding
```

**Check Balance**:
```javascript
const redeemVault = await vault.redeemVault();
const usdc = await ethers.getContractAt("IERC20", usdcAddress);
const balance = await usdc.balanceOf(redeemVault);

const pending = await vault.pendingRedemptions(userAddress);
console.log("Needed:", ethers.formatUnits(pending.assets, 6), "USDC");
console.log("Available:", ethers.formatUnits(balance, 6), "USDC");

if (balance < pending.assets) {
  console.log("❌ Insufficient balance - need to fund vault");
}
```

**Code Example**:
```solidity
function completeRedeem(address user) external {
    // ... checks ...
    uint256 vaultBalance = IERC20(asset()).balanceOf(redeemVault);
    if (vaultBalance < redemption.assets) {
        revert InsufficientVaultBalance();
    }
    // Process redemption...
}
```

---

## Rewards Errors (YieldVault)

### RewardsAlreadyClaimed

**Contract**: YieldVault  
**Severity**: 🟡 Medium - Duplicate claim blocked

**Meaning**: 
User has already claimed rewards for this epoch.

**Occurs When**:
- Calling `claimRewards()` for an epoch already claimed
- Attempting double-claim attack

**Resolution**:
```
1. Check claimed status: vault.hasClaimedRewards(user, epochIndex)
2. Each user can only claim once per epoch
3. Wait for next epoch to claim again
```

**Check Before Claiming**:
```javascript
const hasClaimed = await vault.hasClaimedRewards(userAddress, epochIndex);
if (hasClaimed) {
  console.log("❌ Already claimed epoch", epochIndex);
  return;
}

// Safe to claim
await vault.claimRewards(epochIndex, amount, proof);
```

**Code Example**:
```solidity
function claimRewards(uint256 epochIndex, uint256 amount, bytes32[] calldata proof) 
    external 
{
    bytes32 claimKey = keccak256(abi.encodePacked(msg.sender, epochIndex));
    if (claimedRewards[claimKey]) revert RewardsAlreadyClaimed();
    // Process claim...
    claimedRewards[claimKey] = true;
}
```

**Related**:
- See [ARCHITECTURE.md](./ARCHITECTURE.md#merkle-rewards-flow)

---

### InvalidProof

**Contract**: YieldVault  
**Severity**: 🔴 High - Security check failed

**Meaning**: 
The merkle proof provided doesn't match the merkle root for this epoch.

**Occurs When**:
- Providing incorrect merkle proof
- Using proof from wrong epoch
- Attempting to claim incorrect amount
- Proof generation error

**Resolution**:
```
1. Verify you're using correct epoch index
2. Regenerate merkle proof from off-chain system
3. Ensure proof matches merkle root
4. Verify claim amount matches tree data
```

**Debug Proof**:
```javascript
// Get epoch root
const epoch = await vault.rewardsEpochs(epochIndex);
console.log("Merkle Root:", epoch.merkleRoot);

// Verify proof locally (off-chain)
const leaf = ethers.keccak256(
  ethers.concat([
    ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256"],
        [userAddress, amount, epochIndex]
      )
    )
  ])
);

// Check proof
const isValid = MerkleTree.verify(proof, leaf, epoch.merkleRoot);
console.log("Proof valid:", isValid);
```

**Code Example**:
```solidity
function claimRewards(...) external {
    // ... checks ...
    bytes32 leaf = keccak256(
        bytes.concat(keccak256(abi.encode(msg.sender, amount, epochIndex)))
    );
    
    if (!MerkleProof.verify(proof, epoch.merkleRoot, leaf)) {
        revert InvalidProof();
    }
    // Process claim...
}
```

---

### InvalidEpoch

**Contract**: YieldVault  
**Severity**: 🟡 Medium - Invalid parameter

**Meaning**: 
Epoch index doesn't exist or is invalid.

**Occurs When**:
- Claiming rewards for non-existent epoch
- Using epoch index >= currentEpochIndex

**Resolution**:
```
1. Check current epoch: vault.currentEpochIndex()
2. Use valid epoch index (0 to currentEpochIndex - 1)
3. Wait for epoch to be created by REWARDS_ADMIN
```

**Check Valid Epochs**:
```javascript
const currentEpoch = await vault.currentEpochIndex();
console.log("Current epoch index:", currentEpoch);
console.log("Valid epochs: 0 to", currentEpoch - 1);

// Check specific epoch exists
const epoch = await vault.rewardsEpochs(epochIndex);
if (epoch.merkleRoot === ethers.ZeroHash) {
  console.log("❌ Epoch not created yet");
}
```

---

## Whitelist Errors (YieldVault)

### AddressNotWhitelisted

**Contract**: YieldVault  
**Severity**: 🔴 High - Operation blocked

**Meaning**: 
Attempting to withdraw USDC to an address not on the whitelist.

**Occurs When**:
- WITHDRAWAL_ADMIN calls `withdrawUSDC()` to non-whitelisted address

**Resolution**:
```
1. WHITELIST_ADMIN adds address to whitelist
   → vault.addToWhitelist(address)
   
2. Verify address is whitelisted
   → vault.whitelistedAddresses(address)
   
3. Retry withdrawal
```

**Check Whitelist**:
```javascript
const isWhitelisted = await vault.whitelistedAddresses(targetAddress);
console.log("Is whitelisted:", isWhitelisted);

if (!isWhitelisted) {
  console.log("❌ Must add to whitelist first");
  await vault.connect(whitelistAdmin).addToWhitelist(targetAddress);
}

// Now can withdraw
await vault.connect(withdrawalAdmin).withdrawUSDC(targetAddress, amount);
```

**Related**:
- See [COMPLIANCE.md](./COMPLIANCE.md#whitelist-controls-yieldvault)

---

### AddressAlreadyWhitelisted

**Contract**: YieldVault  
**Severity**: 🟢 Low - Duplicate operation

**Meaning**: 
Attempting to add an address that's already whitelisted.

**Occurs When**:
- WHITELIST_ADMIN calls `addToWhitelist()` for already whitelisted address

**Resolution**:
```
1. Check if already whitelisted before adding
2. No action needed if already whitelisted
```

---

### CannotRemoveLastWhitelistedAddress

**Contract**: YieldVault  
**Severity**: 🟡 Medium - Safety check

**Meaning**: 
Cannot remove the last address from whitelist (must maintain at least one).

**Occurs When**:
- WHITELIST_ADMIN tries to remove the only whitelisted address

**Resolution**:
```
1. Add another whitelisted address first
2. Then remove the old one
3. Always maintain at least one whitelisted address
```

**Check Whitelist Count**:
```javascript
const addresses = await vault.getWhitelistedAddresses();
console.log("Whitelisted addresses:", addresses.length);

if (addresses.length === 1) {
  console.log("❌ Cannot remove - add another address first");
}
```

---

## Validation Errors

### InvalidAmount

**Contracts**: YieldVault, StakingVault  
**Severity**: 🟡 Medium - Invalid parameter

**Meaning**: 
Amount must be greater than zero.

**Occurs When**:
- Calling functions with amount = 0
- `distributeRewards(0)`
- `mintRewards(address, 0)`
- `withdrawUSDC(address, 0)`

**Resolution**:
```
1. Provide amount > 0
2. Check amount before calling function
```

**Code Example**:
```solidity
function distributeRewards(uint256 amount) external {
    if (amount == 0) revert InvalidAmount();
    // Process...
}
```

---

### InvalidAddress

**Contracts**: YieldVault, StakingVault  
**Severity**: 🔴 High - Invalid parameter

**Meaning**: 
Address parameter cannot be zero address (0x0000...0000).

**Occurs When**:
- Passing address(0) to functions
- `setRedeemVault(address(0))`
- `setYieldVault(address(0))`
- `addToWhitelist(address(0))`
- `withdrawUSDC(address(0), amount)`

**Resolution**:
```
1. Provide valid non-zero address
2. Verify address before calling function
```

**Check Address**:
```javascript
if (address === ethers.ZeroAddress) {
  console.log("❌ Invalid address - cannot be zero");
  return;
}
```

---

## OpenZeppelin Standard Errors

These are inherited from OpenZeppelin contracts:

### EnforcedPause

**Severity**: 🟡 Medium - Contract paused

**Meaning**: Contract is paused by PAUSER_ROLE.

**Occurs When**:
- Calling any function with `whenNotPaused` modifier while paused

**Functions Blocked**:
- `deposit()`, `mint()`, `withdraw()`, `redeem()`
- `requestRedeem()`, `depositWithPermit()`
- `claimRewards()`, `distributeRewards()`

**Resolution**:
```
1. Wait for PAUSER_ROLE to unpause
2. Check pause status: vault.paused()
3. Retry after unpause
```

**Related**:
- See [ROLES.md](./ROLES.md#4-pauser_role)

---

### AccessControlUnauthorizedAccount

**Severity**: 🔴 High - Permission denied

**Meaning**: Caller doesn't have required role for this function.

**Occurs When**:
- Non-admin calling admin functions
- Wrong role calling role-specific function

**Common Scenarios**:
```
Function                → Required Role
freezeAccount()         → FREEZE_ADMIN_ROLE
distributeRewards()     → REWARDS_ADMIN_ROLE
pause()                 → PAUSER_ROLE
upgradeTo()             → UPGRADER_ROLE
addToWhitelist()        → WHITELIST_ADMIN_ROLE
withdrawUSDC()          → WITHDRAWAL_ADMIN_ROLE
```

**Resolution**:
```
1. Check caller has required role
2. Request role from DEFAULT_ADMIN_ROLE
3. Use correct account with proper role
```

**Check Role**:
```javascript
const FREEZE_ADMIN_ROLE = await vault.FREEZE_ADMIN_ROLE();
const hasRole = await vault.hasRole(FREEZE_ADMIN_ROLE, userAddress);
console.log("Has FREEZE_ADMIN_ROLE:", hasRole);
```

**Related**:
- See [ROLES.md](./ROLES.md)

---

### ReentrancyGuardReentrantCall

**Severity**: 🔴 High - Security protection

**Meaning**: Reentrancy attack detected and blocked.

**Occurs When**:
- Malicious contract tries to re-enter vault during execution
- Function calls itself before completing

**Resolution**:
```
This is a security protection - attack blocked ✅
No action needed - the protection worked correctly
```

---

## Debugging Failed Transactions

### On Hoodi Explorer

1. Go to transaction: `https://hoodi.etherscan.io/tx/<hash>`
2. Look for "Error" or "Revert Reason"
3. Match error name to this document
4. Follow resolution steps

### Using Hardhat Console

```javascript
const tx = await vault.deposit(amount, receiver);
const receipt = await tx.wait();

// If failed
try {
  await vault.deposit(amount, receiver);
} catch (error) {
  console.log("Error name:", error.message);
  // Match to error codes above
}
```

### Common Error Patterns

```javascript
// Freeze errors
if (error.includes("AccountIsFrozen")) {
  console.log("❌ Account frozen - contact compliance");
}

// Redemption errors
if (error.includes("RedemptionAlreadyPending")) {
  console.log("❌ Cancel existing redemption first");
}

// Rewards errors
if (error.includes("InvalidProof")) {
  console.log("❌ Check merkle proof generation");
}

// Access control errors
if (error.includes("AccessControl")) {
  console.log("❌ Missing required role");
}
```

---

## Error Code Summary Table

| Error Name | Vault | Severity | Category | Resolution |
|-----------|-------|----------|----------|-----------|
| **AccountIsFrozen** | Both | 🔴 High | Compliance | Contact FREEZE_ADMIN |
| **AccountNotFrozen** | Both | 🟡 Medium | Compliance | Check freeze status |
| **RedemptionAlreadyPending** | Yield | 🟡 Medium | Redemption | Cancel or wait |
| **NoRedemptionPending** | Yield | 🟡 Medium | Redemption | Request first |
| **InsufficientVaultBalance** | Yield | 🔴 High | Redemption | Fund redeemVault |
| **RewardsAlreadyClaimed** | Yield | 🟡 Medium | Rewards | Wait for next epoch |
| **InvalidProof** | Yield | 🔴 High | Rewards | Fix merkle proof |
| **InvalidEpoch** | Yield | 🟡 Medium | Rewards | Use valid epoch |
| **AddressNotWhitelisted** | Yield | 🔴 High | Whitelist | Add to whitelist |
| **AddressAlreadyWhitelisted** | Yield | 🟢 Low | Whitelist | No action needed |
| **CannotRemoveLastWhitelisted** | Yield | 🟡 Medium | Whitelist | Add another first |
| **InvalidAmount** | Both | 🟡 Medium | Validation | Use amount > 0 |
| **InvalidAddress** | Both | 🔴 High | Validation | Non-zero address |
| **EnforcedPause** | Both | 🟡 Medium | OpenZeppelin | Wait for unpause |
| **AccessControlUnauthorized** | Both | 🔴 High | OpenZeppelin | Get required role |
| **ReentrancyGuardReentrant** | Both | 🔴 High | OpenZeppelin | Attack blocked ✅ |

---

## See Also

- [COMPLIANCE.md](./COMPLIANCE.md) - Compliance error scenarios
- [ROLES.md](./ROLES.md) - Access control role requirements
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System flows
- [Hoodi Explorer](https://hoodi.etherscan.io) - View transaction errors
