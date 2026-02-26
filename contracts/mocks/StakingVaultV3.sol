// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "../StakingVault.sol";

/**
 * @title StakingVaultV3
 * @notice Upgrade that activates the reward delta guard introduced in StakingVault.
 * @dev Adds a reinitializer to set maxRewardPercent on existing proxies that were
 *      deployed before the guard existed (initialize() won't re-run on upgrades).
 *
 *      NOTE: On mainnet, if StakingVault V1 was deployed with maxRewardPercent already
 *      present in initialize(), this reinitializer is NOT required — new deployments
 *      receive the 20% default from initialize(). initializeV3() is only needed for
 *      existing proxies (e.g. testnet) that predate the variable(and only for testnet since it had an existing proxy).
 */
contract StakingVaultV3 is StakingVault {
    uint256 public constant VERSION = 3;

    /**
     * @notice Sets maxRewardPercent to 20% on existing proxies post-upgrade.
     * @dev Only callable once (reinitializer(3)). Only by UPGRADER_ROLE.
     */
    function initializeV3() public reinitializer(3) onlyRole(UPGRADER_ROLE) {
        maxRewardPercent = 0.2e18;
    }

    function version() external pure returns (uint256) {
        return VERSION;
    }
}
