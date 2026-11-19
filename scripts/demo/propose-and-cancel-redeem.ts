/**
 * [DEMO] Propose a redemption then immediately cancel it — reuses the
 * requestRedemption/cancelRedemption logic from scripts/demo/user.ts.
 *
 * Usage:
 *   YIELD_VAULT_ADDRESS=<addr> AMOUNT=10 npx hardhat run scripts/demo/propose-and-cancel-redeem.ts --network sepolia
 *
 * Required env vars:
 *   YIELD_VAULT_ADDRESS - The YieldVault contract address (read by user.ts)
 *   AMOUNT              - wYLDS amount to request-redeem, then cancel (default: "10")
 */
// @ts-ignore
import { ethers } from "hardhat";
import { requestRedemption, cancelRedemption } from "./user";

async function main() {
  const amount = process.env.AMOUNT ?? "10";
  const yieldVaultAddress = process.env.YIELD_VAULT_ADDRESS;
  if (!yieldVaultAddress) {
    throw new Error("Env var YIELD_VAULT_ADDRESS must be set");
  }

  const [user] = await ethers.getSigners();
  console.log("--- Propose then Cancel Redemption ---");
  console.log("User:", user.address);
  console.log("YieldVault:", yieldVaultAddress);
  console.log("Amount:", amount, "wYLDS\n");

  console.log("Step 1: Requesting redemption...");
  await requestRedemption(amount);

  console.log("\nStep 2: Cancelling redemption...");
  await cancelRedemption();

  console.log("\n✅ Propose + cancel cycle complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
