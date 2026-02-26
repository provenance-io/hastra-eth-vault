// @ts-ignore
import { ethers, upgrades } from "hardhat";

// Flags: set env vars to control which contracts to upgrade
// UPGRADE_STAKING=true  → upgrades StakingVault to V3
// UPGRADE_YIELD=true    → upgrades YieldVault to V2
// Default: both
const UPGRADE_STAKING = process.env.UPGRADE_STAKING !== "false";
const UPGRADE_YIELD   = process.env.UPGRADE_YIELD   !== "false";

async function main() {
  console.log("\n🚀 UPGRADE SCRIPT");
  console.log("=" + "=".repeat(60));
  console.log("Upgrading StakingVault:", UPGRADE_STAKING ? "YES" : "NO");
  console.log("Upgrading YieldVault:  ", UPGRADE_YIELD   ? "YES" : "NO");
  
  const [deployer] = await ethers.getSigners();
  console.log("Upgrading with account:", deployer.address);

  const deployment = require("../../deployment_testnet.json");
  const yieldVaultProxy   = deployment.contracts.yieldVault;
  const stakingVaultProxy = deployment.contracts.stakingVault;

  // ── YIELD VAULT ──────────────────────────────────────────────
  let yieldVaultV2: any = null;
  let yieldTotalSupply: bigint = 0n;
  let yieldV1Impl = "";

  if (UPGRADE_YIELD) {
    yieldV1Impl = await upgrades.erc1967.getImplementationAddress(yieldVaultProxy);
    const yieldVaultV1 = await ethers.getContractAt("YieldVault", yieldVaultProxy);
    yieldTotalSupply = await yieldVaultV1.totalSupply();
    console.log("\n📍 YieldVault proxy:  ", yieldVaultProxy);
    console.log("   impl (before):    ", yieldV1Impl);
    console.log("   totalSupply:      ", ethers.formatUnits(yieldTotalSupply, 6), "wYLDS");

    console.log("\n🔄 Upgrading YieldVault to V2...");
    const YieldVaultV2 = await ethers.getContractFactory("YieldVaultV2");
    try {
      yieldVaultV2 = await upgrades.upgradeProxy(yieldVaultProxy, YieldVaultV2, {
        timeout: 120000, pollingInterval: 2000,
      });
      await yieldVaultV2.waitForDeployment();
    } catch (error: any) {
      if (!error.message.includes("underpriced")) throw error;
      console.log("⚠️  Gas underpriced, retrying...");
      await new Promise(r => setTimeout(r, 10000));
      yieldVaultV2 = await upgrades.upgradeProxy(yieldVaultProxy, YieldVaultV2, {
        timeout: 120000, pollingInterval: 2000,
      });
      await yieldVaultV2.waitForDeployment();
    }
    const yieldV2Impl = await upgrades.erc1967.getImplementationAddress(yieldVaultProxy);
    const yieldAfter = await yieldVaultV2.totalSupply();
    console.log("✅ YieldVault upgraded");
    console.log("   impl (after):     ", yieldV2Impl);
    console.log("   version:          ", await yieldVaultV2.version());
    console.log("   state preserved:  ", yieldTotalSupply === yieldAfter ? "✅" : "❌");
  }

  // ── STAKING VAULT ─────────────────────────────────────────────
  let stakingVaultV3: any = null;
  let stakingTotalSupply: bigint = 0n;
  let stakingV1Impl = "";

  if (UPGRADE_STAKING) {
    stakingV1Impl = await upgrades.erc1967.getImplementationAddress(stakingVaultProxy);
    const stakingVaultV1 = await ethers.getContractAt("StakingVault", stakingVaultProxy);
    stakingTotalSupply = await stakingVaultV1.totalSupply();
    console.log("\n📍 StakingVault proxy:", stakingVaultProxy);
    console.log("   impl (before):    ", stakingV1Impl);
    console.log("   totalSupply:      ", ethers.formatUnits(stakingTotalSupply, 6), "PRIME");

    console.log("\n🔄 Upgrading StakingVault to V3...");
    const StakingVaultV3 = await ethers.getContractFactory("StakingVaultV3");
    try {
      stakingVaultV3 = await upgrades.upgradeProxy(stakingVaultProxy, StakingVaultV3, {
        timeout: 120000, pollingInterval: 2000,
      });
      await stakingVaultV3.waitForDeployment();
    } catch (error: any) {
      if (!error.message.includes("underpriced")) throw error;
      console.log("⚠️  Gas underpriced, retrying...");
      await new Promise(r => setTimeout(r, 10000));
      stakingVaultV3 = await upgrades.upgradeProxy(stakingVaultProxy, StakingVaultV3, {
        timeout: 120000, pollingInterval: 2000,
      });
      await stakingVaultV3.waitForDeployment();
    }

    // Sets maxRewardPercent = 20% on existing proxy
    console.log("🔧 Calling initializeV3...");
    const initTx = await stakingVaultV3.initializeV3();
    await initTx.wait();

    const stakingV3Impl = await upgrades.erc1967.getImplementationAddress(stakingVaultProxy);
    const stakingAfter = await stakingVaultV3.totalSupply();
    console.log("✅ StakingVault upgraded");
    console.log("   impl (after):     ", stakingV3Impl);
    console.log("   version:          ", (await stakingVaultV3.version()).toString());
    console.log("   maxRewardPercent: ", (await stakingVaultV3.maxRewardPercent()).toString(), "(20% = 200000000000000000)");
    console.log("   state preserved:  ", stakingTotalSupply === stakingAfter ? "✅" : "❌");
  }

  console.log("\n✅ DONE");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
