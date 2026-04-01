// @ts-ignore
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Revoke all deployer roles from a single Hastra contract.
 * Safe MUST already hold DEFAULT_ADMIN_ROLE — the script verifies this first.
 *
 * Usage:
 *   CONTRACT_ADDRESS=0x... CONTRACT_TYPE=yieldvault SAFE_ADDRESS=0x... \
 *     npx hardhat run scripts/admin/revoke-deployer-roles.ts --network sepolia
 *
 *   DRY_RUN=true CONTRACT_ADDRESS=0x... CONTRACT_TYPE=yieldvault SAFE_ADDRESS=0x... \
 *     npx hardhat run scripts/admin/revoke-deployer-roles.ts --network sepolia
 *
 * Required env vars:
 *   CONTRACT_ADDRESS  - Proxy address of the contract
 *   CONTRACT_TYPE     - yieldvault | stakingvault | feedverifier | navengine
 *   SAFE_ADDRESS      - Safe that must already hold DEFAULT_ADMIN (safety check)
 *
 * Optional env vars:
 *   DEPLOYER_ADDRESS  - Address to revoke from (defaults to connected signer)
 */

const ROOT = path.join(__dirname, "../../");

function loadFeedVerifierAbi(): any[] {
  const p = path.join(ROOT, "chainlink-hub/artifacts/contracts/FeedVerifier.sol/FeedVerifier.json");
  return JSON.parse(fs.readFileSync(p, "utf-8")).abi;
}

const ALL_ROLE_NAMES = [
  "DEFAULT_ADMIN_ROLE", "UPGRADER_ROLE", "PAUSER_ROLE",
  "FREEZE_ADMIN_ROLE", "REWARDS_ADMIN_ROLE", "NAV_ORACLE_UPDATER_ROLE",
  "WHITELIST_ADMIN_ROLE", "WITHDRAWAL_ADMIN_ROLE", "UPDATER_ROLE",
];

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const contractType = (process.env.CONTRACT_TYPE || "").toLowerCase();
  const safeAddress = process.env.SAFE_ADDRESS;
  const isDryRun = process.env.DRY_RUN === "true";

  if (!contractAddress) throw new Error("CONTRACT_ADDRESS env var required");
  if (!contractType) throw new Error("CONTRACT_TYPE env var required: yieldvault | stakingvault | feedverifier | navengine");
  if (!safeAddress) throw new Error("SAFE_ADDRESS env var required");

  const networkName = (await ethers.provider.getNetwork()).name;
  const [signer] = await ethers.getSigners();
  const deployerAddress = process.env.DEPLOYER_ADDRESS || signer.address;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  REVOKE DEPLOYER ROLES${isDryRun ? " — DRY RUN" : ""}`);
  console.log(`  Network:   ${networkName}`);
  console.log(`  Contract:  ${contractType.toUpperCase()} @ ${contractAddress}`);
  console.log(`  Deployer:  ${deployerAddress}`);
  console.log(`  Safe:      ${safeAddress}`);
  console.log(`${"═".repeat(60)}`);

  // ── NavEngine (Ownable2Step) ───────────────────────────────────
  if (contractType === "navengine") {
    const abi = [
      "function owner() view returns (address)",
      "function pendingOwner() view returns (address)",
    ];
    const c = new ethers.Contract(contractAddress, abi, ethers.provider);
    const owner = await c.owner();
    const pending = await c.pendingOwner();
    console.log(`\n  Current owner:  ${owner}`);
    console.log(`  Pending owner:  ${pending === ethers.ZeroAddress ? "(none)" : pending}`);
    if (owner.toLowerCase() !== deployerAddress.toLowerCase()) {
      console.log(`\n  ─ Deployer is not the owner — nothing to revoke`);
    } else {
      console.log(`\n  ⚠️  Deployer is still owner.`);
      console.log(`     1. Run transfer-admin-to-safe.ts (CONTRACT_TYPE=navengine) first`);
      console.log(`     2. Safe calls acceptOwnership() via Safe UI`);
      console.log(`     3. Then deployer is automatically removed`);
    }
    console.log(`\n${"═".repeat(60)}\n`);
    return;
  }

  // ── AccessControl contracts ────────────────────────────────────
  let contract: any;
  if (contractType === "feedverifier") {
    contract = new ethers.Contract(contractAddress, loadFeedVerifierAbi(), signer);
  } else {
    const nameMap: Record<string, string> = {
      yieldvault:   "YieldVault",
      stakingvault: "StakingVault",
    };
    const name = nameMap[contractType];
    if (!name) throw new Error(`Unknown CONTRACT_TYPE: ${contractType}`);
    contract = await ethers.getContractAt(name, contractAddress);
  }

  // Safety check: Safe must hold DEFAULT_ADMIN before we revoke deployer
  const safeHasAdmin = await contract.hasRole(ethers.ZeroHash, safeAddress);
  if (!safeHasAdmin) {
    console.log(`\n  ❌ ABORTED — Safe does NOT hold DEFAULT_ADMIN_ROLE.`);
    console.log(`     Run transfer-admin-to-safe.ts first, then re-run this script.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n  ✅ Safety check passed — Safe holds DEFAULT_ADMIN`);

  // Revoke every role the deployer holds
  let revokedCount = 0;
  for (const roleName of ALL_ROLE_NAMES) {
    let roleHash: string;
    if (roleName === "DEFAULT_ADMIN_ROLE") {
      roleHash = ethers.ZeroHash;
    } else {
      try { roleHash = await contract[roleName](); } catch { continue; }
    }

    const has = await contract.hasRole(roleHash, deployerAddress);
    if (!has) {
      console.log(`  ─  ${roleName}: deployer doesn't have this role`);
      continue;
    }

    if (isDryRun) {
      console.log(`  [dry] would revoke ${roleName}`);
    } else {
      const tx = await contract.revokeRole(roleHash, deployerAddress);
      await tx.wait();
      console.log(`  ✅ ${roleName} revoked`);
      revokedCount++;
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  if (isDryRun) {
    console.log(`  DRY RUN complete — no changes made.`);
  } else {
    console.log(`  Done — revoked ${revokedCount} role(s). Verify with:`);
    console.log(`  CONTRACT_ADDRESS=${contractAddress} CONTRACT_TYPE=${contractType} \\`);
    console.log(`    EXTRA_ADDRESSES=${deployerAddress} \\`);
    console.log(`    npx hardhat run scripts/ops/list-roles.ts --network ${networkName}`);
  }
  console.log(`${"═".repeat(60)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
