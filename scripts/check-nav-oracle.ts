// @ts-ignore
import { ethers } from "hardhat";

async function main() {
  const proxy = "0xFf22361Ca2590761A2429D4127b7FF25E79fdC04";
  const vault = await ethers.getContractAt("StakingVault", proxy);

  const [navOracle, navStaleness, navFeedId] = await Promise.all([
    vault.navOracle(),
    vault.navStalenessLimit(),
    vault.navFeedId(),
  ]);

  console.log("StakingVault NAV Oracle state:");
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
