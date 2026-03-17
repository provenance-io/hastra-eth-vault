// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @dev Minimal FeeManager mock for FeedVerifier tests.
 *      Simulates Chainlink's FeeManager on networks where fees are active.
 *      nativeAddress_ is the wrapped-native token (e.g. WETH) used for ETH fee path.
 */
contract MockFeeManager {
    struct Asset {
        address assetAddress;
        uint256 amount;
    }

    address public immutable linkToken;
    address public immutable nativeToken;
    address public immutable rewardMgr;
    uint256 public feeAmount;

    constructor(address linkToken_, address nativeToken_, address rewardMgr_) {
        linkToken   = linkToken_;
        nativeToken = nativeToken_;
        rewardMgr   = rewardMgr_;
    }

    function setFeeAmount(uint256 amount) external { feeAmount = amount; }

    function i_linkAddress()   external view returns (address) { return linkToken; }
    function i_nativeAddress() external view returns (address) { return nativeToken; }
    function i_rewardManager() external view returns (address) { return rewardMgr; }

    function getFeeAndReward(address, bytes calldata, address feeToken)
        external view
        returns (Asset memory fee, Asset memory reward, uint256 discount)
    {
        fee     = Asset(feeToken, feeAmount);
        reward  = Asset(address(0), 0);
        discount = 0;
    }
}
