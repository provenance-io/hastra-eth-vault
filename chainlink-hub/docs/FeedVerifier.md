# FeedVerifier

Onchain verifier for Chainlink Data Streams Schema v7 (Redemption Rates).

## Overview

`FeedVerifier` receives signed reports from the Chainlink Data Streams API, verifies them against the VerifierProxy, and stores the latest price per feedId. Multiple `StakingVault` instances can share a single `FeedVerifier`.

It is a UUPS upgradeable proxy. The proxy address is stable; only the implementation changes on upgrade.

**Sepolia proxy:** `0xCd9DC3EFaE333Be42d9CbAc0B4F8A4af8f3C8f3D`  
**Sepolia latest impl:** see [`deployment_feed_verifier_sepolia.json`](../deployment_feed_verifier_sepolia.json)

---

## Roles

| Role | Constant | Purpose |
|------|----------|---------|
| `DEFAULT_ADMIN_ROLE` | `0x00` | Grant/revoke roles, set feedId, set maxStaleness, withdraw ETH, upgrade (via UPGRADER_ROLE) |
| `UPGRADER_ROLE` | `keccak256("UPGRADER_ROLE")` | Authorize UUPS implementation upgrades |
| `PAUSER_ROLE` | `keccak256("PAUSER_ROLE")` | Pause and unpause the contract |
| `UPDATER_ROLE` | `keccak256("UPDATER_ROLE")` | Call `verifyReport()` and `verifyBulkReports()` — assigned to the bot wallet |

On testnets the deployer holds all roles. On mainnet the Safe multisig should hold `DEFAULT_ADMIN_ROLE`, `UPGRADER_ROLE`, and `PAUSER_ROLE`; the bot wallet holds only `UPDATER_ROLE`.

---

## Key Functions

### `verifyReport(bytes unverifiedReport)`
Verifies a single Schema v7 report from the Chainlink Data Streams API and stores the price. Requires `UPDATER_ROLE`. Reverts if paused.

### `verifyBulkReports(bytes[] unverifiedReports)`
Verifies multiple reports in one call using `VerifierProxy.verifyBulk()`. All reports share a single fee payment. Requires `UPDATER_ROLE`.

### `priceOf(bytes32 feedId) → int192`
Returns the latest verified price for a feed (1e18 scaled). Reverts if:
- No report stored yet (`PriceNotInitialized`)
- Stored price is zero or negative (`ZeroPriceInReport`)
- Price age exceeds `maxStaleness` (`StalePrice`)

### `setAllowedFeedId(bytes32 feedId)`
Restrict the contract to only accept reports for a specific feedId. Pass `bytes32(0)` to disable enforcement. Requires `DEFAULT_ADMIN_ROLE`.

### `setMaxStaleness(uint32 seconds)`
Set maximum age for prices returned by `priceOf()`. Default is 86400 (24h). Set to 0 to disable. Requires `DEFAULT_ADMIN_ROLE`.

### `withdrawEth(address payable beneficiary)`
Withdraw ETH held by the contract (unspent verification fees). Requires `DEFAULT_ADMIN_ROLE`. Protected by reentrancy guard.

---

## Errors

| Error | Selector | Description |
|-------|----------|-------------|
| `InvalidReportVersion(uint16)` | — | Report schema is not v7 |
| `ReportNotYetValid(uint32 validFrom, uint32 now)` | `0x029223f3` | `block.timestamp < report.validFromTimestamp` — submitted too early |
| `ExpiredReport(uint32 expiresAt, uint32 now)` | — | `block.timestamp > report.expiresAt` |
| `StaleReport(uint32 newTs, uint32 storedTs)` | — | Report is not newer than what's already stored |
| `StalePrice(bytes32 feedId, uint32 lastTs, uint32 now)` | — | Stored price exceeds `maxStaleness` when reading via `priceOf()` |
| `PriceNotInitialized(bytes32 feedId)` | — | No report stored yet for this feedId |
| `ZeroPriceInReport(bytes32 feedId)` | — | Report contains price ≤ 0 |
| `InvalidFeedId(bytes32 expected, bytes32 actual)` | — | Report feedId doesn't match `allowedFeedId` |
| `NothingToWithdraw()` | — | ETH balance is zero on `withdrawEth()` |
| `ZeroAddress()` | — | Zero address passed to `initialize()` |

### Decoding revert data with cast

```bash
DATA="0x029223f3<hex>"
cast calldata-decode "ReportNotYetValid(uint32,uint32)" $DATA
# → validFromTimestamp, blockTimestamp
```

---

## Fee Model

Verification fees are paid in **native ETH** (not LINK).

On networks where a `FeeManager` is present (mainnet), `_buildParameterPayload()` calls `feeManager.i_nativeAddress()` to get the wrapped-native token, queries the fee amount, and forwards it with `verify{value: nativeFee}(...)`.

On **Sepolia**, `s_feeManager()` returns `address(0)` — no fee is charged and the ETH balance is unaffected.

Fund the contract with ETH before going live on mainnet:
```bash
cast send <proxy_address> --value 0.1ether --rpc-url $MAINNET_RPC_URL --private-key $PRIVATE_KEY
```

Recover unspent ETH:
```bash
cast send <proxy_address> "withdrawEth(address)" <beneficiary> --rpc-url $MAINNET_RPC_URL --private-key $PRIVATE_KEY
```

---

## Upgrade Process

The contract bypasses the OZ upgrades plugin manifest cache. Always use the upgrade script directly:

```bash
# Standard (EOA upgrader):
npx hardhat run scripts/admin/upgrade-feed-verifier.ts --network sepolia

# Multisig (generate Safe calldata):
npx hardhat run scripts/admin/prepare-safe-upgrade.ts --network mainnet
```

After upgrade, verify:
```bash
EXPECTED_IMPL=<new_impl> npx hardhat run scripts/admin/verify-safe-upgrade.ts --network sepolia
```

**Why no OZ manifest?** Chainlink's `llo-feeds` contracts pin `@openzeppelin/contracts@4.8.3` via versioned imports. Mixing OZ v5 in the same compilation unit is unsafe. The OZ v4 upgrades plugin can also return cached bytecode — the script uses `Factory.deploy()` + `upgradeToAndCall()` directly to avoid this.

---

## Storage Layout

The contract uses `uint256[43] __gap` followed by `uint256 _reentrancyStatus` (consuming the last of the original 44 gap slots). This is equivalent to OZ's `ReentrancyGuardUpgradeable` without changing the storage footprint — safe for upgrading the existing proxy.

Do not add new state variables except by consuming gap slots or appending after `_reentrancyStatus`.
