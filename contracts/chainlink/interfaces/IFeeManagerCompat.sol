// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Common} from "@chainlink/contracts/src/v0.8/llo-feeds/libraries/Common.sol";
import {IVerifierFeeManagerCompat} from "./IVerifierFeeManagerCompat.sol";

/**
 * @title IFeeManager  
 * @notice Version-agnostic interface for Chainlink Fee Manager with extended functions
 * 
 * @dev WHY THIS EXISTS:
 * 
 * This interface extends IVerifierFeeManagerCompat with additional functions
 * that are present in the actual FeeManager contract but not in Chainlink's
 * published interface.
 * 
 * Extended Functions:
 * - i_linkAddress() - Public immutable variable, creates auto-generated getter
 * - i_nativeAddress() - Public immutable variable, creates auto-generated getter  
 * - i_rewardManager() - Public immutable variable, creates auto-generated getter
 * 
 * These getters exist in the deployed FeeManager contract but aren't in the
 * official interface. We need them to:
 * 1. Determine which token to use for fee payments (LINK vs native)
 * 2. Know which contract to approve for spending fees (RewardManager)
 * 
 * Version Compatibility:
 * - Inherits from IVerifierFeeManagerCompat (version-agnostic, see that file)
 * - No OpenZeppelin dependencies, works with any version
 * - Fully compatible with Chainlink's deployed FeeManager contracts
 */
interface IFeeManagerCompat is IVerifierFeeManagerCompat {
    /**
     * @notice Calculate the applied fee and the reward from a report
     * @param subscriber address trying to verify
     * @param report report to calculate the fee for
     * @param quoteAddress address of the quote payment token
     * @return fee, reward, totalDiscount
     */
    function getFeeAndReward(
        address subscriber,
        bytes memory report,
        address quoteAddress
    ) external returns (Common.Asset memory, Common.Asset memory, uint256);

    /**
     * @notice Sets the native surcharge
     * @param surcharge surcharge to be paid if paying in native
     */
    function setNativeSurcharge(uint64 surcharge) external;

    /**
     * @notice Adds a subscriber discount
     * @param subscriber address of the subscriber
     * @param feedId feed id to apply the discount to
     * @param token token to apply the discount to
     * @param discount discount to be applied to the fee
     */
    function updateSubscriberDiscount(
        address subscriber,
        bytes32 feedId,
        address token,
        uint64 discount
    ) external;

    /**
     * @notice Withdraws any native or LINK rewards
     * @param assetAddress address of the asset to withdraw
     * @param recipientAddress address to withdraw to
     * @param quantity quantity to withdraw
     */
    function withdraw(
        address assetAddress,
        address recipientAddress,
        uint192 quantity
    ) external;

    /**
     * @notice Returns the link balance of the fee manager
     * @return link balance of the fee manager
     */
    function linkAvailableForPayment() external returns (uint256);

    /**
     * @notice Admin function to pay the LINK deficit
     * @param configDigest the config digest to pay the deficit for
     */
    function payLinkDeficit(bytes32 configDigest) external;
    
    /**
     * @notice Get the LINK token address
     * @return Address of the LINK token contract
     */
    function i_linkAddress() external view returns (address);

    /**
     * @notice Get the native token address
     * @return Address representing native token
     */
    function i_nativeAddress() external view returns (address);

    /**
     * @notice Get the reward manager address
     * @return Address of the reward manager contract
     */
    function i_rewardManager() external view returns (address);
}
