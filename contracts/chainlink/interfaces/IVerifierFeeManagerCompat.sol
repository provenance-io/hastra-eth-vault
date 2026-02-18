// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Common} from "@chainlink/contracts/src/v0.8/llo-feeds/libraries/Common.sol";

/**
 * @title IVerifierFeeManagerCompat
 * @notice Version-agnostic interface for Chainlink Verifier Fee Manager
 * 
 * @dev WHY WE USE THIS INSTEAD OF CHAINLINK'S OFFICIAL INTERFACE:
 * 
 * Problem:
 * - Chainlink's IVerifierFeeManager (v0.3.0/v0.5.0) imports IERC165 from OZ v4.8.3
 * - Our project uses OpenZeppelin contracts v5.4.0 for modern features
 * - Hardhat struggles with dual OpenZeppelin versions in the same compilation
 * 
 * Solution:
 * - We removed the IERC165 inheritance from this interface
 * - IERC165 is ONLY needed in the actual contract implementation, not the interface
 * - IERC165 is identical in both OZ v4.8.3 and v5.0.1 (interface hasn't changed)
 * - By removing it, this interface works with ANY OpenZeppelin version
 * 
 * Compatibility:
 * - This interface is functionally identical to Chainlink's official one
 * - The actual FeeManager contracts implement IERC165 correctly
 * - We can safely cast to this interface without any compatibility issues
 * - Maintains full compatibility with Chainlink's deployed contracts
 * 
 * Benefits:
 * - Single OpenZeppelin version (v5.4.0) throughout our codebase
 * - No complex Hardhat/Foundry remapping configuration needed
 * - Cleaner dependency tree and smaller bundle size
 * - Still using official Chainlink contracts, just with our own interface wrapper
 */
interface IVerifierFeeManagerCompat {
    /**
     * @notice Handles fees for a report from the subscriber and manages rewards
     * @param payload report to process the fee for
     * @param parameterPayload fee payload
     * @param subscriber address of the fee will be applied
     */
    function processFee(
        bytes calldata payload,
        bytes calldata parameterPayload,
        address subscriber
    ) external payable;

    /**
     * @notice Processes the fees for each report in the payload
     * @param payloads reports to process
     * @param parameterPayload fee payload
     * @param subscriber address of the user to process fee for
     */
    function processFeeBulk(
        bytes[] calldata payloads,
        bytes calldata parameterPayload,
        address subscriber
    ) external payable;

    /**
     * @notice Sets the fee recipients according to the fee manager
     * @param configDigest digest of the configuration
     * @param rewardRecipientAndWeights the address and weights of all recipients
     */
    function setFeeRecipients(
        bytes32 configDigest,
        Common.AddressAndWeight[] calldata rewardRecipientAndWeights
    ) external;
}
