// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {HastraNavEngine} from "./HastraNavEngine.sol";

/**
 * @title HastraFlexNavEngine
 * @notice NAV calculation engine for the FLEX token vault.
 * @dev Identical logic to HastraNavEngine — separate deployment so the
 *      FLEX vault has its own independent NAV oracle and can be updated
 *      independently of other vaults.
 */
contract HastraFlexNavEngine is HastraNavEngine {
    function name() external pure returns (string memory) {
        return "HastraFlexNavEngine";
    }
}
