// @ts-ignore
import { ethers } from "hardhat";
import { getDeploymentFile } from "./utils/getDeploymentFile";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const network = await ethers.provider.getNetwork();
  const deploymentFile = getDeploymentFile(network.name);
  const deployment = JSON.parse(fs.readFileSync(path.join(__dirname, "..", deploymentFile), "utf8"));
  const proxy = deployment.contracts.stakingVault;

  console.log(`StakingVault NAV Oracle state (${network.name}):`);
  console.log("  Proxy:", proxy);

  const vault = await ethers.getContractAt("StakingVault", proxy);

  const [navOracle, navStaleness, navFeedId] = await Promise.all([
    vault.navOracle(),
    vault.navStalenessLimit(),
    vault.navFeedId(),
  ]);

  console.log("  navOracle:        ", navOracle);
  console.log("  navStalenessLimit:", navStaleness.toString(), "seconds");
  console.log("  navFeedId:        ", navFeedId);

  try {
    const nav = await vault.getVerifiedNav();
    console.log("  getVerifiedNav(): ", nav.toString(), "(", Number(nav) / 1e18, "wYLDS/PRIME )");
  } catch (e: any) {
    console.log("  getVerifiedNav(): REVERTED —", e.shortMessage || e.message);
  }
}

main().catch(console.error);
