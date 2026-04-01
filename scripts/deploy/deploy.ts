/**
 * [DEPLOY] Deploy the full Hastra Vault Protocol (MockUSDC, YieldVault, StakingVault).
 * Sets up all roles and approvals for the configured network.
 *
 * Usage:
 *   npx hardhat run scripts/deploy/deploy.ts --network sepolia
 *   npx hardhat run scripts/deploy/deploy.ts --network hoodi
 *   DRY_RUN=true npx hardhat run scripts/deploy/deploy.ts --network sepolia
 *
 * Optional env vars: USDC_ADDRESS, REDEEM_VAULT_ADDRESS, FREEZE_ADMIN_ADDRESS,
 *   REWARDS_ADMIN_ADDRESS, WHITELIST_ADMIN_ADDRESS, WITHDRAWAL_ADMIN_ADDRESS,
 *   NAV_ORACLE_UPDATER_ADDRESS
 */
// @ts-ignore
import {ethers, upgrades, network, run} from "hardhat";
import * as fs from "fs";

/**
 * Deploy script for Hastra Vault Protocol
 * 
 * Deployment order:
 * 1. MockUSDC (or use existing USDC on mainnet)
 * 2. YieldVault (wYLDS)
 * 3. StakingVault (PRIME)
 * 4. Setup roles and permissions
 */
