// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Interface for Tempo's native TIP-20 token precompile.
/// @dev mint/burn are gated by ISSUER_ROLE on the TIP-20 token itself — the caller
///      (e.g. this vault) must hold that role on the token for these calls to succeed.
///      burn() is a privileged admin burn: it does not require an allowance from `from`.
interface ITIP20 is IERC20 {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}
