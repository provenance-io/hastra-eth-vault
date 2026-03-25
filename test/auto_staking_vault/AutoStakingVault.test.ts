import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { MockUSDC, YieldVault, AutoStakingVault, MockFeedVerifier } from "../../typechain-types";

describe("AutoStakingVault", function () {
  // ============ Fixtures ============

  async function deployFixture() {
    const [owner, freezeAdmin, rewardsAdmin, user1, user2] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy() as unknown as MockUSDC;
    await usdc.waitForDeployment();

    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await upgrades.deployProxy(YieldVault, [
      await usdc.getAddress(),
      "Wrapped YLDS",
      "wYLDS",
      owner.address,
      owner.address, // redeemVault
      ethers.ZeroAddress
    ], { kind: "uups" }) as unknown as YieldVault;
    await yieldVault.waitForDeployment();

    const AutoStakingVault = await ethers.getContractFactory("AutoStakingVault");
    const vault = await upgrades.deployProxy(AutoStakingVault, [
      await yieldVault.getAddress(),
      "Auto Staked YLDS",
      "AUTO",
      owner.address,
      await yieldVault.getAddress()
    ], { kind: "uups" }) as unknown as AutoStakingVault;
    await vault.waitForDeployment();

    const FREEZE_ADMIN_ROLE = await vault.FREEZE_ADMIN_ROLE();
    const REWARDS_ADMIN_ROLE = await vault.REWARDS_ADMIN_ROLE();
    const NAV_ORACLE_UPDATER_ROLE = await vault.NAV_ORACLE_UPDATER_ROLE();
    const YIELD_VAULT_REWARDS_ADMIN = await yieldVault.REWARDS_ADMIN_ROLE();

    await vault.grantRole(FREEZE_ADMIN_ROLE, freezeAdmin.address);
    await vault.grantRole(REWARDS_ADMIN_ROLE, rewardsAdmin.address);
    await vault.grantRole(NAV_ORACLE_UPDATER_ROLE, owner.address);
    await yieldVault.grantRole(YIELD_VAULT_REWARDS_ADMIN, await vault.getAddress());

    // Fund users with wYLDS
    const usdcAmount = ethers.parseUnits("100000", 6);
    const wyldsAmount = ethers.parseUnits("50000", 6);
    for (const user of [user1, user2]) {
      await usdc.mint(user.address, usdcAmount);
      await usdc.connect(user).approve(await yieldVault.getAddress(), ethers.MaxUint256);
      await yieldVault.connect(user).deposit(wyldsAmount, user.address);
      await yieldVault.connect(user).approve(await vault.getAddress(), ethers.MaxUint256);
    }
    // Fund rewardsAdmin too
    await usdc.mint(rewardsAdmin.address, usdcAmount);
    await usdc.connect(rewardsAdmin).approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await yieldVault.connect(rewardsAdmin).deposit(wyldsAmount, rewardsAdmin.address);
    await yieldVault.connect(rewardsAdmin).approve(await vault.getAddress(), ethers.MaxUint256);

    const FEED_ID = ethers.encodeBytes32String("AUTO_FEED");
    const MockFeedVerifier = await ethers.getContractFactory("MockFeedVerifier");
    const oracle = await MockFeedVerifier.deploy() as unknown as MockFeedVerifier;
    await oracle.waitForDeployment();

    return { vault, yieldVault, usdc, oracle, owner, freezeAdmin, rewardsAdmin, user1, user2, FEED_ID };
  }

  // ============ NAV Fallback Tests ============

  describe("NAV fallback (no oracle)", function () {
    it("deposits and redeems at 1:1 when vault is empty and no oracle is set", async function () {
      const { vault, user1 } = await loadFixture(deployFixture);

      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // First depositor: 1:1 due to standard ERC-4626 virtual offset logic
      const shares = await vault.balanceOf(user1.address);
      expect(shares).to.be.gt(0n);

      // Redeem all shares — should get back same amount (minus rounding)
      const assets = await vault.connect(user1).redeem.staticCall(shares, user1.address, user1.address);
      expect(assets).to.equal(depositAmount);
    });

    it("uses on-chain ratio (totalAssets/totalSupply) when oracle not set", async function () {
      const { vault, user1, user2 } = await loadFixture(deployFixture);

      const amount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(amount, user1.address);
      await vault.connect(user2).deposit(amount, user2.address);

      // Both depositors should get equal shares since NAV is 1:1 on-chain
      const shares1 = await vault.balanceOf(user1.address);
      const shares2 = await vault.balanceOf(user2.address);
      expect(shares1).to.equal(shares2);
    });

    it("getVerifiedNav() reverts when oracle not set", async function () {
      const { vault } = await loadFixture(deployFixture);
      await expect(vault.getVerifiedNav()).to.be.revertedWithCustomError(vault, "InvalidAddress");
    });

    it("getTotalValueAtNav() reverts when oracle not set", async function () {
      const { vault, user1 } = await loadFixture(deployFixture);
      await vault.connect(user1).deposit(ethers.parseUnits("1000", 6), user1.address);
      await expect(vault.getTotalValueAtNav()).to.be.revertedWithCustomError(vault, "InvalidAddress");
    });
  });

  // ============ NAV Oracle Tests ============

  describe("NAV oracle (oracle configured)", function () {
    async function deployWithOracleFixture() {
      const base = await deployFixture();
      const { vault, oracle, owner, FEED_ID } = base;

      // Set NAV = 1.0 (1e18)
      const nav1e18 = BigInt(1e18);
      await oracle.setPrice(FEED_ID, nav1e18 as unknown as bigint, Math.floor(Date.now() / 1000));
      await vault.connect(owner).setNavOracle(await oracle.getAddress(), FEED_ID);

      return { ...base, nav1e18 };
    }

    it("uses oracle NAV for share conversion when oracle is set", async function () {
      const { vault, user1, nav1e18 } = await loadFixture(deployWithOracleFixture);

      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // At NAV=1.0 (1e18): shares = assets * 1e18 / 1e18 = assets
      const shares = await vault.balanceOf(user1.address);
      expect(shares).to.equal(depositAmount);
    });

    it("uses higher NAV to issue fewer shares", async function () {
      const { vault, oracle, owner, user1, FEED_ID } = await loadFixture(deployWithOracleFixture);

      // NAV = 2.0 → 1 share costs 2 wYLDS
      const nav2e18 = 2n * BigInt(1e18);
      await oracle.setPrice(FEED_ID, nav2e18 as unknown as bigint, Math.floor(Date.now() / 1000));

      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // shares = 1000e6 * 1e18 / 2e18 = 500e6
      const shares = await vault.balanceOf(user1.address);
      expect(shares).to.equal(depositAmount / 2n);
    });

    it("getVerifiedNav() returns oracle price when set", async function () {
      const { vault, nav1e18 } = await loadFixture(deployWithOracleFixture);
      expect(await vault.getVerifiedNav()).to.equal(nav1e18);
    });

    it("getTotalValueAtNav() works when oracle is set and vault has assets", async function () {
      const { vault, user1, nav1e18 } = await loadFixture(deployWithOracleFixture);

      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // totalValue = totalAssets * nav / 1e18 = 1000e6 * 1e18 / 1e18 = 1000e6
      const totalValue = await vault.getTotalValueAtNav();
      expect(totalValue).to.equal(depositAmount);
    });
  });

  // ============ Oracle Cleared (fallback restore) ============

  describe("Oracle cleared — falls back to on-chain ratio", function () {
    it("falls back to ERC-4626 ratio after oracle is removed", async function () {
      const { vault, oracle, owner, user1, user2, FEED_ID } = await loadFixture(deployFixture);

      // Set oracle at NAV=1.0
      const nav1e18 = BigInt(1e18);
      await oracle.setPrice(FEED_ID, nav1e18 as unknown as bigint, Math.floor(Date.now() / 1000));
      await vault.connect(owner).setNavOracle(await oracle.getAddress(), FEED_ID);

      // user1 deposits with oracle active
      const amount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(amount, user1.address);

      // Remove oracle
      await vault.connect(owner).setNavOracle(ethers.ZeroAddress, ethers.ZeroHash);

      // user2 deposits without oracle — uses on-chain ratio
      // At this point totalAssets=1000e6, totalSupply=1000e6, so ratio is 1:1
      await vault.connect(user2).deposit(amount, user2.address);
      const shares2 = await vault.balanceOf(user2.address);
      expect(shares2).to.equal(amount); // 1:1 on-chain ratio
    });

    it("emits NavOracleUpdated when oracle is cleared", async function () {
      const { vault, oracle, owner, FEED_ID } = await loadFixture(deployFixture);
      const nav1e18 = BigInt(1e18);
      await oracle.setPrice(FEED_ID, nav1e18 as unknown as bigint, Math.floor(Date.now() / 1000));
      await vault.connect(owner).setNavOracle(await oracle.getAddress(), FEED_ID);

      await expect(vault.connect(owner).setNavOracle(ethers.ZeroAddress, ethers.ZeroHash))
        .to.emit(vault, "NavOracleUpdated")
        .withArgs(await oracle.getAddress(), ethers.ZeroAddress, ethers.ZeroHash);
    });
  });

  // ============ Rewards ============

  describe("Rewards distribution", function () {
    it("distributes rewards without oracle configured", async function () {
      const { vault, yieldVault, rewardsAdmin, user1 } = await loadFixture(deployFixture);

      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      const rewardAmount = ethers.parseUnits("10", 6);
      await expect(vault.connect(rewardsAdmin).distributeRewards(rewardAmount))
        .to.emit(vault, "RewardsDistributed");

      expect(await vault.totalAssets()).to.equal(depositAmount + rewardAmount);
    });

    it("rejects rewards exceeding maxRewardPercent", async function () {
      const { vault, rewardsAdmin, user1 } = await loadFixture(deployFixture);

      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      // 30% reward > 20% max
      const tooLarge = ethers.parseUnits("300", 6);
      await expect(vault.connect(rewardsAdmin).distributeRewards(tooLarge))
        .to.be.revertedWithCustomError(vault, "RewardExceedsMaxDelta");
    });
  });

  // ============ Freeze Functionality ============

  describe("Account freeze", function () {
    it("frozen account cannot deposit", async function () {
      const { vault, freezeAdmin, user1 } = await loadFixture(deployFixture);
      await vault.connect(freezeAdmin).freezeAccount(user1.address);

      const depositAmount = ethers.parseUnits("1000", 6);
      await expect(vault.connect(user1).deposit(depositAmount, user1.address))
        .to.be.revertedWithCustomError(vault, "AccountIsFrozen");
    });

    it("thawed account can deposit again", async function () {
      const { vault, freezeAdmin, user1 } = await loadFixture(deployFixture);
      await vault.connect(freezeAdmin).freezeAccount(user1.address);
      await vault.connect(freezeAdmin).thawAccount(user1.address);

      const depositAmount = ethers.parseUnits("100", 6);
      await expect(vault.connect(user1).deposit(depositAmount, user1.address)).to.not.be.reverted;
    });
  });

  // ============ Pause / Unpause ============

  describe("Pause", function () {
    it("deposits blocked when paused", async function () {
      const { vault, owner, user1 } = await loadFixture(deployFixture);
      await vault.connect(owner).pause();

      await expect(vault.connect(user1).deposit(ethers.parseUnits("100", 6), user1.address))
        .to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("deposits resume after unpause", async function () {
      const { vault, owner, user1 } = await loadFixture(deployFixture);
      await vault.connect(owner).pause();
      await vault.connect(owner).unpause();

      await expect(vault.connect(user1).deposit(ethers.parseUnits("100", 6), user1.address)).to.not.be.reverted;
    });
  });

  // ============ Upgrade ============

  describe("Upgradeability", function () {
    it("can upgrade to a new implementation", async function () {
      const { vault, owner } = await loadFixture(deployFixture);

      const AutoStakingVaultV2 = await ethers.getContractFactory("AutoStakingVault");
      const upgraded = await upgrades.upgradeProxy(await vault.getAddress(), AutoStakingVaultV2, {
        kind: "uups",
      }) as unknown as AutoStakingVault;

      expect(await upgraded.getAddress()).to.equal(await vault.getAddress());
    });

    it("non-upgrader cannot upgrade", async function () {
      const { vault, user1 } = await loadFixture(deployFixture);
      const AutoStakingVaultV2 = await ethers.getContractFactory("AutoStakingVault", user1);
      await expect(
        upgrades.upgradeProxy(await vault.getAddress(), AutoStakingVaultV2, { kind: "uups" })
      ).to.be.reverted;
    });
  });

  // ============ Admin ============

  describe("Admin functions", function () {
    it("setMaxRewardPercent updates the limit", async function () {
      const { vault, owner } = await loadFixture(deployFixture);
      await expect(vault.connect(owner).setMaxRewardPercent(ethers.parseEther("0.1")))
        .to.emit(vault, "MaxRewardPercentUpdated");
    });

    it("setYieldVault updates the yield vault address", async function () {
      const { vault, yieldVault, owner } = await loadFixture(deployFixture);
      await expect(vault.connect(owner).setYieldVault(await yieldVault.getAddress()))
        .to.emit(vault, "YieldVaultUpdated");
    });

    it("setNavOracle without NAV_ORACLE_UPDATER_ROLE is rejected", async function () {
      const { vault, oracle, user1, FEED_ID } = await loadFixture(deployFixture);
      await expect(vault.connect(user1).setNavOracle(await oracle.getAddress(), FEED_ID))
        .to.be.reverted;
    });
  });
});
