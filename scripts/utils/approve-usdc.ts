// @ts-ignore
import { ethers, network } from "hardhat";
import * as fs from "fs";
import { getDeploymentFile } from "./getDeploymentFile";

/**
 * Approve YieldVault to spend your USDC
 * 
 * Usage: 
 *   npx hardhat run scripts/utils/approve-usdc.ts --network hoodi
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  
  // Load from deployment file
  const deploymentFile = getDeploymentFile(network.name);
  
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
  const usdcAddress = deployment.contracts.usdc;
  const yieldVaultAddress = deployment.contracts.yieldVault;
  
  console.log("Approving USDC for YieldVault...");
  console.log("Account:", deployer.address);
  console.log("USDC:", usdcAddress);
  console.log("YieldVault:", yieldVaultAddress);
  
  const minimalABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)"
  ];
  
  const usdc = new ethers.Contract(usdcAddress, minimalABI, deployer);
  
  // Check current balance
  try {
    const balance = await usdc.balanceOf(deployer.address);
    console.log("\nUSDC balance:", ethers.formatUnits(balance, 6), "USDC");
  } catch (e) {
    console.log("\nCould not fetch balance");
  }
  
  // Approve 1 million USDC
  const approvalAmount = ethers.parseUnits("1000000", 6);
  console.log("\nApproving 1 million USDC...");
  
  try {
    console.log("Resetting allowance to 0 first...");
    const resetTx = await usdc.approve(yieldVaultAddress, 0);
    await resetTx.wait();
    console.log("Reset successful");
  } catch (e) {
    console.log("Reset not needed, continuing...");
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
