# UUPS Upgrade Guide

The Hastra Vault Protocol uses the **UUPS (Universal Upgradeable Proxy Standard)** pattern for secure contract upgrades while preserving state and user balances.

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Users/Frontend always interact with PROXY addresses:       │
│  - YieldVault:  0xBf00...b81C  (NEVER changes)             │
│  - StakingVault: 0x14D8...a8Ea (NEVER changes)             │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ delegatecall
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Implementation contracts (CAN be upgraded):                │
│  - YieldVault Logic:  0xE724...3ed5 → 0xNEW... (upgradable)│
│  - StakingVault Logic: 0xc3C7...3A7 → 0xNEW... (upgradable)│
└─────────────────────────────────────────────────────────────┘
```

## Key Concepts

### Proxy vs Implementation

**Proxy Contract**:
- Fixed address (never changes)
- Stores all state (balances, mappings, roles)
- Forwards calls to implementation via `delegatecall`
- Users interact with this address

**Implementation Contract**:
- Contains the logic/code
- Can be replaced (upgraded)
- Has no state of its own
- Not directly accessible to users

### What Gets Upgraded

```
✅ CHANGES on upgrade:
- Function logic
- Bug fixes
- New functions (added)
- Constants
- version() return value

❌ NEVER CHANGES:
- Proxy address
- User balances
- Total supply
- Roles
- Pending redemptions
- All state variables
```

## Upgrade Process

### Prerequisites

1. **UPGRADER_ROLE** - Must have this role
2. **New Implementation** - Deploy V2 contract
3. **Storage Compatibility** - Verify storage layout
4. **Testing** - Test on testnet first

### Step-by-Step Upgrade

#### 1. Create V2 Contract

```solidity
// contracts/YieldVaultV2.sol
import "./YieldVault.sol";

contract YieldVaultV2 is YieldVault {
    // ✅ SAFE: Add new functions
    function version() external pure returns (string memory) {
        return "V2";
    }
    
    // ✅ SAFE: Add new state variables at END
    uint256 public newFeature;
    
    // ❌ UNSAFE: Don't change existing state order
    // ❌ UNSAFE: Don't remove existing functions
}
```

#### 2. Compile and Test

```bash
# Compile
npx hardhat compile

# Run upgrade tests
npx hardhat test test/YieldVault_Upgrade.test.ts
npx hardhat test test/StakingVault_Upgrade.test.ts
```

#### 3. Deploy to Testnet

```bash
# Deploy V2 implementation (not proxy!)
npx hardhat run scripts/upgrade_to_v2.ts --network hoodi
```

The upgrade script does:
```javascript
// Get V1 implementation address
const v1Impl = await upgrades.erc1967.getImplementationAddress(proxyAddress);

// Deploy V2 and upgrade
const YieldVaultV2 = await ethers.getContractFactory("YieldVaultV2");
const upgraded = await upgrades.upgradeProxy(proxyAddress, YieldVaultV2);

// Get V2 implementation address
const v2Impl = await upgrades.erc1967.getImplementationAddress(proxyAddress);

// Verify implementation changed
console.log("V1:", v1Impl);  // 0xE724...
console.log("V2:", v2Impl);  // 0xNEW... (different!)
```

#### 4. Verify State Preserved

```bash
# Check version and state
npx hardhat run scripts/upgrade_test/check_version.ts --network hoodi
```

Output:
```
✅ Version: V2
✅ Total Supply: 10000.0 wYLDS (unchanged)
✅ User balances: Preserved
✅ V2 features: Available
```

#### 5. Production Upgrade

```bash
# MAINNET - Use with caution!
npx hardhat run scripts/upgrade_to_v2.ts --network mainnet

# Verify immediately
npx hardhat run scripts/upgrade_test/check_version.ts --network mainnet
```

## Testing Upgrades

### Automated Test Suite

We provide comprehensive upgrade tests:

```bash
# Test YieldVault upgrade
npx hardhat test test/YieldVault_Upgrade.test.ts

