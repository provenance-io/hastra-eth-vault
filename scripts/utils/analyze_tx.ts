import { ethers } from "hardhat";

async function main() {
  const txHash = "0xecabd99f5abb8e1ca66be6aeedc2474f7c016a671d514122e6a37d192ae094d3";
  const provider = ethers.provider;
  
  console.log(`Fetching details for tx: ${txHash}...`);
  const tx = await provider.getTransaction(txHash);
  const receipt = await provider.getTransactionReceipt(txHash);

  if (!tx || !receipt) {
    console.log("Transaction not found.");
    return;
  }

  console.log("\nTransaction Summary:");
  console.log("From (Sender):", tx.from);
  console.log("To (Interacted With):", tx.to);
  
  console.log("\nLogs Emitted:");
  for (const log of receipt.logs) {
    console.log("- Contract:", log.address);
  }
}

main().catch(console.error);
