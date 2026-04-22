// @ts-ignore
import { ethers, network } from "hardhat";
import { resolveProxyAddress } from "./safe-helpers";

/**
 * Directly execute setAllowedFeedId() on FeedVerifier using an EOA.
 * The signer must hold DEFAULT_ADMIN_ROLE on the proxy.
 *
 * Usage (run from chainlink-hub/):
 *   FEED_ID=<bytes32> \
 *     npx hardhat run scripts/admin/eoa-set-feed-id.ts --network sepolia
 *
 * Examples:
 *   # Rotate to mainnet feed ID
 *   FEED_ID=0x000700f43b35146a1cb16373ac6225ad597535e928e6dc4d179c3b4225f2b6d3 \
 *     npx hardhat run scripts/admin/eoa-set-feed-id.ts --network mainnet
 *
 *   # Clear enforcement (accept any feedId)
 *   FEED_ID=0x0000000000000000000000000000000000000000000000000000000000000000 \
 *     npx hardhat run scripts/admin/eoa-set-feed-id.ts --network sepolia
 *
 * Required env:
 *   FEED_ID      — bytes32 feedId to set
 *   PRIVATE_KEY  — EOA with DEFAULT_ADMIN_ROLE (via hardhat.config.ts accounts)
 *
 * Optional:
 *   PROXY=<feed-verifier-proxy>  — defaults to deployment_feed_verifier_<network>.json
 */
async function main() {
  const [signer] = await ethers.getSigners();
  const net = network.name;

  const proxyAddress = resolveProxyAddress("FeedVerifier");
  const feedId       = process.env.FEED_ID;

  if (!feedId) throw new Error("FEED_ID env var required (bytes32, e.g. 0x000700f4...)");
  if (!/^0x[0-9a-fA-F]{64}$/.test(feedId)) {
    throw new Error(`FEED_ID must be a 32-byte hex string (66 chars incl 0x), got: ${feedId}`);
  }

  console.log("=".repeat(50));
  console.log("Set FeedVerifier allowedFeedId (EOA)");
  console.log("=".repeat(50));
  console.log(`Network:       ${net}`);
  console.log(`Signer:        ${signer.address}`);
  console.log(`Balance:       ${ethers.formatEther(await ethers.provider.getBalance(signer.address))} ETH`);
  console.log(`FeedVerifier:  ${proxyAddress}`);
  console.log(`New Feed ID:   ${feedId}`);

  const feedVerifier = await ethers.getContractAt("FeedVerifier", proxyAddress, signer);

  // Verify signer has DEFAULT_ADMIN_ROLE
  const adminRole = ethers.ZeroHash;
  const hasRole   = await feedVerifier.hasRole(adminRole, signer.address);
  if (!hasRole) {
    throw new Error(`Signer ${signer.address} does not have DEFAULT_ADMIN_ROLE on ${proxyAddress}`);
  }

  const current = await feedVerifier.allowedFeedId();
  console.log(`\nCurrent allowedFeedId: ${current}`);
  console.log(`New allowedFeedId:     ${feedId}`);

  if (current.toLowerCase() === feedId.toLowerCase()) {
    console.log("\n⚠️  Feed ID is already set to this value — nothing to do.");
    return;
  }

  console.log("\n📡 Sending transaction...");
  const tx = await feedVerifier.setAllowedFeedId(feedId);
  console.log(`   TX hash: ${tx.hash}`);
  console.log("   Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log(`   ✅ Confirmed in block ${receipt?.blockNumber} (gas used: ${receipt?.gasUsed})`);

  // Verify on-chain
  const updated = await feedVerifier.allowedFeedId();
  console.log(`\n📊 On-chain allowedFeedId: ${updated}`);
  if (updated.toLowerCase() !== feedId.toLowerCase()) {
    throw new Error("❌ On-chain value does not match — update may have failed");
  }
  console.log("✅ Feed ID updated successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
