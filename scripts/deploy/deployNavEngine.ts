/**
 * [DEPLOY] Deploy a NAV-engine UUPS proxy.
 *
 * This file is BOTH a runnable entry-point (deploys with HastraNavEngine
 * defaults) AND the shared implementation imported by token-specific wrappers
 * like scripts/deploy/deployNavEngineSMB.ts.
 *
 * Run directly for the generic / shared HastraNavEngine:
 *   npx hardhat run scripts/deploy/deployNavEngine.ts --network sepolia
 *
 * Env vars (all optional — defaults to deployer address):
 *   OWNER_ADDRESS            - Initial owner (use deployer, then hand off to Safe)
 *   UPDATER_ADDRESS          - Bot wallet that calls updateRate()
 *   MAX_DIFFERENCE_PERCENT   - Max TVL change per update in wei (default: 1e17 = 10%)
 *   MIN_RATE                 - Minimum NAV rate as int192 (default: 5e17 = 0.5)
 *   MAX_RATE                 - Maximum NAV rate as int192 (default: 3e18 = 3.0)
 *   DRY_RUN                  - If "true", validate impl + print params and exit
 *                              without broadcasting any tx (no gas spent).
 *
 * Output file naming is overwrite-safe: if the canonical path exists, a
 * unique timestamp + proxy-suffixed file is written so prior records (AUTO,
 * other tokens) are never clobbered.
 */
// @ts-ignore
import { ethers, upgrades, network, run } from "hardhat";
import fs from "fs";
import path from "path";

export interface DeployNavEngineOptions {
    /**
     * Solidity contract name to deploy. Must be HastraNavEngine or a thin
     * subclass of it (constructor calls _disableInitializers, no other code).
     * Defaults to "HastraNavEngine".
     */
    contractName?: string;
    /**
     * Fully-qualified source path used to disambiguate Etherscan verification
     * when multiple contracts compile to identical bytecode. Defaults to
     * "contracts/chainlink/{contractName}.sol:{contractName}".
     */
    verifyContract?: string;
    /**
     * Output deployment-file prefix. Default writes
     *   deployment_nav_mainnet.json (mainnet)
     *   deployment_nav_testnet_<network>.json (others)
     * Wrappers override to e.g. "deployment_nav_smb", which produces:
     *   deployment_nav_smb_mainnet.json           (mainnet)
     *   deployment_nav_smb_testnet_<network>.json (others)
     * so SMB artifacts are obvious at a glance.
     */
    outputFilePrefix?: string;
    /** Console label for the deploy banner (e.g. "SMB NAV Engine"). */
    label?: string;
}

