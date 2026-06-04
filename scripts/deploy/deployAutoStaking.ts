/**
 * [DEPLOY] Deploy an AutoStakingVault instance (UUPS proxy).
 *
 * This file is BOTH a runnable entry-point (deploys with AUTO defaults) AND
 * the shared implementation imported by token-specific wrappers like
 * scripts/deploy/deploySMB.ts.
 *
 * Run directly for AUTO:
 *   npx hardhat run scripts/deploy/deployAutoStaking.ts --network sepolia
 *   DRY_RUN=true npx hardhat run scripts/deploy/deployAutoStaking.ts --network sepolia
 *
 * Required env vars (testnet/mainnet):
 *   USDC_ADDRESS            - Address of the underlying USDC token
 *   YIELD_VAULT_ADDRESS     - Address of an already-deployed YieldVault proxy
 *
 * Optional env vars:
 *   FREEZE_ADMIN_ADDRESS    - Who can freeze/thaw accounts (defaults to deployer)
 *   REWARDS_ADMIN_ADDRESS   - Who can call distributeRewards (defaults to deployer)
 *   NAV_ORACLE_UPDATER_ADDRESS - Who can call setNavOracle (defaults to deployer)
 *   AUTO_TOKEN_NAME         - Name of the staked token (default: "AUTO")
 *   AUTO_TOKEN_SYMBOL       - Symbol of the staked token (default: "AUTO")
 *
 * Wrappers (deploySMB.ts) supply a different envPrefix ("SMB") so the same
 * env var pattern applies under SMB_TOKEN_NAME / SMB_TOKEN_SYMBOL.
 */
// @ts-ignore
import { ethers, upgrades, run } from "hardhat";
import * as fs from "fs";

export interface DeployAutoStakingOptions {
  /** Env-var prefix used to read TOKEN_NAME / TOKEN_SYMBOL overrides. e.g. "AUTO" or "SMB". */
  envPrefix: string;
  /** Default ERC20 name if {envPrefix}_TOKEN_NAME is not set. */
  defaultName: string;
  /** Default ERC20 symbol if {envPrefix}_TOKEN_SYMBOL is not set. */
  defaultSymbol: string;
  /** Output deployment-file suffix: writes deployment_{outputSuffix}_{network}.json */
  outputSuffix: string;
  /** Label used in console summary (e.g. "AutoStakingVault — AUTO"). */
  label?: string;
  /**
   * Solidity contract name to deploy (must be a thin subclass of StakingVault).
   * Defaults to "AutoStakingVault" to preserve backwards compatibility.
   * Wrappers like deploySMB.ts pass "SMBStakingVault" here so the on-chain
   * identity and block-explorer label match the brand.
   */
  contractName?: string;
  /**
   * Fully-qualified source path used to disambiguate Etherscan verification.
   * Required when the chosen contract has identical bytecode to another
   * contract in the codebase (which all StakingVault subclasses do).
   * Defaults to "contracts/AutoStakingVault.sol:AutoStakingVault".
   */
  verifyContract?: string;
}

