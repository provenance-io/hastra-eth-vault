// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Common} from "@chainlink/contracts/src/v0.8/llo-feeds/libraries/Common.sol";
import {IVerifierFeeManager} from "@chainlink/contracts/src/v0.8/llo-feeds/v0.3.0/interfaces/IVerifierFeeManager.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

using SafeERC20 for IERC20;

// ============ Chainlink Interfaces ============

/**
 * @notice Minimal interface for Chainlink Verifier Proxy
 */
interface IVerifierProxy {
    function verify(
        bytes calldata payload,
        bytes calldata parameterPayload
    ) external payable returns (bytes memory verifierResponse);

    function s_feeManager() external view returns (IVerifierFeeManager);
}

/**
 * @notice Extended interface for Fee Manager with getters
 */
interface IFeeManager {
    function getFeeAndReward(
        address subscriber,
        bytes memory report,
        address quoteAddress
    ) external returns (Common.Asset memory, Common.Asset memory, uint256);

    function i_linkAddress() external view returns (address);
    function i_nativeAddress() external view returns (address);
    function i_rewardManager() external view returns (address);
}

// ============ Main Contract ============

/**
 * @title HastraHub
 * @notice Chainlink Data Streams NAV (Net Asset Value) Hub for Hastra Vaults
 * @dev Verifies Chainlink Data Streams reports (Schema v7 - Redemption Rates) onchain
 *      and provides exchange rate data to vault contracts.
 *      
 *      Based on Chainlink's official ClientReportsVerifier example:
 *      https://docs.chain.link/data-streams/tutorials/evm-onchain-report-verification
 *      
 *      Key features:
 *      - UUPS upgradeable pattern
 *      - Pausable for emergencies
 *      - Access control (UPDATER_ROLE for bot, ADMIN for config)
 *      - Auto-detection of FeeManager (works on any network)
 *      - Safety checks: rate bounds, staleness, change limits
 *      - Graceful degradation (emits alerts instead of reverting)
 */
