/**
 * [OPS] Query the HastraNavEngine contract for the current rate and all on-chain state.
 * Reads from deployment_nav_testnet.json or NAV_ENGINE_ADDRESS env var.
 *
 * Usage:
 *   npx hardhat run scripts/ops/queryNavEngine.ts --network sepolia
 *   NAV_ENGINE_ADDRESS=0x... npx hardhat run scripts/ops/queryNavEngine.ts --network hoodi
 */
import { ethers, network } from "hardhat";
import fs from "fs";

async function main() {
  console.log("🔍 Querying NavEngine Rate...\n");
  console.log("Network:", network.name);

  // Try to load deployment file
  let deploymentFile: string;
  if (network.name === "mainnet") {
    deploymentFile = "deployment_nav_mainnet.json";
  } else {
    deploymentFile = "deployment_nav_testnet.json";
  }

  let navEngineAddress: string;

  if (fs.existsSync(deploymentFile)) {
    const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
    navEngineAddress = deployment.contracts.navEngine;
    console.log(`📁 Loaded address from ${deploymentFile}`);
  } else {
    // Manual address input
    console.log("⚠️  No deployment file found");
    console.log("Please provide NavEngine address as environment variable:");
    console.log("NAV_ENGINE_ADDRESS=0x... npx hardhat run scripts/queryNavEngine.ts --network sepolia");
    
    if (!process.env.NAV_ENGINE_ADDRESS) {
      throw new Error("NAV_ENGINE_ADDRESS not provided");
    }
    navEngineAddress = process.env.NAV_ENGINE_ADDRESS;
  }

  console.log("\n📊 NavEngine Status:");
  console.log("  Contract:    ", navEngineAddress);
  console.log("  Network:     ", network.name, `(ChainID: ${(await ethers.provider.getNetwork()).chainId})`);
  console.log();

  // Connect to contract
  const NavEngine = await ethers.getContractFactory("HastraNavEngine");
  const navEngine = NavEngine.attach(navEngineAddress);

  // Query all state
  try {
    const [
      currentRate,
      minRate,
      maxRate,
      lastUpdateTime,
      updater,
      owner,
      paused,
      maxDifferencePercent,
      latestTotalSupply,
      latestTVL
    ] = await Promise.all([
      navEngine.getRate(),
      navEngine.getMinRate(),
      navEngine.getMaxRate(),
      navEngine.getLatestUpdateTime(),
      navEngine.getUpdater(),
      navEngine.owner(),
      navEngine.paused(),
      navEngine.getMaxDifferencePercent(),
      navEngine.getLatestTotalSupply(),
      navEngine.getLatestTVL()
    ]);

    console.log("  ✅ Current Rate:", currentRate.toString(), `(${ethers.formatEther(currentRate)})`);
    console.log("  📏 Min Rate:    ", minRate.toString(), `(${ethers.formatEther(minRate)})`);
    console.log("  📏 Max Rate:    ", maxRate.toString(), `(${ethers.formatEther(maxRate)})`);
    console.log("  🕐 Last Update: ", lastUpdateTime.toString());
    
    if (lastUpdateTime > 0n) {
      const updateDate = new Date(Number(lastUpdateTime) * 1000);
      console.log("  🕐 Update Date: ", updateDate.toISOString());
      
      const now = Math.floor(Date.now() / 1000);
      const ageSeconds = now - Number(lastUpdateTime);
      const ageHours = (ageSeconds / 3600).toFixed(2);
      console.log("  ⏱️  Age:        ", `${ageHours} hours ago`);
    }

    console.log("  👤 Updater:     ", updater);
    console.log("  👑 Owner:       ", owner);
    console.log("  ⏸️  Paused:      ", paused);
    console.log();

    console.log("📈 Latest Update Data:");
    console.log("  Total Supply:", latestTotalSupply.toString(), `(${ethers.formatEther(latestTotalSupply)} tokens)`);
    console.log("  Total TVL:   ", latestTVL.toString(), `(${ethers.formatEther(latestTVL)} tokens)`);
    
    if (latestTotalSupply > 0n && latestTVL > 0n) {
      // Calculate rate from supply and TVL
      // rate = (totalTVL × 1e18) / totalSupply
      const calculatedRate = (latestTVL * ethers.parseEther("1")) / latestTotalSupply;
      console.log("  Calculated:  ", calculatedRate.toString(), `(${ethers.formatEther(calculatedRate)})`);
      
      if (calculatedRate === currentRate) {
        console.log("  ✅ Rate matches calculation");
      } else {
        console.log("  ⚠️  Rate mismatch!");
      }
    }
    console.log();

    console.log("⚙️  Configuration:");
    console.log("  Max Difference:", maxDifferencePercent.toString(), `(${Number(maxDifferencePercent) / 1e16}%)`);
    console.log();

    // Rate analysis
    const rateFloat = Number(ethers.formatEther(currentRate));
    const minRateFloat = Number(ethers.formatEther(minRate));
    const maxRateFloat = Number(ethers.formatEther(maxRate));
    
    const rangeUsed = ((rateFloat - minRateFloat) / (maxRateFloat - minRateFloat)) * 100;
    console.log("📊 Rate Analysis:");
    console.log(`  Current: ${rateFloat.toFixed(6)} (${rangeUsed.toFixed(2)}% of range)`);
    console.log(`  Range: ${minRateFloat} - ${maxRateFloat}`);
    
    if (rateFloat < 1.0) {
      console.log("  ⚠️  Rate below 1.0 (vault is worth less than initial)");
    } else if (rateFloat === 1.0) {
      console.log("  ℹ️  Rate at 1.0 (no growth yet)");
    } else {
      const growthPercent = ((rateFloat - 1.0) * 100).toFixed(2);
      console.log(`  ✅ Rate above 1.0 (+${growthPercent}% growth)`);
    }

    // Check if close to bounds
    const marginToMin = ((rateFloat - minRateFloat) / minRateFloat) * 100;
    const marginToMax = ((maxRateFloat - rateFloat) / maxRateFloat) * 100;
    
    if (marginToMin < 10) {
      console.log(`  🚨 WARNING: Rate within 10% of MIN_RATE`);
    }
    if (marginToMax < 10) {
      console.log(`  🚨 WARNING: Rate within 10% of MAX_RATE`);
    }

  } catch (error: any) {
    console.error("❌ Error querying contract:", error.message);
    throw error;
  }

  console.log();
  console.log("🔗 Explorer:");
  if (network.name === "sepolia") {
    console.log(`  https://sepolia.etherscan.io/address/${navEngineAddress}`);
  } else if (network.name === "mainnet") {
    console.log(`  https://etherscan.io/address/${navEngineAddress}`);
  } else if (network.name === "hoodi") {
    console.log(`  https://hoodi.explorer/ (if available)`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
