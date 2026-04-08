// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "../StakingVault.sol";

/**
 * @title StakingVaultV4
 * @notice Upgrade that activates the reward mint-cap guard introduced in StakingVault.
 * @dev Adds a reinitializer to set the five new reward-cap variables on existing proxies
 *      that were deployed before this guard existed (initialize() won't re-run on upgrades).
 *
 *      New state initialized here:
 *        - maxPeriodRewards       absolute per-call cap (1M wYLDS)
 *        - rewardPeriodSeconds    cooldown between calls (59 min)
 *        - maxTotalRewards        lifetime ceiling (10M wYLDS)
 *
 *      lastRewardDistributedAt and totalRewardsDistributed intentionally remain at 0:
 *        - 0 lastRewardDistributedAt means the first post-upgrade distribution is
 *          immediately allowed (no artificial cooldown delay).
 *        - 0 totalRewardsDistributed is correct — we are not back-filling historical
 *          distributions; the cap governs future activity only.
 *
 *      Only callable once (reinitializer(4)). Only by UPGRADER_ROLE.
 */
contract StakingVaultV4 is StakingVault {
    uint256 public constant VERSION = 4;

    function initializeV4() public reinitializer(4) onlyRole(UPGRADER_ROLE) {
        maxPeriodRewards    = 1_000_000e6;   // 1M wYLDS absolute cap per call
        rewardPeriodSeconds = 3540;           // 59 min — 1 min buffer before hourly boundary
        maxTotalRewards     = 10_000_000e6;  // 10M wYLDS lifetime cap
    }

    function version() external pure returns (uint256) {
        return VERSION;
    }
}
