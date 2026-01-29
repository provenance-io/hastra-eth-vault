// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
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
 * @notice ERC-4626 compliant staking vault with unbonding periods
 * @dev Implements a vault where users stake wYLDS and receive PRIME tokens (shares).
 *      Features include:
 *      - Share-based staking (ERC-4626 compliant)
 *      - Unbonding period before withdrawal
 *      - Account freeze/thaw functionality
 *      - Integration with YieldVault for rewards distribution
 *      - As rewards are added to the vault, share value increases
 */
contract StakingVault is ERC4626, ERC20Permit, AccessControl, Pausable, ReentrancyGuard {
    using Math for uint256;
    
    // ============ Roles ============
    
    /// @notice Role for managing frozen accounts
    bytes32 public constant FREEZE_ADMIN_ROLE = keccak256("FREEZE_ADMIN");
    
    /// @notice Role for distributing rewards
    bytes32 public constant REWARDS_ADMIN_ROLE = keccak256("REWARDS_ADMIN");
    
    /// @notice Role for pausing the contract
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    // ============ State Variables ============

    /// @notice Reference to the YieldVault for minting wYLDS rewards
    address public immutable yieldVault;
    
    /// @notice Mapping of frozen account status
    mapping(address => bool) public frozen;
    
    // ============ Events ============
    
    /// @notice Emitted when rewards are distributed
    event RewardsDistributed(uint256 amount, uint256 timestamp);
    
    /// @notice Emitted when an account is frozen
    event AccountFrozen(address indexed account);
    
    /// @notice Emitted when an account is thawed
    event AccountThawed(address indexed account);
    
    // ============ Errors ============

    error AccountIsFrozen();
    error AccountNotFrozen();
    error InvalidAmount();
    error InvalidAddress();
    
    // ============ Constructor ============
    
    /**
     * @notice Initializes the StakingVault
     * @param asset_ The underlying asset (e.g., wYLDS from YieldVault)
     * @param name_ Name of the stake token (e.g., "Prime Staked YLDS")
     * @param symbol_ Symbol of the stake token (e.g., "PRIME")
     * @param admin_ Address of the default admin
     * @param yieldVault_ Address of the YieldVault contract for minting rewards
     */
    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        address admin_,
        address yieldVault_
    )
        ERC4626(asset_)
        ERC20(name_, symbol_)
        ERC20Permit(name_)
    {
        if (admin_ == address(0)) revert InvalidAddress();
        if (yieldVault_ == address(0)) revert InvalidAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        yieldVault = yieldVault_;
    }
    
    // ============ Deposit & Withdraw Overrides ============
    
    /**
     * @notice Deposits assets and mints shares (ERC-4626 override with pause check)
     */
    function deposit(uint256 assets, address receiver)
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256 shares)
    {
        return super.deposit(assets, receiver);
    }
    
    /**
     * @notice Deposit with permit - one transaction approval + deposit
     */
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
    
    /**
     * @notice Mints shares by depositing assets (ERC-4626 override with pause check)
     */
    function mint(uint256 shares, address receiver)
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256 assets)
    {
        return super.mint(shares, receiver);
    }
    
    /**
     * @notice Redeems shares for assets (ERC-4626 override with pause check)
     */
    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256 assets)
    {
        return super.redeem(shares, receiver, owner);
    }

    /**
     * @notice Withdraws assets by burning shares (ERC-4626 override with pause check)
     */
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
    
    /**
     * @notice Distribute rewards by minting wYLDS from YieldVault
     * @dev Called by rewards admin. Mints wYLDS to this vault, increasing share value for all stakers
     * @param amount Amount of wYLDS to mint as rewards
     */
    function distributeRewards(uint256 amount)
        external
        onlyRole(REWARDS_ADMIN_ROLE)
        nonReentrant
    {
        if (amount == 0) revert InvalidAmount();

        // Mint wYLDS rewards from YieldVault to this vault
        IYieldVault(yieldVault).mintRewards(address(this), amount);

        emit RewardsDistributed(amount, block.timestamp);
    }
    
    // ============ Freeze Functionality ============
    
    /**
     * @notice Freeze an account, preventing transfers
     * @param account Address to freeze
     */
    function freezeAccount(address account) external onlyRole(FREEZE_ADMIN_ROLE) {
        if (frozen[account]) revert AccountIsFrozen();
        frozen[account] = true;
        emit AccountFrozen(account);
    }
    
    /**
     * @notice Thaw a frozen account, allowing transfers
     * @param account Address to thaw
     */
    function thawAccount(address account) external onlyRole(FREEZE_ADMIN_ROLE) {
        if (!frozen[account]) revert AccountNotFrozen();
        frozen[account] = false;
        emit AccountThawed(account);
    }
    
    /**
     * @notice Override transfer to check frozen status
     */
    function _update(address from, address to, uint256 amount)
        internal
        override(ERC20)
    {
        // Allow minting and burning
        if (from != address(0) && frozen[from]) revert AccountIsFrozen();
        if (to != address(0) && frozen[to]) revert AccountIsFrozen();

        super._update(from, to, amount);
    }
    
    // ============ Admin Functions ============
    
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
    
    // ============ View Functions ============

    /**
     * @notice Override decimals to resolve ERC20/ERC4626 conflict
     */
    function decimals() public view override(ERC4626, ERC20) returns (uint8) {
        return super.decimals();
    }
}

