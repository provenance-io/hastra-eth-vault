/**
 * approve-redeem-vault.ts
 *
 * One-time setup: the redeemVault EOA approves the YieldVault to pull USDC on its behalf.
 * Must be run by whoever controls the redeemVault address (e.g. 0xA8C3...).
 *
 * Usage:
 *   PRIVATE_KEY=0x...                  # redeemVault EOA private key
 *   MAINNET_RPC_URL=https://...
 *   YIELD_VAULT_ADDRESS=0x6aD038cA6C04e885630851278ca0a856Ad9a66Cc   # optional override
 *   APPROVAL_AMOUNT=10000000           # USDC amount to approve (default: 10,000,000). Use "max" for MaxUint256.
 *   DRY_RUN=true                       # optional: simulate without sending tx
 *     npx hardhat run scripts/admin/approve-redeem-vault.ts --network mainnet
 */

import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const IERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function symbol() external view returns (string)",
];

const YIELD_VAULT_ABI = [
  "function asset() external view returns (address)",
  "function redeemVault() external view returns (address)",
];

async function main() {
  const dryRun = process.env.DRY_RUN === "true";
  const [signer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? "mainnet" : network.name;

  // Resolve YieldVault address
  const deploymentFile = path.join(
    __dirname,
    `../../deployment_${networkName}.json`
  );
  let yieldVaultAddress = process.env.YIELD_VAULT_ADDRESS || "";
  if (!yieldVaultAddress && fs.existsSync(deploymentFile)) {
    const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    yieldVaultAddress = deployment.contracts?.yieldVault || "";
  }
  if (!yieldVaultAddress) {
    throw new Error(
      "YieldVault address not found. Set YIELD_VAULT_ADDRESS env var."
    );
  }

  const yieldVault = new ethers.Contract(
    yieldVaultAddress,
    YIELD_VAULT_ABI,
    signer
  );

  // Hardcoded mainnet USDC — never read from .env to avoid mock overrides
  const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const redeemVaultAddress = await yieldVault.redeemVault();

  console.log(`\nNetwork:       ${networkName}`);
  console.log(`Signer:        ${signer.address}`);
  console.log(`YieldVault:    ${yieldVaultAddress}`);
  console.log(`USDC:          ${usdcAddress}`);
  console.log(`redeemVault:   ${redeemVaultAddress}`);
  if (dryRun) console.log(`Mode:          DRY RUN (no tx will be sent)`);

  if (signer.address.toLowerCase() !== redeemVaultAddress.toLowerCase()) {
    console.warn(
      `\n⚠️  Warning: signer (${signer.address}) is not the current redeemVault (${redeemVaultAddress}).`
    );
    console.warn(
      "   The approval will be set from the signer, not the redeemVault."
    );
    console.warn(
      "   Only proceed if you intend to pre-approve from this address.\n"
    );
  }

  const usdc = new ethers.Contract(usdcAddress, IERC20_ABI, signer);

  // Default approval: 100,000 USDC. Override with APPROVAL_AMOUNT env var (human-readable).
  const approvalEnv = process.env.APPROVAL_AMOUNT || "100000";
  const approvalAmount = ethers.parseUnits(approvalEnv, 6);
  const approvalDisplay = `${ethers.formatUnits(approvalAmount, 6)} USDC`;

  const currentAllowance = await usdc.allowance(signer.address, yieldVaultAddress);
  const currentDisplay = currentAllowance === ethers.MaxUint256
    ? "MaxUint256 (unlimited)"
    : `${ethers.formatUnits(currentAllowance, 6)} USDC`;

  console.log(`\nApproval amount:   ${approvalDisplay}`);
  console.log(`Current allowance: ${currentDisplay}`);

  if (currentAllowance >= approvalAmount) {
    console.log("✅ Allowance already sufficient. Nothing to do.");
    return;
  }

  console.log("Approving YieldVault to spend USDC from redeemVault...");
  if (dryRun) {
    console.log(`✅ DRY RUN — would approve ${approvalDisplay}. No tx sent.`);
    return;
  }
  const tx = await usdc.approve(yieldVaultAddress, approvalAmount);
  console.log(`Tx submitted: ${tx.hash}`);
  await tx.wait();
  console.log(`✅ Approved ${approvalDisplay}. YieldVault can now pull USDC from ${signer.address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
