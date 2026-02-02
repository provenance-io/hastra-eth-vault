import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Interactive script demonstrating the full user flow
 *
 * Flow:
 * 1. User deposits USDC → receives wYLDS
 * 2. User stakes wYLDS → receives PRIME
 * 3. User earns rewards (PRIME value increases)
 * 4. Rewards distributed to stakers
 * 5. User redeems PRIME → receives wYLDS (specify shares to burn)
 * 6. User withdraws from PRIME → receives wYLDS (specify assets to receive)
 * 7. User requests redemption (wYLDS → USDC)
 * 8. Admin completes redemption → user receives USDC
 */

interface DeploymentInfo {
  contracts: {
    usdc: string;
    yieldVault: string;
    stakingVault: string;
  };
}

function loadDeploymentInfo(): DeploymentInfo {
  const deploymentPath = path.join(__dirname, "..", "deployment.json");

  if (!fs.existsSync(deploymentPath)) {
    console.error("\n❌ ERROR: deployment.json not found!");
    console.error("\nPlease run the deployment script first:");
    console.error("   npx hardhat run scripts/deploy.ts --network localhost\n");
    process.exit(1);
  }

  const data = fs.readFileSync(deploymentPath, "utf-8");
  return JSON.parse(data) as DeploymentInfo;
}

