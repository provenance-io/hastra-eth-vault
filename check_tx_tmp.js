const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.MAINNET_RPC_URL);
  const txHash = "0x688f7d652e9626cdff7769af2389bfb1033b2142b619cfea08d49bda9e26b32b";
  const receipt = await provider.getTransactionReceipt(txHash);
  const tx = await provider.getTransaction(txHash);
  console.log("Block:", receipt.blockNumber);
  console.log("To:", tx.to);
  console.log("From:", tx.from);
  console.log("Status:", receipt.status);
  console.log("Logs count:", receipt.logs.length);
  receipt.logs.forEach((l, i) => {
    console.log(`\nLog ${i}: address=${l.address}`);
    console.log("topics:", l.topics);
    console.log("data:", l.data);
  });
}
main().catch(console.error);
