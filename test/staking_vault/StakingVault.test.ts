import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import type { MockUSDC, YieldVault, StakingVault } from "../../typechain-types";

describe("StakingVault", function () {
  // ============ Fixtures ============
  
  async function deployStakingVaultFixture() {
    const [owner, redeemVault, freezeAdmin, rewardsAdmin, user1, user2, user3] = 
      await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy() as unknown as MockUSDC;
    await usdc.waitForDeployment();

    // Deploy YieldVault (Upgradeable)
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await upgrades.deployProxy(YieldVault, [
      await usdc.getAddress(),
      "Wrapped YLDS",
      "wYLDS",
      owner.address,
      redeemVault.address,
      ethers.ZeroAddress
    ], { kind: 'uups' }) as unknown as YieldVault;
    await yieldVault.waitForDeployment();

    // Deploy StakingVault (Upgradeable)
    const StakingVault = await ethers.getContractFactory("StakingVault");
    const stakingVault = await upgrades.deployProxy(StakingVault, [
      await yieldVault.getAddress(),
      "Prime Staked YLDS",
      "PRIME",
      owner.address,
      await yieldVault.getAddress()
    ], { kind: 'uups' }) as unknown as StakingVault;
    await stakingVault.waitForDeployment();

    // Setup roles
    const FREEZE_ADMIN_ROLE = await stakingVault.FREEZE_ADMIN_ROLE();
    const REWARDS_ADMIN_ROLE = await stakingVault.REWARDS_ADMIN_ROLE();
    const YIELD_VAULT_REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();

    await stakingVault.grantRole(FREEZE_ADMIN_ROLE, freezeAdmin.address);
    await stakingVault.grantRole(REWARDS_ADMIN_ROLE, rewardsAdmin.address);

    // Grant YieldVault REWARDS_ADMIN_ROLE to StakingVault so it can mint wYLDS
    await yieldVault.grantRole(YIELD_VAULT_REWARDS_ADMIN_ROLE, await stakingVault.getAddress());

    // Mint USDC and deposit to get wYLDS
    const usdcAmount = ethers.parseUnits("100000", 6);
    await usdc.mint(user1.address, usdcAmount);
    await usdc.mint(user2.address, usdcAmount);
    await usdc.mint(user3.address, usdcAmount);
    await usdc.mint(rewardsAdmin.address, usdcAmount);

    await usdc.connect(user1).approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await usdc.connect(user2).approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await usdc.connect(user3).approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await usdc.connect(rewardsAdmin).approve(await yieldVault.getAddress(), ethers.MaxUint256);

    // Get wYLDS for users
    const wyldsAmount = ethers.parseUnits("50000", 6);
    await yieldVault.connect(user1).deposit(wyldsAmount, user1.address);
    await yieldVault.connect(user2).deposit(wyldsAmount, user2.address);
    await yieldVault.connect(user3).deposit(wyldsAmount, user3.address);
    await yieldVault.connect(rewardsAdmin).deposit(wyldsAmount, rewardsAdmin.address);

    // Approve staking vault
    await yieldVault.connect(user1).approve(await stakingVault.getAddress(), ethers.MaxUint256);
    await yieldVault.connect(user2).approve(await stakingVault.getAddress(), ethers.MaxUint256);
    await yieldVault.connect(user3).approve(await stakingVault.getAddress(), ethers.MaxUint256);
    await yieldVault.connect(rewardsAdmin).approve(await stakingVault.getAddress(), ethers.MaxUint256);

    return { 
      stakingVault, 
      yieldVault, 
      usdc, 
      owner, 
      freezeAdmin, 
      rewardsAdmin, 
      user1, 
      user2, 
      user3
    };
  }

  // ============ Deployment Tests ============

  describe("Deployment", function () {
    it("Should set the correct asset (wYLDS)", async function () {
      const { stakingVault, yieldVault } = await loadFixture(deployStakingVaultFixture);
      expect(await stakingVault.asset()).to.equal(await yieldVault.getAddress());
    });

    it("Should set the correct name and symbol", async function () {
      const { stakingVault } = await loadFixture(deployStakingVaultFixture);
      expect(await stakingVault.name()).to.equal("Prime Staked YLDS");
      expect(await stakingVault.symbol()).to.equal("PRIME");
    });

    it("Should grant admin role", async function () {
      const { stakingVault, owner } = await loadFixture(deployStakingVaultFixture);
      const DEFAULT_ADMIN_ROLE = await stakingVault.DEFAULT_ADMIN_ROLE();
      expect(await stakingVault.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
    });
  });

  // ============ Staking Tests ============

  describe("Staking (Deposits)", function () {
    it("Should allow staking wYLDS and mint PRIME 1:1", async function () {
      const { stakingVault, yieldVault, user1 } = await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      expect(await stakingVault.balanceOf(user1.address)).to.equal(stakeAmount);
      expect(await yieldVault.balanceOf(await stakingVault.getAddress())).to.equal(stakeAmount);
    });

    it("Should handle multiple stakes correctly", async function () {
      const { stakingVault, user1 } = await loadFixture(deployStakingVaultFixture);
      
      const stake1 = ethers.parseUnits("1000", 6);
      const stake2 = ethers.parseUnits("500", 6);
      
      await stakingVault.connect(user1).deposit(stake1, user1.address);
      await stakingVault.connect(user1).deposit(stake2, user1.address);
      
      expect(await stakingVault.balanceOf(user1.address)).to.equal(stake1 + stake2);
    });

    it("Should not allow staking when paused", async function () {
      const { stakingVault, owner, user1 } = await loadFixture(deployStakingVaultFixture);
      
      const PAUSER_ROLE = await stakingVault.PAUSER_ROLE();
      await stakingVault.grantRole(PAUSER_ROLE, owner.address);
      await stakingVault.pause();
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      
      await expect(
        stakingVault.connect(user1).deposit(stakeAmount, user1.address)
      ).to.be.revertedWithCustomError(stakingVault, "EnforcedPause");
    });

    it("Should emit Deposit event", async function () {
      const { stakingVault, user1 } = await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      
      await expect(stakingVault.connect(user1).deposit(stakeAmount, user1.address))
        .to.emit(stakingVault, "Deposit")
        .withArgs(user1.address, user1.address, stakeAmount, stakeAmount);
    });
  });

  // ============ Rewards Distribution Tests ============

  describe("Rewards Distribution", function () {
    it("Should distribute rewards and increase share value", async function () {
      const { stakingVault, yieldVault, rewardsAdmin, user1 } = 
        await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      const rewardAmount = ethers.parseUnits("100", 6);
      
      const sharesBefore = await stakingVault.balanceOf(user1.address);
      const assetsBefore = await stakingVault.convertToAssets(sharesBefore);
      
      const tx = await stakingVault.connect(rewardsAdmin).distributeRewards(rewardAmount);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);
      
      await expect(tx)
        .to.emit(stakingVault, "RewardsDistributed")
        .withArgs(rewardAmount, block!.timestamp);
      
      const sharesAfter = await stakingVault.balanceOf(user1.address);
      const assetsAfter = await stakingVault.convertToAssets(sharesAfter);
      
      // Shares should remain the same
      expect(sharesAfter).to.equal(sharesBefore);
      
      // But assets per share should increase
      expect(assetsAfter).to.be.greaterThan(assetsBefore);
      // Allow for small rounding errors (1 wei difference)
      expect(assetsAfter).to.be.closeTo(assetsBefore + rewardAmount, 1);
    });

    it("Should distribute rewards proportionally to all stakers", async function () {
      const { stakingVault, rewardsAdmin, user1, user2 } = 
        await loadFixture(deployStakingVaultFixture);
      
      const stake1 = ethers.parseUnits("1000", 6);
      const stake2 = ethers.parseUnits("2000", 6);
      
      await stakingVault.connect(user1).deposit(stake1, user1.address);
      await stakingVault.connect(user2).deposit(stake2, user2.address);
      
      const rewardAmount = ethers.parseUnits("300", 6); // 300 wYLDS
      
      const shares1Before = await stakingVault.balanceOf(user1.address);
      const shares2Before = await stakingVault.balanceOf(user2.address);
      
      await stakingVault.connect(rewardsAdmin).distributeRewards(rewardAmount);
      
      const assets1After = await stakingVault.convertToAssets(shares1Before);
      const assets2After = await stakingVault.convertToAssets(shares2Before);
      
      // User1 should get 1/3 of rewards (100 wYLDS)
      // User2 should get 2/3 of rewards (200 wYLDS)
      // Allow for small rounding errors
      expect(assets1After).to.be.closeTo(stake1 + ethers.parseUnits("100", 6), 1);
      expect(assets2After).to.be.closeTo(stake2 + ethers.parseUnits("200", 6), 1);
    });

    it("Should only allow rewards admin to distribute", async function () {
      const { stakingVault, user1 } = await loadFixture(deployStakingVaultFixture);
      
      const rewardAmount = ethers.parseUnits("100", 6);
      
      await expect(
        stakingVault.connect(user1).distributeRewards(rewardAmount)
      ).to.be.reverted;
    });
  });

  // ============ Freeze Functionality Tests ============

  describe("Freeze Functionality", function () {
    it("Should freeze account", async function () {
      const { stakingVault, freezeAdmin, user1 } = await loadFixture(deployStakingVaultFixture);
      
      await expect(stakingVault.connect(freezeAdmin).freezeAccount(user1.address))
        .to.emit(stakingVault, "AccountFrozen")
        .withArgs(user1.address);
      
      expect(await stakingVault.frozen(user1.address)).to.be.true;
    });

    it("Should prevent transfers from frozen account", async function () {
      const { stakingVault, freezeAdmin, user1, user2 } = 
        await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      await stakingVault.connect(freezeAdmin).freezeAccount(user1.address);
      
      await expect(
        stakingVault.connect(user1).transfer(user2.address, stakeAmount)
      ).to.be.revertedWithCustomError(stakingVault, "AccountIsFrozen");
    });

    it("Should thaw account", async function () {
      const { stakingVault, freezeAdmin, user1 } = await loadFixture(deployStakingVaultFixture);
      
      await stakingVault.connect(freezeAdmin).freezeAccount(user1.address);
      
      await expect(stakingVault.connect(freezeAdmin).thawAccount(user1.address))
        .to.emit(stakingVault, "AccountThawed")
        .withArgs(user1.address);
      
      expect(await stakingVault.frozen(user1.address)).to.be.false;
    });

    it("Should only allow freeze admin to freeze", async function () {
      const { stakingVault, user1, user2 } = await loadFixture(deployStakingVaultFixture);
      
      await expect(
        stakingVault.connect(user1).freezeAccount(user2.address)
      ).to.be.reverted;
    });
  });

  // ============ ERC-4626 Compliance Tests ============

  describe("ERC-4626 Compliance", function () {
    it("Should correctly convert assets to shares initially", async function () {
      const { stakingVault } = await loadFixture(deployStakingVaultFixture);
      
      const assets = ethers.parseUnits("1000", 6);
      const shares = await stakingVault.convertToShares(assets);
      
      expect(shares).to.equal(assets); // 1:1 initially
    });

    it("Should correctly convert shares to assets initially", async function () {
      const { stakingVault } = await loadFixture(deployStakingVaultFixture);
      
      const shares = ethers.parseUnits("1000", 6);
      const assets = await stakingVault.convertToAssets(shares);
      
      expect(assets).to.equal(shares); // 1:1 initially
    });

    it("Should update conversion after rewards", async function () {
      const { stakingVault, rewardsAdmin, user1 } = 
        await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      const shares = await stakingVault.balanceOf(user1.address);
      
      // Before rewards: 1:1
      let assets = await stakingVault.convertToAssets(shares);
      expect(assets).to.equal(shares);
      
      // Add rewards
      const rewardAmount = ethers.parseUnits("100", 6);
      await stakingVault.connect(rewardsAdmin).distributeRewards(rewardAmount);
      
      // After rewards: shares worth more
      assets = await stakingVault.convertToAssets(shares);
      // Allow for small rounding errors
      expect(assets).to.be.closeTo(shares + rewardAmount, 1);
    });

    it("Should preview deposit correctly", async function () {
      const { stakingVault } = await loadFixture(deployStakingVaultFixture);
      
      const assets = ethers.parseUnits("1000", 6);
      const shares = await stakingVault.previewDeposit(assets);
      
      expect(shares).to.equal(assets);
    });

    it("Should return correct total assets", async function () {
      const { stakingVault, user1 } = await loadFixture(deployStakingVaultFixture);
      
      const stakeAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      expect(await stakingVault.totalAssets()).to.equal(stakeAmount);
    });
  });

  // ============ Integration Tests ============

  describe("Integration", function () {
    it("Should handle complete staking lifecycle (Deposit -> Reward -> Redeem)", async function () {
      const { stakingVault, yieldVault, rewardsAdmin, user1 } = 
        await loadFixture(deployStakingVaultFixture);
      
      // 1. Stake
      const stakeAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(stakeAmount, user1.address);
      
      // 2. Receive rewards
      const rewardAmount = ethers.parseUnits("100", 6);
      await stakingVault.connect(rewardsAdmin).distributeRewards(rewardAmount);
      
      // 3. Redeem (Instant Exit)
      const primeBalance = await stakingVault.balanceOf(user1.address);
      
      const wyldsBalanceBefore = await yieldVault.balanceOf(user1.address);
      await stakingVault.connect(user1).redeem(primeBalance, user1.address, user1.address);
      const wyldsBalanceAfter = await yieldVault.balanceOf(user1.address);
      
      // Should receive original stake + rewards
      // Allow for small rounding errors
      expect(wyldsBalanceAfter - wyldsBalanceBefore).to.be.closeTo(stakeAmount + rewardAmount, 1);
    });
  });

  // ============ Redeem vs Withdraw Tests ============

  describe("Admin Functions", function () {
    it("Should unpause after pausing", async function () {
      const { stakingVault, owner, user1 } = 
        await loadFixture(deployStakingVaultFixture);
      
      const PAUSER_ROLE = await stakingVault.PAUSER_ROLE();
      await stakingVault.grantRole(PAUSER_ROLE, owner.address);
      
      await stakingVault.pause();
      expect(await stakingVault.paused()).to.be.true;
      
      await stakingVault.unpause();
      expect(await stakingVault.paused()).to.be.false;
      
      const depositAmount = ethers.parseUnits("100", 6);
      await stakingVault.connect(user1).deposit(depositAmount, user1.address);
    });

    it("Should set new yield vault address", async function () {
      const { stakingVault, owner, yieldVault } = 
        await loadFixture(deployStakingVaultFixture);
      
      const MockUSDC = await ethers.getContractFactory("MockUSDC");
      const newUsdc = await MockUSDC.deploy();
      await newUsdc.waitForDeployment();
      
      const YieldVault = await ethers.getContractFactory("YieldVault");
      const newYieldVault = await upgrades.deployProxy(YieldVault, [
        await newUsdc.getAddress(),
        "New wYLDS",
        "nwYLDS",
        owner.address,
        owner.address,
        ethers.ZeroAddress
      ], { kind: 'uups' });
      await newYieldVault.waitForDeployment();
      
      const oldVaultAddress = await stakingVault.yieldVault();
      await expect(stakingVault.setYieldVault(await newYieldVault.getAddress()))
        .to.emit(stakingVault, "YieldVaultUpdated")
        .withArgs(oldVaultAddress, await newYieldVault.getAddress());
      
      expect(await stakingVault.yieldVault()).to.equal(await newYieldVault.getAddress());
    });

    it("Should revert setYieldVault with zero address", async function () {
      const { stakingVault } = 
        await loadFixture(deployStakingVaultFixture);
      
      await expect(stakingVault.setYieldVault(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(stakingVault, "InvalidAddress");
    });

    it("Should only allow admin to set yield vault", async function () {
      const { stakingVault, user1 } = 
        await loadFixture(deployStakingVaultFixture);
      
      await expect(stakingVault.connect(user1).setYieldVault(user1.address))
        .to.be.reverted;
    });
  });

  describe("Mint Function", function () {
    it("Should mint exact shares and transfer corresponding assets", async function () {
      const { stakingVault, yieldVault, user1 } = 
        await loadFixture(deployStakingVaultFixture);
      
      const sharesToMint = ethers.parseUnits("100", 6);
      const assetsNeeded = await stakingVault.previewMint(sharesToMint);
      
      await stakingVault.connect(user1).mint(sharesToMint, user1.address);
      
      expect(await stakingVault.balanceOf(user1.address)).to.equal(sharesToMint);
    });

    it("Should not allow mint when paused", async function () {
      const { stakingVault, owner, user1 } = 
        await loadFixture(deployStakingVaultFixture);
      
      const PAUSER_ROLE = await stakingVault.PAUSER_ROLE();
      await stakingVault.grantRole(PAUSER_ROLE, owner.address);
      await stakingVault.pause();
      
      await expect(
        stakingVault.connect(user1).mint(ethers.parseUnits("100", 6), user1.address)
      ).to.be.revertedWithCustomError(stakingVault, "EnforcedPause");
    });
  });

  describe("Deposit With Permit", function () {
    it("Should deposit using permit signature", async function () {
      const { stakingVault, yieldVault, user1 } = 
        await loadFixture(deployStakingVaultFixture);
      
      const depositAmount = ethers.parseUnits("100", 6);
      const deadline = ethers.MaxUint256;
      
      const domain = {
        name: await yieldVault.name(),
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await yieldVault.getAddress()
      };
      
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      };
      
      const nonce = await yieldVault.nonces(user1.address);
      
      const value = {
        owner: user1.address,
        spender: await stakingVault.getAddress(),
        value: depositAmount,
        nonce: nonce,
        deadline: deadline
      };
      
      const signature = await user1.signTypedData(domain, types, value);
      const sig = ethers.Signature.from(signature);
      
      const balanceBefore = await stakingVault.balanceOf(user1.address);
      await stakingVault.connect(user1).depositWithPermit(
        depositAmount,
        user1.address,
        deadline,
        sig.v,
        sig.r,
        sig.s
      );
      const balanceAfter = await stakingVault.balanceOf(user1.address);
      
      expect(balanceAfter - balanceBefore).to.equal(depositAmount);
    });
  });

  describe("View Functions", function () {
    it("Should return correct decimals", async function () {
      const { stakingVault, yieldVault } = 
        await loadFixture(deployStakingVaultFixture);
      
      const vaultDecimals = await stakingVault.decimals();
      const assetDecimals = await yieldVault.decimals();
      
      expect(vaultDecimals).to.equal(assetDecimals);
      expect(vaultDecimals).to.equal(6);
    });
  });

  describe("Redeem vs Withdraw", function () {
    it("Should redeem exact shares (use case: 'Withdraw All' button)", async function () {
      const { stakingVault, yieldVault, user1 } = 
        await loadFixture(deployStakingVaultFixture);
      
      const depositAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(depositAmount, user1.address);
      
      const primeBalance = await stakingVault.balanceOf(user1.address);
      expect(primeBalance).to.be.gt(0);
      
      const wyldsBalanceBefore = await yieldVault.balanceOf(user1.address);
      await stakingVault.connect(user1).redeem(primeBalance, user1.address, user1.address);
      const wyldsBalanceAfter = await yieldVault.balanceOf(user1.address);
      
      expect(await stakingVault.balanceOf(user1.address)).to.equal(0);
      expect(wyldsBalanceAfter - wyldsBalanceBefore).to.be.closeTo(depositAmount, 1);
    });

    it("Should redeem partial shares (use case: 'Unstake 100 PRIME tokens')", async function () {
      const { stakingVault, yieldVault, user1 } = 
        await loadFixture(deployStakingVaultFixture);
      
      const depositAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(depositAmount, user1.address);
      
      const redeemShares = ethers.parseUnits("100", 6);
      const primeBalanceBefore = await stakingVault.balanceOf(user1.address);
      
      const wyldsBalanceBefore = await yieldVault.balanceOf(user1.address);
      await stakingVault.connect(user1).redeem(redeemShares, user1.address, user1.address);
      const wyldsBalanceAfter = await yieldVault.balanceOf(user1.address);
      const primeBalanceAfter = await stakingVault.balanceOf(user1.address);
      
      expect(primeBalanceBefore - primeBalanceAfter).to.equal(redeemShares);
      expect(wyldsBalanceAfter - wyldsBalanceBefore).to.be.closeTo(ethers.parseUnits("100", 6), 1);
    });

    it("Should withdraw exact assets (use case: 'I want exactly 500 wYLDS back')", async function () {
      const { stakingVault, yieldVault, user1 } = 
        await loadFixture(deployStakingVaultFixture);
      
      const depositAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(depositAmount, user1.address);
      
      const withdrawAssets = ethers.parseUnits("500", 6);
      const wyldsBalanceBefore = await yieldVault.balanceOf(user1.address);
      
      await stakingVault.connect(user1).withdraw(withdrawAssets, user1.address, user1.address);
      
      const wyldsBalanceAfter = await yieldVault.balanceOf(user1.address);
      
      expect(wyldsBalanceAfter - wyldsBalanceBefore).to.equal(withdrawAssets);
    });

    it("Should withdraw all assets using asset amount (alternative to redeem)", async function () {
      const { stakingVault, yieldVault, user1 } = 
        await loadFixture(deployStakingVaultFixture);
      
      const depositAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(depositAmount, user1.address);
      
      const maxAssets = await stakingVault.maxWithdraw(user1.address);
      
      const wyldsBalanceBefore = await yieldVault.balanceOf(user1.address);
      await stakingVault.connect(user1).withdraw(maxAssets, user1.address, user1.address);
      const wyldsBalanceAfter = await yieldVault.balanceOf(user1.address);
      
      expect(await stakingVault.balanceOf(user1.address)).to.equal(0);
      expect(wyldsBalanceAfter - wyldsBalanceBefore).to.be.closeTo(depositAmount, 1);
    });

    it("Should handle withdraw and redeem with different share/asset ratios after rewards", async function () {
      const { stakingVault, yieldVault, rewardsAdmin, user1 } = 
        await loadFixture(deployStakingVaultFixture);
      
      const depositAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(depositAmount, user1.address);
      
      const rewardAmount = ethers.parseUnits("500", 6);
      await stakingVault.connect(rewardsAdmin).distributeRewards(rewardAmount);
      
      const totalAssets = await stakingVault.totalAssets();
      const totalShares = await stakingVault.totalSupply();
      expect(totalAssets).to.be.gt(totalShares);
      
      const redeemShares = ethers.parseUnits("100", 6);
      const previewAssets = await stakingVault.previewRedeem(redeemShares);
      
      const wyldsBalanceBefore = await yieldVault.balanceOf(user1.address);
      await stakingVault.connect(user1).redeem(redeemShares, user1.address, user1.address);
      const wyldsBalanceAfter = await yieldVault.balanceOf(user1.address);
      
      expect(wyldsBalanceAfter - wyldsBalanceBefore).to.be.closeTo(previewAssets, 1);
      expect(previewAssets).to.be.gt(redeemShares);
    });

    it("Should enforce pause on both redeem and withdraw", async function () {
      const { stakingVault, owner, user1 } = 
        await loadFixture(deployStakingVaultFixture);
      
      const depositAmount = ethers.parseUnits("1000", 6);
      await stakingVault.connect(user1).deposit(depositAmount, user1.address);
      
      const PAUSER_ROLE = await stakingVault.PAUSER_ROLE();
      await stakingVault.grantRole(PAUSER_ROLE, owner.address);
      await stakingVault.pause();
      
      await expect(
        stakingVault.connect(user1).redeem(ethers.parseUnits("100", 6), user1.address, user1.address)
      ).to.be.revertedWithCustomError(stakingVault, "EnforcedPause");
      
      await expect(
        stakingVault.connect(user1).withdraw(ethers.parseUnits("100", 6), user1.address, user1.address)
      ).to.be.revertedWithCustomError(stakingVault, "EnforcedPause");
    });
  });

  // ============ Error Condition Coverage Tests ============
  describe("Error Condition Coverage", function () {
    it("Should revert initialize with zero admin address", async function () {
      const [, user1] = await ethers.getSigners();
      
      const MockUSDC = await ethers.getContractFactory("MockUSDC");
      const usdc = await MockUSDC.deploy();
      
      const YieldVault = await ethers.getContractFactory("YieldVault");
      const yieldVault = await upgrades.deployProxy(YieldVault, [
        await usdc.getAddress(),
        "wYLDS",
        "wYLDS",
        user1.address,
        user1.address,
        ethers.ZeroAddress
      ], { kind: 'uups' });
      
      const StakingVault = await ethers.getContractFactory("StakingVault");
      
      await expect(
        upgrades.deployProxy(StakingVault, [
          await yieldVault.getAddress(),
          "PRIME",
          "PRIME",
          ethers.ZeroAddress, // Invalid admin
          await yieldVault.getAddress()
        ], { kind: 'uups' })
      ).to.be.revertedWithCustomError(StakingVault, "InvalidAddress");
    });

    it("Should revert initialize with zero yieldVault address", async function () {
      const [owner, user1] = await ethers.getSigners();
      
      const MockUSDC = await ethers.getContractFactory("MockUSDC");
      const usdc = await MockUSDC.deploy();
      
      const YieldVault = await ethers.getContractFactory("YieldVault");
      const yieldVault = await upgrades.deployProxy(YieldVault, [
        await usdc.getAddress(),
        "wYLDS",
        "wYLDS",
        user1.address,
        user1.address,
        ethers.ZeroAddress
      ], { kind: 'uups' });
      
      const StakingVault = await ethers.getContractFactory("StakingVault");
      
      await expect(
        upgrades.deployProxy(StakingVault, [
          await yieldVault.getAddress(),
          "PRIME",
          "PRIME",
          owner.address,
          ethers.ZeroAddress // Invalid yieldVault
        ], { kind: 'uups' })
      ).to.be.revertedWithCustomError(StakingVault, "InvalidAddress");
    });

    it("Should revert distributeRewards with zero amount", async function () {
      const { stakingVault, rewardsAdmin } = await loadFixture(deployStakingVaultFixture);
      
      await expect(
        stakingVault.connect(rewardsAdmin).distributeRewards(0)
      ).to.be.revertedWithCustomError(stakingVault, "InvalidAmount");
    });

    it("Should revert freezeAccount if already frozen", async function () {
      const { stakingVault, freezeAdmin, user1 } = await loadFixture(deployStakingVaultFixture);
      
      // Freeze once
      await stakingVault.connect(freezeAdmin).freezeAccount(user1.address);
      
      // Try to freeze again
      await expect(
        stakingVault.connect(freezeAdmin).freezeAccount(user1.address)
      ).to.be.revertedWithCustomError(stakingVault, "AccountIsFrozen");
    });

    it("Should revert thawAccount if not frozen", async function () {
      const { stakingVault, freezeAdmin, user1 } = await loadFixture(deployStakingVaultFixture);
      
      // Try to thaw account that was never frozen
      await expect(
        stakingVault.connect(freezeAdmin).thawAccount(user1.address)
      ).to.be.revertedWithCustomError(stakingVault, "AccountNotFrozen");
    });

    it("Should revert transfer to frozen account", async function () {
      const { stakingVault, freezeAdmin, user1, user2, yieldVault } = await loadFixture(deployStakingVaultFixture);
      
      // Deposit to get PRIME tokens
      const depositAmount = ethers.parseUnits("1000", 6);
      await yieldVault.connect(user1).deposit(depositAmount, user1.address);
      await stakingVault.connect(user1).deposit(depositAmount, user1.address);
      
      // Freeze user2
      await stakingVault.connect(freezeAdmin).freezeAccount(user2.address);
      
      // Try to transfer to frozen account
      await expect(
        stakingVault.connect(user1).transfer(user2.address, ethers.parseUnits("100", 6))
      ).to.be.revertedWithCustomError(stakingVault, "AccountIsFrozen");
    });
  });
});