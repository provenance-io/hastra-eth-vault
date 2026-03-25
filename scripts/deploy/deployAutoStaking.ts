/**
 * [DEPLOY] Deploy AutoStakingVault — a StakingVault variant that falls back to the
 * on-chain ERC-4626 ratio when no NAV oracle is configured.
 *
 * Usage:
 *   npx hardhat run scripts/deploy/deployAutoStaking.ts --network sepolia
 *   DRY_RUN=true npx hardhat run scripts/deploy/deployAutoStaking.ts --network sepolia
 *
 * Required env vars (testnet/mainnet):
 *   USDC_ADDRESS            - Address of the underlying USDC token
 *   YIELD_VAULT_ADDRESS     - Address of an already-deployed YieldVault proxy
 *
 * Optional env vars:
 *   FREEZE_ADMIN_ADDRESS    - Who can freeze/thaw staker accounts (defaults to deployer)
 *   REWARDS_ADMIN_ADDRESS   - Who can call distributeRewards (defaults to deployer)
 *   NAV_ORACLE_UPDATER_ADDRESS - Who can call setNavOracle (defaults to deployer)
 *   AUTO_TOKEN_NAME         - Name of the staked token (default: "Auto Staked YLDS")
 *   AUTO_TOKEN_SYMBOL       - Symbol of the staked token (default: "AUTO")
 */
// @ts-ignore
import { ethers, upgrades } from "hardhat";
import * as fs from "fs";

