// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "../StakingVault.sol";

/**
 * @title StakingVaultV2
 * @notice Mock upgraded version for testing upgrade patterns with initializeV2()
 * @dev This is a TEST-ONLY contract that demonstrates how to add a reinitializer
 *      for data migration during upgrades. In a real scenario, the V2 contract would
 *      have access to internal state variables, but for testing purposes we simulate
 *      the migration by reading the actual balance and trusting totalAssets() works.
 */
contract StakingVaultV2 is StakingVault {
    uint256 public constant VERSION = 3;

    /// @dev Track if V2 initialization has been called
    bool private _v2Initialized;

    /**
     * @notice Mock reinitializer for testing upgrade pattern
     * @dev In production, this would sync internal _totalManagedAssets with balanceOf.
     *      For testing, we mark it as initialized and rely on the parent contract's
     *      existing _totalManagedAssets tracking through deposits/withdrawals.
     *      Only callable by UPGRADER_ROLE to prevent unauthorized reinitialization.
     */
    function initializeV2() public reinitializer(2) onlyRole(UPGRADER_ROLE) {
        // In a real V2 with access to _totalManagedAssets (internal):
        // _totalManagedAssets = IERC20(asset()).balanceOf(address(this));
        
        // For this mock, we just mark as initialized
        // The parent's _totalManagedAssets is already being tracked correctly
        _v2Initialized = true;
    }

    /**
     * @notice Returns the contract version for monitoring/verification
     * @return Current version number
     */
    function version() external pure returns (uint256) {
        return VERSION;
    }

    /**
     * @notice Check if V2 initialization was called
     * @return Whether initializeV2 has been called
     */
    function isV2Initialized() external view returns (bool) {
        return _v2Initialized;
    }
}
