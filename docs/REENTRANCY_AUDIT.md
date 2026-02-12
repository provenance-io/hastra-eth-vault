# Reentrancy Security Audit - Hastra Vault Protocol

## ✅ OVERALL ASSESSMENT: SECURE AGAINST REENTRANCY

Both contracts use comprehensive reentrancy protection through:
1. ✅ OpenZeppelin's `ReentrancyGuardUpgradeable`
2. ✅ Checks-Effects-Interactions (CEI) pattern
3. ✅ SafeERC20 for external token calls

---

## YieldVault.sol Analysis

### Functions with External Calls

#### 1. `deposit()` - Line 160 ✅ SAFE
```solidity
function deposit(uint256 assets, address receiver)
    public override whenNotPaused nonReentrant  // ✅ Protected
```
- Uses `nonReentrant` modifier
- Calls `super.deposit()` which uses SafeERC20
- State changes before external calls (CEI pattern)

#### 2. `depositWithPermit()` - Line 170 ✅ SAFE
```solidity
function depositWithPermit(...) 
    external whenNotPaused nonReentrant  // ✅ Protected
{
    IERC20Permit(asset()).permit(...);  // External call
    return super.deposit(assets, receiver);
}
```
- Uses `nonReentrant` modifier
- `permit()` is non-reentrant by design (EIP-2612)
- Follows with standard deposit

#### 3. `mint()` - Line 169 ✅ SAFE
```solidity
function mint(uint256 shares, address receiver)
    public override whenNotPaused nonReentrant  // ✅ Protected
```
- Uses `nonReentrant` modifier
- Delegates to parent ERC4626

#### 4. `requestRedeem()` - Line 212 ✅ SAFE
```solidity
function requestRedeem(uint256 shares) 
    external whenNotPaused nonReentrant  // ✅ Protected
{
    if (shares == 0) revert InvalidAmount();
    if (pendingRedemptions[msg.sender].shares != 0) revert RedemptionAlreadyPending();
    
    uint256 assets = convertToAssets(shares);
    _transfer(msg.sender, address(this), shares);  // Internal call
    
    pendingRedemptions[msg.sender] = PendingRedemption({...});  // State update
}
```
- **Analysis:**
  - ✅ Uses `nonReentrant` modifier
  - ✅ Checks first (validation)
  - ✅ Effects (state update) after internal transfer
  - ✅ No external interactions
  - **SAFE**: No reentrancy risk

#### 5. `completeRedeem()` - Line 230 ⚠️ NEEDS REVIEW
```solidity
function completeRedeem(address user) 
    external onlyRole(REWARDS_ADMIN_ROLE) nonReentrant  // ✅ Protected
{
    PendingRedemption memory redemption = pendingRedemptions[user];
    if (redemption.shares == 0) revert NoRedemptionPending();
    
    uint256 vaultBalance = IERC20(asset()).balanceOf(redeemVault);  // External view
    if (vaultBalance < redemption.assets) revert InsufficientVaultBalance();
    
    delete pendingRedemptions[user];  // ✅ State cleared BEFORE transfer
    _burn(address(this), redemption.shares);  // ✅ Internal
    
    SafeERC20.safeTransferFrom(  // External call
        IERC20(asset()),
        redeemVault,
        user,
        redemption.assets
    );
}
```
- **Analysis:**
  - ✅ Uses `nonReentrant` modifier
  - ✅ Checks-Effects-Interactions pattern followed
  - ✅ State deleted BEFORE external call
  - ✅ Uses SafeERC20.safeTransferFrom
  - **SAFE**: Properly protected

#### 6. `cancelRedeem()` - Line 256 ✅ SAFE
```solidity
function cancelRedeem() external nonReentrant {
    PendingRedemption memory redemption = pendingRedemptions[msg.sender];
    if (redemption.shares == 0) revert NoRedemptionPending();
    
    delete pendingRedemptions[msg.sender];  // State cleared first
    _transfer(address(this), msg.sender, redemption.shares);  // Internal
}
```
- **Analysis:**
  - ✅ Uses `nonReentrant` modifier
  - ✅ State cleared before transfer
  - ✅ Only internal calls
  - **SAFE**

