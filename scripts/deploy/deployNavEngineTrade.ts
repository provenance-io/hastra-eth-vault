/**
 * [DEPLOY] Deploy HastraTradeNavEngine — the TRADE-branded NAV engine.
 *
 * Thin wrapper over scripts/deploy/deployNavEngine.ts that deploys
 * HastraTradeNavEngine (a thin subclass of HastraNavEngine, identical logic,
 * distinct on-chain identity for block-explorer clarity).
 *
 * Usage:
 *   npx hardhat run scripts/deploy/deployNavEngineTrade.ts --network sepolia
 *   npx hardhat run scripts/deploy/deployNavEngineTrade.ts --network mainnet
 *
 * Env vars (all optional):
 *   OWNER_ADDRESS            - Initial owner (defaults to deployer)
 *   UPDATER_ADDRESS          - Bot wallet that calls updateRate() (defaults to deployer)
 *   MAX_DIFFERENCE_PERCENT   - Max TVL change per update in wei (default: 1e17 = 10%)
 *   MIN_RATE                 - Minimum NAV rate as int192 (default: 5e17 = 0.5)
 *   MAX_RATE                 - Maximum NAV rate as int192 (default: 3e18 = 3.0)
 *
 * Writes to deployment_nav_trade_mainnet.json (mainnet) or
 *          deployment_nav_trade_testnet_<network>.json (others), overwrite-safe.
 *
 * Post-deploy:
 *   cast send <TRADE_STAKING_VAULT_PROXY> "setNavOracle(address,bytes32)" \
 *     <TRADE_NAV_PROXY> <TRADE_FEED_ID> --rpc-url "$RPC" --ledger
 */
import { deployNavEngineInstance } from "./deployNavEngine";

async function main() {
    await deployNavEngineInstance({
        contractName: "HastraTradeNavEngine",
        verifyContract: "contracts/chainlink/HastraTradeNavEngine.sol:HastraTradeNavEngine",
        outputFilePrefix: "deployment_nav_trade",
        label: "TRADE NAV Engine",
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
