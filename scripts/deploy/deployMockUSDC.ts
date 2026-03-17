/**
 * [DEPLOY] Deploy a standalone MockUSDC contract for testing.
 *
 * Usage:
 *   npx hardhat run scripts/deploy/deployMockUSDC.ts --network sepolia
 *   npx hardhat run scripts/deploy/deployMockUSDC.ts --network hoodi
 */
// @ts-ignore
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("Deploying MockUSDC");
  console.log("  Network:", network.name);
  console.log("  Account:", deployer.address);

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();

  const address = await usdc.getAddress();
  console.log("\n✅ MockUSDC deployed:", address);
  console.log("\nAdd to .env:");
  console.log(`  USDC_ADDRESS=${address}`);
  console.log("\nThen deploy the full protocol:");
  console.log(`  npx hardhat run scripts/deploy.ts --network ${network.name}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
