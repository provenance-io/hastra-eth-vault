// @ts-nocheck
import { ethers } from "hardhat";
import { getDeploymentFile } from "./getDeploymentFile";
import * as fs from "fs";
import * as path from "path";

/**
 * List all currently pending redemptions on YieldVault by scanning
 * RedemptionRequested events, then re-checking on-chain state
 * (pendingRedemptions mapping is deleted by completeRedeem/cancelRedeem,
 * so only entries with shares > 0 are still pending).
 *
 * Usage:
 *   npx hardhat run scripts/utils/list-pending-redemptions.ts --network mainnet
 *   npx hardhat run scripts/utils/list-pending-redemptions.ts --network sepolia
 */

async function queryFilterPaginated(contract: ethers.Contract, filter, fromBlock: number, toBlock: number, chunkSize = 9999) {
  const events: any[] = [];
  for (let from = fromBlock; from <= toBlock; from += chunkSize) {
    const to = Math.min(from + chunkSize - 1, toBlock);
    const chunk = await contract.queryFilter(filter, from, to);
    events.push(...chunk);
  }
  return events;
}

async function main() {
  const net = await ethers.provider.getNetwork();
  const networkName = net.name === "unknown" ? "mainnet" : net.name;

  const root = path.join(__dirname, "../../");
  const mainnetFile = path.join(root, `deployment_${networkName}.json`);
  const deployFile = fs.existsSync(mainnetFile)
    ? mainnetFile
    : path.join(root, getDeploymentFile(networkName));
  const deployment = JSON.parse(fs.readFileSync(deployFile, "utf8"));
  const contracts = deployment.contracts ?? deployment;
  const yieldVaultAddress = process.env.YIELD_VAULT_ADDRESS || contracts.yieldVault;

  console.log("════════════════════════════════════════════════════════════");
  console.log("           PENDING REDEMPTIONS (YieldVault)");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`Network: ${networkName} (Chain ID: ${net.chainId})`);
  console.log(`Vault:   ${yieldVaultAddress}`);

  const vault = await ethers.getContractAt("YieldVault", yieldVaultAddress);
  const latest = await ethers.provider.getBlockNumber();

  const requestedFilter = vault.filters.RedemptionRequested();
  const events = await queryFilterPaginated(vault, requestedFilter, 0, latest);

  const uniqueUsers = [...new Set(events.map((e) => e.args.user))];
  console.log(`\nRedemptionRequested events: ${events.length}`);
  console.log(`Unique users who ever requested: ${uniqueUsers.length}`);

  const pending: { user: string; shares: bigint; assets: bigint; timestamp: bigint }[] = [];
  for (const user of uniqueUsers) {
    const p = await vault.pendingRedemptions(user);
    if (p.shares > 0n) {
      pending.push({ user, shares: p.shares, assets: p.assets, timestamp: p.timestamp });
    }
  }

  console.log(`\nCurrently pending: ${pending.length}`);
  pending.forEach(({ user, shares, assets, timestamp }) => {
    const date = new Date(Number(timestamp) * 1000).toISOString();
    console.log(
      `  ${user}  shares=${ethers.formatUnits(shares, 6)}  assets=${ethers.formatUnits(assets, 6)}  requestedAt=${date}`
    );
  });

  console.log("\n════════════════════════════════════════════════════════════\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
