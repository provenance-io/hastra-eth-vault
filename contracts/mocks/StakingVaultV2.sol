// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "../StakingVault.sol";

/**
 * @title StakingVaultV2
 * @notice Production upgrade with inflation attack protection
 * @dev Version tracking:
 *      - Version 1: Initial deployment with initialize()
 *      - Version 2: Migration with initializeV2() to sync _totalManagedAssets
 *      - Version 3: This contract - production version with inflation protection
 */
contract StakingVaultV2 is StakingVault {
    uint256 public constant VERSION = 3;

    /**
     * @notice Returns the contract version for monitoring/verification
     * @return Current version number
     */
    function version() external pure returns (uint256) {
        return VERSION;
    }
}
