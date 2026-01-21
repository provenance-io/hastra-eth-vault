import { ethers } from "hardhat";

/**
 * Approve YieldVault to spend your USDC
 * 
 * Usage: 
 *   npx hardhat run scripts/approve-usdc.ts --network hoodi
 * 
 * Required env vars:
 *   USDC_ADDRESS - The USDC contract address
 *   YIELD_VAULT_ADDRESS - The YieldVault contract address
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  
  const usdcAddress = process.env.USDC_ADDRESS;
  const yieldVaultAddress = process.env.YIELD_VAULT_ADDRESS;
  
  if (!usdcAddress) {
    throw new Error("USDC_ADDRESS not set in .env");
  }
  if (!yieldVaultAddress) {
    throw new Error("YIELD_VAULT_ADDRESS not set in .env");
  }
  
  console.log("Approving USDC for YieldVault...");
  console.log("Account:", deployer.address);
  console.log("USDC:", usdcAddress);
  console.log("YieldVault:", yieldVaultAddress);
  
  // Use minimal ABI with just approve
  const minimalABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)"
  ];
  
  const usdc = new ethers.Contract(usdcAddress, minimalABI, deployer);
  
  // Check current balance
  try {
    const balance = await usdc.balanceOf(deployer.address);
    console.log("\nUSDC balance (raw):", balance.toString());
  } catch (e) {
    console.log("\nCould not fetch balance");
  }
  
  // Try smaller approval first (some tokens reject MaxUint256)
  const approvalAmount = ethers.parseUnits("1000000000", 6); // 1 billion USDC
  console.log("\nApproving 1 billion USDC...");
  
  try {
    // Some tokens require resetting to 0 first
    console.log("Resetting allowance to 0 first...");
    const resetTx = await usdc.approve(yieldVaultAddress, 0);
    await resetTx.wait();
    console.log("Reset successful");
  } catch (e) {
    console.log("Reset not needed or failed, continuing...");
  }
  
  const tx = await usdc.approve(yieldVaultAddress, approvalAmount);
  console.log("Transaction hash:", tx.hash);
  await tx.wait();
  
  console.log("\n✅ Approval successful!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
