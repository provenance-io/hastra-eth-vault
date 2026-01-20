// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title YieldVault
 * @author Hastra
 * @notice ERC-4626 compliant yield-bearing vault with two-step redemptions and merkle-based rewards
 * @dev Implements a vault where users deposit USDC and receive wYLDS tokens (shares).
 *      Features include:
 *      - Two-step redemption process for off-chain liquidity management
 *      - Merkle tree-based epoch rewards distribution
 *      - Account freeze/thaw functionality for compliance
 *      - Role-based access control for administration
 */
contract YieldVault is ERC4626, ERC20Permit, AccessControl, Pausable, ReentrancyGuard {
    
    // ============ Roles ============
    
    /// @notice Role for managing frozen accounts
    bytes32 public constant FREEZE_ADMIN_ROLE = keccak256("FREEZE_ADMIN");
    
    /// @notice Role for managing rewards and completing redemptions
    bytes32 public constant REWARDS_ADMIN_ROLE = keccak256("REWARDS_ADMIN");
    
    /// @notice Role for pausing the contract
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    // ============ State Variables ============
    
    /// @notice Address where off-chain entity funds redemptions
    address public redeemVault;
    
    /// @notice Mapping of pending redemption requests
    mapping(address => PendingRedemption) public pendingRedemptions;
    
    /// @notice Mapping of epoch index to rewards epoch data
    mapping(uint256 => RewardsEpoch) public rewardsEpochs;
    
    /// @notice Mapping to track claimed rewards per user per epoch
    /// @dev keccak256(abi.encodePacked(user, epochIndex)) => claimed
    mapping(bytes32 => bool) public claimedRewards;
    
    /// @notice Mapping of frozen account status
    mapping(address => bool) public frozen;
    
    /// @notice Latest epoch index
    uint256 public currentEpochIndex;
    
    // ============ Structs ============
    
    /**
     * @notice Represents a pending redemption request
     * @param shares Number of shares to redeem
     * @param assets Expected assets to receive (locked at request time)
     * @param timestamp When the redemption was requested
     */
    struct PendingRedemption {
        uint256 shares;
        uint256 assets;
        uint256 timestamp;
    }
    
    /**
     * @notice Represents a rewards epoch
     * @param merkleRoot Root of the merkle tree for this epoch's rewards
     * @param totalRewards Total rewards distributed in this epoch
     * @param timestamp When the epoch was created
     */
    struct RewardsEpoch {
        bytes32 merkleRoot;
        uint256 totalRewards;
        uint256 timestamp;
    }
    
    // ============ Events ============
    
    /// @notice Emitted when a redemption is requested
    event RedemptionRequested(
        address indexed user,
        uint256 shares,
        uint256 assets,
        uint256 timestamp
    );
    
    /// @notice Emitted when a redemption is completed
    event RedemptionCompleted(
        address indexed user,
        uint256 shares,
        uint256 assets,
        uint256 timestamp
    );
    
    /// @notice Emitted when a redemption is cancelled
    event RedemptionCancelled(address indexed user, uint256 shares);
    
    /// @notice Emitted when a new rewards epoch is created
    event RewardsEpochCreated(
        uint256 indexed epochIndex,
        bytes32 merkleRoot,
        uint256 totalRewards,
        uint256 timestamp
    );
    
    /// @notice Emitted when rewards are claimed
    event RewardsClaimed(
        address indexed user,
        uint256 indexed epochIndex,
        uint256 amount
    );
    
    /// @notice Emitted when an account is frozen
    event AccountFrozen(address indexed account);
    
    /// @notice Emitted when an account is thawed
    event AccountThawed(address indexed account);
    
    /// @notice Emitted when redeem vault address is updated
    event RedeemVaultUpdated(address indexed oldVault, address indexed newVault);
    
    // ============ Errors ============

    error AccountIsFrozen();
    error AccountNotFrozen();
    error NoRedemptionPending();
    error RedemptionAlreadyPending();
    error InvalidProof();
    error RewardsAlreadyClaimed();
    error InvalidEpoch();
    error InvalidAmount();
    error InvalidAddress();
    error InsufficientVaultBalance();
    
    // ============ Constructor ============
    
    /**
     * @notice Initializes the YieldVault
     * @param asset_ The underlying asset (e.g., USDC)
     * @param name_ Name of the share token (e.g., "Wrapped YLDS")
     * @param symbol_ Symbol of the share token (e.g., "wYLDS")
     * @param admin_ Address of the default admin
     * @param redeemVault_ Address where redemptions are funded from
     */
    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        address admin_,
        address redeemVault_
    ) 
        ERC4626(asset_)
        ERC20(name_, symbol_)
        ERC20Permit(name_)
    {
        if (admin_ == address(0) || redeemVault_ == address(0)) {
            revert InvalidAddress();
        }
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        redeemVault = redeemVault_;
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
     * @notice Standard withdraw is disabled - use two-step redemption process
     */
    function withdraw(uint256, address, address) 
        public 
        pure 
        override 
        returns (uint256) 
    {
        revert("Use requestRedeem/completeRedeem");
    }
    
    /**
     * @notice Standard redeem is disabled - use two-step redemption process
     */
    function redeem(uint256, address, address) 
        public 
        pure 
        override 
        returns (uint256) 
    {
        revert("Use requestRedeem/completeRedeem");
    }
    
    // ============ Two-Step Redemption ============
    
    /**
     * @notice Request a redemption (step 1 of 2)
     * @dev Creates a pending redemption that must be completed by a rewards admin
     *      after off-chain liquidity is arranged
     * @param shares Amount of shares to redeem
     */
    function requestRedeem(uint256 shares) external whenNotPaused nonReentrant {
        if (shares == 0) revert InvalidAmount();
        if (pendingRedemptions[msg.sender].shares != 0) {
            revert RedemptionAlreadyPending();
        }
        
        uint256 assets = convertToAssets(shares);
        
        // Lock the shares by transferring to this contract
        _transfer(msg.sender, address(this), shares);
        
        pendingRedemptions[msg.sender] = PendingRedemption({
            shares: shares,
            assets: assets,
            timestamp: block.timestamp
        });
        
        emit RedemptionRequested(msg.sender, shares, assets, block.timestamp);
    }
    
    /**
     * @notice Complete a redemption (step 2 of 2)
     * @dev Called by rewards admin after funding the redeem vault off-chain
     * @param user Address of the user whose redemption to complete
     */
    function completeRedeem(address user) 
        external 
        onlyRole(REWARDS_ADMIN_ROLE)
        nonReentrant 
    {
        PendingRedemption memory redemption = pendingRedemptions[user];
        
        if (redemption.shares == 0) revert NoRedemptionPending();
        
        // Verify redeem vault has sufficient balance
        uint256 vaultBalance = IERC20(asset()).balanceOf(redeemVault);
        if (vaultBalance < redemption.assets) {
            revert InsufficientVaultBalance();
        }
        
        // Clear the pending redemption
        delete pendingRedemptions[user];
        
        // Burn the locked shares
        _burn(address(this), redemption.shares);
        
        // Transfer assets from redeem vault to user
        // Note: Redeem vault must have approved this contract
        SafeERC20.safeTransferFrom(
            IERC20(asset()),
            redeemVault,
            user,
            redemption.assets
        );
        
        emit RedemptionCompleted(
            user,
            redemption.shares,
            redemption.assets,
            block.timestamp
        );
    }
    
    /**
     * @notice Cancel a pending redemption
     * @dev Returns shares to the user
     */
    function cancelRedeem() external nonReentrant {
        PendingRedemption memory redemption = pendingRedemptions[msg.sender];
        
        if (redemption.shares == 0) revert NoRedemptionPending();
        
        delete pendingRedemptions[msg.sender];
        
        // Return shares to user
        _transfer(address(this), msg.sender, redemption.shares);
        
        emit RedemptionCancelled(msg.sender, redemption.shares);
    }
    
    // ============ Merkle Rewards ============
    
    /**
     * @notice Create a new rewards epoch
     * @dev Only rewards admin can create epochs
     * @param epochIndex Index of the epoch (must be sequential)
     * @param merkleRoot Merkle root of the rewards distribution
     * @param totalRewards Total rewards being distributed in this epoch
     */
    function createRewardsEpoch(
        uint256 epochIndex,
        bytes32 merkleRoot,
        uint256 totalRewards
    ) external onlyRole(REWARDS_ADMIN_ROLE) {
        if (epochIndex != currentEpochIndex) revert InvalidEpoch();
        if (merkleRoot == bytes32(0)) revert InvalidAmount();
        
        rewardsEpochs[epochIndex] = RewardsEpoch({
            merkleRoot: merkleRoot,
            totalRewards: totalRewards,
            timestamp: block.timestamp
        });
        
        currentEpochIndex++;
        
        emit RewardsEpochCreated(epochIndex, merkleRoot, totalRewards, block.timestamp);
    }
    
    /**
     * @notice Claim rewards for a specific epoch
     * @dev Verifies merkle proof and mints reward shares
     * @param epochIndex Index of the epoch to claim from
     * @param amount Amount of rewards to claim
     * @param proof Merkle proof for the claim
     */
    function claimRewards(
        uint256 epochIndex,
        uint256 amount,
        bytes32[] calldata proof
    ) external whenNotPaused nonReentrant {
        if (epochIndex >= currentEpochIndex) revert InvalidEpoch();
        
        bytes32 claimKey = keccak256(abi.encodePacked(msg.sender, epochIndex));
        if (claimedRewards[claimKey]) revert RewardsAlreadyClaimed();
        
        RewardsEpoch memory epoch = rewardsEpochs[epochIndex];
        
        // Verify merkle proof
        bytes32 leaf = keccak256(
            bytes.concat(keccak256(abi.encode(msg.sender, amount, epochIndex)))
        );
        
        if (!MerkleProof.verify(proof, epoch.merkleRoot, leaf)) {
            revert InvalidProof();
        }
        
        // Mark as claimed
        claimedRewards[claimKey] = true;
        
        // Mint reward shares
        _mint(msg.sender, amount);
        
        emit RewardsClaimed(msg.sender, epochIndex, amount);
    }
    
    /**
     * @notice Mint reward shares to a recipient
     * @dev Only rewards admin can mint. Used by StakingVault for reward distribution
     * @param to Address to receive the minted shares
     * @param amount Amount of shares to mint
     */
    function mintRewards(address to, uint256 amount)
        external
        onlyRole(REWARDS_ADMIN_ROLE)
        nonReentrant
    {
        if (amount == 0) revert InvalidAmount();
        if (to == address(0)) revert InvalidAddress();
        _mint(to, amount);
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
     * @notice Update the redeem vault address
     * @param newRedeemVault New redeem vault address
     */
    function setRedeemVault(address newRedeemVault) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        if (newRedeemVault == address(0)) revert InvalidAddress();
        address oldVault = redeemVault;
        redeemVault = newRedeemVault;
        emit RedeemVaultUpdated(oldVault, newRedeemVault);
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
    
    // ============ View Functions ============

    /**
     * @notice Override decimals to resolve ERC20/ERC4626 conflict
     */
    function decimals() public view override(ERC4626, ERC20) returns (uint8) {
        return super.decimals();
    }

    /**
     * @notice Check if user has a pending redemption
     * @param user Address to check
     * @return hasPending True if user has pending redemption
     * @return shares Amount of shares pending
     * @return assets Amount of assets pending
     */
    function getPendingRedemption(address user) 
        external 
        view 
        returns (bool hasPending, uint256 shares, uint256 assets) 
    {
        PendingRedemption memory redemption = pendingRedemptions[user];
        return (
            redemption.shares != 0,
            redemption.shares,
            redemption.assets
        );
    }
    
    /**
     * @notice Check if rewards have been claimed
     * @param user Address to check
     * @param epochIndex Epoch to check
     * @return claimed True if already claimed
     */
    function hasClaimedRewards(address user, uint256 epochIndex) 
        external 
        view 
        returns (bool claimed) 
    {
        bytes32 claimKey = keccak256(abi.encodePacked(user, epochIndex));
        return claimedRewards[claimKey];
    }
}
