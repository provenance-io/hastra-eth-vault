import {expect} from "chai";
import pkg from "hardhat";
const { ethers, upgrades } = pkg;
import type { MockUSDC, YieldVault, StakingVault } from "../typechain-types";
import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";

describe("StakingVault Ratio Lifecycle Cycle", function () {
  async function deployFixture() {
    const [owner, userA, userB] = await ethers.getSigners();

    // 1. Setup Tokens
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy() as unknown as MockUSDC;
    
    // 2. Setup YieldVault
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await upgrades.deployProxy(YieldVault, [
      await usdc.getAddress(), 
      "wYLDS", 
      "wYLDS", 
      owner.address, 
      owner.address, 
      ethers.ZeroAddress
    ], {   kind: 'uups' }) as unknown as StakingVault;
    
    // 3. Setup StakingVault (Instant Exit)
    const StakingVault = await ethers.getContractFactory("StakingVault");
    const stakingVault = await upgrades.deployProxy(StakingVault, [
      await yieldVault.getAddress(), 
      "PRIME", 
      "PRIME", 
      owner.address, 
      await yieldVault.getAddress()
    ], {   kind: 'uups' }) as unknown as StakingVault;

    // 4. Distribute wYLDS to users
    const startAmount = ethers.parseUnits("1000", 6);
    await usdc.mint(owner.address, startAmount * 10n);
    await usdc.approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await yieldVault.deposit(startAmount * 3n, owner.address);
    
    await yieldVault.transfer(userA.address, startAmount);
    await yieldVault.transfer(userB.address, startAmount);

    await yieldVault.connect(userA).approve(await stakingVault.getAddress(), ethers.MaxUint256);
    await yieldVault.connect(userB).approve(await stakingVault.getAddress(), ethers.MaxUint256);

    return { stakingVault, yieldVault, userA, userB };
  }

  it("Should maintain stable share price through stake/redeem cycles", async function () {
    const { stakingVault, yieldVault, userA, userB } = await loadFixture(deployFixture);

    console.log("\n--- Cycle Start ---");

    // 1. User A stakes 100
    console.log("1. User A stakes 100 wYLDS");
    await stakingVault.connect(userA).deposit(ethers.parseUnits("100", 6), userA.address);
    expect(await stakingVault.balanceOf(userA.address)).to.equal(ethers.parseUnits("100", 6));

    // 2. User A redeems 50 (Instant)
    console.log("2. User A redeems 50 PRIME");
    const balanceBefore = await yieldVault.balanceOf(userA.address);
    await stakingVault.connect(userA).redeem(ethers.parseUnits("50", 6), userA.address, userA.address);
    const balanceAfter = await yieldVault.balanceOf(userA.address);
    const received = balanceAfter - balanceBefore;
    
    console.log(`   User A recovered: ${ethers.formatUnits(received, 6)} wYLDS`);
    expect(received).to.equal(ethers.parseUnits("50", 6));

    // 3. User B stakes 100 (Critical check)
    console.log("3. User B stakes 100 wYLDS");
    await stakingVault.connect(userB).deposit(ethers.parseUnits("100", 6), userB.address);
    const userBBalance = await stakingVault.balanceOf(userB.address);
    
    console.log(`   User B received: ${ethers.formatUnits(userBBalance, 6)} PRIME`);
    expect(userBBalance).to.equal(ethers.parseUnits("100", 6), "Price should remain 1:1");

    // 4. Verify Remaining State
    // User A has 50. User B has 100. Total = 150.
    const finalAssets = await stakingVault.totalAssets();
    console.log(`4. Final Vault Assets: ${ethers.formatUnits(finalAssets, 6)} wYLDS`);
    expect(finalAssets).to.equal(ethers.parseUnits("150", 6));
    
    console.log("--- Cycle Complete (Success) ---");
  });
});