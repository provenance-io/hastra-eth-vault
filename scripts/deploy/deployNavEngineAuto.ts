/**
 * [DEPLOY] Deploy HastraAutoNavEngine — the AUTO-branded NAV engine.
 *
 * Thin wrapper over scripts/deploy/deployNavEngine.ts that deploys
 * HastraAutoNavEngine (a thin subclass of HastraNavEngine, identical logic,
 * distinct on-chain identity for block-explorer clarity).
 *
 * Usage:
 *   npx hardhat run scripts/deploy/deployNavEngineAuto.ts --network sepolia
 *
 * Env vars (all optional):
 *   OWNER_ADDRESS            - Initial owner (defaults to deployer)
 *   UPDATER_ADDRESS          - Bot wallet that calls updateRate() (defaults to deployer)
 *   MAX_DIFFERENCE_PERCENT   - Max TVL change per update in wei (default: 1e17 = 10%)
 *   MIN_RATE                 - Minimum NAV rate as int192 (default: 5e17 = 0.5)
 *   MAX_RATE                 - Maximum NAV rate as int192 (default: 3e18 = 3.0)
 *
 * Writes to deployment_nav_auto_<network>.json (overwrite-safe).
 *
 * Post-deploy:
 *   cast send <AUTO_STAKING_VAULT_PROXY> "setNavOracle(address,bytes32)" \
 *     <AUTO_NAV_PROXY> <AUTO_FEED_ID> --rpc-url "$RPC" --ledger
 */
import { deployNavEngineInstance } from "./deployNavEngine";

async function main() {
    await deployNavEngineInstance({
        contractName: "HastraAutoNavEngine",
        verifyContract: "contracts/chainlink/HastraAutoNavEngine.sol:HastraAutoNavEngine",
        outputFilePrefix: "deployment_nav_auto",
        label: "Auto NAV Engine",
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
