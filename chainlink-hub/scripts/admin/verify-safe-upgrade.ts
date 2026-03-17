// @ts-ignore
import { ethers, upgrades, network } from "hardhat";
import {
  printSafeContext,
  resolveContractName,
  resolveProxyAddress,
  resolveSafeAddress,
} from "./safe-helpers";

/**
 * Verifies a Safe upgrade completed successfully for chainlink-hub contracts.
 *
 * Usage:
 *   EXPECTED_IMPL=<new_impl_address> [PROXY=<proxy_address>] [CONTRACT=FeedVerifier] [SAFE_ADDRESS=<safe>] \
 *     npx hardhat run scripts/admin/verify-safe-upgrade.ts --network sepolia
 */
async function main() {
  const contractName = resolveContractName();
  const proxyAddress = resolveProxyAddress(contractName);
  const expectedImpl = process.env.EXPECTED_IMPL;
  const safeAddress = resolveSafeAddress();

  if (!expectedImpl) {
    throw new Error("EXPECTED_IMPL env var required");
  }

  console.log(`Network:   ${network.name}`);
  console.log(`Contract:  ${contractName}`);
  console.log(`Proxy:     ${proxyAddress}`);
  printSafeContext(safeAddress);

  const actualImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  const implMatch = actualImpl.toLowerCase() === expectedImpl.toLowerCase();

  console.log(`\nImplementation check`);
  console.log(`  Expected: ${expectedImpl}`);
  console.log(`  Actual:   ${actualImpl}`);
  console.log(`  Match:    ${implMatch ? "YES" : "NO"}`);

  const contract = await ethers.getContractAt(contractName, proxyAddress);

  try {
    const paused = await contract.paused();
    console.log(`  paused(): ${paused}`);
  } catch {
    console.log("  paused(): unavailable");
  }

  try {
    const verifierProxy = await contract.verifierProxy();
    console.log(`  verifierProxy(): ${verifierProxy}`);
  } catch {
    console.log("  verifierProxy(): unavailable");
  }

  try {
    const lastFeedId = await contract.lastFeedId();
    console.log(`  lastFeedId(): ${lastFeedId}`);
  } catch {
    // FeedVerifier only; skip for other contracts.
  }

  try {
    const feedId = await contract.feedId();
    console.log(`  feedId(): ${feedId}`);
  } catch {
    // FeedVerifier only; skip for other contracts.
  }

  if (!implMatch) {
    console.log("\nUpgrade not confirmed. Has the Safe transaction been executed?");
    process.exitCode = 1;
    return;
  }

  console.log("\nUpgrade confirmed.");
  console.log("Next step: revoke the deployer's UPGRADER_ROLE once admin migration is complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
