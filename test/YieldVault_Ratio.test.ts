import {expect} from "chai";
import pkg from "hardhat";
const { ethers, upgrades } = pkg;
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";

describe("YieldVault Ratio Checks", function () {
  async function deployFixture() {
    const [owner, userA] = await ethers.getSigners();

    // 1. Setup Tokens
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    
    // 2. Setup YieldVault
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await upgrades.deployProxy(YieldVault, [
      await usdc.getAddress(), 
      "wYLDS", 
      "wYLDS", 
      owner.address, 
      owner.address, 
      ethers.ZeroAddress
    ], { kind: 'uups' });
    
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
    
    const expectedTotal = initialMint - redeemAmount + secondMint;
    expect(await yieldVault.balanceOf(userA.address)).to.equal(expectedTotal);
  });

  it("Should maintain 1:1 ratio even if extra assets are sent to vault", async function () {
    const { yieldVault, usdc, userA, owner } = await loadFixture(deployFixture);
    const amount = ethers.parseUnits("1000", 6);
    const extraAmount = ethers.parseUnits("500", 6);

    // 1. Initial Deposit
    await usdc.mint(userA.address, amount);
    await usdc.connect(userA).approve(await yieldVault.getAddress(), amount);
    await yieldVault.connect(userA).deposit(amount, userA.address);
    
    // 2. Simulate "Yield" or accidental transfer by sending USDC directly to vault
    await usdc.mint(owner.address, extraAmount);
    await usdc.connect(owner).transfer(await yieldVault.getAddress(), extraAmount);
    
    // Verify totalAssets > totalSupply
    expect(await yieldVault.totalAssets()).to.be.greaterThan(await yieldVault.totalSupply());

    // 3. New deposit should still be 1:1
    const depositAmount = ethers.parseUnits("100", 6);
    await usdc.mint(userA.address, depositAmount);
    await usdc.connect(userA).approve(await yieldVault.getAddress(), depositAmount);
    
    const balanceBefore = await yieldVault.balanceOf(userA.address);
    await yieldVault.connect(userA).deposit(depositAmount, userA.address);
    const balanceAfter = await yieldVault.balanceOf(userA.address);

    expect(balanceAfter - balanceBefore).to.equal(depositAmount, "Ratio must remain 1:1 despite extra assets");
  });

  it("Should maintain 1:1 ratio with multiple users and interleaved actions", async function () {
    const [owner, user1, user2, user3] = await ethers.getSigners();
    // Setup fresh fixture manualy since we need more users
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await upgrades.deployProxy(YieldVault, [
        await usdc.getAddress(), "wYLDS", "wYLDS", owner.address, owner.address, ethers.ZeroAddress
    ], { kind: 'uups' });

    const amount = ethers.parseUnits("1000", 6);
    
    // Fund users
    for (const user of [user1, user2, user3]) {
        await usdc.mint(user.address, amount * 10n);
        await usdc.connect(user).approve(await yieldVault.getAddress(), ethers.MaxUint256);
    }

    // 1. User 1 deposits 1000
    await yieldVault.connect(user1).deposit(amount, user1.address);
    expect(await yieldVault.balanceOf(user1.address)).to.equal(amount);

    // 2. User 2 deposits 500
    await yieldVault.connect(user2).deposit(amount / 2n, user2.address);
    expect(await yieldVault.balanceOf(user2.address)).to.equal(amount / 2n);

    // 3. User 1 requests redeem 200
    await yieldVault.connect(user1).requestRedeem(ethers.parseUnits("200", 6));
    
    // 4. User 3 deposits 2000
    await yieldVault.connect(user3).deposit(amount * 2n, user3.address);
    expect(await yieldVault.balanceOf(user3.address)).to.equal(amount * 2n);

    // 5. Complete User 1 redeem (admin step)
    const REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
    await yieldVault.grantRole(REWARDS_ADMIN_ROLE, owner.address);
    await usdc.mint(owner.address, ethers.parseUnits("10000", 6));
    await usdc.connect(owner).approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await yieldVault.completeRedeem(user1.address);

    // 6. User 2 deposits another 500
    const balanceBefore = await yieldVault.balanceOf(user2.address);
    await yieldVault.connect(user2).deposit(amount / 2n, user2.address);
    const balanceAfter = await yieldVault.balanceOf(user2.address);
    
    // Critical check
    expect(balanceAfter - balanceBefore).to.equal(amount / 2n);
    
    // 7. Check total invariant
    // User 1: 1000 - 200 redeemed = 800
    // User 2: 500 + 500 = 1000
    // User 3: 2000
    // Total Supply should be 3800
    expect(await yieldVault.totalSupply()).to.equal(ethers.parseUnits("3800", 6));
  });
});
