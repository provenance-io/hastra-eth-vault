// @ts-ignore
import { ethers, network } from "hardhat";

/**
 * Generate Safe calldata for mintRewards() on YieldVault.
 * Use this to test or execute reward distributions through the Safe multisig.
 *
 * Usage:
 *   CONTRACT_ADDRESS=<yieldvault-proxy> \
 *   TO_ADDRESS=<recipient> \
 *   AMOUNT=<tokens-in-ether-units> \
 *   SAFE_ADDRESS=<safe-addr> \
 *     npx hardhat run scripts/admin/prepare-safe-mint-rewards.ts --network sepolia
 *
 * Examples:
 *   # Mint 1000 wYLDS to a recipient
 *   CONTRACT_ADDRESS=0x0258787Eb97DD01436B562943D8ca85B772D7b98 \
 *   TO_ADDRESS=0xAbc...123 \
 *   AMOUNT=1000 \
 *   SAFE_ADDRESS=0x4E79e5BB88f0596446c615B86D3780A11DB1a2f4 \
 *     npx hardhat run scripts/admin/prepare-safe-mint-rewards.ts --network sepolia
 *
 * AMOUNT is in whole token units (e.g. "1000" = 1000 wYLDS, not wei).
 * The script checks:
 *   - Safe holds REWARDS_ADMIN_ROLE on the contract
 *   - Recipient address is valid
 *   - Amount is non-zero
 */
async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const toAddress       = process.env.TO_ADDRESS;
  const amountStr       = process.env.AMOUNT;
  const safeAddress     = process.env.SAFE_ADDRESS;

  if (!contractAddress) throw new Error("CONTRACT_ADDRESS env var required (YieldVault proxy)");
  if (!toAddress)       throw new Error("TO_ADDRESS env var required (recipient address)");
  if (!amountStr)       throw new Error("AMOUNT env var required (whole token units, e.g. 1000)");
  if (!ethers.isAddress(toAddress)) throw new Error(`Invalid TO_ADDRESS: ${toAddress}`);

  const vault = await ethers.getContractAt("YieldVault", contractAddress);
  const REWARDS_ADMIN_ROLE = await vault.REWARDS_ADMIN_ROLE();
  const decimals           = await vault.decimals();
  const symbol             = await vault.symbol();
  const totalSupplyBefore  = await vault.totalSupply();

  const amount = ethers.parseUnits(amountStr, decimals);
  if (amount === 0n) throw new Error("AMOUNT must be non-zero");

  // Pre-flight checks
  const safeHasRole = safeAddress
    ? await vault.hasRole(REWARDS_ADMIN_ROLE, safeAddress)
    : null;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  MINT REWARDS — Safe Transaction`);
  console.log(`  Network:    ${network.name}`);
  console.log(`  Contract:   ${contractAddress}`);
  console.log(`  Token:      ${symbol} (${decimals} decimals)`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  To:         ${toAddress}`);
  console.log(`  Amount:     ${amountStr} ${symbol}  (${amount.toString()} wei)`);
  console.log(`  Total supply before: ${ethers.formatUnits(totalSupplyBefore, decimals)} ${symbol}`);
  console.log(`  Total supply after:  ${ethers.formatUnits(totalSupplyBefore + amount, decimals)} ${symbol}`);

  if (safeAddress) {
    console.log(`\n  Safe:       ${safeAddress}`);
    if (safeHasRole) {
      console.log(`  REWARDS_ADMIN_ROLE: ✅ Safe has this role`);
    } else {
      console.log(`  REWARDS_ADMIN_ROLE: ❌ Safe does NOT have this role — grant it first`);
      console.log(`\n  Grant command:`);
      console.log(`    COMMAND=delegate-role ROLE=REWARDS_ADMIN \\`);
      console.log(`    TARGET_ADDRESS=${safeAddress} VAULT_TYPE=yield \\`);
      console.log(`      npx hardhat run scripts/admin/admin.ts --network ${network.name}`);
    }
  } else {
    console.log(`\n  ⚠️  Set SAFE_ADDRESS to verify role and get Safe UI link`);
  }

  // Encode calldata
  const iface = new ethers.Interface([
    "function mintRewards(address to, uint256 amount)",
  ]);
  const calldata = iface.encodeFunctionData("mintRewards", [toAddress, amount]);

  const safeUrl = safeAddress
    ? `https://app.safe.global/${network.name === "mainnet" ? "eth" : network.name === "sepolia" ? "sep" : network.name}:${safeAddress}`
    : "(set SAFE_ADDRESS for link)";

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  SAFE TRANSACTION`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  Safe UI:  ${safeUrl}`);
  console.log(`  To:       ${contractAddress}`);
  console.log(`  Value:    0`);
  console.log(`  Method:   mintRewards(address,uint256)`);
  console.log(`  to:       ${toAddress}`);
  console.log(`  amount:   ${amount.toString()}`);
  console.log(`\n  Raw calldata (paste into Safe → Custom data):`);
  console.log(`  ${calldata}`);
  console.log(`${"═".repeat(60)}`);
  console.log(`\n  After Safe executes, verify on-chain:`);
  console.log(`    npx hardhat run scripts/ops/list-roles.ts --network ${network.name}`);
  console.log(`    Check recipient balance: cast call ${contractAddress} "balanceOf(address)(uint256)" ${toAddress} --rpc-url <rpc>`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
