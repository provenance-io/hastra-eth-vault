import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import type { MockUSDC, YieldVault, StakingVault, MockFeedVerifier } from "../../typechain-types";

describe("StakingVault - Reward Delta Guard", function () {

  async function deployFixture() {
    const [owner, rewardsAdmin, user1] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy() as unknown as MockUSDC;

    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await upgrades.deployProxy(YieldVault, [
      await usdc.getAddress(), "Wrapped YLDS", "wYLDS",
      owner.address, owner.address, ethers.ZeroAddress
    ], { kind: "uups" }) as unknown as YieldVault;

    const StakingVault = await ethers.getContractFactory("StakingVault");
    const stakingVault = await upgrades.deployProxy(StakingVault, [
      await yieldVault.getAddress(), "Prime Staked YLDS", "PRIME",
      owner.address, await yieldVault.getAddress()
    ], { kind: "uups" }) as unknown as StakingVault;

    const REWARDS_ADMIN_ROLE = await stakingVault.REWARDS_ADMIN_ROLE();
    const YIELD_REWARDS_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
    await stakingVault.grantRole(REWARDS_ADMIN_ROLE, rewardsAdmin.address);
    await yieldVault.grantRole(YIELD_REWARDS_ROLE, await stakingVault.getAddress());

    // Fund user1 with wYLDS
    const usdcAmount = ethers.parseUnits("10000", 6);
    await usdc.mint(user1.address, usdcAmount);
    await usdc.connect(user1).approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await yieldVault.connect(user1).deposit(usdcAmount, user1.address);
    await yieldVault.connect(user1).approve(await stakingVault.getAddress(), ethers.MaxUint256);

    // Setup NAV oracle (required — no fallback path)
    const FEED_ID = ethers.encodeBytes32String("TEST_FEED");
    const MockFeedVerifier = await ethers.getContractFactory("MockFeedVerifier");
    const oracle = await MockFeedVerifier.deploy() as unknown as MockFeedVerifier;
    const now = await time.latest();
    await oracle.setPrice(FEED_ID, ethers.parseUnits("1", 18), now);
    const NAV_ORACLE_UPDATER_ROLE = await stakingVault.NAV_ORACLE_UPDATER_ROLE();
    await stakingVault.grantRole(NAV_ORACLE_UPDATER_ROLE, owner.address);
    await stakingVault.setNavOracle(await oracle.getAddress(), FEED_ID);

    return { stakingVault, yieldVault, usdc, owner, rewardsAdmin, user1, oracle, FEED_ID };
  }

  describe("maxRewardPercent default", function () {
    it("defaults to 75 bps (0.0075e18)", async function () {
      const { stakingVault } = await loadFixture(deployFixture);
      expect(await stakingVault.maxRewardPercent()).to.equal(ethers.parseEther("0.0075"));
    });
  });

  describe("setMaxRewardPercent", function () {
    it("admin can update maxRewardPercent", async function () {
      const { stakingVault, owner } = await loadFixture(deployFixture);
      const newPercent = ethers.parseEther("0.1"); // 10%
      await expect(stakingVault.connect(owner).setMaxRewardPercent(newPercent))
        .to.emit(stakingVault, "MaxRewardPercentUpdated")
        .withArgs(ethers.parseEther("0.0075"), newPercent);
      expect(await stakingVault.maxRewardPercent()).to.equal(newPercent);
    });

    it("non-admin cannot update maxRewardPercent", async function () {
      const { stakingVault, rewardsAdmin } = await loadFixture(deployFixture);
      await expect(
        stakingVault.connect(rewardsAdmin).setMaxRewardPercent(ethers.parseEther("0.1"))
      ).to.be.reverted;
    });

    it("rejects zero", async function () {
      const { stakingVault, owner } = await loadFixture(deployFixture);
      await expect(stakingVault.connect(owner).setMaxRewardPercent(0))
        .to.be.revertedWithCustomError(stakingVault, "InvalidAmount");
    });

    it("rejects values above 100% (1e18)", async function () {
      const { stakingVault, owner } = await loadFixture(deployFixture);
      await expect(stakingVault.connect(owner).setMaxRewardPercent(ethers.parseEther("1") + 1n))
        .to.be.revertedWithCustomError(stakingVault, "InvalidAmount");
    });
  });

  describe("distributeRewards delta check", function () {
    async function fixtureWithStake() {
      const f = await deployFixture();
      // user1 stakes 10000 wYLDS → totalAssets = 10000e6
      const stakeAmount = ethers.parseUnits("10000", 6);
      await f.stakingVault.connect(f.user1).deposit(stakeAmount, f.user1.address);
      return { ...f, stakeAmount };
    }

    it("reward at exactly 75 bps succeeds", async function () {
      const { stakingVault, rewardsAdmin, stakeAmount } = await loadFixture(fixtureWithStake);
      // 75 bps of 10000e6 = 75e6
      const reward = stakeAmount * 75n / 10000n;
      await expect(stakingVault.connect(rewardsAdmin).distributeRewards(reward))
        .to.emit(stakingVault, "RewardsDistributed");
    });

    it("reward above 75 bps reverts with RewardExceedsMaxDelta", async function () {
      const { stakingVault, rewardsAdmin, stakeAmount } = await loadFixture(fixtureWithStake);
      // 75 bps + 1 wei
      const reward = stakeAmount * 75n / 10000n + 1n;
      await expect(stakingVault.connect(rewardsAdmin).distributeRewards(reward))
        .to.be.revertedWithCustomError(stakingVault, "RewardExceedsMaxDelta");
    });

    it("reward well above 75 bps reverts", async function () {
      const { stakingVault, rewardsAdmin, stakeAmount } = await loadFixture(fixtureWithStake);
      // 50% of totalAssets
      const reward = stakeAmount * 50n / 100n;
      await expect(stakingVault.connect(rewardsAdmin).distributeRewards(reward))
        .to.be.revertedWithCustomError(stakingVault, "RewardExceedsMaxDelta");
    });

    it("reward succeeds after raising maxRewardPercent to 50%", async function () {
      const { stakingVault, owner, rewardsAdmin, stakeAmount } = await loadFixture(fixtureWithStake);
      await stakingVault.connect(owner).setMaxRewardPercent(ethers.parseEther("0.5"));
      const reward = stakeAmount * 50n / 100n;
      await expect(stakingVault.connect(rewardsAdmin).distributeRewards(reward))
        .to.emit(stakingVault, "RewardsDistributed");
    });

    it("second call within cooldown reverts with RewardCooldownNotElapsed", async function () {
      const { stakingVault, rewardsAdmin } = await loadFixture(deployFixture);
      const reward = ethers.parseUnits("100", 6);
      await stakingVault.connect(rewardsAdmin).distributeRewards(reward);
      await expect(stakingVault.connect(rewardsAdmin).distributeRewards(reward))
        .to.be.revertedWithCustomError(stakingVault, "RewardCooldownNotElapsed");
    });

    it("second call after cooldown elapses succeeds", async function () {
      const { stakingVault, rewardsAdmin } = await loadFixture(deployFixture);
      const reward = ethers.parseUnits("100", 6);
      await stakingVault.connect(rewardsAdmin).distributeRewards(reward);
      await time.increase(3600);
      await expect(stakingVault.connect(rewardsAdmin).distributeRewards(reward))
        .to.emit(stakingVault, "RewardsDistributed");
    });

    it("amount above maxPeriodRewards reverts with ExceedsPeriodRewardCap", async function () {
      const { stakingVault, rewardsAdmin } = await loadFixture(deployFixture);
      const overCap = ethers.parseUnits("1000001", 6); // 1M + 1
      await expect(stakingVault.connect(rewardsAdmin).distributeRewards(overCap))
        .to.be.revertedWithCustomError(stakingVault, "ExceedsPeriodRewardCap");
    });

    it("amount above maxTotalRewards reverts with ExceedsLifetimeRewardCap", async function () {
      const { stakingVault, owner, rewardsAdmin } = await loadFixture(deployFixture);
      const cap = ethers.parseUnits("500", 6);
      await stakingVault.connect(owner).setMaxTotalRewards(cap);
      const reward = ethers.parseUnits("501", 6);
      await expect(stakingVault.connect(rewardsAdmin).distributeRewards(reward))
        .to.be.revertedWithCustomError(stakingVault, "ExceedsLifetimeRewardCap");
    });

    it("totalRewardsDistributed accumulates correctly", async function () {
      const { stakingVault, rewardsAdmin } = await loadFixture(deployFixture);
      const reward = ethers.parseUnits("100", 6);
      await stakingVault.connect(rewardsAdmin).distributeRewards(reward);
      await time.increase(3600);
      await stakingVault.connect(rewardsAdmin).distributeRewards(reward);
      expect(await stakingVault.totalRewardsDistributed()).to.equal(reward * 2n);
    });

    it("setMaxPeriodRewards updates cap and emits event", async function () {
      const { stakingVault, owner } = await loadFixture(deployFixture);
      const newCap = ethers.parseUnits("500000", 6);
      await expect(stakingVault.connect(owner).setMaxPeriodRewards(newCap))
        .to.emit(stakingVault, "MaxPeriodRewardsUpdated");
      expect(await stakingVault.maxPeriodRewards()).to.equal(newCap);
    });

    it("setRewardPeriodSeconds updates cooldown and emits event", async function () {
      const { stakingVault, owner } = await loadFixture(deployFixture);
      await expect(stakingVault.connect(owner).setRewardPeriodSeconds(7200))
        .to.emit(stakingVault, "RewardPeriodSecondsUpdated");
      expect(await stakingVault.rewardPeriodSeconds()).to.equal(7200n);
    });

    it("setMaxTotalRewards below distributed reverts", async function () {
      const { stakingVault, owner, rewardsAdmin } = await loadFixture(deployFixture);
      const reward = ethers.parseUnits("100", 6);
      await stakingVault.connect(rewardsAdmin).distributeRewards(reward);
      await expect(stakingVault.connect(owner).setMaxTotalRewards(ethers.parseUnits("99", 6)))
        .to.be.revertedWithCustomError(stakingVault, "InvalidAmount");
    });

    it("setMaxPeriodRewards(0) reverts", async function () {
      const { stakingVault, owner } = await loadFixture(deployFixture);
      await expect(stakingVault.connect(owner).setMaxPeriodRewards(0))
        .to.be.revertedWithCustomError(stakingVault, "InvalidAmount");
    });

    it("non-admin cannot call setMaxPeriodRewards", async function () {
      const { stakingVault, user1 } = await loadFixture(deployFixture);
      await expect(stakingVault.connect(user1).setMaxPeriodRewards(1))
        .to.be.reverted;
    });

    it("setRewardPeriodSeconds(0) reverts", async function () {
      const { stakingVault, owner } = await loadFixture(deployFixture);
      await expect(stakingVault.connect(owner).setRewardPeriodSeconds(0))
        .to.be.revertedWithCustomError(stakingVault, "InvalidAmount");
    });

    it("non-admin cannot call setRewardPeriodSeconds", async function () {
      const { stakingVault, user1 } = await loadFixture(deployFixture);
      await expect(stakingVault.connect(user1).setRewardPeriodSeconds(1))
        .to.be.reverted;
    });

    it("non-admin cannot call setMaxTotalRewards", async function () {
      const { stakingVault, user1 } = await loadFixture(deployFixture);
      await expect(stakingVault.connect(user1).setMaxTotalRewards(1))
        .to.be.reverted;
    });
  });
});
