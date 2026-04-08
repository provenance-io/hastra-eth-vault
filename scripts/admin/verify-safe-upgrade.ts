// @ts-ignore
import { ethers, upgrades, network } from "hardhat";

/**
 * Verifies a Safe upgrade completed successfully.
 * Checks: new implementation is active, state is preserved.
 *
 * Usage:
 *   PROXY=<proxy_address> EXPECTED_IMPL=<new_impl_address> \
 *     npx hardhat run scripts/admin/verify-safe-upgrade.ts --network <network>
 */
async function main() {
  const proxyAddress = process.env.PROXY;
  const expectedImpl = process.env.EXPECTED_IMPL;
  if (!proxyAddress) throw new Error("PROXY env var required");
  if (!expectedImpl) throw new Error("EXPECTED_IMPL env var required (address printed by prepare-safe-upgrade.ts)");

  console.log(`Network: ${network.name}`);
  console.log(`Proxy:   ${proxyAddress}`);

  const actualImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  const implMatch = actualImpl.toLowerCase() === expectedImpl.toLowerCase();

  console.log(`\n📋 Implementation check`);
  console.log(`  Expected: ${expectedImpl}`);
  console.log(`  Actual:   ${actualImpl}`);
  console.log(`  Match:    ${implMatch ? "✅" : "❌ MISMATCH — upgrade may not have executed"}`);

  // Try reading version() if the new contract has it
  try {
    const contract = await ethers.getContractAt(
      [{ name: "version", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "pure" }],
      proxyAddress
    );
    const version = await contract.version();
    console.log(`  version(): ${version.toString()} ✅`);
  } catch {
    console.log(`  version(): not available on this contract`);
  }

  // Try reading paused() to confirm proxy is still responsive
  try {
    const contract = await ethers.getContractAt(
      [{ name: "paused", type: "function", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" }],
      proxyAddress
    );
    const paused = await contract.paused();
    console.log(`  paused():  ${paused} ✅ (proxy is responsive)`);
  } catch {
    console.log(`  paused(): could not read — proxy may not be an upgradeable vault`);
  }

  // Check maxRewardPercent on StakingVault — must be non-zero after upgrade
  try {
    const contract = await ethers.getContractAt(
      [{ name: "maxRewardPercent", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" }],
      proxyAddress
    );
    const pct = await contract.maxRewardPercent();
    const human = (Number(pct) / 1e18 * 100).toFixed(2);
    if (pct === 0n) {
      console.log(`  maxRewardPercent(): 0 ❌ WARNING — distributeRewards will revert! Run set-max-reward-percent.`);
    } else {
      console.log(`  maxRewardPercent(): ${human}% ✅`);
    }
  } catch {
    // Not a StakingVault — skip silently
  }

  if (!implMatch) {
    console.log(`\n❌ Upgrade not confirmed. Has the Safe transaction been executed?`);
    console.log(`   Check: ${process.env.SAFE_ADDRESS ? `https://app.safe.global/sep:${process.env.SAFE_ADDRESS}` : "(set SAFE_ADDRESS env var for link)"}`);
    process.exitCode = 1;
  } else {
    console.log(`\n✅ Upgrade confirmed. Safe has successfully upgraded the proxy.`);
    console.log(`   You can now safely revoke the deployer's UPGRADER_ROLE.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
