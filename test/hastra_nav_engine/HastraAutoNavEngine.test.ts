import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { HastraAutoNavEngine } from "../../typechain-types";

/**
 * HastraAutoNavEngine is a thin subclass of HastraNavEngine — identical logic +
 * storage, separate deployed address, distinct on-chain name(). Full behavioral
 * coverage lives in test/hastra_nav_engine/HastraNavEngine.test.ts. These smoke
 * tests prove only that HastraAutoNavEngine:
 *
 *   1. Deploys behind a UUPS proxy and initializes correctly.
 *   2. Exposes the branded `name()` view.
 *   3. Inherits HastraNavEngine update/getRate behavior end-to-end.
 *   4. Cannot be re-initialized.
 */
describe("HastraAutoNavEngine (smoke)", function () {
  const MAX_DIFFERENCE_PERCENT = ethers.parseEther("0.1");
  const MIN_RATE = BigInt("500000000000000000");
  const MAX_RATE = BigInt("3000000000000000000");

  async function deployFixture() {
    const [owner, updater] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("HastraAutoNavEngine");
    const navEngine = await upgrades.deployProxy(
      Factory,
      [owner.address, updater.address, MAX_DIFFERENCE_PERCENT, MIN_RATE, MAX_RATE],
      { initializer: "initialize", kind: "uups" }
    ) as unknown as HastraAutoNavEngine;
    await navEngine.waitForDeployment();
    return { navEngine, owner, updater };
  }

  it("initializes with the provided owner / updater / bounds", async function () {
    const { navEngine, owner, updater } = await loadFixture(deployFixture);
    expect(await navEngine.owner()).to.equal(owner.address);
    expect(await navEngine.getUpdater()).to.equal(updater.address);
    expect(await navEngine.getMinRate()).to.equal(MIN_RATE);
    expect(await navEngine.getMaxRate()).to.equal(MAX_RATE);
    expect(await navEngine.getMaxDifferencePercent()).to.equal(MAX_DIFFERENCE_PERCENT);
  });

  it("exposes the branded name()", async function () {
    const { navEngine } = await loadFixture(deployFixture);
    expect(await navEngine.name()).to.equal("HastraAutoNavEngine");
  });

  it("inherits HastraNavEngine updateRate / getRate behavior", async function () {
    const { navEngine, updater } = await loadFixture(deployFixture);
    // totalSupply == totalTVL → rate == 1e18
    const supply = ethers.parseEther("1000");
    const tvl = ethers.parseEther("1000");
    await navEngine.connect(updater).updateRate(supply, tvl);
    expect(await navEngine.getRate()).to.equal(ethers.parseEther("1"));
  });

  it("upgrades to a fresh HastraAutoNavEngine implementation under UUPS", async function () {
    const { navEngine } = await loadFixture(deployFixture);
    const Factory = await ethers.getContractFactory("HastraAutoNavEngine");
    const upgraded = await upgrades.upgradeProxy(await navEngine.getAddress(), Factory) as unknown as HastraAutoNavEngine;
    expect(await upgraded.name()).to.equal("HastraAutoNavEngine");
  });

  it("rejects double-init on the proxy", async function () {
    const { navEngine, owner, updater } = await loadFixture(deployFixture);
    await expect(
      navEngine.initialize(owner.address, updater.address, MAX_DIFFERENCE_PERCENT, MIN_RATE, MAX_RATE)
    ).to.be.revertedWithCustomError(navEngine, "InvalidInitialization");
  });
});
