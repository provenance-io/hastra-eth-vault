// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IVerifierFeeManager} from "@chainlink/contracts/src/v0.8/llo-feeds/v0.3.0/interfaces/IVerifierFeeManager.sol";

/**
 * @dev Test double for Chainlink's VerifierProxy.
 *      Returns pre-configured verified report bytes from verify() / verifyBulk().
 *      Set feeManagerAddress to address(0) (default) to simulate Sepolia (no fees).
 */
contract MockVerifierProxy {
    bytes private _singleResponse;
    bytes[] private _bulkResponses;
    address public feeManagerAddress;

    function setVerifiedResponse(bytes calldata response) external {
        _singleResponse = response;
    }

    /// @dev Set per-report responses for verifyBulk. Falls back to _singleResponse if not set.
    function setBulkResponses(bytes[] calldata responses) external {
        delete _bulkResponses;
        for (uint256 i = 0; i < responses.length; i++) {
            _bulkResponses.push(responses[i]);
        }
    }

    function setFeeManager(address fm) external {
        feeManagerAddress = fm;
    }

    function verify(bytes calldata, bytes calldata) external payable returns (bytes memory) {
        return _singleResponse;
    }

    function verifyBulk(bytes[] calldata payloads, bytes calldata)
        external
        payable
        returns (bytes[] memory results)
    {
        if (_bulkResponses.length > 0) {
            return _bulkResponses;
        }
        results = new bytes[](payloads.length);
        for (uint256 i = 0; i < payloads.length; i++) {
            results[i] = _singleResponse;
        }
    }

    function s_feeManager() external view returns (IVerifierFeeManager) {
        return IVerifierFeeManager(feeManagerAddress);
    }
}
