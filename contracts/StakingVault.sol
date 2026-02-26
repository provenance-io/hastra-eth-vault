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
interface IYieldVault {
    function mintRewards(address to, uint256 amount) external;
}

/**
 * @title StakingVault
 * @author Hastra
 * @notice Upgradeable ERC-4626 staking vault
 */
contract StakingVault is 
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

    /// @dev Storage gap for future upgrades (reserves 48 storage slots)
    uint256[48] private __gap;
    
    // ============ Events ============
    
    event RewardsDistributed(uint256 amount, uint256 timestamp);
    event AccountFrozen(address indexed account);
    event AccountThawed(address indexed account);
    event YieldVaultUpdated(address oldVault, address newVault);
    event MaxRewardPercentUpdated(uint256 oldValue, uint256 newValue);
    
    // ============ Errors ============

    error AccountIsFrozen();
    error AccountNotFrozen();
    error InvalidAmount();
    error InvalidAddress();
    error ZeroAmount();
    error RewardExceedsMaxDelta(uint256 amount, uint256 maxAllowed);
    
    // ============ Constructor ============
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the StakingVault
     * @param asset_ The underlying asset (e.g., wYLDS from YieldVault)
     * @param name_ Name of the stake token (e.g., "Prime Staked YLDS")
     * @param symbol_ Symbol of the stake token (e.g., "PRIME")
     * @param admin_ Address of the default admin
     * @param yieldVault_ Address of the YieldVault contract for minting rewards
     * @dev Grants only essential roles (DEFAULT_ADMIN, PAUSER, UPGRADER) to admin_.
     *      Additional roles (REWARDS_ADMIN, FREEZE_ADMIN) should be granted to
     *      appropriate addresses post-deployment for role separation.
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
        
        // Note: Additional roles (REWARDS_ADMIN, FREEZE_ADMIN) are intentionally NOT granted
        // here to support role separation in production. The deployment script (deploy.ts)
        // grants these roles to separate addresses for security best practices:
        //   - FREEZE_ADMIN can freeze/thaw staker accounts
        //   - REWARDS_ADMIN can distribute wYLDS rewards to stakers
        
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
        IERC20Permit(asset()).permit(msg.sender, address(this), assets, deadline, v, r, s);
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
    
    // ============ Rewards Distribution ============
    
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
        IYieldVault(yieldVault).mintRewards(address(this), amount);

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