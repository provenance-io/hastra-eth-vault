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
  const [deployer, redeemVault, freezeAdmin, rewardsAdmin] = await ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

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
    await usdc.mint(deployer.address, ethers.parseUnits("1000000", 6)); // 1M USDC
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
    redeemVault.address // redeem vault address
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
  await yieldVault.grantRole(FREEZE_ADMIN_ROLE, freezeAdmin.address);
  console.log("Granted FREEZE_ADMIN_ROLE to:", freezeAdmin.address);

  // Grant rewards admin role to rewardsAdmin
  const REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
  await yieldVault.grantRole(REWARDS_ADMIN_ROLE, rewardsAdmin.address);
  console.log("Granted REWARDS_ADMIN_ROLE to:", rewardsAdmin.address);

  // Grant rewards admin role to StakingVault so it can mint wYLDS
  await yieldVault.grantRole(REWARDS_ADMIN_ROLE, stakingVaultAddress);
  console.log("Granted REWARDS_ADMIN_ROLE to StakingVault:", stakingVaultAddress);

  // ============ Setup Roles for StakingVault ============
  
  console.log("\nSetting up StakingVault roles...");
  
  // Grant freeze admin role
  const STAKING_FREEZE_ADMIN_ROLE = await stakingVault.FREEZE_ADMIN_ROLE();
  await stakingVault.grantRole(STAKING_FREEZE_ADMIN_ROLE, freezeAdmin.address);
  console.log("Granted FREEZE_ADMIN_ROLE to:", freezeAdmin.address);
  
  // Grant rewards admin role
  const STAKING_REWARDS_ADMIN_ROLE = await stakingVault.REWARDS_ADMIN_ROLE();
  await stakingVault.grantRole(STAKING_REWARDS_ADMIN_ROLE, rewardsAdmin.address);
  console.log("Granted REWARDS_ADMIN_ROLE to:", rewardsAdmin.address);

  // ============ Setup Approvals ============
  
  console.log("\nSetting up approvals...");
  
  // Redeem vault needs to approve YieldVault to pull USDC for redemptions
  const usdc = await ethers.getContractAt("MockUSDC", usdcAddress);
  const maxApproval = ethers.MaxUint256;
  
  // Transfer some USDC to redeem vault for testing
  await usdc.transfer(redeemVault.address, ethers.parseUnits("100000", 6));
  console.log("Transferred 100,000 USDC to redeem vault");
  
  // Redeem vault approves YieldVault
  await usdc.connect(redeemVault).approve(yieldVaultAddress, maxApproval);
  console.log("Redeem vault approved YieldVault for USDC");

  // ============ Deployment Summary ============
  
  console.log("\n========================================");
  console.log("DEPLOYMENT SUMMARY");
  console.log("========================================");
  console.log("USDC Address:", usdcAddress);
  console.log("YieldVault (wYLDS):", yieldVaultAddress);
  console.log("StakingVault (PRIME):", stakingVaultAddress);
  console.log("\nRole Addresses:");
  console.log("  Admin:", deployer.address);
  console.log("  Redeem Vault:", redeemVault.address);
  console.log("  Freeze Admin:", freezeAdmin.address);
  console.log("  Rewards Admin:", rewardsAdmin.address);
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
      redeemVault: redeemVault.address,
      freezeAdmin: freezeAdmin.address,
      rewardsAdmin: rewardsAdmin.address,
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
