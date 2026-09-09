// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Re-export OZ TimelockController so Hardhat compiles its ABI into the artifacts.
// This contract is deployed as-is — no custom logic needed.
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

contract HastraTimelockController is TimelockController {
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(minDelay, proposers, executors, admin) {}
}
