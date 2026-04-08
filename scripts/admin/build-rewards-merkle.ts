// @ts-ignore
import { ethers, network } from "hardhat";
import { MerkleTree } from "merkletreejs";
import * as fs from "fs";
import * as path from "path";

/**
 * Build a Merkle tree for a rewards epoch and generate:
 *   1. A proofs JSON file for your frontend/API to serve
 *   2. Safe calldata for createRewardsEpoch()
 *
 * Usage:
 *   CONTRACT_ADDRESS=<yieldvault-proxy> \
 *   INPUT_FILE=<path-to-distribution.json> \
 *   SAFE_ADDRESS=<safe-addr> \
 *     npx hardhat run scripts/admin/build-rewards-merkle.ts --network sepolia
 *
 * Input file format (whole token units, e.g. "100" = 100 wYLDS):
 *   [
 *     { "address": "0xAbc...123", "amount": "100" },
 *     { "address": "0xDef...456", "amount": "250.5" }
 *   ]
 *
 * Output:
 *   - Prints Safe calldata for createRewardsEpoch()
 *   - Writes rewards-proofs-epoch-<N>.json to the same directory as INPUT_FILE
 *
 * Leaf encoding (must match YieldVault.claimRewards):
 *   leaf = keccak256(bytes.concat(keccak256(abi.encode(address, amount, epochIndex))))
 */

interface DistributionEntry {
  address: string;
  amount: string;
}

interface ProofsOutput {
  epochIndex: number;
  merkleRoot: string;
  totalRewards: string;
  totalRewardsFormatted: string;
  network: string;
  contract: string;
  generatedAt: string;
  recipients: {
    address: string;
    amount: string;
    amountFormatted: string;
    proof: string[];
  }[];
}

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const inputFile       = process.env.INPUT_FILE;
  const safeAddress     = process.env.SAFE_ADDRESS;

  if (!contractAddress) throw new Error("CONTRACT_ADDRESS env var required (YieldVault proxy)");
  if (!inputFile)       throw new Error("INPUT_FILE env var required (path to distribution JSON)");
  if (!fs.existsSync(inputFile)) throw new Error(`Input file not found: ${inputFile}`);

  // Load distribution
  const raw: DistributionEntry[] = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("Input file must be a non-empty array");

  // Fetch contract state
  const vault       = await ethers.getContractAt("YieldVault", contractAddress);
  const epochIndex  = Number(await vault.currentEpochIndex());
  const decimals    = await vault.decimals();
  const symbol      = await vault.symbol();
  const safeHasRole = safeAddress ? await vault.hasRole(await vault.REWARDS_ADMIN_ROLE(), safeAddress) : null;

  // Parse + validate entries
  const entries = raw.map((entry, i) => {
    if (!ethers.isAddress(entry.address)) throw new Error(`Invalid address at index ${i}: ${entry.address}`);
    const amount = ethers.parseUnits(entry.amount, decimals);
    if (amount === 0n) throw new Error(`Zero amount at index ${i}`);
    return { address: entry.address, amount, amountStr: entry.amount };
  });

  // Check for duplicate addresses
  const seen = new Set<string>();
  for (const e of entries) {
    const key = e.address.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate address: ${e.address}`);
    seen.add(key);
  }

  // Build leaves — must match claimRewards leaf encoding exactly:
  // keccak256(bytes.concat(keccak256(abi.encode(address, amount, epochIndex))))
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const leaves = entries.map(({ address, amount }) =>
    Buffer.from(
      ethers.keccak256(
        ethers.keccak256(
          abiCoder.encode(["address", "uint256", "uint256"], [address, amount, epochIndex])
        )
      ).slice(2), // strip 0x
      "hex"
    )
  );

  // Build tree (sortPairs=true matches OZ MerkleProof.verify default)
  const tree = new MerkleTree(leaves, (x: Buffer) => Buffer.from(ethers.keccak256(x).slice(2), "hex"), {
    hashLeaves: false,
    sortPairs: true,
  });

  const merkleRoot = "0x" + tree.getRoot().toString("hex");
  const totalRewards = entries.reduce((sum, e) => sum + e.amount, 0n);

  // Build proofs output
  const proofsOutput: ProofsOutput = {
    epochIndex,
    merkleRoot,
    totalRewards: totalRewards.toString(),
    totalRewardsFormatted: ethers.formatUnits(totalRewards, decimals) + " " + symbol,
    network: network.name,
    contract: contractAddress,
    generatedAt: new Date().toISOString(),
    recipients: entries.map(({ address, amount, amountStr }, i) => ({
      address,
      amount: amount.toString(),
      amountFormatted: amountStr + " " + symbol,
      proof: tree.getHexProof(leaves[i]),
    })),
  };

  // Write proofs file
  const outDir = path.dirname(path.resolve(inputFile));
  const outFile = path.join(outDir, `rewards-proofs-epoch-${epochIndex}.json`);
  fs.writeFileSync(outFile, JSON.stringify(proofsOutput, null, 2));

  // Encode Safe calldata for createRewardsEpoch(epochIndex, merkleRoot, totalRewards)
  const iface = new ethers.Interface([
    "function createRewardsEpoch(uint256 epochIndex, bytes32 merkleRoot, uint256 totalRewards)",
  ]);
  const calldata = iface.encodeFunctionData("createRewardsEpoch", [epochIndex, merkleRoot, totalRewards]);

  const safeUrl = safeAddress
    ? `https://app.safe.global/${network.name === "mainnet" ? "eth" : network.name === "sepolia" ? "sep" : network.name}:${safeAddress}`
    : "(set SAFE_ADDRESS for link)";

  // Print summary
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  MERKLE REWARDS EPOCH ${epochIndex}`);
  console.log(`  Network:    ${network.name}`);
  console.log(`  Contract:   ${contractAddress}  (${symbol})`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  Recipients: ${entries.length}`);
  console.log(`  Total:      ${proofsOutput.totalRewardsFormatted}`);
  console.log(`  Epoch:      ${epochIndex}`);
  console.log(`  Root:       ${merkleRoot}`);

  if (safeAddress) {
    console.log(`\n  Safe:       ${safeAddress}`);
    if (safeHasRole) {
      console.log(`  REWARDS_ADMIN_ROLE: ✅ Safe has this role`);
    } else {
      console.log(`  REWARDS_ADMIN_ROLE: ❌ Safe does NOT have this role — grant it first`);
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  SAFE TRANSACTION — createRewardsEpoch`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  Safe UI:  ${safeUrl}`);
  console.log(`  To:       ${contractAddress}`);
  console.log(`  Value:    0`);
  console.log(`  Method:   createRewardsEpoch(uint256,bytes32,uint256)`);
  console.log(`  epochIndex:   ${epochIndex}`);
  console.log(`  merkleRoot:   ${merkleRoot}`);
  console.log(`  totalRewards: ${totalRewards.toString()}`);
  console.log(`\n  Raw calldata (paste into Safe → Custom data):`);
  console.log(`  ${calldata}`);
  console.log(`${"═".repeat(60)}`);
  console.log(`\n  ✅ Proofs written to: ${outFile}`);
  console.log(`     Serve this file so users can fetch their proof and call:`);
  console.log(`     claimRewards(epochIndex, amount, proof[])`);
  console.log(`\n  After Safe executes, verify on-chain:`);
  console.log(`    EPOCH_INDEX=${epochIndex} npx hardhat run scripts/admin/verify-epoch.ts --network ${network.name}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
