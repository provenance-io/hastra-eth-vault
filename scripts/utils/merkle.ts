import { ethers } from "hardhat";
import { MerkleTree } from "merkletreejs";
import * as fs from "fs";

/**
 * Utility for generating merkle trees for rewards distribution
 */

export interface RewardEntry {
  address: string;
  amount: bigint;
}

export interface RewardWithProof extends RewardEntry {
  proof: string[];
}

/**
 * Generate merkle tree from reward entries
 * @param rewards Array of reward entries
 * @param epochIndex Epoch index for this distribution
 * @returns Merkle tree instance
 */
export function generateMerkleTree(
  rewards: RewardEntry[],
  epochIndex: number
): MerkleTree {
  const leaves = rewards.map((reward) =>
    ethers.solidityPackedKeccak256(
      ["bytes"],
      [
        ethers.solidityPacked(
          ["address", "uint256", "uint256"],
          [reward.address, reward.amount, epochIndex]
        ),
      ]
    )
  );

  return new MerkleTree(leaves, ethers.keccak256, { sortPairs: true });
}

/**
 * Generate merkle root from reward entries
 * @param rewards Array of reward entries
 * @param epochIndex Epoch index for this distribution
 * @returns Merkle root as hex string
 */
export function generateMerkleRoot(
  rewards: RewardEntry[],
  epochIndex: number
): string {
  const tree = generateMerkleTree(rewards, epochIndex);
  return tree.getHexRoot();
}

/**
 * Generate proof for a specific reward entry
 * @param rewards All reward entries
 * @param userAddress Address to generate proof for
 * @param epochIndex Epoch index
 * @returns Proof array
 */
export function generateProof(
  rewards: RewardEntry[],
  userAddress: string,
  epochIndex: number
): string[] {
  const tree = generateMerkleTree(rewards, epochIndex);
  
  const reward = rewards.find(
    (r) => r.address.toLowerCase() === userAddress.toLowerCase()
  );
  
  if (!reward) {
    throw new Error(`No reward found for address ${userAddress}`);
  }

  const leaf = ethers.solidityPackedKeccak256(
    ["bytes"],
    [
      ethers.solidityPacked(
        ["address", "uint256", "uint256"],
        [reward.address, reward.amount, epochIndex]
      ),
    ]
  );

  return tree.getHexProof(leaf);
}

/**
 * Verify a proof
 * @param proof Merkle proof
 * @param root Merkle root
 * @param address User address
 * @param amount Reward amount
 * @param epochIndex Epoch index
 * @returns True if proof is valid
 */
export function verifyProof(
  proof: string[],
  root: string,
  address: string,
  amount: bigint,
  epochIndex: number
): boolean {
  const leaf = ethers.solidityPackedKeccak256(
    ["bytes"],
    [
      ethers.solidityPacked(
        ["address", "uint256", "uint256"],
        [address, amount, epochIndex]
      ),
    ]
  );

  const MerkleTree = require("merkletreejs");
  return MerkleTree.verify(proof, leaf, root, ethers.keccak256);
}

/**
 * Generate rewards distribution file with proofs
 * @param rewards Array of reward entries
 * @param epochIndex Epoch index
 * @param outputPath Path to save the distribution file
 */
export function generateDistributionFile(
  rewards: RewardEntry[],
  epochIndex: number,
  outputPath: string
): void {
  const tree = generateMerkleTree(rewards, epochIndex);
  const root = tree.getHexRoot();

  const rewardsWithProofs: RewardWithProof[] = rewards.map((reward) => {
    const proof = generateProof(rewards, reward.address, epochIndex);
    return {
      ...reward,
      proof,
    };
  });

  const distribution = {
    epochIndex,
    merkleRoot: root,
    totalRewards: rewards.reduce((sum, r) => sum + r.amount, 0n).toString(),
    rewards: rewardsWithProofs.map((r) => ({
      address: r.address,
      amount: r.amount.toString(),
      proof: r.proof,
    })),
  };

  fs.writeFileSync(outputPath, JSON.stringify(distribution, null, 2));
  console.log(`Distribution file saved to ${outputPath}`);
  console.log(`Epoch: ${epochIndex}`);
  console.log(`Root: ${root}`);
  console.log(`Total Rewards: ${distribution.totalRewards}`);
  console.log(`Reward Count: ${rewards.length}`);
}

/**
 * Example usage script
 */
async function example() {
  // Example rewards distribution
  const rewards: RewardEntry[] = [
    {
      address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      amount: ethers.parseUnits("100", 6),
    },
    {
      address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      amount: ethers.parseUnits("200", 6),
    },
    {
      address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
      amount: ethers.parseUnits("150", 6),
    },
  ];

  const epochIndex = 0;

  // Generate and save distribution
  generateDistributionFile(
    rewards,
    epochIndex,
    `distributions/epoch-${epochIndex}.json`
  );

  // Verify each proof
  const root = generateMerkleRoot(rewards, epochIndex);
  for (const reward of rewards) {
    const proof = generateProof(rewards, reward.address, epochIndex);
    const isValid = verifyProof(proof, root, reward.address, reward.amount, epochIndex);
    console.log(`Proof for ${reward.address}: ${isValid ? "✓" : "✗"}`);
  }
}

// Run example if executed directly
if (require.main === module) {
  example()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
