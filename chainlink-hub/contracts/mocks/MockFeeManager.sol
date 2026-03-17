// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @dev Minimal FeeManager mock for FeedVerifier tests.
 *      Simulates Chainlink's FeeManager on networks where fees are active.
 *      nativeToken is the wrapped-native token (e.g. WETH) used for the ETH fee path.
 */
contract MockFeeManager {
    struct Asset {
        address assetAddress;
        uint256 amount;
    }

    address public immutable nativeToken;
    uint256 public feeAmount;

    constructor(address nativeToken_) {
        nativeToken = nativeToken_;
    }

    function setFeeAmount(uint256 amount) external { feeAmount = amount; }

    function i_nativeAddress() external view returns (address) { return nativeToken; }

    function getFeeAndReward(address, bytes calldata, address feeToken)
        external view
        returns (Asset memory fee, Asset memory reward, uint256 discount)
    {
        fee     = Asset(feeToken, feeAmount);
        reward  = Asset(address(0), 0);
        discount = 0;
    }
}
