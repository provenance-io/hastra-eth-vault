// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Common} from "@chainlink/contracts/src/v0.8/llo-feeds/libraries/Common.sol";
import {IVerifierFeeManager} from "@chainlink/contracts/src/v0.8/llo-feeds/v0.3.0/interfaces/IVerifierFeeManager.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title FeedVerifier
 * @notice Onchain verifier for Chainlink Data Streams Schema v7 (Redemption Rates).
 *
 * @dev UUPS upgradeable. Supports single and bulk report verification. Stores the
 *      latest price per feedId so multiple StakingVaults can share one contract.
 *
 *      Based on Chainlink's official ClientReportsVerifier example:
 *      https://docs.chain.link/data-streams/tutorials/evm-onchain-report-verification
 *
 *      Sepolia Verifier Proxy: 0x4e9935be37302B9C97Ff4ae6868F1b566ade26d2
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Interfaces
// ─────────────────────────────────────────────────────────────────────────────

interface IVerifierProxy {
    function verify(
        bytes calldata payload,
        bytes calldata parameterPayload
    ) external payable returns (bytes memory verifierResponse);

    function verifyBulk(
        bytes[] calldata payloads,
        bytes calldata parameterPayload
    ) external payable returns (bytes[] memory verifiedReports);

    function s_feeManager() external view returns (IVerifierFeeManager);
}

interface IFeeManager {
    function getFeeAndReward(
        address subscriber,
        bytes memory unverifiedReport,
        address quoteAddress
    ) external returns (Common.Asset memory, Common.Asset memory, uint256);

    function i_linkAddress() external view returns (address);
    function i_nativeAddress() external view returns (address);
    function i_rewardManager() external view returns (address);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Contract
// ─────────────────────────────────────────────────────────────────────────────

contract FeedVerifier is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    bytes32 public constant PAUSER_ROLE   = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant UPDATER_ROLE  = keccak256("UPDATER_ROLE");

    // ── Schema v7 (Redemption Rates) ─────────────────────────────────────────
    struct ReportV7 {
        bytes32 feedId;
        uint32  validFromTimestamp;
        uint32  observationsTimestamp;
        uint192 nativeFee;
        uint192 linkFee;
        uint32  expiresAt;
        int192  price; // exchange rate, scaled 1e18
    }

    // ── Errors ────────────────────────────────────────────────────────────────
    error InvalidReportVersion(uint16 version);
    error NothingToWithdraw();
    error StaleReport(uint32 newTimestamp, uint32 storedTimestamp);
    error ExpiredReport(uint32 expiresAt, uint32 currentTime);
    error ReportNotYetValid(uint32 validFromTimestamp, uint32 currentTime);
    error StalePrice(bytes32 feedId, uint32 lastTimestamp, uint32 currentTime);
    error PriceNotInitialized(bytes32 feedId);
    error ZeroPriceInReport(bytes32 feedId);
    error ZeroAddress();
    error InvalidFeedId(bytes32 expected, bytes32 actual);

    // ── Events ────────────────────────────────────────────────────────────────
    event DecodedPrice(
        bytes32 indexed feedId,
        int192  price,
        uint32  observationsTimestamp
    );
    event FeedIdUpdated(bytes32 indexed oldFeedId, bytes32 indexed newFeedId);
    event MaxStalenessUpdated(uint32 oldMaxStaleness, uint32 newMaxStaleness);

    // ── State ─────────────────────────────────────────────────────────────────
    IVerifierProxy public verifierProxy;

    /// @notice Latest verified price per feedId (1e18 scaled int192).
    mapping(bytes32 => int192) public priceByFeed;

    /// @notice Latest observation timestamp per feedId.
    mapping(bytes32 => uint32) public timestampByFeed;

    /// @notice Most recently updated feedId (convenience for single-feed setups).
    bytes32 public lastFeedId;

    /// @notice When non-zero, only reports with this feedId are accepted.
    bytes32 public allowedFeedId;

    /// @notice Maximum age (seconds) a stored price may be when read via priceOf().
    ///         Defaults to 86400 (24 h). Set to 0 to disable.
    uint32 public maxStaleness;

    // slither-disable-next-line unused-state
    uint256[44] private __gap;

    // ── Constructor / Initializer ─────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @param admin_          Address that receives DEFAULT_ADMIN_ROLE, PAUSER_ROLE, UPGRADER_ROLE.
     * @param updater_        Bot address that receives UPDATER_ROLE (may equal admin_ on testnets).
     * @param verifierProxy_  Chainlink VerifierProxy address for this network.
     * @param feedId_         Enforced feedId. Pass bytes32(0) to leave unenforced (migrate via initializeV2 later).
     */
    function initialize(address admin_, address updater_, address verifierProxy_, bytes32 feedId_) external initializer {
        _initializeCore(admin_, updater_, verifierProxy_);
        if (feedId_ != bytes32(0)) _setAllowedFeedId(feedId_);
    }

