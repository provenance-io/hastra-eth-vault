// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Version-agnostic Chainlink interfaces (see interface files for detailed explanation)
// TL;DR: Chainlink's official interfaces use OZ v4.8.3, we use v5.0.1
// Our interfaces are functionally identical but without the OZ version conflict
import {IVerifierProxyCompat} from "./interfaces/IVerifierProxyCompat.sol";
import {IFeeManagerCompat} from "./interfaces/IFeeManagerCompat.sol";
import {Common} from "@chainlink/contracts/src/v0.8/llo-feeds/libraries/Common.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title ChainlinkNavManager
 * @author Hastra
 * @notice Abstract contract providing Chainlink Data Streams integration for NAV (Net Asset Value) updates
 * @dev Implements verification of Chainlink reports using v7 schema (Redemption Rates)
 *      This contract is designed as a mixin to be inherited by vault contracts
 *      NOTE: The inheriting contract must implement Pausable for whenNotPaused to work
 */
abstract contract ChainlinkNavManager is Initializable {
    using SafeERC20 for IERC20;
    using Math for uint256;

    // ============ Constants ============

    /// @notice Precision factor for rate calculations (18 decimals)
    uint256 public constant RATE_PRECISION_FACTOR = 1e18;

    /// @notice Maximum staleness period (24 hours)
    uint256 public constant MAX_STALENESS_PERIOD = 24 hours;

    // ============ Custom Storage (ERC-7201) ============

    /// @custom:storage-location erc7201:hastra.storage.ChainlinkNavManager
    struct ChainlinkNavStorage {
        // Chainlink integration
        IVerifierProxyCompat verifierProxy;
        bytes32 feedId;
        // Access control
        address updater;
        // Rate bounds and limits
        uint256 minRate;
        uint256 maxRate;
        uint256 maxDifferencePercent;
        // Current state
        int192 currentExchangeRate;
        uint32 lastUpdateTimestamp;
        uint32 lastObservationsTimestamp;
        int192 previousExchangeRate;
    }

    // keccak256(abi.encode(uint256(keccak256("hastra.storage.ChainlinkNavManager")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant CHAINLINK_NAV_STORAGE_SLOT =
        0x985b63c4eed3be63d7f71d763b05cf9556a59419ae24b0f030c572b2d9f55800;

    // ============ Report Schema v7 (Redemption Rates) ============

    /**
     * @notice Chainlink Data Streams report schema v7 for Redemption Rates
     * @dev Reference: https://docs.chain.link/data-streams/reference/report-schema-v7
     */
    struct ReportV7 {
        bytes32 feedId;                  // Unique identifier for the Data Streams feed
        uint32 validFromTimestamp;       // Earliest timestamp when the rate is valid
        uint32 observationsTimestamp;    // Latest timestamp when the rate is valid
        uint192 nativeFee;               // Cost to verify report onchain (native token)
        uint192 linkFee;                 // Cost to verify report onchain (LINK)
        uint32 expiresAt;                // Expiration date of the report
        int192 exchangeRate;             // DON's consensus median exchange rate
    }

    // ============ Events ============

    event UpdaterSet(address indexed oldUpdater, address indexed newUpdater);
    event MinRateSet(uint256 oldMinRate, uint256 newMinRate);
    event MaxRateSet(uint256 oldMaxRate, uint256 newMaxRate);
    event MaxDifferencePercentSet(uint256 oldMaxDiff, uint256 newMaxDiff);
    event VerifierProxySet(address indexed oldProxy, address indexed newProxy);
    event FeedIdSet(bytes32 indexed oldFeedId, bytes32 indexed newFeedId);
    
    event ExchangeRateUpdated(
        int192 indexed exchangeRate,
        uint32 indexed observationsTimestamp,
        uint32 updateTimestamp
    );
    
    event AlertInvalidRate(
        int192 indexed rate,
        uint256 minRate,
        uint256 maxRate,
        uint32 timestamp
    );
    
    event AlertInvalidRateDifference(
        int192 indexed previousRate,
        int192 indexed newRate,
        uint256 differencePercent,
        uint256 maxDifferencePercent,
        uint32 timestamp
    );
    
    event AlertStaleReport(
        uint32 indexed observationsTimestamp,
        uint32 indexed currentTimestamp,
        uint256 age
    );
    
    event AlertExpiredReport(
        uint32 indexed expiresAt,
        uint32 indexed currentTimestamp
    );
    
    event AlertInvalidFeedId(
        bytes32 indexed reportFeedId,
        bytes32 indexed expectedFeedId
    );

    // ============ Errors ============

    error NotUpdater();
    error InvalidReportVersion(uint16 version);
    error InvalidUpdater();
    error InvalidMinRate();
    error InvalidMaxRate();
    error InvalidMaxDifferencePercent();
    error InvalidVerifierProxy();
    error InvalidFeedId();
    error MinRateExceedsMaxRate();
    error MaxRateBelowMinRate();

    // ============ Modifiers ============

    /**
     * @notice Restricts function access to the designated updater (bot)
     */
    modifier onlyUpdater() {
        ChainlinkNavStorage storage $ = _getChainlinkNavStorage();
        if (msg.sender != $.updater) revert NotUpdater();
        _;
    }

    /**
     * @notice Check if the contract is paused
     * @dev Must be overridden by the inheriting contract
     * @return true if paused, false otherwise
     */
    function _isPaused() internal view virtual returns (bool);

    // ============ Initialization ============

    /**
     * @notice Initialize the Chainlink NAV Manager (empty by default)
     * @dev This can be called by inheriting contracts to satisfy upgrade safety checks
     * The actual initialization happens via __ChainlinkNavManager_init_unchained
     */
    function __ChainlinkNavManager_init() internal onlyInitializing {
        // Empty initializer to satisfy upgrade safety checks
        // Actual initialization done via __ChainlinkNavManager_init_unchained or reinitializer
    }

    /**
     * @notice Initialize the Chainlink NAV Manager with parameters
     * @param verifierProxy_ Address of the Chainlink Verifier Proxy
     * @param feedId_ The Chainlink feed ID to track
     * @param updater_ Address authorized to submit reports (bot)
     * @param minRate_ Minimum acceptable exchange rate (18 decimals)
     * @param maxRate_ Maximum acceptable exchange rate (18 decimals)
     * @param maxDifferencePercent_ Maximum rate change per update (18 decimals)
     */
    function __ChainlinkNavManager_init_with_params(
        address verifierProxy_,
        bytes32 feedId_,
        address updater_,
        uint256 minRate_,
        uint256 maxRate_,
        uint256 maxDifferencePercent_
    ) internal onlyInitializing {
        __ChainlinkNavManager_init_unchained(
            verifierProxy_,
            feedId_,
            updater_,
            minRate_,
            maxRate_,
            maxDifferencePercent_
        );
    }

    function __ChainlinkNavManager_init_unchained(
        address verifierProxy_,
        bytes32 feedId_,
        address updater_,
        uint256 minRate_,
        uint256 maxRate_,
        uint256 maxDifferencePercent_
    ) internal onlyInitializing {
        _setVerifierProxy(verifierProxy_);
        _setFeedId(feedId_);
        _setUpdater(updater_);
        _setMinRate(minRate_);
        _setMaxRate(maxRate_);
        _setMaxDifferencePercent(maxDifferencePercent_);
    }

    // ============ Core Functions ============

    /**
     * @notice Update the exchange rate by verifying a Chainlink Data Streams report
     * @param unverifiedReport The full report payload from Chainlink Data Streams
     * @return The updated exchange rate
     * @dev This function:
     *      1. Decodes and validates the report
     *      2. Handles fee payment (LINK or native token)
     *      3. Verifies the report via Chainlink Verifier Proxy
     *      4. Extracts and validates the exchange rate
     *      5. Updates state if all checks pass
     */
    function updateExchangeRate(bytes memory unverifiedReport)
        external
        onlyUpdater
        returns (int192)
    {
        require(!_isPaused(), "Pausable: paused");
        ChainlinkNavStorage storage $ = _getChainlinkNavStorage();

        // Step 1: Extract report data and validate schema version
        (, bytes memory reportData) = abi.decode(unverifiedReport, (bytes32[3], bytes));
        
        uint16 reportVersion = (uint16(uint8(reportData[0])) << 8) | uint16(uint8(reportData[1]));
        if (reportVersion != 7) {
            revert InvalidReportVersion(reportVersion);
        }

        // Step 2: Handle fee payment
        bytes memory parameterPayload = _handleFeePayment($, reportData);

        // Step 3: Verify the report
        bytes memory verifiedReportData = $.verifierProxy.verify(
            unverifiedReport,
            parameterPayload
        );

        // Step 4: Decode and validate the verified report
        ReportV7 memory report = abi.decode(verifiedReportData, (ReportV7));
        
        bool isValid = _validateReport($, report);
        
        // Step 5: Update state if valid, otherwise return current rate
        if (isValid) {
            $.previousExchangeRate = $.currentExchangeRate;
            $.currentExchangeRate = report.exchangeRate;
            $.lastObservationsTimestamp = report.observationsTimestamp;
            $.lastUpdateTimestamp = uint32(block.timestamp);

            emit ExchangeRateUpdated(
                report.exchangeRate,
                report.observationsTimestamp,
                uint32(block.timestamp)
            );
        }

        return $.currentExchangeRate;
    }

    // ============ Internal Functions ============

    /**
     * @notice Handle fee payment for report verification
     * @dev Automatically detects if FeeManager exists and handles payment accordingly
     * @param $ Storage reference
     * @param reportData The report data to quote fees for
     * @return parameterPayload Encoded fee token address or empty bytes
     */
    function _handleFeePayment(
        ChainlinkNavStorage storage $,
        bytes memory reportData
    ) internal returns (bytes memory parameterPayload) {
        IFeeManagerCompat feeManager = IFeeManagerCompat(
            address($.verifierProxy.s_feeManager())
        );

        // If no FeeManager exists, no fees are required
        if (address(feeManager) == address(0)) {
            return bytes("");
        }

        // FeeManager exists - quote and approve fees
        address feeTokenAddress = feeManager.i_linkAddress();
        
        (Common.Asset memory fee, , ) = feeManager.getFeeAndReward(
            address(this),
            reportData,
            feeTokenAddress
        );

        // Approve the RewardManager to spend the fee
        IERC20(feeTokenAddress).approve(
            feeManager.i_rewardManager(),
            fee.amount
        );

        return abi.encode(feeTokenAddress);
    }

    /**
     * @notice Validate the Chainlink report against all safety checks
     * @param $ Storage reference
     * @param report The decoded v7 report
     * @return true if valid, false if any check fails (alerts emitted)
     */
    function _validateReport(
        ChainlinkNavStorage storage $,
        ReportV7 memory report
    ) internal returns (bool) {
        uint32 currentTime = uint32(block.timestamp);

        // Check 1: Feed ID must match
        if (report.feedId != $.feedId) {
            emit AlertInvalidFeedId(report.feedId, $.feedId);
            return false;
        }

        // Check 2: Report must not be expired
        if (report.expiresAt <= currentTime) {
            emit AlertExpiredReport(report.expiresAt, currentTime);
            return false;
        }

        // Check 3: Report must not be stale
        uint256 reportAge = currentTime - report.observationsTimestamp;
        if (reportAge > MAX_STALENESS_PERIOD) {
            emit AlertStaleReport(
                report.observationsTimestamp,
                currentTime,
                reportAge
            );
            return false;
        }

        // Check 4: Rate must be within bounds
        uint256 rate = uint256(int256(report.exchangeRate));
        if (rate < $.minRate || rate > $.maxRate) {
            emit AlertInvalidRate(
                report.exchangeRate,
                $.minRate,
                $.maxRate,
                currentTime
            );
            return false;
        }

        // Check 5: Rate change must not exceed max difference (if not first update)
        if ($.currentExchangeRate != 0) {
            uint256 difference;
            int192 oldRate = $.currentExchangeRate;
            int192 newRate = report.exchangeRate;

            if (oldRate > newRate) {
                difference = Math.mulDiv(
                    uint256(int256(oldRate - newRate)),
                    RATE_PRECISION_FACTOR,
                    uint256(int256(oldRate))
                );
            } else {
                difference = Math.mulDiv(
                    uint256(int256(newRate - oldRate)),
                    RATE_PRECISION_FACTOR,
                    uint256(int256(newRate))
                );
            }

            if (difference > $.maxDifferencePercent) {
                emit AlertInvalidRateDifference(
                    oldRate,
                    newRate,
                    difference,
                    $.maxDifferencePercent,
                    currentTime
                );
                return false;
            }
        }

        return true;
    }

    // ============ View Functions ============

    /**
     * @notice Get the current exchange rate (NAV)
     * @return The current exchange rate with 18 decimals precision
     */
    function getExchangeRate() public view returns (int192) {
        ChainlinkNavStorage storage $ = _getChainlinkNavStorage();
        return $.currentExchangeRate;
    }

    /**
     * @notice Get the timestamp of the last rate update
     * @return The timestamp when the rate was last updated
     */
    function getLastUpdateTimestamp() public view returns (uint32) {
        ChainlinkNavStorage storage $ = _getChainlinkNavStorage();
        return $.lastUpdateTimestamp;
    }

    /**
     * @notice Get the observations timestamp from the last report
     * @return The observations timestamp from Chainlink
     */
    function getLastObservationsTimestamp() public view returns (uint32) {
        ChainlinkNavStorage storage $ = _getChainlinkNavStorage();
        return $.lastObservationsTimestamp;
    }

    /**
     * @notice Get the feed ID being tracked
     * @return The Chainlink feed ID
     */
    function getFeedId() public view returns (bytes32) {
        ChainlinkNavStorage storage $ = _getChainlinkNavStorage();
        return $.feedId;
    }

    /**
     * @notice Get the verifier proxy address
     * @return The Chainlink Verifier Proxy address
     */
    function getVerifierProxy() public view returns (address) {
        ChainlinkNavStorage storage $ = _getChainlinkNavStorage();
        return address($.verifierProxy);
    }

    /**
     * @notice Get the updater address
     * @return The address authorized to submit reports
     */
    function getUpdater() public view returns (address) {
        ChainlinkNavStorage storage $ = _getChainlinkNavStorage();
        return $.updater;
    }

    /**
     * @notice Get the minimum acceptable rate
     * @return The minimum rate threshold
     */
    function getMinRate() public view returns (uint256) {
        ChainlinkNavStorage storage $ = _getChainlinkNavStorage();
        return $.minRate;
    }

    /**
     * @notice Get the maximum acceptable rate
     * @return The maximum rate threshold
     */
    function getMaxRate() public view returns (uint256) {
        ChainlinkNavStorage storage $ = _getChainlinkNavStorage();
        return $.maxRate;
    }

    /**
     * @notice Get the maximum rate change percentage
     * @return The maximum difference percent
     */
    function getMaxDifferencePercent() public view returns (uint256) {
        ChainlinkNavStorage storage $ = _getChainlinkNavStorage();
        return $.maxDifferencePercent;
    }

    /**
     * @notice Check if the current rate is stale
     * @param maxAge Maximum acceptable age in seconds
     * @return true if the rate is stale (older than maxAge)
     */
    function isStale(uint256 maxAge) public view returns (bool) {
        ChainlinkNavStorage storage $ = _getChainlinkNavStorage();
        if ($.lastUpdateTimestamp == 0) return true;
        return (block.timestamp - $.lastUpdateTimestamp) > maxAge;
    }

    // ============ Admin Functions ============
    // These should be protected by access control in the inheriting contract

    /**
     * @notice Set the updater address
     * @param updater_ New updater address
     */
    function _setUpdater(address updater_) internal {
        if (updater_ == address(0)) revert InvalidUpdater();
        ChainlinkNavStorage storage $ = _getChainlinkNavStorage();
        address oldUpdater = $.updater;
        $.updater = updater_;
        emit UpdaterSet(oldUpdater, updater_);
    }

    /**
     * @notice Set the minimum rate
     * @param minRate_ New minimum rate
     */
    function _setMinRate(uint256 minRate_) internal {
        if (minRate_ == 0) revert InvalidMinRate();
        ChainlinkNavStorage storage $ = _getChainlinkNavStorage();
        if ($.maxRate != 0 && minRate_ > $.maxRate) revert MinRateExceedsMaxRate();
        uint256 oldMinRate = $.minRate;
        $.minRate = minRate_;
        emit MinRateSet(oldMinRate, minRate_);
    }

    /**
     * @notice Set the maximum rate
     * @param maxRate_ New maximum rate
     */
    function _setMaxRate(uint256 maxRate_) internal {
        if (maxRate_ == 0) revert InvalidMaxRate();
        ChainlinkNavStorage storage $ = _getChainlinkNavStorage();
        if ($.minRate != 0 && maxRate_ < $.minRate) revert MaxRateBelowMinRate();
        uint256 oldMaxRate = $.maxRate;
        $.maxRate = maxRate_;
        emit MaxRateSet(oldMaxRate, maxRate_);
    }

    /**
     * @notice Set the maximum difference percentage
     * @param maxDifferencePercent_ New max difference percent
     */
    function _setMaxDifferencePercent(uint256 maxDifferencePercent_) internal {
        if (maxDifferencePercent_ == 0 || maxDifferencePercent_ > RATE_PRECISION_FACTOR) {
            revert InvalidMaxDifferencePercent();
        }
        ChainlinkNavStorage storage $ = _getChainlinkNavStorage();
        uint256 oldMaxDiff = $.maxDifferencePercent;
        $.maxDifferencePercent = maxDifferencePercent_;
        emit MaxDifferencePercentSet(oldMaxDiff, maxDifferencePercent_);
    }

    /**
     * @notice Set the verifier proxy address
     * @param verifierProxy_ New verifier proxy address
     */
    function _setVerifierProxy(address verifierProxy_) internal {
        if (verifierProxy_ == address(0)) revert InvalidVerifierProxy();
        ChainlinkNavStorage storage $ = _getChainlinkNavStorage();
        address oldProxy = address($.verifierProxy);
        $.verifierProxy = IVerifierProxyCompat(verifierProxy_);
        emit VerifierProxySet(oldProxy, verifierProxy_);
    }

    /**
     * @notice Set the feed ID
     * @param feedId_ New feed ID
     */
    function _setFeedId(bytes32 feedId_) internal {
        if (feedId_ == bytes32(0)) revert InvalidFeedId();
        ChainlinkNavStorage storage $ = _getChainlinkNavStorage();
        bytes32 oldFeedId = $.feedId;
        $.feedId = feedId_;
        emit FeedIdSet(oldFeedId, feedId_);
    }

    // ============ Storage Helper ============

    /**
     * @notice Get the Chainlink NAV storage struct
     * @return $ Storage reference using ERC-7201 pattern
     */
    function _getChainlinkNavStorage()
        private
        pure
        returns (ChainlinkNavStorage storage $)
    {
        assembly {
            $.slot := CHAINLINK_NAV_STORAGE_SLOT
        }
    }
}
