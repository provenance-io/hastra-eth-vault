// @ts-ignore
import { ethers } from "hardhat";
async function main() {
  const vault = await ethers.getContractAt("YieldVault", "0x0258787Eb97DD01436B562943D8ca85B772D7b98");
  const epochIndex = await vault.currentEpochIndex();
  console.log("currentEpochIndex:", epochIndex.toString());
  const epoch = await vault.rewardsEpochs(0);
  console.log("Epoch 0 root:     ", epoch.merkleRoot);
  console.log("Epoch 0 total:    ", ethers.formatUnits(epoch.totalRewards, 6), "wYLDS");
  console.log("Epoch 0 timestamp:", new Date(Number(epoch.timestamp) * 1000).toISOString());
  const claimed = await vault.hasClaimedRewards("0x3778F66336F79B2B0D86E759499D191EA030a4c6", 0);
  console.log("Deployer claimed: ", claimed);
}
main();
