// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {HastraNavEngineV2} from "./HastraNavEngineV2.sol";

/**
 * @title HastraSMBNavEngineV2
 * @notice V2 NAV calculation engine for the SMBStakingVault (SMB token).
 *         Inherits rate-delta guard, cooldown, and pause/owner split from HastraNavEngineV2.
 * @dev Upgrades the HastraSMBNavEngine proxy — storage-compatible because both
 *      HastraSMBNavEngine and HastraSMBNavEngineV2 inherit from HastraNavEngine,
 *      and V2 uses ERC-7201 namespaced storage for its new fields.
 */
contract HastraSMBNavEngineV2 is HastraNavEngineV2 {
    function name() external pure returns (string memory) {
        return "HastraSMBNavEngineV2";
    }
}
