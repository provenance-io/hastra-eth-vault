// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "../YieldVault.sol";

/**
 * @title YieldVaultV2
 * @notice Production upgrade for YieldVault
 * @dev Version 3: Third major version (aligned with system-wide upgrade)
 */
contract YieldVaultV2 is YieldVault {
    uint256 public constant VERSION = 3;

    /**
     * @notice Returns the contract version for monitoring/verification
     * @return Current version number
     */
    function version() external pure returns (uint256) {
        return VERSION;
    }
}
