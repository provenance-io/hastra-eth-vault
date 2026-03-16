#!/usr/bin/env node
/**
 * decode-calldata.ts
 *
 * Decodes raw EVM calldata for known Hastra contract functions.
 * Prints human-readable argument values with token-scaled interpretations.
 *
 * Usage:
 *   CALLDATA=0x405abb41... npx hardhat run scripts/decode-calldata.ts --network hardhat
 *   CALLDATA=0x405abb41... node scripts/decode-calldata.ts   (plain Node, no hardhat needed)
 *
 * Or pass as CLI arg:
 *   node scripts/decode-calldata.ts 0x405abb41...
 */

import { ethers } from "ethers";

// ── Known function ABIs ───────────────────────────────────────────────────────

const FUNCTIONS = [
  // HastraNavEngine
  "function updateRate(uint256 totalSupply_, uint256 totalTVL_)",
  "function initialize(address updater_, int192 initialRate_, int192 minRate_, int192 maxRate_, uint256 maxDifferencePercent_)",
  "function setUpdater(address updater_)",
  "function setMinRate(int192 minRate_)",
  "function setMaxRate(int192 maxRate_)",
  "function setMaxDifferencePercent(uint256 maxDifferencePercent_)",

  // FeedVerifier
  "function initialize(address admin_, address updater_, address verifierProxy_, bytes32 feedId_)",
  "function setAllowedFeedId(bytes32 feedId_)",
  "function setMaxStaleness(uint32 maxStaleness_)",
  "function verifyReport(bytes unverifiedReport)",
  "function withdrawToken(address beneficiary, address token)",
  "function grantRole(bytes32 role, address account)",
  "function revokeRole(bytes32 role, address account)",
  "function upgradeTo(address newImplementation)",
  "function upgradeToAndCall(address newImplementation, bytes data)",
  "function pause()",
  "function unpause()",
];

const iface = new ethers.Interface(FUNCTIONS);

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt(name: string, value: unknown, extra?: string): string {
  const v = typeof value === "bigint" ? value.toString() : String(value);
  return extra ? `  ${name.padEnd(22)} ${v}\n${"".padEnd(24)}${extra}` : `  ${name.padEnd(22)} ${v}`;
}

function scaleHint(raw: bigint, decimals: number): string {
  const scaled = Number(raw) / 10 ** decimals;
  return `(÷1e${decimals} → ${scaled.toFixed(decimals > 12 ? 8 : 6)})`;
}

function int192Hint(raw: bigint): string {
  return `(1e18 → ${(Number(raw) / 1e18).toFixed(10)} per share)`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function decode(calldata: string) {
  const selector = calldata.slice(0, 10).toLowerCase();

  let fragment: ethers.FunctionFragment | null = null;
  for (const fn of iface.fragments) {
    if (ethers.FunctionFragment.isFragment(fn) && iface.getFunction(fn.name)?.selector === selector) {
      fragment = fn as ethers.FunctionFragment;
      break;
    }
  }

  if (!fragment) {
    console.log(`\nUnknown selector: ${selector}`);
    console.log("Known selectors:");
    for (const fn of iface.fragments) {
      if (ethers.FunctionFragment.isFragment(fn)) {
        const f = fn as ethers.FunctionFragment;
        console.log(`  ${iface.getFunction(f.name)?.selector}  ${f.format()}`);
      }
    }
    return;
  }

  const decoded = iface.decodeFunctionData(fragment, calldata);

  console.log("\n" + "═".repeat(60));
  console.log(` Function: ${fragment.format()}`);
  console.log(` Selector: ${selector}`);
  console.log("═".repeat(60));

  fragment.inputs.forEach((input, i) => {
    const raw = decoded[i] as bigint;
    let extra = "";

    if (input.name === "totalSupply_" || input.name === "totalTVL_") {
      extra = scaleHint(raw, 6) + "  ← assuming 6-decimal token";
    } else if (input.type === "int192" && (input.name?.includes("Rate") || input.name?.includes("rate"))) {
      extra = int192Hint(raw);
    } else if (input.name === "maxDifferencePercent_") {
      extra = `(÷100 → ${(Number(raw) / 100).toFixed(2)}%)`;
    } else if (input.name === "maxStaleness_") {
      extra = `(${(Number(raw) / 60).toFixed(1)} minutes)`;
    }

    console.log(fmt(input.name ?? `arg${i}`, raw, extra || undefined));
  });

  // Special: if updateRate, show implied NAV
  if (fragment.name === "updateRate") {
    const supply = decoded[0] as bigint;
    const tvl    = decoded[1] as bigint;
    if (supply > 0n) {
      const nav = Number(tvl) / Number(supply);
      console.log("\n" + "─".repeat(60));
      console.log(`  Implied NAV            ${nav.toFixed(10)}  (TVL ÷ supply)`);
      console.log(`  Supply                 ${(Number(supply) / 1e6).toFixed(6)} tokens`);
      console.log(`  TVL                    ${(Number(tvl) / 1e6).toFixed(6)} tokens`);
    }
  }

  console.log("═".repeat(60) + "\n");
}

const calldata = process.argv[2] || process.env.CALLDATA;
if (!calldata) {
  console.error("Usage: CALLDATA=0x... node scripts/decode-calldata.ts");
  console.error("   or: node scripts/decode-calldata.ts 0x...");
  process.exit(1);
}

decode(calldata);
