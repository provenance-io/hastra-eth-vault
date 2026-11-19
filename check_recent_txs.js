const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.MAINNET_RPC_URL);
  const navOracle = "0xdF4ab20fA7752Be52E41e42F1FD667f37964d6a3";

  // Get all logs (any topic) around block 25847196 to find the actual state-changing tx
  const logs = await provider.getLogs({
    address: navOracle,
    fromBlock: 25847188,
    toBlock: 25847196,
  });
  console.log(`Logs at navOracle in range 25847188-25847196: ${logs.length}`);
  for (const l of logs) {
    console.log(`block=${l.blockNumber} tx=${l.transactionHash} topics=${l.topics}`);
  }

  // check code size / a few view functions
  const abi = [
    "function decimals() view returns (uint8)",
    "function description() view returns (string)",
    "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  ];
  const c = new ethers.Contract(navOracle, abi, provider);
  try { console.log("decimals:", await c.decimals()); } catch(e){ console.log("no decimals()"); }
  try { console.log("description:", await c.description()); } catch(e){ console.log("no description()"); }
  try { console.log("latestRoundData:", await c.latestRoundData()); } catch(e){ console.log("no latestRoundData()"); }
}
main().catch(console.error);