contract HastraHub is 
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    // ============ Roles ============
    
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // ============ Constants ============
    
    /// @notice Precision factor for rate calculations (18 decimals)
    uint256 public constant RATE_PRECISION = 1e18;
    
    /// @notice Maximum staleness period (24 hours)
    uint256 public constant MAX_STALENESS = 24 hours;

    // ============ Report Schema v7 (Redemption Rates) ============
    
    /**
     * @notice Data Streams report schema v7 (Redemption Rates)
     * @dev Used for NAV/exchange rate data
     */
    struct ReportV7 {
        bytes32 feedId;
        uint32 validFromTimestamp;
        uint32 observationsTimestamp;
        uint192 nativeFee;
        uint192 linkFee;
        uint32 expiresAt;
        int192 exchangeRate;  // The NAV rate we need
    }

    // ============ State Variables ============
    
    /// @notice Chainlink Verifier Proxy address
    IVerifierProxy public verifierProxy;
    
    /// @notice Chainlink feed ID for this NAV stream
    bytes32 public feedId;
    
    /// @notice Minimum acceptable exchange rate (18 decimals)
    uint256 public minRate;
    
    /// @notice Maximum acceptable exchange rate (18 decimals)
    uint256 public maxRate;
    
    /// @notice Maximum percent change between updates (18 decimals, e.g., 0.1e18 = 10%)
    uint256 public maxDifferencePercent;
    
    /// @notice Current exchange rate (18 decimals)
    int192 public exchangeRate;
    
    /// @notice Previous exchange rate for change validation
    int192 public previousExchangeRate;
    
    /// @notice Timestamp of last successful update
    uint32 public lastUpdateTimestamp;
    
    /// @notice Observations timestamp from last report
    uint32 public lastObservationsTimestamp;

    // ============ Events ============
    
    event ExchangeRateUpdated(
        int192 indexed newRate,
        int192 previousRate,
        uint32 observationsTimestamp,
        uint32 updateTimestamp
    );
    
    event AlertInvalidRate(int192 rate, uint256 min, uint256 max);
    event AlertInvalidRateDifference(int192 newRate, int192 oldRate, uint256 percentChange);
    event AlertStaleReport(uint32 observationsTimestamp, uint32 currentTime);
    event AlertExpiredReport(uint32 expiresAt, uint32 currentTime);
    event AlertInvalidFeedId(bytes32 expected, bytes32 actual);
    
    event ConfigUpdated(
        bytes32 indexed feedId,
        uint256 minRate,
        uint256 maxRate,
        uint256 maxDifferencePercent
    );

    // ============ Errors ============
    
    error InvalidVerifierProxy();
    error InvalidFeedId();
    error InvalidRateBounds();
    error InvalidReportVersion(uint16 version);
    error OnlyUpdater();
    error NothingToWithdraw();

    // ============ Modifiers ============
    
    modifier onlyUpdater() {
        if (!hasRole(UPDATER_ROLE, msg.sender)) revert OnlyUpdater();
        _;
    }

    // ============ Initialization ============
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract
     * @param admin_ Admin address (gets all roles)
     * @param updater_ Bot address that submits reports
     * @param verifierProxy_ Chainlink Verifier Proxy address
     * @param feedId_ Chainlink feed ID
     * @param minRate_ Minimum acceptable rate (18 decimals)
     * @param maxRate_ Maximum acceptable rate (18 decimals)
     * @param maxDiffPercent_ Max percent change between updates (18 decimals)
     */
    function initialize(
        address admin_,
        address updater_,
        address verifierProxy_,
        bytes32 feedId_,
        uint256 minRate_,
        uint256 maxRate_,
        uint256 maxDiffPercent_
    ) public initializer {
        if (verifierProxy_ == address(0)) revert InvalidVerifierProxy();
        if (feedId_ == bytes32(0)) revert InvalidFeedId();
        if (minRate_ >= maxRate_) revert InvalidRateBounds();

        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(UPDATER_ROLE, updater_);
        _grantRole(PAUSER_ROLE, admin_);
        _grantRole(UPGRADER_ROLE, admin_);

        verifierProxy = IVerifierProxy(verifierProxy_);
        feedId = feedId_;
        minRate = minRate_;
        maxRate = maxRate_;
        maxDifferencePercent = maxDiffPercent_;

        emit ConfigUpdated(feedId_, minRate_, maxRate_, maxDiffPercent_);
    }

    // ============ Core Functions ============

    /**
     * @notice Verify and update the exchange rate from a Chainlink Data Streams report
     * @dev Based on Chainlink's official example with added safety checks
     *      Flow:
     *      1. Extract and validate report schema version (must be v7)
     *      2. Auto-detect FeeManager and handle fees if required
     *      3. Verify report via Chainlink VerifierProxy
     *      4. Decode and validate the exchange rate
     *      5. Apply safety checks (bounds, staleness, change limits)
     *      6. Update state if all checks pass
     *      
     * @param unverifiedReport Full report payload from Chainlink Data Streams
     */
    function updateExchangeRate(bytes memory unverifiedReport) 
        external 
        onlyUpdater 
        whenNotPaused 
    {
        // 1. Extract report data and validate schema version
        (, bytes memory reportData) = abi.decode(unverifiedReport, (bytes32[3], bytes));
        
        uint16 reportVersion = (uint16(uint8(reportData[0])) << 8) | uint16(uint8(reportData[1]));
        if (reportVersion != 7) revert InvalidReportVersion(reportVersion);

        // 2. Handle fees (auto-detect FeeManager)
        bytes memory parameterPayload = _handleFees(reportData);

        // 3. Verify report onchain
        bytes memory verifiedReport = verifierProxy.verify(unverifiedReport, parameterPayload);

        // 4. Decode the report
        ReportV7 memory report = abi.decode(verifiedReport, (ReportV7));

        // 5. Validate report data
        if (!_validateReport(report)) {
            return; // Validation emitted alerts, don't update
        }

        // 6. Update state
        previousExchangeRate = exchangeRate;
        exchangeRate = report.exchangeRate;
        lastObservationsTimestamp = report.observationsTimestamp;
        lastUpdateTimestamp = uint32(block.timestamp);

        emit ExchangeRateUpdated(
            report.exchangeRate,
            previousExchangeRate,
            report.observationsTimestamp,
            uint32(block.timestamp)
        );
    }

    // ============ Internal Functions ============

    /**
     * @notice Handle fee payment for report verification
     * @dev Auto-detects if FeeManager exists (following Chainlink pattern)
     * @param reportData The report data to quote fees for
     * @return parameterPayload Encoded fee token address or empty bytes
     */
    function _handleFees(bytes memory reportData) internal returns (bytes memory) {
        IFeeManager feeManager = IFeeManager(address(verifierProxy.s_feeManager()));

        // If no FeeManager exists, no fees are required
        if (address(feeManager) == address(0)) {
            return bytes("");
        }

        // FeeManager exists - quote and approve fees
        address feeToken = feeManager.i_linkAddress();
        
        (Common.Asset memory fee, , ) = feeManager.getFeeAndReward(
            address(this),
            reportData,
            feeToken
        );

        // Approve the RewardManager to spend the fee
        IERC20(feeToken).approve(feeManager.i_rewardManager(), fee.amount);

        return abi.encode(feeToken);
    }

    /**
     * @notice Validate report data with safety checks
     * @dev Emits alert events instead of reverting (graceful degradation)
     * @param report The decoded report to validate
     * @return bool True if validation passed, false if any check failed
     */
    function _validateReport(ReportV7 memory report) internal returns (bool) {
        // Check feed ID matches
        if (report.feedId != feedId) {
            emit AlertInvalidFeedId(feedId, report.feedId);
            return false;
        }

        // Check rate bounds
        uint256 rate = uint256(uint192(report.exchangeRate));
        if (rate < minRate || rate > maxRate) {
            emit AlertInvalidRate(report.exchangeRate, minRate, maxRate);
            return false;
        }

        // Check staleness (observations must be recent)
        if (block.timestamp > report.observationsTimestamp + MAX_STALENESS) {
            emit AlertStaleReport(report.observationsTimestamp, uint32(block.timestamp));
            return false;
        }

        // Check expiration
        if (block.timestamp >= report.expiresAt) {
            emit AlertExpiredReport(report.expiresAt, uint32(block.timestamp));
            return false;
        }

        // Check rate change if we have a previous rate
        if (previousExchangeRate != 0) {
            uint256 change = _calculatePercentChange(previousExchangeRate, report.exchangeRate);
            if (change > maxDifferencePercent) {
                emit AlertInvalidRateDifference(report.exchangeRate, previousExchangeRate, change);
                return false;
            }
        }

        return true;
    }

    /**
     * @notice Calculate percent change between two rates
     * @param oldRate Previous rate
     * @param newRate New rate
     * @return Percent change (18 decimals)
     */
    function _calculatePercentChange(int192 oldRate, int192 newRate) internal pure returns (uint256) {
        if (oldRate == 0) return 0;
        
        uint256 diff = oldRate > newRate 
            ? uint256(uint192(oldRate - newRate))
            : uint256(uint192(newRate - oldRate));
            
        return (diff * RATE_PRECISION) / uint256(uint192(oldRate));
    }

    // ============ View Functions ============

    /**
     * @notice Get the current exchange rate
     * @dev This is the main function vaults call to get NAV
     * @return Current exchange rate (18 decimals)
     */
    function getExchangeRate() external view returns (int192) {
        return exchangeRate;
    }

    /**
     * @notice Get timestamp of last update
     * @return Timestamp of last successful update
     */
    function getLastUpdateTimestamp() external view returns (uint32) {
        return lastUpdateTimestamp;
    }

    /**
     * @notice Check if rate data is stale
     * @return True if data hasn't been updated in MAX_STALENESS period
     */
    function isStale() external view returns (bool) {
        return block.timestamp > lastUpdateTimestamp + MAX_STALENESS;
    }

    // ============ Admin Functions ============

    /**
     * @notice Update configuration parameters
     * @param feedId_ New feed ID
     * @param minRate_ New minimum rate
     * @param maxRate_ New maximum rate
     * @param maxDiffPercent_ New max percent change
     */
    function updateConfig(
        bytes32 feedId_,
        uint256 minRate_,
        uint256 maxRate_,
        uint256 maxDiffPercent_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (feedId_ == bytes32(0)) revert InvalidFeedId();
        if (minRate_ >= maxRate_) revert InvalidRateBounds();

        feedId = feedId_;
        minRate = minRate_;
        maxRate = maxRate_;
        maxDifferencePercent = maxDiffPercent_;

        emit ConfigUpdated(feedId_, minRate_, maxRate_, maxDiffPercent_);
    }

    /**
     * @notice Update verifier proxy address
     * @param verifierProxy_ New verifier proxy address
     */
    function updateVerifierProxy(address verifierProxy_) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        if (verifierProxy_ == address(0)) revert InvalidVerifierProxy();
        verifierProxy = IVerifierProxy(verifierProxy_);
    }

    /**
     * @notice Pause the contract
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Withdraw ERC-20 tokens (e.g., leftover LINK)
     * @param token Token address
     * @param beneficiary Address to send tokens to
     */
    function withdrawToken(address token, address beneficiary) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance == 0) revert NothingToWithdraw();
        IERC20(token).safeTransfer(beneficiary, balance);
    }

    /**
     * @notice Authorize upgrade (UUPS pattern)
     * @param newImplementation Address of new implementation
     */
    function _authorizeUpgrade(address newImplementation) 
        internal 
        override 
        onlyRole(UPGRADER_ROLE) 
    {}
}
