// @ts-nocheck
import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * Grant all admin roles to the admin account on existing YieldVault deployment
 * 
 * Usage:
 *   # View current roles only (dry run)
 *   npx hardhat run scripts/admin/grant-all-roles-yieldvault.ts --network hoodi
 * 
 *   # Actually grant missing roles
 *   GRANT_ROLES=true npx hardhat run scripts/admin/grant-all-roles-yieldvault.ts --network hoodi
 */

async function main() {
  const dryRun = !process.env.GRANT_ROLES;
  
  console.log("════════════════════════════════════════════════════════════");
  console.log("      GRANT ALL ADMIN ROLES - YIELDVAULT");
  if (dryRun) {
    console.log("              (DRY RUN MODE)");
  }
  console.log("════════════════════════════════════════════════════════════");
  console.log("");

  const [admin] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log(`Network: ${network.name} (Chain ID: ${network.chainId})`);
  console.log(`Admin: ${admin.address}`);
  console.log("");

  // Load deployment file
  const deploymentFile = fs.existsSync("deployment_testnet.json") 
    ? "deployment_testnet.json" 
    : "deployment.json";
  
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
  const yieldVaultAddress = deployment.contracts.yieldVault;

  console.log(`YieldVault: ${yieldVaultAddress}`);
  console.log("");

  const yieldVault = await ethers.getContractAt("YieldVault", yieldVaultAddress);

  // Get all role constants
  const DEFAULT_ADMIN_ROLE = await yieldVault.DEFAULT_ADMIN_ROLE();
  const PAUSER_ROLE = await yieldVault.PAUSER_ROLE();
  const UPGRADER_ROLE = await yieldVault.UPGRADER_ROLE();
  const REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
  const FREEZE_ADMIN_ROLE = await yieldVault.FREEZE_ADMIN_ROLE();
  const WHITELIST_ADMIN_ROLE = await yieldVault.WHITELIST_ADMIN_ROLE();
  const WITHDRAWAL_ADMIN_ROLE = await yieldVault.WITHDRAWAL_ADMIN_ROLE();

  // Check current roles
  console.log("📊 Current Role Status:");
  const roles = [
    { name: "DEFAULT_ADMIN_ROLE", hash: DEFAULT_ADMIN_ROLE },
    { name: "PAUSER_ROLE", hash: PAUSER_ROLE },
    { name: "UPGRADER_ROLE", hash: UPGRADER_ROLE },
    { name: "REWARDS_ADMIN_ROLE", hash: REWARDS_ADMIN_ROLE },
    { name: "FREEZE_ADMIN_ROLE", hash: FREEZE_ADMIN_ROLE },
    { name: "WHITELIST_ADMIN_ROLE", hash: WHITELIST_ADMIN_ROLE },
    { name: "WITHDRAWAL_ADMIN_ROLE", hash: WITHDRAWAL_ADMIN_ROLE },
  ];

  const missingRoles = [];
  for (const role of roles) {
    const hasRole = await yieldVault.hasRole(role.hash, admin.address);
    console.log(`   ${role.name.padEnd(25)} ${hasRole ? "✅" : "❌"}`);
    if (!hasRole) {
      missingRoles.push(role);
    }
  }
  console.log("");

  if (missingRoles.length === 0) {
    console.log("✅ Admin already has all roles! Nothing to do.");
    return;
  }

  if (dryRun) {
    console.log(`⚠️  DRY RUN MODE - No changes will be made.`);
    console.log(`\n💡 To grant these roles, run:`);
    console.log(`   GRANT_ROLES=true npx hardhat run scripts/admin/grant-all-roles-yieldvault.ts --network ${network.name}`);
    console.log("");
    return;
  }

  // Grant missing roles
  console.log(`🔧 Granting ${missingRoles.length} missing role(s)...`);
  console.log("");

  for (const role of missingRoles) {
    console.log(`   Granting ${role.name}...`);
    try {
      const tx = await yieldVault.grantRole(role.hash, admin.address);
      await tx.wait();
      console.log(`   ✅ ${role.name} granted`);
    } catch (error: any) {
      console.log(`   ❌ Failed to grant ${role.name}: ${error.message}`);
    }
  }
  console.log("");

  // Verify all roles granted
  console.log("🔍 Verification:");
  let allGranted = true;
  for (const role of roles) {
    const hasRole = await yieldVault.hasRole(role.hash, admin.address);
    console.log(`   ${role.name.padEnd(25)} ${hasRole ? "✅" : "❌"}`);
    if (!hasRole) {
      allGranted = false;
    }
  }
  console.log("");

  if (allGranted) {
    console.log("🎉 SUCCESS! All roles granted to admin.");
  } else {
    console.log("⚠️  WARNING: Some roles were not granted. Check errors above.");
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
