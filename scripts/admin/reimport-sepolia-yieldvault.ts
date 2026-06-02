import { ethers, upgrades } from "hardhat";

/**
 * One-time Sepolia manifest cleanup.
 *
 * Background: Sepolia went through a V1 → V3 (rename + contractURI) → ...
 * detour. The OZ manifest at .openzeppelin/sepolia.json therefore records
 * `_contractURIValue` as part of the current impl's storage layout. When
 * preparing the V2 (role-split) upgrade, OZ's storage check sees V2 dropping
 * that variable and aborts with a "deleted storage variable" error.
 *
 * This script tells OZ "forget the V3 detour ever happened; baseline is V1
 * (YieldVault) layout." It does NOT touch chain state — only rewrites
 * .openzeppelin/sepolia.json. Mainnet manifest is untouched.
 *
 * Run once before the V2 prepare-upgrade script. After the V2 upgrade
 * lands on Sepolia, this file can be deleted.
 */
async function main() {
  const PROXY = "0x0258787Eb97DD01436B562943D8ca85B772D7b98";
  const YieldVault = await ethers.getContractFactory("YieldVault");
  console.log(`Force-importing proxy ${PROXY} as YieldVault (V1) baseline...`);
  await upgrades.forceImport(PROXY, YieldVault, { kind: "uups" });
  console.log("✅ Manifest rewritten. Sepolia manifest now baselined to YieldVault (V1).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
