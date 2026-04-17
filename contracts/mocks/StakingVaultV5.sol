// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "../StakingVault.sol";

/**
 * @title StakingVaultV5
 * @notice Upgrades StakingVault to:
 *         1. Rename token to "Hastra PRIME" / "PRIME" (Solana SPL parity)
 *         2. Add EIP-7572 contractURI() for token aggregator metadata
 *         Uses reinitializer(5) — one-shot rename, permanent admin-updatable URI setter.
 */
contract StakingVaultV5 is StakingVault {
    /// @dev EIP-7572: emitted when contractURI changes so aggregators re-fetch
    event ContractURIUpdated();

    string private _contractURIValue;

    function initializeV5() public reinitializer(5) {
        __ERC20_init("Hastra PRIME", "PRIME");
        __ERC20Permit_init("Hastra PRIME");
        _contractURIValue = 'data:application/json;utf8,{"name":"Hastra PRIME","symbol":"PRIME","description":"Liquid staking token representing participation in Democratized Prime","image":"https://storage.googleapis.com/hastra-cdn-prod/spl/primetoken.png","external_link":"https://hastra.io"}';
    }

    /// @notice EIP-7572 contract-level metadata URI
    function contractURI() external view returns (string memory) {
        return _contractURIValue;
    }

    /// @notice Update contractURI without a contract upgrade (admin only)
    function setContractURI(string calldata uri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _contractURIValue = uri;
        emit ContractURIUpdated();
    }
}
