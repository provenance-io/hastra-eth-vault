// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title MockUSDC
 * @notice Mock USDC token for testing
 * @dev 6 decimals like real USDC
 */
contract MockUSDC is ERC20, ERC20Permit {
    uint8 private constant DECIMALS = 6;
    
    constructor() ERC20("Mock USDC", "USDC") ERC20Permit("Mock USDC") {}
    
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }
    
    /**
     * @notice Mint tokens for testing
     * @param to Address to mint to
     * @param amount Amount to mint (in USDC units, not wei)
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    
    /**
     * @notice Faucet function for easy testing
     * @dev Mints 10,000 USDC to caller
     */
    function faucet() external {
        _mint(msg.sender, 10_000 * 10**DECIMALS);
    }
}
