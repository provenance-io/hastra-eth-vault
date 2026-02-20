import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type { MockUSDC, YieldVault } from "../../typechain-types";

describe("YieldVault - withdrawUSDC Security", function () {
  it("Should revert when withdrawing to non-whitelisted address", async function () {
    const [owner, redeemVault, nonWhitelisted] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy() as unknown as MockUSDC;
    await usdc.waitForDeployment();

    // Deploy YieldVault
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await upgrades.deployProxy(YieldVault, [
      await usdc.getAddress(),
      "Wrapped YLDS",
      "wYLDS",
      owner.address,
      redeemVault.address,
      ethers.ZeroAddress
    ], { kind: 'uups' }) as unknown as YieldVault;
    await yieldVault.waitForDeployment();

    // Give vault some USDC
    const amount = ethers.parseUnits("1000", 6);
    await usdc.mint(await yieldVault.getAddress(), amount);

    // Grant WITHDRAWAL_ADMIN_ROLE to owner (needed for withdrawUSDC)
    const WITHDRAWAL_ADMIN_ROLE = await yieldVault.WITHDRAWAL_ADMIN_ROLE();
    await yieldVault.grantRole(WITHDRAWAL_ADMIN_ROLE, owner.address);

    // Try to withdraw to non-whitelisted address - should revert
    await expect(
      yieldVault.withdrawUSDC(nonWhitelisted.address, ethers.parseUnits("10", 6))
    ).to.be.revertedWithCustomError(yieldVault, "AddressNotWhitelisted");
  });

  it("Should succeed when withdrawing to whitelisted address", async function () {
    const [owner, redeemVault, whitelisted] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy() as unknown as MockUSDC;
    await usdc.waitForDeployment();

    // Deploy YieldVault
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await upgrades.deployProxy(YieldVault, [
      await usdc.getAddress(),
      "Wrapped YLDS",
      "wYLDS",
      owner.address,
      redeemVault.address,
      ethers.ZeroAddress
    ], { kind: 'uups' }) as unknown as YieldVault;
    await yieldVault.waitForDeployment();

    // Give vault some USDC
    const vaultAmount = ethers.parseUnits("1000", 6);
    await usdc.mint(await yieldVault.getAddress(), vaultAmount);

    // Grant necessary roles to owner
    const WHITELIST_ADMIN_ROLE = await yieldVault.WHITELIST_ADMIN_ROLE();
    const WITHDRAWAL_ADMIN_ROLE = await yieldVault.WITHDRAWAL_ADMIN_ROLE();
    await yieldVault.grantRole(WHITELIST_ADMIN_ROLE, owner.address);
    await yieldVault.grantRole(WITHDRAWAL_ADMIN_ROLE, owner.address);

    // Whitelist the address
    await yieldVault.addToWhitelist(whitelisted.address);

    // Withdraw to whitelisted address - should succeed
    const withdrawAmount = ethers.parseUnits("10", 6);
    await expect(
      yieldVault.withdrawUSDC(whitelisted.address, withdrawAmount)
    ).to.not.be.reverted;

    // Verify balance
    expect(await usdc.balanceOf(whitelisted.address)).to.equal(withdrawAmount);
  });

  it("Should revert when non-admin tries to withdraw", async function () {
    const [owner, redeemVault, whitelisted, nonAdmin] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy() as unknown as MockUSDC;
    await usdc.waitForDeployment();

    // Deploy YieldVault
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await upgrades.deployProxy(YieldVault, [
      await usdc.getAddress(),
      "Wrapped YLDS",
      "wYLDS",
      owner.address,
      redeemVault.address,
      ethers.ZeroAddress
    ], { kind: 'uups' }) as unknown as YieldVault;
    await yieldVault.waitForDeployment();

    // Give vault some USDC
    const amount = ethers.parseUnits("1000", 6);
    await usdc.mint(await yieldVault.getAddress(), amount);

    // Grant roles to owner (not to nonAdmin)
    const WHITELIST_ADMIN_ROLE = await yieldVault.WHITELIST_ADMIN_ROLE();
    await yieldVault.grantRole(WHITELIST_ADMIN_ROLE, owner.address);

    // Whitelist the address
    await yieldVault.addToWhitelist(whitelisted.address);

    // Non-admin tries to withdraw - should revert with AccessControl error
    await expect(
      yieldVault.connect(nonAdmin).withdrawUSDC(whitelisted.address, ethers.parseUnits("10", 6))
    ).to.be.reverted; // Will revert with AccessControl error
  });
});
