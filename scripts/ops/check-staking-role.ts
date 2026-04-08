// @ts-ignore
import { ethers } from "hardhat";
async function main() {
  const yieldVault = await ethers.getContractAt("YieldVault", "0x0258787Eb97DD01436B562943D8ca85B772D7b98");
  const REWARDS_ADMIN = await yieldVault.REWARDS_ADMIN_ROLE();
  const stakingVault = "0xFf22361Ca2590761A2429D4127b7FF25E79fdC04";
  const hasRole = await yieldVault.hasRole(REWARDS_ADMIN, stakingVault);
  console.log("StakingVault has REWARDS_ADMIN_ROLE on YieldVault:", hasRole);
}
main();
