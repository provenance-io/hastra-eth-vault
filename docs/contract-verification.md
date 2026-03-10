# Contract Verification Guide

Verifying contracts on Etherscan makes source code publicly readable and enables Etherscan's proxy detection (so the UI shows the correct ABI for UUPS proxies).

## Prerequisites

Set your Etherscan API key in `.env`:
```
ETHERSCAN_API_KEY=<your_key>
```

Get a key at https://etherscan.io/myapikey (one key works for all networks including Sepolia/Hoodi via Etherscan V2).

---

## What to Verify

For each deployed UUPS proxy you have **two addresses** to verify:
- **Implementation** — the contract with all the logic (verify this with hardhat)
- **Proxy** — the ERC-1967 proxy (mark as proxy on Etherscan UI after verifying the impl)

---

## Verification Commands

### Root project contracts (YieldVault, StakingVault)

```bash
# StakingVault implementation
npx hardhat verify --network sepolia <STAKING_VAULT_IMPL>

# YieldVault implementation
npx hardhat verify --network sepolia <YIELD_VAULT_IMPL>
```

Get the current implementation addresses:
```bash
npx hardhat run scripts/verify_contracts/get_implementations.ts --network sepolia
```

### Chainlink-hub contracts (FeedVerifier, HastraHub)

Run from the `chainlink-hub/` subdirectory:

```bash
cd chainlink-hub

# FeedVerifier implementation
npx hardhat verify --network sepolia <FEED_VERIFIER_IMPL>

# HastraHub / NavEngine implementation (if applicable)
npx hardhat verify --network sepolia <HASTRA_HUB_IMPL>
```

Implementation addresses are in:
- `chainlink-hub/deployment_feed_verifier_sepolia.json` → `feedVerifierImplementation`
- `deployment_nav_testnet.json` → `navEngineImplementation`

---

## Sepolia — Current Verified Addresses

| Contract | Proxy | Implementation | Verified |
|---|---|---|---|
| YieldVault | `0x0258787Eb97DD01436B562943D8ca85B772D7b98` | `0xd614987f5ccaf52227cc56df59db53bada4ff154` | ✅ |
| StakingVault | `0xFf22361Ca2590761A2429D4127b7FF25E79fdC04` | `0x04594ba04167b777da4100e65f7f7f86564b6f68` | ✅ |
| FeedVerifier | `0xCd9DC3EFaE333Be42d9CbAc0B4F8A4af8f3C8f3D` | `0x3ee53F0cB8DdC3EbC67d11ba159491DEc96cEE3B` | ✅ |

---

## After Verifying the Implementation — Mark Proxy on Etherscan

Etherscan won't automatically show the proxy's ABI. After the implementation is verified:

1. Go to the **proxy address** on Etherscan
2. Click **Contract** tab → **More Options** → **Is this a Proxy?**
3. Click **Verify** — Etherscan detects the ERC-1967 slot and links to the implementation
4. The proxy page now shows the full ABI and read/write tabs

---

## Hoodi Network

Hoodi uses a separate Etherscan instance. The `etherscan.customChains` entry is already configured in `hardhat.config.ts`.

```bash
npx hardhat verify --network hoodi <IMPL_ADDRESS>
```

> **Note:** As of March 2026, only the old `HastraNavEngine` is deployed on Hoodi. StakingVault, YieldVault, and FeedVerifier have not been deployed there yet.

---

## Troubleshooting

**"Already verified"** — contract source is already on Etherscan, nothing to do.

**"V1 deprecated" error** — make sure `etherscan.apiKey` in `hardhat.config.ts` is a single string, not a per-network object:
```ts
// ✅ correct
etherscan: { apiKey: process.env.ETHERSCAN_API_KEY || "" }

// ❌ causes V1 deprecation warning
etherscan: { apiKey: { sepolia: "...", mainnet: "..." } }
```

**"No matching contract"** — hardhat-verify found multiple contracts that match the bytecode. Specify the contract explicitly:
```bash
npx hardhat verify --network sepolia --contract contracts/StakingVault.sol:StakingVault <IMPL_ADDRESS>
```

**Constructor arguments** — UUPS implementations have no constructor arguments (initialization is done via `initialize()`). Do not pass `--constructor-args`.
