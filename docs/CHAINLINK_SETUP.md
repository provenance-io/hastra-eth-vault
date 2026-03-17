# Chainlink NAV Integration - Complete Setup Guide

## Architecture Overview

```
┌────────────────┐
│   Your Bot     │ ← Go application
│   (bot/)       │
└───────┬────────┘
        │ updateRate(supply, TVL)
        ▼
┌─────────────────────────────────────┐
│ HastraNavEngine                     │ ← Deployed on Holesky
│ 0xec8a23c912397B7971595774ac1bD08FC5Efe39C │
│ - Calculates rate                   │
│ - Returns int192 (Schema v7)        │
└───────┬─────────────────────────────┘
        │ getRate() → int192
        ▼
┌─────────────────┐
│ Chainlink DON   │ ← To be configured
│ - Reads rate    │
│ - Signs report  │
└───────┬─────────┘
        │ Schema v7 signed report
        ▼
┌─────────────────┐
│  Your Bot       │
│  (fetches API)  │
└───────┬─────────┘
        │ submitReport()
        ▼
┌─────────────────────────────────────┐
│ FeedVerifier                        │ ← Deployed
│ - Verifies signature                │
│ - Stores verified rate              │
└───────┬─────────────────────────────┘
        │ priceOf(feedId)
        ▼
┌─────────────────┐
│ StakingVault    │
│ - Uses rate     │
└─────────────────┘
```

## Deployed Contracts

### Holesky Testnet
- **HastraNavEngine**: `0xec8a23c912397B7971595774ac1bD08FC5Efe39C`
  - Updater: Your deployer address
  - Min Rate: 0.5 (int192)
  - Max Rate: 3.0 (int192)
  - Max Difference: 10%

## Setup Instructions

### 1. Bot Setup (✅ Done)

Location: `bot/`

Files created:
- `cmd/bot/main.go` - Entry point
- `internal/config/config.go` - Configuration
- `internal/bot/bot.go` - Bot logic
- `Makefile` - Build commands
- `README.md` + `QUICKSTART.md` - Documentation

**To run:**
```bash
cd bot
make bindings  # Generate contract bindings
make run       # Start bot
```

**Configuration** (in `../.env`):
```bash
PRIVATE_KEY=<your_key>
NAV_ENGINE_ADDRESS=0xec8a23c912397B7971595774ac1bD08FC5Efe39C
VAULT_ADDRESS=<your_vault>
UPDATE_INTERVAL=3600
```

### 2. Configure Chainlink DON (⏳ Next Step)

Contact Chainlink with:
- **Contract Address**: `0xec8a23c912397B7971595774ac1bD08FC5Efe39C`
- **Chain**: Holesky (17000)
- **Function**: `getRate() returns (int192)`
- **Schema**: v7 (Redemption Rates)
- **Polling Frequency**: Every 4 hours (or as needed)

The DON will:
1. Call `getRate()` on NavEngine
2. Get the `int192` value
3. Sign it as a Schema v7 report
4. Publish to Data Streams API

### 4. Bot Integration (⏳ After Testing)

Update `bot/internal/bot/bot.go` to read real vault data:

```go
func (b *NavBot) getTotalSupply(ctx context.Context) (*big.Int, error) {
    vault, err := contracts.NewStakingVault(
        common.HexToAddress(b.cfg.VaultAddress), 
        b.client,
    )
    if err != nil {
        return nil, err
    }
    return vault.TotalSupply(&bind.CallOpts{Context: ctx})
}
```

### 5. End-to-End Flow

Once everything is deployed:

1. **Bot calls NavEngine.updateRate()**
   - Every hour (configurable)
   - With fresh totalSupply and totalTVL

2. **NavEngine stores rate as int192**
   - Validates bounds
   - Emits events

3. **Chainlink DON reads getRate()**
   - Periodically (every 4 hours)
   - Gets int192 value

4. **DON signs and publishes**
   - Creates Schema v7 report
   - Publishes to Data Streams API

5. **Bot fetches signed report**
   - From Chainlink API
   - Submits to FeedVerifier

6. **FeedVerifier verifies**
   - Checks signatures
   - Validates report
   - Stores verified rate

7. **Vaults read from Hub**
   - Call hub.getExchangeRate()
   - Use for vault operations

## Testing Checklist

- [ ] Bot can connect to Holesky RPC
- [ ] Bot address matches NavEngine updater
- [ ] Bot can call updateRate() successfully
- [ ] NavEngine stores correct int192 rate
- [ ] Chainlink DON configured and reading
- [ ] DON producing signed reports
- [ ] FeedVerifier deployed ✅
- [ ] FeedVerifier verifying reports
- [ ] Vault integration working

## Monitoring

### Check NavEngine Rate
```bash
cast call 0xec8a23c912397B7971595774ac1bD08FC5Efe39C \
  "getRate()" \
  --rpc-url https://ethereum-holesky-rpc.publicnode.com
```

### Check Bot Logs
```bash
cd bot
tail -f nav-bot.log
```

### Check Transaction History
https://holesky.etherscan.io/address/0xec8a23c912397B7971595774ac1bD08FC5Efe39C

## Troubleshooting

### Bot Issues
- **"Not updater" error**: Verify private key matches NavEngine.getUpdater()
- **Transaction fails**: Check gas price and ETH balance
- **Rate unchanged**: Verify vault data is updating

### Chainlink Issues
- **DON not reading**: Verify contract address and function signature
- **No reports**: Check polling frequency and gas sponsorship
- **Invalid schema**: Confirm int192 return type

### Integration Issues
- **Hub verification fails**: Check verifier proxy address and feed ID
- **Rate mismatch**: Compare NavEngine rate with Hub rate
- **Stale data**: Check update intervals and staleness thresholds


