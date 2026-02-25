import { ethers, upgrades, run } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Upgrading HastraNavEngine with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const network = await ethers.provider.getNetwork();
  console.log("\nNetwork:", network.name);
  console.log("Chain ID:", network.chainId.toString());

  // Get proxy address from environment or use default
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) {
    throw new Error("PROXY_ADDRESS environment variable not set");
  }

  console.log("\n📋 Upgrade Details:");
  console.log("Proxy Address:", proxyAddress);

  // Get current implementation address
  const currentImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("Current Implementation:", currentImpl);

  // Deploy new implementation
  console.log("\n🚀 Deploying new implementation...");
  const HastraNavEngineV2 = await ethers.getContractFactory("HastraNavEngineV2");
  
  const upgraded = await upgrades.upgradeProxy(proxyAddress, HastraNavEngineV2, { redeployImplementation: "always" });
  await upgraded.waitForDeployment();

  const newImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("✅ New Implementation:", newImpl);

  // Verify storage slot was updated correctly
  const navEngine = await ethers.getContractAt("HastraNavEngine", proxyAddress);
  const currentRate = await navEngine.getRate();
  console.log("\n📊 Verification:");
  console.log("Current Rate (should be preserved):", currentRate.toString());

  // Wait before verification
  console.log("\n⏳ Waiting 30 seconds before verification...");
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Verify new implementation
  try {
    console.log("\n🔍 Verifying new implementation on block explorer...");
    await run("verify:verify", {
      address: newImpl,
      constructorArguments: [],
      contract: "contracts/mocks/HastraNavEngineV2.sol:HastraNavEngineV2",
    });
    console.log("✅ Implementation verified!");
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log("✅ Implementation already verified!");
    } else {
      console.error("❌ Verification failed:", error.message);
    }
  }

  console.log("\n✅ Upgrade Complete!");
  console.log("\n📋 Summary:");
  console.log("Network:", network.name);
  console.log("Proxy:", proxyAddress);
  console.log("Old Implementation:", currentImpl);
  console.log("New Implementation:", newImpl);
  console.log("\n🔗 Explorer Links:");
  const explorerBase = network.chainId === 560048n 
    ? "https://hoodi.etherscan.io/address/"
    : "https://sepolia.etherscan.io/address/";
  console.log("Proxy:", explorerBase + proxyAddress);
  console.log("New Implementation:", explorerBase + newImpl);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