async function main() {
  const [deployer, ...otherSigners] = await ethers.getSigners();
  const isDryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "true";

  if (isDryRun) {
    console.log("\n⚠️  DRY RUN MODE: No contracts will be deployed or transactions sent ⚠️\n");
  }
  
  // Use env vars if specified, then dedicated signers if available, otherwise fallback to deployer
  const redeemVaultAddress = process.env.REDEEM_VAULT_ADDRESS ?? otherSigners[0]?.address ?? deployer.address;
  const freezeAdminAddress = process.env.FREEZE_ADMIN_ADDRESS ?? otherSigners[1]?.address ?? deployer.address;
  const rewardsAdminAddress = process.env.REWARDS_ADMIN_ADDRESS ?? otherSigners[2]?.address ?? deployer.address;
  const whitelistAdminAddress = process.env.WHITELIST_ADMIN_ADDRESS ?? otherSigners[3]?.address ?? deployer.address;
  const withdrawalAdminAddress = process.env.WITHDRAWAL_ADMIN_ADDRESS ?? otherSigners[4]?.address ?? deployer.address;
  const navOracleUpdaterAddress = process.env.NAV_ORACLE_UPDATER_ADDRESS ?? deployer.address;

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
  
  console.log("\nRole Addresses:");
  console.log("  Redeem Vault:", redeemVaultAddress);
  console.log("  Freeze Admin:", freezeAdminAddress);
  console.log("  Rewards Admin:", rewardsAdminAddress);
  console.log("  Whitelist Admin:", whitelistAdminAddress);
  console.log("  Withdrawal Admin:", withdrawalAdminAddress);
  console.log("  Nav Oracle Updater:", navOracleUpdaterAddress);

  // ============ Deploy USDC (or use existing) ============
  
  let usdcAddress: string;
  const providerNetwork = await ethers.provider.getNetwork();
  const isLocalNetwork = network.name === "localhost" || network.name === "hardhat";
  
  // Only use existing USDC on mainnet/production, always deploy fresh for localhost/testing
  if (process.env.USDC_ADDRESS && !isLocalNetwork) {
    // Use existing USDC on mainnet/testnets
    usdcAddress = process.env.USDC_ADDRESS;
    console.log("\nUsing existing USDC at:", usdcAddress);
  } else {
    // Deploy mock USDC for localhost/testing
    if (isLocalNetwork) {
      console.log("\n[Localhost] Deploying fresh MockUSDC...");
    } else {
      console.log("\nDeploying MockUSDC...");
    }
    
    if (isDryRun) {
        console.log("[Dry Run] Would deploy MockUSDC");
        console.log("[Dry Run] Would mint 1,000,000 USDC to deployer");
        usdcAddress = "0x0000000000000000000000000000000000000001"; // Dummy address
    } else {
        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        const usdc = await MockUSDC.deploy();
        await usdc.waitForDeployment();
        usdcAddress = await usdc.getAddress();
        console.log("MockUSDC deployed to:", usdcAddress);
        
        // Mint some USDC for testing
        const mintTx = await usdc.mint(deployer.address, ethers.parseUnits("1000000", 6)); // 1M USDC
        await mintTx.wait();
        console.log("Minted 1,000,000 USDC to deployer");
    }
  }

  // ============ Deploy YieldVault (wYLDS) ============
  
  console.log("\nDeploying YieldVault...");
  const initialWhitelistAddress = process.env.INITIAL_WHITELIST_ADDRESS || ethers.ZeroAddress;
  if (initialWhitelistAddress !== ethers.ZeroAddress) {
    console.log("Setting initial whitelist address:", initialWhitelistAddress);
  }

  let yieldVaultAddress: string;
  let yieldVault: any;

  if (isDryRun) {
      console.log("[Dry Run] Would deploy YieldVault (UUPS Proxy) with args:");
      console.log(`  - Asset: ${usdcAddress}`);
      console.log(`  - Name: "Wrapped YLDS"`);
      console.log(`  - Symbol: "wYLDS"`);
      console.log(`  - Admin: ${deployer.address}`);
      console.log(`  - RedeemVault: ${redeemVaultAddress}`);
      console.log(`  - InitialWhitelist: ${initialWhitelistAddress}`);
      yieldVaultAddress = "0x0000000000000000000000000000000000000002"; // Dummy
  } else {
      const YieldVault = await ethers.getContractFactory("YieldVault");
      yieldVault = await upgrades.deployProxy(YieldVault, [
        usdcAddress,
        "Wrapped YLDS",
        "wYLDS",
        deployer.address, // admin
        redeemVaultAddress, // redeem vault address
        initialWhitelistAddress // initial whitelist address
      ], { kind: 'uups' });
      await yieldVault.waitForDeployment();
      yieldVaultAddress = await yieldVault.getAddress();
      console.log("YieldVault (Proxy) deployed to:", yieldVaultAddress);
  }

  // ============ Deploy StakingVault (PRIME) ============
  
  console.log("\nDeploying StakingVault...");
    
  let stakingVaultAddress: string;
  let stakingVault: any;

  if (isDryRun) {
      console.log("[Dry Run] Would deploy StakingVault with args:");
      console.log(`  - Asset: ${yieldVaultAddress}`);
      console.log(`  - Name: "Prime Staked YLDS"`);
      console.log(`  - Symbol: "PRIME"`);
      console.log(`  - Admin: ${deployer.address}`);
      console.log(`  - YieldVault: ${yieldVaultAddress}`);
      stakingVaultAddress = "0x0000000000000000000000000000000000000003"; // Dummy
  } else {
      const StakingVault = await ethers.getContractFactory("StakingVault");
      stakingVault = await upgrades.deployProxy(StakingVault, [
        yieldVaultAddress, // asset
        "Prime Staked YLDS", // name
        "PRIME", // symbol
        deployer.address, // admin
        yieldVaultAddress // yieldVault address
      ], { kind: 'uups' });
      await stakingVault.waitForDeployment();
      stakingVaultAddress = await stakingVault.getAddress();
      console.log("StakingVault (Proxy) deployed to:", stakingVaultAddress);
  }

  // ============ Setup Roles for YieldVault ============
  
  // Note: While initialize() auto-grants all roles to the admin for convenience,
  // we explicitly grant roles here to support role separation in production.
  // This allows different addresses to hold different roles (e.g., separate
  // FREEZE_ADMIN, REWARDS_ADMIN, WHITELIST_ADMIN, WITHDRAWAL_ADMIN).
  // The admin can then revoke their own roles if desired for security.

  console.log("\nSetting up YieldVault roles...");

  if (isDryRun) {
      console.log(`[Dry Run] Would grant FREEZE_ADMIN_ROLE to ${freezeAdminAddress}`);
      console.log(`[Dry Run] Would grant REWARDS_ADMIN_ROLE to ${rewardsAdminAddress}`);
      console.log(`[Dry Run] Would grant REWARDS_ADMIN_ROLE to StakingVault (${stakingVaultAddress})`);
      console.log(`[Dry Run] Would grant WHITELIST_ADMIN_ROLE to ${whitelistAdminAddress}`);
      console.log(`[Dry Run] Would grant WITHDRAWAL_ADMIN_ROLE to ${withdrawalAdminAddress}`);
  } else {
      // Grant freeze admin role
      const FREEZE_ADMIN_ROLE = await yieldVault.FREEZE_ADMIN_ROLE();
      const tx1 = await yieldVault.grantRole(FREEZE_ADMIN_ROLE, freezeAdminAddress);
      await tx1.wait();
      console.log("Granted FREEZE_ADMIN_ROLE to:", freezeAdminAddress);

      // Grant rewards admin role to rewardsAdmin
      const REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
      const tx2 = await yieldVault.grantRole(REWARDS_ADMIN_ROLE, rewardsAdminAddress);
      await tx2.wait();
      console.log("Granted REWARDS_ADMIN_ROLE to:", rewardsAdminAddress);

      // Grant rewards admin role to StakingVault so it can mint wYLDS
      const tx3 = await yieldVault.grantRole(REWARDS_ADMIN_ROLE, stakingVaultAddress);
      await tx3.wait();
      console.log("Granted REWARDS_ADMIN_ROLE to StakingVault:", stakingVaultAddress);

      // Grant whitelist admin role
      const WHITELIST_ADMIN_ROLE = await yieldVault.WHITELIST_ADMIN_ROLE();
      const txWh = await yieldVault.grantRole(WHITELIST_ADMIN_ROLE, whitelistAdminAddress);
      await txWh.wait();
      console.log("Granted WHITELIST_ADMIN_ROLE to:", whitelistAdminAddress);

      // Grant withdrawal admin role
      const WITHDRAWAL_ADMIN_ROLE = await yieldVault.WITHDRAWAL_ADMIN_ROLE();
      const txWd = await yieldVault.grantRole(WITHDRAWAL_ADMIN_ROLE, withdrawalAdminAddress);
      await txWd.wait();
      console.log("Granted WITHDRAWAL_ADMIN_ROLE to:", withdrawalAdminAddress);
  }

  // ============ Setup Roles for StakingVault ============
  
  // Note: Same as YieldVault - we manually grant roles here to allow
  // separation of duties in production deployments.
  
  console.log("\nSetting up StakingVault roles...");
  
  if (isDryRun) {
      console.log(`[Dry Run] Would grant FREEZE_ADMIN_ROLE to ${freezeAdminAddress}`);
      console.log(`[Dry Run] Would grant REWARDS_ADMIN_ROLE to ${rewardsAdminAddress}`);
      console.log(`[Dry Run] Would grant NAV_ORACLE_UPDATER_ROLE to ${navOracleUpdaterAddress}`);
  } else {
      // Grant freeze admin role
      const STAKING_FREEZE_ADMIN_ROLE = await stakingVault.FREEZE_ADMIN_ROLE();
      const tx4 = await stakingVault.grantRole(STAKING_FREEZE_ADMIN_ROLE, freezeAdminAddress);
      await tx4.wait();
      console.log("Granted FREEZE_ADMIN_ROLE to:", freezeAdminAddress);
      
      // Grant rewards admin role
      const STAKING_REWARDS_ADMIN_ROLE = await stakingVault.REWARDS_ADMIN_ROLE();
      const tx5 = await stakingVault.grantRole(STAKING_REWARDS_ADMIN_ROLE, rewardsAdminAddress);
      await tx5.wait();
      console.log("Granted REWARDS_ADMIN_ROLE to:", rewardsAdminAddress);

      // Grant nav oracle updater role
      const NAV_ORACLE_UPDATER_ROLE = await stakingVault.NAV_ORACLE_UPDATER_ROLE();
      const tx6 = await stakingVault.grantRole(NAV_ORACLE_UPDATER_ROLE, navOracleUpdaterAddress);
      await tx6.wait();
      console.log("Granted NAV_ORACLE_UPDATER_ROLE to:", navOracleUpdaterAddress);
  }

  // ============ Setup Approvals ============
  
  console.log("\nSetting up approvals...");
  
  // Reuse network variable from earlier
  const isMainnet = providerNetwork.chainId === 1n;
  
  if (!process.env.USDC_ADDRESS) {
    if (isDryRun) {
        if (redeemVaultAddress !== deployer.address) {
            console.log(`[Dry Run] Would transfer 100,000 USDC to redeem vault (${redeemVaultAddress})`);
        }
        console.log(`[Dry Run] Would approve YieldVault (${yieldVaultAddress}) for USDC`);
    } else {
        // Using MockUSDC - can mint and transfer freely
        const usdc = await ethers.getContractAt("MockUSDC", usdcAddress);
        const maxApproval = ethers.MaxUint256;
        
        // Transfer some USDC to redeem vault for testing (skip if deployer is redeemVault)
        if (redeemVaultAddress !== deployer.address) {
          const tx6 = await usdc.transfer(redeemVaultAddress, ethers.parseUnits("100000", 6));
          await tx6.wait();
          console.log("Transferred 100,000 USDC to redeem vault");
        }
        
        // Deployer approves YieldVault for USDC
        const tx7 = await usdc.approve(yieldVaultAddress, maxApproval);
        await tx7.wait();
        console.log("Deployer approved YieldVault for USDC");
    }
  } else if (isMainnet) {
    console.log("Using existing USDC at:", usdcAddress);
    if (isDryRun) {
        console.log(`[Dry Run] Would check USDC balance of ${deployer.address}`);
        console.log(`[Dry Run] If balance > 0, would approve YieldVault (${yieldVaultAddress}) for USDC`);
    } else {
        // Mainnet with existing USDC - do approvals
        const usdc = await ethers.getContractAt("IERC20", usdcAddress);
        const maxApproval = ethers.MaxUint256;
        
        const balance = await usdc.balanceOf(deployer.address);
        console.log("Deployer USDC balance:", ethers.formatUnits(balance, 6));
        
        if (balance > 0n) {
          const tx7 = await usdc.approve(yieldVaultAddress, maxApproval);
          await tx7.wait();
          console.log("Deployer approved YieldVault for USDC");
        } else {
          console.log("No USDC balance - skipping approval");
        }
    }
  } else {
    // Testnet with existing USDC - skip approvals
    console.log("Using existing USDC at:", usdcAddress);
    console.log("Testnet detected - skipping automatic approvals");
  }

  // ============ Deployment Summary ============
  
  console.log("\n========================================");
  console.log("DEPLOYMENT SUMMARY");
  console.log("========================================");
  console.log("USDC Address:", usdcAddress);
  console.log("YieldVault (wYLDS):", yieldVaultAddress);
  console.log("StakingVault (PRIME):", stakingVaultAddress);
  console.log("\nRole Addresses:");
  console.log("  Admin:", deployer.address);
  console.log("  Redeem Vault:", redeemVaultAddress);
  console.log("  Freeze Admin:", freezeAdminAddress);
  console.log("  Rewards Admin:", rewardsAdminAddress);
  console.log("  Whitelist Admin:", whitelistAdminAddress);
  console.log("  Withdrawal Admin:", withdrawalAdminAddress);
  console.log("========================================");

  if (isDryRun) {
      console.log("\n[Dry Run] Deployment info NOT saved to file.");
      return;
  }

  // ============ Save Deployment Info ============
  
  const networkName = network.name;
  // Default to deployment.json for local/mainnet (gitignored)
  let filename = "deployment.json";
  
  // Check if network is a testnet
  if (["sepolia", "hoodi", "goerli", "testnet"].includes(networkName)) {
    filename = `deployment_testnet_${networkName}.json`;
  }

  const deploymentInfo = {
    network: networkName,
    chainId: providerNetwork.chainId.toString(),
    timestamp: new Date().toISOString(),
    contracts: {
      usdc: usdcAddress,
      yieldVault: yieldVaultAddress,
      stakingVault: stakingVaultAddress,
    },
    transactions: {
      usdc: !process.env.USDC_ADDRESS ? (await (await ethers.getContractAt("MockUSDC", usdcAddress)).deploymentTransaction())?.hash : "existing",
      yieldVault: (await yieldVault.deploymentTransaction())?.hash,
      stakingVault: (await stakingVault.deploymentTransaction())?.hash,
    },
    roles: {
      admin: deployer.address,
      redeemVault: redeemVaultAddress,
      freezeAdmin: freezeAdminAddress,
      rewardsAdmin: rewardsAdminAddress,
      whitelistAdmin: whitelistAdminAddress,
      withdrawalAdmin: withdrawalAdminAddress,
    },
    config: {
      // unbondingPeriod removed
    },
  };

  console.log(`\nDeployment info saved to ${filename}`);
  
  // Save deployment info to file
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));

  // ============ Verify Contracts ============

  if (network.name !== "localhost" && network.name !== "hardhat") {
    console.log("\n⏳ Waiting 30 seconds before verification...");
    await new Promise(resolve => setTimeout(resolve, 30000));
    console.log("\n🔍 Verifying contracts on block explorer...");

    for (const [name, proxyAddress] of [["YieldVault", yieldVaultAddress], ["StakingVault", stakingVaultAddress]]) {
      try {
        console.log(`  Resolving ${name} implementation for proxy at ${proxyAddress}...`);
        const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
        console.log(`  Verifying ${name} implementation at ${implementationAddress}...`);
        await run("verify:verify", { address: implementationAddress });
        console.log(`  ✅ ${name} implementation verified!`);
      } catch (error: any) {
        const message = error?.message ?? String(error);
        if (message.includes("Already Verified")) {
          console.log(`  ℹ️  ${name} implementation already verified`);
        } else {
          console.log(`  ⚠️  ${name} implementation verification failed:`, message);
        }
      }
    }
  }

  return deploymentInfo;
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
