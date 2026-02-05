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
    await usdc.mint(owner.address, amount);
    await usdc.mint(attacker.address, amount);
    await usdc.mint(victim.address, amount);

    await usdc.connect(owner).approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await usdc.connect(attacker).approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await usdc.connect(victim).approve(await yieldVault.getAddress(), ethers.MaxUint256);

    await yieldVault.connect(owner).deposit(amount, owner.address);
    await yieldVault.connect(attacker).deposit(amount, attacker.address);
    await yieldVault.connect(victim).deposit(amount, victim.address);

    await yieldVault.connect(owner).approve(await stakingVault.getAddress(), ethers.MaxUint256);
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

  it("Should protect existing depositors when attacker tries inflation attack on populated vault", async function () {
    const { stakingVault, yieldVault, attacker, victim, owner } = await loadFixture(deployFixture);

    // Setup: Legitimate users deposit first (vault is NOT empty)
    const user1Deposit = ethers.parseUnits("50000", 6);
    const user2Deposit = ethers.parseUnits("30000", 6);
    
    await stakingVault.connect(owner).deposit(user1Deposit, owner.address);
    await stakingVault.connect(victim).deposit(user2Deposit, victim.address);

    const user1SharesBefore = await stakingVault.balanceOf(owner.address);
    const user2SharesBefore = await stakingVault.balanceOf(victim.address);
    const totalSupplyBefore = await stakingVault.totalSupply();
    const totalAssetsBefore = await stakingVault.totalAssets();

    console.log("\nBefore attack:");
    console.log("User1 shares:", ethers.formatUnits(user1SharesBefore, 6));
    console.log("User2 shares:", ethers.formatUnits(user2SharesBefore, 6));
    console.log("Total supply:", ethers.formatUnits(totalSupplyBefore, 6));
    console.log("Total assets:", ethers.formatUnits(totalAssetsBefore, 6));

    // ATTACK ATTEMPT on populated vault:
    // Step 1: Attacker deposits small amount
    await stakingVault.connect(attacker).deposit(ethers.parseUnits("100", 6), attacker.address);
    
    // Step 2: Attacker donates large amount (but not more than they have left)
    const hugeDonation = ethers.parseUnits("50000", 6); // 50,000 wYLDS
    await yieldVault.connect(attacker).transfer(await stakingVault.getAddress(), hugeDonation);
    
    console.log("\nAttacker donated:", ethers.formatUnits(hugeDonation, 6), "wYLDS");

    // Check that totalAssets IGNORES the donation
    const totalAssetsAfterDonation = await stakingVault.totalAssets();
    expect(totalAssetsAfterDonation).to.equal(totalAssetsBefore + ethers.parseUnits("100", 6));
    console.log("Total assets after donation:", ethers.formatUnits(totalAssetsAfterDonation, 6), "(donation ignored ✅)");

    // Step 3: New victim tries to deposit
    const newVictimDeposit = ethers.parseUnits("20000", 6);
    await stakingVault.connect(attacker).deposit(newVictimDeposit, attacker.address);

    // Verify existing users' share values are UNCHANGED
    const user1SharesAfter = await stakingVault.balanceOf(owner.address);
    const user2SharesAfter = await stakingVault.balanceOf(victim.address);
    
    expect(user1SharesAfter).to.equal(user1SharesBefore); // Shares unchanged
    expect(user2SharesAfter).to.equal(user2SharesBefore); // Shares unchanged

    const user1ValueAfter = await stakingVault.convertToAssets(user1SharesAfter);
    const user2ValueAfter = await stakingVault.convertToAssets(user2SharesAfter);

    console.log("\nAfter attack:");
    console.log("User1 shares:", ethers.formatUnits(user1SharesAfter, 6), "worth:", ethers.formatUnits(user1ValueAfter, 6), "wYLDS");
    console.log("User2 shares:", ethers.formatUnits(user2SharesAfter, 6), "worth:", ethers.formatUnits(user2ValueAfter, 6), "wYLDS");

    // Existing users' shares should still be worth what they deposited (1:1 ratio maintained)
    expect(user1ValueAfter).to.equal(user1Deposit);
    expect(user2ValueAfter).to.equal(user2Deposit);

    // Verify new deposits still get fair pricing
    const totalAssetsAfterAll = await stakingVault.totalAssets();
    const expectedAssets = user1Deposit + user2Deposit + ethers.parseUnits("100", 6) + newVictimDeposit;
    expect(totalAssetsAfterAll).to.equal(expectedAssets);
    
    console.log("\n✅ Existing users protected!");
    console.log("✅ New depositors get fair shares!");
    console.log("✅ Attacker's 50,000 wYLDS donation wasted!");
  });
});
