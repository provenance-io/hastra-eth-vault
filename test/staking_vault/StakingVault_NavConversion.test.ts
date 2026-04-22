import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { MockUSDC, YieldVault, StakingVault, MockFeedVerifier } from "../../typechain-types";

/**
 * NAV Conversion Test
 *
 * Live NAV on testnet: 1.755175756913737033 (= 1755175756913737033 in 1e18 units)
 * wYLDS has 6 decimals (same as USDC). 20 wYLDS = 20_000_000 (20e6).
 *
 * Formula: shares = assets * 1e18 / NAV
 *   20 wYLDS = 20e6 assets
 *   shares = 20e6 * 1e18 / 1755175756913737033
 *          ≈ 11.394... PRIME (also 6 decimals)
 *
 * This test wires a MockFeedVerifier at this exact NAV and verifies StakingVault
 * returns the correct share amount on deposit and preview.
 */

const NAV = 1755175756913737033n; // 1.755175756913737033e18
const FEED_ID = ethers.id("NAV_FEED"); // arbitrary bytes32 for test

describe("NAV Conversion — 1.755175756913737033", function () {

  async function fixture() {
    const [owner, user] = await ethers.getSigners();

    // Deploy MockUSDC (wYLDS underlying)
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy() as unknown as MockUSDC;

    // Deploy YieldVault (wYLDS)
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await upgrades.deployProxy(YieldVault, [
      await usdc.getAddress(),
      "Wrapped YLDS", "wYLDS",
      owner.address,
      owner.address,
      ethers.ZeroAddress,
    ], { kind: "uups" }) as unknown as YieldVault;

    // Deploy StakingVault (PRIME)
    const StakingVault = await ethers.getContractFactory("StakingVault");
    const stakingVault = await upgrades.deployProxy(StakingVault, [
      await yieldVault.getAddress(),
      "Prime Staked YLDS", "PRIME",
      owner.address,
      await yieldVault.getAddress(),
    ], { kind: "uups" }) as unknown as StakingVault;

    // Grant StakingVault the REWARDS_ADMIN_ROLE on YieldVault
    const REWARDS_ADMIN = await yieldVault.REWARDS_ADMIN_ROLE();
    await yieldVault.grantRole(REWARDS_ADMIN, await stakingVault.getAddress());

    // Grant owner NAV_ORACLE_UPDATER_ROLE on StakingVault
    const NAV_ORACLE_UPDATER = await stakingVault.NAV_ORACLE_UPDATER_ROLE();
    await stakingVault.grantRole(NAV_ORACLE_UPDATER, owner.address);

    // Deploy MockFeedVerifier and set NAV
    const MockFeedVerifier = await ethers.getContractFactory("MockFeedVerifier");
    const mockOracle = await MockFeedVerifier.deploy() as unknown as MockFeedVerifier;
    const ts = Math.floor(Date.now() / 1000);
    await mockOracle.setPrice(FEED_ID, NAV as unknown as bigint, ts);

    // Wire oracle into StakingVault
    await stakingVault.setNavOracle(await mockOracle.getAddress(), FEED_ID);

    // Mint USDC and deposit to YieldVault to get wYLDS for user
    // Fund enough wYLDS for a 20 wYLDS staking deposit.
    // USDC and wYLDS both use 6 decimals in this setup, and YieldVault is 1:1.
    const depositUsdc = ethers.parseUnits("10000", 6); // 10,000 USDC (plenty for 20 wYLDS)
    await usdc.mint(user.address, depositUsdc);
    await usdc.connect(user).approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await yieldVault.connect(user).deposit(depositUsdc, user.address);

    // Approve StakingVault to spend user's wYLDS
    await yieldVault.connect(user).approve(await stakingVault.getAddress(), ethers.MaxUint256);

    return { stakingVault, yieldVault, usdc, mockOracle, owner, user };
  }

  it("previewDeposit: 20 wYLDS at NAV 1.755175... returns correct PRIME shares", async function () {
    const { stakingVault } = await loadFixture(fixture);

    const depositAmount = ethers.parseUnits("20", 6); // 20 wYLDS (6 decimals)

    // shares = 20e6 * 1e18 / 1755175756913737033
    const expectedShares = (depositAmount * ethers.parseEther("1")) / NAV;

    const preview = await stakingVault.previewDeposit(depositAmount);

    console.log(`  NAV:              ${ethers.formatEther(NAV)}`);
    console.log(`  Deposit:          20 wYLDS (${depositAmount})`);
    console.log(`  Expected PRIME:   ${ethers.formatUnits(expectedShares, 6)} (${expectedShares} raw)`);
    console.log(`  previewDeposit:   ${ethers.formatUnits(preview, 6)} (${preview} raw)`);

    expect(preview).to.equal(expectedShares);
  });

  it("deposit: actually depositing 20 wYLDS mints the correct PRIME shares", async function () {
    const { stakingVault, user } = await loadFixture(fixture);

    const depositAmount = ethers.parseUnits("20", 6);
    const expectedShares = (depositAmount * ethers.parseEther("1")) / NAV;

    const sharesBefore = await stakingVault.balanceOf(user.address);
    await stakingVault.connect(user).deposit(depositAmount, user.address);
    const sharesAfter = await stakingVault.balanceOf(user.address);
    const minted = sharesAfter - sharesBefore;

    console.log(`  NAV:              ${ethers.formatEther(NAV)}`);
    console.log(`  Deposited:        20 wYLDS`);
    console.log(`  PRIME minted:     ${ethers.formatUnits(minted, 6)}`);
    console.log(`  Expected PRIME:   ${ethers.formatUnits(expectedShares, 6)}`);

    expect(minted).to.be.closeTo(expectedShares, 2n); // allow 2 wei rounding
  });

  it("previewRedeem: redeeming those PRIME shares returns ~20 wYLDS", async function () {
    const { stakingVault, user } = await loadFixture(fixture);

    const depositAmount = ethers.parseUnits("20", 6);
    await stakingVault.connect(user).deposit(depositAmount, user.address);
    const shares = await stakingVault.balanceOf(user.address);

    // assets = shares * NAV / 1e18
    const expectedAssets = (shares * NAV) / ethers.parseEther("1");
    const preview = await stakingVault.previewRedeem(shares);

    console.log(`  PRIME held:       ${ethers.formatUnits(shares, 6)}`);
    console.log(`  previewRedeem:    ${ethers.formatUnits(preview, 6)} wYLDS`);
    console.log(`  Expected wYLDS:   ${ethers.formatUnits(expectedAssets, 6)}`);

    expect(preview).to.be.closeTo(expectedAssets, 2n);
  });
});
