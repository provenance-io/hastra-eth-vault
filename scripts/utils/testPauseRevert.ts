/**
 * Manually test updateRate() reverts when contract is paused on Hoodi.
 * Usage: npx hardhat run scripts/testPauseRevert.ts --network hoodi
 */
// @ts-ignore
import { ethers } from "hardhat";

const HOODI_PROXY = "0x56Ced53933D8075f20dB2E2917e33744DfED6d3a";

async function main() {
  const [owner] = await ethers.getSigners();
  const navEngine = await ethers.getContractAt("HastraNavEngine", HOODI_PROXY);

  console.log("Contract:", HOODI_PROXY);
  console.log("Account: ", owner.address);

  // ── Step 1: Show current state ──────────────────────────────────────────────
  const rateBefore = await navEngine.getRate();
  const isPaused = await navEngine.paused();
  console.log("\nCurrent rate:  ", rateBefore.toString());
  console.log("Currently paused:", isPaused);

  // ── Step 2: Pause if not already paused ────────────────────────────────────
  if (!isPaused) {
    console.log("\n⏸️  Pausing contract...");
    const tx = await navEngine.pause();
    await tx.wait();
    console.log("✅ Paused. Tx:", tx.hash);
  } else {
    console.log("\n⏸️  Contract already paused");
  }

  // ── Step 3: Try updateRate — must revert ───────────────────────────────────
  console.log("\n🧪 Attempting updateRate() while paused...");
  const supply = ethers.parseEther("1000");
  const tvl    = ethers.parseEther("1600");
  try {
    const tx = await navEngine.updateRate(supply, tvl);
    await tx.wait();
    console.log("❌ FAIL: transaction should have reverted!");
    process.exit(1);
  } catch (err: any) {
    const reason = err.message.includes("EnforcedPause")
      ? "EnforcedPause() — contract is paused"
      : err.shortMessage ?? err.message.split("\n")[0];
    console.log("✅ Reverted as expected");
    console.log("   Reason:", reason);
  }

  // ── Step 4: Confirm rate unchanged ────────────────────────────────────────
  const rateAfter = await navEngine.getRate();
  console.log("\nRate before attempt:", rateBefore.toString());
  console.log("Rate after attempt: ", rateAfter.toString());
  console.log(rateBefore === rateAfter ? "✅ Rate unchanged" : "❌ Rate changed — unexpected!");

  // ── Step 5: Unpause and verify updateRate works again ─────────────────────
  console.log("\n▶️  Unpausing contract...");
  const unpauseTx = await navEngine.unpause();
  await unpauseTx.wait();
  console.log("✅ Unpaused. Tx:", unpauseTx.hash);

  const updateTx = await navEngine.updateRate(supply, tvl);
  await updateTx.wait();
  const rateFinal = await navEngine.getRate();
  console.log("✅ updateRate succeeded after unpause");
  console.log("   New rate:", rateFinal.toString(), `(${Number(rateFinal) / 1e18})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
