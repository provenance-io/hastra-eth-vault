import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import type { MockUSDC, YieldVault, AutoStakingVault, MockFeedVerifier } from "../../typechain-types";

/**
 * AutoStakingVault is a thin subclass of StakingVault — identical logic, separate
 * deployed address, custom ERC20 name/symbol. The full behavioral test surface lives
 * in test/staking_vault/* and is not duplicated here. These smoke tests prove only
 * that AutoStakingVault:
 *
 *   1. Deploys behind a UUPS proxy and initializes with the provided name/symbol.
 *   2. Inherits StakingVault behavior end-to-end (deposit + redeem round-trip with
 *      a configured NAV oracle).
 *   3. Is upgradeable to a fresh AutoStakingVault implementation under UUPS rules.
 */
describe("AutoStakingVault (smoke)", function () {
  async function deployFixture() {
    const [owner, user] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy() as unknown as MockUSDC;
    await usdc.waitForDeployment();

    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await upgrades.deployProxy(YieldVault, [
      await usdc.getAddress(),
      "Wrapped YLDS",
      "wYLDS",
      owner.address,
      owner.address,
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

    const NAV_ORACLE_UPDATER_ROLE = await vault.NAV_ORACLE_UPDATER_ROLE();
    await vault.grantRole(NAV_ORACLE_UPDATER_ROLE, owner.address);
    const YIELD_VAULT_REWARDS_ADMIN = await yieldVault.REWARDS_ADMIN_ROLE();
    await yieldVault.grantRole(YIELD_VAULT_REWARDS_ADMIN, await vault.getAddress());

    const usdcAmount = ethers.parseUnits("100000", 6);
    const wyldsAmount = ethers.parseUnits("50000", 6);
    await usdc.mint(user.address, usdcAmount);
    await usdc.connect(user).approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await yieldVault.connect(user).deposit(wyldsAmount, user.address);
    await yieldVault.connect(user).approve(await vault.getAddress(), ethers.MaxUint256);

    const FEED_ID = ethers.encodeBytes32String("AUTO_FEED");
    const MockFeedVerifier = await ethers.getContractFactory("MockFeedVerifier");
    const oracle = await MockFeedVerifier.deploy() as unknown as MockFeedVerifier;
    await oracle.waitForDeployment();
    const nav1e18 = ethers.parseEther("1");
    await oracle.setPrice(FEED_ID, nav1e18, await time.latest());
    await vault.connect(owner).setNavOracle(await oracle.getAddress(), FEED_ID);

    return { vault, yieldVault, oracle, owner, user, FEED_ID, nav1e18 };
  }

  it("initializes with the provided name and symbol", async function () {
    const { vault } = await loadFixture(deployFixture);
    expect(await vault.name()).to.equal("Auto Staked YLDS");
    expect(await vault.symbol()).to.equal("AUTO");
    expect(await vault.decimals()).to.equal(6);
  });

  it("deposits and redeems through inherited StakingVault logic", async function () {
    const { vault, user } = await loadFixture(deployFixture);

    const amount = ethers.parseUnits("1000", 6);
    await vault.connect(user).deposit(amount, user.address);

    const shares = await vault.balanceOf(user.address);
    // NAV = 1.0 → shares == assets
    expect(shares).to.equal(amount);

    const assetsOut = await vault.connect(user).redeem.staticCall(shares, user.address, user.address);
    expect(assetsOut).to.equal(amount);
  });

  it("upgrades to a fresh AutoStakingVault implementation under UUPS", async function () {
    const { vault, owner } = await loadFixture(deployFixture);

    const UPGRADER_ROLE = await vault.UPGRADER_ROLE();
    await vault.grantRole(UPGRADER_ROLE, owner.address);

    const Factory = await ethers.getContractFactory("AutoStakingVault");
    const upgraded = await upgrades.upgradeProxy(await vault.getAddress(), Factory) as unknown as AutoStakingVault;
    expect(await upgraded.symbol()).to.equal("AUTO");
  });

  it("rejects double-init on the proxy", async function () {
    const { vault, yieldVault, owner } = await loadFixture(deployFixture);
    await expect(
      vault.initialize(
        await yieldVault.getAddress(),
        "Auto Staked YLDS",
        "AUTO",
        owner.address,
        await yieldVault.getAddress()
      )
    ).to.be.revertedWithCustomError(vault, "InvalidInitialization");
  });
});
