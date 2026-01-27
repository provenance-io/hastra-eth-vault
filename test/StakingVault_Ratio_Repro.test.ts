import {expect} from "chai";
import {ethers} from "hardhat";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";

describe("StakingVault Ratio Repro", function () {
  async function deployFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await YieldVault.deploy(await usdc.getAddress(), "wYLDS", "wYLDS", owner.address, owner.address, ethers.ZeroAddress);
    
    const StakingVault = await ethers.getContractFactory("StakingVault");
    const stakingVault = await StakingVault.deploy(await yieldVault.getAddress(), "PRIME", "PRIME", owner.address, 1000, await yieldVault.getAddress());

    // Setup: Mint wYLDS to users
    await usdc.mint(owner.address, ethers.parseUnits("10000", 6));
    await usdc.approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await yieldVault.deposit(ethers.parseUnits("10000", 6), owner.address);
    
    await yieldVault.transfer(user1.address, ethers.parseUnits("1000", 6));
    await yieldVault.transfer(user2.address, ethers.parseUnits("1000", 6));

    await yieldVault.connect(user1).approve(await stakingVault.getAddress(), ethers.MaxUint256);
    await yieldVault.connect(user2).approve(await stakingVault.getAddress(), ethers.MaxUint256);

    return { stakingVault, yieldVault, user1, user2 };
  }

  it("Should maintain 1:1 ratio after unbonding", async function () {
    const { stakingVault, user1, user2 } = await loadFixture(deployFixture);

    // 1. User1 stakes 100
    await stakingVault.connect(user1).deposit(ethers.parseUnits("100", 6), user1.address);
    
    // 2. User1 unbonds 50
    // This locks 50 shares and reserves 50 assets
    await stakingVault.connect(user1).unbond(ethers.parseUnits("50", 6));

    // 3. User2 deposits 10
    // Expected: 10 wYLDS -> 10 PRIME (1:1)
    // Actual (Bug): 10 wYLDS -> 20 PRIME (because totalAssets=50 but totalSupply=100)
    const depositAmount = ethers.parseUnits("10", 6);
    await stakingVault.connect(user2).deposit(depositAmount, user2.address);

    const balance = await stakingVault.balanceOf(user2.address);
    console.log("User2 Deposited:", ethers.formatUnits(depositAmount, 6));
    console.log("User2 Received:", ethers.formatUnits(balance, 6));

    expect(balance).to.equal(depositAmount, "Ratio should remain 1:1");
  });
});
