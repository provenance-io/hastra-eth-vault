const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.MAINNET_RPC_URL);
  const txHash = "0xf5db95db2a2d10708ed6dc5eae57004baeecc7509937437fb8e0fbe6133bea2a";
  const tx = await provider.getTransaction(txHash);
  const receipt = await provider.getTransactionReceipt(txHash);
  const block = await provider.getBlock(tx.blockNumber);

  console.log("Block:", tx.blockNumber, new Date(block.timestamp*1000).toISOString());
  console.log("From (updater):", tx.from);
  console.log("To:", tx.to);
  console.log("Function selector:", tx.data.slice(0,10));

  const log = receipt.logs.find(l => l.address.toLowerCase() === "0xdf4ab20fa7752be52e41e42f1fd667f37964d6a3".toLowerCase());
  console.log("\nRaw log data:", log.data);

  // try decode as uint256 price + uint256 timestamp typical FeedVerifier update event
  const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["int192","uint256"], log.data.length === 130 ? log.data : log.data);
  console.log("Attempted decode:", decoded);
}
main().catch(console.error);
