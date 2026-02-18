// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockRewardManager
 * @notice Mock Reward Manager that accepts LINK token approvals
 */
contract MockRewardManager {
    address public immutable linkToken;
    
    constructor(address linkToken_) {
        linkToken = linkToken_;
    }
    
    // Accept LINK tokens
    function processFee(address from, uint256 amount) external {
        IERC20(linkToken).transferFrom(from, address(this), amount);
    }
}
