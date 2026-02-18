// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IVerifierProxyCompat} from "../chainlink/interfaces/IVerifierProxyCompat.sol";
import {IVerifierFeeManagerCompat} from "../chainlink/interfaces/IVerifierFeeManagerCompat.sol";
import {Common} from "@chainlink/contracts/src/v0.8/llo-feeds/libraries/Common.sol";
import {AccessControllerInterface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AccessControllerInterface.sol";

/**
 * @title MockVerifierProxy
 * @notice Mock Chainlink Verifier Proxy for testing
 */
contract MockVerifierProxy is IVerifierProxyCompat {
    IVerifierFeeManagerCompat private _feeManager;
    bool public shouldRevert;
    bytes public lastVerifiedReport;
    
    constructor(address feeManager_) {
        _feeManager = IVerifierFeeManagerCompat(feeManager_);
    }
    
    function verify(
        bytes calldata payload,
        bytes calldata /* parameterPayload */
    ) external payable override returns (bytes memory verifierResponse) {
        require(!shouldRevert, "MockVerifierProxy: verification failed");
        
        // Decode the unverified report to extract report data
        (, bytes memory reportData) = abi.decode(payload, (bytes32[3], bytes));
        
        lastVerifiedReport = reportData;
        
        // Return the report data (it's already in the correct format)
        return reportData;
    }
    
    function verifyBulk(
        bytes[] calldata /* payloads */,
        bytes calldata /* parameterPayload */
    ) external payable override returns (bytes[] memory verifiedReports) {
        revert("Not implemented");
    }
    
    function s_feeManager() external view override returns (IVerifierFeeManagerCompat) {
        return _feeManager;
    }
    
    // Additional admin functions from IVerifierProxy
    function initializeVerifier(address /* verifierAddress */) external override {}
    
    function setVerifier(
        bytes32 /* currentConfigDigest */,
        bytes32 /* newConfigDigest */,
        Common.AddressAndWeight[] memory /* addressesAndWeights */
    ) external override {}
    
    function unsetVerifier(bytes32 /* configDigest */) external override {}
    
    function getVerifier(bytes32 /* configDigest */) external pure override returns (address) {
        return address(0);
    }
    
    function setAccessController(AccessControllerInterface /* accessController */) external override {}
    
    function setFeeManager(IVerifierFeeManagerCompat feeManager_) external override {
        _feeManager = feeManager_;
    }
    
    // Test helpers
    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }
}
