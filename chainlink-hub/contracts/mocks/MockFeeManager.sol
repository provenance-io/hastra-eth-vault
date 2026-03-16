// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @dev Minimal FeeManager mock for FeedVerifier tests.
 *      Simulates Chainlink's FeeManager on networks where fees are active.
 */
contract MockFeeManager {
    struct Asset {
        address assetAddress;
        uint256 amount;
    }

    address public immutable linkToken;
    address public immutable rewardMgr;
    uint256 public feeAmount;

    constructor(address linkToken_, address rewardMgr_) {
        linkToken = linkToken_;
        rewardMgr = rewardMgr_;
    }

    function setFeeAmount(uint256 amount) external { feeAmount = amount; }

    function i_linkAddress()   external view returns (address) { return linkToken; }
    function i_nativeAddress() external view returns (address) { return linkToken; }
    function i_rewardManager() external view returns (address) { return rewardMgr; }

    function getFeeAndReward(address, bytes calldata, address)
        external view
        returns (Asset memory fee, Asset memory reward, uint256 discount)
    {
        fee     = Asset(linkToken, feeAmount);
        reward  = Asset(address(0), 0);
        discount = 0;
    }
}
