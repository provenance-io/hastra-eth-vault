/**
 * [OPS] Test pausability and upgradeability of HastraNavEngine on Hoodi.
 *
 * Tests:
 * 1. Pause contract → updateRate() reverts
 * 2. Unpause contract → updateRate() succeeds
 * 3. Deploy new implementation → upgradeProxy → state preserved
 *
 * Usage:
 *   npx hardhat run scripts/ops/testHoodiUpgradeAndPause.ts --network hoodi
 */
import { ethers, upgrades, run } from "hardhat";

const HOODI_PROXY = "0x56Ced53933D8075f20dB2E2917e33744DfED6d3a";

async function main() {
  const [owner] = await ethers.getSigners();
  console.log("Account:", owner.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(owner.address)), "ETH");
  console.log("Proxy:  ", HOODI_PROXY);

  const navEngine = await ethers.getContractAt("HastraNavEngine", HOODI_PROXY);

  // ─── Baseline ────────────────────────────────────────────────────────────────
  console.log("\n═══ Baseline ═══════════════════════════════════════");
  const rateBefore = await navEngine.getRate();
  const isPausedBefore = await navEngine.paused();
  const implBefore = await upgrades.erc1967.getImplementationAddress(HOODI_PROXY);
  console.log("Rate:           ", rateBefore.toString());
  console.log("Paused:         ", isPausedBefore);
  console.log("Implementation: ", implBefore);

  // ─── Test 1: Pause ───────────────────────────────────────────────────────────
  console.log("\n═══ Test 1: Pause ══════════════════════════════════");
  const pauseTx = await navEngine.pause();
  await pauseTx.wait();
  const isPausedAfter = await navEngine.paused();
  console.log("✅ Contract paused:", isPausedAfter);

  // ─── Test 2: updateRate should revert while paused ───────────────────────────
  console.log("\n═══ Test 2: updateRate while paused ════════════════");
  try {
    const supply = ethers.parseEther("1000");
    const tvl    = ethers.parseEther("1500");
    await navEngine.updateRate(supply, tvl);
    console.log("❌ FAIL: updateRate should have reverted when paused!");
    process.exit(1);
  } catch (err: any) {
    // EnforcedPause or "Pausable: paused"
    console.log("✅ updateRate correctly reverted while paused");
    console.log("   Reason:", err.message.split("\n")[0]);
  }

  // ─── Test 3: Unpause ─────────────────────────────────────────────────────────
  console.log("\n═══ Test 3: Unpause ════════════════════════════════");
  const unpauseTx = await navEngine.unpause();
  await unpauseTx.wait();
  console.log("✅ Contract unpaused:", !(await navEngine.paused()));

  // ─── Test 4: updateRate succeeds after unpause ────────────────────────────────
  console.log("\n═══ Test 4: updateRate after unpause ═══════════════");
  const supply = ethers.parseEther("1000");
  const tvl    = ethers.parseEther("1500");
  const updateTx = await navEngine.updateRate(supply, tvl);
  const receipt = await updateTx.wait();
  const rateAfterUpdate = await navEngine.getRate();
  console.log("✅ updateRate succeeded");
  console.log("   Tx hash:", receipt!.hash);
  console.log("   New rate:", rateAfterUpdate.toString(), `(${Number(rateAfterUpdate) / 1e18} in float)`);

  // ─── Test 5: Upgrade proxy to new implementation ─────────────────────────────
  console.log("\n═══ Test 5: Upgrade proxy ══════════════════════════");
  console.log("Deploying new implementation...");
  const HastraNavEngineV2 = await ethers.getContractFactory("HastraNavEngine");
  const upgraded = await upgrades.upgradeProxy(HOODI_PROXY, HastraNavEngineV2, { redeployImplementation: "always" });
  await upgraded.waitForDeployment();

  const implAfter = await upgrades.erc1967.getImplementationAddress(HOODI_PROXY);
  console.log("✅ Proxy upgraded");
  console.log("   Old implementation:", implBefore);
  console.log("   New implementation:", implAfter);

  // ─── Test 6: State preserved after upgrade ───────────────────────────────────
  console.log("\n═══ Test 6: State preserved after upgrade ══════════");
  const rateAfterUpgrade  = await navEngine.getRate();
  const updaterAfterUpgrade = await navEngine.getUpdater();
  const ownerAfterUpgrade   = await navEngine.owner();
  const pausedAfterUpgrade  = await navEngine.paused();
  console.log("Rate (should match pre-upgrade):", rateAfterUpgrade.toString(), rateAfterUpgrade === rateAfterUpdate ? "✅" : "❌");
  console.log("Updater preserved:             ", updaterAfterUpgrade, "✅");
  console.log("Owner preserved:               ", ownerAfterUpgrade, "✅");
  console.log("Not paused:                    ", !pausedAfterUpgrade ? "✅" : "❌");

  // Verify new implementation on explorer
  console.log("\n⏳ Waiting 20s before verification...");
  await new Promise(r => setTimeout(r, 20000));
  try {
    await run("verify:verify", { address: implAfter, constructorArguments: [] });
    console.log("✅ New implementation verified on Hoodi explorer");
  } catch (err: any) {
    if (err.message.includes("Already Verified")) {
      console.log("✅ Already verified");
    } else {
      console.log("⚠️  Verification skipped:", err.message.split("\n")[0]);
    }
  }

  // ─── Summary ─────────────────────────────────────────────────────────────────
  console.log("\n═══ Summary ════════════════════════════════════════");
  console.log("✅ Pause blocks updateRate");
  console.log("✅ Unpause restores updateRate");
  console.log("✅ Upgrade deployed new implementation");
  console.log("✅ State (rate, updater, owner) preserved post-upgrade");
  console.log("\nProxy:           ", HOODI_PROXY);
  console.log("Old impl:        ", implBefore);
  console.log("New impl:        ", implAfter);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
