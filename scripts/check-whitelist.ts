// @ts-ignore
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  // Read deployment addresses from deployment_testnet.json
  const deploymentPath = path.join(__dirname, "../deployment_testnet.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found at ${deploymentPath}`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const yieldVaultAddress = deployment.contracts.yieldVault;

  if (!yieldVaultAddress) {
    throw new Error("YieldVault address not found in deployment_testnet.json");
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
