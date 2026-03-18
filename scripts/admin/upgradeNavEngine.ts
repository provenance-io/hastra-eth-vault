/**
 * [ADMIN] Upgrades an existing HastraNavEngine proxy to a new implementation.
 * All storage (updater, rates, TVL, latestRate) is preserved — same legacy slot is used.
 *
 * After upgrade, the script temporarily widens maxDifferencePercent to 100% so the
 * first updateRate call can sync state to the current real TVL, then restores it to 10%.
 *
 * Usage:
 *   PROXY_ADDRESS=0x... npx hardhat run scripts/admin/upgradeNavEngine.ts --network sepolia
 *
 * Defaults to the legacy Sepolia proxy if PROXY_ADDRESS is not set.
 * Set TOTAL_SUPPLY and TOTAL_TVL env vars to provide initial rate values (in wei).
 * Requires: owner of the HastraNavEngine proxy.
 */
import { ethers, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const LEGACY_PROXY_SEPOLIA = "0xBc494b33Cd67e8033644608876b10BB84d0eDF55";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const proxyAddress = process.env.PROXY_ADDRESS ?? LEGACY_PROXY_SEPOLIA;

  console.log(`Network:  ${network.name} (ChainID: ${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log(`Proxy:    ${proxyAddress}`);

  const proxy = await ethers.getContractAt("HastraNavEngine", proxyAddress);
  const owner = await proxy.owner();
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`Deployer ${deployer.address} is not the proxy owner (owner: ${owner})`);
  }

  console.log(`\nPre-upgrade state:`);
  console.log(`  updater:    ${await proxy.getUpdater()}`);
  console.log(`  latestTVL:  ${await proxy.getLatestTVL()}`);
  console.log(`  latestRate: ${await proxy.getRate()}`);

  // Deploy new impl directly — bypass OZ CREATE2 artifact cache
  console.log("\nDeploying new implementation...");
  const Factory = await ethers.getContractFactory("HastraNavEngine");
  const impl = await Factory.deploy();
  await impl.waitForDeployment();
  const newImpl = await impl.getAddress();
  console.log(`New impl: ${newImpl}`);

  // Upgrade — no calldata needed, storage slot is the same
  console.log("\nUpgrading proxy...");
  await (await proxy.upgradeToAndCall(newImpl, "0x")).wait();
  console.log("Upgraded.");

  // Verify state was preserved
  const updaterOnChain = await proxy.getUpdater();
  console.log(`\nPost-upgrade state:`);
  console.log(`  updater:    ${updaterOnChain}`);
  console.log(`  latestTVL:  ${await proxy.getLatestTVL()}`);
  console.log(`  latestRate: ${await proxy.getRate()}`);

  // Sync to current TVL if provided
  const totalSupply = process.env.TOTAL_SUPPLY;
  const totalTVL = process.env.TOTAL_TVL;
  if (totalSupply && totalTVL) {
    console.log(`\nSyncing rate: supply=${totalSupply} tvl=${totalTVL}`);
    // Widen diff check temporarily so the jump from stale stored TVL is accepted
    await (await proxy.setMaxDifferencePercent(ethers.parseEther("1"))).wait();
    await (await proxy.updateRate(totalSupply, totalTVL)).wait();
    await (await proxy.setMaxDifferencePercent(ethers.parseEther("0.1"))).wait();
    console.log(`  new rate: ${await proxy.getRate()}`);
  } else {
    console.log("\nSkipping rate sync (set TOTAL_SUPPLY and TOTAL_TVL env vars to sync).");
  }

  // Etherscan verification
  console.log("\nWaiting 20s for Etherscan indexing...");
  await new Promise((r) => setTimeout(r, 20000));
  try {
    await run("verify:verify", { address: newImpl, constructorArguments: [] });
    console.log("✅ Implementation verified on Etherscan");
  } catch (e: any) {
    if (e.message?.includes("Already Verified")) {
      console.log("✅ Already verified");
    } else {
      console.warn("Verification failed:", e.message);
    }
  }

  const artifact = {
    network: network.name,
    chainId: network.chainId.toString(),
    proxy: proxyAddress,
    implementation: newImpl,
    upgradedAt: new Date().toISOString(),
  };
  const artifactPath = path.join(__dirname, `../../deployment_nav_upgrade_${network.name}.json`);
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  console.log(`Artifact saved: ${artifactPath}`);
  console.log("\n✅ Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
