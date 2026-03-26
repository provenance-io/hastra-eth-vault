// @ts-ignore
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * List all roles and their current holders for any AccessControl contract,
 * or print owner/pendingOwner for Ownable2Step contracts (HastraNavEngine).
 *
 * Checks hasRole() against all addresses found in deployment JSON files + EXTRA_ADDRESSES.
 * Fast — no event scanning.
 *
 * Usage:
 *   CONTRACT_ADDRESS=<address> CONTRACT_TYPE=<type> \
 *     npx hardhat run scripts/ops/list-roles.ts --network <network>
 *
 * CONTRACT_TYPE options:
 *   yieldvault     YieldVault (wYLDS)
 *   stakingvault   StakingVault (PRIME)
 *   feedverifier   FeedVerifier (chainlink-hub)
 *   navengine      HastraNavEngine (Ownable2Step)
 *
 * Optional:
 *   EXTRA_ADDRESSES=0xaddr1,0xaddr2   additional addresses to check (Safe, bots, etc.)
 *
 * Examples:
 *   CONTRACT_ADDRESS=0x0258787Eb97DD01436B562943D8ca85B772D7b98 CONTRACT_TYPE=yieldvault \
 *     npx hardhat run scripts/ops/list-roles.ts --network sepolia
 *
 *   CONTRACT_ADDRESS=0x0258787... CONTRACT_TYPE=yieldvault \
 *     EXTRA_ADDRESSES=0x4E79e5BB88f0596446c615B86D3780A11DB1a2f4 \
 *     npx hardhat run scripts/ops/list-roles.ts --network sepolia
 */

const ROLE_DEFS: Record<string, { name: string; hash: string }[]> = {
  yieldvault: [
    { name: "DEFAULT_ADMIN_ROLE",    hash: ethers.ZeroHash },
    { name: "UPGRADER_ROLE",         hash: ethers.id("UPGRADER_ROLE") },
    { name: "PAUSER_ROLE",           hash: ethers.id("PAUSER_ROLE") },
    { name: "FREEZE_ADMIN_ROLE",     hash: ethers.keccak256(ethers.toUtf8Bytes("FREEZE_ADMIN")) },
    { name: "REWARDS_ADMIN_ROLE",    hash: ethers.keccak256(ethers.toUtf8Bytes("REWARDS_ADMIN")) },
    { name: "WHITELIST_ADMIN_ROLE",  hash: ethers.keccak256(ethers.toUtf8Bytes("WHITELIST_ADMIN")) },
    { name: "WITHDRAWAL_ADMIN_ROLE", hash: ethers.keccak256(ethers.toUtf8Bytes("WITHDRAWAL_ADMIN")) },
  ],
  stakingvault: [
    { name: "DEFAULT_ADMIN_ROLE",      hash: ethers.ZeroHash },
    { name: "UPGRADER_ROLE",           hash: ethers.id("UPGRADER_ROLE") },
    { name: "PAUSER_ROLE",             hash: ethers.id("PAUSER_ROLE") },
    { name: "FREEZE_ADMIN_ROLE",       hash: ethers.keccak256(ethers.toUtf8Bytes("FREEZE_ADMIN")) },
    { name: "REWARDS_ADMIN_ROLE",      hash: ethers.keccak256(ethers.toUtf8Bytes("REWARDS_ADMIN")) },
    { name: "NAV_ORACLE_UPDATER_ROLE", hash: ethers.keccak256(ethers.toUtf8Bytes("NAV_ORACLE_UPDATER")) },
  ],
  feedverifier: [
    { name: "DEFAULT_ADMIN_ROLE", hash: ethers.ZeroHash },
    { name: "UPGRADER_ROLE",      hash: ethers.id("UPGRADER_ROLE") },
    { name: "PAUSER_ROLE",        hash: ethers.id("PAUSER_ROLE") },
    { name: "UPDATER_ROLE",       hash: ethers.id("UPDATER_ROLE") },
  ],
};

const HAS_ROLE_ABI = ["function hasRole(bytes32 role, address account) view returns (bool)"];
const OWNABLE2STEP_ABI = [
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)",
];

