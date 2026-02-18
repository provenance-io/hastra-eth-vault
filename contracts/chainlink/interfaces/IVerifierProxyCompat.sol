// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Common} from "@chainlink/contracts/src/v0.8/llo-feeds/libraries/Common.sol";
import {IVerifierFeeManagerCompat} from "./IVerifierFeeManagerCompat.sol";
import {AccessControllerInterface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AccessControllerInterface.sol";

/**
 * @title IVerifierProxy
 * @notice Version-agnostic interface for Chainlink Verifier Proxy
 * 
 * @dev WHY WE USE THIS INSTEAD OF CHAINLINK'S OFFICIAL INTERFACE:
 * 
 * Problem:
 * - Chainlink's IVerifierProxy imports IVerifierFeeManager
 * - IVerifierFeeManager imports OZ v4.8.3
 * - Our project uses OZ v5.4.0
 * - This creates a dual-version dependency conflict in Hardhat
 * 
 * Solution:
 * - Use our version-agnostic IVerifierFeeManagerCompat instead
 * - This interface is identical to Chainlink's but without OZ dependencies
 * - Also adds s_feeManager() getter (public state variable in actual contract)
 * 
 * Extended Functions:
 * - s_feeManager() - Public state variable, creates auto-generated getter
 *   This exists in the deployed VerifierProxy contract but not in the official
 *   interface. We need it to:
 *   1. Check if a FeeManager is configured (address(0) means no fees)
 *   2. Access the FeeManager to quote and pay verification fees
 * 
 * Compatibility:
 * - Fully compatible with Chainlink's deployed VerifierProxy contracts
 * - All function signatures match the official interface exactly
 * - No behavioral differences, just removes OZ version dependency
 * - Can safely cast any VerifierProxy address to this interface
 * 
 * Benefits:
 * - Single OpenZeppelin version throughout our project (v5.0.1)
 * - No Hardhat compilation conflicts
 * - Cleaner dependency management
 * - Still interacting with official Chainlink contracts, just using our wrapper
 */
interface IVerifierProxyCompat {
    /**
     * @notice Verifies that the data encoded has been signed correctly
     * @param payload The encoded data to be verified, including the signed report
     * @param parameterPayload fee metadata for billing
     * @return verifierResponse The encoded report from the verifier
     */
    function verify(
        bytes calldata payload,
        bytes calldata parameterPayload
    ) external payable returns (bytes memory verifierResponse);

    /**
     * @notice Bulk verifies that the data encoded has been signed correctly
     * @param payloads The encoded payloads to be verified
     * @param parameterPayload fee metadata for billing
     * @return verifiedReports The encoded reports from the verifier
     */
    function verifyBulk(
        bytes[] calldata payloads,
        bytes calldata parameterPayload
    ) external payable returns (bytes[] memory verifiedReports);

    /**
     * @notice Sets the verifier address initially
     * @param verifierAddress The address of the verifier contract to initialize
     */
    function initializeVerifier(address verifierAddress) external;

    /**
     * @notice Sets a new verifier for a config digest
     * @param currentConfigDigest The current config digest
     * @param newConfigDigest The config digest to set
     * @param addressesAndWeights The addresses and weights of reward recipients
     */
    function setVerifier(
        bytes32 currentConfigDigest,
        bytes32 newConfigDigest,
        Common.AddressAndWeight[] memory addressesAndWeights
    ) external;

    /**
     * @notice Removes a verifier for a given config digest
     * @param configDigest The config digest of the verifier to remove
     */
    function unsetVerifier(bytes32 configDigest) external;

    /**
     * @notice Retrieves the verifier address that verifies reports
     * @param configDigest The config digest to query for
     * @return verifierAddress The address of the verifier contract
     */
    function getVerifier(bytes32 configDigest)
        external
        view
        returns (address verifierAddress);

    /**
     * @notice Called by the admin to set an access controller contract
     * @param accessController The new access controller to set
     */
    function setAccessController(AccessControllerInterface accessController)
        external;

    /**
     * @notice Updates the fee manager
     * @param feeManager The new fee manager
     */
    function setFeeManager(IVerifierFeeManagerCompat feeManager) external;

    /**
     * @notice Get the fee manager contract address
     * @dev This is a public state variable in the actual VerifierProxy contract
     * @return The address of the fee manager, or address(0) if no fees required
     */
    function s_feeManager() external view returns (IVerifierFeeManagerCompat);
}
