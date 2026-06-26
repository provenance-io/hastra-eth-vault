/**
 * [ADMIN] Upgrade HastraNavEngine proxy → HastraNavEngineV2.
 *
 * What this does:
 *   1. Deploys HastraNavEngineV2 implementation.
 *   2. Calls upgradeToAndCall(newImpl, initializeV2Data) on the proxy.
 *      initializeV2 sets: pauser, maxRateDeltaPercent, minUpdateInterval.
 *   3. Calls setMaxRate(2e18) to tighten the ceiling (REQUIREMENTS §4.5).
 *   4. Prints V2 storage state for verification.
 *   5. Verifies the new implementation on Etherscan.
 *
 * Usage (Sepolia):
 *   PRIVATE_KEY=0x... \
 *     npx hardhat run scripts/admin/upgradeNavEngineToV2.ts --network sepolia
 *
 * Usage (mainnet — via Safe + timelock):
 *   DRY_RUN=true PROXY_ADDRESS=<mainnet-proxy> \
 *     npx hardhat run scripts/admin/upgradeNavEngineToV2.ts --network mainnet
 *   (outputs upgradeToAndCall calldata to queue through TimelockController)
 *
 * Env vars:
 *   PROXY_ADDRESS           Override the proxy address (default: Sepolia PRIME proxy).
 *   PAUSER_ADDRESS          Address that can pause/unpause (default: deployer).
 *   MAX_RATE_DELTA_PERCENT  Max rate change per update, 18-dec fraction (default: 1e17 = 10%).
 *   MIN_UPDATE_INTERVAL     Min seconds between updates (default: 60 for Sepolia, 300 for mainnet).
 *   NEW_MAX_RATE            Absolute rate ceiling post-upgrade (default: 2e18).
 *   DRY_RUN                 Print calldata only — no transactions sent.
 */