function collectAddresses(extraEnv: string): string[] {
  const addrs = new Set<string>();

  const flatten = (obj: any) => {
    if (!obj || typeof obj !== "object") return;
    for (const v of Object.values(obj)) {
      if (typeof v === "string" && ethers.isAddress(v)) addrs.add(ethers.getAddress(v));
      else flatten(v);
    }
  };

  const root = path.resolve(__dirname, "../../");

  // Scan root deployment files
  for (const f of fs.readdirSync(root)) {
    if (!f.startsWith("deployment") || !f.endsWith(".json")) continue;
    try { flatten(JSON.parse(fs.readFileSync(path.join(root, f), "utf-8"))); } catch {}
  }

  // Scan chainlink-hub deployment files
  const clDir = path.join(root, "chainlink-hub");
  if (fs.existsSync(clDir)) {
    for (const f of fs.readdirSync(clDir)) {
      if (!f.startsWith("deployment") || !f.endsWith(".json")) continue;
      try { flatten(JSON.parse(fs.readFileSync(path.join(clDir, f), "utf-8"))); } catch {}
    }
  }

  // Extra addresses from env
  for (const a of (extraEnv || "").split(",")) {
    const t = a.trim();
    if (ethers.isAddress(t)) addrs.add(ethers.getAddress(t));
  }

  addrs.delete(ethers.ZeroAddress);
  return [...addrs];
}

async function listAccessControl(address: string, contractType: string, candidates: string[]) {
  const roles = ROLE_DEFS[contractType];
  if (!roles) throw new Error(`Unknown CONTRACT_TYPE: ${contractType}. Options: ${Object.keys(ROLE_DEFS).join(", ")}, navengine`);

  const contract = new ethers.Contract(address, HAS_ROLE_ABI, ethers.provider);

  console.log(`\n${"═".repeat(62)}`);
  console.log(`  ROLE REPORT — ${contractType.toUpperCase()}`);
  console.log(`  Address: ${address}`);
  console.log(`  Network: ${network.name}`);
  console.log(`  Checking ${candidates.length} addresses`);
  console.log(`${"═".repeat(62)}`);

  for (const role of roles) {
    const results = await Promise.all(
      candidates.map(addr =>
        contract.hasRole(role.hash, addr).then((has: boolean) => ({ addr, has }))
      )
    );
    const holders = results.filter(r => r.has).map(r => r.addr);

    const icon = holders.length > 0 ? "✅" : "⬜";
    console.log(`\n  ${icon} ${role.name}`);
    if (holders.length === 0) {
      console.log(`     (none of the checked addresses hold this role)`);
    } else {
      for (const h of holders) console.log(`     ${h}`);
    }
  }
  console.log(`\n${"═".repeat(62)}\n`);
}

async function listNavEngine(address: string) {
  const contract = new ethers.Contract(address, OWNABLE2STEP_ABI, ethers.provider);

  const owner = await contract.owner();
  let pending = "(none)";
  try {
    const p = await contract.pendingOwner();
    if (p !== ethers.ZeroAddress) pending = p;
  } catch {}

  let updater = "(unavailable)";
  try {
    const nav = await ethers.getContractAt("HastraNavEngine", address);
    updater = await nav.getUpdater();
  } catch {}

  console.log(`\n${"═".repeat(62)}`);
  console.log(`  ROLE REPORT — NAVENGINE (Ownable2Step)`);
  console.log(`  Address: ${address}`);
  console.log(`  Network: ${network.name}`);
  console.log(`${"═".repeat(62)}`);
  console.log(`\n  owner:        ${owner}`);
  console.log(`  pendingOwner: ${pending}`);
  console.log(`  updater:      ${updater}`);
  console.log(`\n${"═".repeat(62)}\n`);
}

async function main() {
  const address = process.env.CONTRACT_ADDRESS;
  const contractType = (process.env.CONTRACT_TYPE || "").toLowerCase();
  const extraAddresses = process.env.EXTRA_ADDRESSES || "";

  if (!address) throw new Error("CONTRACT_ADDRESS env var required");
  if (!contractType) throw new Error("CONTRACT_TYPE env var required: yieldvault | stakingvault | feedverifier | navengine");

  if (contractType === "navengine") {
    await listNavEngine(address);
  } else {
    const candidates = collectAddresses(extraAddresses);
    await listAccessControl(address, contractType, candidates);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
