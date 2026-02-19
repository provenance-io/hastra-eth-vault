# Deploy Bot to Hoodi Network

## Current Deployment

- **Network**: Hoodi (ChainID: 560048)
- **NavEngine**: `0xF48621B9d8F5D9D0729bb54d67A9d21757fe95cd`
- **RPC**: `https://ethereum-hoodi-rpc.publicnode.com`
- **Bot Strategy**: Uses mock values (1000 shares, 1500 assets → 1.5 NAV rate)

## Setup

### 1. Set Your Private Key

Edit `bot/.env` and add your deployer private key:

```bash
PRIVATE_KEY=your_actual_private_key_here
```

All other settings are pre-configured for Hoodi network.

### 2. Build the Bot

```bash
cd bot
go build -o bin/nav-bot cmd/bot/main.go
```

### 3. Test Locally

```bash
./bin/nav-bot
```

Expected output:
```
Starting NAV Updater Bot...
✅ Connected to Hoodi (ChainID: 560048)
✅ Connected to NavEngine at 0xF48621B9d8F5D9D0729bb54d67A9d21757fe95cd
ℹ️  Updater: 0x...
ℹ️  Update interval: 3600s (1 hour)

[2026-02-19 00:30:00] 🔄 Updating rate...
  Total Supply: 1000000000000000000000 (1000.00 shares)
  Total TVL:    1500000000000000000000 (1500.00 assets)
  Current Rate: 1500000000000000000
  New Rate:     1500000000000000000
📝 Submitting transaction...
✅ Rate updated! tx: 0x...
```

## Running in Production

### Option 1: systemd (Linux)

Create `/etc/systemd/system/nav-bot.service`:

```ini
[Unit]
Description=Hastra NAV Updater Bot
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/hastra-eth-vault/bot
ExecStart=/path/to/hastra-eth-vault/bot/bin/nav-bot
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable nav-bot
sudo systemctl start nav-bot
sudo systemctl status nav-bot
```

View logs:
```bash
sudo journalctl -u nav-bot -f
```

### Option 2: Docker

Create `bot/Dockerfile`:
```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o nav-bot cmd/bot/main.go

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/nav-bot .
COPY --from=builder /app/../deployment_testnet.json ../
CMD ["./nav-bot"]
```

Build and run:
```bash
cd bot
docker build -t hastra-nav-bot .
docker run -d \
  --name nav-bot \
  --restart unless-stopped \
  -e PRIVATE_KEY=your_key \
  hastra-nav-bot
```

### Option 3: tmux/screen (Simple)

```bash
cd bot
tmux new -s nav-bot
./bin/nav-bot
# Detach with Ctrl+B, D
```

Reattach:
```bash
tmux attach -t nav-bot
```

## Monitoring

### Check Bot Status

```bash
# If using systemd
sudo systemctl status nav-bot

# If using Docker
docker logs -f nav-bot

# If using tmux
tmux attach -t nav-bot
```

### Check On-Chain Updates

```bash
# View latest rate (should be 1.5e18 = 1500000000000000000)
cast call 0xF48621B9d8F5D9D0729bb54d67A9d21757fe95cd "getRate()" --rpc-url https://ethereum-hoodi-rpc.publicnode.com

# View last update time
cast call 0xF48621B9d8F5D9D0729bb54d67A9d21757fe95cd "getLatestUpdateTime()" --rpc-url https://ethereum-hoodi-rpc.publicnode.com
```

## Troubleshooting

### Bot won't connect to RPC

Check network connectivity:
```bash
curl -X POST https://ethereum-hoodi-rpc.publicnode.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

Should return: `{"jsonrpc":"2.0","id":1,"result":"0x88c30"}`

### Insufficient gas

Increase gas settings in `.env`:
```bash
GAS_LIMIT=1000000
MAX_GAS_PRICE_GWEI=100
```

### Transaction reverts

Check if your address has the UPDATER_ROLE:
```bash
cast call 0xec8a23c912397B7971595774ac1bD08FC5Efe39C \
  "hasRole(bytes32,address)" \
  $(cast keccak "UPDATER_ROLE") \
  YOUR_ADDRESS \
  --rpc-url https://ethereum-hoodi-rpc.publicnode.com
```

Should return: `0x0000000000000000000000000000000000000000000000000000000000000001` (true)

If false, grant the role:
```bash
cast send 0xec8a23c912397B7971595774ac1bD08FC5Efe39C \
  "grantRole(bytes32,address)" \
  $(cast keccak "UPDATER_ROLE") \
  YOUR_ADDRESS \
  --private-key $PRIVATE_KEY \
  --rpc-url https://ethereum-hoodi-rpc.publicnode.com
```

## Configuration Reference

All settings in `bot/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| PRIVATE_KEY | *required* | Deployer/updater private key |
| NAV_ENGINE_ADDRESS | 0xF48621... | NavEngine contract address |
| RPC_URL | hoodi rpc | Hoodi RPC endpoint |
| CHAIN_ID | 560048 | Hoodi chain ID |
| UPDATE_INTERVAL | 3600 | Seconds between updates |
| GAS_LIMIT | 500000 | Max gas per transaction |
| MAX_GAS_PRICE_GWEI | 50 | Max gas price in gwei |

## What the Bot Does

Every UPDATE_INTERVAL seconds:

1. Uses mock values: 1000 shares, 1500 assets
2. Calls `NavEngine.updateRate(1000e18, 1500e18)`
3. NavEngine validates and stores rate: (1500e18 * 1e18) / 1000e18 = 1.5e18
4. Chainlink DON can now read the updated rate via `getRate()`

**Note**: Bot uses constant mock values. The rate will always be 1.5 unless you modify the bot code.
