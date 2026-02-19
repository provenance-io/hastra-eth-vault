import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying HastraNavEngine with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deployment parameters
  const OWNER = deployer.address;  // Change to your admin address
  const UPDATER = deployer.address;  // Change to your bot address
  const MAX_DIFFERENCE_PERCENT = ethers.parseEther("0.1");  // 10%
  const MIN_RATE = BigInt("500000000000000000");  // 0.5 as int192
  const MAX_RATE = BigInt("3000000000000000000");  // 3.0 as int192

  console.log("\nDeployment Parameters:");
  console.log("  Owner:", OWNER);
  console.log("  Updater:", UPDATER);
  console.log("  Max Difference:", MAX_DIFFERENCE_PERCENT.toString(), "(10%)");
  console.log("  Min Rate:", MIN_RATE.toString(), "(0.5)");
  console.log("  Max Rate:", MAX_RATE.toString(), "(3.0)");

  // Deploy proxy
  const HastraNavEngine = await ethers.getContractFactory("HastraNavEngine");
  const navEngine = await upgrades.deployProxy(
    HastraNavEngine,
    [OWNER, UPDATER, MAX_DIFFERENCE_PERCENT, MIN_RATE, MAX_RATE],
    { 
      initializer: "initialize",
      kind: "uups"
    }
  );

  await navEngine.waitForDeployment();
  const address = await navEngine.getAddress();

  console.log("\n✅ HastraNavEngine deployed!");
  console.log("  Proxy Address:", address);
  console.log("  Implementation:", await upgrades.erc1967.getImplementationAddress(address));

  // Verify deployment
  console.log("\nVerifying deployment...");
  const updater = await navEngine.getUpdater();
  const minRate = await navEngine.getMinRate();
  const maxRate = await navEngine.getMaxRate();
  
  console.log("  Updater:", updater);
  console.log("  Min Rate:", minRate.toString());
  console.log("  Max Rate:", maxRate.toString());
  console.log("  Owner:", await navEngine.owner());

  console.log("\n✅ Deployment successful!");
  console.log("\nNext steps:");
  console.log("  1. Configure Chainlink DON to read from:", address);
  console.log("  2. Set up bot to call updateRate(totalSupply, totalTVL)");
  console.log("  3. DON will read getRate() which returns int192");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
