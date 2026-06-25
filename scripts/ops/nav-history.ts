/**
 * [OPS] NAV history vs StakingVault mint/reward activity on mainnet.
 *
 * Queries:
 *   - HastraNavEngine: RateUpdated(rate, totalSupply, totalTVL, timestamp)
 *   - StakingVault:    Deposit(caller, owner, assets, shares)   ← ERC-4626 deposits
 *                      RewardsDistributed(amount, timestamp)
 *                      Transfer(from=0x0, ...)                  ← mints (catches distributeRewards too)
 *
 * Output: unified timeline sorted by block, showing rate changes alongside vault activity.
 *
 * Usage:
 *   NAV_ENGINE=0xfEd839B6BA09c1aBf4C768abA0ECA50746E4eca9 \
 *   STAKING_VAULT=0x19ebb35279A16207Ec4ba82799CC64715065F7F6 \
 *   FROM_BLOCK=19000000 \
 *     npx hardhat run scripts/ops/nav-history.ts --network mainnet
 *
 * Optional:
 *   HOURS_BACK=24     (default: 24 — how many hours of history to fetch)
 *   TO_BLOCK=latest   (default: latest)
 *   CHUNK=2000        (default: 2000 — stay under RPC log limit)
 *
 * FROM_BLOCK overrides HOURS_BACK if both are set.
 */

// @ts-ignore
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { getDeploymentFile } from "../utils/getDeploymentFile";

const CHUNK = Number(process.env.CHUNK ?? 2000);

const NAV_ENGINE_ABI = [
  "event RateUpdated(int192 indexed rate, uint256 totalSupply, uint256 totalTVL, uint256 indexed timestamp)",
];

