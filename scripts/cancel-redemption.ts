import { ethers } from "hardhat";

/**
 * Cancel a Pending Redemption Request
 * 
 * Usage: 
 *   npx hardhat run scripts/cancel-redemption.ts --network hoodi
 * 
 * Required env vars:
 *   YIELD_VAULT_ADDRESS - The YieldVault contract address
 */
async function main() {
  const [user] = await ethers.getSigners();
  
  const yieldVaultAddress = process.env.YIELD_VAULT_ADDRESS;
  if (!yieldVaultAddress) {
    throw new Error("Env var YIELD_VAULT_ADDRESS must be set");
  }

  console.log("\n--- Cancelling Redemption Request ---");
  console.log("User:", user.address);
  console.log("YieldVault:", yieldVaultAddress);
  
  const yieldVault = await ethers.getContractAt("YieldVault", yieldVaultAddress);
  
  // Check pending
  const pending = await yieldVault.pendingRedemptions(user.address);
  console.log("Pending Shares:", ethers.formatUnits(pending.shares, 6));
  
  if (pending.shares === 0n) {
      console.log("❌ No pending redemption found to cancel.");
      return;
  }

  console.log("Cancelling...");
  const tx = await yieldVault.cancelRedeem();
  console.log("Tx Hash:", tx.hash);
  await tx.wait();
  
  console.log("✅ Redemption Cancelled!");
  console.log("wYLDS returned to wallet.");
  
  const balance = await yieldVault.balanceOf(user.address);
  console.log("Current wYLDS Balance:", ethers.formatUnits(balance, 6));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
