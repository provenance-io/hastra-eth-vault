// @ts-ignore
import { ethers, upgrades, network } from "hardhat";

/**
 * Prepares the YieldVault V2 role-split + Audit 4.1 caps upgrade — routed
 * through the TimelockController.
 *
 * Produces, in order:
 *   1. A freshly deployed YieldVaultV2 implementation.
 *   2. The `initializeV2(version, epochAdmin, redeemOperator, globalCap)` calldata.
 *   3. The `upgradeToAndCall(newImpl, initializeV2Calldata)` calldata
 *      (this is what the Timelock will execute against the proxy).
 *   4. The `timelock.schedule(...)` calldata — paste this into the Safe.
 *   5. The `timelock.execute(...)` calldata — paste into the Safe (or run from
 *      any EOA, since executors=[address(0)]) after the timelock delay elapses.
 *
 * VERSION env var = OZ reinitializer version. Pass the value strictly greater
 * than the proxy's current `_initialized`:
 *   - Mainnet  YieldVault proxy `_initialized == 1` → VERSION=2
 *   - Sepolia  YieldVault proxy `_initialized == 3` → VERSION=4
 *     (Sepolia already ran the previous role-split-only impl, so re-passing the
 *      same epochAdmin + redeemOperator is required — `_grantRole` is idempotent
 *      and will NOT silently grant additional holders.)
 * Script auto-reads the proxy's current `_initialized` and aborts if VERSION
 * isn't valid.
 *
 * GLOBAL_CAP env var = initial `maxEpochCap` value (in 6-decimal wYLDS units).
 *   Default: 5_000_000_000_000  (= 5,000,000 wYLDS)
 *
 * Usage:
 *   PROXY=<yield_vault_proxy> \
 *   TIMELOCK=<timelock_address> \
 *   EPOCH_ADMIN=<safe_or_eoa> \
 *   REDEEM_OPERATOR=<ops_eoa> \
 *   [GLOBAL_CAP=<6dec_wYLDS_amount>] \
 *   [VERSION=<reinitializer_version>] \
 *   [DELAY=<seconds_override>] \
 *   [SAFE_ADDRESS=<safe_for_url>] \
 *   [DRY_RUN=true] \
 *     npx hardhat run scripts/admin/prepare-yieldvault-v2-upgrade.ts --network <network>
 *
 * DRY_RUN=true: skip the impl deployment entirely. The script runs
 * `upgrades.validateUpgrade` (storage-layout + unsafe-ops check) and substitutes
 * a placeholder impl address (0x…dEaD) in all printed calldata so you can
 * preview the operation without spending gas.
 *
 * EPOCH_ADMIN and REDEEM_OPERATOR are REQUIRED — must be set explicitly. The
 * script prints the current on-chain role holders before producing calldata so
 * the operator can sanity-check the env vars against live state (and gets a
 * loud warning if the env address doesn't match any existing holder).
 *
 * Sepolia example (proxy already at _initialized=3 → VERSION=4 — re-pass
 * existing role holders):
 *   PROXY=0x0258787Eb97DD01436B562943D8ca85B772D7b98 \
 *   TIMELOCK=0x8C6ed403d20Ec24a9Ac14E46Af2365B97Af9d951 \
 *   EPOCH_ADMIN=0x4E79e5BB88f0596446c615B86D3780A11DB1a2f4 \
 *   REDEEM_OPERATOR=0x3778F66336F79B2B0D86E759499D191EA030a4c6 \
 *   GLOBAL_CAP=5000000000000 \
 *   VERSION=4 \
 *   SAFE_ADDRESS=0x4E79e5BB88f0596446c615B86D3780A11DB1a2f4 \
 *     npx hardhat run scripts/admin/prepare-yieldvault-v2-upgrade.ts --network sepolia
 *
 * Mainnet example (proxy at _initialized=1 → VERSION=2):
 *   PROXY=0x6aD038cA6C04e885630851278ca0a856Ad9a66Cc \
 *   TIMELOCK=<mainnet_timelock_addr> \
 *   EPOCH_ADMIN=0x8D358B8aE881F8ea92C3d07783aBCA21727C6309 \
 *   REDEEM_OPERATOR=0xA8C3CF6183D49d5D372f8FC149BD2cb5CFC0faCd \
 *   GLOBAL_CAP=5000000000000 \
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
  // EPOCH_ADMIN / REDEEM_OPERATOR are REQUIRED — explicit > clever. The script
  // prints discovered on-chain holders below so the operator can verify they
  // match what they're about to pass in.
  const epochAdmin = requireEnv("EPOCH_ADMIN");
  const redeemOperator = requireEnv("REDEEM_OPERATOR");
  const versionOverride = process.env.VERSION ? BigInt(process.env.VERSION) : undefined;
  const delayOverride = process.env.DELAY ? BigInt(process.env.DELAY) : undefined;

  // Default: 1,000,000 wYLDS (6-dec) = 1_000_000_000_000 raw.
  const DEFAULT_GLOBAL_CAP = 1_000_000n * 10n ** 6n;
  const globalCap = process.env.GLOBAL_CAP ? BigInt(process.env.GLOBAL_CAP) : DEFAULT_GLOBAL_CAP;
  if (globalCap === 0n) throw new Error(`GLOBAL_CAP must be > 0; initializeV2 will revert InvalidGlobalCap.`);

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
  console.log(`GLOBAL_CAP   →     ${globalCap}  (${Number(globalCap) / 1e6} wYLDS)`);

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
  // 1b. Discovery print — show on-chain state the operator should sanity-check
  //     against the env vars they just passed in.
  //     - currentEpochIndex previews what firstCappedEpoch will become.
  //     - For V2-already proxies (Sepolia): list current role holders so the
  //       operator can cross-check EPOCH_ADMIN / REDEEM_OPERATOR env vars
  //       (re-passing the same addresses keeps `_grantRole` a no-op).
  //     - For V1 proxies (mainnet today): there are no V2 role holders to
  //       discover; the env vars are the first grant.
  // ─────────────────────────────────────────────────────────────────────────
  const probeIface = new ethers.Interface([
    "function EPOCH_ADMIN_ROLE() view returns (bytes32)",
    "function REDEEM_OPERATOR_ROLE() view returns (bytes32)",
    "function hasRole(bytes32, address) view returns (bool)",
    "function currentEpochIndex() view returns (uint256)",
  ]);
  const proxy = new ethers.Contract(proxyAddress, probeIface, ethers.provider);

  try {
    const cei: bigint = await proxy.currentEpochIndex();
    console.log(`\n🔎 firstCappedEpoch preview: ${cei}  (epochs 0..${cei === 0n ? "none" : (cei - 1n).toString()} will be grandfathered)`);
  } catch {
    console.log(`\n🔎 firstCappedEpoch preview: (unable to read currentEpochIndex)`);
  }

  // YieldVault uses base AccessControl (no Enumerable extension) — we can't
  // enumerate holders, only check membership for known addresses. Probe the
  // env addresses against the proxy: if the role accessors revert, the proxy
  // is still on V1 (no V2 roles defined yet); otherwise report whether the
  // env addresses are already holders.
  try {
    const epochAdminRole: string = await proxy.EPOCH_ADMIN_ROLE();
    const redeemOperatorRole: string = await proxy.REDEEM_OPERATOR_ROLE();
    const epochHas: boolean = await proxy.hasRole(epochAdminRole, epochAdmin);
    const redeemHas: boolean = await proxy.hasRole(redeemOperatorRole, redeemOperator);

    console.log(`\n🔎 Role probe (proxy is V2-or-newer — V2 roles defined):`);
    console.log(`   EPOCH_ADMIN_ROLE      hasRole(${epochAdmin}): ${epochHas ? "✅ already a holder" : "➕ will be granted"}`);
    console.log(`   REDEEM_OPERATOR_ROLE  hasRole(${redeemOperator}): ${redeemHas ? "✅ already a holder" : "➕ will be granted"}`);
    console.log(`   (For full holder enumeration use: CONTRACT_ADDRESS=${proxyAddress} CONTRACT_TYPE=yieldvault npx hardhat run scripts/ops/list-roles.ts --network ${network.name})`);
  } catch {
    console.log(`\n🔎 Role probe: proxy is still V1 — V2 role accessors not present yet, env vars will be the initial grants.`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Deploy the new YieldVaultV2 implementation.
  // ─────────────────────────────────────────────────────────────────────────
  const Factory = await ethers.getContractFactory("YieldVaultV2");

  // forceImport must use the factory that matches the proxy's CURRENT implementation
  // layout (YieldVault V1), so the OZ manifest baseline reflects actual on-chain state.
  // Using YieldVaultV2 here would poison the manifest and cause validateUpgrade /
  // prepareUpgrade to compare V2→V2 instead of V1→V2, silently skipping the real check.
  const CurrentImplFactory = await ethers.getContractFactory("YieldVault");
  try {
    await upgrades.forceImport(proxyAddress, CurrentImplFactory, { kind: "uups" });
  } catch (e: any) {
    if (!e.message?.includes("already registered") && !e.message?.includes("Found existing")) {
      throw e;
    }
  }

  const currentImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log(`\n📋 Current implementation: ${currentImpl}`);

  const dryRun = /^(1|true|yes)$/i.test(process.env.DRY_RUN ?? "");
  let newImplAddress: string;
  if (dryRun) {
    console.log(`\n🧪 DRY_RUN=true — skipping deployment, running storage-layout validation only.`);
    await upgrades.validateUpgrade(proxyAddress, Factory, { kind: "uups" });
    console.log(`✅ validateUpgrade passed (storage layout compatible, no unsafe ops).`);
    newImplAddress = "0x000000000000000000000000000000000000dEaD";
    console.log(`📌 Using placeholder impl address in calldata: ${newImplAddress}`);
    console.log(`   (Re-run without DRY_RUN to deploy and produce real calldata.)`);
  } else {
    console.log(`\n🚀 Deploying new YieldVaultV2 implementation...`);
    newImplAddress = (await upgrades.prepareUpgrade(proxyAddress, Factory, {
      redeployImplementation: "always",
    })) as string;
    console.log(`✅ New implementation: ${newImplAddress}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Encode initializeV2 + upgradeToAndCall.
  // ─────────────────────────────────────────────────────────────────────────
  const vaultIface = new ethers.Interface([
    "function initializeV2(uint64 version, address epochAdmin, address redeemOperator, uint256 globalCap)",
    "function upgradeToAndCall(address newImplementation, bytes data)",
  ]);

  const initializeV2Calldata = vaultIface.encodeFunctionData("initializeV2", [
    version,
    epochAdmin,
    redeemOperator,
    globalCap,
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
  console.log(`# Implementation — read the EIP-1967 slot (UUPS proxies don't expose implementation()):`);
  console.log(`cast storage ${proxyAddress} 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc --rpc-url $RPC_URL | cast to-address`);
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
