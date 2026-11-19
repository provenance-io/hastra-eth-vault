const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.MAINNET_RPC_URL);
  const smbStaking = "0xBd49537Cc9105E8c1651Ed12b94cD9A3D79Bf3d9";
  const abi = [
    "function hasRole(bytes32,address) view returns (bool)",
    "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  ];
  const vault = new ethers.Contract(smbStaking, abi, provider);

  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
  const safeAdmin = "0x5f134E02dbDd7514E0E166f8D55BB2E6D06659b3";

  // We don't know DEPLOYER address for sure - check both known addrs from deployment file
  const candidates = {
    "safeAdmin (0x5f13...59b3)": safeAdmin,
    "navOracleUpdater (0x5f13...59b3 - same as admin per file)": safeAdmin,
  };

  for (const [label, addr] of Object.entries(candidates)) {
    const has = await vault.hasRole(DEFAULT_ADMIN_ROLE, addr);
    console.log(`${label} hasRole(DEFAULT_ADMIN_ROLE):`, has);
  }
}
main().catch(console.error);
