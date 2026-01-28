import {expect} from "chai";
import pkg from "hardhat";
const { ethers } = pkg;
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";

describe("YieldVault Ratio Checks", function () {
  async function deployFixture() {
    const [owner, userA] = await ethers.getSigners();

    // 1. Setup Tokens
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    
    // 2. Setup YieldVault
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await YieldVault.deploy(
      await usdc.getAddress(), 
      "wYLDS", 
      "wYLDS", 
      owner.address, 
      owner.address, 
      ethers.ZeroAddress
    );
    
    return { yieldVault, usdc, userA, owner };
  }

  it("Should enforce 1:1 ratio in view functions (convertToShares/convertToAssets)", async function () {
    const { yieldVault } = await loadFixture(deployFixture);

    const amount = ethers.parseUnits("100", 6);
    
    // Check 1 Asset = 1 Share
    expect(await yieldVault.convertToShares(amount)).to.equal(amount);
    
    // Check 1 Share = 1 Asset
    expect(await yieldVault.convertToAssets(amount)).to.equal(amount);
  });

  it("Should mint exact 1:1 shares on deposit", async function () {
    const { yieldVault, usdc, userA } = await loadFixture(deployFixture);
    const amount = ethers.parseUnits("500", 6);

    // Setup User A
    await usdc.mint(userA.address, amount);
    await usdc.connect(userA).approve(await yieldVault.getAddress(), amount);
    
    const balanceBefore = await yieldVault.balanceOf(userA.address);
    
    // Deposit
    await yieldVault.connect(userA).deposit(amount, userA.address);
    
    const balanceAfter = await yieldVault.balanceOf(userA.address);

    expect(balanceAfter - balanceBefore).to.equal(amount);
  });

  it("Should require exact 1:1 assets on mint", async function () {
    const { yieldVault, usdc, userA } = await loadFixture(deployFixture);
    const amount = ethers.parseUnits("500", 6);

    // Setup User A
    await usdc.mint(userA.address, amount);
    await usdc.connect(userA).approve(await yieldVault.getAddress(), amount);
    
    const usdcBefore = await usdc.balanceOf(userA.address);
    
    // Mint
    await yieldVault.connect(userA).mint(amount, userA.address);
    
    const usdcAfter = await usdc.balanceOf(userA.address);

    expect(usdcBefore - usdcAfter).to.equal(amount);
  });

  it("Should maintain 1:1 ratio through two-step redemption", async function () {
    const { yieldVault, usdc, userA, owner } = await loadFixture(deployFixture);
    const amount = ethers.parseUnits("1000", 6);

    // 1. Initial Deposit
    await usdc.mint(userA.address, amount);
    await usdc.connect(userA).approve(await yieldVault.getAddress(), amount);
    await yieldVault.connect(userA).deposit(amount, userA.address);

    // 2. Request Redemption
    const redeemAmount = ethers.parseUnits("400", 6);
    await yieldVault.connect(userA).requestRedeem(redeemAmount);
    
    const pending = await yieldVault.getPendingRedemption(userA.address);
    expect(pending.shares).to.equal(redeemAmount);
    expect(pending.assets).to.equal(redeemAmount);

    // 3. Complete Redemption (Requires REWARDS_ADMIN_ROLE and funded redeemVault)
    const REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
    await yieldVault.grantRole(REWARDS_ADMIN_ROLE, owner.address);
    
    // In fixture, owner is the redeemVault. Fund it.
    await usdc.mint(owner.address, redeemAmount);
    await usdc.connect(owner).approve(await yieldVault.getAddress(), redeemAmount);

    const userUsdcBefore = await usdc.balanceOf(userA.address);
    await yieldVault.completeRedeem(userA.address);
    const userUsdcAfter = await usdc.balanceOf(userA.address);

    expect(userUsdcAfter - userUsdcBefore).to.equal(redeemAmount);
    
    // Check shares were burned
    expect(await yieldVault.balanceOf(userA.address)).to.equal(amount - redeemAmount);
  });

  it("Should maintain 1:1 ratio in full cycle (Mint -> Redeem -> Complete -> Mint)", async function () {
    const { yieldVault, usdc, userA, owner } = await loadFixture(deployFixture);
    const initialMint = ethers.parseUnits("1000", 6);
    const redeemAmount = ethers.parseUnits("500", 6);
    const secondMint = ethers.parseUnits("300", 6);

    // Setup: Mint initial tokens to owner (redeemVault) for funding redemptions
    await usdc.mint(owner.address, redeemAmount);
    await usdc.connect(owner).approve(await yieldVault.getAddress(), ethers.MaxUint256);

    // Setup: Grant roles
    const REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
    await yieldVault.grantRole(REWARDS_ADMIN_ROLE, owner.address);

    // 1. First Mint
    await usdc.mint(userA.address, initialMint + secondMint);
    await usdc.connect(userA).approve(await yieldVault.getAddress(), ethers.MaxUint256);
    
    await yieldVault.connect(userA).mint(initialMint, userA.address);
    expect(await yieldVault.balanceOf(userA.address)).to.equal(initialMint);

    // 2. Request Redeem
    await yieldVault.connect(userA).requestRedeem(redeemAmount);
    
    // 3. Complete Redeem
    await yieldVault.completeRedeem(userA.address);
    expect(await yieldVault.balanceOf(userA.address)).to.equal(initialMint - redeemAmount);

    // 4. Second Mint (The critical check)
    const balanceBeforeSecondMint = await yieldVault.balanceOf(userA.address);
    await yieldVault.connect(userA).mint(secondMint, userA.address);
    const balanceAfterSecondMint = await yieldVault.balanceOf(userA.address);

    // Verify ratio for second mint
    const sharesMinted = balanceAfterSecondMint - balanceBeforeSecondMint;
    expect(sharesMinted).to.equal(secondMint, "Second mint should still be 1:1");
    
    // Verify total state
    const expectedTotal = initialMint - redeemAmount + secondMint;
    expect(await yieldVault.balanceOf(userA.address)).to.equal(expectedTotal);
  });
});
