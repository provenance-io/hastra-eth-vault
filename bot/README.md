# NAV Updater Bot

Go bot that updates HastraNavEngine with fresh NAV data.

## Setup

### 1. Generate Contract Bindings

```bash
cd bot
./generate-bindings.sh
```

Requires: `abigen` and `jq` installed.

### 2. Set Your Private Key

Edit `../.env` (root directory) and ensure your private key is set:

```bash
PRIVATE_KEY=your_actual_private_key_here
```

**The bot uses mock values** for supply/TVL (1000 shares, 1500 assets).
This keeps the NAV rate constant at 1.5 for Chainlink integration testing.

### 3. Build & Run

```bash
cd bot
go build -o bin/nav-bot cmd/bot/main.go
./bin/nav-bot
```

## What It Does

1. Connects to Holesky RPC
2. Reads `totalSupply` and `totalTVL` from your vault
3. Calls `NavEngine.updateRate(totalSupply, totalTVL)`  
4. Repeats every `UPDATE_INTERVAL` seconds
5. Chainlink DON reads `getRate()` → gets int192

## Production Deployment

See [deployment guide](./docs/DEPLOYMENT.md) for systemd/Docker setup.
