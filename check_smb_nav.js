const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.MAINNET_RPC_URL);
  const smbStaking = "0xBd49537Cc9105E8c1651Ed12b94cD9A3D79Bf3d9";
  const abi = [
    "function navOracle() view returns (address)",
    "function navFeedId() view returns (bytes32)",
    "function getVerifiedNav() view returns (uint256)",
    "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
    "function UPGRADER_ROLE() view returns (bytes32)",
    "function PAUSER_ROLE() view returns (bytes32)",
    "function NAV_ORACLE_UPDATER_ROLE() view returns (bytes32)",
    "function hasRole(bytes32,address) view returns (bool)",
  ];
  const vault = new ethers.Contract(smbStaking, abi, provider);

  let navOracle, navFeedId, nav;
  try { navOracle = await vault.navOracle(); } catch(e) { navOracle = "ERROR: " + e.reason || e.message; }
  try { navFeedId = await vault.navFeedId(); } catch(e) { navFeedId = "ERROR: " + e.reason || e.message; }
  try { nav = await vault.getVerifiedNav(); } catch(e) { nav = "ERROR: " + (e.reason || e.shortMessage || e.message); }

  console.log("navOracle:", navOracle);
  console.log("navFeedId:", navFeedId);
  console.log("getVerifiedNav():", nav);

  // check if NAV_ORACLE_UPDATER_ROLE exists as a named getter (constant name may differ)
  const code = await provider.getCode(smbStaking);
  console.log("\ncode length:", code.length);
}
main().catch(console.error);
