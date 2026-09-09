import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    holesky: {
      url: process.env.HOLESKY_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 17000,
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 1,
    },
    fuji: {
      url: process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 43113,
      // This RPC rejects "pending" block-tag queries (used internally by ethers
      // for gas estimation) with "state not available for pending block".
      // Setting an explicit gas limit/price skips that estimation call.
      gasPrice: 30000000000, // 30 Gwei (Fuji base fee is near-zero; padded for headroom)
      gas: 8000000, // 8M gas limit
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 40000,
  },
};

export default config;
