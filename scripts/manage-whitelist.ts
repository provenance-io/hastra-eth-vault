// @ts-ignore
import { ethers } from "hardhat";

/**
 * Manage Whitelist
 * 
 * Usage: 
 *   npx hardhat run scripts/manage-whitelist.ts --network hoodi
 * 
 * Required env vars:
 *   YIELD_VAULT_ADDRESS - The YieldVault contract address
 *   TARGET_ADDRESS - The address to add/remove
 *   ACTION - "add" or "remove" (defaults to "add")
 */
async function main() {
  const [admin] = await ethers.getSigners();
  
  const yieldVaultAddress = process.env.YIELD_VAULT_ADDRESS;
  const targetAddress = process.env.TARGET_ADDRESS;
  const action = process.env.ACTION || "add";
  
  if (!yieldVaultAddress) {
    throw new Error("YIELD_VAULT_ADDRESS not set in .env");
  }
  if (!targetAddress) {
    throw new Error("TARGET_ADDRESS not set in .env");
  }
  
  console.log(`\n${action.toUpperCase()}ing address to whitelist...`);
  console.log("YieldVault:", yieldVaultAddress);
  console.log("Target:", targetAddress);
  console.log("Admin:", admin.address);
  
  const yieldVault = await ethers.getContractAt("YieldVault", yieldVaultAddress);
  
  // Check if admin has role
  const WHITELIST_ADMIN_ROLE = await yieldVault.WHITELIST_ADMIN_ROLE();
  const hasRole = await yieldVault.hasRole(WHITELIST_ADMIN_ROLE, admin.address);
  
  if (!hasRole) {
    throw new Error(`Admin ${admin.address} does not have WHITELIST_ADMIN_ROLE`);
  }
  
  let tx;
  if (action === "add") {
    tx = await yieldVault.addToWhitelist(targetAddress);
  } else if (action === "remove") {
    tx = await yieldVault.removeFromWhitelist(targetAddress);
  } else {
    throw new Error(`Invalid action: ${action}`);
  }
  
  console.log("Transaction hash:", tx.hash);
  await tx.wait();
  
  const isWhitelisted = await yieldVault.isWhitelisted(targetAddress);
  console.log(`\n✅ Success! Is whitelisted: ${isWhitelisted}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
