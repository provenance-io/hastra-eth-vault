// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "../YieldVault.sol";

/**
 * @title YieldVaultV2
 * @notice Mock upgraded version of YieldVault for testing upgrade patterns
 * @dev This is a TEST-ONLY contract used to verify UUPS upgrade mechanisms work correctly.
 *      It adds a version() function to demonstrate state preservation across upgrades.
 *      For production upgrades, create a properly versioned contract with actual new features.
 */
contract YieldVaultV2 is YieldVault {
    uint256 public constant VERSION = 3;

    /**
     * @notice Returns the contract version for monitoring/verification
     * @return Current version number
     * @dev Used in tests to verify upgrade was successful
     */
    function version() external pure returns (uint256) {
        return VERSION;
    }
}
