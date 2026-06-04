import { ethers } from "hardhat";

/**
 * Stake wYLDS into AutoStakingVault to receive AUTO tokens.
 *
 * NOTE: AutoStakingVault inherits StakingVault's share-pricing path, which
 * REQUIRES a configured NAV oracle. There is no ERC-4626-ratio fallback —
 * deposit/redeem will revert if `setNavOracle()` has not been called on the
 * vault. Run scripts/admin/auto-admin.ts with COMMAND=set-nav-oracle first.
 *
 * Usage:
 *   npx hardhat run scripts/demo/stake-auto.ts --network sepolia
 *
 * Required env vars:
 *   YIELD_VAULT_ADDRESS        - The YieldVault contract address (wYLDS)
 *   AUTO_STAKING_VAULT_ADDRESS - The AutoStakingVault proxy address
 *
 * Optional env vars:
 *   STAKE_AMOUNT - Amount to stake in wYLDS (default: 500)
 */
async function main() {
  const [staker] = await ethers.getSigners();

  const yieldVaultAddress = process.env.YIELD_VAULT_ADDRESS;
  const autoVaultAddress = process.env.AUTO_STAKING_VAULT_ADDRESS;

  if (!yieldVaultAddress) throw new Error("YIELD_VAULT_ADDRESS not set in .env");
  if (!autoVaultAddress) throw new Error("AUTO_STAKING_VAULT_ADDRESS not set in .env");

  const stakeAmount = process.env.STAKE_AMOUNT ?? "500";

  console.log("Staking wYLDS into AutoStakingVault...");
  console.log("Staker:", staker.address);
  console.log("YieldVault (wYLDS):", yieldVaultAddress);
  console.log("AutoStakingVault:", autoVaultAddress);
  console.log("Amount:", stakeAmount, "wYLDS");

  const yieldVault = await ethers.getContractAt("YieldVault", yieldVaultAddress);
  const autoVault = await ethers.getContractAt("AutoStakingVault", autoVaultAddress);

  const amount = ethers.parseUnits(stakeAmount, 6);

  // Show oracle status
  const navOracle = await autoVault.navOracle();
  if (navOracle === ethers.ZeroAddress) {
    throw new Error(
      "AutoStakingVault has no NAV oracle configured (navOracle == 0). " +
        "deposit() will revert. Wire it first with:\n" +
        `  CONTRACT_ADDRESS=${autoVaultAddress} COMMAND=set-nav-oracle \\\n` +
        "    NAV_ORACLE=<feed-verifier> NAV_FEED_ID=<bytes32> \\\n" +
        "    npx hardhat run scripts/admin/auto-admin.ts --network <network>"
    );
  }
  console.log("\n🔗 NAV oracle:", navOracle);
  try {
    const nav = await autoVault.getVerifiedNav();
    console.log("   Current NAV:", ethers.formatUnits(nav, 18), "wYLDS/share");
  } catch (e: any) {
    throw new Error(
      `NAV oracle configured but getVerifiedNav() reverted: ${e.message}. ` +
        "Likely stale feed or feedId mismatch — fix before staking."
    );
  }

  // Check wYLDS balance
  const wyldsBalance = await yieldVault.balanceOf(staker.address);
  console.log("\nwYLDS balance:", ethers.formatUnits(wyldsBalance, 6));

  if (wyldsBalance < amount) {
    throw new Error(
      `Insufficient wYLDS balance. Have ${ethers.formatUnits(wyldsBalance, 6)}, need ${stakeAmount}`
    );
  }

  // Approve if needed
  const allowance = await yieldVault.allowance(staker.address, autoVaultAddress);
  if (allowance < amount) {
    console.log("\nApproving AutoStakingVault to spend wYLDS...");
    const approveTx = await yieldVault.approve(autoVaultAddress, ethers.MaxUint256);
    await approveTx.wait();
    console.log("Approved!");
  }

  const autoBalanceBefore = await autoVault.balanceOf(staker.address);
  console.log("\nAUTO balance before:", ethers.formatUnits(autoBalanceBefore, 6));

  // Stake
  console.log("\nStaking", stakeAmount, "wYLDS...");
  const depositTx = await autoVault.deposit(amount, staker.address);
  console.log("Transaction hash:", depositTx.hash);
  await depositTx.wait();

  const wyldsAfter = await yieldVault.balanceOf(staker.address);
  const autoAfter = await autoVault.balanceOf(staker.address);

  console.log("\n✅ Staking successful!");
  console.log("wYLDS balance after:", ethers.formatUnits(wyldsAfter, 6));
  console.log("AUTO balance after: ", ethers.formatUnits(autoAfter, 6));
  console.log("AUTO received:      ", ethers.formatUnits(autoAfter - autoBalanceBefore, 6));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
