// @ts-ignore
import { ethers, upgrades, network } from "hardhat";

/**
 * Prepares the YieldVault V2 role-split upgrade — routed through the
 * TimelockController.
 *
 * Produces, in order:
 *   1. A freshly deployed YieldVaultV2 implementation.
 *   2. The `initializeV2(version, epochAdmin, redeemOperator)` calldata.
 *   3. The `upgradeToAndCall(newImpl, initializeV2Calldata)` calldata
 *      (this is what the Timelock will execute against the proxy).
 *   4. The `timelock.schedule(...)` calldata — paste this into the Safe.
 *   5. The `timelock.execute(...)` calldata — paste into the Safe (or run from
 *      any EOA, since executors=[address(0)]) after the timelock delay elapses.
 *
 * VERSION env var = OZ reinitializer version. Pass the value strictly greater
 * than the proxy's current `_initialized`:
 *   - Mainnet  YieldVault proxy `_initialized == 1` → VERSION=2
 *   - Sepolia  YieldVault proxy `_initialized == 2` → VERSION=3
 * Script auto-reads the proxy's current `_initialized` and aborts if VERSION
 * isn't valid.
 *
 * Usage:
 *   PROXY=<yield_vault_proxy> \
 *   TIMELOCK=<timelock_address> \
 *   EPOCH_ADMIN=<safe_or_eoa> \
 *   REDEEM_OPERATOR=<ops_eoa> \
 *   [VERSION=<reinitializer_version>] \
 *   [DELAY=<seconds_override>] \
 *   [SAFE_ADDRESS=<safe_for_url>] \
 *     npx hardhat run scripts/admin/prepare-yieldvault-v2-upgrade.ts --network <network>
 *
 * Sepolia example (proxy already at _initialized=2 → VERSION=3):
 *   PROXY=0x0258787Eb97DD01436B562943D8ca85B772D7b98 \
 *   TIMELOCK=0x8C6ed403d20Ec24a9Ac14E46Af2365B97Af9d951 \
 *   EPOCH_ADMIN=0x4E79e5BB88f0596446c615B86D3780A11DB1a2f4 \
 *   REDEEM_OPERATOR=0x3778F66336F79B2B0D86E759499D191EA030a4c6 \
 *   VERSION=3 \
 *   SAFE_ADDRESS=0x4E79e5BB88f0596446c615B86D3780A11DB1a2f4 \
 *     npx hardhat run scripts/admin/prepare-yieldvault-v2-upgrade.ts --network sepolia
 *
 * Mainnet example (proxy at _initialized=1 → VERSION=2):
 *   PROXY=0x6aD038cA6C04e885630851278ca0a856Ad9a66Cc \
 *   TIMELOCK=<mainnet_timelock_addr> \
 *   EPOCH_ADMIN=0x8D358B8aE881F8ea92C3d07783aBCA21727C6309 \
 *   REDEEM_OPERATOR=0xA8C3CF6183D49d5D372f8FC149BD2cb5CFC0faCd \
 *   VERSION=2 \
 *   SAFE_ADDRESS=0x8D358B8aE881F8ea92C3d07783aBCA21727C6309 \
 *     npx hardhat run scripts/admin/prepare-yieldvault-v2-upgrade.ts --network mainnet
 */

const PREDECESSOR = ethers.ZeroHash;
const SALT = ethers.ZeroHash;
// ERC-7201-style namespaced storage slot for OZ Initializable (`_initialized` lives in
// the first word of this slot's struct). See
// @openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol.
const INITIALIZABLE_STORAGE_SLOT = "0xf0c57e16840df040f15088dc2f81fe391c3923bec73e23a9662efc9c229c6a00";

