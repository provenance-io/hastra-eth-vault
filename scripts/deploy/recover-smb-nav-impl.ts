/**
 * [RECOVERY] Register the already-deployed HastraSMBNavEngine implementation
 * in the OZ upgrades manifest, then deploy only the proxy.
 *
 * Background:
 *   The deployNavEngineSMB.ts script crashed with a BAD_DATA error from ethers
 *   v6 after broadcasting the implementation CREATE tx (nonce 0x48 from
 *   0x5f134E02dbDd7514E0E166f8D55BB2E6D06659b3).  The impl IS on-chain at
 *   0x9fD0b0EF9fb4591A7C315BC19f0fb29A9Edb019E; only the proxy was never
 *   deployed.
 *
 *   This script:
 *     1. Calls upgrades.forceImport(implAddress, factory) to register the
 *        impl in .openzeppelin/mainnet.json so a subsequent deployProxy does
 *        not re-deploy it.
 *     2. Deploys the ERC1967 UUPS proxy, initialises it, and saves the record
 *        to deployment_nav_smb_mainnet.json.
 *
 * Usage:
 *   OWNER_ADDRESS=0x5f134E02dbDd7514E0E166f8D55BB2E6D06659b3 \
 *   UPDATER_ADDRESS=0xD5a287959e575212df14e37ba902c5b21e9FB4c8 \
 *   MAX_RATE=2000000000000000000 \
 *   npx hardhat run scripts/deploy/recover-smb-nav-impl.ts --network mainnet
 */
// @ts-ignore
import { ethers, upgrades, network, run } from "hardhat";
import fs from "fs";
import path from "path";
import { patchProviderForCheckTxBug } from "./lib/patchProvider";

const SMB_IMPL_ADDRESS = "0x9fD0b0EF9fb4591A7C315BC19f0fb29A9Edb019E";

async function main() {
    const [deployer] = await ethers.getSigners();

    // Patch at both levels: outer method AND _hardhatProvider.send
    patchProviderForCheckTxBug(ethers.provider);

    console.log("Recovery: HastraSMBNavEngine proxy deployment");
    console.log("  Network:  ", network.name);
    console.log("  Deployer: ", deployer.address);
    console.log("  Known impl:", SMB_IMPL_ADDRESS);

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

    console.log("\nDeployment Parameters:");
    console.log("  Owner:   ", OWNER);
    console.log("  Updater: ", UPDATER);
    console.log("  Max Diff:", MAX_DIFFERENCE_PERCENT.toString());
    console.log("  Min Rate:", MIN_RATE.toString());
    console.log("  Max Rate:", MAX_RATE.toString());

    const Factory = await ethers.getContractFactory("HastraSMBNavEngine");

    // Step 1: register the existing impl in the manifest so deployProxy skips it.
    // forceImport with a non-proxy address calls addImplToManifest internally.
    console.log("\n⏳ Registering impl in OZ manifest...");
    await upgrades.forceImport(SMB_IMPL_ADDRESS, Factory, { kind: "uups" });
    console.log("  ✅ Impl registered:", SMB_IMPL_ADDRESS);

    // Step 2: deploy only the proxy. Because the impl is now in the manifest,
    // OZ will skip impl deployment and go straight to proxy creation.
    console.log("\n⏳ Deploying UUPS proxy...");
    const navEngine = await upgrades.deployProxy(
        Factory,
        [OWNER, UPDATER, MAX_DIFFERENCE_PERCENT, MIN_RATE, MAX_RATE],
        { initializer: "initialize", kind: "uups" }
    );

    await navEngine.waitForDeployment();
    const proxyAddress = await navEngine.getAddress();
    const implAddress  = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log("\n✅ HastraSMBNavEngine proxy deployed!");
    console.log("  Proxy:  ", proxyAddress);
    console.log("  Impl:   ", implAddress);

    // Sanity check
    console.log("\nVerifying on-chain state...");
    console.log("  Owner:   ", await navEngine.owner());
    console.log("  Updater: ", await navEngine.getUpdater());
    console.log("  MinRate: ", (await navEngine.getMinRate()).toString());
    console.log("  MaxRate: ", (await navEngine.getMaxRate()).toString());

    const chainId   = (await ethers.provider.getNetwork()).chainId.toString();
    const deployTx  = navEngine.deploymentTransaction();
    const txHash    = deployTx?.hash || "unknown";

    const deploymentData = {
        network: network.name,
        chainId,
        timestamp: new Date().toISOString(),
        contractName: "HastraSMBNavEngine",
        contracts: {
            navEngine: proxyAddress,
            navEngineImplementation: implAddress
        },
        transactions: {
            navEngine: txHash
        },
        roles: { owner: OWNER, updater: UPDATER },
        config: {
            maxDifferencePercent: MAX_DIFFERENCE_PERCENT.toString(),
            minRate: MIN_RATE.toString(),
            maxRate: MAX_RATE.toString()
        }
    };

    const outputFile = network.name === "mainnet"
        ? "deployment_nav_smb_mainnet.json"
        : `deployment_nav_smb_testnet_${network.name}.json`;
    const outputPath = path.join(process.cwd(), outputFile);

    // Overwrite-safe
    if (fs.existsSync(outputPath)) {
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const short = proxyAddress.slice(2, 10).toLowerCase();
        const renamed = outputFile.replace(/\.json$/, `_${ts}_${short}.json`);
        console.log(`\nℹ️  ${outputFile} already exists — writing to ${renamed}`);
        fs.writeFileSync(path.join(process.cwd(), renamed), JSON.stringify(deploymentData, null, 2), "utf-8");
        console.log(`✅ Saved: ${renamed}`);
    } else {
        fs.writeFileSync(outputPath, JSON.stringify(deploymentData, null, 2), "utf-8");
        console.log(`\n✅ Deployment data saved to: ${outputFile}`);
    }

    // Verify on Etherscan
    if (network.name !== "localhost" && network.name !== "hardhat") {
        console.log("\n⏳ Waiting 30 seconds before verification...");
        await new Promise(resolve => setTimeout(resolve, 30000));

        console.log("\n🔍 Verifying on Etherscan...");
        try {
            await run("verify:verify", {
                address: proxyAddress,
                constructorArguments: [],
                contract: "contracts/chainlink/HastraSMBNavEngine.sol:HastraSMBNavEngine"
            });
            console.log("  ✅ Proxy verified!");
        } catch (error: any) {
            if (error.message.includes("Already Verified")) {
                console.log("  ℹ️  Already verified");
            } else if (error.message.includes("rate limit")) {
                console.log("  ⚠️  Rate limit — retry manually:");
                console.log(`     npx hardhat verify --contract contracts/chainlink/HastraSMBNavEngine.sol:HastraSMBNavEngine \\`);
                console.log(`       --network mainnet ${proxyAddress}`);
            } else {
                console.log("  ⚠️  Verification failed:", error.message);
            }
        }
    }

    console.log("\n✅ Recovery complete!");
    console.log("\nNext steps:");
    console.log("  1. Wire to SMBStakingVault:");
    console.log(`     cast send <SMB_STAKING_VAULT_PROXY> "setNavOracle(address,bytes32)" \\`);
    console.log(`       ${proxyAddress} <SMB_FEED_ID> --rpc-url "$RPC" --ledger`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
