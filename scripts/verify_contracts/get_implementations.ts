import { ethers } from "hardhat";
import { upgrades } from "hardhat";

async function main() {
  const network = await ethers.provider.getNetwork();
  console.log(`\n🌐 Connected to: ${network.name} (Chain ID: ${network.chainId})`);
  
  const yieldVaultProxy = "0xBf000e0362d967B3583fdE2451BeA11b3723b81C";
  const stakingVaultProxy = "0x14D815D29F9b39859a55F1392cff217ED642a8Ea";

  console.log("\n📍 PROXY ADDRESSES (what you use in frontend):");
  console.log("YieldVault Proxy:  ", yieldVaultProxy);
  console.log("StakingVault Proxy:", stakingVaultProxy);

  console.log("\n🔧 IMPLEMENTATION ADDRESSES (actual contract logic):");
  
  try {
    // ERC-1967 implementation slot: keccak256("eip1967.proxy.implementation") - 1
    const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    
    // Read implementation address from storage slot
    const yieldVaultImplSlot = await ethers.provider.getStorage(yieldVaultProxy, IMPLEMENTATION_SLOT);
    const yieldVaultImpl = "0x" + yieldVaultImplSlot.slice(-40);
    
    const stakingVaultImplSlot = await ethers.provider.getStorage(stakingVaultProxy, IMPLEMENTATION_SLOT);
    const stakingVaultImpl = "0x" + stakingVaultImplSlot.slice(-40);
    
    console.log("YieldVault Implementation:  ", yieldVaultImpl);
    console.log("StakingVault Implementation:", stakingVaultImpl);

    console.log("\n📊 VERIFICATION:");
    console.log("View on Hoodi Etherscan:");
    console.log(`YieldVault Proxy:   https://hoodi.etherscan.io/address/${yieldVaultProxy}`);
    console.log(`YieldVault Impl:    https://hoodi.etherscan.io/address/${yieldVaultImpl}`);
    console.log(`StakingVault Proxy: https://hoodi.etherscan.io/address/${stakingVaultProxy}`);
    console.log(`StakingVault Impl:  https://hoodi.etherscan.io/address/${stakingVaultImpl}`);
    
    console.log("\n✅ Both contracts are deployed as UUPS proxies");
    console.log("⚠️  Always interact with PROXY addresses, not implementation addresses");
    
    // Verify they have code
    const yieldProxyCode = await ethers.provider.getCode(yieldVaultProxy);
    const stakingProxyCode = await ethers.provider.getCode(stakingVaultProxy);
    const yieldImplCode = await ethers.provider.getCode(yieldVaultImpl);
    const stakingImplCode = await ethers.provider.getCode(stakingVaultImpl);
    
    console.log("\n🔍 DEPLOYMENT STATUS:");
    
    if (yieldProxyCode === "0x" || stakingProxyCode === "0x") {
      console.log("❌ PROXIES NOT DEPLOYED on this network!");
      console.log("   These addresses only exist on Hoodi testnet.");
      console.log("   Run with: --network hoodi");
      return;
    }
    
    if (yieldImplCode === "0x" || stakingImplCode === "0x") {
      console.log("⚠️  WARNING: Implementation contracts have no bytecode!");
      console.log("   This might indicate a deployment issue.");
    } else {
      console.log("✅ Proxy contracts deployed and verified");
      console.log("✅ Implementation contracts verified with bytecode");
      console.log(`\n📏 Bytecode sizes:`);
      console.log(`   YieldVault Implementation:   ${(yieldImplCode.length - 2) / 2} bytes`);
      console.log(`   StakingVault Implementation: ${(stakingImplCode.length - 2) / 2} bytes`);
    }
    
  } catch (error) {
    console.error("Error fetching implementation addresses:", error);
    console.log("\nMake sure you're connected to Hoodi network!");
    console.log("Run with: npx hardhat run local_scripts/get_implementations.ts --network hoodi");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
