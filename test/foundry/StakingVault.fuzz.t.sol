// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "../../contracts/StakingVault.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title StakingVaultFuzzTest
 * @notice Fuzz testing for StakingVault critical invariants
 */
contract StakingVaultFuzzTest is Test {
    StakingVault public stakingVault;
    MockWYLDS public wYLDS;
    address public admin;
    address public alice = address(0x1);
    address public bob = address(0x2);

    function setUp() public {
        admin = address(this);

        wYLDS = new MockWYLDS();

        StakingVault impl = new StakingVault();

        bytes memory initData = abi.encodeWithSelector(
            StakingVault.initialize.selector,
            IERC20(address(wYLDS)),
            "PRIME Token",
            "PRIME",
            admin,
            admin
        );

        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        stakingVault = StakingVault(address(proxy));

        stakingVault.grantRole(stakingVault.REWARDS_ADMIN_ROLE(), admin);

        wYLDS.mint(alice, type(uint128).max);
        wYLDS.mint(bob, type(uint128).max);
        wYLDS.mint(admin, type(uint128).max);
    }

    // Implement mintRewards for StakingVault to call
    function mintRewards(address to, uint256 amount) external {
        require(msg.sender == address(stakingVault), "Only vault");
        wYLDS.mint(to, amount);
    }

    function testFuzz_SharePriceMonotonic(uint96 deposit, uint96 reward) public {
        vm.assume(deposit >= 1e6 && deposit <= 1_000_000_000e6); // 1 USDC to 1B USDC
        vm.assume(reward >= 1e6 && reward <= 500_000_000e6);     // 1 USDC to 500M USDC

        vm.startPrank(alice);
        wYLDS.approve(address(stakingVault), deposit);
        stakingVault.deposit(deposit, alice);
        vm.stopPrank();

        uint256 priceAfterDeposit = stakingVault.convertToAssets(1e6);

        wYLDS.approve(address(stakingVault), reward);
        stakingVault.distributeRewards(reward);

        uint256 priceAfterReward = stakingVault.convertToAssets(1e6);

        assertGe(priceAfterReward, priceAfterDeposit, "Share price decreased");
    }

    function testFuzz_InflationAttackProtection(uint128 initialDeposit, uint128 donation) public {
        initialDeposit = uint128(bound(initialDeposit, 1e6, 10_000e6));        // Keep small for first depositor
        donation = uint128(bound(donation, 1e6, 1_000_000_000e6));             // Attacker could donate huge amount

        vm.startPrank(alice);
        wYLDS.approve(address(stakingVault), initialDeposit);
        uint256 aliceShares = stakingVault.deposit(initialDeposit, alice);
        vm.stopPrank();

        uint256 totalAssetsBefore = stakingVault.totalAssets();

        wYLDS.mint(address(stakingVault), donation);

        uint256 totalAssetsAfter = stakingVault.totalAssets();

        assertEq(totalAssetsAfter, totalAssetsBefore, "Donation affected totalAssets");

        vm.startPrank(bob);
        wYLDS.approve(address(stakingVault), initialDeposit);
        uint256 bobShares = stakingVault.deposit(initialDeposit, bob);
        vm.stopPrank();

        assertApproxEqRel(bobShares, aliceShares, 0.01e18, "Bob got unfair shares");
    }

    /// @notice INVARIANT: Rewards distributed proportionally to stake
    function testFuzz_RewardProportionality(uint256 aliceDeposit, uint256 bobDeposit, uint256 reward) public {
        // Allow small deposits, but keep rewards proportional to total deposits
        aliceDeposit = bound(aliceDeposit, 1e6, 1_000_000_000e6);     // $1 to $1B
        bobDeposit = bound(bobDeposit, 1e6, 1_000_000_000e6);         // $1 to $1B
        
        uint256 totalDeposits = aliceDeposit + bobDeposit;
        // Rewards should be 0.1% to 1000% of total deposits (realistic range)
        reward = bound(reward, totalDeposits / 1000, totalDeposits * 10);

        vm.startPrank(alice);
        wYLDS.approve(address(stakingVault), aliceDeposit);
        uint256 aliceShares = stakingVault.deposit(aliceDeposit, alice);
        vm.stopPrank();

        vm.startPrank(bob);
        wYLDS.approve(address(stakingVault), bobDeposit);
        uint256 bobShares = stakingVault.deposit(bobDeposit, bob);
        vm.stopPrank();

        uint256 aliceAssetsBefore = stakingVault.convertToAssets(aliceShares);
        uint256 bobAssetsBefore = stakingVault.convertToAssets(bobShares);

        wYLDS.approve(address(stakingVault), reward);
        stakingVault.distributeRewards(reward);

        uint256 aliceAssetsAfter = stakingVault.convertToAssets(aliceShares);
        uint256 bobAssetsAfter = stakingVault.convertToAssets(bobShares);

        uint256 aliceGain = aliceAssetsAfter - aliceAssetsBefore;
        uint256 bobGain = bobAssetsAfter - bobAssetsBefore;

        if (bobGain > 0 && aliceGain > 0) {
            uint256 expectedRatio = (aliceShares * 1e18) / bobShares;
            uint256 actualRatio = (aliceGain * 1e18) / bobGain;

            assertApproxEqRel(actualRatio, expectedRatio, 0.02e18, "Rewards not proportional");
        }
    }

    function testFuzz_NoUnauthorizedGains(uint96 deposit, uint96 reward) public {
        vm.assume(deposit >= 1e6 && deposit <= 1_000_000_000e6); // 1 USDC to 1B USDC
        vm.assume(reward >= 1e6 && reward <= 500_000_000e6);     // 1 USDC to 500M USDC

        uint256 bobSharesBefore = stakingVault.balanceOf(bob);

        vm.startPrank(alice);
        wYLDS.approve(address(stakingVault), deposit);
        stakingVault.deposit(deposit, alice);
        vm.stopPrank();

        wYLDS.approve(address(stakingVault), reward);
        stakingVault.distributeRewards(reward);

        assertEq(stakingVault.balanceOf(bob), bobSharesBefore, "Bob gained unauthorized shares");
    }
}

contract MockWYLDS is ERC20 {
    constructor() ERC20("Wrapped YLDS", "wYLDS") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
