import {expect} from "chai";
import {ethers} from "hardhat";
import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import {StakingVault} from "../typechain-types";

describe("StakingVault", function () {
  // ============ Fixtures ============
  
  async function deployStakingVaultFixture() {
    const [owner, redeemVault, freezeAdmin, rewardsAdmin, user1, user2, user3] = 
      await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    // Deploy YieldVault
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await YieldVault.deploy(
      await usdc.getAddress(),
      "Wrapped YLDS",
      "wYLDS",
      owner.address,
      redeemVault.address,
      ethers.ZeroAddress // No initial whitelist
    );
    await yieldVault.waitForDeployment();

    // Deploy StakingVault
    const unbondingPeriod = 21 * 24 * 60 * 60; // 21 days
    const StakingVault = await ethers.getContractFactory("StakingVault");
    const stakingVault = await StakingVault.deploy(
      await yieldVault.getAddress(),
      "Prime Staked YLDS",
      "PRIME",
      owner.address,
      unbondingPeriod,
      await yieldVault.getAddress()
    );
    await stakingVault.waitForDeployment();

    // Setup roles
    const FREEZE_ADMIN_ROLE = await stakingVault.FREEZE_ADMIN_ROLE();
    const REWARDS_ADMIN_ROLE = await stakingVault.REWARDS_ADMIN_ROLE();
    const YIELD_VAULT_REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();

    await stakingVault.grantRole(FREEZE_ADMIN_ROLE, freezeAdmin.address);
    await stakingVault.grantRole(REWARDS_ADMIN_ROLE, rewardsAdmin.address);

    // Grant YieldVault REWARDS_ADMIN_ROLE to StakingVault so it can mint wYLDS
    await yieldVault.grantRole(YIELD_VAULT_REWARDS_ADMIN_ROLE, await stakingVault.getAddress());

    // Mint USDC and deposit to get wYLDS
    const usdcAmount = ethers.parseUnits("100000", 6);
    await usdc.mint(user1.address, usdcAmount);
    await usdc.mint(user2.address, usdcAmount);
    await usdc.mint(user3.address, usdcAmount);
    await usdc.mint(rewardsAdmin.address, usdcAmount);

    await usdc.connect(user1).approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await usdc.connect(user2).approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await usdc.connect(user3).approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await usdc.connect(rewardsAdmin).approve(await yieldVault.getAddress(), ethers.MaxUint256);

    // Get wYLDS for users
    const wyldsAmount = ethers.parseUnits("50000", 6);
    await yieldVault.connect(user1).deposit(wyldsAmount, user1.address);
    await yieldVault.connect(user2).deposit(wyldsAmount, user2.address);
    await yieldVault.connect(user3).deposit(wyldsAmount, user3.address);
    await yieldVault.connect(rewardsAdmin).deposit(wyldsAmount, rewardsAdmin.address);

    // Approve staking vault
    await yieldVault.connect(user1).approve(await stakingVault.getAddress(), ethers.MaxUint256);
    await yieldVault.connect(user2).approve(await stakingVault.getAddress(), ethers.MaxUint256);
    await yieldVault.connect(user3).approve(await stakingVault.getAddress(), ethers.MaxUint256);
    await yieldVault.connect(rewardsAdmin).approve(await stakingVault.getAddress(), ethers.MaxUint256);

    return { 
      stakingVault, 
      yieldVault, 
      usdc, 
      owner, 
      freezeAdmin, 
      rewardsAdmin, 
      user1, 
      user2, 
      user3,
      unbondingPeriod
    };
  }

  // ============ Deployment Tests ============

  describe("Deployment", function () {
    it("Should set the correct asset (wYLDS)", async function () {
      const { stakingVault, yieldVault } = await loadFixture(deployStakingVaultFixture);
      expect(await stakingVault.asset()).to.equal(await yieldVault.getAddress());
    });

    it("Should set the correct name and symbol", async function () {
      const { stakingVault } = await loadFixture(deployStakingVaultFixture);
      expect(await stakingVault.name()).to.equal("Prime Staked YLDS");
      expect(await stakingVault.symbol()).to.equal("PRIME");
    });

    it("Should set the correct unbonding period", async function () {
      const { stakingVault, unbondingPeriod } = await loadFixture(deployStakingVaultFixture);
      expect(await stakingVault.UNBONDING_PERIOD()).to.equal(unbondingPeriod);
    });

    it("Should grant admin role", async function () {
      const { stakingVault, owner } = await loadFixture(deployStakingVaultFixture);
      const DEFAULT_ADMIN_ROLE = await stakingVault.DEFAULT_ADMIN_ROLE();
      expect(await stakingVault.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
    });
  });

  // ============ Staking Tests ============

  describe("Staking (Deposits)", function () {
    it("Should allow staking wYLDS and mint PRIME 1:1", async function () {
      const { stakingVault, yieldVault, user1 } = await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      expect(await stakingVault.balanceOf(user1.address)).to.equal(stakeAmount);
      expect(await yieldVault.balanceOf(await stakingVault.getAddress())).to.equal(stakeAmount);
    });

    it("Should handle multiple stakes correctly", async function () {
      const { stakingVault, user1 } = await loadFixture(deployStakingVaultFixture);
      
      const stake1 = ethers.parseUnits("1000", 6);
      const stake2 = ethers.parseUnits("500", 6);
      
      await stakingVault.connect(user1).deposit(stake1, user1.address);
      await stakingVault.connect(user1).deposit(stake2, user1.address);
      
      expect(await stakingVault.balanceOf(user1.address)).to.equal(stake1 + stake2);
    });

    it("Should not allow staking when paused", async function () {
      const { stakingVault, owner, user1 } = await loadFixture(deployStakingVaultFixture);
      
      const PAUSER_ROLE = await stakingVault.PAUSER_ROLE();
      await stakingVault.grantRole(PAUSER_ROLE, owner.address);
      await stakingVault.pause();
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      
      await expect(
        stakingVault.connect(user1).deposit(stakeAmount, user1.address)
      ).to.be.revertedWithCustomError(stakingVault, "EnforcedPause");
    });

    it("Should emit Deposit event", async function () {
      const { stakingVault, user1 } = await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      
      await expect(stakingVault.connect(user1).deposit(stakeAmount, user1.address))
        .to.emit(stakingVault, "Deposit")
        .withArgs(user1.address, user1.address, stakeAmount, stakeAmount);
    });
  });

  // ============ Unbonding Tests ============

  describe("Unbonding", function () {
    it("Should allow initiating unbonding", async function () {
      const { stakingVault, user1, unbondingPeriod } = await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      const unbondAmount = ethers.parseUnits("500", 6);
      const currentTime = await time.latest();
      const expectedUnlockTime = currentTime + unbondingPeriod + 1;
      
      await expect(stakingVault.connect(user1).unbond(unbondAmount))
        .to.emit(stakingVault, "Unbonded")
        .withArgs(user1.address, 0, unbondAmount, unbondAmount, expectedUnlockTime);
      
      const positions = await stakingVault.getUnbondingPositions(user1.address);
      expect(positions.length).to.equal(1);
      expect(positions[0].shares).to.equal(unbondAmount);
      expect(positions[0].assets).to.equal(unbondAmount);
    });

    it("Should lock PRIME when unbonding", async function () {
      const { stakingVault, user1 } = await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      const unbondAmount = ethers.parseUnits("500", 6);
      await stakingVault.connect(user1).unbond(unbondAmount);
      
      // PRIME should be transferred to vault
      expect(await stakingVault.balanceOf(user1.address)).to.equal(stakeAmount - unbondAmount);
      expect(await stakingVault.balanceOf(await stakingVault.getAddress())).to.equal(unbondAmount);
    });

    it("Should not allow completing unbonding before unlock time", async function () {
      const { stakingVault, user1 } = await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      const unbondAmount = ethers.parseUnits("500", 6);
      await stakingVault.connect(user1).unbond(unbondAmount);
      
      await expect(
        stakingVault.connect(user1).completeUnbonding(0)
      ).to.be.revertedWithCustomError(stakingVault, "StillLocked");
    });

    it("Should allow completing unbonding after unlock time", async function () {
      const { stakingVault, yieldVault, user1, unbondingPeriod } = 
        await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      const unbondAmount = ethers.parseUnits("500", 6);
      await stakingVault.connect(user1).unbond(unbondAmount);
      
      // Fast forward time
      await time.increase(unbondingPeriod);
      
      const wyldsBalanceBefore = await yieldVault.balanceOf(user1.address);
      
      await expect(stakingVault.connect(user1).completeUnbonding(0))
        .to.emit(stakingVault, "UnbondingCompleted")
        .withArgs(user1.address, 0, unbondAmount, unbondAmount);
      
      const wyldsBalanceAfter = await yieldVault.balanceOf(user1.address);
      expect(wyldsBalanceAfter - wyldsBalanceBefore).to.equal(unbondAmount);
      
      // Position should be removed
      const positions = await stakingVault.getUnbondingPositions(user1.address);
      expect(positions.length).to.equal(0);
    });

    it("Should allow cancelling unbonding", async function () {
      const { stakingVault, user1 } = await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      const unbondAmount = ethers.parseUnits("500", 6);
      await stakingVault.connect(user1).unbond(unbondAmount);
      
      await expect(stakingVault.connect(user1).cancelUnbonding(0))
        .to.emit(stakingVault, "UnbondingCancelled")
        .withArgs(user1.address, 0, unbondAmount);
      
      // PRIME should be returned
      expect(await stakingVault.balanceOf(user1.address)).to.equal(stakeAmount);
      
      // Position should be removed
      const positions = await stakingVault.getUnbondingPositions(user1.address);
      expect(positions.length).to.equal(0);
    });

    it("Should handle multiple unbonding positions", async function () {
      const { stakingVault, user1 } = await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("3000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      await stakingVault.connect(user1).unbond(ethers.parseUnits("1000", 6));
      await stakingVault.connect(user1).unbond(ethers.parseUnits("1000", 6));
      await stakingVault.connect(user1).unbond(ethers.parseUnits("1000", 6));
      
      const positions = await stakingVault.getUnbondingPositions(user1.address);
      expect(positions.length).to.equal(3);
    });

    it("Should correctly track total unbonding", async function () {
      const { stakingVault, user1 } = await loadFixture(deployStakingVaultFixture);

      const stakeAmount = ethers.parseUnits("2000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);

      const unbond1Shares = ethers.parseUnits("500", 6);
      const unbond2Shares = ethers.parseUnits("300", 6);

      await stakingVault.connect(user1).unbond(unbond1Shares);

      // After first unbond, totalAssets decreases, but activeSupply also decreases
      // Conversion rate should remain 1:1 (no dilution)
      await stakingVault.connect(user1).unbond(unbond2Shares);

      // Total unbonding should be the sum of assets locked from both unbonds
      // First unbond: 500 shares = 500 assets
      // Second unbond: 300 shares = 300 assets (conversion rate maintained)
      // Total = 500 + 300 = 800
      const expectedTotal = ethers.parseUnits("800", 6);
      expect(await stakingVault.totalUnbonding()).to.be.closeTo(expectedTotal, 1);
    });
  });

  // ============ Rewards Distribution Tests ============

  describe("Rewards Distribution", function () {
    it("Should distribute rewards and increase share value", async function () {
      const { stakingVault, yieldVault, rewardsAdmin, user1 } = 
        await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      const rewardAmount = ethers.parseUnits("100", 6);
      
      const sharesBefore = await stakingVault.balanceOf(user1.address);
      const assetsBefore = await stakingVault.convertToAssets(sharesBefore);
      
      await expect(stakingVault.connect(rewardsAdmin).distributeRewards(rewardAmount))
        .to.emit(stakingVault, "RewardsDistributed")
        .withArgs(rewardAmount, await time.latest() + 1);
      
      const sharesAfter = await stakingVault.balanceOf(user1.address);
      const assetsAfter = await stakingVault.convertToAssets(sharesAfter);
      
      // Shares should remain the same
      expect(sharesAfter).to.equal(sharesBefore);
      
      // But assets per share should increase
      expect(assetsAfter).to.be.greaterThan(assetsBefore);
      // Allow for small rounding errors (1 wei difference)
      expect(assetsAfter).to.be.closeTo(assetsBefore + rewardAmount, 1);
    });

    it("Should distribute rewards proportionally to all stakers", async function () {
      const { stakingVault, rewardsAdmin, user1, user2 } = 
        await loadFixture(deployStakingVaultFixture);
      
      const stake1 = ethers.parseUnits("1000", 6);
      const stake2 = ethers.parseUnits("2000", 6);
      
      await stakingVault.connect(user1).deposit(stake1, user1.address);
      await stakingVault.connect(user2).deposit(stake2, user2.address);
      
      const rewardAmount = ethers.parseUnits("300", 6); // 300 wYLDS
      
      const shares1Before = await stakingVault.balanceOf(user1.address);
      const shares2Before = await stakingVault.balanceOf(user2.address);
      
      await stakingVault.connect(rewardsAdmin).distributeRewards(rewardAmount);
      
      const assets1After = await stakingVault.convertToAssets(shares1Before);
      const assets2After = await stakingVault.convertToAssets(shares2Before);
      
      // User1 should get 1/3 of rewards (100 wYLDS)
      // User2 should get 2/3 of rewards (200 wYLDS)
      // Allow for small rounding errors
      expect(assets1After).to.be.closeTo(stake1 + ethers.parseUnits("100", 6), 1);
      expect(assets2After).to.be.closeTo(stake2 + ethers.parseUnits("200", 6), 1);
    });

    it("Should only allow rewards admin to distribute", async function () {
      const { stakingVault, user1 } = await loadFixture(deployStakingVaultFixture);
      
      const rewardAmount = ethers.parseUnits("100", 6);
      
      await expect(
        stakingVault.connect(user1).distributeRewards(rewardAmount)
      ).to.be.reverted;
    });

    it("Should handle rewards with unbonding positions correctly", async function () {
      const { stakingVault, rewardsAdmin, user1 } = 
        await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      // Unbond half
      const unbondAmount = ethers.parseUnits("500", 6);
      await stakingVault.connect(user1).unbond(unbondAmount);
      
      const rewardAmount = ethers.parseUnits("100", 6);
      await stakingVault.connect(rewardsAdmin).distributeRewards(rewardAmount);
      
      // totalAssets should exclude unbonding amount
      const totalAssets = await stakingVault.totalAssets();
      expect(totalAssets).to.equal(stakeAmount - unbondAmount + rewardAmount);
    });
  });

  // ============ Freeze Functionality Tests ============

  describe("Freeze Functionality", function () {
    it("Should freeze account", async function () {
      const { stakingVault, freezeAdmin, user1 } = await loadFixture(deployStakingVaultFixture);
      
      await expect(stakingVault.connect(freezeAdmin).freezeAccount(user1.address))
        .to.emit(stakingVault, "AccountFrozen")
        .withArgs(user1.address);
      
      expect(await stakingVault.frozen(user1.address)).to.be.true;
    });

    it("Should prevent transfers from frozen account", async function () {
      const { stakingVault, freezeAdmin, user1, user2 } = 
        await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      await stakingVault.connect(freezeAdmin).freezeAccount(user1.address);
      
      await expect(
        stakingVault.connect(user1).transfer(user2.address, stakeAmount)
      ).to.be.revertedWithCustomError(stakingVault, "AccountIsFrozen");
    });

    it("Should thaw account", async function () {
      const { stakingVault, freezeAdmin, user1 } = await loadFixture(deployStakingVaultFixture);
      
      await stakingVault.connect(freezeAdmin).freezeAccount(user1.address);
      
      await expect(stakingVault.connect(freezeAdmin).thawAccount(user1.address))
        .to.emit(stakingVault, "AccountThawed")
        .withArgs(user1.address);
      
      expect(await stakingVault.frozen(user1.address)).to.be.false;
    });

    it("Should only allow freeze admin to freeze", async function () {
      const { stakingVault, user1, user2 } = await loadFixture(deployStakingVaultFixture);
      
      await expect(
        stakingVault.connect(user1).freezeAccount(user2.address)
      ).to.be.reverted;
    });
  });

  // ============ ERC-4626 Compliance Tests ============

  describe("ERC-4626 Compliance", function () {
    it("Should correctly convert assets to shares initially", async function () {
      const { stakingVault } = await loadFixture(deployStakingVaultFixture);
      
      const assets = ethers.parseUnits("1000", 6);
      const shares = await stakingVault.convertToShares(assets);
      
      expect(shares).to.equal(assets); // 1:1 initially
    });

    it("Should correctly convert shares to assets initially", async function () {
      const { stakingVault } = await loadFixture(deployStakingVaultFixture);
      
      const shares = ethers.parseUnits("1000", 6);
      const assets = await stakingVault.convertToAssets(shares);
      
      expect(assets).to.equal(shares); // 1:1 initially
    });

    it("Should update conversion after rewards", async function () {
      const { stakingVault, rewardsAdmin, user1 } = 
        await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      const shares = await stakingVault.balanceOf(user1.address);
      
      // Before rewards: 1:1
      let assets = await stakingVault.convertToAssets(shares);
      expect(assets).to.equal(shares);
      
      // Add rewards
      const rewardAmount = ethers.parseUnits("100", 6);
      await stakingVault.connect(rewardsAdmin).distributeRewards(rewardAmount);
      
      // After rewards: shares worth more
      assets = await stakingVault.convertToAssets(shares);
      // Allow for small rounding errors
      expect(assets).to.be.closeTo(shares + rewardAmount, 1);
    });

    it("Should preview deposit correctly", async function () {
      const { stakingVault } = await loadFixture(deployStakingVaultFixture);
      
      const assets = ethers.parseUnits("1000", 6);
      const shares = await stakingVault.previewDeposit(assets);
      
      expect(shares).to.equal(assets);
    });

    it("Should return correct total assets", async function () {
      const { stakingVault, user1 } = await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      expect(await stakingVault.totalAssets()).to.equal(stakeAmount);
    });

    it("Should exclude unbonding from total assets", async function () {
      const { stakingVault, user1 } = await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      const unbondAmount = ethers.parseUnits("300", 6);
      await stakingVault.connect(user1).unbond(unbondAmount);
      
      // Total assets should exclude unbonding amount
      expect(await stakingVault.totalAssets()).to.equal(stakeAmount - unbondAmount);
    });
  });

  // ============ View Functions Tests ============

  describe("View Functions", function () {
    it("Should return unbonding positions count", async function () {
      const { stakingVault, user1 } = await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("3000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      await stakingVault.connect(user1).unbond(ethers.parseUnits("1000", 6));
      await stakingVault.connect(user1).unbond(ethers.parseUnits("1000", 6));
      
      const count = await stakingVault.getUnbondingPositionCount(user1.address);
      expect(count).to.equal(2);
    });

    it("Should check if unbonding is unlocked", async function () {
      const { stakingVault, user1, unbondingPeriod } = 
        await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      await stakingVault.connect(user1).unbond(ethers.parseUnits("500", 6));
      
      // Should be locked initially
      let isUnlocked = await stakingVault.isUnbondingUnlocked(user1.address, 0);
      expect(isUnlocked).to.be.false;
      
      // Should be unlocked after period
      await time.increase(unbondingPeriod);
      isUnlocked = await stakingVault.isUnbondingUnlocked(user1.address, 0);
      expect(isUnlocked).to.be.true;
    });
  });

  // ============ Integration Tests ============

  describe("Integration", function () {
    it("Should handle complete staking lifecycle", async function () {
      const { stakingVault, yieldVault, rewardsAdmin, user1, unbondingPeriod } = 
        await loadFixture(deployStakingVaultFixture);
      
      // 1. Stake
      const stakeAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      // 2. Receive rewards
      const rewardAmount = ethers.parseUnits("100", 6);
      await stakingVault.connect(rewardsAdmin).distributeRewards(rewardAmount);
      
      // 3. Unbond
      const primeBalance = await stakingVault.balanceOf(user1.address);
      await stakingVault.connect(user1).unbond(primeBalance);
      
      // 4. Wait
      await time.increase(unbondingPeriod);
      
      // 5. Complete unbonding
      const wyldsBalanceBefore = await yieldVault.balanceOf(user1.address);
      await stakingVault.connect(user1).completeUnbonding(0);
      const wyldsBalanceAfter = await yieldVault.balanceOf(user1.address);
      
      // Should receive original stake + rewards
      // Allow for small rounding errors
      expect(wyldsBalanceAfter - wyldsBalanceBefore).to.be.closeTo(stakeAmount + rewardAmount, 1);
    });
  });
});