export async function deployNavEngineInstance(opts: DeployNavEngineOptions = {}): Promise<void> {
    const [deployer] = await ethers.getSigners();
    const contractName = opts.contractName ?? "HastraNavEngine";
    const verifyContract = opts.verifyContract ?? `contracts/chainlink/${contractName}.sol:${contractName}`;
    const label = opts.label ?? contractName;
    const isDryRun = process.env.DRY_RUN === "true";

    console.log(`Deploying ${label} with account:`, deployer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
    console.log("Network:", network.name);
    if (isDryRun) {
        console.log("⚠️  DRY_RUN=true — no transactions will be sent.");
    }

    // Deployment parameters — override via env vars
    const OWNER   = process.env.OWNER_ADDRESS   || deployer.address;
    const UPDATER = process.env.UPDATER_ADDRESS || deployer.address;
    const MAX_DIFFERENCE_PERCENT = process.env.MAX_DIFFERENCE_PERCENT
        ? BigInt(process.env.MAX_DIFFERENCE_PERCENT)
        : ethers.parseEther("0.1");  // default 10%
    const MIN_RATE = process.env.MIN_RATE
        ? BigInt(process.env.MIN_RATE)
        : BigInt("500000000000000000");  // default 0.5
    const MAX_RATE = process.env.MAX_RATE
        ? BigInt(process.env.MAX_RATE)
        : BigInt("3000000000000000000");  // default 3.0

    console.log("\nDeployment Parameters:");
    console.log("  Contract:", contractName);
    console.log("  Owner:", OWNER);
    console.log("  Updater:", UPDATER);
    console.log("  Max Difference:", MAX_DIFFERENCE_PERCENT.toString(), `(${Number(MAX_DIFFERENCE_PERCENT) / 1e18 * 100}%)`);
    console.log("  Min Rate:", MIN_RATE.toString(), `(${Number(MIN_RATE) / 1e18})`);
    console.log("  Max Rate:", MAX_RATE.toString(), `(${Number(MAX_RATE) / 1e18})`);

    // Validate the impl + initializer would deploy without actually broadcasting.
    // Catches storage-layout / initializer issues, missing roles, etc., before
    // the user spends any gas.
    if (isDryRun) {
        console.log("\n🔍 [DRY_RUN] Validating deployment (no broadcast)...");
        const Factory = await ethers.getContractFactory(contractName);
        await upgrades.validateImplementation(Factory, { kind: "uups" });
        console.log("  ✅ Implementation validates");
        console.log("\n[DRY_RUN] Stopping before any state-changing tx. Re-run without DRY_RUN to deploy.");
        return;
    }

    // Deploy proxy
    const Factory = await ethers.getContractFactory(contractName);
    const navEngine = await upgrades.deployProxy(
        Factory,
        [OWNER, UPDATER, MAX_DIFFERENCE_PERCENT, MIN_RATE, MAX_RATE],
        {
            initializer: "initialize",
            kind: "uups"
        }
    );

    await navEngine.waitForDeployment();
    const proxyAddress = await navEngine.getAddress();
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log(`\n✅ ${label} deployed!`);
    console.log("  Proxy Address:", proxyAddress);
    console.log("  Implementation:", implementationAddress);

    // Verify deployment
    console.log("\nVerifying deployment...");
    const updater = await navEngine.getUpdater();
    const minRate = await navEngine.getMinRate();
    const maxRate = await navEngine.getMaxRate();

    console.log("  Updater:", updater);
    console.log("  Min Rate:", minRate.toString());
    console.log("  Max Rate:", maxRate.toString());
    console.log("  Owner:", await navEngine.owner());

    // Get network info
    const chainId = (await ethers.provider.getNetwork()).chainId.toString();
    const deployTx = navEngine.deploymentTransaction();
    const txHash = deployTx?.hash || "unknown";

    // Prepare deployment data
    const deploymentData = {
        network: network.name,
        chainId: chainId,
        timestamp: new Date().toISOString(),
        contractName,
        contracts: {
            navEngine: proxyAddress,
            navEngineImplementation: implementationAddress
        },
        transactions: {
            navEngine: txHash
        },
        roles: {
            owner: OWNER,
            updater: UPDATER
        },
        config: {
            maxDifferencePercent: MAX_DIFFERENCE_PERCENT.toString(),
            minRate: MIN_RATE.toString(),
            maxRate: MAX_RATE.toString()
        }
    };

    // Determine output file
    const prefix = opts.outputFilePrefix ?? "deployment_nav";
    let outputFile: string;
    if (network.name === "mainnet") {
        outputFile = `${prefix}_mainnet.json`;
    } else {
        outputFile = `${prefix}_testnet_${network.name}.json`;
    }

    // Overwrite-safe: if the canonical path already exists, write to a unique
    // timestamp + proxy-suffixed file so prior records are never clobbered.
    let outputPath = path.join(process.cwd(), outputFile);
    if (fs.existsSync(outputPath)) {
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const shortProxy = proxyAddress.slice(2, 10).toLowerCase();
        const renamed = outputFile.replace(/\.json$/, `_${ts}_${shortProxy}.json`);
        console.log(`\nℹ️  ${outputFile} already exists — writing new record to a unique file to avoid overwrite.`);
        outputFile = renamed;
        outputPath = path.join(process.cwd(), outputFile);
    }

    fs.writeFileSync(outputPath, JSON.stringify(deploymentData, null, 2), "utf-8");
    console.log(`\n✅ Deployment data saved to: ${outputFile}`);

    // Verify contracts on Etherscan
    if (network.name !== "localhost" && network.name !== "hardhat") {
        console.log("\n⏳ Waiting 30 seconds before verification...");
        await new Promise(resolve => setTimeout(resolve, 30000));

        console.log("\n🔍 Verifying contracts on block explorer...");

        try {
            console.log("  Verifying proxy contract...");
            // NOTE: @openzeppelin/hardhat-upgrades overrides `verify:verify` to detect
            // an ERC1967 proxy, resolve its implementation, and submit the impl source
            // for verification. We pass the PROXY address on purpose — the plugin
            // extracts the impl, verifies it, then links proxy↔impl on Etherscan.
            await run("verify:verify", {
                address: proxyAddress,
                constructorArguments: [],
                // Disambiguate by source path — every NAV-engine subclass produces
                // identical bytecode so Etherscan can't auto-pick.
                contract: verifyContract,
            });
            console.log("  ✅ Proxy verified!");
        } catch (error: any) {
            if (error.message.includes("Already Verified")) {
                console.log("  ℹ️  Proxy already verified");
            } else if (error.message.includes("rate limit")) {
                console.log("  ⚠️  Etherscan rate limit — retry manually:");
                console.log(`     npx hardhat verify --contract ${verifyContract} \\`);
                console.log(`       --network ${network.name} ${proxyAddress}`);
            } else {
                console.log("  ⚠️  Proxy verification failed:", error.message);
            }
        }
    }

    console.log("\n✅ Deployment successful!");

    // Network-specific next steps
    if (network.name === "sepolia") {
        console.log("\n📋 Chainlink Data Streams Integration (Sepolia):");
        console.log("  Verifier Contract: 0x09DFf56A4fF44e0f4436260A04F5CFa65636A481");
        console.log("  Reference: https://docs.chain.link/data-streams/supported-networks");
        console.log("\n  Share with Chainlink:");
        console.log("    - Contract: ", proxyAddress);
        console.log("    - Chain: Sepolia (11155111)");
        console.log("    - Function: getRate() returns (int192)");
        console.log("    - Explorer: https://sepolia.etherscan.io/address/" + proxyAddress);
    }

    console.log("\nNext steps:");
    console.log("  1. Configure Chainlink DON to read from:", proxyAddress);
    console.log("  2. Set up bot to call updateRate(totalSupply, totalTVL)");
    console.log("  3. DON will read getRate() which returns int192");
    console.log("  4. View on explorer to verify contract is published");
}

// ============ Default entry-point: shared HastraNavEngine ============

async function main() {
    await deployNavEngineInstance();
}

// Only auto-run when invoked directly (not when imported by deployNavEngineSMB.ts).
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
