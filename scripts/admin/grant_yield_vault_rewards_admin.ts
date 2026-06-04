/**
 * [ADMIN] Grant YieldVault.REWARDS_ADMIN_ROLE to a freshly-deployed staking vault
 * (StakingVault, AutoStakingVault, or any AccessControl-aware contract that
 * needs to mint wYLDS rewards via YieldVault.distributeRewards).
 *
 * On any non-local network, YieldVault.DEFAULT_ADMIN_ROLE is typically held by
 * a Safe (or another multi-sig). This script does the right thing in both
 * cases:
 *
 *   - If the signer holds DEFAULT_ADMIN_ROLE, it broadcasts grantRole directly.
 *   - Otherwise, it prints the YieldVault address, raw calldata, and a brief
 *     Safe Transaction Builder hand-off so the Safe owner can submit the tx.
 *
 * Usage:
 *   YIELD_VAULT_ADDRESS=0x... \
 *   VAULT_ADDRESS=0x... \
 *     npx hardhat run scripts/admin/grant_yield_vault_rewards_admin.ts --network sepolia
 *
 *   # Force-print Safe calldata even when signer holds DEFAULT_ADMIN:
 *   FORCE_CALLDATA=true ... npx hardhat run ...
 *
 *   # Dry-run only (validates inputs, prints calldata, sends nothing):
 *   DRY_RUN=true ... npx hardhat run ...
 */
// @ts-ignore
import { ethers } from "hardhat";

async function main() {
  const yieldVaultAddress = process.env.YIELD_VAULT_ADDRESS;
  const vaultAddress = process.env.VAULT_ADDRESS;
  const dryRun = process.env.DRY_RUN === "true";
  const forceCalldata = process.env.FORCE_CALLDATA === "true";

  if (!yieldVaultAddress || !ethers.isAddress(yieldVaultAddress)) {
    throw new Error("YIELD_VAULT_ADDRESS env var must be a valid address");
  }
  if (!vaultAddress || !ethers.isAddress(vaultAddress)) {
    throw new Error("VAULT_ADDRESS env var (the grantee staking vault) must be a valid address");
  }

  const [signer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log(`Network:           ${network.name} (chainId ${network.chainId})`);
  console.log(`Signer:            ${signer.address}`);
  console.log(`YieldVault:        ${yieldVaultAddress}`);
  console.log(`Grantee vault:     ${vaultAddress}`);

  const yv = await ethers.getContractAt("YieldVault", yieldVaultAddress);
  const REWARDS_ADMIN_ROLE = await yv.REWARDS_ADMIN_ROLE();
  const DEFAULT_ADMIN_ROLE = await yv.DEFAULT_ADMIN_ROLE();

  // No-op if already granted
  const alreadyGranted = await yv.hasRole(REWARDS_ADMIN_ROLE, vaultAddress);
  if (alreadyGranted) {
    console.log(`\n✅ Grantee already holds YieldVault.REWARDS_ADMIN_ROLE — no action needed.`);
    return;
  }

  // Encode calldata once — used by both the direct send and Safe paths
  const calldata = yv.interface.encodeFunctionData("grantRole", [REWARDS_ADMIN_ROLE, vaultAddress]);
  console.log(`\nRole hash:         ${REWARDS_ADMIN_ROLE}`);
  console.log(`Calldata:          ${calldata}`);

  const signerIsAdmin = await yv.hasRole(DEFAULT_ADMIN_ROLE, signer.address);

  if (signerIsAdmin && !forceCalldata) {
    console.log(`\n✅ Signer holds DEFAULT_ADMIN_ROLE on YieldVault — broadcasting grantRole.`);
    if (dryRun) {
      console.log(`(DRY_RUN=true — not broadcasting.)`);
      return;
    }
    const tx = await (yv as any).grantRole(REWARDS_ADMIN_ROLE, vaultAddress);
    console.log(`Tx:                ${tx.hash}`);
    await tx.wait();
    console.log(`✅ Confirmed.`);

    const ok = await yv.hasRole(REWARDS_ADMIN_ROLE, vaultAddress);
    console.log(`Post-state:        hasRole(REWARDS_ADMIN, vault) = ${ok}`);
    return;
  }

  // Hand-off path — print Safe-ready data
  console.log(
    `\n⚠️  Signer ${signer.address} does NOT hold DEFAULT_ADMIN_ROLE on YieldVault.\n` +
    `   The current YieldVault admin (likely a Safe) must submit the grantRole tx.\n`
  );
  console.log(`────── Safe Transaction Builder ──────`);
  console.log(`  To:        ${yieldVaultAddress}`);
  console.log(`  Value:     0`);
  console.log(`  Data:      ${calldata}`);
  console.log(`  Operation: Call (0)`);
  console.log(`──────────────────────────────────────`);
  console.log(`\nEquivalent cast command (if the YV admin is an EOA / hardware wallet):`);
  console.log(`  cast send ${yieldVaultAddress} \\`);
  console.log(`    "grantRole(bytes32,address)" \\`);
  console.log(`    ${REWARDS_ADMIN_ROLE} \\`);
  console.log(`    ${vaultAddress} \\`);
  console.log(`    --rpc-url "$RPC_URL" --ledger`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
