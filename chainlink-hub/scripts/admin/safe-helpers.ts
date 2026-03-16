import * as fs from "fs";
import * as path from "path";
import { network } from "hardhat";

const SAFE_CHAIN_PREFIX: Record<string, string> = {
  mainnet: "eth",
  sepolia: "sep",
  holesky: "hol",
};

export function resolveContractName(): string {
  return process.env.CONTRACT || "FeedVerifier";
}

export function resolveProxyAddress(contractName: string): string {
  if (process.env.PROXY) {
    return process.env.PROXY;
  }

  if (contractName === "FeedVerifier") {
    const deploymentFile = path.join(
      __dirname,
      `../../deployment_feed_verifier_${network.name}.json`,
    );
    if (!fs.existsSync(deploymentFile)) {
      throw new Error(
        `PROXY env var not set and deployment file not found: ${deploymentFile}`,
      );
    }

    const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    if (!deployment.feedVerifier) {
      throw new Error(
        `Deployment file ${deploymentFile} does not contain feedVerifier`,
      );
    }
    return deployment.feedVerifier;
  }

  throw new Error(
    `PROXY env var required for contract ${contractName}. Automatic lookup only exists for FeedVerifier.`,
  );
}

export function resolveSafeAddress(): string | undefined {
  return process.env.SAFE_ADDRESS || undefined;
}

export function resolveSafeAppUrl(safeAddress?: string): string | undefined {
  if (process.env.SAFE_APP_URL) {
    return process.env.SAFE_APP_URL;
  }
  if (!safeAddress) {
    return undefined;
  }

  const chainPrefix = SAFE_CHAIN_PREFIX[network.name];
  if (!chainPrefix) {
    return undefined;
  }

  return `https://app.safe.global/${chainPrefix}:${safeAddress}`;
}

export function printSafeContext(safeAddress?: string): void {
  const safeUrl = resolveSafeAppUrl(safeAddress);
  if (safeAddress) {
    console.log(`Safe address:   ${safeAddress}`);
  }
  if (safeUrl) {
    console.log(`Safe UI:        ${safeUrl}`);
  } else if (!safeAddress) {
    console.log("Safe UI:        set SAFE_ADDRESS or SAFE_APP_URL to print the exact Safe link");
  }
}
