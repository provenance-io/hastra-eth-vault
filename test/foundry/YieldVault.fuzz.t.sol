// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "../../contracts/YieldVault.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title YieldVaultFuzzTest
 * @notice Fuzz testing for YieldVault critical invariants
 */
contract YieldVaultFuzzTest is Test {
    YieldVault public vault;
    MockUSDC public usdc;
    address public admin;
    address public redeemVault;
    address public alice = address(0x1);
    address public bob = address(0x2);

    function setUp() public {
        admin = address(this);
        redeemVault = address(0x999);

        usdc = new MockUSDC();
        YieldVault impl = new YieldVault();

        bytes memory initData = abi.encodeWithSelector(
            YieldVault.initialize.selector,
            IERC20(address(usdc)),
            "Wrapped YLDS",
            "wYLDS",
            admin,
            redeemVault,
            address(0)
        );

        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        vault = YieldVault(address(proxy));

        vault.grantRole(vault.WHITELIST_ADMIN_ROLE(), admin);
        vault.addToWhitelist(alice);
        vault.addToWhitelist(bob);

        usdc.mint(alice, type(uint128).max);
        usdc.mint(bob, type(uint128).max);
    }

    function testFuzz_Solvency(uint128 depositAmount) public {
        depositAmount = uint128(bound(depositAmount, 1e6, 1_000_000_000e6)); // 1 USDC to 1B USDC

        vm.startPrank(alice);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount, alice);
        vm.stopPrank();

        assertGe(vault.totalAssets(), vault.totalSupply(), "Vault insolvent");
    }

    function testFuzz_ProportionalShares(uint128 deposit1, uint128 deposit2) public {
        deposit1 = uint128(bound(deposit1, 1e6, 1_000_000_000e6)); // 1 USDC to 1B USDC
        deposit2 = uint128(bound(deposit2, 1e6, 1_000_000_000e6)); // 1 USDC to 1B USDC

        vm.startPrank(alice);
        usdc.approve(address(vault), deposit1);
        uint256 aliceShares = vault.deposit(deposit1, alice);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(vault), deposit2);
        uint256 bobShares = vault.deposit(deposit2, bob);
        vm.stopPrank();

        uint256 totalShares = vault.totalSupply();
        uint256 totalAssets = vault.totalAssets();

        assertApproxEqAbs(
            vault.convertToAssets(aliceShares),
            (aliceShares * totalAssets) / totalShares,
            2,
            "Alice proportion wrong"
        );
    }

    function testFuzz_NoUnauthorizedMinting(address attacker, uint128 amount) public {
        vm.assume(attacker != address(0) && attacker != address(vault) && attacker != admin);
        amount = uint128(bound(amount, 1e6, type(uint128).max));

        uint256 supplyBefore = vault.totalSupply();

        vm.startPrank(attacker);
        usdc.mint(attacker, amount);
        usdc.transfer(address(vault), amount);
        vm.stopPrank();

        assertEq(vault.totalSupply(), supplyBefore, "Unauthorized minting");
    }

    function testFuzz_InflationAttackResistance(uint128 initialDeposit, uint128 donation) public {
        initialDeposit = uint128(bound(initialDeposit, 1e6, 10_000e6)); // Keep small for first depositor
        donation = uint128(bound(donation, 1e6, 1_000_000_000e6)); // Attacker could donate huge amount

        vm.startPrank(alice);
        usdc.approve(address(vault), initialDeposit);
        uint256 aliceShares = vault.deposit(initialDeposit, alice);
        vm.stopPrank();

        usdc.mint(address(vault), donation);

        vm.startPrank(bob);
        usdc.approve(address(vault), initialDeposit);
        uint256 bobShares = vault.deposit(initialDeposit, bob);
        vm.stopPrank();

        assertGt(bobShares, 0, "Bob got no shares");
    }
}

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