const STAKING_VAULT_ABI = [
  "event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares)",
  "event RewardsDistributed(uint256 amount, uint256 timestamp)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

interface Event {
  block: number;
  txHash: string;   // full hash
  type: string;
  rate?: string;
  _rawRate?: bigint; // raw 18-dec bigint for lossless delta math
  rateDelta?: string;
  supply?: string;
  tvl?: string;
  assets?: string;
  shares?: string;
  amount?: string;
  address?: string;
}

async function queryInChunks(
  contract: any,
  filter: any,
  fromBlock: number,
  toBlock: number
): Promise<any[]> {
  const results: any[] = [];
  for (let from = fromBlock; from <= toBlock; from += CHUNK) {
    const to = Math.min(from + CHUNK - 1, toBlock);
    const events = await contract.queryFilter(filter, from, to);
    results.push(...events);
  }
  return results;
}

async function main() {
  const net = network.name;

  // ── Resolve addresses ────────────────────────────────────────
  let navEngineAddr = process.env.NAV_ENGINE;
  let stakingVaultAddr = process.env.STAKING_VAULT;

  if (!navEngineAddr || !stakingVaultAddr) {
    try {
      const deployFile = getDeploymentFile(net);
      const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "../../", deployFile), "utf8"));
      const contracts = dep.contracts ?? dep;
      navEngineAddr   ??= (net === "mainnet"
        ? JSON.parse(fs.readFileSync(path.join(__dirname, "../../deployment_nav_mainnet.json"), "utf8")).contracts?.navEngine
        : undefined);
      stakingVaultAddr ??= contracts.stakingVault;
    } catch {}
  }

  if (!navEngineAddr)    throw new Error("NAV_ENGINE env var required");
  if (!stakingVaultAddr) throw new Error("STAKING_VAULT env var required");

  const BLOCKS_PER_HOUR = 300; // ~12s/block on mainnet
  const hoursBack = Number(process.env.HOURS_BACK ?? 24);
  const provider = ethers.provider;
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = process.env.FROM_BLOCK
    ? Number(process.env.FROM_BLOCK)
    : latestBlock - Math.ceil(hoursBack * BLOCKS_PER_HOUR);
  const toBlock   = process.env.TO_BLOCK === "latest" || !process.env.TO_BLOCK
    ? latestBlock
    : Number(process.env.TO_BLOCK);

  console.log(`\n${"═".repeat(72)}`);
  console.log(`  NAV History — ${net}`);
  console.log(`  NavEngine:    ${navEngineAddr}`);
  console.log(`  StakingVault: ${stakingVaultAddr}`);
  console.log(`  Blocks:       ${fromBlock.toLocaleString()} → ${toBlock.toLocaleString()} (${hoursBack}h back, chunk=${CHUNK})`);
  console.log(`${"═".repeat(72)}\n`);

  const navEngine    = new ethers.Contract(navEngineAddr, NAV_ENGINE_ABI, provider);
  const stakingVault = new ethers.Contract(stakingVaultAddr, STAKING_VAULT_ABI, provider);

  // ── Fetch events ─────────────────────────────────────────────
  console.log("Fetching RateUpdated events...");
  const rateEvents = await queryInChunks(navEngine, navEngine.filters.RateUpdated(), fromBlock, toBlock);

  console.log("Fetching Deposit events...");
  const depositEvents = await queryInChunks(stakingVault, stakingVault.filters.Deposit(), fromBlock, toBlock);

  console.log("Fetching RewardsDistributed events...");
  const rewardEvents = await queryInChunks(stakingVault, stakingVault.filters.RewardsDistributed(), fromBlock, toBlock);

  console.log("Fetching Transfer(mint) events...");
  const mintEvents = (await queryInChunks(
    stakingVault, stakingVault.filters.Transfer(ethers.ZeroAddress, null), fromBlock, toBlock
  ));

  console.log(`\nFound: ${rateEvents.length} RateUpdated, ${depositEvents.length} Deposit, ` +
    `${rewardEvents.length} RewardsDistributed, ${mintEvents.length} mint Transfer\n`);

  // ── Build unified timeline ────────────────────────────────────
  const timeline: Event[] = [];

  for (const e of rateEvents) {
    const rate   = ethers.formatUnits(e.args.rate, 18); // 18-decimal string, lossless
    const supply = ethers.formatUnits(e.args.totalSupply, 6);
    const tvl    = ethers.formatUnits(e.args.totalTVL, 6);
    timeline.push({ block: e.blockNumber, txHash: e.transactionHash, type: "NAV_UPDATE",
      rate, supply, tvl, _rawRate: e.args.rate as bigint });
  }

  for (const e of depositEvents) {
    const assets = ethers.formatUnits(e.args.assets, 6);
    const shares = ethers.formatUnits(e.args.shares, 6);
    timeline.push({ block: e.blockNumber, txHash: e.transactionHash, type: "DEPOSIT",
      assets, shares, address: e.args.owner });
  }

  for (const e of rewardEvents) {
    const amount = ethers.formatUnits(e.args.amount, 6);
    timeline.push({ block: e.blockNumber, txHash: e.transactionHash, type: "REWARDS_DIST",
      amount });
  }

  // mint Transfers not already covered by RewardsDistributed (deduplicate by txHash)
  const rewardTxHashes  = new Set(rewardEvents.map((e: any) => e.transactionHash));
  const depositTxHashes = new Set(depositEvents.map((e: any) => e.transactionHash));
  for (const e of mintEvents) {
    if (rewardTxHashes.has(e.transactionHash))  continue;
    if (depositTxHashes.has(e.transactionHash)) continue;
    const value = ethers.formatUnits(e.args.value, 6);
    timeline.push({ block: e.blockNumber, txHash: e.transactionHash, type: "MINT",
      amount: value, address: e.args.to });
  }

  timeline.sort((a, b) => a.block !== b.block ? a.block - b.block : a.txHash.localeCompare(b.txHash));

  // Compute rate deltas using bigint math to avoid JS float rounding
  let lastRawRate = 0n;
  for (const ev of timeline) {
    if (ev.type === "NAV_UPDATE" && ev._rawRate !== undefined) {
      if (lastRawRate > 0n) {
        // delta% = (new - old) / old * 100, scaled to 6 decimal places
        const deltaBps = (ev._rawRate - lastRawRate) * 100_000_000n / lastRawRate;
        const sign = deltaBps < 0n ? "-" : "";
        const abs = deltaBps < 0n ? -deltaBps : deltaBps;
        ev.rateDelta = `${sign}${(abs / 1_000_000n).toString()}.${(abs % 1_000_000n).toString().padStart(6, "0")}%`;
      } else {
        ev.rateDelta = "0.000000%";
      }
      lastRawRate = ev._rawRate;
    }
  }

  // ── Console output (full tx hash) ────────────────────────────
  for (const ev of timeline) {
    const b = ev.block.toString().padStart(9);
    const t = ev.type.padEnd(12);
    if (ev.type === "NAV_UPDATE") {
      console.log(`  ${b}  ${t}  rate=${ev.rate}  Δ=${ev.rateDelta}  supply=${ev.supply}  tvl=${ev.tvl}  tx=${ev.txHash}`);
    } else if (ev.type === "DEPOSIT") {
      console.log(`  ${b}  ${t}  assets=${ev.assets} wYLDS  shares=${ev.shares} PRIME  owner=${ev.address}  tx=${ev.txHash}`);
    } else if (ev.type === "REWARDS_DIST") {
      console.log(`  ${b}  ${t}  amount=${ev.amount} PRIME  tx=${ev.txHash}`);
    } else {
      console.log(`  ${b}  ${t}  amount=${ev.amount} PRIME  to=${ev.address}  tx=${ev.txHash}`);
    }
  }

  // ── CSV output ────────────────────────────────────────────────
  const csvFile = process.env.CSV_OUT ?? `nav-history-${net}-${Date.now()}.csv`;
  const csvHeader = "block,type,tx_hash,rate,rate_delta_pct,supply_prime,tvl_wylds,assets_wylds,shares_prime,amount_prime,address";
  const csvRows = timeline.map(ev =>
    [
      ev.block,
      ev.type,
      ev.txHash,
      ev.rate    ?? "",
      ev.rateDelta ? ev.rateDelta.replace("%", "") : "",
      ev.supply  ?? "",
      ev.tvl     ?? "",
      ev.assets  ?? "",
      ev.shares  ?? "",
      ev.amount  ?? "",
      ev.address ?? "",
    ].join(",")
  );
  fs.writeFileSync(csvFile, [csvHeader, ...csvRows].join("\n") + "\n");
  console.log(`\n✅ CSV written to: ${csvFile}`);

  // ── Hourly bucket summary ─────────────────────────────────────
  // Show the last NAV rate in each 300-block (~1h) bucket; flag missing hours.
  const hourlyBuckets = new Map<number, string>(); // hourIndex → last rate
  for (const ev of timeline) {
    if (ev.type === "NAV_UPDATE" && ev.rate) {
      const hIdx = Math.floor((ev.block - fromBlock) / BLOCKS_PER_HOUR);
      hourlyBuckets.set(hIdx, ev.rate);
    }
  }

  console.log(`\n${"─".repeat(72)}`);
  console.log(`  Hourly NAV (last update per ${BLOCKS_PER_HOUR}-block window):`);
  let missingHours = 0;
  for (let h = 0; h < hoursBack; h++) {
    const rate = hourlyBuckets.get(h);
    if (rate) {
      console.log(`  Hour ${h.toString().padStart(2)}  rate=${rate}`);
    } else {
      console.log(`  Hour ${h.toString().padStart(2)}  ⚠️  NO NAV UPDATE`);
      missingHours++;
    }
  }
  if (missingHours > 0) {
    console.log(`\n  ⚠️  ${missingHours} hour(s) with no NAV update — data gap or RPC missed events`);
  } else {
    console.log(`\n  ✅ All ${hoursBack} hours have at least one NAV update`);
  }

  // ── Summary ───────────────────────────────────────────────────
  const navCount      = rateEvents.length;
  const depositCount  = depositEvents.length;
  const rewardCount   = rewardEvents.length;
  const orphanMints   = timeline.filter(e => e.type === "MINT").length;

  console.log(`\n${"─".repeat(72)}`);
  console.log(`  Summary:`);
  console.log(`    NAV updates:        ${navCount}`);
  console.log(`    Deposits:           ${depositCount}`);
  console.log(`    RewardsDistributed: ${rewardCount}`);
  console.log(`    Other mints:        ${orphanMints}  ← mints NOT from deposit or distributeRewards`);
  if (orphanMints > 0) {
    console.log(`    ⚠️  ${orphanMints} mint(s) have no corresponding deposit or rewards event`);
  }
  console.log(`${"═".repeat(72)}\n`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
