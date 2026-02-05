import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { MockUSDC, YieldVault, StakingVault } from "../typechain-types";

describe("StakingVault - Inflation Attack Protection", function () {
  
  async function deployFixture() {
    const [owner, attacker, victim] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy() as unknown as MockUSDC;

    // Deploy YieldVault
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await upgrades.deployProxy(YieldVault, [
      await usdc.getAddress(),
      "wYLDS",
      "wYLDS",
      owner.address,
      owner.address,
      ethers.ZeroAddress
    ], { kind: 'uups' }) as unknown as YieldVault;

    // Deploy StakingVault
    const StakingVault = await ethers.getContractFactory("StakingVault");
    const stakingVault = await upgrades.deployProxy(StakingVault, [
      await yieldVault.getAddress(),
      "PRIME",
      "PRIME",
      owner.address,
      await yieldVault.getAddress()
    ], { kind: 'uups' }) as unknown as StakingVault;

    // Setup roles
    const REWARDS_ADMIN = await yieldVault.REWARDS_ADMIN_ROLE();
    await yieldVault.grantRole(REWARDS_ADMIN, await stakingVault.getAddress());

    // Mint USDC and get wYLDS for participants
    const amount = ethers.parseUnits("100000", 6);
    await usdc.mint(attacker.address, amount);
    await usdc.mint(victim.address, amount);

    await usdc.connect(attacker).approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await usdc.connect(victim).approve(await yieldVault.getAddress(), ethers.MaxUint256);

    await yieldVault.connect(attacker).deposit(amount, attacker.address);
    await yieldVault.connect(victim).deposit(amount, victim.address);

    await yieldVault.connect(attacker).approve(await stakingVault.getAddress(), ethers.MaxUint256);
    await yieldVault.connect(victim).approve(await stakingVault.getAddress(), ethers.MaxUint256);

    return { stakingVault, yieldVault, usdc, owner, attacker, victim };
  }

  it("Should protect against inflation attack via donation", async function () {
    const { stakingVault, yieldVault, attacker, victim } = await loadFixture(deployFixture);

    // ATTACK ATTEMPT:
    // Step 1: Attacker deposits tiny amount
    const tinyDeposit = 1; // 1 raw unit = 0.000001 wYLDS
    await stakingVault.connect(attacker).deposit(tinyDeposit, attacker.address);
    
    const attackerSharesAfterDeposit = await stakingVault.balanceOf(attacker.address);
    console.log("Attacker deposited:", tinyDeposit, "got shares:", attackerSharesAfterDeposit.toString());

    // Step 2: Attacker "donates" wYLDS directly to inflate share price
    const donationAmount = ethers.parseUnits("10000", 6); // 10,000 wYLDS
    await yieldVault.connect(attacker).transfer(await stakingVault.getAddress(), donationAmount);
    
    const totalAssetsAfterDonation = await stakingVault.totalAssets();
    const totalSupplyAfterDonation = await stakingVault.totalSupply();
    console.log("After donation - Total assets:", ethers.formatUnits(totalAssetsAfterDonation, 6));
    console.log("After donation - Total supply:", ethers.formatUnits(totalSupplyAfterDonation, 6));

    // Step 3: Victim deposits large amount
    const victimDeposit = ethers.parseUnits("19999", 6); // 19,999 wYLDS
    const victimSharesBefore = await stakingVault.balanceOf(victim.address);
    
    await stakingVault.connect(victim).deposit(victimDeposit, victim.address);
    
    const victimSharesAfter = await stakingVault.balanceOf(victim.address);
    const victimSharesReceived = victimSharesAfter - victimSharesBefore;
    
    console.log("Victim deposited:", ethers.formatUnits(victimDeposit, 6), "wYLDS");
    console.log("Victim received:", ethers.formatUnits(victimSharesReceived, 6), "PRIME");

    // Calculate what victim's shares are worth
    const victimAssetsValue = await stakingVault.convertToAssets(victimSharesReceived);
    console.log("Victim's shares worth:", ethers.formatUnits(victimAssetsValue, 6), "wYLDS");

    // WITH INTERNAL ACCOUNTING PROTECTION: Victim should receive EXACT 1:1 shares
    // Direct transfers are completely ignored by totalAssets()
    const lossPercentage = ((victimDeposit - victimAssetsValue) * 10000n) / victimDeposit;
    console.log("Victim loss percentage:", Number(lossPercentage) / 100, "%");

    // With internal accounting, there should be ZERO loss
    // Without protection, loss would be ~50%
    expect(lossPercentage).to.equal(0n); // Perfect 1:1, zero loss!
    
    // Victim's shares should be worth exactly what they deposited
    expect(victimAssetsValue).to.equal(victimDeposit); // Exact match, no rounding loss
  });

  it("Should maintain fair share pricing after attack attempt", async function () {
    const { stakingVault, yieldVault, attacker, victim } = await loadFixture(deployFixture);

    // Attacker tries the attack
    await stakingVault.connect(attacker).deposit(1, attacker.address);
    await yieldVault.connect(attacker).transfer(await stakingVault.getAddress(), ethers.parseUnits("10000", 6));
    
    // Victim deposits
    await stakingVault.connect(victim).deposit(ethers.parseUnits("19999", 6), victim.address);

    // Get final balances
    const attackerShares = await stakingVault.balanceOf(attacker.address);
    const victimShares = await stakingVault.balanceOf(victim.address);
    
    const attackerAssets = await stakingVault.convertToAssets(attackerShares);
    const victimAssets = await stakingVault.convertToAssets(victimShares);
    
    console.log("\nFinal distribution:");
    console.log("Attacker shares:", ethers.formatUnits(attackerShares, 6), "worth:", ethers.formatUnits(attackerAssets, 6), "wYLDS");
    console.log("Victim shares:", ethers.formatUnits(victimShares, 6), "worth:", ethers.formatUnits(victimAssets, 6), "wYLDS");

    // Attacker should NOT profit at all - their donation is completely wasted
    const attackerSpent = BigInt(1) + ethers.parseUnits("10000", 6);
    const attackerProfit = attackerAssets > attackerSpent ? attackerAssets - attackerSpent : 0n;
    console.log("Attacker profit:", ethers.formatUnits(attackerProfit, 6), "wYLDS");
    
    // With internal accounting protection, attacker gets ZERO profit (donation is ignored)
    expect(attackerProfit).to.equal(0n); // No profit at all!
    
    // Attacker's donation is permanently lost
    const attackerLoss = attackerSpent - attackerAssets;
    expect(attackerLoss).to.equal(ethers.parseUnits("10000", 6)); // Lost the entire donation
  });
});
