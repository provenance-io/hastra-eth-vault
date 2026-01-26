import { ethers } from "hardhat";

async function main() {
  const yieldVaultAddress = process.env.YIELD_VAULT_ADDRESS;
  
  if (!yieldVaultAddress) {
    throw new Error("YIELD_VAULT_ADDRESS not set in .env or environment");
  }

  console.log("Checking YieldVault Whitelist State...");
  console.log("Contract Address:", yieldVaultAddress);

  const yieldVault = await ethers.getContractAt("YieldVault", yieldVaultAddress);

  // 1. Get the total count of whitelisted addresses
  const count = await yieldVault.getWhitelistCount();
  console.log("\nTotal Whitelisted Addresses:", count.toString());

  // 2. Get the full list of whitelisted addresses
  const whitelist = await yieldVault.getWhitelistedAddresses();
  console.log("Whitelist List:", whitelist);

  // 3. Specifically check the target address
  const target = "0x803AdF8d4F036134070Bde997f458502Ade2f834";
  const isWhitelisted = await yieldVault.isWhitelisted(target);
  console.log(`\nIs ${target} whitelisted?`, isWhitelisted ? "✅ YES" : "❌ NO");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
