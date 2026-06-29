// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockUSDC.sol";

interface IYieldVaultV2 {
    function completeRedeem(address user) external;
    function claimRewards(uint256 epochIndex, uint256 amount, bytes32[] calldata proof) external;
}

/**
 * @notice Mock USDC that re-enters a target vault function on transferFrom.
 * Used exclusively for reentrancy-guard branch coverage in YieldVaultV2 tests.
 */
contract MockReentrantUSDC is MockUSDC {
    address public reentrantVault;
    address public reentrantUser;
    bool public reentrantEnabled;
    bool public useClaimPath;

    // claimRewards re-entry params
    uint256 public reentrantEpoch;
    uint256 public reentrantAmount;
    bytes32[] public reentrantProof;

    function enableReentry(address vault_, address user_) external {
        reentrantVault = vault_;
        reentrantUser  = user_;
        reentrantEnabled = true;
        useClaimPath = false;
    }

    function enableClaimReentry(
        address vault_,
        uint256 epoch_,
        uint256 amount_,
        bytes32[] calldata proof_
    ) external {
        reentrantVault   = vault_;
        reentrantEpoch   = epoch_;
        reentrantAmount  = amount_;
        reentrantProof   = proof_;
        reentrantEnabled = true;
        useClaimPath     = true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (reentrantEnabled) {
            reentrantEnabled = false; // prevent infinite loop
            if (useClaimPath) {
                IYieldVaultV2(reentrantVault).claimRewards(reentrantEpoch, reentrantAmount, reentrantProof);
            } else {
                IYieldVaultV2(reentrantVault).completeRedeem(reentrantUser);
            }
        }
        return super.transferFrom(from, to, amount);
    }
}
