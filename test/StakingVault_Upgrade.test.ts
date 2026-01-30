import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("StakingVault Upgradeability", function () {
  async function deployFixture() {
    const [owner, userA] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await YieldVault.deploy(
      await usdc.getAddress(), "wYLDS", "wYLDS", owner.address, owner.address, ethers.ZeroAddress
    );

    // Deploy StakingVault as UUPS Proxy
    const StakingVault = await ethers.getContractFactory("StakingVault");
    const stakingVault = await upgrades.deployProxy(StakingVault, [
      await yieldVault.getAddress(), 
      "Prime Staked YLDS", 
      "PRIME", 
      owner.address, 
      await yieldVault.getAddress()
    ], { kind: 'uups' });
    
    return { stakingVault, yieldVault, usdc, owner, userA };
  }

  it("Should deploy V1 correctly", async function () {
    const { stakingVault } = await loadFixture(deployFixture);
    expect(await stakingVault.symbol()).to.equal("PRIME");
  });

  it("Should preserve state after upgrade to V2", async function () {
    const { stakingVault, yieldVault, usdc, owner, userA } = await loadFixture(deployFixture);
    
    // 1. Setup V1 State
    const amount = ethers.parseUnits("100", 6);
    await usdc.mint(userA.address, amount);
    await usdc.connect(userA).approve(await yieldVault.getAddress(), amount);
    await yieldVault.connect(userA).deposit(amount, userA.address);
    
    await yieldVault.connect(userA).approve(await stakingVault.getAddress(), amount);
    await stakingVault.connect(userA).deposit(amount, userA.address);
    
    expect(await stakingVault.balanceOf(userA.address)).to.equal(amount);

    // 2. Upgrade to V2
    const StakingVaultV2 = await ethers.getContractFactory("StakingVaultV2");
    const stakingVaultV2 = await upgrades.upgradeProxy(await stakingVault.getAddress(), StakingVaultV2);

    // 3. Verify Address didn't change
    expect(await stakingVaultV2.getAddress()).to.equal(await stakingVault.getAddress());

    // 4. Verify State Preserved
    expect(await stakingVaultV2.balanceOf(userA.address)).to.equal(amount);
    
    // 5. Verify New Logic
    expect(await stakingVaultV2.version()).to.equal(2);
    expect(await stakingVaultV2.echo("Hello")).to.equal("Hello");
  });
});
