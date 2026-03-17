// @ts-nocheck
import { ethers } from "hardhat";
import { getDeploymentFile } from "./getDeploymentFile";
import * as fs from "fs";
import * as path from "path";

/**
 * Count unique token holders by scanning Transfer events.
 *
 * Usage:
 *   npx hardhat run scripts/utils/holders.ts --network hoodi
 *   npx hardhat run scripts/utils/holders.ts --network sepolia
 */

async function queryFilterPaginated(token: ethers.Contract, fromBlock: number, toBlock: number, chunkSize = 49000) {
  const events: any[] = [];
  const filter = token.filters.Transfer();
  for (let from = fromBlock; from <= toBlock; from += chunkSize) {
    const to = Math.min(from + chunkSize - 1, toBlock);
    const chunk = await token.queryFilter(filter, from, to);
    events.push(...chunk);
  }
  return events;
}

async function getHolders(token: ethers.Contract, label: string) {
  const latest = await ethers.provider.getBlockNumber();
  const decimals: number = await token.decimals();
  const events = await queryFilterPaginated(token, 0, latest);

  const balances = new Map<string, bigint>();
  for (const e of events) {
    const { from, to, value } = e.args;
    if (from !== ethers.ZeroAddress) {
      balances.set(from, (balances.get(from) ?? 0n) - value);
    }
    if (to !== ethers.ZeroAddress) {
      balances.set(to, (balances.get(to) ?? 0n) + value);
    }
  }

  const holders = [...balances.entries()].filter(([, bal]) => bal > 0n);
  console.log(`\n${label}`);
  console.log(`  Total Transfer events : ${events.length}`);
  console.log(`  Unique holders        : ${holders.length}`);
  holders.forEach(([addr, bal]) => {
    const fmt = ethers.formatUnits(bal, decimals);
    console.log(`    ${addr}  ${fmt}`);
  });
  return holders.length;
}

async function main() {
  const net = await ethers.provider.getNetwork();
  const networkName = net.name === "unknown" ? "hoodi" : net.name;

  const deployFile = getDeploymentFile(networkName);
  const deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../", deployFile), "utf8")
  );
  const contracts = deployment.contracts ?? deployment;

  console.log("════════════════════════════════════════════════════════════");
  console.log("           TOKEN HOLDERS");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`Network: ${networkName} (Chain ID: ${net.chainId})`);

  const erc20Abi = [
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
  ];

  const yieldVault = new ethers.Contract(contracts.yieldVault, erc20Abi, ethers.provider);
  const stakingVault = new ethers.Contract(contracts.stakingVault, erc20Abi, ethers.provider);

  await getHolders(yieldVault, `wYLDS (YieldVault)  ${contracts.yieldVault}`);
  await getHolders(stakingVault, `PRIME (StakingVault) ${contracts.stakingVault}`);

  console.log("\n════════════════════════════════════════════════════════════\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