async function main() {
  const [deployer] = await ethers.getSigners();
  const isDryRun = process.env.DRY_RUN === "true";

  if (isDryRun) {
    console.log("\n⚠️  DRY RUN MODE: No contracts will be deployed or transactions sent ⚠️\n");
  }

  const freezeAdminAddress = process.env.FREEZE_ADMIN_ADDRESS ?? deployer.address;
  const rewardsAdminAddress = process.env.REWARDS_ADMIN_ADDRESS ?? deployer.address;
  const navOracleUpdaterAddress = process.env.NAV_ORACLE_UPDATER_ADDRESS ?? deployer.address;
  const tokenName = process.env.AUTO_TOKEN_NAME ?? "AUTO";
  const tokenSymbol = process.env.AUTO_TOKEN_SYMBOL ?? "AUTO";

  console.log("Deployer:", deployer.address);
  console.log("Balance:", (await ethers.provider.getBalance(deployer.address)).toString());
  console.log("\nRole Addresses:");
  console.log("  Freeze Admin:", freezeAdminAddress);
  console.log("  Rewards Admin:", rewardsAdminAddress);
  console.log("  Nav Oracle Updater:", navOracleUpdaterAddress);

  const network = await ethers.provider.getNetwork();
  const isLocalNetwork = network.name === "localhost" || network.name === "hardhat";

  // ============ Resolve YieldVault ============

  let yieldVaultAddress: string;

  if (process.env.YIELD_VAULT_ADDRESS && !isLocalNetwork) {
    yieldVaultAddress = process.env.YIELD_VAULT_ADDRESS;
    console.log("\nUsing existing YieldVault at:", yieldVaultAddress);
  } else {
    // Local: deploy a fresh YieldVault + MockUSDC for convenience
    console.log("\n[Local] Deploying MockUSDC + YieldVault...");

    if (isDryRun) {
      yieldVaultAddress = "0x0000000000000000000000000000000000000001";
    } else {
      const MockUSDC = await ethers.getContractFactory("MockUSDC");
      const usdc = await MockUSDC.deploy();
      await usdc.waitForDeployment();
      const usdcAddress = await usdc.getAddress();
      console.log("MockUSDC deployed to:", usdcAddress);

      await (await usdc.mint(deployer.address, ethers.parseUnits("1000000", 6))).wait();

      const YieldVault = await ethers.getContractFactory("YieldVault");
      const yieldVault = await upgrades.deployProxy(YieldVault, [
        usdcAddress,
        "Wrapped YLDS",
        "wYLDS",
        deployer.address,
        deployer.address, // redeemVault
        ethers.ZeroAddress,
      ], { kind: "uups" });
      await yieldVault.waitForDeployment();
      yieldVaultAddress = await yieldVault.getAddress();
      console.log("YieldVault deployed to:", yieldVaultAddress);
    }
  }

  // ============ Deploy AutoStakingVault ============

  console.log("\nDeploying AutoStakingVault...");

  let autoVaultAddress: string;
  let autoVault: any;

  if (isDryRun) {
    console.log("[Dry Run] Would deploy AutoStakingVault (UUPS Proxy) with args:");
    console.log(`  - Asset (wYLDS): ${yieldVaultAddress}`);
    console.log(`  - Name: "${tokenName}"`);
    console.log(`  - Symbol: "${tokenSymbol}"`);
    console.log(`  - Admin: ${deployer.address}`);
    console.log(`  - YieldVault: ${yieldVaultAddress}`);
    autoVaultAddress = "0x0000000000000000000000000000000000000002";
  } else {
    const AutoStakingVault = await ethers.getContractFactory("AutoStakingVault");
    autoVault = await upgrades.deployProxy(AutoStakingVault, [
      yieldVaultAddress, // asset (wYLDS)
      tokenName,
      tokenSymbol,
      deployer.address, // admin
      yieldVaultAddress, // yieldVault for reward minting
    ], { kind: "uups" });
    await autoVault.waitForDeployment();
    autoVaultAddress = await autoVault.getAddress();
    console.log("AutoStakingVault (Proxy) deployed to:", autoVaultAddress);
  }

  // ============ Setup Roles ============

  console.log("\nSetting up roles...");

  if (isDryRun) {
    console.log(`[Dry Run] Would grant FREEZE_ADMIN_ROLE to ${freezeAdminAddress}`);
    console.log(`[Dry Run] Would grant REWARDS_ADMIN_ROLE to ${rewardsAdminAddress}`);
    console.log(`[Dry Run] Would grant NAV_ORACLE_UPDATER_ROLE to ${navOracleUpdaterAddress}`);
    console.log(`[Dry Run] Would grant YieldVault REWARDS_ADMIN_ROLE to AutoStakingVault (${autoVaultAddress})`);
  } else {
    const FREEZE_ADMIN_ROLE = await autoVault.FREEZE_ADMIN_ROLE();
    await (await autoVault.grantRole(FREEZE_ADMIN_ROLE, freezeAdminAddress)).wait();
    console.log("Granted FREEZE_ADMIN_ROLE to:", freezeAdminAddress);

    const REWARDS_ADMIN_ROLE = await autoVault.REWARDS_ADMIN_ROLE();
    await (await autoVault.grantRole(REWARDS_ADMIN_ROLE, rewardsAdminAddress)).wait();
    console.log("Granted REWARDS_ADMIN_ROLE to:", rewardsAdminAddress);

    const NAV_ORACLE_UPDATER_ROLE = await autoVault.NAV_ORACLE_UPDATER_ROLE();
    await (await autoVault.grantRole(NAV_ORACLE_UPDATER_ROLE, navOracleUpdaterAddress)).wait();
    console.log("Granted NAV_ORACLE_UPDATER_ROLE to:", navOracleUpdaterAddress);

    // Allow AutoStakingVault to mint wYLDS rewards via YieldVault
    const yieldVaultContract = await ethers.getContractAt("YieldVault", yieldVaultAddress);
    const YIELD_REWARDS_ADMIN = await yieldVaultContract.REWARDS_ADMIN_ROLE();
    await (await yieldVaultContract.grantRole(YIELD_REWARDS_ADMIN, autoVaultAddress)).wait();
    console.log("Granted YieldVault REWARDS_ADMIN_ROLE to AutoStakingVault:", autoVaultAddress);
  }

  // ============ Summary ============

  console.log("\n========================================");
  console.log("DEPLOYMENT SUMMARY — AutoStakingVault");
  console.log("========================================");
  console.log("Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("YieldVault (wYLDS):", yieldVaultAddress);
  console.log("AutoStakingVault (Proxy):", autoVaultAddress);
  console.log("Token Name:", tokenName);
  console.log("Token Symbol:", tokenSymbol);
  console.log("\nRole Addresses:");
  console.log("  Admin:", deployer.address);
  console.log("  Freeze Admin:", freezeAdminAddress);
  console.log("  Rewards Admin:", rewardsAdminAddress);
  console.log("  Nav Oracle Updater:", navOracleUpdaterAddress);
  console.log("\nNAV Oracle: not configured (ERC-4626 ratio fallback active)");
  console.log("  → Call setNavOracle(feedVerifierAddress, feedId) when Chainlink feed is ready.");
  console.log("========================================");

  if (isDryRun) {
    console.log("\n[Dry Run] Deployment info NOT saved to file.");
    return;
  }

  // ============ Save Deployment Info ============

  const outputFile = `deployment_auto_staking_${network.name}.json`;
  const deploymentInfo = {
    network: network.name,
    chainId: network.chainId.toString(),
    deployedAt: new Date().toISOString(),
    yieldVaultAddress,
    autoStakingVaultProxy: autoVaultAddress,
    tokenName,
    tokenSymbol,
    roles: {
      admin: deployer.address,
      freezeAdmin: freezeAdminAddress,
      rewardsAdmin: rewardsAdminAddress,
      navOracleUpdater: navOracleUpdaterAddress,
    },
  };

  fs.writeFileSync(outputFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment info saved to ${outputFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
