import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import type { MockUSDC, YieldVault, StakingVault, MockFeedVerifier } from "../../typechain-types";

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

    // Setup NAV oracle at NAV=1.0 (required — no fallback path)
    const FEED_ID = ethers.encodeBytes32String("TEST_FEED");
    const MockFeedVerifier = await ethers.getContractFactory("MockFeedVerifier");
    const oracle = await MockFeedVerifier.deploy() as unknown as MockFeedVerifier;
    const now = await time.latest();
    await oracle.setPrice(FEED_ID, ethers.parseUnits("1", 18), now);
    const NAV_ORACLE_UPDATER_ROLE = await stakingVault.NAV_ORACLE_UPDATER_ROLE();
    await stakingVault.grantRole(NAV_ORACLE_UPDATER_ROLE, owner.address);
    await stakingVault.setNavOracle(await oracle.getAddress(), FEED_ID);

    return { stakingVault, yieldVault, usdc, owner, attacker, victim, oracle, FEED_ID };
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
    
    // Attacker should NOT profit at all - their donation is completely wasted
    const attackerSpent = BigInt(1) + ethers.parseUnits("10000", 6);
    const attackerProfit = attackerAssets > attackerSpent ? attackerAssets - attackerSpent : 0n;
    
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

  it("Should correctly track assets through deposit and withdrawal cycles", async function () {
    const { stakingVault, yieldVault, attacker, victim } = await loadFixture(deployFixture);

    // Deposit cycle
    const deposit1 = ethers.parseUnits("1000", 6);
    const deposit2 = ethers.parseUnits("2000", 6);
    
    await stakingVault.connect(attacker).deposit(deposit1, attacker.address);
    expect(await stakingVault.totalAssets()).to.equal(deposit1);
    
    await stakingVault.connect(victim).deposit(deposit2, victim.address);
    expect(await stakingVault.totalAssets()).to.equal(deposit1 + deposit2);

    console.log("After deposits - Total assets:", ethers.formatUnits(await stakingVault.totalAssets(), 6));

    // Withdrawal cycle
    const attackerShares = await stakingVault.balanceOf(attacker.address);
    const withdrawAmount = attackerShares / 2n; // Withdraw half
    
    await stakingVault.connect(attacker).redeem(withdrawAmount, attacker.address, attacker.address);
    
    const expectedAfterWithdraw = deposit1 + deposit2 - deposit1 / 2n;
    expect(await stakingVault.totalAssets()).to.equal(expectedAfterWithdraw);
    
    console.log("After withdrawal - Total assets:", ethers.formatUnits(await stakingVault.totalAssets(), 6));

    // Full withdrawal of remaining attacker shares
    const remainingShares = await stakingVault.balanceOf(attacker.address);
    await stakingVault.connect(attacker).redeem(remainingShares, attacker.address, attacker.address);
    
    expect(await stakingVault.totalAssets()).to.equal(deposit2); // Only victim's deposit left
    console.log("After full attacker withdrawal - Total assets:", ethers.formatUnits(await stakingVault.totalAssets(), 6));

    // Verify victim's shares still worth exact amount
    const victimShares = await stakingVault.balanceOf(victim.address);
    const victimValue = await stakingVault.convertToAssets(victimShares);
    expect(victimValue).to.equal(deposit2);
  });

  it("Should maintain correct accounting during withdrawals after donation attack", async function () {
    const { stakingVault, yieldVault, attacker, victim } = await loadFixture(deployFixture);

    // Setup: Users deposit
    const deposit1 = ethers.parseUnits("5000", 6);
    const deposit2 = ethers.parseUnits("3000", 6);
    
    await stakingVault.connect(attacker).deposit(deposit1, attacker.address);
    await stakingVault.connect(victim).deposit(deposit2, victim.address);

    const totalBefore = await stakingVault.totalAssets();
    expect(totalBefore).to.equal(deposit1 + deposit2);

    // Attack: Donate large amount
    const donation = ethers.parseUnits("20000", 6);
    await yieldVault.connect(attacker).transfer(await stakingVault.getAddress(), donation);

    console.log("\nDonation of", ethers.formatUnits(donation, 6), "wYLDS made");
    
    // Verify donation is ignored
    const totalAfterDonation = await stakingVault.totalAssets();
    expect(totalAfterDonation).to.equal(totalBefore);
    console.log("Total assets still:", ethers.formatUnits(totalAfterDonation, 6), "(donation ignored ✅)");

    // Now attacker withdraws
    const attackerShares = await stakingVault.balanceOf(attacker.address);
    const attackerAssetsBefore = await stakingVault.convertToAssets(attackerShares);
    
    await stakingVault.connect(attacker).redeem(attackerShares, attacker.address, attacker.address);
    
    const totalAfterWithdraw = await stakingVault.totalAssets();
    expect(totalAfterWithdraw).to.equal(deposit2); // Only victim's deposit should remain
    console.log("After attacker withdrawal - Total assets:", ethers.formatUnits(totalAfterWithdraw, 6));

    // Victim's shares should still be worth exactly their deposit
    const victimShares = await stakingVault.balanceOf(victim.address);
    const victimValue = await stakingVault.convertToAssets(victimShares);
    expect(victimValue).to.equal(deposit2);
    console.log("Victim's shares still worth:", ethers.formatUnits(victimValue, 6), "wYLDS ✅");

    // Verify attacker got back exactly what they deposited (no benefit from donation)
    expect(attackerAssetsBefore).to.equal(deposit1);
  });

  it("Should handle multiple deposit/withdraw cycles with correct internal accounting", async function () {
    const { stakingVault, yieldVault, attacker, victim, owner } = await loadFixture(deployFixture);

    let expectedTotal = 0n;

    // Cycle 1: Deposits
    await stakingVault.connect(attacker).deposit(ethers.parseUnits("1000", 6), attacker.address);
    expectedTotal += ethers.parseUnits("1000", 6);
    expect(await stakingVault.totalAssets()).to.equal(expectedTotal);

    // Cycle 2: More deposits
    await stakingVault.connect(victim).deposit(ethers.parseUnits("2000", 6), victim.address);
    expectedTotal += ethers.parseUnits("2000", 6);
    expect(await stakingVault.totalAssets()).to.equal(expectedTotal);

    // Cycle 3: Donation (should be ignored)
    await yieldVault.connect(owner).transfer(await stakingVault.getAddress(), ethers.parseUnits("5000", 6));
    expect(await stakingVault.totalAssets()).to.equal(expectedTotal); // Unchanged!

    // Cycle 4: Partial withdrawal
    const attackerShares = await stakingVault.balanceOf(attacker.address);
    await stakingVault.connect(attacker).redeem(attackerShares / 2n, attacker.address, attacker.address);
    expectedTotal -= ethers.parseUnits("500", 6);
    expect(await stakingVault.totalAssets()).to.equal(expectedTotal);

    // Cycle 5: Another deposit
    await stakingVault.connect(owner).deposit(ethers.parseUnits("3000", 6), owner.address);
    expectedTotal += ethers.parseUnits("3000", 6);
    expect(await stakingVault.totalAssets()).to.equal(expectedTotal);

    // Cycle 6: Full withdrawal
    const victimShares = await stakingVault.balanceOf(victim.address);
    await stakingVault.connect(victim).redeem(victimShares, victim.address, victim.address);
    expectedTotal -= ethers.parseUnits("2000", 6);
    expect(await stakingVault.totalAssets()).to.equal(expectedTotal);

    console.log("\nFinal total assets:", ethers.formatUnits(await stakingVault.totalAssets(), 6));
    console.log("Expected total:", ethers.formatUnits(expectedTotal, 6));
    console.log("✅ All cycles maintained perfect accounting!");

    // Verify actual balance vs tracked assets discrepancy
    const actualBalance = await yieldVault.balanceOf(await stakingVault.getAddress());
    const trackedAssets = await stakingVault.totalAssets();
    const discrepancy = actualBalance - trackedAssets;
    
    console.log("Actual balance:", ethers.formatUnits(actualBalance, 6));
    console.log("Tracked assets:", ethers.formatUnits(trackedAssets, 6));
    console.log("Discrepancy (donations):", ethers.formatUnits(discrepancy, 6));
    
    expect(discrepancy).to.equal(ethers.parseUnits("5000", 6)); // The ignored donation
  });

  describe("Zero Amount Validation", function () {
    it("Should revert on zero amount deposit", async function () {
      const { stakingVault, attacker } = await loadFixture(deployFixture);

      await expect(
        stakingVault.connect(attacker).deposit(0, attacker.address)
      ).to.be.revertedWithCustomError(stakingVault, "ZeroAmount");
    });

    it("Should revert on zero amount withdraw", async function () {
      const { stakingVault, attacker } = await loadFixture(deployFixture);

      // First deposit some amount
      await stakingVault.connect(attacker).deposit(ethers.parseUnits("100", 6), attacker.address);

      // Try to withdraw zero
      await expect(
        stakingVault.connect(attacker).withdraw(0, attacker.address, attacker.address)
      ).to.be.revertedWithCustomError(stakingVault, "ZeroAmount");
    });

    it("Should revert on zero shares redeem", async function () {
      const { stakingVault, attacker } = await loadFixture(deployFixture);

      // First deposit some amount
      await stakingVault.connect(attacker).deposit(ethers.parseUnits("100", 6), attacker.address);

      // Try to redeem zero shares
      await expect(
        stakingVault.connect(attacker).redeem(0, attacker.address, attacker.address)
      ).to.be.revertedWithCustomError(stakingVault, "ZeroAmount");
    });
  });
});
