// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "./StakingVault.sol";

/**
 * @title SMBStakingVault
 * @author Hastra
 * @notice Branded StakingVault deployment that issues the SMB token. Inherits
 *         StakingVault wholesale — identical logic, storage layout, roles, and
 *         reward semantics. Differs from a PRIME StakingVault only in deployed
 *         proxy address and the ERC20 name/symbol chosen at initialize() time.
 *
 *         Maintained as a distinct contract (rather than reusing AutoStakingVault)
 *         so block explorers, source-verified deployments, and audit trails
 *         show "SMBStakingVault" rather than "AutoStakingVault" for any SMB
 *         instance.
 *
 *         A NAV oracle MUST be configured via setNavOracle() before any deposit
 *         / redeem / convert operation succeeds — same behavior as StakingVault.
 */
contract SMBStakingVault is StakingVault {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
}
