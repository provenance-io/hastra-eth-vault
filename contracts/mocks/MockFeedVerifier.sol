// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @notice Mock FeedVerifier for testing NAV oracle integration.
 * Allows setting price and timestamp per feedId to simulate various oracle states.
 */
contract MockFeedVerifier {
    mapping(bytes32 => int192) private _price;
    mapping(bytes32 => uint32) private _timestamp;

    function setPrice(bytes32 feedId, int192 price, uint32 timestamp) external {
        _price[feedId] = price;
        _timestamp[feedId] = timestamp;
    }

    function priceOf(bytes32 feedId) external view returns (int192) {
        return _price[feedId];
    }

    function timestampOf(bytes32 feedId) external view returns (uint32) {
        return _timestamp[feedId];
    }
}
