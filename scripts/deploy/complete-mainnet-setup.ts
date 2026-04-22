// @ts-ignore
import { ethers } from "hardhat";

/**
 * [DEPLOY] Complete mainnet setup after deploy.ts failed at role grants.
 * Grants all roles, sets navOracle, approves USDC, saves deployment artifact.
 *
 * Usage:
 *   PRIVATE_KEY=0x... MAINNET_RPC_URL=https://... \
 *     npx hardhat run scripts/deploy/complete-mainnet-setup.ts --network mainnet
 */

const YIELD_VAULT  = "0x6aD038cA6C04e885630851278ca0a856Ad9a66Cc";
const STAKING_VAULT = "0x19ebb35279A16207Ec4ba82799CC64715065F7F6";
const USDC          = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const NAV_ORACLE    = "0xdF4ab20fA7752Be52E41e42F1FD667f37964d6a3";
const NAV_FEED_ID   = "0x000700f43b35146a1cb16373ac6225ad597535e928e6dc4d179c3b4225f2b6d3";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("\n🔧 COMPLETE MAINNET SETUP");
  console.log("=".repeat(60));
  console.log("Deployer:     ", deployer.address);
  console.log("YieldVault:   ", YIELD_VAULT);
  console.log("StakingVault: ", STAKING_VAULT);

  const yieldVault   = await ethers.getContractAt("YieldVault", YIELD_VAULT);
  const stakingVault = await ethers.getContractAt("StakingVault", STAKING_VAULT);
  const usdc         = await ethers.getContractAt("IERC20", USDC);

  // ── YieldVault roles ──────────────────────────────────────────
  console.log("\n[1/3] Setting up YieldVault roles...");

  const FREEZE_ADMIN_ROLE     = await yieldVault.FREEZE_ADMIN_ROLE();
  const REWARDS_ADMIN_ROLE    = await yieldVault.REWARDS_ADMIN_ROLE();
  const WHITELIST_ADMIN_ROLE  = await yieldVault.WHITELIST_ADMIN_ROLE();
  const WITHDRAWAL_ADMIN_ROLE = await yieldVault.WITHDRAWAL_ADMIN_ROLE();

  await (await yieldVault.grantRole(FREEZE_ADMIN_ROLE, deployer.address)).wait();
  console.log("  ✅ FREEZE_ADMIN_ROLE     →", deployer.address);

  await (await yieldVault.grantRole(REWARDS_ADMIN_ROLE, deployer.address)).wait();
  console.log("  ✅ REWARDS_ADMIN_ROLE    →", deployer.address);

  await (await yieldVault.grantRole(REWARDS_ADMIN_ROLE, STAKING_VAULT)).wait();
  console.log("  ✅ REWARDS_ADMIN_ROLE    → StakingVault");

  await (await yieldVault.grantRole(WHITELIST_ADMIN_ROLE, deployer.address)).wait();
  console.log("  ✅ WHITELIST_ADMIN_ROLE  →", deployer.address);

  await (await yieldVault.grantRole(WITHDRAWAL_ADMIN_ROLE, deployer.address)).wait();
  console.log("  ✅ WITHDRAWAL_ADMIN_ROLE →", deployer.address);

  // ── StakingVault roles ────────────────────────────────────────
  console.log("\n[2/3] Setting up StakingVault roles...");

  const STAKING_FREEZE_ADMIN_ROLE   = await stakingVault.FREEZE_ADMIN_ROLE();
  const STAKING_REWARDS_ADMIN_ROLE  = await stakingVault.REWARDS_ADMIN_ROLE();
  const NAV_ORACLE_UPDATER_ROLE     = await stakingVault.NAV_ORACLE_UPDATER_ROLE();

  await (await stakingVault.grantRole(STAKING_FREEZE_ADMIN_ROLE, deployer.address)).wait();
  console.log("  ✅ FREEZE_ADMIN_ROLE        →", deployer.address);

  await (await stakingVault.grantRole(STAKING_REWARDS_ADMIN_ROLE, deployer.address)).wait();
  console.log("  ✅ REWARDS_ADMIN_ROLE       →", deployer.address);

  await (await stakingVault.grantRole(NAV_ORACLE_UPDATER_ROLE, deployer.address)).wait();
  console.log("  ✅ NAV_ORACLE_UPDATER_ROLE  →", deployer.address);

  // ── navOracle + USDC approve ──────────────────────────────────
  console.log("\n[3/3] Wiring oracle and USDC approval...");

  await (await stakingVault.setNavOracle(NAV_ORACLE, NAV_FEED_ID)).wait();
  console.log("  ✅ navOracle set to", NAV_ORACLE);

  await (await usdc.approve(YIELD_VAULT, ethers.MaxUint256)).wait();
  console.log("  ✅ USDC MaxUint256 approved for YieldVault");

  // ── Verify names ──────────────────────────────────────────────
  console.log("\n📋 Verification:");
  console.log("  YieldVault  name():", await yieldVault.name());
  console.log("  YieldVault  symbol():", await yieldVault.symbol());
  console.log("  StakingVault name():", await stakingVault.name());
  console.log("  StakingVault symbol():", await stakingVault.symbol());
  console.log("  navOracle:", await stakingVault.navOracle());

  // ── Save artifact ─────────────────────────────────────────────
  const fs = await import("fs");
  const { upgrades } = await import("hardhat");
  const net = await ethers.provider.getNetwork();

  const yieldImpl   = await upgrades.erc1967.getImplementationAddress(YIELD_VAULT);
  const stakingImpl = await upgrades.erc1967.getImplementationAddress(STAKING_VAULT);

  const artifact = {
    network: "mainnet",
    chainId: net.chainId.toString(),
    deployedAt: new Date().toISOString(),
    contracts: {
      usdc: USDC,
      yieldVault: YIELD_VAULT,
      yieldVaultImplementation: yieldImpl,
      stakingVault: STAKING_VAULT,
      stakingVaultImplementation: stakingImpl,
      navOracle: NAV_ORACLE,
      navFeedId: NAV_FEED_ID,
    },
    roles: {
      admin: deployer.address,
      redeemVault: deployer.address,
      freezeAdmin: deployer.address,
      rewardsAdmin: deployer.address,
      whitelistAdmin: deployer.address,
      withdrawalAdmin: deployer.address,
      navOracleUpdater: deployer.address,
    },
  };

  fs.writeFileSync("deployment_mainnet.json", JSON.stringify(artifact, null, 2));
  console.log("\n✅ deployment_mainnet.json saved.");

  // ── Etherscan verification ────────────────────────────────────
  if (process.env.ETHERSCAN_API_KEY) {
    const { run } = await import("hardhat");
    console.log("\n⏳ Waiting 30 seconds before verification...");
    await new Promise(resolve => setTimeout(resolve, 30000));
    console.log("🔍 Verifying implementations on Etherscan...");

    for (const [name, implAddr] of [["YieldVault", yieldImpl], ["StakingVault", stakingImpl]]) {
      try {
        await run("verify:verify", { address: implAddr });
        console.log(`  ✅ ${name} implementation verified: ${implAddr}`);
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        if (msg.includes("Already Verified")) {
          console.log(`  ℹ️  ${name} already verified`);
        } else {
          console.log(`  ⚠️  ${name} verification failed:`, msg);
        }
      }
    }
  } else {
    console.log("\n⚠️  ETHERSCAN_API_KEY not set — skipping verification.");
  }

  console.log("=".repeat(60));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
