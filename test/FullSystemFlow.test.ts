import { expect } from "chai";
import pkg from "hardhat";
const { ethers } = pkg;
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("Full System Flow: Deposit -> Stake -> Rewards -> Profit", function () {
  async function deploySystemFixture() {
    const [owner, admin, user] = await ethers.getSigners();

    // 1. Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    // 2. Deploy YieldVault (wYLDS)
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await YieldVault.deploy(
      await usdc.getAddress(),
      "Wrapped YLDS",
      "wYLDS",
      admin.address,
      admin.address, // redeemVault
      ethers.ZeroAddress
    );
    await yieldVault.waitForDeployment();

    // 3. Deploy StakingVault (PRIME)
    const StakingVault = await ethers.getContractFactory("StakingVault");
    const stakingVault = await StakingVault.deploy(
      await yieldVault.getAddress(),
      "Prime Token",
      "PRIME",
      admin.address,
      86400, // 1 day unbonding
      await yieldVault.getAddress()
    );
    await stakingVault.waitForDeployment();

    // 4. Setup Roles
    const REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
    await yieldVault.connect(admin).grantRole(REWARDS_ADMIN_ROLE, admin.address);
    // Grant StakingVault role to mint rewards? No, the StakingVault code calls mintRewards via interface.
    // Actually, looking at StakingVault.sol, "distributeRewards" calls "yieldVault.mintRewards".
    // So the StakingVault CONTRACT must have REWARDS_ADMIN_ROLE on YieldVault.
    await yieldVault.connect(admin).grantRole(REWARDS_ADMIN_ROLE, await stakingVault.getAddress());
    
    // Also grant REWARDS_ADMIN_ROLE to admin on StakingVault so they can call distributeRewards
    const STAKING_REWARDS_ROLE = await stakingVault.REWARDS_ADMIN_ROLE();
    await stakingVault.connect(admin).grantRole(STAKING_REWARDS_ROLE, admin.address);

    return { usdc, yieldVault, stakingVault, owner, admin, user };
  }

  it("Should execute the full appreciation flow", async function () {
    const { usdc, yieldVault, stakingVault, admin, user } = await loadFixture(deploySystemFixture);

    // ==========================================
    // Step 1: User gets USDC and Deposits to YieldVault
    // ==========================================
    const initialAmount = ethers.parseUnits("100", 6);
    await usdc.mint(user.address, initialAmount);
    
    await usdc.connect(user).approve(await yieldVault.getAddress(), initialAmount);
    await yieldVault.connect(user).deposit(initialAmount, user.address);
    
    // Check: User has 100 wYLDS
    expect(await yieldVault.balanceOf(user.address)).to.equal(initialAmount);
    // Check: YieldVault has 100 USDC
    expect(await usdc.balanceOf(await yieldVault.getAddress())).to.equal(initialAmount);

    // ==========================================
    // Step 2: User Stakes wYLDS for PRIME
    // ==========================================
    await yieldVault.connect(user).approve(await stakingVault.getAddress(), initialAmount);
    await stakingVault.connect(user).deposit(initialAmount, user.address);

    // Check: User has 100 PRIME
    expect(await stakingVault.balanceOf(user.address)).to.equal(initialAmount); // 1:1 initially
    // Check: StakingVault has 100 wYLDS
    expect(await yieldVault.balanceOf(await stakingVault.getAddress())).to.equal(initialAmount);

    // ==========================================
    // Step 3: Admin Distributes Rewards (The Magic)
    // ==========================================
    // "Interest accumulated was 10 wYLDS"
    const rewardAmount = ethers.parseUnits("10", 6);
    
    // Admin calls StakingVault to distribute rewards
    // This triggers yieldVault.mintRewards(stakingVault, 10)
    await stakingVault.connect(admin).distributeRewards(rewardAmount);

    // Check: StakingVault now has 110 wYLDS
    const expectedTotalAssets = initialAmount + rewardAmount;
    expect(await yieldVault.balanceOf(await stakingVault.getAddress())).to.equal(expectedTotalAssets);

    // Check: PRIME price appreciated
    // 1 PRIME = (110 wYLDS / 100 PRIME) = 1.1 wYLDS
    const onePrime = ethers.parseUnits("1", 6);
    const wYLDSValue = await stakingVault.convertToAssets(onePrime);
    expect(wYLDSValue).to.be.closeTo(ethers.parseUnits("1.1", 6), 2);

    // ==========================================
    // Step 4: User Unbonds/Withdraws PRIME
    // ==========================================
    // User unbonds all 100 PRIME
    await stakingVault.connect(user).unbond(initialAmount); // 100 PRIME
    
    // Wait for unbonding period (simulate time pass)
    // Note: We need to increase time > 86400
    // Using hardhat network helper
    // import { time } from "@nomicfoundation/hardhat-network-helpers";
    // We can't use it directly here as it wasn't imported in this scope, 
    // but we can use ethers.provider.send("evm_increaseTime", [86400])
    await ethers.provider.send("evm_increaseTime", [86500]);
    await ethers.provider.send("evm_mine", []);

    // Withdraw from StakingVault
    // We need to know the index of unbonding (0)
    await stakingVault.connect(user).completeUnbonding(0);

    // Check: User has 110 wYLDS
    const finalWyldsBalance = await yieldVault.balanceOf(user.address);
    expect(finalWyldsBalance).to.be.closeTo(expectedTotalAssets, 2); // 110 wYLDS

    // ==========================================
    // Step 5: User Requests Redemption (Two-Step)
    // ==========================================
    // User requests to redeem all wYLDS
    await yieldVault.connect(user).requestRedeem(finalWyldsBalance);

    // ==========================================
    // Step 6: Admin Tries to Complete (Before Funding)
    // ==========================================
    // CRITICAL: At this point, YieldVault has 100 USDC but User wants 110 USDC.
    // completeRedeem checks balance. Should fail.
    await expect(
        yieldVault.connect(admin).completeRedeem(user.address)
    ).to.be.revertedWithCustomError(yieldVault, "InsufficientVaultBalance");

    // ==========================================
    // Step 7: Admin Funds Redeem Vault (Strategy)
    // ==========================================
    // In production, the WITHDRAWAL_ADMIN would have moved the 100 USDC deposit 
    // to the RedeemVault earlier. Here we simulate the RedeemVault holding 
    // the full 110 USDC (Principal + Interest).
    const totalRedeemAmount = expectedTotalAssets; // ~110
    
    // Mint 110 USDC to Admin (RedeemVault)
    await usdc.mint(admin.address, totalRedeemAmount);
    
    // RedeemVault must approve YieldVault to spend
    await usdc.connect(admin).approve(await yieldVault.getAddress(), totalRedeemAmount);

    // ==========================================
    // Step 8: Admin Completes Redemption
    // ==========================================
    await yieldVault.connect(admin).completeRedeem(user.address);

    // Final Check: User has 110 USDC
    // Use closeTo because finalWyldsBalance was slightly rounded
    expect(await usdc.balanceOf(user.address)).to.be.closeTo(expectedTotalAssets, 2);
  });
});
