// @ts-ignore
import { ethers, upgrades, network } from "hardhat";

/**
 * Prepares a Safe upgrade by:
 *   1. Deploying the new implementation (no role required)
 *   2. Printing the exact calldata to paste into the Safe UI
 *
 * Usage:
 *   PROXY=<proxy_address> CONTRACT=<new_contract_name> [INIT_CALLDATA=<hex>] \
 *     npx hardhat run scripts/admin/prepare-safe-upgrade.ts --network <network>
 *
 * Examples:
 *   PROXY=0x0258787Eb97DD01436B562943D8ca85B772D7b98 CONTRACT=YieldVaultV2 \
 *     npx hardhat run scripts/admin/prepare-safe-upgrade.ts --network sepolia
 *
 *   PROXY=0xFf22361Ca2590761A2429D4127b7FF25E79fdC04 CONTRACT=StakingVaultV3 INIT_CALLDATA=$(cast calldata "initializeV3()") \
 *     npx hardhat run scripts/admin/prepare-safe-upgrade.ts --network sepolia
 */
async function main() {
  const proxyAddress = process.env.PROXY;
  const contractName = process.env.CONTRACT;
  if (!proxyAddress) throw new Error("PROXY env var required (proxy address)");
  if (!contractName) throw new Error("CONTRACT env var required (e.g. YieldVaultV2, StakingVaultV3)");

  // initializeV3() calldata if needed, otherwise empty
  const initCalldata = process.env.INIT_CALLDATA || "0x";

  const [deployer] = await ethers.getSigners();
  console.log(`Network:       ${network.name}`);
  console.log(`Deployer:      ${deployer.address}`);
  console.log(`Proxy:         ${proxyAddress}`);
  console.log(`New contract:  ${contractName}`);

  // Current state
  const currentImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log(`\n📋 Current implementation: ${currentImpl}`);

  // Deploy new implementation only (no upgrade yet)
  console.log(`\n🚀 Deploying new implementation (${contractName})...`);
  const Factory = await ethers.getContractFactory(contractName);

  // forceImport registers the existing proxy in the local OZ manifest.
  // We import using the NEW factory (OZ only needs ABI compatibility checks).
  try {
    await upgrades.forceImport(proxyAddress, Factory, { kind: "uups" });
  } catch (e: any) {
    // "already registered" is fine — proxy is in the manifest from a prior run
    if (!e.message?.includes("already registered") && !e.message?.includes("Found existing")) {
      throw e;
    }
  }

  const newImplAddress = await upgrades.prepareUpgrade(proxyAddress, Factory, {
    redeployImplementation: "always",
  }) as string;
  console.log(`✅ New implementation deployed: ${newImplAddress}`);

  // Encode the upgradeToAndCall calldata
  const iface = new ethers.Interface([
    "function upgradeToAndCall(address newImplementation, bytes data)"
  ]);
  const calldata = iface.encodeFunctionData("upgradeToAndCall", [newImplAddress, initCalldata]);

  console.log(`\n${"=".repeat(60)}`);
  console.log("📋 SAFE TRANSACTION DETAILS");
  console.log(`${"=".repeat(60)}`);
  console.log(`Safe:             https://app.safe.global/sep:0x4E79e5BB88f0596446c615B86D3780A11DB1a2f4`);
  console.log(`\nTo (proxy):       ${proxyAddress}`);
  console.log(`Value:            0`);
  console.log(`Method:           upgradeToAndCall`);
  console.log(`newImplementation:${newImplAddress}`);
  console.log(`data:             ${initCalldata}`);
  console.log(`\nRaw calldata (paste into Safe → Contract Interaction → Raw):`);
  console.log(calldata);
  console.log(`${"=".repeat(60)}`);
  console.log(`\n⚠️  After Safe executes, run verify-safe-upgrade.ts to confirm.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
