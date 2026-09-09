/**
 * Workaround for RPC providers that reject the "pending" block tag with
 * `state not available for pending block` (observed on some QuikNode
 * Avalanche Fuji endpoints).
 *
 * Background:
 *   - ethers v6's HardhatEthersSigner calls `provider.estimateGas(tx)` before
 *     broadcasting, which some code paths resolve against the "pending"
 *     block tag. Certain RPC fleets don't serve pending-block state at all
 *     and error out, even though "latest" works fine.
 *   - There is no Hardhat network-config knob to force these calls onto
 *     "latest" — the signer issues the request directly.
 *
 * Fix: patch the raw JSON-RPC send layer to rewrite the block-tag parameter
 * from "pending" to "latest" for the affected read-only methods before the
 * request is forwarded. Safe for deploy scripts, which never rely on
 * mempool-pending state.
 *
 * Call this once near the top of any deploy script, right after getting the
 * provider. Idempotent.
 */
const PENDING_TAG_METHODS = new Set([
    "eth_call",
    "eth_estimateGas",
    "eth_getBalance",
    "eth_getTransactionCount",
]);

export function patchProviderForPendingBlockBug(provider: any): void {
    if (!provider || provider.__pendingBlockPatched) return;

    const inner = provider._hardhatProvider;
    if (inner && typeof inner.send === "function" && !inner.__pendingBlockPatched) {
        const origSend = inner.send.bind(inner);
        inner.send = async (method: string, params: any[]) => {
            if (PENDING_TAG_METHODS.has(method) && Array.isArray(params)) {
                params = params.map((p) => (p === "pending" ? "latest" : p));
            }
            return origSend(method, params);
        };
        inner.__pendingBlockPatched = true;
    }

    provider.__pendingBlockPatched = true;
}
