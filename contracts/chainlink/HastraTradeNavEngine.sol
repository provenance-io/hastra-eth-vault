// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {HastraNavEngine} from "./HastraNavEngine.sol";

/**
 * @title HastraTradeNavEngine
 * @notice NAV calculation engine for the TRADE token vault.
 * @dev Identical logic to HastraNavEngine — separate deployment so the
 *      TRADE vault has its own independent NAV oracle and can be updated
 *      independently of other vaults.
 */
contract HastraTradeNavEngine is HastraNavEngine {
    function name() external pure returns (string memory) {
        return "HastraTradeNavEngine";
    }
}
