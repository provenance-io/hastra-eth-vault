// @ts-ignore
import { ethers, network } from "hardhat";

/**
 * Register a proposer (delegate) on a Safe via the Safe Transaction Service API.
 * Delegates can propose transactions but cannot approve or execute them.
 * The Hardhat signer (PRIVATE_KEY) must be an owner of the Safe.
 *
 * Usage:
 *   SAFE_ADDRESS=<safe-addr> \
 *   DELEGATE_ADDRESS=0x47A3233785F78B7EFE59515831Ce649d144f7235 \
 *   LABEL=pulse-proposer \
 *     npx hardhat run scripts/admin/add-safe-delegate.ts --network base-sepolia
 *
 * Set REMOVE=true to revoke the delegate instead.
 * SAFE_API_KEY (developer.safe.global) is optional; sent as a Bearer token if set.
 */
const TX_SERVICE_SHORT_NAMES: Record<number, string> = {
  1: "eth",
  11155111: "sep",
  8453: "base",
  84532: "basesep",
};

async function main() {
  const safeAddress     = process.env.SAFE_ADDRESS;
  const delegateAddress = process.env.DELEGATE_ADDRESS;
  const apiKey          = process.env.SAFE_API_KEY;
  const label           = process.env.LABEL || "proposer";
  const remove          = process.env.REMOVE === "true";

  if (!safeAddress || !ethers.isAddress(safeAddress))         throw new Error("SAFE_ADDRESS env var required");
  if (!delegateAddress || !ethers.isAddress(delegateAddress)) throw new Error("DELEGATE_ADDRESS env var required");
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const shortName = TX_SERVICE_SHORT_NAMES[chainId];
  if (!shortName) throw new Error(`No Safe Transaction Service mapping for chainId ${chainId}`);

  const [signer] = await ethers.getSigners();
  const delegator = ethers.getAddress(await signer.getAddress());
  const delegate = ethers.getAddress(delegateAddress);
  const safe = ethers.getAddress(safeAddress);

  const safeContract = new ethers.Contract(safe, ["function getOwners() view returns (address[])"], ethers.provider);
  const owners: string[] = (await safeContract.getOwners()).map((o: string) => ethers.getAddress(o));
  if (!owners.includes(delegator)) {
    throw new Error(`Signer ${delegator} is not an owner of Safe ${safe}. Owners: ${owners.join(", ")}`);
  }

  console.log(`Network:   ${network.name} (${chainId})`);
  console.log(`Safe:      ${safe}`);
  console.log(`Delegator: ${delegator}`);
  console.log(`Delegate:  ${delegate}`);
  console.log(`Action:    ${remove ? "REMOVE" : "ADD"}`);

  // The service accepts the current, previous, or next hour's totp.
  const totp = Math.floor(Date.now() / 1000 / 3600);
  const signature = await signer.signTypedData(
    { name: "Safe Transaction Service", version: "1.0", chainId },
    { Delegate: [{ name: "delegateAddress", type: "address" }, { name: "totp", type: "uint256" }] },
    { delegateAddress: delegate, totp },
  );

  const base = `https://api.safe.global/tx-service/${shortName}/api/v2/delegates/`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = remove
    ? await fetch(`${base}${delegate}/`, { method: "DELETE", headers, body: JSON.stringify({ safe, delegator, signature }) })
    : await fetch(base, { method: "POST", headers, body: JSON.stringify({ safe, delegate, delegator, label, signature }) });

  const text = await res.text();
  console.log(`\nHTTP ${res.status} ${res.statusText}`);
  if (text) console.log(text);
  if (!res.ok) process.exit(1);

  const list = await fetch(`${base}?safe=${safe}`, { headers });
  console.log(`\nCurrent delegates for ${safe}:`);
  console.log(JSON.stringify(await list.json(), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
