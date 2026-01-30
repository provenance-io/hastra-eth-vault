// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "../YieldVault.sol";

contract YieldVaultV2 is YieldVault {
    function version() external pure returns (string memory) {
        return "V2";
    }
}
