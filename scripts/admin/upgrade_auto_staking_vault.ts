// @ts-ignore
import { ethers, upgrades, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * [ADMIN] Upgrade an AutoStakingVault proxy (AUTO, SMB, …) to the latest
 * implementation. Requires UPGRADER_ROLE on the proxy.
 *
 * Storage layout is preserved: AutoStakingVault inherits StakingVault wholesale,
 * so all existing state (yieldVault, _totalManagedAssets, maxRewardPercent,
 * navOracle, navStalenessLimit, navFeedId, ERC20 balances) carries forward
 * untouched. New reward-cap fields (maxPeriodRewards / rewardPeriodSeconds /
 * lastRewardDistributedAt / maxTotalRewards / totalRewardsDistributed) come out
 * of the legacy storage gap and read as zero ("no caps active") post-upgrade.
 *
 * Usage:
 *   # By explicit proxy address (preferred):
 *   PROXY_ADDRESS=0xa8D8CcC9d502F1B6b576ba848D227F900460d930 \
 *     npx hardhat run scripts/admin/upgrade_auto_staking_vault.ts --network sepolia
 *
 *   # By deployment-file lookup (reads `autoStakingVaultProxy` field):
 *   DEPLOYMENT_FILE=deployment_smb_sepolia.json \
 *     npx hardhat run scripts/admin/upgrade_auto_staking_vault.ts --network sepolia
 *
 *   # Dry-run (deploys new impl + simulates upgrade, does not broadcast upgrade tx):
 *   DRY_RUN=true PROXY_ADDRESS=0x... npx hardhat run scripts/admin/upgrade_auto_staking_vault.ts --network sepolia
 *
 *   # Upgrade an SMB proxy — supply CONTRACT_NAME (defaults to AutoStakingVault):
 *   CONTRACT_NAME=SMBStakingVault PROXY_ADDRESS=0x... \
 *     npx hardhat run scripts/admin/upgrade_auto_staking_vault.ts --network sepolia
 *
 *   # Skip Etherscan verification:
 *   SKIP_VERIFY=true PROXY_ADDRESS=0x... npx hardhat run scripts/admin/upgrade_auto_staking_vault.ts --network sepolia
 */

const KNOWN_CONTRACTS: Record<string, string> = {
  AutoStakingVault: "contracts/AutoStakingVault.sol:AutoStakingVault",
  SMBStakingVault: "contracts/SMBStakingVault.sol:SMBStakingVault",
};

function resolveContractName(): { name: string; verifyPath: string } {
  const name = process.env.CONTRACT_NAME ?? "AutoStakingVault";
  const verifyPath = process.env.VERIFY_CONTRACT ?? KNOWN_CONTRACTS[name];
  if (!verifyPath) {
    throw new Error(
      `CONTRACT_NAME=${name} is not in KNOWN_CONTRACTS. ` +
        `Set VERIFY_CONTRACT=contracts/<dir>/<File>.sol:<Contract> explicitly.`
    );
  }
  return { name, verifyPath };
}

function resolveProxyAddress(networkName: string): { proxy: string; source: string } {
  const direct = process.env.PROXY_ADDRESS;
  if (direct) {
    if (!ethers.isAddress(direct)) {
      throw new Error(`PROXY_ADDRESS is not a valid address: ${direct}`);
    }
    return { proxy: ethers.getAddress(direct), source: "PROXY_ADDRESS env var" };
  }

  const file = process.env.DEPLOYMENT_FILE;
  if (!file) {
    throw new Error(
      "Must set either PROXY_ADDRESS=0x... or DEPLOYMENT_FILE=deployment_auto_staking_sepolia.json"
    );
  }

  const filePath = path.isAbsolute(file) ? file : path.join(__dirname, "../..", file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Deployment file not found: ${filePath}`);
  }

  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const proxy = json.autoStakingVaultProxy ?? json.proxy ?? json.contracts?.autoStakingVault;
  if (!proxy || !ethers.isAddress(proxy)) {
    throw new Error(
      `Could not find a valid AutoStakingVault proxy address in ${file}. ` +
        `Expected key 'autoStakingVaultProxy' (or 'proxy', or 'contracts.autoStakingVault').`
    );
  }

  // Best-effort sanity check vs. the file's recorded network
  if (json.network && json.network !== networkName) {
    console.warn(
      `⚠️  Deployment file network (${json.network}) does not match --network (${networkName}).`
    );
  }

  return { proxy: ethers.getAddress(proxy), source: filePath };
}

async function main() {
  console.log("\n🚀 UPGRADING AUTO-STAKING VAULT");
  console.log("=".repeat(72));

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const dryRun = process.env.DRY_RUN === "true";
  const skipVerify = process.env.SKIP_VERIFY === "true";

  const { proxy: proxyAddress, source } = resolveProxyAddress(network.name);
  const { name: contractName, verifyPath: verifyContract } = resolveContractName();

  console.log(`Network:          ${network.name} (chainId ${network.chainId})`);
  console.log(`Deployer:         ${deployer.address}`);
  console.log(`Balance:          ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log(`Proxy:            ${proxyAddress}`);
  console.log(`Proxy source:     ${source}`);
  console.log(`Contract:         ${contractName}`);
  console.log(`Dry run:          ${dryRun}`);

  // Pre-upgrade checks
  const oldImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log(`Current impl:     ${oldImpl}`);

  // Use the StakingVault ABI for state reads — every subclass exposes the same surface,
  // so we don't need separate typechain bindings per brand.
  const vault = await ethers.getContractAt("StakingVault", proxyAddress);
  const UPGRADER_ROLE = await vault.UPGRADER_ROLE();
  const hasRole = await vault.hasRole(UPGRADER_ROLE, deployer.address);
  if (!hasRole && !dryRun) {
    throw new Error(
      `Deployer ${deployer.address} does not hold UPGRADER_ROLE on ${proxyAddress}. ` +
        `Have the role-holder (Safe / EOA) run this script, or run with DRY_RUN=true.`
    );
  }
  console.log(`UPGRADER_ROLE:    ${hasRole ? "✅ deployer holds it" : "⚠️  deployer does NOT hold it (dry-run only)"}`);

  // Snapshot state before upgrade
  const [name, symbol, totalSupply, totalAssets, asset, paused, navOracle, navFeedId, yieldVault] =
    await Promise.all([
      vault.name(),
      vault.symbol(),
      vault.totalSupply(),
      vault.totalAssets(),
      vault.asset(),
      vault.paused(),
      vault.navOracle(),
      vault.navFeedId(),
      vault.yieldVault(),
    ]);

  console.log("\n📊 STATE BEFORE UPGRADE");
  console.log("-".repeat(72));
  console.log(`  name / symbol:  ${name} / ${symbol}`);
  console.log(`  totalSupply:    ${ethers.formatUnits(totalSupply, 6)} ${symbol}`);
  console.log(`  totalAssets:    ${ethers.formatUnits(totalAssets, 6)} (collateral)`);
  console.log(`  asset:          ${asset}`);
  console.log(`  paused:         ${paused}`);
  console.log(`  yieldVault:     ${yieldVault}`);
  console.log(`  navOracle:      ${navOracle}`);
  console.log(`  navFeedId:      ${navFeedId}`);

  // OZ upgrade validation (always run, even in dry-run — fails fast on layout incompat)
  console.log("\n🔍 Validating storage layout compatibility (OZ upgrades)...");
  const Factory = await ethers.getContractFactory(contractName);
  await upgrades.validateUpgrade(proxyAddress, Factory, { kind: "uups" });
  console.log("  ✅ Layout compatible");

  if (dryRun) {
    console.log("\nDRY_RUN=true — stopping before any state-changing tx.");
    return;
  }

  // Deploy new impl via plain deploy() so address is nonce-based (avoids CREATE2/bytecode-cache surprises)
  console.log("\n🔄 Deploying new implementation...");
  const implContract = await Factory.deploy();
  await implContract.waitForDeployment();
  const newImpl = await implContract.getAddress();
  console.log(`  New impl:       ${newImpl}`);

  // Upgrade — no init calldata needed (storage carries over via inherited slots)
  console.log("\n⬆️  Upgrading proxy → new impl...");
  const upgradeTx = await (vault as any).upgradeToAndCall(newImpl, "0x");
  console.log(`  Tx:             ${upgradeTx.hash}`);
  await upgradeTx.wait();
  console.log("  ✅ Upgrade confirmed");

  // Verify state preserved
  const [name2, symbol2, totalSupply2, totalAssets2, asset2, paused2, navOracle2, navFeedId2, yieldVault2] =
    await Promise.all([
      vault.name(),
      vault.symbol(),
      vault.totalSupply(),
      vault.totalAssets(),
      vault.asset(),
      vault.paused(),
      vault.navOracle(),
      vault.navFeedId(),
      vault.yieldVault(),
    ]);

  console.log("\n🔍 STATE VERIFICATION");
  console.log("-".repeat(72));
  const checks: [string, boolean][] = [
    ["name",          name === name2],
    ["symbol",        symbol === symbol2],
    ["totalSupply",   totalSupply === totalSupply2],
    ["totalAssets",   totalAssets === totalAssets2],
    ["asset",         asset === asset2],
    ["paused",        paused === paused2],
    ["yieldVault",    yieldVault === yieldVault2],
    ["navOracle",     navOracle === navOracle2],
    ["navFeedId",     navFeedId === navFeedId2],
  ];
  let allOk = true;
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? "✅" : "❌"} ${label} preserved`);
    if (!ok) allOk = false;
  }
  if (!allOk) {
    console.log("\n❌ State mismatch — investigate immediately.");
    process.exitCode = 1;
    return;
  }

  // Sanity: new (formerly-zero) reward-cap fields should be readable and zero
  try {
    const [maxPeriod, periodSecs, lastDistrib, maxTotal, totalDistrib] = await Promise.all([
      vault.maxPeriodRewards(),
      vault.rewardPeriodSeconds(),
      vault.lastRewardDistributedAt(),
      vault.maxTotalRewards(),
      vault.totalRewardsDistributed(),
    ]);
    console.log("\n📐 NEW REWARD-CAP FIELDS (should all be 0 = caps inactive)");
    console.log(`  maxPeriodRewards:        ${maxPeriod}`);
    console.log(`  rewardPeriodSeconds:     ${periodSecs}`);
    console.log(`  lastRewardDistributedAt: ${lastDistrib}`);
    console.log(`  maxTotalRewards:         ${maxTotal}`);
    console.log(`  totalRewardsDistributed: ${totalDistrib}`);
  } catch (e: any) {
    console.warn(`  ⚠️  Could not read new reward-cap getters: ${e.message}`);
  }

  // Persist upgrade artifact
  const artifact = {
    network: network.name,
    chainId: network.chainId.toString(),
    proxy: proxyAddress,
    oldImpl,
    newImpl,
    upgradedAt: new Date().toISOString(),
    tokenSymbol: symbol2,
  };
  const artifactPath = path.join(
    __dirname,
    "../..",
    `deployment_auto_staking_upgrade_${symbol2.toLowerCase()}_${network.name}.json`
  );
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  console.log(`\n📄 Artifact:        ${artifactPath}`);

  // Etherscan verification
  if (skipVerify) {
    console.log("\nSKIP_VERIFY=true — skipping Etherscan verification.");
  } else {
    console.log("\n⏳ Waiting 20s for Etherscan indexing...");
    await new Promise((r) => setTimeout(r, 20000));
    try {
      // Each StakingVault subclass produces identical bytecode — Etherscan can't
      // auto-pick. Use the explicit verify path resolved from CONTRACT_NAME.
      await run("verify:verify", {
        address: newImpl,
        constructorArguments: [],
        contract: verifyContract,
      });
      console.log("  ✅ Verified on Etherscan");
    } catch (e: any) {
      if (e.message?.includes("Already Verified")) {
        console.log("  ✅ Already verified");
      } else if (e.message?.includes("rate limit")) {
        console.log("  ⚠️  Etherscan rate limit — retry manually:");
        console.log(`     npx hardhat verify --contract ${verifyContract} \\`);
        console.log(`       --network ${network.name} ${newImpl}`);
      } else {
        console.warn(`  ⚠️  Verification failed: ${e.message}`);
      }
    }
  }

  console.log("\n✅ UPGRADE COMPLETE");
  console.log(`  Proxy (unchanged):  ${proxyAddress}`);
  console.log(`  Implementation:     ${oldImpl} → ${newImpl}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
