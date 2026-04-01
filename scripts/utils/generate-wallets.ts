/**
 * Generate one or more fresh Ethereum wallets and save addresses to a JSON file.
 * Private keys are printed ONCE to stdout — store them in your secrets manager immediately.
 * Only public addresses are written to the output file.
 *
 * Usage:
 *   npx hardhat run scripts/utils/generate-wallets.ts
 *
 * Optional env vars:
 *   COUNT      - Number of wallets to generate (default: 1)
 *   LABEL      - Label prefix for each wallet (default: "wallet")
 *   OUTPUT     - Output JSON filename (default: generated_wallets_<timestamp>.json)
 *
 * Examples:
 *   COUNT=3 LABEL=signer npx hardhat run scripts/utils/generate-wallets.ts
 *   COUNT=2 LABEL=bot    npx hardhat run scripts/utils/generate-wallets.ts
 */
import { ethers } from "ethers";
import * as fs from "fs";

async function main() {
  const count = parseInt(process.env.COUNT || "1", 10);
  const label = process.env.LABEL || "wallet";
  const outputFile = process.env.OUTPUT || `generated_wallets_${Date.now()}.json`;

  console.log(`\nGenerating ${count} wallet(s)...\n`);

  const wallets: { label: string; address: string }[] = [];

  for (let i = 0; i < count; i++) {
    const wallet = ethers.Wallet.createRandom();
    const walletLabel = count === 1 ? label : `${label}_${i + 1}`;

    console.log(`${"─".repeat(50)}`);
    console.log(`  Label:   ${walletLabel}`);
    console.log(`  Address: ${wallet.address}`);
    console.log(`  Key:     ${wallet.privateKey}   ← store this securely, never share`);
    if (wallet.mnemonic) {
      console.log(`  Mnemonic: ${wallet.mnemonic.phrase}   ← store this securely, never share`);
    }

    wallets.push({ label: walletLabel, address: wallet.address });
  }

  console.log(`${"─".repeat(50)}`);
  console.log(`\n⚠️  Private keys shown above will NOT be saved to any file.`);
  console.log(`   Store them in your secrets manager NOW before closing this terminal.\n`);

  // Save only public addresses
  const output = {
    generatedAt: new Date().toISOString(),
    count,
    wallets,
  };
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`✅ Public addresses saved to: ${outputFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