async function main() {
  const proxyAddress = requireEnv("PROXY");
  const timelockAddress = requireEnv("TIMELOCK");
  const epochAdmin = requireEnv("EPOCH_ADMIN");
  const redeemOperator = requireEnv("REDEEM_OPERATOR");
  const versionOverride = process.env.VERSION ? BigInt(process.env.VERSION) : undefined;
  const delayOverride = process.env.DELAY ? BigInt(process.env.DELAY) : undefined;

  if (!ethers.isAddress(proxyAddress)) throw new Error(`PROXY is not a valid address: ${proxyAddress}`);
  if (!ethers.isAddress(timelockAddress)) throw new Error(`TIMELOCK is not a valid address: ${timelockAddress}`);
  if (!ethers.isAddress(epochAdmin)) throw new Error(`EPOCH_ADMIN is not a valid address: ${epochAdmin}`);
  if (!ethers.isAddress(redeemOperator)) throw new Error(`REDEEM_OPERATOR is not a valid address: ${redeemOperator}`);

  const [deployer] = await ethers.getSigners();
  console.log(`Network:           ${network.name}`);
  console.log(`Deployer:          ${deployer.address}`);
  console.log(`Proxy:             ${proxyAddress}`);
  console.log(`Timelock:          ${timelockAddress}`);
  console.log(`EPOCH_ADMIN  →     ${epochAdmin}`);
  console.log(`REDEEM_OPERATOR →  ${redeemOperator}`);

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Read the proxy's current _initialized value and choose VERSION.
  // ─────────────────────────────────────────────────────────────────────────
  const initSlot = await ethers.provider.getStorage(proxyAddress, INITIALIZABLE_STORAGE_SLOT);
  // _initialized is the low 64 bits of the first word.
  const currentInitialized = BigInt(initSlot) & ((1n << 64n) - 1n);
  console.log(`\n📋 Proxy _initialized: ${currentInitialized}`);

  const version = versionOverride ?? currentInitialized + 1n;
  if (version <= currentInitialized) {
    throw new Error(
      `VERSION (${version}) must be strictly greater than the proxy's current _initialized (${currentInitialized}).`
    );
  }
  if (version > (1n << 64n) - 1n) {
    throw new Error(`VERSION (${version}) exceeds uint64.max`);
  }
  console.log(`Using VERSION:     ${version}${versionOverride === undefined ? " (auto)" : " (override)"}`);

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Deploy the new YieldVaultV2 implementation.
  // ─────────────────────────────────────────────────────────────────────────
  const Factory = await ethers.getContractFactory("YieldVaultV2");

  try {
    await upgrades.forceImport(proxyAddress, Factory, { kind: "uups" });
  } catch (e: any) {
    if (!e.message?.includes("already registered") && !e.message?.includes("Found existing")) {
      throw e;
    }
  }

  const currentImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log(`\n📋 Current implementation: ${currentImpl}`);

  console.log(`\n🚀 Deploying new YieldVaultV2 implementation...`);
  const newImplAddress = (await upgrades.prepareUpgrade(proxyAddress, Factory, {
    redeployImplementation: "always",
  })) as string;
  console.log(`✅ New implementation: ${newImplAddress}`);

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Encode initializeV2 + upgradeToAndCall.
  // ─────────────────────────────────────────────────────────────────────────
  const vaultIface = new ethers.Interface([
    "function initializeV2(uint64 version, address epochAdmin, address redeemOperator)",
    "function upgradeToAndCall(address newImplementation, bytes data)",
  ]);

  const initializeV2Calldata = vaultIface.encodeFunctionData("initializeV2", [
    version,
    epochAdmin,
    redeemOperator,
  ]);

  const upgradeCalldata = vaultIface.encodeFunctionData("upgradeToAndCall", [
    newImplAddress,
    initializeV2Calldata,
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Encode timelock.schedule(...) + timelock.execute(...).
  // ─────────────────────────────────────────────────────────────────────────
  const timelockIface = new ethers.Interface([
    "function getMinDelay() view returns (uint256)",
    "function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)",
    "function execute(address target, uint256 value, bytes payload, bytes32 predecessor, bytes32 salt) payable",
    "function hashOperation(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt) view returns (bytes32)",
  ]);

  const timelock = new ethers.Contract(timelockAddress, timelockIface, ethers.provider);
  const minDelay: bigint = await timelock.getMinDelay();
  const delay = delayOverride ?? minDelay;
  if (delayOverride !== undefined && delayOverride < minDelay) {
    throw new Error(
      `DELAY override (${delayOverride}) is below the timelock's min delay (${minDelay}). schedule() would revert.`
    );
  }

  const operationId: string = await timelock.hashOperation(
    proxyAddress,
    0,
    upgradeCalldata,
    PREDECESSOR,
    SALT
  );

  const scheduleCalldata = timelockIface.encodeFunctionData("schedule", [
    proxyAddress,
    0,
    upgradeCalldata,
    PREDECESSOR,
    SALT,
    delay,
  ]);

  const executeCalldata = timelockIface.encodeFunctionData("execute", [
    proxyAddress,
    0,
    upgradeCalldata,
    PREDECESSOR,
    SALT,
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Print everything.
  // ─────────────────────────────────────────────────────────────────────────
  const sep = "=".repeat(72);
  const safeAddress = process.env.SAFE_ADDRESS;
  const safeUrl = safeAddress
    ? `https://app.safe.global/${networkPrefix(network.name)}:${safeAddress}`
    : "(set SAFE_ADDRESS to print the Safe URL)";

  console.log(`\n${sep}`);
  console.log("📋 TIMELOCK SCHEDULE — paste into Safe");
  console.log(sep);
  console.log(`Safe URL:          ${safeUrl}`);
  console.log(`To (timelock):     ${timelockAddress}`);
  console.log(`Value:             0`);
  console.log(`Method:            schedule`);
  console.log(`  target:          ${proxyAddress}`);
  console.log(`  value:           0`);
  console.log(`  data:            ${upgradeCalldata}`);
  console.log(`  predecessor:     ${PREDECESSOR}`);
  console.log(`  salt:            ${SALT}`);
  console.log(`  delay:           ${delay}  (min: ${minDelay})`);
  console.log(`\nOperation id:      ${operationId}`);
  console.log(`\nRaw schedule() calldata (paste into Safe → Tx Builder → Raw):`);
  console.log(scheduleCalldata);

  console.log(`\n${sep}`);
  console.log(`⏳ After Safe executes the schedule(), wait ${delay} seconds.`);
  console.log(sep);

  console.log(`\n${sep}`);
  console.log("📋 TIMELOCK EXECUTE — run from any EOA (executors = [address(0)])");
  console.log(sep);
  console.log(`To (timelock):     ${timelockAddress}`);
  console.log(`Value:             0`);
  console.log(`Method:            execute`);
  console.log(`\nRaw execute() calldata:`);
  console.log(executeCalldata);
  console.log(`\nCast example (replace --rpc-url and --private-key):`);
  console.log(
    `cast send ${timelockAddress} \\\n` +
      `  "execute(address,uint256,bytes,bytes32,bytes32)" \\\n` +
      `  ${proxyAddress} 0 ${upgradeCalldata} ${PREDECESSOR} ${SALT} \\\n` +
      `  --rpc-url $RPC_URL --private-key $PRIVATE_KEY`
  );

  console.log(`\n${sep}`);
  console.log("🔍 POST-UPGRADE VERIFICATION");
  console.log(sep);
  console.log(`# Implementation should be the newly-deployed bytecode:`);
  console.log(`cast call ${proxyAddress} "implementation()(address)" --rpc-url $RPC_URL`);
  console.log(`# Expected: ${newImplAddress}`);
  console.log(`\n# New role grants:`);
  console.log(
    `cast call ${proxyAddress} "hasRole(bytes32,address)(bool)" $(cast keccak "EPOCH_ADMIN") ${epochAdmin} --rpc-url $RPC_URL`
  );
  console.log(
    `cast call ${proxyAddress} "hasRole(bytes32,address)(bool)" $(cast keccak "REDEEM_OPERATOR") ${redeemOperator} --rpc-url $RPC_URL`
  );
  console.log(`# Both should return true.`);
  console.log(sep);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var required`);
  return v;
}

function networkPrefix(name: string): string {
  if (name === "sepolia") return "sep";
  if (name === "mainnet") return "eth";
  return name;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
