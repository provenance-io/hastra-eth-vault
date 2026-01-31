import {expect} from "chai";
import pkg from "hardhat";
const { ethers, upgrades } = pkg;
import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";

describe("StakingVault Ratio Repro", function () {
  async function deployFixture() {
    const [owner, userA] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await upgrades.deployProxy(YieldVault, [
      await usdc.getAddress(), 
      "wYLDS", 
      "wYLDS", 
      owner.address, 
      owner.address, 
      ethers.ZeroAddress
    ], { kind: 'uups' });
    
    const StakingVault = await ethers.getContractFactory("StakingVault");
    const stakingVault = await upgrades.deployProxy(StakingVault, [
      await yieldVault.getAddress(), 
      "PRIME", 
      "PRIME", 
      owner.address, 
      await yieldVault.getAddress()
    ], { kind: 'uups' });

    // Distribute wYLDS to user
    const startAmount = ethers.parseUnits("1000", 6);
    await usdc.mint(owner.address, startAmount * 10n);
    await usdc.approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await yieldVault.deposit(startAmount * 3n, owner.address);
    
    await yieldVault.transfer(userA.address, startAmount);
    await yieldVault.connect(userA).approve(await stakingVault.getAddress(), ethers.MaxUint256);

    return { stakingVault, yieldVault, userA };
  }

  it("Should maintain 1:1 ratio after instant redemption", async function () {
    const { stakingVault, yieldVault, userA } = await loadFixture(deployFixture);

    // 1. User A stakes 100
    await stakingVault.connect(userA).deposit(ethers.parseUnits("100", 6), userA.address);
    expect(await stakingVault.balanceOf(userA.address)).to.equal(ethers.parseUnits("100", 6));

    // 2. User A redeems 50 (Instant)
    await stakingVault.connect(userA).redeem(ethers.parseUnits("50", 6), userA.address, userA.address);
    
    // Check internal state
    const totalAssets = await stakingVault.totalAssets();
    const totalSupply = await stakingVault.totalSupply();
    
    // Expected: Assets 50, Supply 50. Price = 1.0
    expect(totalSupply).to.equal(ethers.parseUnits("50", 6));
    expect(totalAssets).to.equal(ethers.parseUnits("50", 6));
  });
});
