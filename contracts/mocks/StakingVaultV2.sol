// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "../StakingVault.sol";

/**
 * @title StakingVaultV2
 * @notice Mock upgrade to test storage layout and logic preservation
 */
contract StakingVaultV2 is StakingVault {
    // New state variable (must be appended to avoid storage collision if not using storage gaps)
    // However, StakingVault inherits from Upgradeable contracts which use gaps.
    // We should be careful. Since StakingVault is the leaf, we can append here.
    
    uint256 public constant VERSION = 2;

    function version() external pure returns (uint256) {
        return VERSION;
    }
    
    // Example of adding functionality
    function echo(string memory msg_) external pure returns (string memory) {
        return msg_;
    }
}