# Test StakingVault upgrade
npx hardhat test test/StakingVault_Upgrade.test.ts
```

Tests verify:
- ✅ State preservation (balances, supply)
- ✅ Role preservation
- ✅ New functions work
- ✅ Old functions still work
- ✅ Implementation address changed
- ✅ Proxy address unchanged

### Manual Upgrade Flow Test

```bash
# Full end-to-end test
./scripts/test_upgrade_flow.sh
```

This script:
1. Runs demo interactions (V1)
2. Captures state
3. Upgrades to V2
4. Verifies state preserved
5. Runs demo interactions (V2)
6. Tests V2 new features

### Example Test Output

```
========================================
🧪 UPGRADE TEST: FULL FLOW
========================================

Step 1: Checking existing deployment... ✅
Step 2: Running initial interactions (V1)... ✅
Step 3: Capturing state before upgrade... ✅
Step 4: UPGRADING TO V2... ✅

📦 V1 IMPLEMENTATION ADDRESSES:
YieldVault V1:   0xE724c19F88edc8879B7E221640185de3CdDA3ed5
StakingVault V1: 0xc3C781632Ba0872Ea9C50335318e1C6669c1D3A7

📦 V2 IMPLEMENTATION ADDRESSES:
YieldVault V2:   0xba821b5cE4Cf70ee1914C4D3cf0Ad636E1b921A2  ← Changed!
StakingVault V2: 0x5400eb2db70744978c6cdd2905c952b4aa58316d  ← Changed!

Step 5: Running interactions again (V2)... ✅
Step 6: Testing V2 new features... ✅

✅ UPGRADE TEST COMPLETE!
```

## Storage Layout Safety

### ❌ UNSAFE Upgrades (Will Break!)

```solidity
// V1
contract YieldVault {
    uint256 public totalAssets;  // Slot 0
    uint256 public fees;         // Slot 1
}

// V2 - ❌ BREAKS STORAGE!
contract YieldVaultV2 is YieldVault {
    uint256 public newVar;       // ❌ Inserted before existing vars
    uint256 public totalAssets;  // Now in wrong slot!
    uint256 public fees;
}
```

### ✅ SAFE Upgrades

```solidity
// V1
contract YieldVault {
    uint256 public totalAssets;  // Slot 0
    uint256 public fees;         // Slot 1
}

// V2 - ✅ SAFE: Append only
contract YieldVaultV2 is YieldVault {
    // totalAssets still in Slot 0
    // fees still in Slot 1
    uint256 public newFeature;   // ✅ Slot 2 (appended)
    mapping(address => uint256) public newMapping;  // ✅ Slot 3
}
```

### OpenZeppelin Protection

Our contracts inherit from OpenZeppelin Upgradeable contracts which use **storage gaps**:

```solidity
contract YieldVault is 
    ERC4626Upgradeable,
    AccessControlUpgradeable,
    // ... other base contracts
{
    // Our state variables
    address public redeemVault;
    mapping(address => PendingRedemption) public pendingRedemptions;
    // ...
    
    // Gap reserved for future upgrades
    uint256[50] private __gap;  // ✅ Built-in by OpenZeppelin
}
```

## Version Verification

### Check Current Version

```bash
# Run version check script
npx hardhat run scripts/upgrade_test/check_version.ts --network hoodi
```

### Programmatic Version Check

```javascript
// V1 contracts don't have version() method
const vault = await ethers.getContractAt("YieldVaultV2", proxyAddress);

try {
  const version = await vault.version();
  console.log("Version:", version);  // "V2"
} catch {
  console.log("Version: V1 (no version method)");
}
```

### Implementation Address Check

```javascript
const proxyAddress = "0xBf000e0362d967B3583fdE2451BeA11b3723b81C";

// Get current implementation
const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
console.log("Implementation:", implAddress);

// Or read from storage directly
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const rawValue = await ethers.provider.getStorage(proxyAddress, IMPLEMENTATION_SLOT);
const implementation = "0x" + rawValue.slice(-40);
```

## Impact on Clients

### Will Clients Break? NO! ✅

**Event Listeners**:
```javascript
// Before upgrade (V1)
const vault = new ethers.Contract(
  "0xBf000e0362d967B3583fdE2451BeA11b3723b81C",  // Proxy
  YieldVaultABI,
  provider
);

vault.on("Deposit", (user, assets, shares) => {
  console.log("Deposit detected");
});

