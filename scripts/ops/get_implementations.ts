/**
 * [OPS] Read proxy and implementation addresses for all deployed contracts.
 * Displays bytecode verification status and block explorer links.
 *
 * Usage:
 *   npx hardhat run scripts/ops/get_implementations.ts --network sepolia
 *   npx hardhat run scripts/ops/get_implementations.ts --network hoodi
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface DeploymentInfo {
  network: string;
  chainId: string;
  contracts: {
    usdc: string;
    yieldVault: string;
    stakingVault: string;
  };
}

// Explorer URLs for different networks
const EXPLORER_URLS: Record<string, string> = {
  "1": "https://etherscan.io",
  "11155111": "https://sepolia.etherscan.io",
  "560048": "https://hoodi.etherscan.io",
  "137": "https://polygonscan.com",
  "80001": "https://mumbai.polygonscan.com",
};

function loadDeploymentInfo(networkName: string, chainId: bigint): DeploymentInfo | null {
  const projectRoot = path.join(__dirname, "..", "..");
  
  // Map of network names to their deployment files (in priority order)
  const networkFiles: Record<string, string[]> = {
    "localhost": ["deployment.json"],
    "hardhat": ["deployment.json"],
    "mainnet": ["deployment_mainnet.json", "deployment.json"],
    "sepolia": ["deployment_sepolia.json", "deployment_testnet_sepolia.json", "deployment_testnet.json"],
    "hoodi": ["deployment_hoodi.json", "deployment_testnet_hoodi.json", "deployment_testnet.json"],
    "goerli": ["deployment_goerli.json", "deployment_testnet.json"],
    "polygon": ["deployment_polygon.json", "deployment_mainnet.json"],
    "mumbai": ["deployment_mumbai.json", "deployment_testnet.json"],
  };
  
  // Try network-specific files first, or generic pattern
  const possibleFiles = networkFiles[networkName] || [`deployment_${networkName}.json`];
  
  for (const fileName of possibleFiles) {
    const deploymentPath = path.join(projectRoot, fileName);
    
    if (fs.existsSync(deploymentPath)) {
      const data = fs.readFileSync(deploymentPath, "utf-8");
      const deployment = JSON.parse(data) as DeploymentInfo;
      
      console.log(`📄 Loaded from: ${fileName}`);
      
      // Verify chain ID matches
      if (deployment.chainId !== chainId.toString()) {
        console.log(`⚠️  Warning: File chain ID (${deployment.chainId}) ≠ Connected chain ID (${chainId})`);
        console.log(`   File is for: ${deployment.network} (chain ${deployment.chainId})`);
        console.log(`   Connected to: ${networkName} (chain ${chainId})`);
        console.log(`   Skipping this file...\n`);
        continue; // Try next file
      }
      
      return deployment;
    }
  }
  
  return null;
}

function getExplorerUrl(chainId: string): string {
  return EXPLORER_URLS[chainId] || "https://etherscan.io";
}

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId.toString();
  
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║          CONTRACT IMPLEMENTATION ADDRESS CHECKER              ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  
  console.log(`\n🌐 Network: ${network.name}`);
  console.log(`🔗 Chain ID: ${chainId}`);
  
  // Load deployment info
  const deployment = loadDeploymentInfo(network.name, network.chainId);
  
  if (!deployment) {
    console.log("\n❌ No deployment file found!");
    console.log("   Expected files for this network:");
    
    // Show expected files for this network
    const networkFiles: Record<string, string[]> = {
      "mainnet": ["deployment_mainnet.json", "deployment.json"],
      "sepolia": ["deployment_sepolia.json", "deployment_testnet_sepolia.json", "deployment_testnet.json"],
      "hoodi": ["deployment_hoodi.json", "deployment_testnet_hoodi.json", "deployment_testnet.json"],
      "localhost": ["deployment.json"],
    };
    
    const expectedFiles = networkFiles[network.name] || [`deployment_${network.name}.json`];
    expectedFiles.forEach(file => console.log(`   - ${file}`));
    
    console.log("\n   Deploy contracts first with:");
    console.log(`   npx hardhat run scripts/deploy.ts --network ${network.name}`);
    return;
  }

  const yieldVaultProxy = deployment.contracts.yieldVault;
  const stakingVaultProxy = deployment.contracts.stakingVault;
  const usdcAddress = deployment.contracts.usdc;
  const explorerUrl = getExplorerUrl(chainId);

  console.log("\n📍 PROXY ADDRESSES (what you interact with):");
  console.log("┌─────────────────┬──────────────────────────────────────────────┐");
  console.log("│ YieldVault      │", yieldVaultProxy.padEnd(43), "│");
  console.log("│ StakingVault    │", stakingVaultProxy.padEnd(43), "│");
  console.log("│ USDC            │", usdcAddress.padEnd(43), "│");
  console.log("└─────────────────┴──────────────────────────────────────────────┘");

  try {
    // ERC-1967 implementation slot: keccak256("eip1967.proxy.implementation") - 1
    const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    
    // Read implementation addresses from storage slot
    const yieldVaultImplSlot = await ethers.provider.getStorage(yieldVaultProxy, IMPLEMENTATION_SLOT);
    const yieldVaultImpl = "0x" + yieldVaultImplSlot.slice(-40);
    
    const stakingVaultImplSlot = await ethers.provider.getStorage(stakingVaultProxy, IMPLEMENTATION_SLOT);
    const stakingVaultImpl = "0x" + stakingVaultImplSlot.slice(-40);
    
    console.log("\n🔧 IMPLEMENTATION ADDRESSES (actual contract logic):");
    console.log("┌─────────────────┬──────────────────────────────────────────────┐");
    console.log("│ YieldVault      │", yieldVaultImpl.padEnd(43), "│");
    console.log("│ StakingVault    │", stakingVaultImpl.padEnd(43), "│");
    console.log("└─────────────────┴──────────────────────────────────────────────┘");

    // Verify contracts have bytecode
    const yieldProxyCode = await ethers.provider.getCode(yieldVaultProxy);
    const stakingProxyCode = await ethers.provider.getCode(stakingVaultProxy);
    const yieldImplCode = await ethers.provider.getCode(yieldVaultImpl);
    const stakingImplCode = await ethers.provider.getCode(stakingVaultImpl);
    
    console.log("\n🔍 DEPLOYMENT STATUS:");
    
    if (yieldProxyCode === "0x" || stakingProxyCode === "0x") {
      console.log("❌ PROXIES NOT DEPLOYED on this network!");
      console.log(`   The addresses from deployment file are for: ${deployment.network}`);
      console.log(`   You are connected to: ${network.name}`);
      console.log("\n   Make sure you're on the correct network!");
      return;
    }
    
    if (yieldImplCode === "0x" || stakingImplCode === "0x") {
      console.log("⚠️  WARNING: Implementation contracts have no bytecode!");
      console.log("   This might indicate a deployment issue.");
    } else {
      console.log("✅ Proxy contracts deployed and verified");
      console.log("✅ Implementation contracts verified with bytecode");
      console.log(`\n📏 Bytecode Sizes:`);
      console.log(`   YieldVault:   ${((yieldImplCode.length - 2) / 2).toLocaleString()} bytes`);
      console.log(`   StakingVault: ${((stakingImplCode.length - 2) / 2).toLocaleString()} bytes`);
    }
    
    console.log("\n📊 BLOCK EXPLORER LINKS:");
    console.log("┌─────────────────────────────────────────────────────────────────┐");
    console.log("│ Proxy Contracts (interact with these)                          │");
    console.log("├─────────────────────────────────────────────────────────────────┤");
    console.log(`│ YieldVault:   ${explorerUrl}/address/${yieldVaultProxy}`);
    console.log(`│ StakingVault: ${explorerUrl}/address/${stakingVaultProxy}`);
    console.log(`│ USDC:         ${explorerUrl}/address/${usdcAddress}`);
    console.log("├─────────────────────────────────────────────────────────────────┤");
    console.log("│ Implementation Contracts (don't interact with these)           │");
    console.log("├─────────────────────────────────────────────────────────────────┤");
    console.log(`│ YieldVault:   ${explorerUrl}/address/${yieldVaultImpl}`);
    console.log(`│ StakingVault: ${explorerUrl}/address/${stakingVaultImpl}`);
    console.log("└─────────────────────────────────────────────────────────────────┘");
    
    console.log("\n⚠️  IMPORTANT:");
    console.log("   • Always interact with PROXY addresses");
    console.log("   • Implementation addresses are for reference only");
    console.log("   • Proxy addresses never change (even after upgrades)");
    console.log("   • Implementation addresses change when upgraded\n");
    
  } catch (error) {
    console.error("\n❌ Error fetching implementation addresses:", error);
    console.log(`\n   Make sure you're connected to the correct network!`);
    console.log(`   Run with: npx hardhat run scripts/verify_contracts/get_implementations.ts --network ${deployment.network}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