    /// @dev Shared setup extracted so FeedVerifierV1 mock can call it without the feedId param.
    function _initializeCore(address admin_, address updater_, address verifierProxy_) internal {
        if (admin_ == address(0) || updater_ == address(0) || verifierProxy_ == address(0)) revert ZeroAddress();
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE,        admin_);
        _grantRole(UPGRADER_ROLE,      admin_);
        _grantRole(UPDATER_ROLE,       updater_);
        verifierProxy = IVerifierProxy(verifierProxy_);
        maxStaleness = 86400; // 24 h default; override with setMaxStaleness
    }

    // ── Core ──────────────────────────────────────────────────────────────────

    /**
     * @notice Update the enforced feedId (e.g. during a scheduled feed rotation).
     * @dev    Set to bytes32(0) to disable enforcement.
     */
    function setAllowedFeedId(bytes32 feedId_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setAllowedFeedId(feedId_);
    }

    /**
     * @notice Set the maximum age (seconds) a stored price may be when read via latestPrice().
     * @dev    Set to 0 to disable staleness enforcement (default).
     */
    function setMaxStaleness(uint32 maxStaleness_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit MaxStalenessUpdated(maxStaleness, maxStaleness_);
        maxStaleness = maxStaleness_;
    }

    function _setAllowedFeedId(bytes32 feedId_) internal {
        bytes32 old = allowedFeedId;
        allowedFeedId = feedId_;
        emit FeedIdUpdated(old, feedId_);
    }

    /**
     * @notice Verify a single Data Streams Schema v7 report onchain.
     * @param unverifiedReport Full payload returned by Chainlink Data Streams API.
     */
    function verifyReport(bytes memory unverifiedReport) external whenNotPaused onlyRole(UPDATER_ROLE) {
        bytes memory parameterPayload = _buildParameterPayload(unverifiedReport);
        bytes memory verified = verifierProxy.verify(unverifiedReport, parameterPayload);
        _storeReport(verified);
    }

    /**
     * @notice Verify multiple Data Streams Schema v7 reports in a single call.
     * @dev All reports must use the same fee token (single parameterPayload).
     *      Uses VerifierProxy.verifyBulk() for gas efficiency.
     * @param unverifiedReports Array of full payloads from Chainlink Data Streams API.
     */
    function verifyBulkReports(bytes[] calldata unverifiedReports) external whenNotPaused onlyRole(UPDATER_ROLE) {
        if (unverifiedReports.length == 0) return;

        bytes memory parameterPayload = _buildParameterPayload(unverifiedReports[0]);
        bytes[] memory verifiedReports = verifierProxy.verifyBulk(unverifiedReports, parameterPayload);

        for (uint256 i = 0; i < verifiedReports.length; i++) {
            _storeReport(verifiedReports[i]);
        }
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    /// @notice Latest verified price for a specific feedId.
    /// @dev    Reverts PriceNotInitialized if no report has been stored yet.
    ///         Reverts StalePrice if maxStaleness is set and the stored price is too old.
    function priceOf(bytes32 feedId) external view returns (int192) {
        uint32 timestamp = timestampByFeed[feedId];
        if (timestamp == 0) revert PriceNotInitialized(feedId);
        if (maxStaleness > 0 && block.timestamp - timestamp > maxStaleness)
            revert StalePrice(feedId, timestamp, uint32(block.timestamp));
        int192 price = priceByFeed[feedId];
        if (price <= 0) revert ZeroPriceInReport(feedId);
        return price;
    }

    /// @notice Latest observation timestamp for a specific feedId.
    function timestampOf(bytes32 feedId) external view returns (uint32) {
        return timestampByFeed[feedId];
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function pause()   external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    /// @notice Withdraw ERC-20 tokens (e.g. LINK) held by this contract.
    function withdrawToken(address beneficiary, address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 amount = IERC20(token).balanceOf(address(this));
        if (amount == 0) revert NothingToWithdraw();
        IERC20(token).safeTransfer(beneficiary, amount);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /**
     * @dev Validates schema version and builds the fee parameterPayload.
     *      Returns empty bytes when no FeeManager is present (e.g. Sepolia).
     */
    function _buildParameterPayload(bytes memory unverifiedReport) internal returns (bytes memory parameterPayload) {
        (, bytes memory reportData) = abi.decode(unverifiedReport, (bytes32[3], bytes));

        uint16 reportVersion = (uint16(uint8(reportData[0])) << 8) | uint16(uint8(reportData[1]));
        if (reportVersion != 7) revert InvalidReportVersion(reportVersion);

        IFeeManager feeManager = IFeeManager(address(verifierProxy.s_feeManager()));
        if (address(feeManager) != address(0)) {
            address feeToken = feeManager.i_linkAddress();
            (Common.Asset memory fee,,) = feeManager.getFeeAndReward(address(this), reportData, feeToken);
            // Use raw approve: LINK does not have the allowance-race condition and the
            // Chainlink RewardManager will consume exactly fee.amount in the verify() call.
            IERC20(feeToken).approve(feeManager.i_rewardManager(), fee.amount);
            parameterPayload = abi.encode(feeToken);
        }
        // else: no FeeManager (Sepolia) — parameterPayload stays empty
    }

    /**
     * @dev Decodes a verified Schema v7 report and stores price + timestamp per feedId.
     *      Reverts on expired or stale reports to prevent overwriting fresh data.
     */
    function _storeReport(bytes memory verified) internal {
        ReportV7 memory report = abi.decode(verified, (ReportV7));

        if (allowedFeedId != bytes32(0) && report.feedId != allowedFeedId)
            revert InvalidFeedId(allowedFeedId, report.feedId);

        if (block.timestamp < report.validFromTimestamp)
            revert ReportNotYetValid(report.validFromTimestamp, uint32(block.timestamp));

        if (block.timestamp > report.expiresAt)
            revert ExpiredReport(report.expiresAt, uint32(block.timestamp));

        if (report.observationsTimestamp <= timestampByFeed[report.feedId])
            revert StaleReport(report.observationsTimestamp, timestampByFeed[report.feedId]);

        if (report.price <= 0) revert ZeroPriceInReport(report.feedId);

        priceByFeed[report.feedId]     = report.price;
        timestampByFeed[report.feedId] = report.observationsTimestamp;
        lastFeedId                     = report.feedId;

        emit DecodedPrice(report.feedId, report.price, report.observationsTimestamp);
    }
}