export async function deployAutoStakingInstance(opts: DeployAutoStakingOptions): Promise<void> {
  const [deployer] = await ethers.getSigners();
  const isDryRun = process.env.DRY_RUN === "true";
  const contractName = opts.contractName ?? "AutoStakingVault";
  const verifyContract = opts.verifyContract ?? `contracts/${contractName}.sol:${contractName}`;
  const label = opts.label ?? `${contractName} — ${opts.envPrefix}`;

  if (isDryRun) {
    console.log("\n⚠️  DRY RUN MODE: No contracts will be deployed or transactions sent ⚠️\n");
  }

  const freezeAdminAddress = process.env.FREEZE_ADMIN_ADDRESS ?? deployer.address;
  const rewardsAdminAddress = process.env.REWARDS_ADMIN_ADDRESS ?? deployer.address;
  const navOracleUpdaterAddress = process.env.NAV_ORACLE_UPDATER_ADDRESS ?? deployer.address;
  const tokenName = process.env[`${opts.envPrefix}_TOKEN_NAME`] ?? opts.defaultName;
  const tokenSymbol = process.env[`${opts.envPrefix}_TOKEN_SYMBOL`] ?? opts.defaultSymbol;

  console.log(`Deploying: ${label}`);
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

  if (process.env.YIELD_VAULT_ADDRESS) {
    yieldVaultAddress = process.env.YIELD_VAULT_ADDRESS;
    console.log("\nUsing existing YieldVault at:", yieldVaultAddress);
  } else if (!isLocalNetwork) {
    // On sepolia / mainnet we MUST be pointed at a real, pre-existing YieldVault.
    // Falling back to deploying MockUSDC + a fresh YieldVault on a live network
    // would burn collateral, fragment vault ownership, and is almost certainly a
    // mistake — fail fast instead.
    throw new Error(
      `YIELD_VAULT_ADDRESS is required on network "${network.name}". ` +
        `Refusing to silently deploy MockUSDC + a fresh YieldVault on a non-local chain.`
    );
  } else {
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
        deployer.address,
        ethers.ZeroAddress,
      ], { kind: "uups" });
      await yieldVault.waitForDeployment();
      yieldVaultAddress = await yieldVault.getAddress();
      console.log("YieldVault deployed to:", yieldVaultAddress);
    }
  }

  // ============ Deploy AutoStakingVault ============

  console.log(`\nDeploying ${contractName} (${tokenSymbol})...`);

  let autoVaultAddress: string;
  let autoVault: any;

  if (isDryRun) {
    console.log(`[Dry Run] Would deploy ${contractName} (UUPS Proxy) with args:`);
    console.log(`  - Asset (wYLDS): ${yieldVaultAddress}`);
    console.log(`  - Name: "${tokenName}"`);
    console.log(`  - Symbol: "${tokenSymbol}"`);
    console.log(`  - Admin: ${deployer.address}`);
    console.log(`  - YieldVault: ${yieldVaultAddress}`);
    autoVaultAddress = "0x0000000000000000000000000000000000000002";
  } else {
    const VaultFactory = await ethers.getContractFactory(contractName);
    autoVault = await upgrades.deployProxy(VaultFactory, [
      yieldVaultAddress,
      tokenName,
      tokenSymbol,
      deployer.address,
      yieldVaultAddress,
    ], { kind: "uups" });
    await autoVault.waitForDeployment();
    autoVaultAddress = await autoVault.getAddress();
    console.log(`${contractName} (Proxy) deployed to:`, autoVaultAddress);
  }

  // ============ Setup Roles ============

  console.log("\nSetting up roles...");

  if (isDryRun) {
    console.log(`[Dry Run] Would grant FREEZE_ADMIN_ROLE to ${freezeAdminAddress}`);
    console.log(`[Dry Run] Would grant REWARDS_ADMIN_ROLE to ${rewardsAdminAddress}`);
    console.log(`[Dry Run] Would grant NAV_ORACLE_UPDATER_ROLE to ${navOracleUpdaterAddress}`);
    console.log(`[Dry Run] YieldVault REWARDS_ADMIN_ROLE grant is deferred to scripts/admin/grant_yield_vault_rewards_admin.ts (must be run by current YV DEFAULT_ADMIN, typically a Safe).`);
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

    // NOTE: YieldVault.REWARDS_ADMIN_ROLE grant is intentionally NOT performed
    // here. On any non-local network the YieldVault DEFAULT_ADMIN is held by a
    // Safe (or other multi-sig), not the deployer EOA. The grant is handled by
    // a dedicated follow-up script that prints Safe-ready calldata or executes
    // directly if the caller holds DEFAULT_ADMIN:
    //
    //   YIELD_VAULT_ADDRESS=<yv> VAULT_ADDRESS=<new-vault> \
    //     npx hardhat run scripts/admin/grant_yield_vault_rewards_admin.ts \
    //     --network <network>
    console.log(
      `\nℹ️  YieldVault.REWARDS_ADMIN_ROLE grant deferred to follow-up script.\n` +
      `   Run (or have YV admin / Safe run):\n` +
      `     YIELD_VAULT_ADDRESS=${yieldVaultAddress} \\\n` +
      `     VAULT_ADDRESS=${autoVaultAddress} \\\n` +
      `       npx hardhat run scripts/admin/grant_yield_vault_rewards_admin.ts --network ${network.name}`
    );
  }

  // ============ Summary ============

  console.log("\n========================================");
  console.log(`DEPLOYMENT SUMMARY — ${label}`);
  console.log("========================================");
  console.log("Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("YieldVault (wYLDS):", yieldVaultAddress);
  console.log(`${contractName} (Proxy):`, autoVaultAddress);
  console.log("Token Name:", tokenName);
  console.log("Token Symbol:", tokenSymbol);
  console.log("\nRole Addresses:");
  console.log("  Admin:", deployer.address);
  console.log("  Freeze Admin:", freezeAdminAddress);
  console.log("  Rewards Admin:", rewardsAdminAddress);
  console.log("  Nav Oracle Updater:", navOracleUpdaterAddress);
  console.log("\nNAV Oracle: not configured.");
  console.log("  → Call setNavOracle(feedVerifierAddress, feedId) before first deposit.");
  console.log("========================================");

  if (isDryRun) {
    console.log("\n[Dry Run] Deployment info NOT saved to file.");
    return;
  }

  // ============ Save Deployment Info ============

  const outputFile = `deployment_${opts.outputSuffix}_${network.name}.json`;
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

  // ============ Verify Contracts ============

  if (network.name !== "localhost" && network.name !== "hardhat") {
    console.log("\n⏳ Waiting 30 seconds before verification...");
    await new Promise(resolve => setTimeout(resolve, 30000));
    console.log(`\n🔍 Verifying ${contractName} on block explorer...`);
    try {
      // NOTE: @openzeppelin/hardhat-upgrades overrides `verify:verify` to detect
      // an ERC1967 proxy, resolve its implementation, and verify the impl source.
      // We pass the PROXY address on purpose — the plugin extracts the impl.
      // Disambiguate from StakingVault — every StakingVault subclass produces
      // identical bytecode; Etherscan can't auto-detect which source to use.
      await run("verify:verify", {
        address: autoVaultAddress,
        constructorArguments: [],
        contract: verifyContract,
      });
      console.log(`  ✅ ${contractName} verified!`);
    } catch (error: any) {
      if (error.message.includes("Already Verified")) {
        console.log("  ℹ️  Already verified");
      } else if (error.message.includes("rate limit")) {
        console.log("  ⚠️  Etherscan rate limit — retry manually:");
        console.log(`     npx hardhat verify --contract ${verifyContract} \\`);
        console.log(`       --network ${network.name} ${autoVaultAddress}`);
      } else {
        console.log("  ⚠️  Verification failed:", error.message);
      }
    }
  }
}

// ============ AUTO entry-point ============

async function main() {
  await deployAutoStakingInstance({
    envPrefix: "AUTO",
    defaultName: "AUTO",
    defaultSymbol: "AUTO",
    outputSuffix: "auto_staking",
    label: "AutoStakingVault — AUTO",
  });
}

// Only auto-run when invoked directly (not when imported by deploySMB.ts).
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
