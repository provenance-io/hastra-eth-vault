import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { HastraAutoNavEngineV2 } from "../../typechain-types";

/**
 * HastraAutoNavEngineV2 is a thin subclass of HastraNavEngineV2 — adds only a
 * branded name(). Full V2 behavioral coverage (rate-delta guard, cooldown,
 * pause split) lives in HastraNavEngineV2.test.ts. These smoke tests prove:
 *
 *   1. V1 AUTO proxy upgrades to V2 and initializeV2 initialises correctly.
 *   2. Branded name() returns "HastraAutoNavEngineV2".
 *   3. V1 storage (owner, updater, rate, maxRate) is preserved across upgrade.
 *   4. V2 guardrails (rate-delta, cooldown, pauser split) are inherited.
 *   5. Cannot be re-initialized.
 *   6. UUPS upgrade to a fresh impl still works post-V2.
 */
describe("HastraAutoNavEngineV2 (smoke)", function () {
  // ── V1 init params ────────────────────────────────────────────────────
  const MAX_DIFFERENCE_PERCENT = ethers.parseEther("0.1"); // 10%
  const MIN_RATE = ethers.parseEther("0.5");
  const V1_MAX_RATE = ethers.parseEther("3");

  // ── V2 init params ────────────────────────────────────────────────────
  const MAX_RATE_DELTA_PERCENT = ethers.parseEther("0.1"); // 10%
  const MIN_UPDATE_INTERVAL = 300; // 5 minutes
  const V2_MAX_RATE = ethers.parseEther("2");

  const BASELINE_SUPPLY = ethers.parseEther("1000");
  const BASELINE_TVL = ethers.parseEther("1000");

  async function deployV1Fixture() {
    const [owner, updater, pauser, other] = await ethers.getSigners();
    const V1Factory = await ethers.getContractFactory("HastraAutoNavEngine");
    const v1 = await upgrades.deployProxy(
      V1Factory,
      [owner.address, updater.address, MAX_DIFFERENCE_PERCENT, MIN_RATE, V1_MAX_RATE],
      { initializer: "initialize", kind: "uups" }
    );
    await v1.waitForDeployment();
    return { v1, owner, updater, pauser, other };
  }

  async function deployV2Fixture() {
    const { v1, owner, updater, pauser, other } = await loadFixture(deployV1Fixture);

    // Seed a V1 rate so storage-preservation can be verified post-upgrade
    await v1.connect(updater).updateRate(BASELINE_SUPPLY, BASELINE_TVL);

    const V2Factory = await ethers.getContractFactory("HastraAutoNavEngineV2");
    const v2 = await upgrades.upgradeProxy(await v1.getAddress(), V2Factory, {
      call: {
        fn: "initializeV2",
        args: [pauser.address, MAX_RATE_DELTA_PERCENT, MIN_UPDATE_INTERVAL],
      },
    }) as unknown as HastraAutoNavEngineV2;

    await v2.connect(owner).setMaxRate(V2_MAX_RATE);

    return { v2, owner, updater, pauser, other };
  }

  // ====================================================================
  // 1. Upgrade + initializeV2
  // ====================================================================
  describe("Upgrade from V1 → V2", function () {
    it("initializes V2 fields correctly", async function () {
      const { v2, pauser } = await loadFixture(deployV2Fixture);
      expect(await v2.getPauser()).to.equal(pauser.address);
      expect(await v2.getMaxRateDeltaPercent()).to.equal(MAX_RATE_DELTA_PERCENT);
      expect(await v2.getMinUpdateInterval()).to.equal(MIN_UPDATE_INTERVAL);
    });

    it("preserves V1 storage after upgrade (owner, updater, rate, minRate)", async function () {
      const { v2, owner, updater } = await loadFixture(deployV2Fixture);
      expect(await v2.owner()).to.equal(owner.address);
      expect(await v2.getUpdater()).to.equal(updater.address);
      expect(await v2.getMinRate()).to.equal(MIN_RATE);
      expect(await v2.getRate()).to.equal(ethers.parseEther("1")); // seeded 1:1
    });

    it("tightens maxRate to 2e18 via post-upgrade setMaxRate", async function () {
      const { v2 } = await loadFixture(deployV2Fixture);
      expect(await v2.getMaxRate()).to.equal(V2_MAX_RATE);
    });

    it("leaves maxRate at V1 value when setMaxRate is not called post-upgrade", async function () {
      const { v1, pauser } = await loadFixture(deployV1Fixture);
      const V2Factory = await ethers.getContractFactory("HastraAutoNavEngineV2");
      const v2 = await upgrades.upgradeProxy(await v1.getAddress(), V2Factory, {
        call: { fn: "initializeV2", args: [pauser.address, MAX_RATE_DELTA_PERCENT, MIN_UPDATE_INTERVAL] },
      }) as unknown as HastraAutoNavEngineV2;
      expect(await v2.getMaxRate()).to.equal(V1_MAX_RATE);
    });

    it("rejects re-initialization", async function () {
      const { v2, pauser } = await loadFixture(deployV2Fixture);
      await expect(
        v2.initializeV2(pauser.address, MAX_RATE_DELTA_PERCENT, MIN_UPDATE_INTERVAL)
      ).to.be.revertedWithCustomError(v2, "InvalidInitialization");
    });

    it("rejects zero pauser in initializeV2", async function () {
      const { v1 } = await loadFixture(deployV1Fixture);
      const V2Factory = await ethers.getContractFactory("HastraAutoNavEngineV2");
      await expect(
        upgrades.upgradeProxy(await v1.getAddress(), V2Factory, {
          call: { fn: "initializeV2", args: [ethers.ZeroAddress, MAX_RATE_DELTA_PERCENT, MIN_UPDATE_INTERVAL] },
        })
      ).to.be.revertedWithCustomError(V2Factory, "InvalidPauser");
    });
  });

  // ====================================================================
  // 2. Branding
  // ====================================================================
  describe("name()", function () {
    it("returns HastraAutoNavEngineV2", async function () {
      const { v2 } = await loadFixture(deployV2Fixture);
      expect(await v2.name()).to.equal("HastraAutoNavEngineV2");
    });
  });

  // ====================================================================
  // 3. Inherited V2 guardrails
  // ====================================================================
  describe("Rate-delta guard (inherited from V2)", function () {
    it("allows update within 10% delta", async function () {
      const { v2, updater } = await loadFixture(deployV2Fixture);
      await time.increase(MIN_UPDATE_INTERVAL);
      // 9% increase: TVL 1090 / supply 1000
      await expect(
        v2.connect(updater).updateRate(BASELINE_SUPPLY, ethers.parseEther("1090"))
      ).to.not.be.reverted;
    });

    it("reverts when delta exceeds 10%", async function () {
      const { v2, updater } = await loadFixture(deployV2Fixture);
      await time.increase(MIN_UPDATE_INTERVAL);
      // 11.1% increase: supply 900 / TVL 1000
      await expect(
        v2.connect(updater).updateRate(ethers.parseEther("900"), BASELINE_TVL)
      ).to.be.revertedWithCustomError(v2, "RateDeltaExceeded");
    });
  });

  describe("Cooldown guard (inherited from V2)", function () {
    it("reverts when called before minUpdateInterval has elapsed", async function () {
      const { v2, updater } = await loadFixture(deployV2Fixture);
      // No time advance — immediately after fixture's seeded update
      await expect(
        v2.connect(updater).updateRate(BASELINE_SUPPLY, BASELINE_TVL)
      ).to.be.revertedWithCustomError(v2, "UpdateTooFrequent");
    });

    it("allows update after minUpdateInterval has elapsed", async function () {
      const { v2, updater } = await loadFixture(deployV2Fixture);
      await time.increase(MIN_UPDATE_INTERVAL);
      await expect(
        v2.connect(updater).updateRate(BASELINE_SUPPLY, BASELINE_TVL)
      ).to.not.be.reverted;
    });
  });

  // ====================================================================
  // 4. Pause split — pauser, not owner
  // ====================================================================
  describe("Pause split (inherited from V2)", function () {
    it("pauser can pause and unpause", async function () {
      const { v2, pauser } = await loadFixture(deployV2Fixture);
      await v2.connect(pauser).pause();
      expect(await v2.paused()).to.equal(true);
      await v2.connect(pauser).unpause();
      expect(await v2.paused()).to.equal(false);
    });

    it("owner cannot pause (only pauser can)", async function () {
      const { v2, owner } = await loadFixture(deployV2Fixture);
      await expect(v2.connect(owner).pause()).to.be.revertedWithCustomError(v2, "InvalidPauser");
    });

    it("non-pauser cannot pause", async function () {
      const { v2, other } = await loadFixture(deployV2Fixture);
      await expect(v2.connect(other).pause()).to.be.revertedWithCustomError(v2, "InvalidPauser");
    });

    it("updater cannot push rate while paused", async function () {
      const { v2, pauser, updater } = await loadFixture(deployV2Fixture);
      await v2.connect(pauser).pause();
      await time.increase(MIN_UPDATE_INTERVAL);
      await expect(
        v2.connect(updater).updateRate(BASELINE_SUPPLY, BASELINE_TVL)
      ).to.be.revertedWithCustomError(v2, "EnforcedPause");
    });
  });

  // ====================================================================
  // 5. UUPS re-upgrade after V2
  // ====================================================================
  describe("UUPS upgrade", function () {
    it("owner can upgrade to a fresh HastraAutoNavEngineV2 impl", async function () {
      const { v2 } = await loadFixture(deployV2Fixture);
      const Factory = await ethers.getContractFactory("HastraAutoNavEngineV2");
      const upgraded = await upgrades.upgradeProxy(
        await v2.getAddress(),
        Factory
      ) as unknown as HastraAutoNavEngineV2;
      expect(await upgraded.name()).to.equal("HastraAutoNavEngineV2");
    });

    it("non-owner cannot upgrade", async function () {
      const { v2, other } = await loadFixture(deployV2Fixture);
      const Factory = await ethers.getContractFactory("HastraAutoNavEngineV2");
      const newImpl = await Factory.deploy();
      await newImpl.waitForDeployment();
      await expect(
        v2.connect(other).upgradeToAndCall(await newImpl.getAddress(), "0x")
      ).to.be.revertedWithCustomError(v2, "OwnableUnauthorizedAccount");
    });
  });
});
