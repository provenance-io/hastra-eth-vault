# Quick Start Guide

## Prerequisites

1. **Install Go** (1.21 or later)
2. **Install abigen**:
   ```bash
   go install github.com/ethereum/go-ethereum/cmd/abigen@latest
   ```
3. **Set environment variables** in `../.env`:
   ```bash
   PRIVATE_KEY=<your_deployer_key_without_0x>
   NAV_ENGINE_ADDRESS=0xec8a23c912397B7971595774ac1bD08FC5Efe39C
   VAULT_ADDRESS=<your_vault_address>
   ```

## Setup Steps

### 1. Compile Solidity Contracts (from project root)
```bash
cd ..
npm run compile
```

### 2. Generate Go Bindings
```bash
cd bot
make bindings
```

This creates `pkg/contracts/navengine.go` from the compiled contract ABI.

### 3. Install Go Dependencies
```bash
go mod download
```

### 4. Build
```bash
make build
```

### 5. Run
```bash
make run
```

## What You'll See

```
🤖 NAV Updater Bot Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Address:      0xYourAddress...
NavEngine:    0xec8a23c912397B7971595774ac1bD08FC5Efe39C
Vault:        0xYourVault...
RPC:          https://ethereum-holesky-rpc.publicnode.com
Interval:     3600 seconds
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Verified as updater

[2026-02-19 00:08:45] 🔄 Updating rate...
  Total Supply: 1000000000000000000000 (1000.00)
  Total TVL:    1500000000000000000000 (1500.00)
  Current Rate: 0
  Transaction:  0x123abc...
  Waiting for confirmation...
  ✅ Rate updated to: 1500000000000000000
  Gas used: 123456
```

## Next Steps

### 1. Update Vault Integration

Edit `internal/bot/bot.go` and replace the TODO sections:

```go
func (b *NavBot) getTotalSupply(ctx context.Context) (*big.Int, error) {
    // Replace mock with actual vault call
    vault, err := contracts.NewStakingVault(common.HexToAddress(b.cfg.VaultAddress), b.client)
    if err != nil {
        return nil, err
    }
    return vault.TotalSupply(&bind.CallOpts{Context: ctx})
}

func (b *NavBot) getTotalTVL(ctx context.Context) (*big.Int, error) {
    // Replace mock with actual TVL calculation
    vault, err := contracts.NewStakingVault(common.HexToAddress(b.cfg.VaultAddress), b.client)
    if err != nil {
        return nil, err
    }
    return vault.TotalAssets(&bind.CallOpts{Context: ctx})
}
```

### 2. Configure Chainlink DON

Once the bot is running and updating the rate:
- Contact Chainlink to configure DON
- Point DON to contract: `0xec8a23c912397B7971595774ac1bD08FC5Efe39C`
- Function to read: `getRate()` (returns int192)
- Schema: v7 (Redemption Rates)

### 3. Deploy HastraHub

Deploy the verification contract that will receive signed reports from Chainlink DON.

## Troubleshooting

### "cannot find module providing package"
Run `make bindings` first to generate contract code.

### "Address is not the updater"
The private key address must match `NavEngine.getUpdater()`.
Check with: `cast call 0xec8a23c912397B7971595774ac1bD08FC5Efe39C "getUpdater()" --rpc-url https://ethereum-holesky-rpc.publicnode.com`

### "insufficient funds"
Ensure deployer address has Holesky ETH for gas.
