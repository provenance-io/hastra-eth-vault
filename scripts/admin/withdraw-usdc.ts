// @ts-nocheck
import { ethers } from "hardhat";
import * as fs from "fs";
import { getDeploymentFile } from "../utils/getDeploymentFile";

/**
 * Withdraw USDC from YieldVault to a whitelisted address
 * 
 * Usage:
 *   # Dry run (check status only)
 *   TO=0x... AMOUNT=1000 npx hardhat run scripts/admin/withdraw-usdc.ts --network hoodi
 * 
 *   # Actually withdraw
 *   TO=0x... AMOUNT=1000 WITHDRAW=true npx hardhat run scripts/admin/withdraw-usdc.ts --network hoodi
 */

async function main() {
  const dryRun = !process.env.WITHDRAW;
  const toAddress = process.env.TO;
  const amount = process.env.AMOUNT;

  console.log("════════════════════════════════════════════════════════════");
  console.log("           WITHDRAW USDC FROM YIELDVAULT");
  if (dryRun) {
    console.log("              (DRY RUN MODE)");
  }
  console.log("════════════════════════════════════════════════════════════");
  console.log("");

  // Validate inputs
  if (!toAddress) {
    console.error("❌ Error: TO address not specified");
    console.log("\nUsage:");
    console.log("  TO=0x... AMOUNT=1000 npx hardhat run scripts/admin/withdraw-usdc.ts --network hoodi");
    console.log("");
    process.exit(1);
  }

  if (!amount) {
    console.error("❌ Error: AMOUNT not specified");
    console.log("\nUsage:");
    console.log("  TO=0x... AMOUNT=1000 npx hardhat run scripts/admin/withdraw-usdc.ts --network hoodi");
    console.log("");
    process.exit(1);
  }

  const [admin] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log(`Network: ${network.name} (Chain ID: ${network.chainId})`);
  console.log(`Admin: ${admin.address}`);
  console.log("");

  // Load deployment file
  const deploymentFile = getDeploymentFile(network.name);
  
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
  const yieldVaultAddress = deployment.contracts.yieldVault;
  const usdcAddress = deployment.contracts.usdc;

  console.log(`YieldVault: ${yieldVaultAddress}`);
  console.log(`USDC:       ${usdcAddress}`);
  console.log("");

  const yieldVault = await ethers.getContractAt("YieldVault", yieldVaultAddress);
  const usdc = await ethers.getContractAt("MockUSDC", usdcAddress);

  // Parse amount (USDC has 6 decimals)
  const amountWei = ethers.parseUnits(amount, 6);

  console.log("📋 Withdrawal Details:");
  console.log(`   To:     ${toAddress}`);
  console.log(`   Amount: ${amount} USDC (${amountWei.toString()} wei)`);
  console.log("");

  // Check admin has WITHDRAWAL_ADMIN_ROLE
  console.log("🔍 Pre-flight Checks:");
  const WITHDRAWAL_ADMIN_ROLE = await yieldVault.WITHDRAWAL_ADMIN_ROLE();
  const hasRole = await yieldVault.hasRole(WITHDRAWAL_ADMIN_ROLE, admin.address);
  console.log(`   Admin has WITHDRAWAL_ADMIN_ROLE: ${hasRole ? "✅" : "❌"}`);

  if (!hasRole) {
    console.log("\n❌ Error: Admin does not have WITHDRAWAL_ADMIN_ROLE!");
    console.log("\n💡 Grant role first:");
    console.log(`   GRANT_ROLES=true npx hardhat run scripts/admin/grant-all-roles-yieldvault.ts --network ${network.name}`);
    console.log("");
    process.exit(1);
  }

  // Check vault balance
  const vaultBalance = await usdc.balanceOf(yieldVaultAddress);
  console.log(`   Vault USDC balance: ${ethers.formatUnits(vaultBalance, 6)} USDC`);
  
  const hasSufficientBalance = vaultBalance >= amountWei;
  console.log(`   Sufficient balance: ${hasSufficientBalance ? "✅" : "❌"}`);

  console.log("");

  // Check recipient balance before
  const balanceBefore = await usdc.balanceOf(toAddress);
  console.log("📊 Balances:");
  console.log(`   Recipient before: ${ethers.formatUnits(balanceBefore, 6)} USDC`);

  if (dryRun) {
    console.log("");
    console.log("⚠️  DRY RUN MODE - No withdrawal will be executed.");
    console.log("\n💡 To execute withdrawal:");
    console.log(`   TO=${toAddress} AMOUNT=${amount} WITHDRAW=true npx hardhat run scripts/admin/withdraw-usdc.ts --network ${network.name}`);
    console.log("\n⚠️  Note: Whitelist check will happen on-chain. Non-whitelisted addresses will revert.");
    console.log("");
    return;
  }

  // Execute withdrawal
  console.log("");
  console.log("💸 Executing withdrawal...");
  
  try {
    const tx = await yieldVault.withdrawUSDC(toAddress, amountWei);
    console.log(`   Transaction submitted: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`   ✅ Transaction confirmed in block ${receipt.blockNumber}`);
  } catch (error: any) {
    // Try to extract transaction hash if available
    if (error.transaction?.hash) {
      console.log(`   Transaction hash: ${error.transaction.hash}`);
    } else if (error.receipt?.hash) {
      console.log(`   Transaction hash: ${error.receipt.hash}`);
    } else if (error.transactionHash) {
      console.log(`   Transaction hash: ${error.transactionHash}`);
    }
    
    // Extract revert reason if available
    let revertReason = error.message;
    if (error.reason) {
      revertReason = error.reason;
    } else if (error.data) {
      revertReason = `Custom error: ${error.data}`;
    }
    
    console.log(`   ❌ Transaction failed: ${revertReason}`);
    console.log("");
    console.log("Full error details:");
    console.log(error);
    process.exit(1);
  }

  // Check balances after
  const balanceAfter = await usdc.balanceOf(toAddress);
  const vaultBalanceAfter = await usdc.balanceOf(yieldVaultAddress);

  console.log("");
  console.log("📊 Final Balances:");
  console.log(`   Recipient: ${ethers.formatUnits(balanceAfter, 6)} USDC (+${ethers.formatUnits(balanceAfter - balanceBefore, 6)})`);
  console.log(`   Vault:     ${ethers.formatUnits(vaultBalanceAfter, 6)} USDC (-${ethers.formatUnits(vaultBalance - vaultBalanceAfter, 6)})`);

  console.log("");
  console.log("🎉 Withdrawal complete!");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
