import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { MockUSDC, YieldVault, StakingVault } from "../../typechain-types";

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

    return { stakingVault, yieldVault, usdc, owner, rewardsAdmin, user1 };
  }

  describe("maxRewardPercent default", function () {
    it("defaults to 20% (0.2e18)", async function () {
      const { stakingVault } = await loadFixture(deployFixture);
      expect(await stakingVault.maxRewardPercent()).to.equal(ethers.parseEther("0.2"));
    });
  });

  describe("setMaxRewardPercent", function () {
    it("admin can update maxRewardPercent", async function () {
      const { stakingVault, owner } = await loadFixture(deployFixture);
      const newPercent = ethers.parseEther("0.1"); // 10%
      await expect(stakingVault.connect(owner).setMaxRewardPercent(newPercent))
        .to.emit(stakingVault, "MaxRewardPercentUpdated")
        .withArgs(ethers.parseEther("0.2"), newPercent);
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

    it("reward at exactly 20% succeeds", async function () {
      const { stakingVault, rewardsAdmin, stakeAmount } = await loadFixture(fixtureWithStake);
      // 20% of 10000e6 = 2000e6
      const reward = stakeAmount * 20n / 100n;
      await expect(stakingVault.connect(rewardsAdmin).distributeRewards(reward))
        .to.emit(stakingVault, "RewardsDistributed");
    });

    it("reward above 20% reverts with RewardExceedsMaxDelta", async function () {
      const { stakingVault, rewardsAdmin, stakeAmount } = await loadFixture(fixtureWithStake);
      // 20% + 1 wei
      const reward = stakeAmount * 20n / 100n + 1n;
      await expect(stakingVault.connect(rewardsAdmin).distributeRewards(reward))
        .to.be.revertedWithCustomError(stakingVault, "RewardExceedsMaxDelta");
    });

    it("reward well above 20% reverts", async function () {
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

    it("first reward into empty vault skips check (totalAssets = 0)", async function () {
      // No stake, so totalAssets = 0 — any reward amount should pass
      const { stakingVault, rewardsAdmin } = await loadFixture(deployFixture);
      const bigReward = ethers.parseUnits("999999", 6);
      await expect(stakingVault.connect(rewardsAdmin).distributeRewards(bigReward))
        .to.emit(stakingVault, "RewardsDistributed");
    });
  });
});
