import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import type { FeedVerifier, MockVerifierProxy, MockERC20 } from "../typechain-types";

// ── Constants ─────────────────────────────────────────────────────────────────

const FEED_ID   = "0x000700f43b35146a1cb16373ac6225ad597535e928e6dc4d179c3b4225f2b6d3";
const FEED_ID_2 = "0x000700f43b35146a1cb16373ac6225ad597535e928e6dc4d179c3b4225f2b6d4";
const ONE_HOUR  = 3600;
const ONE_NAV   = ethers.parseUnits("1", 18);   // 1.0 × 1e18
const ONE_NAV_5 = ethers.parseUnits("1.05", 18); // 1.05 × 1e18

// ── Helpers ───────────────────────────────────────────────────────────────────

const abiCoder = ethers.AbiCoder.defaultAbiCoder();

/**
 * Build a minimal `unverifiedReport` that passes _buildParameterPayload validation.
 * Layout: abi.encode(bytes32[3] context, bytes reportData)
 * reportData must start with the 2-byte schema version.
 */
function buildUnverifiedReport(schemaVersion = 7): string {
  const reportData = ethers.concat([
    new Uint8Array([(schemaVersion >> 8) & 0xff, schemaVersion & 0xff]),
    new Uint8Array(30), // padding — contents unused by mock proxy
  ]);
  return abiCoder.encode(
    ["bytes32[3]", "bytes"],
    [[ethers.ZeroHash, ethers.ZeroHash, ethers.ZeroHash], reportData]
  );
}

/**
 * Build the verified report bytes that MockVerifierProxy returns.
 * This is what FeedVerifier._storeReport() abi.decodes as ReportV7.
 */
function buildVerifiedReport(
  feedId: string,
  price: bigint,
  obsTimestamp: number,
  expiresAt: number
): string {
  return abiCoder.encode(
    ["bytes32", "uint32", "uint32", "uint192", "uint192", "uint32", "int192"],
    [feedId, obsTimestamp, obsTimestamp, 0n, 0n, expiresAt, price]
  );
}

// ── Fixture ───────────────────────────────────────────────────────────────────

