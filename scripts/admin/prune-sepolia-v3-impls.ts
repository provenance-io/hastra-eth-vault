/**
 * One-time Sepolia manifest cleanup — Phase 2.
 *
 * forceImport already re-baselined the *current* proxy impl to YieldVault (V1)
 * layout. But OZ's prepareUpgrade also validates against ALL historical impl
 * entries in the manifest. Two leftover entries from the V3 (rename/contractURI)
 * detour still cause "Deleted `_contractURIValue`" errors when preparing V2.
 *
 * This script removes those orphan YieldVaultV3 impl entries from
 * .openzeppelin/sepolia.json. No chain interaction. Mainnet manifest untouched.
 *
 * Identifies impls to prune by: any entry whose layout.storage contains
 * a variable labelled `_contractURIValue`.
 *
 * Safety: a timestamped backup is taken before any write. Re-run is idempotent.
 */
import * as fs from "fs";
import * as path from "path";

const MANIFEST = path.resolve(__dirname, "..", "..", ".openzeppelin", "sepolia.json");

async function main() {
  const raw = fs.readFileSync(MANIFEST, "utf8");
  const manifest = JSON.parse(raw);

  const impls = manifest.impls || {};
  const toDelete: string[] = [];

  for (const [hash, entry] of Object.entries<any>(impls)) {
    const storage = entry?.layout?.storage ?? [];
    const hasUri = storage.some((s: any) => (s?.label ?? "").includes("_contractURIValue"));
    if (hasUri) {
      toDelete.push(hash);
      console.log(`  will prune impl hash=${hash.slice(0, 12)}... addr=${entry.address}`);
    }
  }

  if (toDelete.length === 0) {
    console.log("✅ No orphan V3 entries found. Manifest already clean.");
    return;
  }

  // Backup
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `${MANIFEST}.bak.${ts}`;
  fs.writeFileSync(backup, raw);
  console.log(`📦 Backup written: ${backup}`);

  for (const hash of toDelete) {
    delete manifest.impls[hash];
  }

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`✅ Pruned ${toDelete.length} orphan V3 impl entries from sepolia.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
