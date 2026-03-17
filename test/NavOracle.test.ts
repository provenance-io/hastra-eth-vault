import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import type { StakingVault, MockFeedVerifier, MockUSDC, YieldVault } from "../typechain-types";

describe("StakingVault — NAV Oracle", function () {
  const ONE_HOUR = 3600;
  const NAV_1x = ethers.parseUnits("1", 18);      // 1.0 in 1e18
  const NAV_105 = ethers.parseUnits("1.05", 18);   // 1.05 in 1e18
  const FEED_ID = ethers.encodeBytes32String("TEST_FEED");

  async function deployFixture() {
    const [owner, user] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy() as unknown as MockUSDC;

    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await upgrades.deployProxy(YieldVault, [
      await usdc.getAddress(), "wYLDS", "wYLDS", owner.address, owner.address, ethers.ZeroAddress
    ], { kind: "uups" }) as unknown as YieldVault;

    const StakingVault = await ethers.getContractFactory("StakingVault");
    const stakingVault = await upgrades.deployProxy(StakingVault, [
      await yieldVault.getAddress(), "PRIME", "PRIME", owner.address, await yieldVault.getAddress()
    ], { kind: "uups" }) as unknown as StakingVault;

    const MockFeedVerifier = await ethers.getContractFactory("MockFeedVerifier");
    const oracle = await MockFeedVerifier.deploy() as unknown as MockFeedVerifier;

    // Seed some deposits so totalAssets > 0
    const REWARDS_ADMIN = await stakingVault.REWARDS_ADMIN_ROLE();
    const YIELD_REWARDS = await yieldVault.REWARDS_ADMIN_ROLE();
    await stakingVault.grantRole(REWARDS_ADMIN, owner.address);
    await yieldVault.grantRole(YIELD_REWARDS, await stakingVault.getAddress());
    await yieldVault.grantRole(YIELD_REWARDS, owner.address);

    // Grant NAV_ORACLE_UPDATER_ROLE to owner for tests
    const NAV_ORACLE_UPDATER_ROLE = await stakingVault.NAV_ORACLE_UPDATER_ROLE();
    await stakingVault.grantRole(NAV_ORACLE_UPDATER_ROLE, owner.address);

    // Set oracle at NAV=1.0 so the fixture deposit below succeeds
    const seedNow = await time.latest();
    await oracle.setPrice(FEED_ID, NAV_1x, seedNow);
    await stakingVault.setNavOracle(await oracle.getAddress(), FEED_ID);

    const depositAmt = ethers.parseUnits("1000", 6); // 1000 USDC
    await usdc.mint(user.address, depositAmt);
    await usdc.connect(user).approve(await yieldVault.getAddress(), depositAmt);
    await yieldVault.connect(user).deposit(depositAmt, user.address);

    const wyldsAmt = ethers.parseUnits("1000", 6);
    await yieldVault.connect(user).approve(await stakingVault.getAddress(), wyldsAmt);
    await stakingVault.connect(user).deposit(wyldsAmt, user.address);

    // Clear the oracle so individual tests can set their own state
    await stakingVault.setNavOracle(ethers.ZeroAddress, ethers.ZeroHash);

    return { stakingVault, yieldVault, usdc, oracle, owner, user };
  }

  // ── setNavOracle ─────────────────────────────────────────────────────────────

  describe("setNavOracle", function () {
    it("admin can set oracle and emit event", async function () {
      const { stakingVault, oracle } = await loadFixture(deployFixture);
      await expect(stakingVault.setNavOracle(await oracle.getAddress(), FEED_ID))
        .to.emit(stakingVault, "NavOracleUpdated")
        .withArgs(ethers.ZeroAddress, await oracle.getAddress(), FEED_ID);

      expect(await stakingVault.navOracle()).to.equal(await oracle.getAddress());
    });

    it("non-admin cannot set oracle", async function () {
      const { stakingVault, oracle, user } = await loadFixture(deployFixture);
      await expect(
        stakingVault.connect(user).setNavOracle(await oracle.getAddress(), FEED_ID)
      ).to.be.reverted;
    });

    it("can clear oracle by setting address(0)", async function () {
      const { stakingVault, oracle, owner } = await loadFixture(deployFixture);
      await stakingVault.setNavOracle(await oracle.getAddress(), FEED_ID);
      await stakingVault.setNavOracle(ethers.ZeroAddress, ethers.ZeroHash);
      expect(await stakingVault.navOracle()).to.equal(ethers.ZeroAddress);
    });
  });

  // ── getVerifiedNav ────────────────────────────────────────────────────────────

  describe("getVerifiedNav", function () {
    it("returns price when fresh and valid", async function () {
      const { stakingVault, oracle, owner } = await loadFixture(deployFixture);
      const now = await time.latest();
      await oracle.setPrice(FEED_ID, NAV_1x, now);
      await stakingVault.setNavOracle(await oracle.getAddress(), FEED_ID);

      expect(await stakingVault.getVerifiedNav()).to.equal(NAV_1x);
    });

    it("returns 1.05 NAV correctly", async function () {
      const { stakingVault, oracle } = await loadFixture(deployFixture);
      const now = await time.latest();
      await oracle.setPrice(FEED_ID, NAV_105, now);
      await stakingVault.setNavOracle(await oracle.getAddress(), FEED_ID);

      expect(await stakingVault.getVerifiedNav()).to.equal(NAV_105);
    });

    it("reverts NavInvalid when price is zero", async function () {
      const { stakingVault, oracle } = await loadFixture(deployFixture);
      const now = await time.latest();
      await oracle.setPrice(FEED_ID, 0n, now);
      await stakingVault.setNavOracle(await oracle.getAddress(), FEED_ID);

      await expect(stakingVault.getVerifiedNav()).to.be.revertedWithCustomError(
        stakingVault, "NavInvalid"
      );
    });

    it("reverts NavInvalid when price is negative", async function () {
      const { stakingVault, oracle } = await loadFixture(deployFixture);
      const now = await time.latest();
      await oracle.setPrice(FEED_ID, -1n, now);
      await stakingVault.setNavOracle(await oracle.getAddress(), FEED_ID);

      await expect(stakingVault.getVerifiedNav()).to.be.revertedWithCustomError(
        stakingVault, "NavInvalid"
      );
    });

    it("reverts InvalidAddress when oracle not set", async function () {
      const { stakingVault } = await loadFixture(deployFixture);
      // navOracle is address(0) by default
      await expect(stakingVault.getVerifiedNav()).to.be.revertedWithCustomError(
        stakingVault, "InvalidAddress"
      );
    });
  });

  // ── getTotalValueAtNav ────────────────────────────────────────────────────────

  describe("getTotalValueAtNav", function () {
    it("at NAV=1.0: total value equals totalAssets", async function () {
      const { stakingVault, oracle } = await loadFixture(deployFixture);
      const now = await time.latest();
      await oracle.setPrice(FEED_ID, NAV_1x, now);
      await stakingVault.setNavOracle(await oracle.getAddress(), FEED_ID);

      const totalAssets = await stakingVault.totalAssets();
      const totalValue  = await stakingVault.getTotalValueAtNav();
      // value = assets * 1e18 / 1e18 = assets
      expect(totalValue).to.equal(totalAssets);
    });

    it("at NAV=1.05: total value is 5% higher than totalAssets", async function () {
      const { stakingVault, oracle } = await loadFixture(deployFixture);
      const now = await time.latest();
      await oracle.setPrice(FEED_ID, NAV_105, now);
      await stakingVault.setNavOracle(await oracle.getAddress(), FEED_ID);

      const totalAssets = await stakingVault.totalAssets();
      const totalValue  = await stakingVault.getTotalValueAtNav();
      const expected    = totalAssets * NAV_105 / ethers.parseUnits("1", 18);
      expect(totalValue).to.equal(expected);
    });

    it("after reward distribution, NAV-adjusted value increases proportionally", async function () {
      const { stakingVault, yieldVault, oracle, owner } = await loadFixture(deployFixture);
      const now = await time.latest();
      await oracle.setPrice(FEED_ID, NAV_1x, now);
      await stakingVault.setNavOracle(await oracle.getAddress(), FEED_ID);

      const valueBefore = await stakingVault.getTotalValueAtNav();

      // Distribute 50 wYLDS reward (~5%)
      const reward = ethers.parseUnits("50", 6);
      await stakingVault.distributeRewards(reward);

      const valueAfter = await stakingVault.getTotalValueAtNav();
      expect(valueAfter).to.equal(valueBefore + reward);
    });
  });

  // ── NAV-driven deposit / redeem ───────────────────────────────────────────────

  describe("NAV-driven share price", function () {
    it("at NAV=1.0: deposit 100 wYLDS mints 100 PRIME", async function () {
      const { stakingVault, yieldVault, usdc, oracle, owner, user } = await loadFixture(deployFixture);
      const [, , , depositor] = await ethers.getSigners();
      const now = await time.latest();
      await oracle.setPrice(FEED_ID, NAV_1x, now);
      await stakingVault.setNavOracle(await oracle.getAddress(), FEED_ID);

      // Give depositor wYLDS
      const depositAmt = ethers.parseUnits("100", 6);
      await usdc.mint(depositor.address, depositAmt);
      await usdc.connect(depositor).approve(await yieldVault.getAddress(), depositAmt);
      await yieldVault.connect(depositor).deposit(depositAmt, depositor.address);
      await yieldVault.connect(depositor).approve(await stakingVault.getAddress(), depositAmt);

      const sharesBefore = await stakingVault.balanceOf(depositor.address);
      await stakingVault.connect(depositor).deposit(depositAmt, depositor.address);
      const sharesAfter = await stakingVault.balanceOf(depositor.address);
      const minted = sharesAfter - sharesBefore;

      // At NAV=1.0: 100 wYLDS → 100 PRIME (both 6 decimals)
      expect(minted).to.equal(depositAmt);
    });

    it("at NAV=1.05: deposit 105 wYLDS mints ~100 PRIME", async function () {
      const { stakingVault, yieldVault, usdc, oracle, user } = await loadFixture(deployFixture);
      const [, , , depositor] = await ethers.getSigners();
      const now = await time.latest();
      await oracle.setPrice(FEED_ID, NAV_105, now);
      await stakingVault.setNavOracle(await oracle.getAddress(), FEED_ID);

      const depositAmt = ethers.parseUnits("105", 6);
      await usdc.mint(depositor.address, depositAmt);
      await usdc.connect(depositor).approve(await yieldVault.getAddress(), depositAmt);
      await yieldVault.connect(depositor).deposit(depositAmt, depositor.address);
      await yieldVault.connect(depositor).approve(await stakingVault.getAddress(), depositAmt);

      await stakingVault.connect(depositor).deposit(depositAmt, depositor.address);
      const shares = await stakingVault.balanceOf(depositor.address);

      // 105 wYLDS / 1.05 = ~100 PRIME
      const expected = ethers.parseUnits("100", 6);
      expect(shares).to.be.closeTo(expected, ethers.parseUnits("0.01", 6));
    });

    it("at NAV=1.05: redeem 100 PRIME returns ~105 wYLDS", async function () {
      const { stakingVault, yieldVault, usdc, oracle, user } = await loadFixture(deployFixture);
      const now = await time.latest();
      await oracle.setPrice(FEED_ID, NAV_105, now);
      await stakingVault.setNavOracle(await oracle.getAddress(), FEED_ID);

      // user already has PRIME from fixture deposit
      const primeBal = await stakingVault.balanceOf(user.address);
      const redeemAmt = ethers.parseUnits("100", 6);
      expect(primeBal).to.be.gte(redeemAmt);

      const wyldsBalBefore = await yieldVault.balanceOf(user.address);
      await stakingVault.connect(user).redeem(redeemAmt, user.address, user.address);
      const wyldsBalAfter = await yieldVault.balanceOf(user.address);
      const received = wyldsBalAfter - wyldsBalBefore;

      // 100 PRIME * 1.05 = 105 wYLDS
      const expected = ethers.parseUnits("105", 6);
      expect(received).to.be.closeTo(expected, ethers.parseUnits("0.01", 6));
    });

    it("without oracle: deposit reverts with InvalidAddress()", async function () {
      const { stakingVault, yieldVault, usdc, user } = await loadFixture(deployFixture);
      // navOracle is address(0) — getVerifiedNav() reverts with InvalidAddress()
      const depositAmt = ethers.parseUnits("100", 6);
      const [, , , depositor] = await ethers.getSigners();

      await usdc.mint(depositor.address, depositAmt);
      await usdc.connect(depositor).approve(await yieldVault.getAddress(), depositAmt);
      await yieldVault.connect(depositor).deposit(depositAmt, depositor.address);
      await yieldVault.connect(depositor).approve(await stakingVault.getAddress(), depositAmt);

      // Now reverts with InvalidAddress() because oracle is required
      await expect(
        stakingVault.connect(depositor).deposit(depositAmt, depositor.address)
      ).to.be.revertedWithCustomError(stakingVault, "InvalidAddress");
    });
  });
});
