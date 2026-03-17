// @ts-ignore
import { ethers, upgrades, network } from "hardhat";
import {
  printSafeContext,
  resolveContractName,
  resolveProxyAddress,
  resolveSafeAddress,
} from "./safe-helpers";

/**
 * Prepares a Safe upgrade for a chainlink-hub UUPS proxy by:
 *   1. Deploying the new implementation
 *   2. Printing the exact calldata for the Safe transaction
 *
 * Usage:
 *   [PROXY=<proxy_address>] [CONTRACT=FeedVerifier] [INIT_CALLDATA=<hex>] [SAFE_ADDRESS=<safe>] \
 *     npx hardhat run scripts/admin/prepare-safe-upgrade.ts --network sepolia
 */
async function main() {
  const contractName = resolveContractName();
  const proxyAddress = resolveProxyAddress(contractName);
  const initCalldata = process.env.INIT_CALLDATA || "0x";
  const safeAddress = resolveSafeAddress();

  const [deployer] = await ethers.getSigners();
  console.log(`Network:       ${network.name}`);
  console.log(`Deployer:      ${deployer.address}`);
  console.log(`Proxy:         ${proxyAddress}`);
  console.log(`New contract:  ${contractName}`);
  printSafeContext(safeAddress);

  const currentImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log(`\nCurrent implementation: ${currentImpl}`);

  console.log(`\nDeploying new implementation (${contractName})...`);
  const factory = await ethers.getContractFactory(contractName);

  try {
    await upgrades.forceImport(proxyAddress, factory, { kind: "uups" });
  } catch (e: any) {
    if (!e.message?.includes("already registered") && !e.message?.includes("Found existing")) {
      throw e;
    }
  }

  const newImplAddress = await upgrades.prepareUpgrade(proxyAddress, factory, {
    redeployImplementation: "always",
  }) as string;
  console.log(`New implementation: ${newImplAddress}`);

  const iface = new ethers.Interface([
    "function upgradeToAndCall(address newImplementation, bytes data)",
  ]);
  const calldata = iface.encodeFunctionData("upgradeToAndCall", [newImplAddress, initCalldata]);

  console.log(`\n${"=".repeat(64)}`);
  console.log("SAFE TRANSACTION DETAILS");
  console.log(`${"=".repeat(64)}`);
  console.log(`To (proxy):       ${proxyAddress}`);
  console.log(`Value:            0`);
  console.log(`Method:           upgradeToAndCall`);
  console.log(`newImplementation:${newImplAddress}`);
  console.log(`data:             ${initCalldata}`);
  console.log("\nRaw calldata:");
  console.log(calldata);
  console.log(`${"=".repeat(64)}`);
  console.log("\nAfter execution, verify with:");
  console.log(`  EXPECTED_IMPL=${newImplAddress} \\`);
  console.log(`  ${process.env.PROXY ? `PROXY=${proxyAddress} \\` : ""}`);
  console.log(`  ${process.env.CONTRACT ? `CONTRACT=${contractName} \\` : ""}`);
  console.log(`  npx hardhat run scripts/admin/verify-safe-upgrade.ts --network ${network.name}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
