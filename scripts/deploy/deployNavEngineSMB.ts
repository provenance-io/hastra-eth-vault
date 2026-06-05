/**
 * [DEPLOY] Deploy HastraSMBNavEngine — the SMB-branded NAV engine.
 *
 * Thin wrapper over scripts/deploy/deployNavEngine.ts that deploys
 * HastraSMBNavEngine (a thin subclass of HastraNavEngine, identical logic,
 * distinct on-chain identity for block-explorer clarity).
 *
 * Usage:
 *   npx hardhat run scripts/deploy/deployNavEngineSMB.ts --network sepolia
 *
 * Env vars (all optional):
 *   OWNER_ADDRESS            - Initial owner (defaults to deployer)
 *   UPDATER_ADDRESS          - Bot wallet that calls updateRate() (defaults to deployer)
 *   MAX_DIFFERENCE_PERCENT   - Max TVL change per update in wei (default: 1e17 = 10%)
 *   MIN_RATE                 - Minimum NAV rate as int192 (default: 5e17 = 0.5)
 *   MAX_RATE                 - Maximum NAV rate as int192 (default: 3e18 = 3.0)
 *
 * Writes to deployment_nav_smb_mainnet.json (mainnet) or
 *          deployment_nav_smb_testnet_<network>.json (others), overwrite-safe.
 *
 * Post-deploy:
 *   cast send <SMB_STAKING_VAULT_PROXY> "setNavOracle(address,bytes32)" \
 *     <SMB_NAV_PROXY> <SMB_FEED_ID> --rpc-url "$RPC" --ledger
 */
import { deployNavEngineInstance } from "./deployNavEngine";

async function main() {
    await deployNavEngineInstance({
        contractName: "HastraSMBNavEngine",
        verifyContract: "contracts/chainlink/HastraSMBNavEngine.sol:HastraSMBNavEngine",
        outputFilePrefix: "deployment_nav_smb",
        label: "SMB NAV Engine",
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
