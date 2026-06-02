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
 *      bytecode can be deployed to networks at different `_initialized` states:
 *        - Mainnet  YieldVault proxy `_initialized == 1` → call with `version = 2`
 *        - Sepolia  YieldVault proxy `_initialized == 2` → call with `version = 3`
 *      Caller MUST pass a version strictly greater than the proxy's current
 *      `_initialized` value; the OZ `reinitializer(version)` modifier enforces this.
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

    /**
     * @notice One-shot post-upgrade initializer — grants the two new narrower roles.
     * @param  version         OZ reinitializer version; must be > proxy's current
     *                         `_initialized` value (2 for mainnet, 3 for Sepolia).
     * @param  epochAdmin      Address to receive `EPOCH_ADMIN_ROLE` (gates createRewardsEpoch).
     * @param  redeemOperator  Address to receive `REDEEM_OPERATOR_ROLE` (gates completeRedeem).
     */
    function initializeV2(uint64 version, address epochAdmin, address redeemOperator)
        public
        reinitializer(version)
        onlyRole(UPGRADER_ROLE)
    {
        if (epochAdmin == address(0) || redeemOperator == address(0)) {
            revert InvalidAddress();
        }
        _grantRole(EPOCH_ADMIN_ROLE, epochAdmin);
        _grantRole(REDEEM_OPERATOR_ROLE, redeemOperator);
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
     *         REWARDS_ADMIN_ROLE. Body is identical to the V1 parent.
     */
    function createRewardsEpoch(
        uint256 epochIndex,
        bytes32 merkleRoot,
        uint256 totalRewards
    ) external override onlyRole(EPOCH_ADMIN_ROLE) {
        if (epochIndex != currentEpochIndex) revert InvalidEpoch();
        if (merkleRoot == bytes32(0)) revert InvalidAmount();

        rewardsEpochs[epochIndex] = RewardsEpoch({
            merkleRoot: merkleRoot,
            totalRewards: totalRewards,
            timestamp: block.timestamp
        });

        currentEpochIndex++;
        emit RewardsEpochCreated(epochIndex, merkleRoot, totalRewards, block.timestamp);
    }
}
