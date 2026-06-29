// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "./YieldVault.sol";

/**
 * @title YieldVaultV2
 * @author Hastra
 * @notice Production upgrade of YieldVault that splits REWARDS_ADMIN_ROLE
 *         into three narrower roles.
 *
 * @dev Pre-upgrade (V1):
 *        REWARDS_ADMIN_ROLE gated all of:
 *          - mintRewards         (held by StakingVault contract)
 *          - createRewardsEpoch  (held by ops EOA / Safe)
 *          - completeRedeem      (held by ops EOA)
 *
 *      Post-upgrade (V2):
 *        REWARDS_ADMIN_ROLE     → mintRewards            (unchanged — still StakingVault)
 *        EPOCH_ADMIN_ROLE       → createRewardsEpoch     (Safe)
 *        REDEEM_OPERATOR_ROLE   → completeRedeem         (ops EOA)
 *
 *      Pre-existing REWARDS_ADMIN_ROLE holders for createRewardsEpoch / completeRedeem
 *      are NOT revoked by `initializeV2`. Those revokes are issued as separate Safe txs
 *      after on-chain verification, so the migration can be rolled back by re-granting
 *      role(s) if anything goes wrong during the rehearsal window.
 *
 * @dev `initializeV2` takes the reinitializer version as a runtime argument so the same
 *      bytecode can be deployed to networks at different `_initialized` states.
 *      Caller MUST pass a version strictly greater than the proxy's current
 *      `_initialized` value; the OZ `reinitializer(version)` modifier enforces this.
 *
 *      Example: mainnet proxies typically start at `_initialized == 1` (so `version = 2`),
 *      but testnets may be higher depending on prior upgrades/reinitializers.
 *
 * @dev Must be invoked atomically via `upgradeToAndCall(newImpl, initializeV2Calldata)`
 *      so the role grants land in the same tx as the implementation swap.
 */
