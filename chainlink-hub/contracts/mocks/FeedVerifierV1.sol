// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../FeedVerifier.sol";

/**
 * @title FeedVerifierV1
 * @notice Simulates the original V1 deployment (3-param initialize, no feedId) for upgrade path testing.
 * @dev    Test-only. Do NOT deploy to production.
 *         After upgrading a V1 proxy to the current FeedVerifier impl, call setAllowedFeedId()
 *         — no reinitializer is needed.
 */
contract FeedVerifierV1 is FeedVerifier {
    /// @notice Old V1 initialize — no feedId parameter.
    function initialize(address admin_, address updater_, address verifierProxy_) external initializer {
        _initializeCore(admin_, updater_, verifierProxy_);
    }
}
