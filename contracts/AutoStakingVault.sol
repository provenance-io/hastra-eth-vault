// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "./StakingVault.sol";

/**
 * @title AutoStakingVault
 * @author Hastra
 * @notice Branded StakingVault deployment. Inherits StakingVault wholesale —
 *         identical logic, storage layout, roles, and reward semantics. The only
 *         differences from a PRIME StakingVault are the deployed proxy address
 *         and the ERC20 name/symbol chosen at initialize() time.
 *
 *         Useful for shipping additional staking vault instances against the same
 *         wYLDS collateral (e.g. AUTO, SMB) without forking implementation code.
 *
 *         A NAV oracle MUST be configured via setNavOracle() before any deposit /
 *         redeem / convert operation succeeds — same behavior as StakingVault.
 */
contract AutoStakingVault is StakingVault {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
}
