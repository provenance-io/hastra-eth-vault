// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../chainlink/HastraNavEngine.sol";

/**
 * @title HastraNavEngineV2
 * @notice Mock upgraded version for testing upgrade patterns
 * @dev TEST-ONLY contract demonstrating UUPS upgrade with a new version() method.
 */
contract HastraNavEngineV2 is HastraNavEngine {
    uint256 public constant VERSION = 3;

    function version() external pure returns (uint256) {
        return VERSION;
    }
}
