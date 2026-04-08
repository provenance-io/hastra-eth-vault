/**
 * [DEPLOY] Deploy the HastraNavEngine UUPS proxy with initial configuration.
 * Saves deployment artifacts to deployment_nav_testnet_<network>.json (or deployment_nav_mainnet.json).
 *
 * Usage:
 *   npx hardhat run scripts/deploy/deployNavEngine.ts --network sepolia
 *   npx hardhat run scripts/deploy/deployNavEngine.ts --network mainnet
 *
 * Env vars (all optional — defaults to deployer address / Sepolia values):
 *   OWNER_ADDRESS            - Initial owner (use deployer, then hand off to Safe)
 *   UPDATER_ADDRESS          - Bot wallet that calls updateRate()
 *   MAX_DIFFERENCE_PERCENT   - Max TVL change per update in wei (default: 100000000000000000 = 10%)
 *   MIN_RATE                 - Minimum NAV rate as int192 (default: 500000000000000000 = 0.5)
 *   MAX_RATE                 - Maximum NAV rate as int192 (default: 3000000000000000000 = 3.0)
 */
// @ts-ignore
import {ethers, upgrades, network, run} from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("Deploying HastraNavEngine with account:", deployer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
    console.log("Network:", network.name);

    // Deployment parameters — override via env vars for mainnet
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
    console.log("  Owner:", OWNER);
    console.log("  Updater:", UPDATER);
    console.log("  Max Difference:", MAX_DIFFERENCE_PERCENT.toString(), `(${Number(MAX_DIFFERENCE_PERCENT) / 1e18 * 100}%)`);
    console.log("  Min Rate:", MIN_RATE.toString(), `(${Number(MIN_RATE) / 1e18})`);
    console.log("  Max Rate:", MAX_RATE.toString(), `(${Number(MAX_RATE) / 1e18})`);

    // Deploy proxy
    const HastraNavEngine = await ethers.getContractFactory("HastraNavEngine");
    const navEngine = await upgrades.deployProxy(
        HastraNavEngine,
        [OWNER, UPDATER, MAX_DIFFERENCE_PERCENT, MIN_RATE, MAX_RATE],
        {
            initializer: "initialize",
            kind: "uups"
        }
    );

    await navEngine.waitForDeployment();
    const proxyAddress = await navEngine.getAddress();
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log("\n✅ HastraNavEngine deployed!");
    console.log("  Proxy Address:", proxyAddress);
    console.log("  Implementation:", implementationAddress);

    // Verify deployment
    console.log("\nVerifying deployment...");
    const updater = await navEngine.getUpdater();
    const minRate = await navEngine.getMinRate();
    const maxRate = await navEngine.getMaxRate();
    const maxDifference = await navEngine.getMaxDifferencePercent();

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

    // Determine output file based on network
    let outputFile: string;
    if (network.name === "mainnet") {
        outputFile = "deployment_nav_mainnet.json";
    } else {
        outputFile = `deployment_nav_testnet_${network.name}.json`;
    }

    const outputPath = path.join(process.cwd(), outputFile);

    // Write deployment data
    fs.writeFileSync(
        outputPath,
        JSON.stringify(deploymentData, null, 2),
        "utf-8"
    );

    console.log(`\n✅ Deployment data saved to: ${outputFile}`);

    // Verify contracts on Etherscan/block explorer
    if (network.name !== "localhost" && network.name !== "hardhat") {
        console.log("\n⏳ Waiting 30 seconds before verification...");
        await new Promise(resolve => setTimeout(resolve, 30000));

        console.log("\n🔍 Verifying contracts on block explorer...");

        try {
            // Verifying the proxy automatically verifies + links the implementation too
            console.log("  Verifying proxy contract...");
            await run("verify:verify", {
                address: proxyAddress,
                constructorArguments: []
            });
            console.log("  ✅ Proxy verified!");
        } catch (error: any) {
            if (error.message.includes("Already Verified")) {
                console.log("  ℹ️  Proxy already verified");
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

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
