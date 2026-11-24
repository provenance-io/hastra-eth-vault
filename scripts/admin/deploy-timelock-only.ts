// @ts-ignore
import {ethers, network, run} from "hardhat";
import * as fs from "fs";
import * as path from "path";
import {execSync} from "child_process";

/**
 * Deploys only the HastraTimelockController (no vault lookup, no Safe calldata).
 * Copy of the deploy step in deploy-timelock.ts for networks where the vaults
 * are not deployed yet (e.g. Base mainnet phase 1).
 *
 * Config matches deploy-timelock.ts: Safe is proposer + canceller + timelock admin,
 * executor is open (address(0)).
 *
 * Usage:
 *   SAFE=0x... DELAY=86400 DRY_RUN=true \
 *     npx hardhat run scripts/admin/deploy-timelock-only.ts --network base
 *
 * Env vars:
 *   SAFE     - Safe multisig address. Required. Must have code on the target chain.
 *   DELAY    - Timelock delay in seconds. Default: 86400.
 *   DRY_RUN  - If "true", prints what would happen and exits.
 *   VERIFY   - Set to "false" to skip Etherscan verification.
 */

async function main() {
    const safeAddress = process.env.SAFE;
    const delaySeconds = Number.parseInt(process.env.DELAY || "86400", 10);
    const dryRun = process.env.DRY_RUN === "true";

    if (!safeAddress) throw new Error("SAFE env var required (Safe multisig address)");
    if (!Number.isInteger(delaySeconds) || delaySeconds < 0) {
        throw new Error(`DELAY must be a non-negative integer, got: "${process.env.DELAY}"`);
    }

    const [deployer] = await ethers.getSigners();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const balance = await ethers.provider.getBalance(deployer.address);
    const safeCode = await ethers.provider.getCode(safeAddress);
    if (safeCode === "0x") throw new Error(`No contract code at SAFE ${safeAddress} on ${network.name}`);

    console.log("═".repeat(62));
    console.log("  TIMELOCK CONTROLLER DEPLOYMENT (timelock only)");
    console.log("═".repeat(62));
    console.log(`  Network:   ${network.name} (chainId ${chainId})`);
    console.log(`  Deployer:  ${deployer.address}`);
    console.log(`  Balance:   ${ethers.formatEther(balance)} ETH`);
    console.log(`  Safe:      ${safeAddress}`);
    console.log(`  Delay:     ${delaySeconds}s (${delaySeconds / 3600}h)`);
    console.log(`  Dry run:   ${dryRun}`);
    console.log("═".repeat(62));

    if (dryRun) {
        console.log("\n[DRY RUN] Would deploy HastraTimelockController with:");
        console.log(`  minDelay:   ${delaySeconds}`);
        console.log(`  proposers:  [${safeAddress}]`);
        console.log(`  executors:  [${ethers.ZeroAddress}]  (open execution)`);
        console.log(`  admin:      ${safeAddress}`);
        return;
    }

    console.log("\n🚀 Deploying HastraTimelockController...");
    const factory = await ethers.getContractFactory("HastraTimelockController");
    const timelock = await factory.deploy(delaySeconds, [safeAddress], [ethers.ZeroAddress], safeAddress);
    await timelock.waitForDeployment();
    const timelockAddress = await timelock.getAddress();
    const deployTx = timelock.deploymentTransaction()?.hash || null;
    console.log(`✅ TimelockController deployed: ${timelockAddress}`);
    console.log(`   tx: ${deployTx}`);

    let gitCommit: string | null = null;
    try {
        gitCommit = execSync("git rev-parse HEAD").toString().trim();
    } catch {
        gitCommit = null;
    }

    const suffix = network.name === "base" ? "base_mainnet" : network.name;
    const file = path.join(__dirname, `../../deployment_timelock_${suffix}.json`);
    fs.writeFileSync(file, JSON.stringify({
        network: network.name,
        address: timelockAddress,
        delaySeconds,
        proposer: safeAddress,
        executor: ethers.ZeroAddress,
        admin: safeAddress,
        deployedAt: new Date().toISOString(),
        deployTx,
        gitCommit,
    }, null, 2) + "\n");
    console.log(`📝 Wrote ${path.basename(file)}`);

    if (process.env.VERIFY === "false" || !process.env.ETHERSCAN_API_KEY) {
        console.log("\n⚠️  Skipping verify (VERIFY=false or ETHERSCAN_API_KEY not set).");
        return;
    }
    console.log("\n⏳ Waiting 30s for Etherscan to index the deploy tx before verifying...");
    await new Promise((r) => setTimeout(r, 30_000));
    try {
        await run("verify:verify", {
            address: timelockAddress,
            contract: "contracts/utils/HastraTimelockController.sol:HastraTimelockController",
            constructorArguments: [delaySeconds, [safeAddress], [ethers.ZeroAddress], safeAddress],
        });
        console.log("✅ Verified on Etherscan");
    } catch (err: any) {
        const msg = String(err?.message || err);
        console.log(msg.toLowerCase().includes("already verified")
            ? "✅ Already verified on Etherscan"
            : `⚠️  Verify failed (non-fatal): ${msg.split("\n")[0]}`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
