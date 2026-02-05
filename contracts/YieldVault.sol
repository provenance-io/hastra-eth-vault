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
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title YieldVault
 * @author Hastra
 * @notice Upgradeable ERC-4626 yield-bearing vault
 */
contract YieldVault is 
    Initializable, 
    ERC4626Upgradeable, 
    ERC20PermitUpgradeable, 
    AccessControlUpgradeable, 
    PausableUpgradeable, 
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable 
{
    
    // ============ Roles ============
    
    bytes32 public constant FREEZE_ADMIN_ROLE = keccak256("FREEZE_ADMIN");
    bytes32 public constant REWARDS_ADMIN_ROLE = keccak256("REWARDS_ADMIN");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant WHITELIST_ADMIN_ROLE = keccak256("WHITELIST_ADMIN");
    bytes32 public constant WITHDRAWAL_ADMIN_ROLE = keccak256("WITHDRAWAL_ADMIN");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    
    // ============ State Variables ============
    
    address public redeemVault;
    mapping(address => PendingRedemption) public pendingRedemptions;
    mapping(uint256 => RewardsEpoch) public rewardsEpochs;
    mapping(bytes32 => bool) public claimedRewards;
    mapping(address => bool) public frozen;
    uint256 public currentEpochIndex;
    mapping(address => bool) public whitelistedAddresses;
    address[] private _whitelistArray;
    
    /// @dev Storage gap for future upgrades (allows adding up to 42 new state variables)
    /// @dev 50 slots total - 8 used = 42 available
    uint256[42] private __gap;
    
    // ============ Structs ============
    
    struct PendingRedemption {
        uint256 shares;
        uint256 assets;
        uint256 timestamp;
    }
    
    struct RewardsEpoch {
        bytes32 merkleRoot;
        uint256 totalRewards;
        uint256 timestamp;
    }
    
    // ============ Events ============
    
    event RedemptionRequested(address indexed user, uint256 shares, uint256 assets, uint256 timestamp);
    event RedemptionCompleted(address indexed user, uint256 shares, uint256 assets, uint256 timestamp);
    event RedemptionCancelled(address indexed user, uint256 shares);
    event RewardsEpochCreated(uint256 indexed epochIndex, bytes32 merkleRoot, uint256 totalRewards, uint256 timestamp);
    event RewardsClaimed(address indexed user, uint256 indexed epochIndex, uint256 amount);
    event AccountFrozen(address indexed account);
    event AccountThawed(address indexed account);
    event RedeemVaultUpdated(address indexed oldVault, address indexed newVault);
    event AddressWhitelisted(address indexed account);
    event AddressRemovedFromWhitelist(address indexed account);
    event USDCWithdrawn(address indexed to, uint256 amount, address indexed by);
    
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
    error AddressNotWhitelisted();
    error AddressAlreadyWhitelisted();
    error AddressNotInWhitelist();
    error CannotRemoveLastWhitelistedAddress();
    error AddressNotFoundInWhitelistArray();
    
    // ============ Constructor ============
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @notice Initializes the YieldVault
     */
    function initialize(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        address admin_,
        address redeemVault_,
        address initialWhitelist_
    ) public initializer {
        if (admin_ == address(0) || redeemVault_ == address(0)) {
            revert InvalidAddress();
        }

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
        
        redeemVault = redeemVault_;

        if (initialWhitelist_ != address(0)) {
            whitelistedAddresses[initialWhitelist_] = true;
            _whitelistArray.push(initialWhitelist_);
            emit AddressWhitelisted(initialWhitelist_);
        }
    }
    
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
    
    function withdraw(uint256, address, address) 
        public 
        pure 
        override 
        returns (uint256) 
    {
        revert("Use requestRedeem/completeRedeem");
    }
    
    function redeem(uint256, address, address) 
        public 
        pure 
        override 
        returns (uint256) 
    {
        revert("Use requestRedeem/completeRedeem");
    }
    
    // ============ Two-Step Redemption ============
    
    function requestRedeem(uint256 shares) external whenNotPaused nonReentrant {
        if (shares == 0) revert InvalidAmount();
        if (pendingRedemptions[msg.sender].shares != 0) {
            revert RedemptionAlreadyPending();
        }
        
        uint256 assets = convertToAssets(shares);
        _transfer(msg.sender, address(this), shares);
        
        pendingRedemptions[msg.sender] = PendingRedemption({
            shares: shares,
            assets: assets,
            timestamp: block.timestamp
        });
        
        emit RedemptionRequested(msg.sender, shares, assets, block.timestamp);
    }
    
    function completeRedeem(address user) 
        external 
        onlyRole(REWARDS_ADMIN_ROLE)
        nonReentrant 
    {
        PendingRedemption memory redemption = pendingRedemptions[user];
        if (redemption.shares == 0) revert NoRedemptionPending();
        
        uint256 vaultBalance = IERC20(asset()).balanceOf(redeemVault);
        if (vaultBalance < redemption.assets) {
            revert InsufficientVaultBalance();
        }
        
        delete pendingRedemptions[user];
        _burn(address(this), redemption.shares);
        
        SafeERC20.safeTransferFrom(
            IERC20(asset()),
            redeemVault,
            user,
            redemption.assets
        );
        
        emit RedemptionCompleted(user, redemption.shares, redemption.assets, block.timestamp);
    }
    
    function cancelRedeem() external nonReentrant {
        PendingRedemption memory redemption = pendingRedemptions[msg.sender];
        if (redemption.shares == 0) revert NoRedemptionPending();
        
        delete pendingRedemptions[msg.sender];
        _transfer(address(this), msg.sender, redemption.shares);
        
        emit RedemptionCancelled(msg.sender, redemption.shares);
    }
    
    // ============ Merkle Rewards ============
    
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
    
    function claimRewards(
        uint256 epochIndex,
        uint256 amount,
        bytes32[] calldata proof
    ) external whenNotPaused nonReentrant {
        if (epochIndex >= currentEpochIndex) revert InvalidEpoch();
        
        bytes32 claimKey = keccak256(abi.encodePacked(msg.sender, epochIndex));
        if (claimedRewards[claimKey]) revert RewardsAlreadyClaimed();
        
        RewardsEpoch memory epoch = rewardsEpochs[epochIndex];
        
        bytes32 leaf = keccak256(
            bytes.concat(keccak256(abi.encode(msg.sender, amount, epochIndex)))
        );
        
        if (!MerkleProof.verify(proof, epoch.merkleRoot, leaf)) {
            revert InvalidProof();
        }
        
        claimedRewards[claimKey] = true;
        _mint(msg.sender, amount);
        emit RewardsClaimed(msg.sender, epochIndex, amount);
    }
    
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
    
    function setRedeemVault(address newRedeemVault) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        if (newRedeemVault == address(0)) revert InvalidAddress();
        address oldVault = redeemVault;
        redeemVault = newRedeemVault;
        emit RedeemVaultUpdated(oldVault, newRedeemVault);
    }
    
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }
    
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
    
    // ============ Whitelist Functions ============
    
    function addToWhitelist(address account) external onlyRole(WHITELIST_ADMIN_ROLE) {
        if (account == address(0)) revert InvalidAddress();
        if (whitelistedAddresses[account]) revert AddressAlreadyWhitelisted();
        
        whitelistedAddresses[account] = true;
        _whitelistArray.push(account);
        
        emit AddressWhitelisted(account);
    }
    
    function removeFromWhitelist(address account) external onlyRole(WHITELIST_ADMIN_ROLE) {
        if (!whitelistedAddresses[account]) revert AddressNotInWhitelist();
        if (_whitelistArray.length <= 1) revert CannotRemoveLastWhitelistedAddress();
        
        whitelistedAddresses[account] = false;
        
        for (uint256 i = 0; i < _whitelistArray.length; i++) {
            if (_whitelistArray[i] == account) {
                _whitelistArray[i] = _whitelistArray[_whitelistArray.length - 1];
                _whitelistArray.pop();
                break;
            }
        }
        
        emit AddressRemovedFromWhitelist(account);
    }
    
    function withdrawUSDC(address to, uint256 amount)
        external
        onlyRole(WITHDRAWAL_ADMIN_ROLE)
        nonReentrant
    {
        if (to == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (!whitelistedAddresses[to]) revert AddressNotWhitelisted();
        
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        if (balance < amount) revert InsufficientVaultBalance();
        
        SafeERC20.safeTransfer(IERC20(asset()), to, amount);
        emit USDCWithdrawn(to, amount, msg.sender);
    }
    
    function isWhitelisted(address account) external view returns (bool) {
        return whitelistedAddresses[account];
    }
    
    function getWhitelistedAddresses() external view returns (address[] memory) {
        return _whitelistArray;
    }
    
    function getWhitelistCount() external view returns (uint256) {
        return _whitelistArray.length;
    }
    
    // ============ View Functions ============

    function convertToShares(uint256 assets) public pure override returns (uint256) {
        return assets;
    }

    function convertToAssets(uint256 shares) public pure override returns (uint256) {
        return shares;
    }

    function _convertToShares(uint256 assets, Math.Rounding /*rounding*/) internal pure override returns (uint256) {
        return assets;
    }

    function _convertToAssets(uint256 shares, Math.Rounding /*rounding*/) internal pure override returns (uint256) {
        return shares;
    }

    function decimals() public view override(ERC4626Upgradeable, ERC20Upgradeable) returns (uint8) {
        return super.decimals();
    }

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
    
    function hasClaimedRewards(address user, uint256 epochIndex) 
        external 
        view 
        returns (bool claimed) 
    {
        bytes32 claimKey = keccak256(abi.encodePacked(user, epochIndex));
        return claimedRewards[claimKey];
    }
}