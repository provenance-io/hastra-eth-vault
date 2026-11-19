const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.MAINNET_RPC_URL);
  const FV = "0xdF4ab20fA7752Be52E41e42F1FD667f37964d6a3";
  const smbFeedId = "0x00076f0ebf018138682718578c470922765bbc424d02aef426ddfb6f37a623b4";

  const abi = [
    "function priceOf(bytes32) view returns (int192)",
    "function timestampOf(bytes32) view returns (uint32)",
    "function defaultMaxStaleness() view returns (uint32)",
    "function maxStalenessByFeed(bytes32) view returns (uint32)",
  ];
  const fv = new ethers.Contract(FV, abi, provider);

  for (const [label, fn, arg] of [
    ["priceOf", "priceOf", smbFeedId],
    ["timestampOf", "timestampOf", smbFeedId],
    ["defaultMaxStaleness", "defaultMaxStaleness", null],
    ["maxStalenessByFeed", "maxStalenessByFeed", smbFeedId],
  ]) {
    try {
      const result = arg !== null ? await fv[fn](arg) : await fv[fn]();
      console.log(`${label}:`, result.toString());
    } catch (e) {
      console.log(`${label}: REVERTED -`, e.reason || e.shortMessage || e.message);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  console.log("\ncurrent unix time:", now);
}
main().catch(console.error);