#### 7. `claimRewards()` - Line 286 ✅ SAFE
```solidity
function claimRewards(uint256 epochIndex, uint256 amount, bytes32[] calldata proof) 
    external whenNotPaused nonReentrant
{
    // Checks
    if (epochIndex >= currentEpochIndex) revert InvalidEpoch();
    bytes32 claimKey = keccak256(abi.encodePacked(msg.sender, epochIndex));
    if (claimedRewards[claimKey]) revert RewardsAlreadyClaimed();
    
    // More checks (merkle proof)
    if (!MerkleProof.verify(proof, epoch.merkleRoot, leaf)) revert InvalidProof();
    
    // Effects
    claimedRewards[claimKey] = true;  // ✅ State updated BEFORE mint
    
    // Interactions
    _mint(msg.sender, amount);  // Internal call (safe)
}
```
- **Analysis:**
  - ✅ Uses `nonReentrant` modifier
  - ✅ Perfect CEI pattern
  - ✅ State updated BEFORE any effects
  - ✅ Only internal _mint() call
  - **SAFE**

#### 8. `mintRewards()` - Line 298 ✅ SAFE
```solidity
function mintRewards(address to, uint256 amount)
    external onlyRole(REWARDS_ADMIN_ROLE) nonReentrant
{
    if (amount == 0) revert InvalidAmount();
    if (to == address(0)) revert InvalidAddress();
    _mint(to, amount);  // Internal only
}
```
- **SAFE**: Only internal calls

#### 9. `withdrawUSDC()` - Line 393 ✅ SAFE
```solidity
function withdrawUSDC(address to, uint256 amount)
    external onlyRole(WITHDRAWAL_ADMIN_ROLE) nonReentrant
{
    // Checks
    if (to == address(0)) revert InvalidAddress();
    if (amount == 0) revert InvalidAmount();
    if (!whitelistedAddresses[to]) revert AddressNotWhitelisted();
    
    uint256 balance = IERC20(asset()).balanceOf(address(this));
    if (balance < amount) revert InsufficientVaultBalance();
    
    // No effects (no state changes before transfer)
    
    // Interactions
    SafeERC20.safeTransfer(IERC20(asset()), to, amount);
}
```
- **Analysis:**
  - ✅ Uses `nonReentrant` modifier
  - ✅ Uses SafeERC20.safeTransfer
  - ⚠️ No state changes to prevent reentrancy from caller
  - ✅ BUT: Role-protected (only WITHDRAWAL_ADMIN)
  - ✅ AND: Nonreentrant guard prevents any reentrancy
  - **SAFE**: Protected by access control + nonReentrant

---

## StakingVault.sol Analysis

### Functions with External Calls

#### 1. `deposit()` - Line 133 ✅ SAFE
```solidity
function deposit(uint256 assets, address receiver)
    public override whenNotPaused nonReentrant
```
- Uses `nonReentrant` modifier
- Delegates to parent

#### 2. `depositWithPermit()` - Line 143 ✅ SAFE
Similar to YieldVault, protected by `nonReentrant`

#### 3. `mint()` - Line 155 ✅ SAFE
Protected by `nonReentrant`

#### 4. `redeem()` - Line 166 ✅ SAFE
Protected by `nonReentrant`

#### 5. `withdraw()` - Line 175 ✅ SAFE
Protected by `nonReentrant`

#### 6. `distributeRewards()` - Line 228 ✅ SAFE (CEI PATTERN)
```solidity
function distributeRewards(uint256 amount)
    external onlyRole(REWARDS_ADMIN_ROLE) nonReentrant
{
    if (amount == 0) revert InvalidAmount();
    
    // Effects: Track the new assets internally BEFORE external call
    _totalManagedAssets += amount;  // ✅ State updated FIRST
    
    // Interactions: Mint wYLDS rewards to this vault
    IYieldVault(yieldVault).mintRewards(address(this), amount);
    
    emit RewardsDistributed(amount, block.timestamp);
}
```
- **Analysis:**
  - ✅ Uses `nonReentrant` modifier
  - ✅ **PERFECT CEI PATTERN**: State updated BEFORE external call
  - ✅ Comment explicitly calls out CEI pattern
  - **SAFE**: Textbook reentrancy protection

