import {expect} from "chai";
import pkg from "hardhat";
const { ethers } = pkg;
import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";

describe("StakingVault Ratio Lifecycle Cycle", function () {
  async function deployFixture() {
    const [owner, userA, userB] = await ethers.getSigners();

    // 1. Setup Tokens
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    
    // 2. Setup YieldVault
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await YieldVault.deploy(
      await usdc.getAddress(), 
      "wYLDS", 
      "wYLDS", 
      owner.address, 
      owner.address, 
      ethers.ZeroAddress
    );
    
    // 3. Setup StakingVault with 10s unbonding
    const StakingVault = await ethers.getContractFactory("StakingVault");
    const stakingVault = await StakingVault.deploy(
      await yieldVault.getAddress(), 
      "PRIME", 
      "PRIME", 
      owner.address, 
      10, // 10 seconds unbonding
      await yieldVault.getAddress()
    );

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

  it("Should maintain stable share price through unbond/deposit cycles", async function () {
    const { stakingVault, yieldVault, userA, userB } = await loadFixture(deployFixture);

    console.log("\n--- Cycle Start ---");

    // 1. User A stakes 100
    console.log("1. User A stakes 100 wYLDS");
    await stakingVault.connect(userA).deposit(ethers.parseUnits("100", 6), userA.address);
    expect(await stakingVault.balanceOf(userA.address)).to.equal(ethers.parseUnits("100", 6));

    // 2. User A unbonds 50 (locks assets)
    console.log("2. User A unbonds 50 PRIME");
    await stakingVault.connect(userA).unbond(ethers.parseUnits("50", 6));
    
    // Check internal state
    const totalAssets = await stakingVault.totalAssets();
    const totalSupply = await stakingVault.totalSupply();
    console.log(`   State -> Total Assets: ${ethers.formatUnits(totalAssets, 6)} | Total Supply: ${ethers.formatUnits(totalSupply, 6)}`);
    // Expected: Assets 50, Supply 100.
    // Price = 50 / (100 - 50 locked) = 1.0

    // 3. User B stakes 100 (Critical check)
    console.log("3. User B stakes 100 wYLDS");
    const depositTx = await stakingVault.connect(userB).deposit(ethers.parseUnits("100", 6), userB.address);
    const userBBalance = await stakingVault.balanceOf(userB.address);
    
    console.log(`   User B received: ${ethers.formatUnits(userBBalance, 6)} PRIME`);
    expect(userBBalance).to.equal(ethers.parseUnits("100", 6), "Price should remain 1:1");

    // 4. Wait for unbonding
    console.log("4. Traveling 15 seconds forward...");
    await time.increase(15);

    // 5. User A completes unbonding
    console.log("5. User A completes unbonding");
    const balanceBefore = await yieldVault.balanceOf(userA.address);
    await stakingVault.connect(userA).completeUnbonding(0);
    const balanceAfter = await yieldVault.balanceOf(userA.address);
    const received = balanceAfter - balanceBefore;
    
    console.log(`   User A recovered: ${ethers.formatUnits(received, 6)} wYLDS`);
    expect(received).to.equal(ethers.parseUnits("50", 6));

    // 6. Verify Remaining State
    // User A has 50 PRIME left. User B has 100 PRIME. Total Active Supply = 150.
    // Vault should have 150 wYLDS.
    const finalAssets = await stakingVault.totalAssets();
    console.log(`6. Final Vault Assets: ${ethers.formatUnits(finalAssets, 6)} wYLDS`);
    expect(finalAssets).to.equal(ethers.parseUnits("150", 6));
    
    console.log("--- Cycle Complete (Success) ---");
  });
});
