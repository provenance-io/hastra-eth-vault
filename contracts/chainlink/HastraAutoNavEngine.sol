// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {HastraNavEngine} from "./HastraNavEngine.sol";

/**
 * @title HastraAutoNavEngine
 * @notice NAV calculation engine for the AutoStakingVault (wAUTO token).
 * @dev Identical logic to HastraNavEngine — separate deployment so the
 *      AutoStakingVault has its own independent NAV oracle and the two
 *      vaults can be updated independently.
 */
contract HastraAutoNavEngine is HastraNavEngine {
    function name() external pure returns (string memory) {
        return "HastraAutoNavEngine";
    }
}
