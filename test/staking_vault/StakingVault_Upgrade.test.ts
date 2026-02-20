import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { MockUSDC, YieldVault, StakingVault } from "../../typechain-types";

describe("StakingVault Upgradeability", function () {
  async function deployFixture() {
    const [owner, userA] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy() as unknown as MockUSDC;
    
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await upgrades.deployProxy(YieldVault, [
      await usdc.getAddress(), "wYLDS", "wYLDS", owner.address, owner.address, ethers.ZeroAddress
    ], {   kind: 'uups' }) as unknown as StakingVault;

    // Deploy StakingVault as UUPS Proxy
    const StakingVault = await ethers.getContractFactory("StakingVault");
    const stakingVault = await upgrades.deployProxy(StakingVault, [
      await yieldVault.getAddress(), 
      "Prime Staked YLDS", 
      "PRIME", 
      owner.address, 
      await yieldVault.getAddress()
    ], {   kind: 'uups' }) as unknown as StakingVault;
    
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

    // 2b. Initialize V2 to sync _totalManagedAssets
    await stakingVaultV2.initializeV2();

    // 3. Verify Address didn't change
    expect(await stakingVaultV2.getAddress()).to.equal(await stakingVault.getAddress());

    // 4. Verify State Preserved
    expect(await stakingVaultV2.balanceOf(userA.address)).to.equal(amount);
    
    // 4b. Verify totalAssets() matches actual balance (critical for share price)
    const totalAssets = await stakingVaultV2.totalAssets();
    const actualBalance = await yieldVault.balanceOf(await stakingVaultV2.getAddress());
    expect(totalAssets).to.equal(actualBalance, "_totalManagedAssets should match actual balance after initializeV2");
    
    // 5. Verify V2 Version
    expect(await stakingVaultV2.version()).to.equal(3);
  });

  it("Should prevent unauthorized users from calling initializeV2", async function () {
    const { stakingVault, userA } = await loadFixture(deployFixture);
    
    // Upgrade to V2
    const StakingVaultV2 = await ethers.getContractFactory("StakingVaultV2");
    const stakingVaultV2 = await upgrades.upgradeProxy(await stakingVault.getAddress(), StakingVaultV2);

    // Try to call initializeV2 as non-upgrader (should fail)
    await expect(
      stakingVaultV2.connect(userA).initializeV2()
    ).to.be.reverted; // Will revert with AccessControl error
  });

  it("Should prevent calling initializeV2 twice", async function () {
    const { stakingVault, owner } = await loadFixture(deployFixture);
    
    // Upgrade to V2
    const StakingVaultV2 = await ethers.getContractFactory("StakingVaultV2");
    const stakingVaultV2 = await upgrades.upgradeProxy(await stakingVault.getAddress(), StakingVaultV2);

    // First call succeeds
    await stakingVaultV2.connect(owner).initializeV2();
    
    // Second call should fail (already initialized)
    await expect(
      stakingVaultV2.connect(owner).initializeV2()
    ).to.be.revertedWithCustomError(stakingVaultV2, "InvalidInitialization");
  });

  it("Should allow _totalManagedAssets to be mutated through deposits/withdraws after initializeV2", async function () {
    const { stakingVault, yieldVault, usdc, owner, userA } = await loadFixture(deployFixture);
    
    // Setup initial deposit
    const amount = ethers.parseUnits("100", 6);
    await usdc.mint(userA.address, amount * 2n);
    await usdc.connect(userA).approve(await yieldVault.getAddress(), amount * 2n);
    await yieldVault.connect(userA).deposit(amount, userA.address);
    await yieldVault.connect(userA).approve(await stakingVault.getAddress(), amount);
    await stakingVault.connect(userA).deposit(amount, userA.address);
    
    // Upgrade to V2 and initialize
    const StakingVaultV2 = await ethers.getContractFactory("StakingVaultV2");
    const stakingVaultV2 = await upgrades.upgradeProxy(await stakingVault.getAddress(), StakingVaultV2);
    await stakingVaultV2.initializeV2();

    const totalAssetsAfterInit = await stakingVaultV2.totalAssets();
    expect(totalAssetsAfterInit).to.equal(amount);

    // Make another deposit - should mutate _totalManagedAssets
    await yieldVault.connect(userA).deposit(amount, userA.address);
    await yieldVault.connect(userA).approve(await stakingVaultV2.getAddress(), amount);
    await stakingVaultV2.connect(userA).deposit(amount, userA.address);

    // Verify _totalManagedAssets was mutated through normal operations
    const totalAssetsAfterDeposit = await stakingVaultV2.totalAssets();
    expect(totalAssetsAfterDeposit).to.equal(amount * 2n);
  });
});
