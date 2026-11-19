// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ITIP20.sol";

/**
 * @title YieldVaultTIP20
 * @author Hastra
 * @notice Tempo-native counterpart to YieldVault. Same collateral/redemption/rewards
 *         logic, but wYLDS is the real TIP-20 token (minted/burned externally via
 *         ISSUER_ROLE) instead of a share balance the vault mints on itself.
 * @dev Because wYLDS lives outside this contract, freezeAccount/thawAccount can only
 *      gate actions mediated by this vault (deposit, redeem, reward claims) — it cannot
 *      block a holder from transferring wYLDS peer-to-peer once it's in their wallet.
 */
contract YieldVaultTIP20 is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // ============ Roles ============

    bytes32 public constant FREEZE_ADMIN_ROLE = keccak256("FREEZE_ADMIN");
    bytes32 public constant REWARDS_ADMIN_ROLE = keccak256("REWARDS_ADMIN");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant WHITELIST_ADMIN_ROLE = keccak256("WHITELIST_ADMIN");
    bytes32 public constant WITHDRAWAL_ADMIN_ROLE = keccak256("WITHDRAWAL_ADMIN");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // ============ State Variables ============

    /// @notice Collateral asset (e.g. USDC) deposited 1:1 for wYLDS.
    IERC20 public asset;

    /// @notice The real wYLDS TIP-20 token. This vault must hold ISSUER_ROLE on it.
    ITIP20 public shareToken;

    address public redeemVault;
    mapping(address => PendingRedemption) public pendingRedemptions;
    mapping(uint256 => RewardsEpoch) public rewardsEpochs;
    mapping(bytes32 => bool) public claimedRewards;
    mapping(address => bool) public frozen;
    uint256 public currentEpochIndex;
    mapping(address => bool) public whitelistedAddresses;
    address[] private _whitelistArray;

    /// @dev Storage gap for future upgrades.
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

    event Deposit(address indexed sender, address indexed receiver, uint256 assets, uint256 shares);
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
     * @notice Initializes the YieldVaultTIP20.
     * @dev Grants only essential roles (DEFAULT_ADMIN, PAUSER, UPGRADER) to admin_.
     *      Additional roles should be granted post-deployment for role separation.
     *      This contract must separately be granted ISSUER_ROLE on shareToken_.
     */
    function initialize(
        IERC20 asset_,
        ITIP20 shareToken_,
        address admin_,
        address redeemVault_,
        address initialWhitelist_
    ) public initializer {
        if (admin_ == address(0) || redeemVault_ == address(0) || address(shareToken_) == address(0)) {
            revert InvalidAddress();
        }

        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        asset = asset_;
        shareToken = shareToken_;

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

    // ============ Deposit ============

    function deposit(uint256 assets, address receiver)
        public
        whenNotPaused
        nonReentrant
        returns (uint256 shares)
    {
        if (frozen[msg.sender]) revert AccountIsFrozen();
        if (frozen[receiver]) revert AccountIsFrozen();
        if (assets == 0) revert InvalidAmount();

        shares = convertToShares(assets);
        asset.safeTransferFrom(msg.sender, address(this), assets);
        shareToken.mint(receiver, shares);

        emit Deposit(msg.sender, receiver, assets, shares);
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
        if (assets == 0) revert InvalidAmount();

        // Guard against permit front-running: a front-runner consuming the nonce also
        // sets the allowance, so deposit via transferFrom will still succeed.
        try IERC20Permit(address(asset)).permit(msg.sender, address(this), assets, deadline, v, r, s) {} catch {}

        shares = convertToShares(assets);
        asset.safeTransferFrom(msg.sender, address(this), assets);
        shareToken.mint(receiver, shares);

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    // ============ Two-Step Redemption ============

    function requestRedeem(uint256 shares) external whenNotPaused nonReentrant {
        if (frozen[msg.sender]) revert AccountIsFrozen();
        if (shares == 0) revert InvalidAmount();
        if (pendingRedemptions[msg.sender].shares != 0) {
            revert RedemptionAlreadyPending();
        }

        uint256 assets = convertToAssets(shares);
        IERC20(address(shareToken)).safeTransferFrom(msg.sender, address(this), shares);

        pendingRedemptions[msg.sender] = PendingRedemption({
            shares: shares,
            assets: assets,
            timestamp: block.timestamp
        });

        emit RedemptionRequested(msg.sender, shares, assets, block.timestamp);
    }

    function completeRedeem(address user)
        external
        virtual
        onlyRole(REWARDS_ADMIN_ROLE)
        nonReentrant
    {
        // Frozen accounts cannot receive USDC even through a pending redemption.
        // requestRedeem already moved shares into this contract.
        if (frozen[user]) revert AccountIsFrozen();

        PendingRedemption memory redemption = pendingRedemptions[user];
        if (redemption.shares == 0) revert NoRedemptionPending();

        uint256 vaultBalance = asset.balanceOf(redeemVault);
        if (vaultBalance < redemption.assets) {
            revert InsufficientVaultBalance();
        }

        delete pendingRedemptions[user];
        shareToken.burn(address(this), redemption.shares);

        asset.safeTransferFrom(redeemVault, user, redemption.assets);

        emit RedemptionCompleted(user, redemption.shares, redemption.assets, block.timestamp);
    }

    function cancelRedeem() external nonReentrant {
        if (frozen[msg.sender]) revert AccountIsFrozen();

        PendingRedemption memory redemption = pendingRedemptions[msg.sender];
        if (redemption.shares == 0) revert NoRedemptionPending();

        delete pendingRedemptions[msg.sender];
        IERC20(address(shareToken)).safeTransfer(msg.sender, redemption.shares);

        emit RedemptionCancelled(msg.sender, redemption.shares);
    }

    // ============ Merkle Rewards ============

    function createRewardsEpoch(
        uint256 epochIndex,
        bytes32 merkleRoot,
        uint256 totalRewards
    ) external virtual onlyRole(REWARDS_ADMIN_ROLE) {
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
    ) external virtual whenNotPaused nonReentrant {
        if (frozen[msg.sender]) revert AccountIsFrozen();
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
        shareToken.mint(msg.sender, amount);
        emit RewardsClaimed(msg.sender, epochIndex, amount);
    }

    function mintRewards(address to, uint256 amount)
        external
        onlyRole(REWARDS_ADMIN_ROLE)
        nonReentrant
    {
        if (amount == 0) revert InvalidAmount();
        if (to == address(0)) revert InvalidAddress();
        if (frozen[to]) revert AccountIsFrozen();
        shareToken.mint(to, amount);
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

        bool found = false;
        for (uint256 i = 0; i < _whitelistArray.length; i++) {
            if (_whitelistArray[i] == account) {
                _whitelistArray[i] = _whitelistArray[_whitelistArray.length - 1];
                _whitelistArray.pop();
                found = true;
                break;
            }
        }
        if (!found) revert AddressNotFoundInWhitelistArray();

        emit AddressRemovedFromWhitelist(account);
    }

    /// @notice Withdraw USDC to whitelisted addresses for treasury management.
    function withdrawUSDC(address to, uint256 amount)
        external
        onlyRole(WITHDRAWAL_ADMIN_ROLE)
        whenNotPaused
        nonReentrant
    {
        if (to == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (!whitelistedAddresses[to]) revert AddressNotWhitelisted();

        uint256 balance = asset.balanceOf(address(this));
        if (balance < amount) revert InsufficientVaultBalance();

        asset.safeTransfer(to, amount);
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

    function convertToShares(uint256 assets) public pure returns (uint256) {
        return assets;
    }

    function convertToAssets(uint256 shares) public pure returns (uint256) {
        return shares;
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