#### 7. `_deposit()` Override - Line 201 ✅ SAFE
```solidity
function _deposit(address caller, address receiver, uint256 assets, uint256 shares) 
    internal virtual override 
{
    if (assets == 0) revert ZeroAmount();
    _totalManagedAssets += assets;  // ✅ State updated first
    super._deposit(caller, receiver, assets, shares);
}
```
- **Analysis:**
  - ✅ State updated BEFORE calling parent
  - **SAFE**: CEI pattern in internal function

#### 8. `_withdraw()` Override - Line 213 ✅ SAFE
```solidity
function _withdraw(...) internal virtual override {
    if (assets == 0) revert ZeroAmount();
    _totalManagedAssets -= assets;  // ✅ State updated first
    super._withdraw(caller, receiver, owner, assets, shares);
}
```
- **SAFE**: CEI pattern maintained

---

## Summary of Protections

### YieldVault
| Function | nonReentrant | CEI Pattern | SafeERC20 | Status |
|----------|--------------|-------------|-----------|--------|
| deposit() | ✅ | ✅ | ✅ | SAFE |
| depositWithPermit() | ✅ | ✅ | ✅ | SAFE |
| mint() | ✅ | ✅ | ✅ | SAFE |
| requestRedeem() | ✅ | ✅ | N/A | SAFE |
| completeRedeem() | ✅ | ✅ | ✅ | SAFE |
| cancelRedeem() | ✅ | ✅ | N/A | SAFE |
| claimRewards() | ✅ | ✅ | N/A | SAFE |
| mintRewards() | ✅ | N/A | N/A | SAFE |
| withdrawUSDC() | ✅ | ⚠️ | ✅ | SAFE |

### StakingVault
| Function | nonReentrant | CEI Pattern | SafeERC20 | Status |
|----------|--------------|-------------|-----------|--------|
| deposit() | ✅ | ✅ | ✅ | SAFE |
| depositWithPermit() | ✅ | ✅ | ✅ | SAFE |
| mint() | ✅ | ✅ | ✅ | SAFE |
| redeem() | ✅ | ✅ | ✅ | SAFE |
| withdraw() | ✅ | ✅ | ✅ | SAFE |
| distributeRewards() | ✅ | ✅ | ✅ | SAFE |
| _deposit() | N/A* | ✅ | ✅ | SAFE |
| _withdraw() | N/A* | ✅ | ✅ | SAFE |

*Internal functions inherit protection from public wrappers

---

## 🔒 Security Best Practices Observed

1. ✅ **All state-changing external functions protected by `nonReentrant`**
2. ✅ **Checks-Effects-Interactions pattern consistently followed**
3. ✅ **SafeERC20 used for all token transfers**
4. ✅ **Access control on sensitive functions**
5. ✅ **Pausable functionality for emergency stops**
6. ✅ **State updates before external calls**
7. ✅ **Internal accounting variables updated atomically**

---

## 🎯 Conclusion

**NO REENTRANCY VULNERABILITIES FOUND**

Both contracts demonstrate:
- Proper use of OpenZeppelin's ReentrancyGuard
- Consistent application of CEI pattern
- Safe external call handling
- Defense-in-depth approach (multiple protections)

The code quality is **production-grade** with respect to reentrancy protection.

---

## 📋 Minor Note

`withdrawUSDC()` in YieldVault doesn't update state before the transfer, but this is acceptable because:
1. It's protected by `nonReentrant`
2. It's role-restricted (only WITHDRAWAL_ADMIN)
3. No critical state to update (simple transfer)
4. SafeERC20 prevents reentrancy through the token contract

This is a design choice rather than a vulnerability.
