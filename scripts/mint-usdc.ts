import { ethers } from "hardhat";

/**
 * Mint MockUSDC tokens for testing
 * 
 * Usage: 
 *   npx hardhat run scripts/mint-usdc.ts --network hoodi
 * 
 * Required env vars:
 *   MOCK_USDC_ADDRESS - The MockUSDC contract address
 * 
 * Optional env vars:
 *   MINT_TO_ADDRESS - Address to mint to (defaults to deployer)
 *   MINT_AMOUNT - Amount to mint in USDC (defaults to 1,000,000)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  
  const usdcAddress = process.env.MOCK_USDC_ADDRESS;
  if (!usdcAddress) {
    throw new Error("MOCK_USDC_ADDRESS not set in .env");
  }
  
  const mintTo = process.env.MINT_TO_ADDRESS || deployer.address;
  const mintAmount = process.env.MINT_AMOUNT || "1000000"; // Default 1M USDC
  
  console.log("Minting MockUSDC...");
  console.log("MockUSDC address:", usdcAddress);
  console.log("Mint to:", mintTo);
  console.log("Amount:", mintAmount, "USDC");
  
  const usdc = await ethers.getContractAt("MockUSDC", usdcAddress);
  
  // Check current balance
  const balanceBefore = await usdc.balanceOf(mintTo);
  console.log("\nBalance before:", ethers.formatUnits(balanceBefore, 6), "USDC");
  
  // Mint tokens
  const amount = ethers.parseUnits(mintAmount, 6);
  const tx = await usdc.mint(mintTo, amount);
  console.log("Transaction hash:", tx.hash);
  await tx.wait();
  
  // Check new balance
  const balanceAfter = await usdc.balanceOf(mintTo);
  console.log("\n✅ Mint successful!");
  console.log("Balance after:", ethers.formatUnits(balanceAfter, 6), "USDC");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
