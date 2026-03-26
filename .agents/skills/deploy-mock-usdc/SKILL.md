---
name: deploy-mock-usdc
description: Deploy MockUSDC test token to a target network
---

# Deploy MockUSDC

Deploys a mock USDC ERC-20 token (6 decimals) for testing. Skip this on mainnet or
any network where real USDC already exists — set `USDC_ADDRESS` env var instead.

## When to use

- Local development (`localhost`)
- Fresh testnet environment with no existing USDC (`hoodi`, `sepolia`)
- Integration testing that requires a mintable USDC

## Prerequisites

```bash
# .env
PRIVATE_KEY=<deployer_private_key>
HOODI_RPC_URL=https://rpc.hoodi.tech       # or SEPOLIA_RPC_URL
```

## Deploy

```bash
npx hardhat run scripts/deploy/deployMockUSDC.ts --network hoodi
# or
npx hardhat run scripts/deploy/deployMockUSDC.ts --network sepolia
# or
npx hardhat run scripts/deploy/deploy.ts --network localhost
```

## What it does

1. Deploys `MockUSDC` contract (ERC-20, 6 decimals, mintable)
2. Mints **1,000,000 USDC** to the deployer address
3. Saves the address to `deployment_testnet_<network>.json`

## Output

```
MockUSDC deployed at: 0x...
```

Saved in `deployment_testnet_<network>.json`:
```json
{ "usdc": "0x..." }
```

## Verify on Etherscan

```bash
npx hardhat verify <MOCK_USDC_ADDRESS> --network hoodi
```

## Notes

- MockUSDC exposes a `faucet()` function for test wallets to self-mint
- On **production**: set `USDC_ADDRESS=<real_usdc>` in `.env` and skip this step entirely
- Hoodi active USDC: `0xBa16F5b2fDF7D5686D55c2917F323feCbFef76e6`
