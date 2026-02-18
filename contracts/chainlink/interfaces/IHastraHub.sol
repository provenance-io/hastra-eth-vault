// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IHastraHub
 * @notice Interface for the Hastra NAV Hub contract
 * @dev This interface allows vault contracts to query the current exchange rate
 */
interface IHastraHub {
    /**
     * @notice Get the current exchange rate (NAV)
     * @return The current exchange rate with 18 decimals precision
     */
    function getExchangeRate() external view returns (int192);

    /**
     * @notice Get the timestamp of the last rate update
     * @return The timestamp when the rate was last updated
     */
    function getLatestTimestamp() external view returns (uint32);

    /**
     * @notice Get the feed ID being tracked
     * @return The Chainlink feed ID
     */
    function getFeedId() external view returns (bytes32);

    /**
     * @notice Check if the current rate is stale
     * @param maxAge Maximum acceptable age in seconds
     * @return true if the rate is stale (older than maxAge)
     */
    function isStale(uint256 maxAge) external view returns (bool);
}
