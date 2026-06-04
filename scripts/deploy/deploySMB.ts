/**
 * [DEPLOY] Deploy SMBStakingVault — the SMB-branded staking vault.
 *
 * Thin wrapper over scripts/deploy/deployAutoStaking.ts that swaps the
 * Solidity contract from AutoStakingVault to SMBStakingVault (a separate
 * thin subclass of StakingVault — identical logic, distinct on-chain
 * identity for block-explorer clarity).
 *
 * Usage:
 *   npx hardhat run scripts/deploy/deploySMB.ts --network sepolia
 *   DRY_RUN=true npx hardhat run scripts/deploy/deploySMB.ts --network sepolia
 *
 * Required env vars (testnet/mainnet):
 *   YIELD_VAULT_ADDRESS     - Address of an already-deployed YieldVault proxy
 *                             (REQUIRED on any non-local network — script will
 *                             throw rather than silently deploy fresh test
 *                             collateral + a new YieldVault).
 *
 * Optional env vars:
 *   FREEZE_ADMIN_ADDRESS         - Who can freeze/thaw accounts (defaults to deployer)
 *   REWARDS_ADMIN_ADDRESS        - Who can call distributeRewards (defaults to deployer)
 *   NAV_ORACLE_UPDATER_ADDRESS   - Who can call setNavOracle (defaults to deployer)
 *   SMB_TOKEN_NAME               - Override ERC20 name (default: "SMB Token")
 *   SMB_TOKEN_SYMBOL             - Override ERC20 symbol (default: "SMB")
 *
 * Post-deploy: SMB needs its own NAV oracle. Deploy a HastraNavEngine instance
 * (scripts/deploy/deployNavEngine.ts), then call setNavOracle(navEngine, feedId)
 * on the SMB proxy before the first deposit.
 */
import { deployAutoStakingInstance } from "./deployAutoStaking";

async function main() {
  await deployAutoStakingInstance({
    envPrefix: "SMB",
    defaultName: "SMB Token",
    defaultSymbol: "SMB",
    outputSuffix: "smb",
    label: "SMBStakingVault — SMB",
    contractName: "SMBStakingVault",
    verifyContract: "contracts/SMBStakingVault.sol:SMBStakingVault",
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
