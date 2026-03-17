// @ts-ignore
import { ethers, network } from "hardhat";

/**
 * Generates Safe calldata for granting or revoking a role via Safe UI.
 * Use this to test that Safe can grant DEFAULT_ADMIN back to an EOA (recovery test)
 * before revoking the deployer's roles.
 *
 * Usage:
 *   PROXY=<proxy_address> ROLE=<role_name> TARGET=<address> [ACTION=grant|revoke] \
 *     npx hardhat run scripts/admin/prepare-safe-role-grant.ts --network <network>
 *
 * Examples:
 *   # Test Safe can restore DEFAULT_ADMIN to deployer EOA
 *   PROXY=0x0258787Eb97DD01436B562943D8ca85B772D7b98 ROLE=DEFAULT_ADMIN \
 *     TARGET=0x3778F66336F79B2B0D86E759499D191EA030a4c6 \
 *     npx hardhat run scripts/admin/prepare-safe-role-grant.ts --network sepolia
 *
 *   # Revoke deployer UPGRADER_ROLE via Safe
 *   PROXY=0x0258787Eb97DD01436B562943D8ca85B772D7b98 ROLE=UPGRADER ACTION=revoke \
 *     TARGET=0x3778F66336F79B2B0D86E759499D191EA030a4c6 \
 *     npx hardhat run scripts/admin/prepare-safe-role-grant.ts --network sepolia
 */
async function main() {
  const proxyAddress = process.env.PROXY;
  const roleName = process.env.ROLE;
  const targetAddress = process.env.TARGET;
  const action = (process.env.ACTION || "grant").toLowerCase();

  if (!proxyAddress) throw new Error("PROXY env var required");
  if (!roleName) throw new Error("ROLE env var required (e.g. DEFAULT_ADMIN, UPGRADER, PAUSER)");
  if (!targetAddress) throw new Error("TARGET env var required (address to grant/revoke)");
  if (action !== "grant" && action !== "revoke") throw new Error("ACTION must be 'grant' or 'revoke'");

  console.log(`Network:  ${network.name}`);
  console.log(`Proxy:    ${proxyAddress}`);
  console.log(`Action:   ${action}Role`);
  console.log(`Role:     ${roleName}`);
  console.log(`Target:   ${targetAddress}`);

  // Resolve role hash
  const vault = await ethers.getContractAt("YieldVault", proxyAddress);
  let roleHash: string;
  switch (roleName.toUpperCase().replace(/_ROLE$/, "")) {
    case "DEFAULT_ADMIN":
    case "ADMIN":
      roleHash = ethers.ZeroHash;
      break;
    case "UPGRADER":
      roleHash = await vault.UPGRADER_ROLE();
      break;
    case "PAUSER":
      roleHash = await vault.PAUSER_ROLE();
      break;
    case "REWARDS_ADMIN":
      roleHash = await vault.REWARDS_ADMIN_ROLE();
      break;
    case "FREEZE_ADMIN":
      roleHash = await vault.FREEZE_ADMIN_ROLE();
      break;
    default:
      throw new Error(`Unknown role: ${roleName}. Available: DEFAULT_ADMIN, UPGRADER, PAUSER, REWARDS_ADMIN, FREEZE_ADMIN`);
  }
  console.log(`Role hash: ${roleHash}`);

  // Check current state
  const hasRole = await vault.hasRole(roleHash, targetAddress);
  console.log(`\nCurrent state: ${targetAddress} ${hasRole ? "✅ HAS" : "❌ does NOT have"} ${roleName} role`);

  // Encode calldata
  const iface = new ethers.Interface([
    "function grantRole(bytes32 role, address account)",
    "function revokeRole(bytes32 role, address account)",
  ]);
  const fnName = action === "grant" ? "grantRole" : "revokeRole";
  const calldata = iface.encodeFunctionData(fnName, [roleHash, targetAddress]);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📋 SAFE TRANSACTION — ${action.toUpperCase()} ${roleName}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Safe UI: https://app.safe.global/sep:0x4E79e5BB88f0596446c615B86D3780A11DB1a2f4`);
  console.log(`\nTo (proxy):  ${proxyAddress}`);
  console.log(`Value:       0`);
  console.log(`Method:      ${fnName}(bytes32, address)`);
  console.log(`role:        ${roleHash}`);
  console.log(`account:     ${targetAddress}`);
  console.log(`\nRaw calldata (paste into Safe → Custom data):`);
  console.log(calldata);
  console.log(`${"=".repeat(60)}`);
  console.log(`\nAfter Safe executes, verify with:`);
  console.log(`  COMMAND=check-role CONTRACT_ADDRESS=${proxyAddress} ROLE=${roleName} \\`);
  console.log(`    ACCOUNT_ADDRESS=${targetAddress} \\`);
  console.log(`    npx hardhat run scripts/admin/admin.ts --network ${network.name}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
