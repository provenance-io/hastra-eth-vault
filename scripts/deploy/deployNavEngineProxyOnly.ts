/**
 * [DEPLOY] Deploy a UUPS proxy for a NavEngine using an already-deployed implementation.
 *
 * Use this when the implementation was deployed in a prior run but the proxy
 * deployment failed (e.g. ethers v6 `to: ""` crash on mainnet).
 *
 * Required env vars:
 *   IMPL_ADDRESS   - Address of the already-deployed implementation contract
 *   CONTRACT_NAME  - Solidity contract name (e.g. HastraFlexNavEngine)
 *   OUTPUT_PREFIX  - Deployment file prefix (e.g. deployment_nav_flex)
 *
 * Optional env vars (same defaults as deployNavEngine.ts):
 *   OWNER_ADDRESS            - Initial owner (defaults to deployer)
 *   UPDATER_ADDRESS          - Bot wallet that calls updateRate() (defaults to deployer)
 *   MAX_DIFFERENCE_PERCENT   - Default: 1e17 (10%)
 *   MIN_RATE                 - Default: 5e17 (0.5)
 *   MAX_RATE                 - Default: 3e18 (3.0)
 *
 * Usage:
 *   IMPL_ADDRESS=0x... CONTRACT_NAME=HastraFlexNavEngine OUTPUT_PREFIX=deployment_nav_flex \
 *     UPDATER_ADDRESS=0x... MAX_RATE=2000000000000000000 \
 *     npx hardhat run scripts/deploy/deployNavEngineProxyOnly.ts --network mainnet
 */
// @ts-ignore
import { ethers, upgrades, network, run } from "hardhat";
import fs from "fs";
import path from "path";
import { patchProviderForCheckTxBug } from "./lib/patchProvider";

async function main() {
    patchProviderForCheckTxBug(ethers.provider);

    const [deployer] = await ethers.getSigners();

    const implAddress   = process.env.IMPL_ADDRESS;
    const contractName  = process.env.CONTRACT_NAME;
    const outputPrefix  = process.env.OUTPUT_PREFIX;

    if (!implAddress)  throw new Error("IMPL_ADDRESS env var required");
    if (!contractName) throw new Error("CONTRACT_NAME env var required");
    if (!outputPrefix) throw new Error("OUTPUT_PREFIX env var required");

    const OWNER   = process.env.OWNER_ADDRESS   || deployer.address;
    const UPDATER = process.env.UPDATER_ADDRESS || deployer.address;
    const MAX_DIFFERENCE_PERCENT = process.env.MAX_DIFFERENCE_PERCENT
        ? BigInt(process.env.MAX_DIFFERENCE_PERCENT)
        : ethers.parseEther("0.1");
    const MIN_RATE = process.env.MIN_RATE
        ? BigInt(process.env.MIN_RATE)
        : BigInt("500000000000000000");
    const MAX_RATE = process.env.MAX_RATE
        ? BigInt(process.env.MAX_RATE)
        : BigInt("3000000000000000000");

    console.log(`Deploying proxy-only for ${contractName} with account:`, deployer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
    console.log("Network:", network.name);
    console.log("\nUsing existing implementation:", implAddress);
    console.log("\nDeployment Parameters:");
    console.log("  Owner:          ", OWNER);
    console.log("  Updater:        ", UPDATER);
    console.log("  Max Difference: ", MAX_DIFFERENCE_PERCENT.toString(), `(${Number(MAX_DIFFERENCE_PERCENT) / 1e18 * 100}%)`);
    console.log("  Min Rate:       ", MIN_RATE.toString(), `(${Number(MIN_RATE) / 1e18})`);
    console.log("  Max Rate:       ", MAX_RATE.toString(), `(${Number(MAX_RATE) / 1e18})`);

    // Register the existing impl in the OZ manifest so deployProxy skips
    // implementation deployment and goes straight to proxy + initialize.
    const Factory = await ethers.getContractFactory(contractName);
    await upgrades.forceImport(implAddress, Factory, { kind: "uups" });
    console.log("\n✅ Implementation registered in OZ manifest");

    const navEngine = await upgrades.deployProxy(
        Factory,
        [OWNER, UPDATER, MAX_DIFFERENCE_PERCENT, MIN_RATE, MAX_RATE],
        { initializer: "initialize", kind: "uups", useDeployedImplementation: true }
    );

    await navEngine.waitForDeployment();
    const proxyAddress = await navEngine.getAddress();
    const resolvedImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log(`\n✅ Proxy deployed!`);
    console.log("  Proxy Address:  ", proxyAddress);
    console.log("  Implementation: ", resolvedImpl);

    if (resolvedImpl.toLowerCase() !== implAddress.toLowerCase()) {
        console.warn("  ⚠️  Implementation address mismatch — check OZ manifest");
    }

    // Verify on-chain state
    const updater = await navEngine.getUpdater();
    const minRate = await navEngine.getMinRate();
    const maxRate = await navEngine.getMaxRate();
    const owner   = await navEngine.owner();
    console.log("\nVerified on-chain:");
    console.log("  Owner:    ", owner);
    console.log("  Updater:  ", updater);
    console.log("  Min Rate: ", minRate.toString());
    console.log("  Max Rate: ", maxRate.toString());

    const chainId = (await ethers.provider.getNetwork()).chainId.toString();
    const txHash  = navEngine.deploymentTransaction()?.hash || "unknown";

    const deploymentData = {
        network: network.name,
        chainId,
        timestamp: new Date().toISOString(),
        contractName,
        contracts: { navEngine: proxyAddress, navEngineImplementation: resolvedImpl },
        transactions: { navEngine: txHash },
        roles: { owner: OWNER, updater: UPDATER },
        config: {
            maxDifferencePercent: MAX_DIFFERENCE_PERCENT.toString(),
            minRate: MIN_RATE.toString(),
            maxRate: MAX_RATE.toString(),
        },
    };

    const suffix  = network.name === "mainnet" ? "mainnet" : `testnet_${network.name}`;
    let outputFile = `${outputPrefix}_${suffix}.json`;
    let outputPath = path.join(process.cwd(), outputFile);

    if (fs.existsSync(outputPath)) {
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const short = proxyAddress.slice(2, 10).toLowerCase();
        outputFile = outputFile.replace(/\.json$/, `_${ts}_${short}.json`);
        outputPath = path.join(process.cwd(), outputFile);
        console.log(`\nℹ️  Canonical file exists — writing to: ${outputFile}`);
    }

    fs.writeFileSync(outputPath, JSON.stringify(deploymentData, null, 2), "utf-8");
    console.log(`\n✅ Deployment data saved to: ${outputFile}`);

    // Etherscan verification
    if (network.name !== "localhost" && network.name !== "hardhat") {
        console.log("\n⏳ Waiting 30 seconds before verification...");
        await new Promise(resolve => setTimeout(resolve, 30000));
        try {
            await run("verify:verify", {
                address: proxyAddress,
                constructorArguments: [],
                contract: `contracts/chainlink/${contractName}.sol:${contractName}`,
            });
            console.log("  ✅ Proxy verified on Etherscan");
        } catch (e: any) {
            if (e.message.includes("Already Verified")) {
                console.log("  ℹ️  Already verified");
            } else {
                console.log("  ⚠️  Verification failed:", e.message);
            }
        }
    }

    console.log("\n✅ Done!");
}

main()
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
