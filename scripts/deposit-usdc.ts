import { ethers } from "hardhat";

/**
 * Deposit USDC into YieldVault and receive wYLDS
 * 
 * Usage: 
 *   npx hardhat run scripts/deposit-usdc.ts --network hoodi
 * 
 * Required env vars:
 *   MOCK_USDC_ADDRESS - The MockUSDC contract address
 *   YIELD_VAULT_ADDRESS - The YieldVault contract address
 * 
 * Optional env vars:
 *   DEPOSIT_AMOUNT - Amount to deposit in USDC (defaults to 1000)
 */
async function main() {
  const [depositor] = await ethers.getSigners();
  
  const usdcAddress = process.env.MOCK_USDC_ADDRESS;
  const yieldVaultAddress = process.env.YIELD_VAULT_ADDRESS;
  
  if (!usdcAddress) {
    throw new Error("MOCK_USDC_ADDRESS not set in .env");
  }
  if (!yieldVaultAddress) {
    throw new Error("YIELD_VAULT_ADDRESS not set in .env");
  }
  
  const depositAmount = process.env.DEPOSIT_AMOUNT || "1000"; // Default 1000 USDC
  
  console.log("Depositing USDC into YieldVault...");
  console.log("Depositor:", depositor.address);
  console.log("USDC:", usdcAddress);
  console.log("YieldVault:", yieldVaultAddress);
  console.log("Amount:", depositAmount, "USDC");
  
  const usdc = await ethers.getContractAt("MockUSDC", usdcAddress);
  const yieldVault = await ethers.getContractAt("YieldVault", yieldVaultAddress);
  
  const amount = ethers.parseUnits(depositAmount, 6);
  
  // Check USDC balance
  const usdcBalance = await usdc.balanceOf(depositor.address);
  console.log("\nUSDC balance:", ethers.formatUnits(usdcBalance, 6));
  
  if (usdcBalance < amount) {
    throw new Error(`Insufficient USDC balance. Have ${ethers.formatUnits(usdcBalance, 6)}, need ${depositAmount}`);
  }
  
  // Check current allowance
  const allowance = await usdc.allowance(depositor.address, yieldVaultAddress);
  console.log("Current allowance:", ethers.formatUnits(allowance, 6));
  
  // Approve if needed
  if (allowance < amount) {
    console.log("\nApproving YieldVault to spend USDC...");
    const approveTx = await usdc.approve(yieldVaultAddress, ethers.MaxUint256);
    await approveTx.wait();
    console.log("Approved!");
  }
  
  // Get wYLDS balance before
  const wyldsBalanceBefore = await yieldVault.balanceOf(depositor.address);
  console.log("\nwYLDS balance before:", ethers.formatUnits(wyldsBalanceBefore, 6));
  
  // Deposit
  console.log("\nDepositing", depositAmount, "USDC...");
  const depositTx = await yieldVault.deposit(amount, depositor.address);
  console.log("Transaction hash:", depositTx.hash);
  await depositTx.wait();
  
  // Get balances after
  const usdcBalanceAfter = await usdc.balanceOf(depositor.address);
  const wyldsBalanceAfter = await yieldVault.balanceOf(depositor.address);
  
  console.log("\n✅ Deposit successful!");
  console.log("USDC balance after:", ethers.formatUnits(usdcBalanceAfter, 6));
  console.log("wYLDS balance after:", ethers.formatUnits(wyldsBalanceAfter, 6));
  console.log("wYLDS received:", ethers.formatUnits(wyldsBalanceAfter - wyldsBalanceBefore, 6));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
