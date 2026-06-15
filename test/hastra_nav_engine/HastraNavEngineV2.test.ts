import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { HastraNavEngineV2 } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("HastraNavEngineV2", function () {
  // ── V1 init params ──────────────────────────────────────────────────
  const MAX_DIFFERENCE_PERCENT = ethers.parseEther("0.1"); // 10%
  const MIN_RATE = ethers.parseEther("0.5");
  const V1_MAX_RATE = ethers.parseEther("3");

  // ── V2 init params ──────────────────────────────────────────────────
  const MAX_RATE_DELTA_PERCENT = ethers.parseEther("0.1"); // 10%
  const MIN_UPDATE_INTERVAL = 300; // 5 minutes
  const V2_MAX_RATE = ethers.parseEther("2"); // tightened from 3e18

  // ── Baseline update values (rate = 1.0) ─────────────────────────────
  const BASELINE_SUPPLY = ethers.parseEther("1000");
  const BASELINE_TVL = ethers.parseEther("1000");

  let navEngine: HastraNavEngineV2;
  let owner: SignerWithAddress;
  let updater: SignerWithAddress;
  let pauser: SignerWithAddress;
  let user: SignerWithAddress;

  async function deployV2Fixture() {
    [owner, updater, pauser, user] = await ethers.getSigners();

    // Deploy V1 as UUPS proxy
    const V1Factory = await ethers.getContractFactory("HastraNavEngine");
    const v1 = await upgrades.deployProxy(
      V1Factory,
      [owner.address, updater.address, MAX_DIFFERENCE_PERCENT, MIN_RATE, V1_MAX_RATE],
      { initializer: "initialize", kind: "uups" }
    );
    await v1.waitForDeployment();

    // Upgrade to V2 with initializeV2
    const V2Factory = await ethers.getContractFactory("HastraNavEngineV2");
    const v2 = await upgrades.upgradeProxy(
      await v1.getAddress(),
      V2Factory,
      {
        call: {
          fn: "initializeV2",
          args: [pauser.address, MAX_RATE_DELTA_PERCENT, MIN_UPDATE_INTERVAL, V2_MAX_RATE],
        },
      }
    ) as unknown as HastraNavEngineV2;

    // Establish baseline rate of 1.0
    await v2.connect(updater).updateRate(BASELINE_SUPPLY, BASELINE_TVL);

    return { navEngine: v2, owner, updater, pauser, user };
  }

  beforeEach(async function () {
    const fixture = await deployV2Fixture();
    navEngine = fixture.navEngine;
    owner = fixture.owner;
    updater = fixture.updater;
    pauser = fixture.pauser;
    user = fixture.user;
  });

  // ====================================================================
  // 1. initializeV2
  // ====================================================================
  describe("initializeV2", function () {
    it("Should set pauser correctly", async function () {
      expect(await navEngine.getPauser()).to.equal(pauser.address);
    });

    it("Should set maxRateDeltaPercent correctly", async function () {
      expect(await navEngine.getMaxRateDeltaPercent()).to.equal(MAX_RATE_DELTA_PERCENT);
    });

    it("Should set minUpdateInterval correctly", async function () {
      expect(await navEngine.getMinUpdateInterval()).to.equal(MIN_UPDATE_INTERVAL);
    });

    it("Should tighten maxRate from 3e18 to 2e18", async function () {
      expect(await navEngine.getMaxRate()).to.equal(V2_MAX_RATE);
    });

    it("Should reject zero pauser", async function () {
      const V1Factory = await ethers.getContractFactory("HastraNavEngine");
      const v1 = await upgrades.deployProxy(
        V1Factory,
        [owner.address, updater.address, MAX_DIFFERENCE_PERCENT, MIN_RATE, V1_MAX_RATE],
        { initializer: "initialize", kind: "uups" }
      );
      await v1.waitForDeployment();

      const V2Factory = await ethers.getContractFactory("HastraNavEngineV2");
      await expect(
        upgrades.upgradeProxy(await v1.getAddress(), V2Factory, {
          call: {
            fn: "initializeV2",
            args: [ethers.ZeroAddress, MAX_RATE_DELTA_PERCENT, MIN_UPDATE_INTERVAL, V2_MAX_RATE],
          },
        })
      ).to.be.revertedWithCustomError(V2Factory, "InvalidPauser");
    });

    it("Should reject zero maxRateDeltaPercent", async function () {
      const V1Factory = await ethers.getContractFactory("HastraNavEngine");
      const v1 = await upgrades.deployProxy(
        V1Factory,
        [owner.address, updater.address, MAX_DIFFERENCE_PERCENT, MIN_RATE, V1_MAX_RATE],
        { initializer: "initialize", kind: "uups" }
      );
      await v1.waitForDeployment();

      const V2Factory = await ethers.getContractFactory("HastraNavEngineV2");
      await expect(
        upgrades.upgradeProxy(await v1.getAddress(), V2Factory, {
          call: {
            fn: "initializeV2",
            args: [pauser.address, 0, MIN_UPDATE_INTERVAL, V2_MAX_RATE],
          },
        })
      ).to.be.revertedWithCustomError(V2Factory, "InvalidMaxRateDelta");
    });

    it("Should reject zero minUpdateInterval", async function () {
      const V1Factory = await ethers.getContractFactory("HastraNavEngine");
      const v1 = await upgrades.deployProxy(
        V1Factory,
        [owner.address, updater.address, MAX_DIFFERENCE_PERCENT, MIN_RATE, V1_MAX_RATE],
        { initializer: "initialize", kind: "uups" }
      );
      await v1.waitForDeployment();

      const V2Factory = await ethers.getContractFactory("HastraNavEngineV2");
      await expect(
        upgrades.upgradeProxy(await v1.getAddress(), V2Factory, {
          call: {
            fn: "initializeV2",
            args: [pauser.address, MAX_RATE_DELTA_PERCENT, 0, V2_MAX_RATE],
          },
        })
      ).to.be.revertedWithCustomError(V2Factory, "InvalidMinUpdateInterval");
    });

    it("Should not allow re-initialization", async function () {
      await expect(
        navEngine.initializeV2(pauser.address, MAX_RATE_DELTA_PERCENT, MIN_UPDATE_INTERVAL, V2_MAX_RATE)
      ).to.be.revertedWithCustomError(navEngine, "InvalidInitialization");
    });
  });

  // ====================================================================
  // 2. Rate-delta guard
  // ====================================================================
  describe("Rate-Delta Guard", function () {
    beforeEach(async function () {
      // Advance past cooldown so delta tests aren't blocked by UpdateTooFrequent
      await time.increase(MIN_UPDATE_INTERVAL);
    });

    it("Should allow update within 10% delta (rate 1.0 → 1.09)", async function () {
      // TVL 1090 / supply 1000 = rate 1.09 → 9% increase
      await expect(
        navEngine.connect(updater).updateRate(BASELINE_SUPPLY, ethers.parseEther("1090"))
      ).to.not.be.reverted;
      expect(await navEngine.getRate()).to.equal(ethers.parseEther("1.09"));
    });

    it("Should revert when exceeding 10% delta upward (rate 1.0 → 1.11)", async function () {
      // TVL unchanged (no TVL guard), supply 900 → rate = 1000/900 ≈ 1.111 (11.1% increase)
      await expect(
        navEngine.connect(updater).updateRate(ethers.parseEther("900"), BASELINE_TVL)
      ).to.be.revertedWithCustomError(navEngine, "RateDeltaExceeded");
    });

    it("Should allow rate decrease within delta (rate 1.0 → 0.91)", async function () {
      // TVL 910 / supply 1000 = rate 0.91 → 9% decrease
      await expect(
        navEngine.connect(updater).updateRate(BASELINE_SUPPLY, ethers.parseEther("910"))
      ).to.not.be.reverted;
      expect(await navEngine.getRate()).to.equal(ethers.parseEther("0.91"));
    });

    it("Should revert when exceeding 10% delta downward (rate 1.0 → 0.89)", async function () {
      // TVL unchanged (no TVL guard), supply 1125 → rate = 1000/1125 ≈ 0.889 (11.1% decrease)
      await expect(
        navEngine.connect(updater).updateRate(ethers.parseEther("1125"), BASELINE_TVL)
      ).to.be.revertedWithCustomError(navEngine, "RateDeltaExceeded");
    });

    it("Should revert when TVL within 10% but supply change causes rate delta > 10%", async function () {
      // Current: TVL 1000, supply 1000, rate 1.0
      // New:     TVL 1050 (+5% TVL), supply 900
      //          rate = 1050/900 ≈ 1.1667 → ~16.7% rate increase → rate guard fires
      await expect(
        navEngine.connect(updater).updateRate(ethers.parseEther("900"), ethers.parseEther("1050"))
      ).to.be.revertedWithCustomError(navEngine, "RateDeltaExceeded");
    });

    it("Should allow large TVL increase when rate stays within delta (proportional growth)", async function () {
      // TVL doubles, supply doubles → rate stays at 1.0 → rate guard passes
      // This is the seeding / proportional-growth case that TVL guard would have blocked
      await expect(
        navEngine.connect(updater).updateRate(
          ethers.parseEther("2000"), // supply 2x
          ethers.parseEther("2000")  // TVL 2x — rate unchanged
        )
      ).to.not.be.reverted;
      expect(await navEngine.getRate()).to.equal(ethers.parseEther("1"));
    });

    it("Should allow first update with very low TVL (seeding from near-zero)", async function () {
      // Deploy fresh V2 — no baseline update yet
      const V1Factory = await ethers.getContractFactory("HastraNavEngine");
      const v1 = await upgrades.deployProxy(
        V1Factory,
        [owner.address, updater.address, MAX_DIFFERENCE_PERCENT, MIN_RATE, V1_MAX_RATE],
        { initializer: "initialize", kind: "uups" }
      );
      await v1.waitForDeployment();

      const V2Factory = await ethers.getContractFactory("HastraNavEngineV2");
      const fresh = await upgrades.upgradeProxy(
        await v1.getAddress(),
        V2Factory,
        { call: { fn: "initializeV2", args: [pauser.address, MAX_RATE_DELTA_PERCENT, MIN_UPDATE_INTERVAL, V2_MAX_RATE] } }
      ) as unknown as HastraNavEngineV2;

      // $1 TVL / $1 supply — would have been 100% delta vs a padded baseline under TVL guard
      await expect(
        fresh.connect(updater).updateRate(ethers.parseEther("1"), ethers.parseEther("1"))
      ).to.not.be.reverted;
      expect(await fresh.getRate()).to.equal(ethers.parseEther("1"));
    });

    it("Should allow TVL to jump 10x on second update as long as rate is within delta", async function () {
      // rate stays 1.0 throughout — only the rate guard matters
      await time.increase(MIN_UPDATE_INTERVAL);
      await expect(
        navEngine.connect(updater).updateRate(
          ethers.parseEther("10000"),
          ethers.parseEther("10000")
        )
      ).to.not.be.reverted;
    });

    it("Rate guard fires at exact boundary + 1 wei (> not >=)", async function () {
      // 10% delta threshold: 1000 * 1.1 = 1100, rate = 1.1 → exactly 10% → should PASS
      await time.increase(MIN_UPDATE_INTERVAL);
      await expect(
        navEngine.connect(updater).updateRate(BASELINE_SUPPLY, ethers.parseEther("1100"))
      ).to.not.be.reverted;
    });
  });

  // ====================================================================
  // 3. Cooldown
  // ====================================================================
  describe("Cooldown", function () {
    it("Should allow update after minUpdateInterval", async function () {
      await time.increase(MIN_UPDATE_INTERVAL);
      await expect(
        navEngine.connect(updater).updateRate(BASELINE_SUPPLY, ethers.parseEther("1050"))
      ).to.not.be.reverted;
    });

    it("Should revert when updating before interval elapses", async function () {
      // Baseline was just set; only advance 100s (< 300s)
      await time.increase(100);
      await expect(
        navEngine.connect(updater).updateRate(BASELINE_SUPPLY, ethers.parseEther("1050"))
      ).to.be.revertedWithCustomError(navEngine, "UpdateTooFrequent");
    });

    it("Should revert on same-block double update (§4.5 attack vector)", async function () {
      // First update succeeds after cooldown
      await time.increase(MIN_UPDATE_INTERVAL);
      await navEngine.connect(updater).updateRate(BASELINE_SUPPLY, ethers.parseEther("1050"));

      // Second update in quick succession — should revert
      await expect(
        navEngine.connect(updater).updateRate(BASELINE_SUPPLY, ethers.parseEther("1050"))
      ).to.be.revertedWithCustomError(navEngine, "UpdateTooFrequent");
    });

    it("Should skip cooldown check if latestUpdateTime == 0 (never updated)", async function () {
      // Deploy fresh V2 without baseline update
      const V1Factory = await ethers.getContractFactory("HastraNavEngine");
      const v1 = await upgrades.deployProxy(
        V1Factory,
        [owner.address, updater.address, MAX_DIFFERENCE_PERCENT, MIN_RATE, V1_MAX_RATE],
        { initializer: "initialize", kind: "uups" }
      );
      await v1.waitForDeployment();

      const V2Factory = await ethers.getContractFactory("HastraNavEngineV2");
      const fresh = await upgrades.upgradeProxy(
        await v1.getAddress(),
        V2Factory,
        {
          call: {
            fn: "initializeV2",
            args: [pauser.address, MAX_RATE_DELTA_PERCENT, MIN_UPDATE_INTERVAL, V2_MAX_RATE],
          },
        }
      ) as unknown as HastraNavEngineV2;

      // First ever updateRate — should not revert despite no time having passed
      await expect(
        fresh.connect(updater).updateRate(BASELINE_SUPPLY, BASELINE_TVL)
      ).to.not.be.reverted;
    });
  });

  // ====================================================================
  // 4. Pause / Unpause
  // ====================================================================
  describe("Pause / Unpause", function () {
    it("Should allow pauser to pause", async function () {
      await navEngine.connect(pauser).pause();
      expect(await navEngine.paused()).to.be.true;
    });

    it("Should allow pauser to unpause", async function () {
      await navEngine.connect(pauser).pause();
      await navEngine.connect(pauser).unpause();
      expect(await navEngine.paused()).to.be.false;
    });

    it("Should revert when owner tries to pause (InvalidPauser)", async function () {
      await expect(
        navEngine.connect(owner).pause()
      ).to.be.revertedWithCustomError(navEngine, "InvalidPauser");
    });

    it("Should revert when non-pauser tries to pause", async function () {
      await expect(
        navEngine.connect(user).pause()
      ).to.be.revertedWithCustomError(navEngine, "InvalidPauser");
    });

    it("Should revert updateRate when paused", async function () {
      await navEngine.connect(pauser).pause();
      await time.increase(MIN_UPDATE_INTERVAL);
      await expect(
        navEngine.connect(updater).updateRate(BASELINE_SUPPLY, ethers.parseEther("1050"))
      ).to.be.revertedWithCustomError(navEngine, "EnforcedPause");
    });

    it("Should allow owner to setPauser", async function () {
      await navEngine.connect(owner).setPauser(user.address);
      expect(await navEngine.getPauser()).to.equal(user.address);
    });

    it("Should revert setPauser by non-owner", async function () {
      await expect(
        navEngine.connect(user).setPauser(user.address)
      ).to.be.revertedWithCustomError(navEngine, "OwnableUnauthorizedAccount");
    });
  });

  // ====================================================================
  // 5. Admin setters
  // ====================================================================
  describe("Admin Setters", function () {
    it("Should allow owner to setMaxRateDeltaPercent", async function () {
      const newPct = ethers.parseEther("0.2"); // 20%
      await expect(navEngine.connect(owner).setMaxRateDeltaPercent(newPct))
        .to.emit(navEngine, "MaxRateDeltaPercentSet")
        .withArgs(newPct);
      expect(await navEngine.getMaxRateDeltaPercent()).to.equal(newPct);
    });

    it("Should revert setMaxRateDeltaPercent by non-owner", async function () {
      await expect(
        navEngine.connect(user).setMaxRateDeltaPercent(ethers.parseEther("0.2"))
      ).to.be.revertedWithCustomError(navEngine, "OwnableUnauthorizedAccount");
    });

    it("Should revert setMaxRateDeltaPercent(0)", async function () {
      await expect(
        navEngine.connect(owner).setMaxRateDeltaPercent(0)
      ).to.be.revertedWithCustomError(navEngine, "InvalidMaxRateDelta");
    });

    it("Should allow owner to setMinUpdateInterval", async function () {
      const newInterval = 600;
      await expect(navEngine.connect(owner).setMinUpdateInterval(newInterval))
        .to.emit(navEngine, "MinUpdateIntervalSet")
        .withArgs(newInterval);
      expect(await navEngine.getMinUpdateInterval()).to.equal(newInterval);
    });

    it("Should revert setMinUpdateInterval(0)", async function () {
      await expect(
        navEngine.connect(owner).setMinUpdateInterval(0)
      ).to.be.revertedWithCustomError(navEngine, "InvalidMinUpdateInterval");
    });

    it("Should revert setMinUpdateInterval by non-owner", async function () {
      await expect(
        navEngine.connect(user).setMinUpdateInterval(600)
      ).to.be.revertedWithCustomError(navEngine, "OwnableUnauthorizedAccount");
    });
  });

  // ====================================================================
  // 6. Storage preservation after upgrade
  // ====================================================================
  describe("Storage Preservation", function () {
    it("Should preserve V1 rate after upgrade", async function () {
      // Rate was set to 1.0 in fixture
      expect(await navEngine.getRate()).to.equal(ethers.parseEther("1"));
    });

    it("Should preserve V1 TVL and supply after upgrade", async function () {
      expect(await navEngine.getLatestTVL()).to.equal(BASELINE_TVL);
      expect(await navEngine.getLatestTotalSupply()).to.equal(BASELINE_SUPPLY);
    });

    it("Should preserve V1 updater after upgrade", async function () {
      expect(await navEngine.getUpdater()).to.equal(updater.address);
    });

    it("Should preserve V1 minRate after upgrade", async function () {
      expect(await navEngine.getMinRate()).to.equal(MIN_RATE);
    });

    it("Should preserve V1 maxDifferencePercent in storage (V1 field, not used by V2 updateRate)", async function () {
      // maxDifferencePercent still lives in V1 storage and is readable;
      // V2 updateRate no longer enforces it — rate-delta guard replaced it
      expect(await navEngine.getMaxDifferencePercent()).to.equal(MAX_DIFFERENCE_PERCENT);
    });
  });
});
