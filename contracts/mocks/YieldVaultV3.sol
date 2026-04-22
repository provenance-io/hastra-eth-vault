// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "../YieldVault.sol";

/**
 * @title YieldVaultV3
 * @notice Upgrades YieldVault to:
 *         1. Rename token to "Hastra wYLDS" / "wYLDS" (Solana SPL parity)
 *         2. Add EIP-7572 contractURI() for token aggregator metadata
 *         Uses reinitializer(2) — one-shot rename, permanent admin-updatable URI setter.
 */
contract YieldVaultV3 is YieldVault {
    /// @dev EIP-7572: emitted when contractURI changes so aggregators re-fetch
    event ContractURIUpdated();

    string private _contractURIValue;

    function initializeV2() public reinitializer(2) {
        __ERC20_init("Hastra wYLDS", "wYLDS");
        __ERC20Permit_init("Hastra wYLDS");
        _contractURIValue = 'data:application/json;utf8,{"name":"Hastra wYLDS","symbol":"wYLDS","description":"Wrapped yield-bearing token backed by YLDS","image":"https://storage.googleapis.com/hastra-cdn-prod/spl/wyldstoken.png","external_link":"https://hastra.io"}';
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
