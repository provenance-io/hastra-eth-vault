// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @notice Interface for YieldVault to mint reward tokens
 */
interface IAutoYieldVault {
    function mintRewards(address to, uint256 amount) external;
}

/**
 * @notice Minimal interface for Chainlink FeedVerifier NAV oracle
 */
interface IAutoFeedVerifier {
    function priceOf(bytes32 feedId) external view returns (int192);
}

/**
 * @title AutoStakingVault
 * @author Hastra
 * @notice Upgradeable ERC-4626 staking vault with automatic NAV fallback.
 *
 * Identical to StakingVault except: when no NAV oracle is configured
 * (navOracle == address(0)), share/asset conversions fall back to the
 * standard ERC-4626 ratio (totalAssets / totalSupply) rather than reverting.
 * This allows the vault to operate normally before a Chainlink feed is live.
 */
contract AutoStakingVault is
    Initializable,
    ERC4626Upgradeable,
    ERC20PermitUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using Math for uint256;

    // ============ Roles ============

    bytes32 public constant FREEZE_ADMIN_ROLE = keccak256("FREEZE_ADMIN");
    bytes32 public constant REWARDS_ADMIN_ROLE = keccak256("REWARDS_ADMIN");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant NAV_ORACLE_UPDATER_ROLE = keccak256("NAV_ORACLE_UPDATER");

    // ============ State Variables ============

    /// @notice Reference to the YieldVault for minting wYLDS rewards
    address public yieldVault;

    /// @notice Mapping of frozen account status
    mapping(address => bool) public frozen;

    /// @notice Internal accounting of wYLDS deposited (prevents donation inflation attack)
    /// @dev Tracks only legitimate deposits, ignoring direct transfers to contract
    uint256 private _totalManagedAssets;

    /// @notice Maximum reward increase as a percent of current totalAssets, in 1e18 units
    /// @dev 20% = 0.2e18 = 200000000000000000. Prevents fat-finger or malicious reward calls.
    uint256 public maxRewardPercent;

    /// @notice Chainlink FeedVerifier NAV oracle address (optional — zero means no oracle)
    /// @dev When zero, share/asset conversions use the standard ERC-4626 ratio.
    address public navOracle;

    /// @dev Deprecated — staleness is now enforced by FeedVerifier.priceOf(). Kept for storage layout.
    uint32 public navStalenessLimit;

    /// @notice Chainlink feedId this vault reads NAV from (set alongside navOracle)
    bytes32 public navFeedId;

    /// @dev Storage gap for future upgrades (46 slots total; 6 consumed above).
    uint256[46] private __gap;

    // ============ Events ============

    event RewardsDistributed(uint256 amount, uint256 timestamp);
    event AccountFrozen(address indexed account);
    event AccountThawed(address indexed account);
    event YieldVaultUpdated(address oldVault, address newVault);
    event MaxRewardPercentUpdated(uint256 oldValue, uint256 newValue);
    event NavOracleUpdated(address oldOracle, address newOracle, bytes32 feedId);

    // ============ Errors ============

    error AccountIsFrozen();
    error AccountNotFrozen();
    error InvalidAmount();
    error InvalidAddress();
    error ZeroAmount();
    error RewardExceedsMaxDelta(uint256 amount, uint256 maxAllowed);
    error NavInvalid();

    // ============ Constructor ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the AutoStakingVault.
     * @param asset_ The underlying asset (e.g., wYLDS from YieldVault)
     * @param name_ Name of the stake token (e.g., "Auto Staked YLDS")
     * @param symbol_ Symbol of the stake token (e.g., "AUTO")
     * @param admin_ Address of the default admin
     * @param yieldVault_ Address of the YieldVault contract for minting rewards
     * @dev NAV oracle is not required at initialization. The vault operates on the
     *      standard ERC-4626 ratio until setNavOracle() is called.
     */
    function initialize(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        address admin_,
        address yieldVault_
    ) public initializer {
        if (admin_ == address(0)) revert InvalidAddress();
        if (yieldVault_ == address(0)) revert InvalidAddress();

        __ERC20_init(name_, symbol_);
        __ERC4626_init(asset_);
        __ERC20Permit_init(name_);
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        _grantRole(UPGRADER_ROLE, admin_);

        yieldVault = yieldVault_;
        maxRewardPercent = 0.2e18; // 20%
    }

    // ============ UUPS Required Override ============

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    // ============ Deposit & Withdraw Overrides ============

    function deposit(uint256 assets, address receiver)
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256 shares)
    {
        return super.deposit(assets, receiver);
    }

    function depositWithPermit(
        uint256 assets,
        address receiver,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external whenNotPaused nonReentrant returns (uint256 shares) {
        // Guard against permit front-running: a front-runner consuming the nonce also
        // sets the allowance, so deposit() via transferFrom() will still succeed.
        try IERC20Permit(asset()).permit(msg.sender, address(this), assets, deadline, v, r, s) {} catch {}
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver)
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256 assets)
    {
        return super.mint(shares, receiver);
    }

    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256 assets)
    {
        return super.redeem(shares, receiver, owner);
    }

    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256 shares)
    {
        return super.withdraw(assets, receiver, owner);
    }

    // ============ Inflation Attack Protection ============

    /**
     * @dev Override totalAssets to use internal accounting instead of balanceOf
     * @notice Prevents inflation attacks via direct token transfers to the vault
     * @return Total wYLDS assets managed by the vault (deposits + rewards only)
     */
    function totalAssets() public view virtual override returns (uint256) {
        return _totalManagedAssets;
    }

    /**
     * @dev Convert wYLDS assets to shares.
     *
     * When oracle is set: shares = assets * 1e18 / NAV  (NAV = wYLDS per share, 1e18 scaled).
     * When oracle is not set: falls back to standard ERC-4626 ratio (totalAssets / totalSupply).
     */
    function _convertToShares(uint256 assets, Math.Rounding rounding)
        internal
        view
        virtual
        override
        returns (uint256)
    {
        if (navOracle == address(0)) {
            return super._convertToShares(assets, rounding);
        }
        uint256 nav = getVerifiedNav();
        return assets.mulDiv(1e18, nav, rounding);
    }

    /**
     * @dev Convert shares to wYLDS assets.
     *
     * When oracle is set: assets = shares * NAV / 1e18.
     * When oracle is not set: falls back to standard ERC-4626 ratio (totalSupply / totalAssets).
     */
    function _convertToAssets(uint256 shares, Math.Rounding rounding)
        internal
        view
        virtual
        override
        returns (uint256)
    {
        if (navOracle == address(0)) {
            return super._convertToAssets(shares, rounding);
        }
        uint256 nav = getVerifiedNav();
        return shares.mulDiv(nav, 1e18, rounding);
    }

    /**
     * @dev Override deposit to track assets internally
     */
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
        internal
        virtual
        override
    {
        if (assets == 0) revert ZeroAmount();
        _totalManagedAssets += assets;
        super._deposit(caller, receiver, assets, shares);
    }

    /**
     * @dev Override withdraw to track assets internally
     */
    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal virtual override {
        if (assets == 0) revert ZeroAmount();
        _totalManagedAssets -= assets;
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    // ============ Rewards Distribution ============

    /**
     * @dev Track rewards when distributed
     * @notice Follows checks-effects-interactions pattern
     * @dev Reverts if amount would increase totalAssets by more than maxRewardPercent
     */
    function distributeRewards(uint256 amount)
        external
        onlyRole(REWARDS_ADMIN_ROLE)
        nonReentrant
    {
        if (amount == 0) revert InvalidAmount();

        // Skip delta check when vault is empty (no existing NAV to protect)
        uint256 currentAssets = _totalManagedAssets;
        if (currentAssets > 0 && totalSupply() > 0) {
            uint256 maxAllowed = currentAssets.mulDiv(maxRewardPercent, 1e18);
            if (amount > maxAllowed) revert RewardExceedsMaxDelta(amount, maxAllowed);
        }

        // Effects: Track the new assets internally BEFORE external call
        _totalManagedAssets += amount;

        // Interactions: Mint wYLDS rewards to this vault
        IAutoYieldVault(yieldVault).mintRewards(address(this), amount);

        emit RewardsDistributed(amount, block.timestamp);
    }

    /**
     * @notice Update the maximum reward percent allowed in a single distributeRewards call
     * @param newPercent New maximum in 1e18 units (e.g. 0.2e18 = 20%). Must be > 0 and <= 1e18.
     */
    function setMaxRewardPercent(uint256 newPercent) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newPercent == 0 || newPercent > 1e18) revert InvalidAmount();
        uint256 oldPercent = maxRewardPercent;
        maxRewardPercent = newPercent;
        emit MaxRewardPercentUpdated(oldPercent, newPercent);
    }

    /**
     * @notice Set the Chainlink FeedVerifier NAV oracle address and feed ID.
     * @param oracle Address of the deployed FeedVerifier contract, or address(0) to revert to
     *               the on-chain ERC-4626 ratio fallback.
     * @param feedId Chainlink feedId this vault should read NAV from.
     */
    function setNavOracle(address oracle, bytes32 feedId) external onlyRole(NAV_ORACLE_UPDATER_ROLE) {
        address old = navOracle;
        navOracle = oracle;
        navFeedId = feedId;
        emit NavOracleUpdated(old, oracle, feedId);
    }

    /**
     * @notice Returns the latest verified NAV from the Chainlink oracle (1e18 scaled).
     * @dev Reverts if the oracle is not set or the price is <= 0.
     *      Staleness is enforced by FeedVerifier.priceOf() itself (via maxStaleness).
     * @return nav Exchange rate in 1e18 units (e.g. 1e18 = 1.0 wYLDS per share).
     */
    function getVerifiedNav() public view returns (uint256 nav) {
        if (navOracle == address(0)) revert InvalidAddress();
        int192 price = IAutoFeedVerifier(navOracle).priceOf(navFeedId);
        if (price <= 0) revert NavInvalid();
        nav = uint256(uint192(price));
    }

    /**
     * @notice Returns the total vault assets denominated in the NAV-adjusted underlying value.
     * @dev Reverts if the oracle is not configured. Use totalAssets() for the raw wYLDS balance.
     * @return Total value = totalAssets * navRate / 1e18.
     */
    function getTotalValueAtNav() public view returns (uint256) {
        return Math.mulDiv(totalAssets(), getVerifiedNav(), 1e18);
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

    function _update(address from, address to, uint256 amount)
        internal
        override(ERC20Upgradeable)
    {
        if (from != address(0) && frozen[from]) revert AccountIsFrozen();
        if (to != address(0) && frozen[to]) revert AccountIsFrozen();
        super._update(from, to, amount);
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

    // ============ View Functions ============

    function decimals() public view override(ERC4626Upgradeable, ERC20Upgradeable) returns (uint8) {
        return super.decimals();
    }
}
