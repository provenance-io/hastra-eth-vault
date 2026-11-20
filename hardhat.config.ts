import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true, // Enable IR-based code generation for better optimization
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      forking: process.env.MAINNET_RPC_URL
        ? {
            url: process.env.MAINNET_RPC_URL,
            enabled: false,
          }
        : undefined,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    hoodi: {
      url: process.env.HOODI_RPC_URL || "https://rpc.hoodi.tech",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 560048,
      gasPrice: 20000000000, // 20 Gwei
      gas: 8000000, // 8M gas limit
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
    "base-sepolia": {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532,
      // Base's fast block times can land consecutive script txs in the same
      // block, so an in-script gas estimate for tx N+1 can race against tx N's
      // block still propagating to "latest" (same root cause as the Fuji
      // pending-block issue). Explicit gas/gasPrice skips estimation entirely.
      gasPrice: 6000000, // ~0.006 Gwei (current Base Sepolia base fee)
      gas: 8000000, // 8M gas limit
    },
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 8453,
    },
    "ink-sepolia": {
      url: process.env.INK_SEPOLIA_RPC_URL || "https://rpc-gel-sepolia.inkonchain.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 763373,
    },
    "robinhood-testnet": {
      url: process.env.ROBINHOOD_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 46630,
      gasPrice: 10000000, // 0.01 Gwei (current Robinhood testnet gas price)
      gas: 8000000, // 8M gas limit
    },
    "tempo-moderato": {
      url: process.env.TEMPO_MODERATO_RPC_URL || "https://rpc.moderato.tempo.xyz",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 42431,
      // No fixed gas limit: Tempo's TIP-1000 pricing (1,000 gas/byte of code,
      // 250k per new storage slot) puts vault impl deploys near 19M gas, which
      // the node's eth_estimateGas accounts for. Fees are paid in pathUSD, not
      // a native token, so the deployer must hold pathUSD.
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    outputFile: "gas-report.txt",
    noColors: true,
  },
  sourcify: {
    enabled: false,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
    customChains: [
      {
        network: "sepolia",
        chainId: 11155111,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=11155111",
          browserURL: "https://sepolia.etherscan.io"
        }
      },
      {
        network: "hoodi",
        chainId: 560048,
        urls: {
          apiURL: "https://hoodi.etherscan.io/api",
          browserURL: "https://hoodi.etherscan.io"
        }
      },
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org"
        }
      },
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=8453",
          browserURL: "https://basescan.org"
        }
      },
      {
        network: "ink-sepolia",
        chainId: 763373,
        urls: {
          // Blockscout instance (etherscan-compatible API)
          apiURL: "https://explorer-sepolia.inkonchain.com/api",
          browserURL: "https://explorer-sepolia.inkonchain.com"
        }
      },
      {
        network: "robinhood-testnet",
        chainId: 46630,
        urls: {
          // Blockscout instance (etherscan-compatible API)
          apiURL: "https://explorer.testnet.chain.robinhood.com/api",
          browserURL: "https://explorer.testnet.chain.robinhood.com"
        }
      }
    ]
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
