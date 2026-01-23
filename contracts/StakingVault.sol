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
    
    // ============ Roles ============
    
    /// @notice Role for managing frozen accounts
    bytes32 public constant FREEZE_ADMIN_ROLE = keccak256("FREEZE_ADMIN");
    
    /// @notice Role for distributing rewards
    bytes32 public constant REWARDS_ADMIN_ROLE = keccak256("REWARDS_ADMIN");
    
    /// @notice Role for pausing the contract
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    // ============ State Variables ============

    /// @notice Duration in seconds that assets must wait before withdrawal
    uint256 public immutable UNBONDING_PERIOD;

    /// @notice Reference to the YieldVault for minting wYLDS rewards
    address public immutable yieldVault;

    /// @notice Mapping of user to their unbonding positions
    mapping(address => UnbondingPosition[]) public unbondingPositions;
    
    /// @notice Mapping of frozen account status
    mapping(address => bool) public frozen;
    
    /// @notice Total assets currently unbonding
    uint256 public totalUnbonding;
    
    // ============ Structs ============
    
    /**
     * @notice Represents an unbonding position
     * @param shares Number of shares being unbonded
     * @param assets Amount of assets locked (calculated at unbond time)
     * @param unlockTime Timestamp when assets can be withdrawn
     */
    struct UnbondingPosition {
        uint256 shares;
        uint256 assets;
        uint256 unlockTime;
    }
    
    // ============ Events ============
    
    /// @notice Emitted when a user initiates unbonding
    event Unbonded(
        address indexed user,
        uint256 positionIndex,
        uint256 shares,
        uint256 assets,
        uint256 unlockTime
    );
    
    /// @notice Emitted when unbonding is completed and assets withdrawn
    event UnbondingCompleted(
        address indexed user,
        uint256 positionIndex,
        uint256 shares,
        uint256 assets
    );
    
    /// @notice Emitted when unbonding is cancelled
    event UnbondingCancelled(
        address indexed user,
        uint256 positionIndex,
        uint256 shares
    );
    
    /// @notice Emitted when rewards are distributed
    event RewardsDistributed(uint256 amount, uint256 timestamp);
    
    /// @notice Emitted when an account is frozen
    event AccountFrozen(address indexed account);
    
    /// @notice Emitted when an account is thawed
    event AccountThawed(address indexed account);
    
    // ============ Errors ============

    error AccountIsFrozen();
    error AccountNotFrozen();
    error InvalidPositionIndex();
    error StillLocked();
    error InvalidAmount();
    error InvalidAddress();
    error InvalidUnbondingPeriod();
    
    // ============ Constructor ============
    
    /**
     * @notice Initializes the StakingVault
     * @param asset_ The underlying asset (e.g., wYLDS from YieldVault)
     * @param name_ Name of the stake token (e.g., "Prime Staked YLDS")
     * @param symbol_ Symbol of the stake token (e.g., "PRIME")
     * @param admin_ Address of the default admin
     * @param unbondingPeriod_ Duration in seconds for unbonding period
     * @param yieldVault_ Address of the YieldVault contract for minting rewards
     */
    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        address admin_,
        uint256 unbondingPeriod_,
        address yieldVault_
    )
        ERC4626(asset_)
        ERC20(name_, symbol_)
        ERC20Permit(name_)
    {
        if (admin_ == address(0)) revert InvalidAddress();
        if (unbondingPeriod_ == 0) revert InvalidUnbondingPeriod();
        if (yieldVault_ == address(0)) revert InvalidAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        UNBONDING_PERIOD = unbondingPeriod_;
        yieldVault = yieldVault_;
    }
    
    // ============ Deposit & Withdraw Overrides ============
    
    /**
     * @notice Deposits assets and mints shares (ERC-4626 override with pause check)
     * @param assets Amount of assets to deposit
     * @param receiver Address to receive shares
     * @return shares Amount of shares minted
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
     * @dev Uses EIP-2612 permit to approve and deposit in a single transaction
     * @param assets Amount of wYLDS to deposit
     * @param receiver Address to receive PRIME shares
     * @param deadline Permit signature deadline
     * @param v Signature v component
     * @param r Signature r component
     * @param s Signature s component
     * @return shares Amount of PRIME shares minted
     */
    function depositWithPermit(
        uint256 assets,
        address receiver,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external whenNotPaused nonReentrant returns (uint256 shares) {
        // Call permit on the underlying asset (wYLDS supports EIP-2612)
        IERC20Permit(asset()).permit(msg.sender, address(this), assets, deadline, v, r, s);
        
        // Perform the deposit
        return super.deposit(assets, receiver);
    }
    
    /**
     * @notice Mints shares by depositing assets (ERC-4626 override with pause check)
     * @param shares Amount of shares to mint
     * @param receiver Address to receive shares
     * @return assets Amount of assets deposited
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
     * @notice Standard withdraw is disabled - use unbonding process
     */
    function withdraw(uint256, address, address) 
        public 
        pure 
        override 
        returns (uint256) 
    {
        revert("Use unbond/completeUnbonding");
    }
    
    /**
     * @notice Standard redeem is disabled - use unbonding process
     */
    function redeem(uint256, address, address) 
        public 
        pure 
        override 
        returns (uint256) 
    {
        revert("Use unbond/completeUnbonding");
    }
    
    // ============ Unbonding Mechanism ============
    
    /**
     * @notice Initiate unbonding of staked assets
     * @dev Locks shares and starts unbonding timer
     * @param shares Amount of shares to unbond
     * @return positionIndex Index of the created unbonding position
     */
    function unbond(uint256 shares) 
        external 
        whenNotPaused 
        nonReentrant 
        returns (uint256 positionIndex) 
    {
        if (shares == 0) revert InvalidAmount();
        
        uint256 assets = convertToAssets(shares);
        uint256 unlockTime = block.timestamp + UNBONDING_PERIOD;
        
        // Transfer shares to this contract for locking
        _transfer(msg.sender, address(this), shares);
        
        // Create unbonding position
        unbondingPositions[msg.sender].push(UnbondingPosition({
            shares: shares,
            assets: assets,
            unlockTime: unlockTime
        }));
        
        positionIndex = unbondingPositions[msg.sender].length - 1;
        totalUnbonding += assets;
        
        emit Unbonded(msg.sender, positionIndex, shares, assets, unlockTime);
        
        return positionIndex;
    }
    
    /**
     * @notice Complete unbonding and withdraw assets
     * @dev Can only be called after unbonding period has elapsed
     * @param positionIndex Index of the unbonding position to complete
     */
    function completeUnbonding(uint256 positionIndex) 
        external 
        nonReentrant 
    {
        UnbondingPosition[] storage positions = unbondingPositions[msg.sender];
        
        if (positionIndex >= positions.length) revert InvalidPositionIndex();
        
        UnbondingPosition memory position = positions[positionIndex];
        
        if (block.timestamp < position.unlockTime) revert StillLocked();
        
        // Remove position by swapping with last and popping
        positions[positionIndex] = positions[positions.length - 1];
        positions.pop();
        
        totalUnbonding -= position.assets;
        
        // Burn the locked shares
        _burn(address(this), position.shares);
        
        // Transfer assets to user
        SafeERC20.safeTransfer(IERC20(asset()), msg.sender, position.assets);
        
        emit UnbondingCompleted(msg.sender, positionIndex, position.shares, position.assets);
    }
    
    /**
     * @notice Cancel an unbonding position and return shares to user
     * @param positionIndex Index of the unbonding position to cancel
     */
    function cancelUnbonding(uint256 positionIndex) 
        external 
        nonReentrant 
    {
        UnbondingPosition[] storage positions = unbondingPositions[msg.sender];
        
        if (positionIndex >= positions.length) revert InvalidPositionIndex();
        
        UnbondingPosition memory position = positions[positionIndex];
        
        // Remove position
        positions[positionIndex] = positions[positions.length - 1];
        positions.pop();
        
        totalUnbonding -= position.assets;
        
        // Return shares to user
        _transfer(address(this), msg.sender, position.shares);
        
        emit UnbondingCancelled(msg.sender, positionIndex, position.shares);
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

        // Note: Share value automatically increases since totalAssets()
        // now includes the new rewards, but totalSupply() remains the same
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

    /**
     * @notice Get total assets excluding unbonding amounts
     * @dev Override to exclude assets that are unbonding from yield calculations
     */
    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) - totalUnbonding;
    }
    
    /**
     * @notice Get all unbonding positions for a user
     * @param user Address to query
     * @return positions Array of unbonding positions
     */
    function getUnbondingPositions(address user) 
        external 
        view 
        returns (UnbondingPosition[] memory) 
    {
        return unbondingPositions[user];
    }
    
    /**
     * @notice Get count of unbonding positions for a user
     * @param user Address to query
     * @return count Number of unbonding positions
     */
    function getUnbondingPositionCount(address user) 
        external 
        view 
        returns (uint256 count) 
    {
        return unbondingPositions[user].length;
    }
    
    /**
     * @notice Check if a specific unbonding position is unlocked
     * @param user Address to query
     * @param positionIndex Index of the position
     * @return unlocked True if position can be completed
     */
    function isUnbondingUnlocked(address user, uint256 positionIndex) 
        external 
        view 
        returns (bool unlocked) 
    {
        if (positionIndex >= unbondingPositions[user].length) {
            return false;
        }
        return block.timestamp >= unbondingPositions[user][positionIndex].unlockTime;
    }
}
