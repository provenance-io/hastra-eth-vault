/**
 * [UTIL] Calculate the ERC-7201 namespaced storage slot for HastraNavEngine.
 *
 * Usage:
 *   npx hardhat run scripts/utils/calculateStorageSlot.ts
 */
import { ethers } from "hardhat";

async function main() {
  // ERC-7201: keccak256(abi.encode(uint256(keccak256("hastra.storage.NavEngine")) - 1)) & ~bytes32(uint256(0xff))
  
  const namespace = "hastra.storage.NavEngine";
  
  // Step 1: keccak256("hastra.storage.NavEngine")
  const hash1 = ethers.keccak256(ethers.toUtf8Bytes(namespace));
  console.log("Step 1 - keccak256(namespace):", hash1);
  
  // Step 2: Convert to BigInt and subtract 1
  const hash1BigInt = BigInt(hash1);
  const minusOne = hash1BigInt - 1n;
  console.log("Step 2 - hash - 1:", "0x" + minusOne.toString(16));
  
  // Step 3: keccak256(abi.encode(result))
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [minusOne]);
  const hash2 = ethers.keccak256(encoded);
  console.log("Step 3 - keccak256(abi.encode(hash-1)):", hash2);
  
  // Step 4: Mask off last byte (&~0xff)
  const hash2BigInt = BigInt(hash2);
  const mask = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00");
  const finalSlot = hash2BigInt & mask;
  const finalSlotHex = "0x" + finalSlot.toString(16).padStart(64, "0");
  
  console.log("\n✅ Final ERC-7201 Storage Slot:");
  console.log(finalSlotHex);
  
  console.log("\nFormatted for Solidity:");
  console.log(`bytes32 private constant NAV_ENGINE_STORAGE_SLOT =`);
  console.log(`    ${finalSlotHex};`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
