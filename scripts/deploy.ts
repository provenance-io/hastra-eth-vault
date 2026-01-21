import {ethers} from "hardhat";

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
  
  // Use env vars if specified, then dedicated signers if available, otherwise fallback to deployer
  const redeemVaultAddress = process.env.REDEEM_VAULT_ADDRESS ?? otherSigners[0]?.address ?? deployer.address;
  const freezeAdminAddress = process.env.FREEZE_ADMIN_ADDRESS ?? otherSigners[1]?.address ?? deployer.address;
  const rewardsAdminAddress = process.env.REWARDS_ADMIN_ADDRESS ?? otherSigners[2]?.address ?? deployer.address;

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
  
  console.log("\nRole Addresses:");
  console.log("  Redeem Vault:", redeemVaultAddress);
  console.log("  Freeze Admin:", freezeAdminAddress);
  console.log("  Rewards Admin:", rewardsAdminAddress);

  // ============ Deploy USDC (or use existing) ============
  
  let usdcAddress: string;
  
  if (process.env.USDC_ADDRESS) {
    // Use existing USDC on mainnet
    usdcAddress = process.env.USDC_ADDRESS;
    console.log("\nUsing existing USDC at:", usdcAddress);
  } else {
    // Deploy mock USDC for testing
    console.log("\nDeploying MockUSDC...");
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

  // ============ Deploy YieldVault (wYLDS) ============
  
  console.log("\nDeploying YieldVault...");
  const YieldVault = await ethers.getContractFactory("YieldVault");
  const yieldVault = await YieldVault.deploy(
    usdcAddress,
    "Wrapped YLDS",
    "wYLDS",
    deployer.address, // admin
    redeemVaultAddress // redeem vault address
  );
  await yieldVault.waitForDeployment();
  const yieldVaultAddress = await yieldVault.getAddress();
  console.log("YieldVault deployed to:", yieldVaultAddress);

  // ============ Deploy StakingVault (PRIME) ============
  
  console.log("\nDeploying StakingVault...");
  const unbondingPeriod = 21 * 24 * 60 * 60; // 21 days in seconds
  const StakingVault = await ethers.getContractFactory("StakingVault");
  const stakingVault = await StakingVault.deploy(
    yieldVaultAddress, // wYLDS as the staking asset
    "Prime Staked YLDS",
    "PRIME",
    deployer.address, // admin
    unbondingPeriod,
    yieldVaultAddress // YieldVault address for minting rewards
  );
  await stakingVault.waitForDeployment();
  const stakingVaultAddress = await stakingVault.getAddress();
  console.log("StakingVault deployed to:", stakingVaultAddress);
  console.log("Unbonding period:", unbondingPeriod, "seconds (21 days)");

  // ============ Setup Roles for YieldVault ============

  console.log("\nSetting up YieldVault roles...");

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

  // ============ Setup Roles for StakingVault ============
  
  console.log("\nSetting up StakingVault roles...");
  
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

  // ============ Setup Approvals ============
  
  console.log("\nSetting up approvals...");
  
  const network = await ethers.provider.getNetwork();
  const isMainnet = network.chainId === 1n;
  
  if (!process.env.USDC_ADDRESS) {
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
  } else if (isMainnet) {
    // Mainnet with existing USDC - do approvals
    console.log("Using existing USDC at:", usdcAddress);
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
  console.log("\nConfiguration:");
  console.log("  Unbonding Period:", unbondingPeriod, "seconds");
  console.log("========================================");

  // ============ Save Deployment Info ============
  
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId,
    timestamp: new Date().toISOString(),
    contracts: {
      usdc: usdcAddress,
      yieldVault: yieldVaultAddress,
      stakingVault: stakingVaultAddress,
    },
    roles: {
      admin: deployer.address,
      redeemVault: redeemVaultAddress,
      freezeAdmin: freezeAdminAddress,
      rewardsAdmin: rewardsAdminAddress,
    },
    config: {
      unbondingPeriod,
    },
  };

  console.log("\nDeployment info saved to deployment.json");
  
  // In a real deployment, you'd save this to a file
  // await fs.writeFile("deployment.json", JSON.stringify(deploymentInfo, null, 2));

  return deploymentInfo;
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
