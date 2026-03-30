import {expect} from "chai";
import { ethers, upgrades } from "hardhat";
import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import type { MockUSDC, YieldVault, StakingVault, MockFeedVerifier } from "../typechain-types";

describe("Full System Flow: Deposit -> Stake -> Rewards -> Profit", function () {
  async function deploySystemFixture() {
    const [owner, userA] = await ethers.getSigners();

    // 1. Setup Tokens
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy() as unknown as MockUSDC;
    
    // 2. Setup YieldVault (Upgradeable)
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await upgrades.deployProxy(YieldVault, [
      await usdc.getAddress(), 
      "wYLDS", 
      "wYLDS", 
      owner.address, 
      owner.address, 
      ethers.ZeroAddress
    ], { kind: 'uups' }) as unknown as YieldVault;
    
    // 3. Setup StakingVault (Upgradeable)
    const StakingVault = await ethers.getContractFactory("StakingVault");
    const stakingVault = await upgrades.deployProxy(StakingVault, [
      await yieldVault.getAddress(), 
      "PRIME", 
      "PRIME", 
      owner.address, 
      await yieldVault.getAddress()
    ], { kind: 'uups' }) as unknown as StakingVault;

    // Setup Roles
    const REWARDS_ADMIN_ROLE = await stakingVault.REWARDS_ADMIN_ROLE();
    const YIELD_REWARDS_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
    
    await stakingVault.grantRole(REWARDS_ADMIN_ROLE, owner.address);
    // YieldVault must allow StakingVault to mint rewards
    await yieldVault.grantRole(YIELD_REWARDS_ROLE, await stakingVault.getAddress());
    // Owner must be allowed to complete redemption
    await yieldVault.grantRole(YIELD_REWARDS_ROLE, owner.address);

    // Setup NAV oracle at NAV=1.0 (required — no fallback path)
    const FEED_ID = ethers.encodeBytes32String("TEST_FEED");
    const MockFeedVerifier = await ethers.getContractFactory("MockFeedVerifier");
    const oracle = await MockFeedVerifier.deploy() as unknown as MockFeedVerifier;
    const now = await time.latest();
    await oracle.setPrice(FEED_ID, ethers.parseUnits("1", 18), now);
    const NAV_ORACLE_UPDATER_ROLE = await stakingVault.NAV_ORACLE_UPDATER_ROLE();
    await stakingVault.grantRole(NAV_ORACLE_UPDATER_ROLE, owner.address);
    await stakingVault.setNavOracle(await oracle.getAddress(), FEED_ID);

    return { stakingVault, yieldVault, usdc, owner, userA, oracle, FEED_ID };
  }

  it("Should execute the full appreciation flow", async function () {
    const { usdc, yieldVault, stakingVault, owner, userA, oracle, FEED_ID } = await loadFixture(deploySystemFixture);

    // ==========================================
    // Step 1: User gets USDC and Deposits to YieldVault
    // ==========================================
    const initialAmount = ethers.parseUnits("100", 6);
    await usdc.mint(userA.address, initialAmount);
    
    await usdc.connect(userA).approve(await yieldVault.getAddress(), initialAmount);
    await yieldVault.connect(userA).deposit(initialAmount, userA.address);
    
    // Check: User has 100 wYLDS
    expect(await yieldVault.balanceOf(userA.address)).to.equal(initialAmount);

    // ==========================================
    // Step 2: User Stakes wYLDS for PRIME
    // ==========================================
    await yieldVault.connect(userA).approve(await stakingVault.getAddress(), initialAmount);
    await stakingVault.connect(userA).deposit(initialAmount, userA.address);

    // Check: User has 100 PRIME
    expect(await stakingVault.balanceOf(userA.address)).to.equal(initialAmount); // 1:1 initially

    // ==========================================
    // Step 3: Admin Distributes Rewards (The Magic)
    // ==========================================
    // Raise cap to 20% for this test (default is 75 bps; test exercises full appreciation flow, not the cap)
    await stakingVault.connect(owner).setMaxRewardPercent(ethers.parseEther("0.2"));
    const rewardAmount = ethers.parseUnits("10", 6);
    await stakingVault.connect(owner).distributeRewards(rewardAmount);

    // Update oracle NAV to reflect the 10% reward increase (100 → 110 wYLDS, 100 shares)
    const navAfterRewards = await time.latest();
    await oracle.setPrice(FEED_ID, ethers.parseUnits("1.1", 18), navAfterRewards);

    // Check: StakingVault now has 110 wYLDS
    const expectedTotalAssets = initialAmount + rewardAmount;
    expect(await yieldVault.balanceOf(await stakingVault.getAddress())).to.equal(expectedTotalAssets);

    // Check: PRIME price appreciated
    // 1 PRIME = (110 wYLDS / 100 PRIME) = 1.1 wYLDS
    const onePrime = ethers.parseUnits("1", 6);
    const wYLDSValue = await stakingVault.convertToAssets(onePrime);
    expect(wYLDSValue).to.be.closeTo(ethers.parseUnits("1.1", 6), 2);

    // ==========================================
    // Step 4: User Redeems PRIME (Instant Exit)
    // ==========================================
    const primeBalance = await stakingVault.balanceOf(userA.address);
    await stakingVault.connect(userA).redeem(primeBalance, userA.address, userA.address);

    // Check: User has 110 wYLDS
    const finalWyldsBalance = await yieldVault.balanceOf(userA.address);
    expect(finalWyldsBalance).to.be.closeTo(expectedTotalAssets, 2); // 110 wYLDS

    // ==========================================
    // Step 5: User Requests Redemption (Two-Step)
    // ==========================================
    await yieldVault.connect(userA).requestRedeem(finalWyldsBalance);

    // ==========================================
    // Step 6: Admin Completes Redemption
    // ==========================================
    // Fund RedeemVault (Owner) with enough USDC to pay out principal + rewards
    await usdc.mint(owner.address, finalWyldsBalance);
    await usdc.connect(owner).approve(await yieldVault.getAddress(), finalWyldsBalance);

    await yieldVault.connect(owner).completeRedeem(userA.address);

    // Final Check: User has 110 USDC
    expect(await usdc.balanceOf(userA.address)).to.be.closeTo(expectedTotalAssets, 2);
  });
});