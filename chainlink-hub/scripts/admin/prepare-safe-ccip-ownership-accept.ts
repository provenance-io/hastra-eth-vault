// @ts-ignore
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Generates Safe calldata to accept pending CCIP pool-ownership and
 * TokenAdminRegistry admin-role transfers for PRIME and wYLDS on Tempo mainnet.
 *
 * Pool/token addresses below are the ones named in the Chainlink handoff message.
 * The TokenAdminRegistry address is pulled from Chainlink's own CCIP directory API
 * (https://api.ccip.chain.link/v2/chains/7281642695469137430), not the handoff
 * message, since that contract is chain infrastructure and must come from Chainlink
 * directly rather than a third-party link.
 *
 * Pure offline ABI encoding — no network connection or on-chain reads required.
 *
 * Usage:
 *   npx hardhat run chainlink-hub/scripts/admin/prepare-safe-ccip-ownership-accept.ts
 */

const TEMPO_MAINNET_CHAIN_ID = 4217;
const TOKEN_ADMIN_REGISTRY = "0x60A97bd9ACf755954Ff0fE85837224f2920a57F3"; // CCIP directory, Tempo mainnet, v1.5.0

const TARGETS = [
  { label: "PRIME pool — accept pool ownership", to: "0x608Fa11227Fef4Be0290936894fC8490Dd7CDA1e", fn: "acceptOwnership" as const },
  { label: "wYLDS pool — accept pool ownership", to: "0xd36188D25d09F3AfbE306535026A0329dA376880", fn: "acceptOwnership" as const },
  { label: "PRIME — accept TokenAdminRegistry admin role", to: TOKEN_ADMIN_REGISTRY, fn: "acceptAdminRole" as const, token: "0x20C00000000000000000000058d0B8b2CFDb358c" },
  { label: "wYLDS — accept TokenAdminRegistry admin role", to: TOKEN_ADMIN_REGISTRY, fn: "acceptAdminRole" as const, token: "0x20c00000000000000000000030fDD4a919E93fcf" },
];

async function main() {
  const iface = new ethers.Interface([
    "function acceptOwnership()",
    "function acceptAdminRole(address localToken)",
  ]);

  const transactions = TARGETS.map((t) => {
    const data = t.fn === "acceptOwnership" ? iface.encodeFunctionData("acceptOwnership") : iface.encodeFunctionData("acceptAdminRole", [t.token]);
    return { label: t.label, to: t.to, value: "0", data };
  });

  console.log(`${"=".repeat(72)}`);
  console.log("SAFE BATCH — accept CCIP pool ownership + token admin role (Tempo mainnet)");
  console.log(`${"=".repeat(72)}`);
  for (const tx of transactions) {
    console.log(`\n${tx.label}`);
    console.log(`  to:    ${tx.to}`);
    console.log(`  value: ${tx.value}`);
    console.log(`  data:  ${tx.data}`);
  }

  const batch = {
    version: "1.0",
    chainId: String(TEMPO_MAINNET_CHAIN_ID),
    createdAt: Date.now(),
    meta: {
      name: "Accept CCIP pool ownership + token admin role — PRIME & wYLDS",
      description: "Accepts pending Ownable2Step pool-ownership transfers and TokenAdminRegistry admin-role transfers for PRIME and wYLDS on Tempo mainnet.",
      txBuilderVersion: "1.16.5",
    },
    transactions: transactions.map(({ to, value, data }) => ({ to, value, data })),
  };

  const outPath = path.join(__dirname, "../../safe-batch-ccip-ownership-tempo-mainnet.json");
  fs.writeFileSync(outPath, JSON.stringify(batch, null, 2));

  console.log(`\n${"=".repeat(72)}`);
  console.log(`Wrote Safe Transaction Builder batch to: ${outPath}`);
  console.log("Import it in the Safe UI: Apps -> Transaction Builder -> upload file.");
  console.log("Confirm each target's pending owner/admin matches your Safe before signing.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
