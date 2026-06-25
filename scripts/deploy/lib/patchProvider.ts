/**
 * Workaround for an ethers v6 + hardhat-ethers crash that occurs when an
 * RPC provider returns a pending CREATE transaction with `to: ""` (empty
 * string) instead of the JSON-RPC standard `to: null`.
 *
 * Background:
 *   - After `eth_sendRawTransaction`, hardhat-ethers immediately calls
 *     `eth_getTransactionByHash` to sanity-check the broadcast.
 *   - Some load-balanced RPC fleets (Alchemy edge cache, publicnode,
 *     QuickNode caches) re-serialize the pending response and emit
 *     `to: ""` for CREATE transactions before the tx has propagated to
 *     the node that answers the read.
 *   - ethers v6's `formatTransactionResponse` calls `getAddress("")`,
 *     which throws `BAD_DATA: invalid address`. The broadcast itself
 *     succeeded; only the sanity-check crashes.
 *
 * Fix (two-layer):
 *   1. Patch `_hardhatProvider.send` (the raw JSON-RPC layer) to normalize
 *      `to: ""` → `to: null` in `eth_getTransactionByHash` responses BEFORE
 *      `formatTransactionResponse` ever sees the value. This is the primary
 *      fix — it prevents the throw entirely.
 *   2. Also wrap `provider.getTransaction` with a BAD_DATA retry loop as a
 *      belt-and-suspenders fallback for any code path that bypasses layer 1.
 *
 * Call this once near the top of any deploy script. Idempotent.
 */
export function patchProviderForCheckTxBug(provider: any): void {
    if (!provider || provider.__checkTxPatched) return;

    // Layer 1: normalize at the raw RPC level so formatTransactionResponse
    // never receives `to: ""`.
    const inner = provider._hardhatProvider;
    if (inner && typeof inner.send === "function" && !inner.__checkTxPatched) {
        const origSend = inner.send.bind(inner);
        inner.send = async (method: string, params: any[]) => {
            const result = await origSend(method, params);
            if (method === "eth_getTransactionByHash" && result && result.to === "") {
                result.to = null;
            }
            return result;
        };
        inner.__checkTxPatched = true;
    }

    // Layer 2: wrap getTransaction with a retry loop for any remaining
    // BAD_DATA throws (e.g. code paths that don't go through _hardhatProvider).
    const orig = provider.getTransaction.bind(provider);
    provider.getTransaction = async (hash: string) => {
        for (let i = 0; i < 10; i++) {
            try {
                return await orig(hash);
            } catch (e: any) {
                const isBadAddr =
                    e?.code === "BAD_DATA" &&
                    (e?.value?.to === "" || /invalid address/i.test(e?.shortMessage || ""));
                if (!isBadAddr) throw e;
                await new Promise((r) => setTimeout(r, 1000));
            }
        }
        return orig(hash); // last attempt — let the real error bubble
    };

    provider.__checkTxPatched = true;
}
