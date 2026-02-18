// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IFeeManagerCompat} from "../chainlink/interfaces/IFeeManagerCompat.sol";
import {Common} from "@chainlink/contracts/src/v0.8/llo-feeds/libraries/Common.sol";

/**
 * @title MockFeeManager
 * @notice Mock Chainlink Fee Manager for testing
 */
contract MockFeeManager is IFeeManagerCompat {
    address public immutable linkToken;
    address public immutable nativeToken;
    address public immutable rewardManager;
    
    uint256 public feeAmount;
    
    constructor(
        address linkToken_,
        address nativeToken_,
        address rewardManager_,
        uint256 feeAmount_
    ) {
        linkToken = linkToken_;
        nativeToken = nativeToken_;
        rewardManager = rewardManager_;
        feeAmount = feeAmount_;
    }
    
    function getFeeAndReward(
        address /* subscriber */,
        bytes memory /* report */,
        address quoteAddress
    ) external view override returns (
        Common.Asset memory fee,
        Common.Asset memory reward,
        uint256 totalDiscount
    ) {
        fee = Common.Asset({
            assetAddress: quoteAddress,
            amount: feeAmount
        });
        reward = Common.Asset({
            assetAddress: address(0),
            amount: 0
        });
        totalDiscount = 0;
    }
    
    function i_linkAddress() external view override returns (address) {
        return linkToken;
    }
    
    function i_nativeAddress() external view override returns (address) {
        return nativeToken;
    }
    
    function i_rewardManager() external view override returns (address) {
        return rewardManager;
    }
    
    // IVerifierFeeManager functions (minimal implementation)
    function processFee(
        bytes calldata /* payload */,
        bytes calldata /* parameterPayload */,
        address /* subscriber */
    ) external payable override {}
    
    function processFeeBulk(
        bytes[] calldata /* payloads */,
        bytes calldata /* parameterPayload */,
        address /* subscriber */
    ) external payable override {}
    
    function setFeeRecipients(
        bytes32 /* configDigest */,
        Common.AddressAndWeight[] calldata /* rewardRecipientAndWeights */
    ) external override {}
    
    // IFeeManager additional functions (minimal implementation)
    function setNativeSurcharge(uint64 /* surcharge */) external override {}
    
    function updateSubscriberDiscount(
        address /* subscriber */,
        bytes32 /* feedId */,
        address /* token */,
        uint64 /* discount */
    ) external override {}
    
    function withdraw(
        address /* assetAddress */,
        address /* recipientAddress */,
        uint192 /* quantity */
    ) external override {}
    
    function linkAvailableForPayment() external pure override returns (uint256) {
        return 0;
    }
    
    function payLinkDeficit(bytes32 /* configDigest */) external override {}
    
    // Test helper
    function setFeeAmount(uint256 feeAmount_) external {
        feeAmount = feeAmount_;
    }
}
