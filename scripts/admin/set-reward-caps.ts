// @ts-ignore
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { getDeploymentFile } from "../utils/getDeploymentFile";

/**
 * [ADMIN] Generate Safe calldata to restore StakingVault reward cap variables
 * that were skipped when V5 upgrade bypassed V4 (reinitializer(4)).
 *
 * Sets:
 *   maxPeriodRewards    = 1,000,000 wYLDS  (1M per call cap)
 *   rewardPeriodSeconds = 3,540 s          (59 min cooldown)
 *   maxTotalRewards     = 10,000,000 wYLDS (lifetime cap)
 *
 * Usage:
 *   SAFE_ADDRESS=0x4E79e5BB88f0596446c615B86D3780A11DB1a2f4 \
 *     npx hardhat run scripts/admin/set-reward-caps.ts --network sepolia
 */
async function main() {
  const safeAddress = process.env.SAFE_ADDRESS;
  if (!safeAddress) throw new Error("SAFE_ADDRESS env var required");

  const net = await ethers.provider.getNetwork();
  const deploymentFile = getDeploymentFile(net.name);
  const deploymentPath = path.join(__dirname, "../..", deploymentFile);
  if (!fs.existsSync(deploymentPath)) throw new Error(`Deployment file not found: ${deploymentFile}`);

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const proxyAddress = deployment.contracts.stakingVault;
  if (!proxyAddress) throw new Error("stakingVault not found in deployment file");

  const iface = new ethers.Interface([
    "function setMaxPeriodRewards(uint256)",
    "function setRewardPeriodSeconds(uint256)",
    "function setMaxTotalRewards(uint256)",
  ]);

  const calls = [
    { fn: "setMaxPeriodRewards",    value: 1_000_000n * 1_000_000n,  label: "1,000,000 wYLDS (per-call cap)" },
    { fn: "setRewardPeriodSeconds", value: 3540n,                    label: "3,540 s (59 min cooldown)" },
    { fn: "setMaxTotalRewards",     value: 10_000_000n * 1_000_000n, label: "10,000,000 wYLDS (lifetime cap)" },
  ];

  // Read current on-chain values
  const proxy = await ethers.getContractAt("StakingVault", proxyAddress);
  const [current1, current2, current3] = await Promise.all([
    proxy.maxPeriodRewards(),
    proxy.rewardPeriodSeconds(),
    proxy.maxTotalRewards(),
  ]);

  const networkPrefix = net.name === "mainnet" ? "eth" : "sep";
  console.log("\n🔧 REWARD CAP FIX — StakingVault");
  console.log("=".repeat(70));
  console.log("Network:        ", net.name);
  console.log("Safe:           ", safeAddress);
  console.log("StakingVault:   ", proxyAddress);
  console.log("\n📊 Current on-chain values:");
  console.log("  maxPeriodRewards:    ", current1.toString(), current1 === 0n ? "⚠️  ZERO" : "✅");
  console.log("  rewardPeriodSeconds: ", current2.toString(), current2 === 0n ? "⚠️  ZERO" : "✅");
  console.log("  maxTotalRewards:     ", current3.toString(), current3 === 0n ? "⚠️  ZERO" : "✅");

  console.log(`\n${"=".repeat(70)}`);
  console.log("📋 SAFE BATCH TRANSACTIONS (paste into Transaction Builder)");
  console.log(`Safe URL: https://app.safe.global/${networkPrefix}:${safeAddress}`);
  console.log(`${"=".repeat(70)}`);

  for (let i = 0; i < calls.length; i++) {
    const { fn, value, label } = calls[i];
    const calldata = iface.encodeFunctionData(fn, [value]);
    console.log(`\n── TX ${i + 1}: ${fn}`);
    console.log(`   To:       ${proxyAddress}`);
    console.log(`   Value:    0`);
    console.log(`   Sets:     ${label}`);
    console.log(`   Calldata: ${calldata}`);
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("⚠️  Batch all 3 into a single Safe transaction using Transaction Builder.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
