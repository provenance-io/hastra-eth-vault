# HastraNavEngine - Deployment & Testing Guide

## Overview
On-chain NAV calculation engine that Chainlink DON reads from. Conforms to Chainlink Data Streams Schema v7 (Redemption Rates).

## Contract Details
- **Location:** `contracts/chainlink/HastraNavEngine.sol`
- **Dependencies:** OpenZeppelin v5.4.0 (upgradeable contracts)
- **Type:** UUPS Upgradeable, Pausable, Ownable
- **Schema v7 Compliance:** ✅ Returns `int192` exchange rate

## Key Features
1. **Rate Calculation:** `rate = totalTVL / totalSupply` (18 decimals)
2. **Safety Checks:**
   - Min/max rate bounds
   - Max TVL change percent between updates
   - Graceful degradation (alerts instead of reverts)
3. **Access Control:**
   - Owner: Admin operations
   - Updater: Can call `updateRate()`
4. **Upgradeability:** UUPS pattern

## Deployment

### Local/Testnet
```bash
npx hardhat run scripts/deployNavEngine.ts --network localhost
npx hardhat run scripts/deployNavEngine.ts --network sepolia
npx hardhat run scripts/deployNavEngine.ts --network holesky
```

### Mainnet
```bash
npx hardhat run scripts/deployNavEngine.ts --network mainnet
```

### Deployment Parameters
Edit `scripts/deployNavEngine.ts` before deploying:
```typescript
const OWNER = "<your-admin-address>";
const UPDATER = "<your-bot-address>";
const MAX_DIFFERENCE_PERCENT = ethers.parseEther("0.1");  // 10%
const MIN_RATE = BigInt("500000000000000000");  // 0.5
const MAX_RATE = BigInt("3000000000000000000");  // 3.0
```

## Testing

### Run All Tests
```bash
npm test -- test/HastraNavEngine.test.ts
```

### Test Coverage (21/21 passing ✅)
- **Initialization (4 tests)**
  - Owner, updater, bounds, max difference
- **Update Rate (9 tests)**
  - Successful updates
  - int192 type verification (Schema v7)
  - Access control
  - Alert handling (invalid TVL, rate bounds, max change)
- **Admin Functions (4 tests)**
  - Set updater, update bounds
  - Pause/unpause
- **View Functions (2 tests)**
  - Initial rate, update timestamps
- **Upgradeability (2 tests)**
  - Upgrade proxy, preserve state

## Usage Flow

### 1. Deploy Contract
```bash
npx hardhat run scripts/deployNavEngine.ts --network sepolia
```

### 2. Configure Your Bot
Your bot should:
1. Calculate `totalSupply` from vault
2. Calculate `totalTVL` from underlying assets
3. Call `updateRate(totalSupply, totalTVL)`

Example:
```typescript
const totalSupply = await vault.totalSupply();
const totalTVL = await calculateTVL(); // Your TVL logic
await navEngine.updateRate(totalSupply, totalTVL);
```

### 3. Configure Chainlink DON
Point Chainlink DON to read from your deployed NavEngine:
- **Contract Address:** `<deployed-address>`
- **Function:** `getRate()` → returns `int192`
- **Schema:** v7 (Redemption Rates)

### 4. DON Workflow
1. DON reads `navEngine.getRate()` → gets `int192` rate
2. DON signs rate into Schema v7 report
3. DON publishes to Data Streams API
4. Your bot fetches signed report
5. Bot submits updated rate via FeedVerifier

## API Reference

### Core Functions

#### `updateRate(uint256 totalSupply, uint256 totalTVL) returns (int192)`
Updates the NAV rate. Only callable by updater role.
- **totalSupply:** Total supply of vault shares (18 decimals)
- **totalTVL:** Total value locked in underlying assets (18 decimals)
- **Returns:** Current rate as int192 (Schema v7)

#### `getRate() returns (int192)`
Returns current NAV rate. Read by Chainlink DON.
- **Returns:** int192 exchange rate (18 decimals, Schema v7 format)

### View Functions
- `getUpdater() returns (address)`
- `getMinRate() returns (int192)`
- `getMaxRate() returns (int192)`
- `getMaxDifferencePercent() returns (uint256)`
- `getLatestTotalSupply() returns (uint256)`
- `getLatestTVL() returns (uint256)`
- `getLatestUpdateTime() returns (uint256)`

### Admin Functions (onlyOwner)
- `setUpdater(address)`
- `setMinRate(int192)`
- `setMaxRate(int192)`
- `setMaxDifferencePercent(uint256)`
- `pause()` / `unpause()`

## Events

### Success
- `RateUpdated(int192 rate, uint256 totalSupply, uint256 totalTVL, uint256 timestamp)`

### Alerts (Graceful Degradation)
- `AlertInvalidTVL(uint256 tvl, uint256 timestamp)`
- `AlertInvalidTVLDifference(uint256 previousTVL, uint256 newTVL, uint256 timestamp)`
- `AlertInvalidRate(int192 rate, uint256 timestamp)`

### Admin
- `UpdaterSet(address updater)`
- `MinRateSet(int192 minRate)`
- `MaxRateSet(int192 maxRate)`
- `MaxDifferencePercentSet(uint256 maxDifferencePercent)`

## Security Considerations

1. **Updater Role:** Ensure updater address is secure (ideally a bot with limited private key exposure)
2. **Rate Bounds:** Set realistic min/max rates based on expected vault performance
3. **Max Difference:** Set appropriate threshold to prevent manipulation while allowing legitimate changes
4. **Pausability:** Owner can pause in emergency situations
5. **Upgradeability:** UUPS pattern - only owner can upgrade

## Integration with Chainlink

Once deployed:
1. Provide contract address to Chainlink
2. Specify `getRate()` as the data source function
3. Confirm Schema v7 (Redemption Rates) configuration
4. Set polling frequency (e.g., every 4 hours)
5. Test with DON on testnet first

## Troubleshooting

### Rate not updating
- Check updater has sufficient gas
- Verify rate is within min/max bounds
- Check TVL change is within maxDifferencePercent

### Alert events firing
- `AlertInvalidTVL`: TVL is zero - check calculation
- `AlertInvalidRate`: Rate outside bounds - adjust bounds or fix calculation
- `AlertInvalidTVLDifference`: TVL changed >10% - expected for large deposits/withdrawals

### Upgrade fails
- Verify caller is owner
- Check new implementation is upgrade-safe
- Ensure storage layout is compatible
