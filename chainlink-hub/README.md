# chainlink-hub

`chainlink-hub` is the Chainlink Data Streams subproject for Hastra. It contains the onchain verifier contracts, deployment scripts, and test utilities used to receive a signed Chainlink report, verify it through the Chainlink Verifier Proxy, and store the resulting exchange rate onchain.

This document now serves as the practical entry point for the subproject: what is here, how it fits together, how to test it, and where to deploy or verify it.

## What this subproject is for

The broader Hastra flow is:

1. `HastraNavEngine` in the main project computes an exchange rate.
2. The Chainlink DON reads that rate and publishes a signed Schema v7 report.
3. A bot or operator fetches that report from the Data Streams API.
4. A contract in `chainlink-hub` verifies the report onchain and stores the price.
5. Vaults read the verified rate.

In practice, the currently active contract in this subproject is `FeedVerifier`.

## Main contracts

### `FeedVerifier`

File: [`./contracts/FeedVerifier.sol`](./contracts/FeedVerifier.sol)

Purpose:

- verifies Chainlink Data Streams Schema v7 reports onchain
- stores the latest verified price per `feedId`
- supports single-report and bulk-report verification
- uses UUPS upgrades plus role-based access control

Useful read methods:

- `priceOf(bytes32 feedId)`
- `timestampOf(bytes32 feedId)`
- `lastFeedId()`

Useful write methods:

- `verifyReport(bytes unverifiedReport)`
- `verifyBulkReports(bytes[] unverifiedReports)`
- `pause()`
- `unpause()`

## Project layout

- Contracts: [`./contracts/`](./contracts/)
- Tests: [`./test/FeedVerifier.test.ts`](./test/FeedVerifier.test.ts)
- Deploy script: [`./scripts/deploy-feed-verifier.ts`](./scripts/deploy-feed-verifier.ts)
- Read/publish script: [`./scripts/test-feed-verifier.ts`](./scripts/test-feed-verifier.ts)
- Feed ID helper: [`./scripts/verify-feed-id.ts`](./scripts/verify-feed-id.ts)
- Report decoder: [`./scripts/decode-report.ts`](./scripts/decode-report.ts)
- Latest Sepolia deployment artifact: [`./deployment_feed_verifier_sepolia.json`](./deployment_feed_verifier_sepolia.json)

Related docs outside this folder:

- Chainlink integration overview: [`../CHAINLINK_SETUP.md`](../docs/CHAINLINK_SETUP.mdUP.md)
- Contract verification guide: [`../docs/contract-verification.md`](../docs/contract-verification.md)

## Quick start

From the repo root:

```bash
cd chainlink-hub
npm install
npx hardhat compile
```

Run tests:

```bash
npm test
```

Run coverage:

```bash
npm run test:coverage
```

## Deployment

Primary deployment script:

- [`./scripts/deploy-feed-verifier.ts`](./scripts/deploy-feed-verifier.ts)

Example:

```bash
cd chainlink-hub
ADMIN_ADDRESS=<admin> \
UPDATER_ADDRESS=<bot-wallet> \
npx hardhat run scripts/deploy-feed-verifier.ts --network sepolia
```

Expected environment:

- `PRIVATE_KEY`
- `SEPOLIA_RPC_URL` or `HOODI_RPC_URL`
- `ETHERSCAN_API_KEY` for verification
- optional `ADMIN_ADDRESS`
- optional `UPDATER_ADDRESS`

What the script does:

- deploys `FeedVerifier` behind a UUPS proxy
- prints proxy and implementation addresses
- writes a deployment artifact such as [`./deployment_feed_verifier_sepolia.json`](./deployment_feed_verifier_sepolia.json)
- attempts Etherscan verification for the implementation

Current Sepolia deployment artifact:

- proxy: `0xCd9DC3EFaE333Be42d9CbAc0B4F8A4af8f3C8f3D`
- implementation: `0x3ee53F0cB8DdC3EbC67d11ba159491DEc96cEE3B`
- verifier proxy: `0x4e9935be37302B9C97Ff4ae6868F1b566ade26d2`
- feed ID: `0x000700f43b35146a1cb16373ac6225ad597535e928e6dc4d179c3b4225f2b6d3`

## Reading and publishing reports

Use [`./scripts/test-feed-verifier.ts`](./scripts/test-feed-verifier.ts) for both dry-run reads and real onchain publishes.

Read only:

```bash
cd chainlink-hub
MODE=read \
CHAINLINK_CLIENT_ID=<id> \
CHAINLINK_CLIENT_SECRET=<secret> \
npx hardhat run scripts/test-feed-verifier.ts --network sepolia
```

Publish onchain:

```bash
cd chainlink-hub
MODE=publish \
FEED_VERIFIER_ADDRESS=<proxy-address> \
CHAINLINK_CLIENT_ID=<id> \
CHAINLINK_CLIENT_SECRET=<secret> \
npx hardhat run scripts/test-feed-verifier.ts --network sepolia
```

The publish flow will:

- fetch the latest report from the Chainlink API
- submit `verifyReport(fullReport)`
- print the transaction hash
- read back `priceOf(feedId)` and `timestampOf(feedId)`

## Architecture summary

```text
HastraNavEngine (main project)
  -> Chainlink DON reads the rate
  -> DON signs a Schema v7 report
  -> operator fetches the report from Data Streams
  -> FeedVerifier verifies the report onchain
  -> Hastra vaults read the verified price
```

Why this subproject exists:

- Chainlink integration has different dependency constraints from the main project
- this keeps Chainlink verifier code isolated
- deployment/testing for report verification can evolve independently

## Verification and deployment references

If you need to verify contracts or look up current addresses:

- verification steps: [`../docs/contract-verification.md`](../docs/contract-verification.md)
- broader Chainlink setup/context: [`../CHAINLINK_SETUP.md`](../docs/CHAINLINK_SETUP.mdUP.md)
- deployment output: [`./deployment_feed_verifier_sepolia.json`](./deployment_feed_verifier_sepolia.json)

## Safe admin workflow

Recommended role split for `FeedVerifier`:

- Safe: `DEFAULT_ADMIN_ROLE`, `UPGRADER_ROLE`
- emergency single key: `PAUSER_ROLE`
- bot/operator: `UPDATER_ROLE`

Scripts:

- prepare Safe upgrade calldata: [`./scripts/admin/prepare-safe-upgrade.ts`](./scripts/admin/prepare-safe-upgrade.ts)
- prepare Safe role grant/revoke calldata: [`./scripts/admin/prepare-safe-role-grant.ts`](./scripts/admin/prepare-safe-role-grant.ts)
- verify a Safe upgrade executed: [`./scripts/admin/verify-safe-upgrade.ts`](./scripts/admin/verify-safe-upgrade.ts)

Example role grant:

```bash
cd chainlink-hub
SAFE_ADDRESS=<safe-address> \
ROLE=UPGRADER \
TARGET=<safe-address> \
npx hardhat run scripts/admin/prepare-safe-role-grant.ts --network sepolia
```

Example upgrade preparation:

```bash
cd chainlink-hub
SAFE_ADDRESS=<safe-address> \
npx hardhat run scripts/admin/prepare-safe-upgrade.ts --network sepolia
```

## Notes

- `FeedVerifier` is the contract with the active test suite in this repo.
- The Data Streams report schema used here is Schema v7 / Redemption Rates.
- `FeedVerifier` stores values per `feedId`, which makes it usable for multi-feed setups even when the current deployment is effectively single-feed.