contract YieldVaultV2 is YieldVault {
    /// @notice Source-version marker for off-chain monitoring (NOT the proxy's
    ///         `_initialized` value — that is set per-proxy by `initializeV2(version, ...)`).
    uint256 public constant VERSION = 2;

    bytes32 public constant EPOCH_ADMIN_ROLE     = keccak256("EPOCH_ADMIN");
    bytes32 public constant REDEEM_OPERATOR_ROLE = keccak256("REDEEM_OPERATOR");

    // ============ Audit 4.1 — Rewards epoch cap state ============
    //
    // Storage layout note: these three slots are APPENDED to YieldVault's storage
    // (they live after all V1 storage thanks to inheritance ordering). Do NOT
    // re-order or insert above them — the OZ upgrades plugin will catch it but
    // anyone hand-patching this file should know.

    /**
     * @notice Per-epoch cumulative wYLDS already minted via `claimRewards`.
     *         Keyed by `epochIndex` (the same index used in `rewardsEpochs[]`).
     *
     *         WHY:
     *           Each `RewardsEpoch` declares a `totalRewards` budget when the
     *           Merkle root is posted. Without an on-chain counter, the contract
     *           has no way to know how much has already been claimed against
     *           that epoch, so a buggy or malicious Merkle tree (leaves summing
     *           to more than the declared budget) could mint unlimited wYLDS.
     *           This mapping is that counter — `claimRewards` increments it on
     *           every successful claim and refuses claims that would push it
     *           past `epoch.totalRewards`.
     *
     *         LIFETIME:
     *           A slot is written-to lazily on the first claim of an epoch
     *           (zero→nonzero, ~20k gas) and then updated by subsequent claims
     *           (~5k gas on a hot slot). Slots for epochs with no claims yet
     *           stay at 0 and cost no storage.
     */
    mapping(uint256 => uint256) public epochClaimedAmount;

    /**
     * @notice The first epoch index for which the per-epoch cap is enforced.
     *         Claims against `epochIndex >= firstCappedEpoch` consult and
     *         increment `epochClaimedAmount`; claims against
     *         `epochIndex <  firstCappedEpoch` keep V1 semantics (Merkle proof
     *         only, no aggregate cap).
     *
     *         WHY (this is the key migration knob):
     *           When this upgrade lands on mainnet, many V1 epochs already
     *           exist whose `totalRewards` value was treated as metadata, not
     *           a binding budget. Some of them may already have claims summing
     *           to more than the declared `totalRewards` (the very thing the
     *           audit flagged). If we enforced the cap retroactively against
     *           those epochs, in-progress legitimate claims could revert.
     *
     *           So we snapshot `firstCappedEpoch = currentEpochIndex` at the
     *           moment `initializeCaps` runs. Every epoch created BEFORE that
     *           moment is grandfathered. Every epoch created AFTER that moment
     *           is fully cap-enforced.
     *
     *         INVARIANT:
     *           - Set exactly once, by `initializeCaps`.
     *           - Monotonically non-decreasing (never reduced or reset).
     *           - Always equal to `currentEpochIndex` at the time of the upgrade.
     *
     *         Example (mainnet at upgrade time):
     *           currentEpochIndex == 14
     *             → firstCappedEpoch becomes 14
     *             → epochs 0..13 keep V1 behavior
     *             → epochs 14, 15, 16, ... are cap-enforced
     */
    uint256 public firstCappedEpoch;

    /**
     * @notice Global ceiling on what `createRewardsEpoch.totalRewards` may
     *         declare for a single epoch. Settable up or down by
     *         `DEFAULT_ADMIN_ROLE` (the Safe) via `setMaxEpochCap`.
     *
     *         WHY:
     *           `epochClaimedAmount` alone protects against a bad Merkle tree,
     *           but it still trusts EPOCH_ADMIN to declare a sensible
     *           `totalRewards` value. `maxEpochCap` bounds what EPOCH_ADMIN can
     *           declare in the first place, so a compromised or buggy
     *           EPOCH_ADMIN cannot publish an epoch with `totalRewards = 1e30`
     *           and silently relax the per-epoch cap.
     *
     *           Two layers, both required:
     *             1. `maxEpochCap`         → bounds what can be DECLARED.
     *             2. `epoch.totalRewards`  → bounds what can be CLAIMED
     *                                        against a given declared epoch.
     *
     *         BEHAVIOR:
     *           - Zero is rejected (use `pause()` to halt activity, not a 0 cap).
     *           - Affects FUTURE `createRewardsEpoch` calls only. Already-
     *             declared epochs keep their original `totalRewards` budget.
     *           - When this value is 0 (i.e., `initializeCaps` has not run yet),
     *             `createRewardsEpoch` skips the global-cap check so a freshly
     *             upgraded V2 proxy stays operational with V1-equivalent
     *             semantics until the operator turns caps on.
     */
    uint256 public maxEpochCap;

    // ============ Audit 4.1 — Errors / events ============

    /// @notice Reverted by `claimRewards` when a claim would push the epoch's
    ///         cumulative claimed amount above its declared `totalRewards`.
    error EpochCapExceeded(
        uint256 epochIndex,
        uint256 attempted,
        uint256 claimedSoFar,
        uint256 cap
    );

    /// @notice Reverted by `createRewardsEpoch` when the declared per-epoch
    ///         `totalRewards` exceeds the global `maxEpochCap`.
    error EpochCapAboveGlobal(uint256 attempted, uint256 globalCap);

    /// @notice Reverted by `initializeV2` / `setMaxEpochCap` for an invalid
    ///         (zero) global cap.
    error InvalidGlobalCap();

    /// @notice Reverted by `initializeV2` when cap state has already been set.
    ///         The cap boundary (`firstCappedEpoch`) and global cap (`maxEpochCap`)
    ///         are one-shot: re-running `initializeV2` with a higher reinitializer
    ///         version must not be allowed to move the boundary or overwrite the cap.
    error CapsAlreadyInitialized();

    /// @notice Emitted by `setMaxEpochCap` whenever the global cap changes.
    event MaxEpochCapUpdated(uint256 oldCap, uint256 newCap);

    /// @notice Emitted by `initializeV2` to mark where cap enforcement starts.
    event FirstCappedEpochSet(uint256 epochIndex);

    /**
     * @notice One-shot post-upgrade initializer — grants the two new narrower
     *         roles AND enables Audit 4.1 per-epoch caps in the same atomic
     *         call so a proxy can never sit in a partially-initialized state
     *         (V2 roles live, caps still off).
     *
     *         Snapshots `firstCappedEpoch = currentEpochIndex` so any epochs
     *         created BEFORE this call are grandfathered (no retroactive cap
     *         enforcement, no historical counter replay). Every epoch created
     *         AFTER this call is fully cap-enforced:
     *           (a) `maxEpochCap` bounds what can be DECLARED, and
     *           (b) `epoch.totalRewards` bounds what can be CLAIMED.
     *
     *         Runtime `version` mirrors the OZ `reinitializer` pattern so the
     *         same bytecode works on networks at different `_initialized`
     *         states:
     *           - Mainnet (currently V1, `_initialized == 1`):
     *               call with `version = 2`.
     *           - Sepolia (already V2, `_initialized == 3` from the previous
     *             role-split-only impl): call with `version = 4`. On Sepolia
     *             you MUST pass the SAME `epochAdmin` and `redeemOperator`
     *             that already hold those roles — otherwise you'd silently
     *             grant the roles to extra holders (`_grantRole` does not
     *             revoke prior grants, so passing the same address is a true
     *             idempotent no-op).
     *
     * @param  version         OZ reinitializer version; must be > proxy's
     *                         current `_initialized` value.
     * @param  epochAdmin      Address to receive `EPOCH_ADMIN_ROLE` (gates
     *                         createRewardsEpoch).
     * @param  redeemOperator  Address to receive `REDEEM_OPERATOR_ROLE`
     *                         (gates completeRedeem).
     * @param  globalCap       Initial `maxEpochCap` value. Must be non-zero.
     */
    function initializeV2(
        uint64 version,
        address epochAdmin,
        address redeemOperator,
        uint256 globalCap
    )
        public
        reinitializer(version)
        onlyRole(UPGRADER_ROLE)
    {
        if (epochAdmin == address(0) || redeemOperator == address(0)) {
            revert InvalidAddress();
        }
        if (globalCap == 0) revert InvalidGlobalCap();

        _grantRole(EPOCH_ADMIN_ROLE, epochAdmin);
        _grantRole(REDEEM_OPERATOR_ROLE, redeemOperator);

        // Cap state is one-shot. `maxEpochCap > 0` means a prior initializeV2
        // already set the boundary. Allowing a re-run would silently move
        // `firstCappedEpoch` forward (grandfathering already-enforced epochs)
        // and overwrite `maxEpochCap` — both violate the audit invariant.
        if (maxEpochCap != 0) revert CapsAlreadyInitialized();

        firstCappedEpoch = currentEpochIndex;
        maxEpochCap      = globalCap;

        emit FirstCappedEpochSet(currentEpochIndex);
        emit MaxEpochCapUpdated(0, globalCap);
    }

    /**
     * @notice Updates the per-epoch global cap. Settable by `DEFAULT_ADMIN_ROLE`
     *         (the Safe).
     * @dev    Affects only FUTURE `createRewardsEpoch` calls. Already-declared
     *         epochs keep their original `totalRewards` budget.
     *         Zero is rejected — use `pause()` to halt activity, not a 0 cap.
     */
    function setMaxEpochCap(uint256 newCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        // Block calls before initializeV2 has run. If maxEpochCap is still 0,
        // the V2 sentinel hasn't been set — allowing setMaxEpochCap here would
        // permanently trip the CapsAlreadyInitialized guard and brick initializeV2.
        if (maxEpochCap == 0) revert InvalidInitialization();
        if (newCap == 0) revert InvalidGlobalCap();
        uint256 oldCap = maxEpochCap;
        maxEpochCap = newCap;
        emit MaxEpochCapUpdated(oldCap, newCap);
    }

    /**
     * @notice Completes a pending redemption — V2 gates on REDEEM_OPERATOR_ROLE
     *         instead of REWARDS_ADMIN_ROLE. Body is identical to the V1 parent.
     */
    function completeRedeem(address user)
        external
        override
        onlyRole(REDEEM_OPERATOR_ROLE)
        nonReentrant
    {
        // Frozen accounts cannot receive USDC even through a pending redemption.
        // requestRedeem already moved shares into the contract, so _update no longer
        // guards this payout path — we must check explicitly here.
        if (frozen[user]) revert AccountIsFrozen();

        PendingRedemption memory redemption = pendingRedemptions[user];
        if (redemption.shares == 0) revert NoRedemptionPending();

        uint256 vaultBalance = IERC20(asset()).balanceOf(redeemVault);
        if (vaultBalance < redemption.assets) {
            revert InsufficientVaultBalance();
        }

        delete pendingRedemptions[user];
        _burn(address(this), redemption.shares);

        SafeERC20.safeTransferFrom(
            IERC20(asset()),
            redeemVault,
            user,
            redemption.assets
        );

        emit RedemptionCompleted(user, redemption.shares, redemption.assets, block.timestamp);
    }

    /**
     * @notice Creates a rewards epoch — V2 gates on EPOCH_ADMIN_ROLE instead of
     *         REWARDS_ADMIN_ROLE and enforces `totalRewards <= maxEpochCap`
     *         (Audit 4.1).
     *
     * @dev    `initializeV2` always sets `maxEpochCap > 0`, so the `cap != 0`
     *         guard below is dead code for any properly-initialized V2 proxy.
     *         It is retained as defense-in-depth in case a future reinitializer
     *         pattern leaves the slot at 0 before the first call.
     */
    function createRewardsEpoch(
        uint256 epochIndex,
        bytes32 merkleRoot,
        uint256 totalRewards
    ) external override onlyRole(EPOCH_ADMIN_ROLE) {
        if (epochIndex != currentEpochIndex) revert InvalidEpoch();
        if (merkleRoot == bytes32(0)) revert InvalidAmount();

        uint256 cap = maxEpochCap;
        if (cap != 0 && totalRewards > cap) {
            revert EpochCapAboveGlobal(totalRewards, cap);
        }

        rewardsEpochs[epochIndex] = RewardsEpoch({
            merkleRoot: merkleRoot,
            totalRewards: totalRewards,
            timestamp: block.timestamp
        });

        currentEpochIndex++;
        emit RewardsEpochCreated(epochIndex, merkleRoot, totalRewards, block.timestamp);
    }

    /**
     * @notice Claims wYLDS rewards for the caller using a Merkle proof.
     *
     *         For epochs with index >= `firstCappedEpoch` this override enforces
     *         a binding aggregate cap: cumulative claims across all users for an
     *         epoch can never exceed that epoch's declared `totalRewards`. This is
     *         the on-chain remediation for audit finding 4.1 — without it, a
     *         buggy or malicious Merkle tree could mint more wYLDS than the
     *         declared epoch budget.
     *
     *         Pre-cap epochs (index < `firstCappedEpoch`) keep V1 behavior — the
     *         cap counter is not consulted for them. Per-user double-claim
     *         protection (`claimedRewards`) still applies to all epochs.
     *
     * @dev    Strict revert on over-cap claims (no partial fills). Counter is
     *         incremented BEFORE `_mint` — `_mint`'s only external effect is
     *         updating ERC20 balances, but defense-in-depth (also `nonReentrant`).
     */
    function claimRewards(
        uint256 epochIndex,
        uint256 amount,
        bytes32[] calldata proof
    ) external override whenNotPaused nonReentrant {
        if (epochIndex >= currentEpochIndex) revert InvalidEpoch();

        bytes32 claimKey = keccak256(abi.encodePacked(msg.sender, epochIndex));
        if (claimedRewards[claimKey]) revert RewardsAlreadyClaimed();

        RewardsEpoch memory epoch = rewardsEpochs[epochIndex];

        bytes32 leaf = keccak256(
            bytes.concat(keccak256(abi.encode(msg.sender, amount, epochIndex)))
        );

        if (!MerkleProof.verify(proof, epoch.merkleRoot, leaf)) {
            revert InvalidProof();
        }

        // Cap enforcement for post-migration epochs only.
        if (epochIndex >= firstCappedEpoch) {
            uint256 claimedSoFar = epochClaimedAmount[epochIndex];
            uint256 newClaimed   = claimedSoFar + amount;
            if (newClaimed > epoch.totalRewards) {
                revert EpochCapExceeded(epochIndex, amount, claimedSoFar, epoch.totalRewards);
            }
            epochClaimedAmount[epochIndex] = newClaimed;
        }

        claimedRewards[claimKey] = true;
        _mint(msg.sender, amount);
        emit RewardsClaimed(msg.sender, epochIndex, amount);
    }
}
