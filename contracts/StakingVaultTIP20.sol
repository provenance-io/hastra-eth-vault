// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/ITIP20.sol";

/**
 * @notice Interface for YieldVault(TIP20) to mint reward tokens
 */
interface IYieldVault {
    function mintRewards(address to, uint256 amount) external;
}

/**
 * @notice Minimal interface for Chainlink FeedVerifier NAV oracle
 */
interface IFeedVerifier {
    function priceOf(bytes32 feedId) external view returns (int192);
}

/**
 * @title StakingVaultTIP20
 * @author Hastra
 * @notice Tempo-native counterpart to StakingVault. Same NAV-gated staking/reward
 *         logic, but PRIME is the real TIP-20 token (minted/burned externally via
 *         ISSUER_ROLE) instead of a share balance the vault mints on itself.
 * @dev Third-party redemption (redeem/withdraw on behalf of another owner) is not
 *      supported — only self-redeem — since PRIME's privileged TIP-20 burn has no
 *      allowance concept to safely gate a third party acting for someone else.
 *      Likewise, freezeAccount/thawAccount can only gate actions mediated by this
 *      vault; it cannot block a holder from transferring PRIME peer-to-peer.
 */
contract StakingVaultTIP20 is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using Math for uint256;
    using SafeERC20 for IERC20;

    // ============ Roles ============

    bytes32 public constant FREEZE_ADMIN_ROLE = keccak256("FREEZE_ADMIN");
    bytes32 public constant REWARDS_ADMIN_ROLE = keccak256("REWARDS_ADMIN");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant NAV_ORACLE_UPDATER_ROLE = keccak256("NAV_ORACLE_UPDATER");

    // ============ State Variables ============

    /// @notice The staked asset (wYLDS TIP-20 address).
    IERC20 public asset;

    /// @notice The real PRIME TIP-20 token. This vault must hold ISSUER_ROLE on it.
    ITIP20 public shareToken;

    /// @notice Reference to the YieldVault(TIP20) for minting wYLDS rewards
    address public yieldVault;

    /// @notice Mapping of frozen account status
    mapping(address => bool) public frozen;

    /// @notice Internal accounting of wYLDS deposited (prevents donation inflation attack)
    uint256 private _totalManagedAssets;

    /// @notice Maximum reward increase as a fraction of this vault's current totalAssets, in 1e18 units.
    uint256 public maxRewardPercent;

    /// @notice Chainlink FeedVerifier NAV oracle address (optional — zero means no oracle)
    address public navOracle;

    /// @dev Deprecated — staleness is enforced by FeedVerifier.priceOf(). Kept for storage layout.
    uint32 public navStalenessLimit;

    /// @notice Chainlink feedId this vault reads NAV from (set alongside navOracle)
    bytes32 public navFeedId;

    /// @notice Absolute per-call ceiling on distributeRewards, in asset token units.
    uint256 public maxPeriodRewards;

    /// @notice Minimum seconds that must elapse between successive distributeRewards calls.
    uint256 public rewardPeriodSeconds;

    /// @notice Block timestamp of the last successful distributeRewards call.
    uint256 public lastRewardDistributedAt;

    /// @notice Hard lifetime ceiling on cumulative rewards ever distributed through this vault.
    uint256 public maxTotalRewards;

    /// @notice Cumulative total rewards minted through this vault since deployment.
    uint256 public totalRewardsDistributed;

    /// @dev Storage gap for future upgrades.
    uint256[41] private __gap;

    // ============ Events ============

    event Deposit(address indexed sender, address indexed receiver, uint256 assets, uint256 shares);
    event Withdraw(address indexed owner, address indexed receiver, uint256 assets, uint256 shares);
    event RewardsDistributed(uint256 amount, uint256 timestamp);
    event AccountFrozen(address indexed account);
    event AccountThawed(address indexed account);
    event YieldVaultUpdated(address oldVault, address newVault);
    event MaxRewardPercentUpdated(uint256 oldValue, uint256 newValue);
    event NavOracleUpdated(address oldOracle, address newOracle, bytes32 feedId);
    event MaxPeriodRewardsUpdated(uint256 oldValue, uint256 newValue);
    event RewardPeriodSecondsUpdated(uint256 oldValue, uint256 newValue);
    event MaxTotalRewardsUpdated(uint256 oldValue, uint256 newValue);

    // ============ Errors ============

    error AccountIsFrozen();
    error AccountNotFrozen();
    error InvalidAmount();
    error InvalidAddress();
    error ZeroAmount();
    error RewardExceedsMaxDelta(uint256 amount, uint256 maxAllowed);
    error NavInvalid();
    error RewardCooldownNotElapsed(uint256 nextAllowedAt);
    error ExceedsPeriodRewardCap(uint256 amount, uint256 cap);
    error ExceedsLifetimeRewardCap(uint256 amount, uint256 remaining);

    // ============ Constructor ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the StakingVaultTIP20
     * @param asset_ The underlying asset (wYLDS TIP-20 address)
     * @param shareToken_ The PRIME TIP-20 address this vault mints/burns
     * @param admin_ Address of the default admin
     * @param yieldVault_ Address of the YieldVault(TIP20) contract for minting rewards
     * @dev Grants only essential roles (DEFAULT_ADMIN, PAUSER, UPGRADER) to admin_.
     *      This contract must separately be granted ISSUER_ROLE on shareToken_.
     */
    function initialize(
        IERC20 asset_,
        ITIP20 shareToken_,
        address admin_,
        address yieldVault_
    ) public initializer {
        if (admin_ == address(0)) revert InvalidAddress();
        if (yieldVault_ == address(0)) revert InvalidAddress();
        if (address(shareToken_) == address(0)) revert InvalidAddress();

        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        asset = asset_;
        shareToken = shareToken_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        _grantRole(UPGRADER_ROLE, admin_);

        yieldVault = yieldVault_;
        maxRewardPercent = 0.0075e18;        // 75 BPS per call
        maxPeriodRewards = 1_000_000e6;      // 1M wYLDS absolute cap per call
        rewardPeriodSeconds = 3540;          // 59 min — 1 min buffer before hourly boundary
        maxTotalRewards = 10_000_000e6;      // 10M wYLDS lifetime cap
    }

    // ============ UUPS Required Override ============

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    // ============ Deposit / Mint ============

    function deposit(uint256 assets, address receiver)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 shares)
    {
        if (frozen[msg.sender]) revert AccountIsFrozen();
        if (frozen[receiver]) revert AccountIsFrozen();
        if (assets == 0) revert ZeroAmount();

        shares = _convertToShares(assets, Math.Rounding.Floor);
        _depositInternal(receiver, assets, shares);
    }

    function depositWithPermit(
        uint256 assets,
        address receiver,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external whenNotPaused nonReentrant returns (uint256 shares) {
        if (frozen[msg.sender]) revert AccountIsFrozen();
        if (frozen[receiver]) revert AccountIsFrozen();
        if (assets == 0) revert ZeroAmount();

        // Guard against permit front-running: a front-runner consuming the nonce also
        // sets the allowance, so deposit via transferFrom will still succeed.
        try IERC20Permit(address(asset)).permit(msg.sender, address(this), assets, deadline, v, r, s) {} catch {}

        shares = _convertToShares(assets, Math.Rounding.Floor);
        _depositInternal(receiver, assets, shares);
    }

    function mint(uint256 shares, address receiver)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 assets)
    {
        if (frozen[msg.sender]) revert AccountIsFrozen();
        if (frozen[receiver]) revert AccountIsFrozen();
        if (shares == 0) revert ZeroAmount();

        assets = _convertToAssets(shares, Math.Rounding.Ceil);
        _depositInternal(receiver, assets, shares);
    }

    function _depositInternal(address receiver, uint256 assets, uint256 shares) private {
        asset.safeTransferFrom(msg.sender, address(this), assets);
        _totalManagedAssets += assets;
        shareToken.mint(receiver, shares);
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    // ============ Redeem / Withdraw (self only) ============

    function redeem(uint256 shares, address receiver)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 assets)
    {
        if (frozen[msg.sender]) revert AccountIsFrozen();
        if (shares == 0) revert ZeroAmount();

        assets = _convertToAssets(shares, Math.Rounding.Floor);
        _withdrawInternal(receiver, assets, shares);
    }

    function withdraw(uint256 assets, address receiver)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 shares)
    {
        if (frozen[msg.sender]) revert AccountIsFrozen();
        if (assets == 0) revert ZeroAmount();

        shares = _convertToShares(assets, Math.Rounding.Ceil);
        _withdrawInternal(receiver, assets, shares);
    }

    function _withdrawInternal(address receiver, uint256 assets, uint256 shares) private {
        _totalManagedAssets -= assets;
        // Privileged TIP-20 burn: no allowance needed since caller == owner (self-redeem only).
        shareToken.burn(msg.sender, shares);
        asset.safeTransfer(receiver, assets);
        emit Withdraw(msg.sender, receiver, assets, shares);
    }

    // ============ Inflation Attack Protection ============

    /**
     * @notice Total wYLDS assets managed by the vault (deposits + rewards only).
     * @dev Internal accounting instead of balanceOf — prevents inflation attacks
     *      via direct token transfers to the vault.
     */
    function totalAssets() public view returns (uint256) {
        return _totalManagedAssets;
    }

    /**
     * @dev Convert wYLDS assets to PRIME shares using NAV. NAV = wYLDS per PRIME (1e18 scaled).
     * Reverts if NAV oracle is not set — no fallback to a supply ratio.
     */
    function _convertToShares(uint256 assets, Math.Rounding rounding) internal view returns (uint256) {
        uint256 nav = getVerifiedNav(); // reverts if oracle not set or price stale
        return assets.mulDiv(1e18, nav, rounding);
    }

    /**
     * @dev Convert PRIME shares to wYLDS assets using NAV. assets = shares * NAV / 1e18.
     */
    function _convertToAssets(uint256 shares, Math.Rounding rounding) internal view returns (uint256) {
        uint256 nav = getVerifiedNav(); // reverts if oracle not set or price stale
        return shares.mulDiv(nav, 1e18, rounding);
    }

    function convertToShares(uint256 assets) external view returns (uint256) {
        return _convertToShares(assets, Math.Rounding.Floor);
    }

    function convertToAssets(uint256 shares) external view returns (uint256) {
        return _convertToAssets(shares, Math.Rounding.Floor);
    }

    /**
     * @dev Track rewards when distributed. Follows checks-effects-interactions.
     * @dev Reverts if amount would increase totalAssets by more than maxRewardPercent.
     */
    function distributeRewards(uint256 amount)
        external
        onlyRole(REWARDS_ADMIN_ROLE)
        whenNotPaused
        nonReentrant
    {
        if (amount == 0) revert InvalidAmount();

        uint256 nextAllowed = lastRewardDistributedAt + rewardPeriodSeconds;
        if (block.timestamp < nextAllowed) revert RewardCooldownNotElapsed(nextAllowed);

        if (amount > maxPeriodRewards) revert ExceedsPeriodRewardCap(amount, maxPeriodRewards);

        uint256 remaining = maxTotalRewards - totalRewardsDistributed;
        if (amount > remaining) revert ExceedsLifetimeRewardCap(amount, remaining);

        uint256 currentAssets = _totalManagedAssets;
        if (currentAssets > 0) {
            uint256 maxAllowed = currentAssets.mulDiv(maxRewardPercent, 1e18);
            if (amount > maxAllowed) revert RewardExceedsMaxDelta(amount, maxAllowed);
        }

        lastRewardDistributedAt = block.timestamp;
        totalRewardsDistributed += amount;
        _totalManagedAssets += amount;

        // Interactions: mint wYLDS rewards to this vault
        IYieldVault(yieldVault).mintRewards(address(this), amount);

        emit RewardsDistributed(amount, block.timestamp);
    }

    function setMaxRewardPercent(uint256 newPercent) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newPercent == 0 || newPercent > 1e18) revert InvalidAmount();
        uint256 oldPercent = maxRewardPercent;
        maxRewardPercent = newPercent;
        emit MaxRewardPercentUpdated(oldPercent, newPercent);
    }

    function setMaxPeriodRewards(uint256 newCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newCap == 0) revert InvalidAmount();
        uint256 old = maxPeriodRewards;
        maxPeriodRewards = newCap;
        emit MaxPeriodRewardsUpdated(old, newCap);
    }

    function setRewardPeriodSeconds(uint256 newSeconds) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newSeconds == 0) revert InvalidAmount();
        uint256 old = rewardPeriodSeconds;
        rewardPeriodSeconds = newSeconds;
        emit RewardPeriodSecondsUpdated(old, newSeconds);
    }

    function setMaxTotalRewards(uint256 newMax) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newMax < totalRewardsDistributed) revert InvalidAmount();
        uint256 old = maxTotalRewards;
        maxTotalRewards = newMax;
        emit MaxTotalRewardsUpdated(old, newMax);
    }

    function setNavOracle(address oracle, bytes32 feedId) external onlyRole(NAV_ORACLE_UPDATER_ROLE) {
        address old = navOracle;
        navOracle = oracle;
        navFeedId = feedId;
        emit NavOracleUpdated(old, oracle, feedId);
    }

    /**
     * @notice Returns the latest verified NAV from the Chainlink oracle (1e18 scaled).
     * @dev Reverts if the oracle is not set or the price is <= 0.
     */
    function getVerifiedNav() public view returns (uint256 nav) {
        if (navOracle == address(0)) revert InvalidAddress();
        int192 price = IFeedVerifier(navOracle).priceOf(navFeedId);
        if (price <= 0) revert NavInvalid();
        nav = uint256(uint192(price));
    }

    function getTotalValueAtNav() public view returns (uint256) {
        return totalAssets();
    }

    // ============ Freeze Functionality ============

    function freezeAccount(address account) external onlyRole(FREEZE_ADMIN_ROLE) {
        if (frozen[account]) revert AccountIsFrozen();
        frozen[account] = true;
        emit AccountFrozen(account);
    }

    function thawAccount(address account) external onlyRole(FREEZE_ADMIN_ROLE) {
        if (!frozen[account]) revert AccountNotFrozen();
        frozen[account] = false;
        emit AccountThawed(account);
    }

    // ============ Admin Functions ============

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function setYieldVault(address newVault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newVault == address(0)) revert InvalidAddress();
        address oldVault = yieldVault;
        yieldVault = newVault;
        emit YieldVaultUpdated(oldVault, newVault);
    }
}