async function main() {
  // Prevent running on mainnet
  const network = await ethers.provider.getNetwork();
  const MAINNET_CHAIN_ID = 1n;
  if (network.chainId === MAINNET_CHAIN_ID) {
    console.error("\n❌ ERROR: This script cannot be run on mainnet!");
    console.error("This is a demo script that mints tokens and should only be used on testnets.\n");
    process.exit(1);
  }

  console.log("\n===========================================");
  console.log("Hastra Vault Protocol - Interactive Demo");
  console.log("===========================================\n");

  // Get signers
  const [deployer, redeemVault, freezeAdmin, rewardsAdmin, user1] =
    await ethers.getSigners();

  console.log("Accounts:");
  console.log("  User:", user1.address);
  console.log("  Rewards Admin:", rewardsAdmin.address);

  // Load contract addresses from deployment.json
  const deployment = loadDeploymentInfo();
  const USDC_ADDRESS = deployment.contracts.usdc;
  const YIELD_VAULT_ADDRESS = deployment.contracts.yieldVault;
  const STAKING_VAULT_ADDRESS = deployment.contracts.stakingVault;

  // Get contract instances
  const usdc = await ethers.getContractAt("MockUSDC", USDC_ADDRESS);
  const yieldVault = await ethers.getContractAt("YieldVault", YIELD_VAULT_ADDRESS);
  const stakingVault = await ethers.getContractAt("StakingVault", STAKING_VAULT_ADDRESS);

  console.log("\nContract Addresses:");
  console.log("  USDC:", await usdc.getAddress());
  console.log("  YieldVault (wYLDS):", await yieldVault.getAddress());
  console.log("  StakingVault (PRIME):", await stakingVault.getAddress());

  // ============ Setup: Fund redeemVault for redemptions ============

  console.log("\n--- Setup: Fund redeemVault for redemptions ---");
  // Mint USDC to redeemVault so it can fulfill redemptions
  await usdc.mint(redeemVault.address, ethers.parseUnits("100000", 6));
  console.log("Minted 100,000 USDC to redeemVault");

  // redeemVault approves YieldVault to pull USDC for redemptions
  await usdc.connect(redeemVault).approve(await yieldVault.getAddress(), ethers.MaxUint256);
  console.log("redeemVault approved YieldVault to spend USDC");

  // ============ Step 1: Mint USDC for user ============

  console.log("\n--- Step 1: Mint USDC for User ---");
  const mintAmount = ethers.parseUnits("10000", 6); // 10,000 USDC
  await usdc.mint(user1.address, mintAmount);

  let usdcBalance = await usdc.balanceOf(user1.address);
  console.log("User USDC balance:", ethers.formatUnits(usdcBalance, 6), "USDC");

  // ============ Step 2: Deposit USDC → Get wYLDS ============

  console.log("\n--- Step 2: Deposit USDC to YieldVault ---");
  const depositAmount = ethers.parseUnits("5000", 6); // 5,000 USDC

  await usdc.connect(user1).approve(await yieldVault.getAddress(), depositAmount);
  console.log("Approved YieldVault to spend", ethers.formatUnits(depositAmount, 6), "USDC");

  await yieldVault.connect(user1).deposit(depositAmount, user1.address);
  console.log("Deposited", ethers.formatUnits(depositAmount, 6), "USDC");

  let wyldsBalance = await yieldVault.balanceOf(user1.address);
  console.log("User wYLDS balance:", ethers.formatUnits(wyldsBalance, 6), "wYLDS");

  // ============ Step 3: Stake wYLDS → Get PRIME ============

  console.log("\n--- Step 3: Stake wYLDS in StakingVault ---");
  const stakeAmount = ethers.parseUnits("3000", 6); // 3,000 wYLDS

  await yieldVault.connect(user1).approve(await stakingVault.getAddress(), stakeAmount);
  console.log("Approved StakingVault to spend", ethers.formatUnits(stakeAmount, 6), "wYLDS");

  await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
  console.log("Staked", ethers.formatUnits(stakeAmount, 6), "wYLDS");

  let primeBalance = await stakingVault.balanceOf(user1.address);
  console.log("User PRIME balance:", ethers.formatUnits(primeBalance, 6), "PRIME");

  // Check conversion
  let primeValue = await stakingVault.convertToAssets(primeBalance);
  console.log("PRIME value in wYLDS:", ethers.formatUnits(primeValue, 6), "wYLDS");

  // ============ Step 4: Distribute Rewards ============

  console.log("\n--- Step 4: Distribute Rewards to Stakers ---");

  // Distribute rewards (mints wYLDS to StakingVault)
  const rewardAmount = ethers.parseUnits("300", 6); // 300 wYLDS rewards
  await stakingVault.connect(rewardsAdmin).distributeRewards(rewardAmount);
  console.log("Distributed", ethers.formatUnits(rewardAmount, 6), "wYLDS as rewards (minted)");

  // Check new value
  primeValue = await stakingVault.convertToAssets(primeBalance);
  console.log("New PRIME value:", ethers.formatUnits(primeValue, 6), "wYLDS");
  console.log("Rewards earned:", ethers.formatUnits(primeValue - stakeAmount, 6), "wYLDS");


  // ============ Step 5: Redeem PRIME → wYLDS (specify shares) ============

  console.log("\n--- Step 5: Redeem PRIME for wYLDS (specify shares to burn) ---");

  // Check current balances
  const primeBeforeRedeem = await stakingVault.balanceOf(user1.address);
  console.log("PRIME balance before redeem:", ethers.formatUnits(primeBeforeRedeem, 6), "PRIME");

  // Redeem 1000 PRIME shares
  const redeemShares = ethers.parseUnits("1000", 6); // 1,000 PRIME

  // Preview how many wYLDS assets will be received
  const assetsToReceive = await stakingVault.previewRedeem(redeemShares);
  console.log("Assets to receive for", ethers.formatUnits(redeemShares, 6), "PRIME:", ethers.formatUnits(assetsToReceive, 6), "wYLDS");

  // Execute redeem: specify shares (PRIME) you want to burn
  const wyldsBeforeRedeem = await yieldVault.balanceOf(user1.address);
  await stakingVault.connect(user1).redeem(redeemShares, user1.address, user1.address);

  const wyldsAfterRedeem = await yieldVault.balanceOf(user1.address);
  const primeAfterRedeem = await stakingVault.balanceOf(user1.address);

  console.log("Received", ethers.formatUnits(wyldsAfterRedeem - wyldsBeforeRedeem, 6), "wYLDS");
  console.log("PRIME balance after redeem:", ethers.formatUnits(primeAfterRedeem, 6), "PRIME");
  console.log("PRIME burned:", ethers.formatUnits(primeBeforeRedeem - primeAfterRedeem, 6), "PRIME");

  // ============ Step 6: Withdraw wYLDS from PRIME (specify assets) ============

  console.log("\n--- Step 6: Withdraw wYLDS from StakingVault (specify assets to receive) ---");

  // Check current PRIME balance
  const primeBeforeWithdraw = await stakingVault.balanceOf(user1.address);
  console.log("PRIME balance before withdraw:", ethers.formatUnits(primeBeforeWithdraw, 6), "PRIME");

  // Withdraw 500 wYLDS worth of assets (burns equivalent PRIME shares)
  const withdrawAmount = ethers.parseUnits("500", 6); // 500 wYLDS

  // Preview how many shares will be burned
  const sharesToBurn = await stakingVault.previewWithdraw(withdrawAmount);
  console.log("Shares to burn for", ethers.formatUnits(withdrawAmount, 6), "wYLDS:", ethers.formatUnits(sharesToBurn, 6), "PRIME");

  // Execute withdraw: specify assets (wYLDS) you want to receive
  const wyldsBeforeWithdraw = await yieldVault.balanceOf(user1.address);
  await stakingVault.connect(user1).withdraw(withdrawAmount, user1.address, user1.address);

  const wyldsAfterWithdraw = await yieldVault.balanceOf(user1.address);
  const primeAfterWithdraw = await stakingVault.balanceOf(user1.address);

  console.log("Withdrew", ethers.formatUnits(wyldsAfterWithdraw - wyldsBeforeWithdraw, 6), "wYLDS");
  console.log("PRIME balance after withdraw:", ethers.formatUnits(primeAfterWithdraw, 6), "PRIME");
  console.log("PRIME burned:", ethers.formatUnits(primeBeforeWithdraw - primeAfterWithdraw, 6), "PRIME");

  // ============ Step 7: Request Redemption (wYLDS → USDC) ============

  console.log("\n--- Step 7: Request Redemption (wYLDS → USDC) ---");
  const redeemAmount = ethers.parseUnits("1000", 6); // 1,000 wYLDS

  await yieldVault.connect(user1).requestRedeem(redeemAmount);
  console.log("Requested redemption of", ethers.formatUnits(redeemAmount, 6), "wYLDS");

  // Check pending redemption
  const pending = await yieldVault.pendingRedemptions(user1.address);
  console.log("Pending redemption:");
  console.log("  Shares:", ethers.formatUnits(pending.shares, 6), "wYLDS");
  console.log("  Assets:", ethers.formatUnits(pending.assets, 6), "USDC");

  // ============ Step 8: Complete Redemption (Admin) ============

  console.log("\n--- Step 8: Complete Redemption (Admin) ---");

  const usdcBeforeRedeem = await usdc.balanceOf(user1.address);

  // Redeem vault completes the redemption
  await yieldVault.connect(rewardsAdmin).completeRedeem(user1.address);
  console.log("Redemption completed by admin");

  const usdcAfterRedeem = await usdc.balanceOf(user1.address);
  const usdcReceived = usdcAfterRedeem - usdcBeforeRedeem;
  console.log("User received", ethers.formatUnits(usdcReceived, 6), "USDC");

  // ============ Final Balances ============

  console.log("\n===========================================");
  console.log("Final Balances");
  console.log("===========================================");

  usdcBalance = await usdc.balanceOf(user1.address);
  wyldsBalance = await yieldVault.balanceOf(user1.address);
  primeBalance = await stakingVault.balanceOf(user1.address);

  console.log("USDC:", ethers.formatUnits(usdcBalance, 6));
  console.log("wYLDS:", ethers.formatUnits(wyldsBalance, 6));
  console.log("PRIME:", ethers.formatUnits(primeBalance, 6));

  if (primeBalance > 0) {
    const primeAssets = await stakingVault.convertToAssets(primeBalance);
    console.log("PRIME value:", ethers.formatUnits(primeAssets, 6), "wYLDS");
  }

  console.log("\n===========================================");
  console.log("Demo Complete!");
  console.log("===========================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
