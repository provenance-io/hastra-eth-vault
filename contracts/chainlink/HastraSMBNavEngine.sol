// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {HastraNavEngine} from "./HastraNavEngine.sol";

/**
 * @title HastraSMBNavEngine
 * @notice NAV calculation engine for the SMBStakingVault (SMB token).
 * @dev Identical logic to HastraNavEngine — separate deployment so the
 *      SMBStakingVault has its own independent NAV oracle and the two
 *      vaults can be updated independently.
 */
contract HastraSMBNavEngine is HastraNavEngine {
    function name() external pure returns (string memory) {
        return "HastraSMBNavEngine";
    }
}