// @ts-ignore
import { ethers, network, run, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ── Defaults ──────────────────────────────────────────────────────────────────
const SEPOLIA_PRIME_PROXY  = "0xBc494b33Cd67e8033644608876b10BB84d0eDF55";
const DEFAULT_MAX_RATE_DELTA = ethers.parseEther("0.1");   // 10%
const DEFAULT_MAX_RATE       = ethers.parseEther("2");     // 2.0
const SEPOLIA_DEFAULT_INTERVAL = 60n;    // 1 min — fast cadence for Sepolia testing
const MAINNET_DEFAULT_INTERVAL = 300n;   // 5 min — matches Pulse publish cadence

async function main() {
  const [deployer] = await ethers.getSigners();
  const isDryRun = process.env.DRY_RUN === "true";
  const net = await ethers.provider.getNetwork();

  const proxyAddress = process.env.PROXY_ADDRESS
    ?? (net.name === "sepolia" ? SEPOLIA_PRIME_PROXY : (() => { throw new Error("PROXY_ADDRESS required on mainnet"); })());

  const pauserAddress = process.env.PAUSER_ADDRESS ?? deployer.address;
  const maxRateDeltaPercent = BigInt(process.env.MAX_RATE_DELTA_PERCENT ?? DEFAULT_MAX_RATE_DELTA.toString());
  const minUpdateInterval   = BigInt(process.env.MIN_UPDATE_INTERVAL
    ?? (net.name === "sepolia" ? SEPOLIA_DEFAULT_INTERVAL : MAINNET_DEFAULT_INTERVAL).toString());
  const newMaxRate = BigInt(process.env.NEW_MAX_RATE ?? DEFAULT_MAX_RATE.toString());

  console.log("═".repeat(64));
  console.log(`  HASTRA NAV ENGINE → V2 UPGRADE${isDryRun ? " (DRY RUN)" : ""}`);
  console.log("═".repeat(64));
  console.log(`  Network:              ${net.name} (chainId: ${net.chainId})`);
  console.log(`  Deployer:             ${deployer.address}`);
  console.log(`  Proxy:                ${proxyAddress}`);
  console.log(`  Pauser:               ${pauserAddress}`);
  console.log(`  maxRateDeltaPercent:  ${maxRateDeltaPercent} (${Number(maxRateDeltaPercent) / 1e16}%)`);
  console.log(`  minUpdateInterval:    ${minUpdateInterval}s`);
  console.log(`  newMaxRate:           ${newMaxRate} (${ethers.formatEther(newMaxRate)})`);
  console.log("═".repeat(64));

  // ── Pre-upgrade state ─────────────────────────────────────────────────────
  const proxy = await ethers.getContractAt("HastraNavEngine", proxyAddress);
  const owner = await proxy.owner();
  console.log(`\n  Pre-upgrade state:`);
  console.log(`    owner:      ${owner}`);
  console.log(`    updater:    ${await proxy.getUpdater()}`);
  console.log(`    rate:       ${ethers.formatEther(await proxy.getRate())}`);
  console.log(`    maxRate:    ${ethers.formatEther(await proxy.getMaxRate())}`);
  console.log(`    minRate:    ${ethers.formatEther(await proxy.getMinRate())}`);

  // ── 1. Deploy HastraNavEngineV2 implementation (no ownership required) ──────
  let newImplAddress: string;

  if (isDryRun) {
    newImplAddress = ethers.ZeroAddress; // placeholder — not used in dry run output
    console.log(`\n  [dry] Would deploy HastraNavEngineV2 implementation`);
  } else {
    console.log(`\n  Deploying HastraNavEngineV2 implementation...`);
    const Factory = await ethers.getContractFactory("HastraNavEngineV2");
    const impl = await Factory.deploy();
    await impl.waitForDeployment();
    newImplAddress = await impl.getAddress();
    console.log(`  ✅ Implementation deployed: ${newImplAddress}`);
  }

  // ── 2. Encode initializeV2 calldata ──────────────────────────────────────
  const v2Iface = new ethers.Interface([
    "function initializeV2(address pauser_, uint256 maxRateDeltaPercent_, uint256 minUpdateInterval_)",
  ]);
  const initializeV2Data = v2Iface.encodeFunctionData("initializeV2", [
    pauserAddress,
    maxRateDeltaPercent,
    minUpdateInterval,
  ]);

  // ── 3a. If deployer is owner — execute directly ───────────────────────────
  const deployerIsOwner = owner.toLowerCase() === deployer.address.toLowerCase();

  if (!isDryRun && deployerIsOwner) {
    console.log(`\n  Calling upgradeToAndCall...`);
    const proxyAsOwnable = await ethers.getContractAt("HastraNavEngine", proxyAddress, deployer);
    const upgradeTx = await proxyAsOwnable.upgradeToAndCall(newImplAddress, initializeV2Data);
    await upgradeTx.wait();
    console.log(`  ✅ Upgraded — tx: ${upgradeTx.hash}`);

    const v2 = await ethers.getContractAt("HastraNavEngineV2", proxyAddress, deployer);
    const setMaxRateTx = await v2.setMaxRate(newMaxRate);
    await setMaxRateTx.wait();
    console.log(`  ✅ setMaxRate(${ethers.formatEther(newMaxRate)}) — tx: ${setMaxRateTx.hash}`);
  } else {
    // ── 3b. Generate Safe calldata ──────────────────────────────────────────
    const upgradeIface = new ethers.Interface([
      "function upgradeToAndCall(address newImplementation, bytes calldata data)",
    ]);
    const maxRateIface = new ethers.Interface(["function setMaxRate(int192)"]);

    const upgradeCalldata = isDryRun
      ? "(deploy impl first, then re-run to get real calldata)"
      : upgradeIface.encodeFunctionData("upgradeToAndCall", [newImplAddress, initializeV2Data]);

    const setMaxRateCalldata = isDryRun
      ? "(deploy impl first, then re-run to get real calldata)"
      : maxRateIface.encodeFunctionData("setMaxRate", [newMaxRate]);

    console.log(`\n  Owner is Safe — queue these two txs through the Safe UI:`);
    console.log(`\n  ── TX 1: upgradeToAndCall ──────────────────────────────────`);
    console.log(`     To:       ${proxyAddress}`);
    console.log(`     Value:    0`);
    console.log(`     Calldata: ${upgradeCalldata}`);
    console.log(`\n  ── TX 2: setMaxRate(${ethers.formatEther(newMaxRate)}) ─────────────────────`);
    console.log(`     To:       ${proxyAddress}`);
    console.log(`     Value:    0`);
    console.log(`     Calldata: ${setMaxRateCalldata}`);

    if (!isDryRun) {
      console.log(`\n  ℹ️  Implementation ${newImplAddress} is deployed.`);
      console.log(`     Execute TX 1 + TX 2 via Safe, then run verify:`);
      console.log(`     cast call ${proxyAddress} "getPauser()(address)" --rpc-url $RPC`);
      console.log(`     cast call ${proxyAddress} "getMaxRateDeltaPercent()(uint256)" --rpc-url $RPC`);
      console.log(`     cast call ${proxyAddress} "getMinUpdateInterval()(uint256)" --rpc-url $RPC`);
      console.log(`     cast call ${proxyAddress} "getMaxRate()(int192)" --rpc-url $RPC`);
    }
  }

  // ── 5. Post-upgrade verification (only when deployer executed upgrade) ───────
  if (!isDryRun && deployerIsOwner) {
    const v2 = await ethers.getContractAt("HastraNavEngineV2", proxyAddress, deployer);
    console.log(`\n  Post-upgrade state:`);
    console.log(`    rate:                ${ethers.formatEther(await v2.getRate())}`);
    console.log(`    maxRate:             ${ethers.formatEther(await v2.getMaxRate())}`);
    console.log(`    minRate:             ${ethers.formatEther(await v2.getMinRate())}`);
    console.log(`    pauser:              ${await v2.getPauser()}`);
    console.log(`    maxRateDeltaPercent: ${await v2.getMaxRateDeltaPercent()} (${Number(await v2.getMaxRateDeltaPercent()) / 1e16}%)`);
    console.log(`    minUpdateInterval:   ${await v2.getMinUpdateInterval()}s`);
    console.log(`    updater:             ${await v2.getUpdater()}`);
    console.log(`    owner:               ${await v2.owner()}`);
  }

  // ── 6. Etherscan verification (impl deployed in both paths) ──────────────
  if (!isDryRun) {
    console.log(`\n  Waiting 30s for Etherscan to index...`);
    await new Promise((r) => setTimeout(r, 30_000));
    try {
      await run("verify:verify", {
        address: newImplAddress,
        contract: "contracts/chainlink/HastraNavEngineV2.sol:HastraNavEngineV2",
        constructorArguments: [],
      });
      console.log(`  ✅ Implementation verified on Etherscan`);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.toLowerCase().includes("already verified")) {
        console.log(`  ✅ Already verified`);
      } else {
        console.log(`  ⚠️  Verify failed (retry manually):`);
        console.log(`     npx hardhat verify --network ${net.name} \\`);
        console.log(`       --contract contracts/chainlink/HastraNavEngineV2.sol:HastraNavEngineV2 \\`);
        console.log(`       ${newImplAddress}`);
      }
    }

    // ── 7. Save deployment record ───────────────────────────────────────────
    const record: Record<string, any> = {
      network: net.name,
      chainId: net.chainId.toString(),
      implDeployedAt: new Date().toISOString(),
      status: deployerIsOwner ? "upgraded" : "impl_deployed_pending_safe_execution",
      proxy: proxyAddress,
      implementation: newImplAddress,
      v2Config: {
        pauser: pauserAddress,
        maxRateDeltaPercent: maxRateDeltaPercent.toString(),
        minUpdateInterval: minUpdateInterval.toString(),
        maxRate: newMaxRate.toString(),
      },
    };
    const outFile = path.join(__dirname, `../../deployment_nav_v2_${net.name}.json`);
    fs.writeFileSync(outFile, JSON.stringify(record, null, 2) + "\n");
    console.log(`\n  📝 Record saved: ${path.basename(outFile)}`);
  }

  console.log("\n  ✅ Done.");
  console.log("═".repeat(64));
}

main().catch((e) => { console.error(e); process.exit(1); });
