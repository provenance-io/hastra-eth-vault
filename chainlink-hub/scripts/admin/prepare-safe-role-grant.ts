// @ts-ignore
import { ethers, network } from "hardhat";
import {
  printSafeContext,
  resolveContractName,
  resolveProxyAddress,
  resolveSafeAddress,
} from "./safe-helpers";

/**
 * Generates Safe calldata for granting or revoking a role on chainlink-hub contracts.
 *
 * Usage:
 *   [PROXY=<proxy_address>] [CONTRACT=FeedVerifier] ROLE=<role_name> TARGET=<address> [ACTION=grant|revoke] [SAFE_ADDRESS=<safe>] \
 *     npx hardhat run scripts/admin/prepare-safe-role-grant.ts --network sepolia
 */
async function main() {
  const contractName = resolveContractName();
  const proxyAddress = resolveProxyAddress(contractName);
  const roleName = process.env.ROLE;
  const targetAddress = process.env.TARGET;
  const action = (process.env.ACTION || "grant").toLowerCase();
  const safeAddress = resolveSafeAddress();

  if (!roleName) {
    throw new Error("ROLE env var required (e.g. DEFAULT_ADMIN, UPGRADER, PAUSER, UPDATER)");
  }
  if (!targetAddress) {
    throw new Error("TARGET env var required");
  }
  if (!ethers.isAddress(targetAddress)) {
    throw new Error(`Invalid TARGET address: ${targetAddress}`);
  }
  if (action !== "grant" && action !== "revoke") {
    throw new Error("ACTION must be 'grant' or 'revoke'");
  }

  console.log(`Network:   ${network.name}`);
  console.log(`Contract:  ${contractName}`);
  console.log(`Proxy:     ${proxyAddress}`);
  console.log(`Action:    ${action}Role`);
  console.log(`Role:      ${roleName}`);
  console.log(`Target:    ${targetAddress}`);
  printSafeContext(safeAddress);

  const contract = await ethers.getContractAt(contractName, proxyAddress);

  let roleHash: string;
  switch (roleName.toUpperCase().replace(/_ROLE$/, "")) {
    case "DEFAULT_ADMIN":
    case "ADMIN":
      roleHash = ethers.ZeroHash;
      break;
    case "UPGRADER":
      roleHash = await contract.UPGRADER_ROLE();
      break;
    case "PAUSER":
      roleHash = await contract.PAUSER_ROLE();
      break;
    case "UPDATER":
      roleHash = await contract.UPDATER_ROLE();
      break;
    default:
      throw new Error("Unknown role. Available: DEFAULT_ADMIN, UPGRADER, PAUSER, UPDATER");
  }

  const currentlyHasRole = await contract.hasRole(roleHash, targetAddress);
  console.log(`Current state: ${currentlyHasRole ? "HAS" : "DOES NOT HAVE"} role`);

  const iface = new ethers.Interface([
    "function grantRole(bytes32 role, address account)",
    "function revokeRole(bytes32 role, address account)",
  ]);
  const fnName = action === "grant" ? "grantRole" : "revokeRole";
  const calldata = iface.encodeFunctionData(fnName, [roleHash, targetAddress]);

  console.log(`\n${"=".repeat(64)}`);
  console.log(`SAFE TRANSACTION — ${action.toUpperCase()} ${roleName}`);
  console.log(`${"=".repeat(64)}`);
  console.log(`To (proxy):  ${proxyAddress}`);
  console.log(`Value:       0`);
  console.log(`Method:      ${fnName}(bytes32,address)`);
  console.log(`role:        ${roleHash}`);
  console.log(`account:     ${targetAddress}`);
  console.log("\nRaw calldata:");
  console.log(calldata);
  console.log(`${"=".repeat(64)}`);
  console.log("\nAfter Safe executes, rerun this script to confirm the role state changed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
