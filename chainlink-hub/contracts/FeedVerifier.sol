// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Common} from "@chainlink/contracts/src/v0.8/llo-feeds/libraries/Common.sol";
import {IVerifierFeeManager} from "@chainlink/contracts/src/v0.8/llo-feeds/v0.3.0/interfaces/IVerifierFeeManager.sol";
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

    function i_nativeAddress() external view returns (address);
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
    bytes32 public constant PAUSER_ROLE   = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant UPDATER_ROLE  = keccak256("UPDATER_ROLE");

    // ── Schema v7 (Redemption Rates) ─────────────────────────────────────────
    struct ReportV7 {
        bytes32 feedId;
        uint32  validFromTimestamp;
        uint32  observationsTimestamp;
        uint192 nativeFee; // from Chainlink schema — not used directly but required for abi.decode offset alignment
        uint192 linkFee;   // from Chainlink schema — not used directly but required for abi.decode offset alignment
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
    event MaxStalenessByFeedUpdated(bytes32 indexed feedId, uint32 oldMaxStaleness, uint32 newMaxStaleness);

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

    /// @notice Default maximum age (seconds) applied to all feeds without an explicit override.
    ///         Defaults to 86400 (24 h). Set to 0 to disable default enforcement.
    uint32 public defaultMaxStaleness;

    /// @notice Per-feed staleness override. When non-zero, takes precedence over defaultMaxStaleness.
    mapping(bytes32 => uint32) public maxStalenessByFeed;

    // slither-disable-next-line unused-state
    uint256[42] private __gap;

    // Occupies the last slot of the original __gap[44] — storage footprint unchanged,
    // safe for upgrading an existing proxy. OZ v4 ReentrancyGuardUpgradeable cannot be
    // added here because: (1) Chainlink llo-feeds pins @openzeppelin/contracts@4.8.3
    // via versioned imports, making a v5 mix unsafe in the same compilation unit;
    // (2) adding it to an existing proxy would shift storage layout in OZ v4.
    uint256 private _reentrancyStatus; // 0/1 = not entered, 2 = entered

    modifier nonReentrant() {
        require(_reentrancyStatus != 2, "ReentrancyGuard: reentrant call");
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }

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
        defaultMaxStaleness = 3600; // 1 h default; matches Solana vault-stake price_max_staleness
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
     * @notice Set the default maximum age (seconds) applied to all feeds without an explicit override.
     * @dev    Set to 0 to disable default staleness enforcement.
     */
    function setMaxStaleness(uint32 maxStaleness_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit MaxStalenessUpdated(defaultMaxStaleness, maxStaleness_);
        defaultMaxStaleness = maxStaleness_;
    }

    /**
     * @notice Set a per-feed staleness override for a specific feedId.
     * @dev    When non-zero, this takes precedence over defaultMaxStaleness for that feed.
     *         Set to 0 to remove the override and fall back to defaultMaxStaleness.
     */
    function setMaxStalenessByFeed(bytes32 feedId, uint32 maxStaleness_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit MaxStalenessByFeedUpdated(feedId, maxStalenessByFeed[feedId], maxStaleness_);
        maxStalenessByFeed[feedId] = maxStaleness_;
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
        (bytes memory parameterPayload, uint256 nativeFee) = _buildParameterPayload(unverifiedReport);
        bytes memory verified = verifierProxy.verify{value: nativeFee}(unverifiedReport, parameterPayload);
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

        (bytes memory parameterPayload, uint256 nativeFee) = _buildParameterPayload(unverifiedReports[0]);
        bytes[] memory verifiedReports = verifierProxy.verifyBulk{value: nativeFee}(unverifiedReports, parameterPayload);

        for (uint256 i = 0; i < verifiedReports.length; i++) {
            _storeReport(verifiedReports[i]);
        }
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    /// @notice Latest verified price for a specific feedId.
    /// @dev    Reverts PriceNotInitialized if no report has been stored yet.
    ///         Reverts StalePrice if the effective staleness limit is exceeded.
    ///         maxStalenessByFeed[feedId] takes precedence over defaultMaxStaleness when non-zero.
    function priceOf(bytes32 feedId) external view returns (int192) {
        uint32 timestamp = timestampByFeed[feedId];
        if (timestamp == 0) revert PriceNotInitialized(feedId);
        uint32 effective = maxStalenessByFeed[feedId] > 0 ? maxStalenessByFeed[feedId] : defaultMaxStaleness;
        if (effective > 0 && block.timestamp - timestamp > effective)
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

    /// @notice Withdraw ETH held by this contract (e.g. unspent verification fees).
    /// @dev    .transfer() caps the call at 2300 gas so reentrance is physically impossible;
    ///         nonReentrant is added as defence-in-depth in case this is ever changed to .call().
    function withdrawEth(address payable beneficiary) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        uint256 amount = address(this).balance;
        if (amount == 0) revert NothingToWithdraw();
        beneficiary.transfer(amount);
    }

    /// @notice Accept ETH to fund native fee payments on mainnet.
    receive() external payable {}

    // ── Internal ──────────────────────────────────────────────────────────────

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    /**
     * @dev Validates schema version and builds the fee parameterPayload.
     *      Returns (empty bytes, 0) when no FeeManager is present (e.g. Sepolia).
     *      Returns (abi.encode(nativeToken), nativeFee) on mainnet — caller must forward nativeFee.
     */
    function _buildParameterPayload(bytes memory unverifiedReport) internal returns (bytes memory parameterPayload, uint256 nativeFee) {
        (, bytes memory reportData) = abi.decode(unverifiedReport, (bytes32[3], bytes));

        uint16 reportVersion = (uint16(uint8(reportData[0])) << 8) | uint16(uint8(reportData[1]));
        if (reportVersion != 7) revert InvalidReportVersion(reportVersion);

        IFeeManager feeManager = IFeeManager(address(verifierProxy.s_feeManager()));
        if (address(feeManager) != address(0)) {
            address nativeToken = feeManager.i_nativeAddress();
            (Common.Asset memory fee,,) = feeManager.getFeeAndReward(address(this), reportData, nativeToken);
            nativeFee = fee.amount;
            parameterPayload = abi.encode(nativeToken);
        }
        // else: no FeeManager (Sepolia) — parameterPayload stays empty, nativeFee stays 0
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
