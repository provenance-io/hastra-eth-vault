// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {HastraNavEngineV2} from "./HastraNavEngineV2.sol";

/**
 * @title HastraAutoNavEngineV2
 * @notice V2 NAV engine for the AutoStakingVault (wAUTO token).
 *         Inherits rate-delta guard, cooldown, and pause/owner split from HastraNavEngineV2.
 * @dev Upgrades the HastraAutoNavEngine proxy — storage-compatible because both
 *      HastraAutoNavEngine and HastraAutoNavEngineV2 inherit from HastraNavEngine,
 *      and V2 uses ERC-7201 namespaced storage for its new fields.
 */
contract HastraAutoNavEngineV2 is HastraNavEngineV2 {
    function name() external pure returns (string memory) {
        return "HastraAutoNavEngineV2";
    }
}
