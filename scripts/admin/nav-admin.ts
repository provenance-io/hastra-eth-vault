// @ts-ignore
import { ethers, network } from "hardhat";

/**
 * Admin script for HastraNavEngine.
 *
 * Usage:
 *   CONTRACT_ADDRESS=<proxy> COMMAND=<cmd> npx hardhat run scripts/admin/nav-admin.ts --network <network>
 *
 * Commands:
 *   pause                        Pause the NavEngine (owner only)
 *   unpause                      Unpause the NavEngine (owner only)
 *   status                       Print current state (rate, updater, paused, bounds)
 *   set-updater  <address>       Set the updater address — pass via ARG env var
 *   set-max-diff <percent_e18>   Set max difference percent (1e18 = 100%) — pass via ARG env var
 *
 * Example:
 *   CONTRACT_ADDRESS=0xBc494b33... COMMAND=pause npx hardhat run scripts/admin/nav-admin.ts --network sepolia
 *   CONTRACT_ADDRESS=0xBc494b33... COMMAND=set-updater ARG=0xNewAddr... npx hardhat run scripts/admin/nav-admin.ts --network sepolia
 */

async function main() {
  const address = process.env.CONTRACT_ADDRESS;
  if (!address) throw new Error("CONTRACT_ADDRESS env var required");

  const command = process.env.COMMAND;
  if (!command) {
    console.log("COMMAND env var required. Options: pause | unpause | status | set-updater | set-max-diff");
    return;
  }

  const [signer] = await ethers.getSigners();
  const nav = await ethers.getContractAt("HastraNavEngine", address);

  console.log(`Network:  ${network.name}`);
  console.log(`Contract: ${address}`);
  console.log(`Signer:   ${signer.address}\n`);

  switch (command) {
    case "pause": {
      const tx = await nav.pause();
      await tx.wait();
      console.log(`✅ Paused. Tx: ${tx.hash}`);
      break;
    }

    case "unpause": {
      const tx = await nav.unpause();
      await tx.wait();
      console.log(`✅ Unpaused. Tx: ${tx.hash}`);
      break;
    }

    case "status": {
      const [paused, rate, updater, owner, minRate, maxRate] = await Promise.all([
        nav.paused(),
        nav.getRate(),
        nav.getUpdater(),
        nav.owner(),
        nav.getMinRate(),
        nav.getMaxRate(),
      ]);
      console.log("📊 NavEngine Status");
      console.log("  Paused:   ", paused);
      console.log("  Rate:     ", ethers.formatUnits(rate, 18));
      console.log("  Min Rate: ", ethers.formatUnits(minRate, 18));
      console.log("  Max Rate: ", ethers.formatUnits(maxRate, 18));
      console.log("  Updater:  ", updater);
      console.log("  Owner:    ", owner);
      break;
    }

    case "set-updater": {
      const arg = process.env.ARG;
      if (!arg) throw new Error("ARG env var required (new updater address)");
      const tx = await nav.setUpdater(arg);
      await tx.wait();
      console.log(`✅ Updater set to ${arg}. Tx: ${tx.hash}`);
      break;
    }

    case "set-max-diff": {
      const arg = process.env.ARG;
      if (!arg) throw new Error("ARG env var required (percent in 1e18 units, e.g. 100000000000000000 = 10%)");
      const tx = await nav.setMaxDifferencePercent(BigInt(arg));
      await tx.wait();
      console.log(`✅ Max difference percent set to ${arg}. Tx: ${tx.hash}`);
      break;
    }

    default:
      throw new Error(`Unknown command: ${command}. Options: pause | unpause | status | set-updater | set-max-diff`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
