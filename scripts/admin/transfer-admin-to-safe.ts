// @ts-ignore
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Grant DEFAULT_ADMIN_ROLE and UPGRADER_ROLE to a Safe multisig on a single contract.
 *
 * Usage:
 *   CONTRACT_ADDRESS=0x... CONTRACT_TYPE=yieldvault SAFE_ADDRESS=0x... \
 *     npx hardhat run scripts/admin/transfer-admin-to-safe.ts --network sepolia
 *
 *   DRY_RUN=true CONTRACT_ADDRESS=0x... CONTRACT_TYPE=yieldvault SAFE_ADDRESS=0x... \
 *     npx hardhat run scripts/admin/transfer-admin-to-safe.ts --network sepolia
 *
 * Required env vars:
 *   CONTRACT_ADDRESS - Proxy address of the contract
 *   CONTRACT_TYPE    - yieldvault | stakingvault | feedverifier | navengine
 *   SAFE_ADDRESS     - The Safe multisig address that will become the admin
 *
 * CONTRACT_TYPE=navengine uses Ownable2Step: initiates transferOwnership.
 * Safe must call acceptOwnership() to complete.
 */

const ROOT = path.join(__dirname, "../../");

function loadFeedVerifierAbi(): any[] {
  const p = path.join(ROOT, "chainlink-hub/artifacts/contracts/FeedVerifier.sol/FeedVerifier.json");
  return JSON.parse(fs.readFileSync(p, "utf-8")).abi;
}

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const contractType = (process.env.CONTRACT_TYPE || "").toLowerCase();
  const safeAddress = process.env.SAFE_ADDRESS;
  const isDryRun = process.env.DRY_RUN === "true";

  if (!contractAddress) throw new Error("CONTRACT_ADDRESS env var required");
  if (!contractType) throw new Error("CONTRACT_TYPE env var required: yieldvault | stakingvault | feedverifier | navengine");
  if (!safeAddress) throw new Error("SAFE_ADDRESS env var required");
  if (!ethers.isAddress(safeAddress)) throw new Error(`SAFE_ADDRESS is not valid: ${safeAddress}`);

  const networkName = (await ethers.provider.getNetwork()).name;
  const [deployer] = await ethers.getSigners();

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  TRANSFER ADMIN TO SAFE${isDryRun ? " — DRY RUN" : ""}`);
  console.log(`  Network:   ${networkName}`);
  console.log(`  Contract:  ${contractType.toUpperCase()} @ ${contractAddress}`);
  console.log(`  Deployer:  ${deployer.address}`);
  console.log(`  Safe:      ${safeAddress}`);
  console.log(`${"═".repeat(60)}`);

  // ── NavEngine (Ownable2Step) ───────────────────────────────────
  if (contractType === "navengine") {
    const abi = [
      "function owner() view returns (address)",
      "function pendingOwner() view returns (address)",
      "function transferOwnership(address newOwner)",
    ];
    const c = new ethers.Contract(contractAddress, abi, deployer);
    const owner = await c.owner();
    const pending = await c.pendingOwner();

    console.log(`\n  Current owner:  ${owner}`);
    console.log(`  Pending owner:  ${pending === ethers.ZeroAddress ? "(none)" : pending}`);

    if (owner.toLowerCase() === safeAddress.toLowerCase()) {
      console.log(`\n  ℹ️  Safe is already owner. Nothing to do.`);
    } else if (pending.toLowerCase() === safeAddress.toLowerCase()) {
      console.log(`\n  ℹ️  Transfer already initiated. Safe must call acceptOwnership().`);
    } else {
      if (isDryRun) {
        console.log(`\n  [dry] would call transferOwnership(${safeAddress})`);
        console.log(`  [dry] Safe must then call acceptOwnership() to complete`);
      } else {
        const tx = await c.transferOwnership(safeAddress);
        await tx.wait();
        console.log(`\n  ✅ transferOwnership sent. Safe must call acceptOwnership().`);
      }
    }
    console.log(`\n${"═".repeat(60)}\n`);
    return;
  }

  // ── AccessControl contracts ────────────────────────────────────
  let contract: any;
  if (contractType === "feedverifier") {
    contract = new ethers.Contract(contractAddress, loadFeedVerifierAbi(), deployer);
  } else {
    const nameMap: Record<string, string> = {
      yieldvault:   "YieldVault",
      stakingvault: "StakingVault",
    };
    const name = nameMap[contractType];
    if (!name) throw new Error(`Unknown CONTRACT_TYPE: ${contractType}`);
    contract = await ethers.getContractAt(name, contractAddress);
  }

  const roles = [
    { name: "DEFAULT_ADMIN_ROLE", hash: ethers.ZeroHash },
    { name: "UPGRADER_ROLE",      hash: await contract.UPGRADER_ROLE() },
  ];

  for (const role of roles) {
    const already = await contract.hasRole(role.hash, safeAddress);
    if (already) {
      console.log(`\n  ℹ️  ${role.name}: Safe already has this role`);
      continue;
    }
    if (isDryRun) {
      console.log(`\n  [dry] would grantRole(${role.name}, Safe)`);
    } else {
      const tx = await contract.grantRole(role.hash, safeAddress);
      await tx.wait();
      console.log(`\n  ✅ ${role.name} granted to Safe`);
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  if (!isDryRun) {
    console.log(`  Done. Verify with:`);
    console.log(`  CONTRACT_ADDRESS=${contractAddress} CONTRACT_TYPE=${contractType} \\`);
    console.log(`    EXTRA_ADDRESSES=${safeAddress} \\`);
    console.log(`    npx hardhat run scripts/ops/list-roles.ts --network ${networkName}`);
  }
  console.log(`${"═".repeat(60)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