async function deployFixture() {
  const [admin, updater, other] = await ethers.getSigners();

  const MockProxy = await ethers.getContractFactory("MockVerifierProxy");
  const mockProxy = (await MockProxy.deploy()) as unknown as MockVerifierProxy;

  const FeedVerifier = await ethers.getContractFactory("FeedVerifier");
  const feedVerifier = (await upgrades.deployProxy(
    FeedVerifier,
    [admin.address, updater.address, await mockProxy.getAddress()],
    { kind: "uups" }
  )) as unknown as FeedVerifier;

  // Pre-build an unverified report with schema version 7
  const unverifiedReport = buildUnverifiedReport(7);

  // Helper: set a fresh verified response on the mock and call verifyReport
  const now = () => Math.floor(Date.now() / 1000);

  return { feedVerifier, mockProxy, admin, updater, other, unverifiedReport, now };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FeedVerifier", function () {

  // ── Initialization ────────────────────────────────────────────────────────

  describe("initialize", function () {
    it("sets verifierProxy correctly", async function () {
      const { feedVerifier, mockProxy } = await loadFixture(deployFixture);
      expect(await feedVerifier.verifierProxy()).to.equal(await mockProxy.getAddress());
    });

    it("grants DEFAULT_ADMIN_ROLE, PAUSER_ROLE, UPGRADER_ROLE to admin", async function () {
      const { feedVerifier, admin } = await loadFixture(deployFixture);
      const ADMIN   = await feedVerifier.DEFAULT_ADMIN_ROLE();
      const PAUSER  = await feedVerifier.PAUSER_ROLE();
      const UPGRADE = await feedVerifier.UPGRADER_ROLE();
      expect(await feedVerifier.hasRole(ADMIN,   admin.address)).to.be.true;
      expect(await feedVerifier.hasRole(PAUSER,  admin.address)).to.be.true;
      expect(await feedVerifier.hasRole(UPGRADE, admin.address)).to.be.true;
    });

    it("grants UPDATER_ROLE to updater", async function () {
      const { feedVerifier, updater } = await loadFixture(deployFixture);
      const UPDATER = await feedVerifier.UPDATER_ROLE();
      expect(await feedVerifier.hasRole(UPDATER, updater.address)).to.be.true;
    });

    it("reverts with ZeroAddress if admin is zero", async function () {
      const MockProxy = await ethers.getContractFactory("MockVerifierProxy");
      const mp = await MockProxy.deploy();
      const FeedVerifier = await ethers.getContractFactory("FeedVerifier");
      await expect(
        upgrades.deployProxy(FeedVerifier, [ethers.ZeroAddress, ethers.ZeroAddress, await mp.getAddress()], { kind: "uups" })
      ).to.be.revertedWithCustomError(await FeedVerifier.deploy(), "ZeroAddress");
    });

    it("reverts with ZeroAddress if verifierProxy is zero", async function () {
      const [admin, updater] = await ethers.getSigners();
      const FeedVerifier = await ethers.getContractFactory("FeedVerifier");
      await expect(
        upgrades.deployProxy(FeedVerifier, [admin.address, updater.address, ethers.ZeroAddress], { kind: "uups" })
      ).to.be.revertedWithCustomError(await FeedVerifier.deploy(), "ZeroAddress");
    });
  });

  // ── verifyReport ─────────────────────────────────────────────────────────

  describe("verifyReport", function () {
    it("stores price and timestamp on success", async function () {
      const { feedVerifier, mockProxy, updater, unverifiedReport } = await loadFixture(deployFixture);
      const obsTs    = Math.floor(Date.now() / 1000) - 60;
      const expiresAt = obsTs + 86400;
      await mockProxy.setVerifiedResponse(buildVerifiedReport(FEED_ID, ONE_NAV, obsTs, expiresAt));

      await feedVerifier.connect(updater).verifyReport(unverifiedReport);

      expect(await feedVerifier.priceOf(FEED_ID)).to.equal(ONE_NAV);
      expect(await feedVerifier.timestampOf(FEED_ID)).to.equal(obsTs);
      expect(await feedVerifier.lastFeedId()).to.equal(FEED_ID);
    });

    it("emits DecodedPrice event", async function () {
      const { feedVerifier, mockProxy, updater, unverifiedReport } = await loadFixture(deployFixture);
      const obsTs     = Math.floor(Date.now() / 1000) - 60;
      const expiresAt  = obsTs + 86400;
      await mockProxy.setVerifiedResponse(buildVerifiedReport(FEED_ID, ONE_NAV_5, obsTs, expiresAt));

      await expect(feedVerifier.connect(updater).verifyReport(unverifiedReport))
        .to.emit(feedVerifier, "DecodedPrice")
        .withArgs(FEED_ID, ONE_NAV_5, obsTs);
    });

    it("reverts without UPDATER_ROLE", async function () {
      const { feedVerifier, mockProxy, other, unverifiedReport } = await loadFixture(deployFixture);
      const obsTs = Math.floor(Date.now() / 1000);
      await mockProxy.setVerifiedResponse(buildVerifiedReport(FEED_ID, ONE_NAV, obsTs, obsTs + 86400));
      await expect(
        feedVerifier.connect(other).verifyReport(unverifiedReport)
      ).to.be.revertedWith(/AccessControl:/);
    });

    it("reverts when paused", async function () {
      const { feedVerifier, mockProxy, admin, updater, unverifiedReport } = await loadFixture(deployFixture);
      const obsTs = Math.floor(Date.now() / 1000);
      await mockProxy.setVerifiedResponse(buildVerifiedReport(FEED_ID, ONE_NAV, obsTs, obsTs + 86400));
      await feedVerifier.connect(admin).pause();
      await expect(
        feedVerifier.connect(updater).verifyReport(unverifiedReport)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("reverts with InvalidReportVersion for schema != 7", async function () {
      const { feedVerifier, mockProxy, updater } = await loadFixture(deployFixture);
      const obsTs = Math.floor(Date.now() / 1000);
      await mockProxy.setVerifiedResponse(buildVerifiedReport(FEED_ID, ONE_NAV, obsTs, obsTs + 86400));
      const badReport = buildUnverifiedReport(3); // version 3, not 7
      await expect(
        feedVerifier.connect(updater).verifyReport(badReport)
      ).to.be.revertedWithCustomError(feedVerifier, "InvalidReportVersion")
        .withArgs(3);
    });

    it("reverts with ExpiredReport when expiresAt is in the past", async function () {
      const { feedVerifier, mockProxy, updater, unverifiedReport } = await loadFixture(deployFixture);
      const obsTs     = 1000;
      const expiresAt = 2000; // far in the past
      await mockProxy.setVerifiedResponse(buildVerifiedReport(FEED_ID, ONE_NAV, obsTs, expiresAt));
      await expect(
        feedVerifier.connect(updater).verifyReport(unverifiedReport)
      ).to.be.revertedWithCustomError(feedVerifier, "ExpiredReport");
    });

    it("reverts with StaleReport when observationsTimestamp is not newer", async function () {
      const { feedVerifier, mockProxy, updater, unverifiedReport } = await loadFixture(deployFixture);
      const obsTs     = Math.floor(Date.now() / 1000) - 120;
      const expiresAt  = obsTs + 86400;

      // First report
      await mockProxy.setVerifiedResponse(buildVerifiedReport(FEED_ID, ONE_NAV, obsTs, expiresAt));
      await feedVerifier.connect(updater).verifyReport(unverifiedReport);

      // Second report with same timestamp — should revert
      await expect(
        feedVerifier.connect(updater).verifyReport(unverifiedReport)
      ).to.be.revertedWithCustomError(feedVerifier, "StaleReport");
    });

    it("accepts a newer report after an older one is stored", async function () {
      const { feedVerifier, mockProxy, updater, unverifiedReport } = await loadFixture(deployFixture);
      const obsTs1     = Math.floor(Date.now() / 1000) - 120;
      const obsTs2     = obsTs1 + 60;
      const expiresAt  = obsTs1 + 86400;

      await mockProxy.setVerifiedResponse(buildVerifiedReport(FEED_ID, ONE_NAV, obsTs1, expiresAt));
      await feedVerifier.connect(updater).verifyReport(unverifiedReport);

      await mockProxy.setVerifiedResponse(buildVerifiedReport(FEED_ID, ONE_NAV_5, obsTs2, expiresAt));
      await feedVerifier.connect(updater).verifyReport(unverifiedReport);

      expect(await feedVerifier.priceOf(FEED_ID)).to.equal(ONE_NAV_5);
      expect(await feedVerifier.timestampOf(FEED_ID)).to.equal(obsTs2);
    });
  });

  // ── verifyBulkReports ─────────────────────────────────────────────────────

  describe("verifyBulkReports", function () {
    it("no-ops on empty array", async function () {
      const { feedVerifier, updater } = await loadFixture(deployFixture);
      await expect(feedVerifier.connect(updater).verifyBulkReports([])).to.not.be.reverted;
    });

    it("stores multiple feeds in one call", async function () {
      const { feedVerifier, mockProxy, updater, unverifiedReport } = await loadFixture(deployFixture);
      const obsTs     = Math.floor(Date.now() / 1000) - 60;
      const expiresAt  = obsTs + 86400;

      const r1 = buildVerifiedReport(FEED_ID,   ONE_NAV,   obsTs, expiresAt);
      const r2 = buildVerifiedReport(FEED_ID_2, ONE_NAV_5, obsTs, expiresAt);
      await mockProxy.setBulkResponses([r1, r2]);

      await feedVerifier.connect(updater).verifyBulkReports([unverifiedReport, unverifiedReport]);

      expect(await feedVerifier.priceOf(FEED_ID)).to.equal(ONE_NAV);
      expect(await feedVerifier.priceOf(FEED_ID_2)).to.equal(ONE_NAV_5);
    });

    it("reverts without UPDATER_ROLE", async function () {
      const { feedVerifier, other, unverifiedReport } = await loadFixture(deployFixture);
      await expect(
        feedVerifier.connect(other).verifyBulkReports([unverifiedReport])
      ).to.be.revertedWith(/AccessControl:/);
    });

    it("reverts when paused", async function () {
      const { feedVerifier, admin, updater, unverifiedReport } = await loadFixture(deployFixture);
      await feedVerifier.connect(admin).pause();
      await expect(
        feedVerifier.connect(updater).verifyBulkReports([unverifiedReport])
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  // ── priceOf / timestampOf ─────────────────────────────────────────────────

  describe("priceOf / timestampOf", function () {
    it("returns 0 for unknown feedId", async function () {
      const { feedVerifier } = await loadFixture(deployFixture);
      expect(await feedVerifier.priceOf(FEED_ID)).to.equal(0n);
      expect(await feedVerifier.timestampOf(FEED_ID)).to.equal(0);
    });

    it("returns stored values after verifyReport", async function () {
      const { feedVerifier, mockProxy, updater, unverifiedReport } = await loadFixture(deployFixture);
      const obsTs     = Math.floor(Date.now() / 1000) - 60;
      const expiresAt  = obsTs + 86400;
      await mockProxy.setVerifiedResponse(buildVerifiedReport(FEED_ID, ONE_NAV_5, obsTs, expiresAt));
      await feedVerifier.connect(updater).verifyReport(unverifiedReport);

      expect(await feedVerifier.priceOf(FEED_ID)).to.equal(ONE_NAV_5);
      expect(await feedVerifier.timestampOf(FEED_ID)).to.equal(obsTs);
    });
  });

  // ── pause / unpause ───────────────────────────────────────────────────────

  describe("pause / unpause", function () {
    it("admin can pause and unpause", async function () {
      const { feedVerifier, admin } = await loadFixture(deployFixture);
      await feedVerifier.connect(admin).pause();
      expect(await feedVerifier.paused()).to.be.true;
      await feedVerifier.connect(admin).unpause();
      expect(await feedVerifier.paused()).to.be.false;
    });

    it("non-admin cannot pause", async function () {
      const { feedVerifier, other } = await loadFixture(deployFixture);
      await expect(feedVerifier.connect(other).pause())
        .to.be.revertedWith(/AccessControl:/);
    });
  });

  // ── withdrawToken ─────────────────────────────────────────────────────────

  describe("withdrawToken", function () {
    it("transfers full token balance to beneficiary", async function () {
      const { feedVerifier, admin, other } = await loadFixture(deployFixture);
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token = (await MockERC20.deploy()) as unknown as MockERC20;

      const amount = ethers.parseEther("100");
      await token.mint(await feedVerifier.getAddress(), amount);

      await feedVerifier.connect(admin).withdrawToken(other.address, await token.getAddress());
      expect(await token.balanceOf(other.address)).to.equal(amount);
      expect(await token.balanceOf(await feedVerifier.getAddress())).to.equal(0n);
    });

    it("reverts with NothingToWithdraw when balance is zero", async function () {
      const { feedVerifier, admin, other } = await loadFixture(deployFixture);
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token = (await MockERC20.deploy()) as unknown as MockERC20;

      await expect(
        feedVerifier.connect(admin).withdrawToken(other.address, await token.getAddress())
      ).to.be.revertedWithCustomError(feedVerifier, "NothingToWithdraw");
    });

    it("reverts for non-admin", async function () {
      const { feedVerifier, other } = await loadFixture(deployFixture);
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token = (await MockERC20.deploy()) as unknown as MockERC20;
      await token.mint(await feedVerifier.getAddress(), 1n);

      await expect(
        feedVerifier.connect(other).withdrawToken(other.address, await token.getAddress())
      ).to.be.revertedWith(/AccessControl:/);
    });
  });

  // ── UUPS upgrade ─────────────────────────────────────────────────────────

  describe("upgradeability", function () {
    it("admin can upgrade implementation", async function () {
      const { feedVerifier, admin } = await loadFixture(deployFixture);
      const FeedVerifierV2 = await ethers.getContractFactory("FeedVerifier", admin);
      const upgraded = await upgrades.upgradeProxy(await feedVerifier.getAddress(), FeedVerifierV2);
      // Proxy address unchanged, contract still functional
      expect(await upgraded.getAddress()).to.equal(await feedVerifier.getAddress());
    });

    it("non-upgrader cannot upgrade", async function () {
      const { feedVerifier, other } = await loadFixture(deployFixture);
      const FeedVerifierV2 = await ethers.getContractFactory("FeedVerifier", other);
      await expect(
        upgrades.upgradeProxy(await feedVerifier.getAddress(), FeedVerifierV2)
      ).to.be.revertedWith(/AccessControl:/);
    });
  });
});