// After upgrade (V2)
// ✅ SAME CODE WORKS - proxy address unchanged!
// ✅ Events still emit from same address
// ✅ Listeners don't break
```

**Function Calls**:
```javascript
// V1 functions still work after upgrade
await vault.deposit(amount, receiver);  // ✅ Works
await vault.requestRedeem(shares);      // ✅ Works

// New V2 functions available
await vault.version();  // ✅ Now available
```

### What Clients Need to Do

**Answer: NOTHING!** ✅

As long as clients use the **proxy address**, they don't need to change anything:
- Event listeners keep working
- Function calls keep working
- State preserved
- Only new features added

## Upgrade Security Checklist

Before upgrading to production:

- [ ] Test upgrade on testnet
- [ ] Verify state preservation
- [ ] Test all V1 functions still work
- [ ] Test new V2 functions work
- [ ] Verify storage layout compatibility
- [ ] Run full test suite
- [ ] Get code review
- [ ] Use multi-sig for upgrade transaction
- [ ] Monitor contract after upgrade
- [ ] Have rollback plan ready

## Rollback Strategy

UUPS upgrades **cannot be automatically rolled back**, but you can upgrade again:

```javascript
// If V2 has issues, upgrade to V1.1 (fixed version)
const YieldVaultV1_1 = await ethers.getContractFactory("YieldVaultV1_1");
await upgrades.upgradeProxy(proxyAddress, YieldVaultV1_1);
```

**Important**: 
- Cannot restore old implementation directly
- Must deploy new implementation with fixes
- State from V2 persists (can't undo state changes)

## Advanced: Manual Upgrade

If you need manual control (not using Hardhat Upgrades plugin):

```solidity
// Call on proxy contract (requires UPGRADER_ROLE)
function upgradeTo(address newImplementation) external onlyRole(UPGRADER_ROLE);

// Or with initialization
function upgradeToAndCall(address newImplementation, bytes memory data) 
    external 
    onlyRole(UPGRADER_ROLE);
```

## Scripts Reference

```bash
# Check versions
npx hardhat run scripts/upgrade_test/check_version.ts --network hoodi

# Get implementation addresses
npx hardhat run scripts/get_implementations.ts --network hoodi

# Upgrade to V2 (test only!)
npx hardhat run scripts/upgrade_to_v2.ts --network hoodi

# Full upgrade test flow
./scripts/test_upgrade_flow.sh
```

## Real-World Examples

Major protocols using UUPS:
- **OpenZeppelin Contracts** - Own contracts use UUPS
- **Uniswap V3** - Uses transparent proxies (similar concept)
- **Compound** - Upgradeable governance
- **Aave V3** - UUPS for upgradeability

## Storage Gaps for Future Upgrades

**StakingVault** includes a storage gap to allow safe future upgrades:

```solidity
address public yieldVault;
mapping(address => bool) public frozen;
uint256 private _totalManagedAssets;
uint256[49] private __gap;  // Reserves 49 slots for future variables
```

### Why Storage Gaps Matter

Without a gap, adding new storage variables in future upgrades could cause storage collisions. The `__gap` reserves 49 storage slots that can be consumed by future variables.

### Adding Variables in Future Upgrades

When adding a new variable, reduce the gap size:

```solidity
// Future V3 upgrade
uint256 private _totalManagedAssets;
uint256 private _newFeatureVariable;  // New variable (uses 1 slot)
uint256[48] private __gap;             // Reduced from 49 to 48
```

This maintains the same total storage footprint while adding new functionality.

### What You CAN Add in Upgrades

✅ **Safe to add:**
- New functions
- Constants (`constant`, `immutable`)
- View/pure logic changes
- Bug fixes
- New storage variables **at the end** (while reducing `__gap`)

❌ **Unsafe (breaks storage):**
- Reordering existing variables
- Changing variable types
- Removing variables
- Adding variables in the middle

## See Also

- [OpenZeppelin UUPS](https://docs.openzeppelin.com/contracts/5.x/api/proxy#UUPSUpgradeable)
- [EIP-1822: UUPS](https://eips.ethereum.org/EIPS/eip-1822)
- [Storage Gaps](https://docs.openzeppelin.com/contracts/5.x/upgradeable#storage_gaps)
- [ROLES.md](./ROLES.md) - UPGRADER_ROLE details
- [Test Files](../test/*_Upgrade.test.ts) - Upgrade test examples
