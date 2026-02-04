import {expect} from "chai";
import { ethers, upgrades } from "hardhat";
import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import { MerkleTree } from "merkletreejs";

describe("YieldVault", function () {
  // ============ Fixtures ============
  
  async function deployYieldVaultFixture() {
    const [owner, redeemVault, freezeAdmin, rewardsAdmin, whitelistAdmin, withdrawalAdmin, user1, user2] = 
      await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
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
    ], { kind: 'uups' });
    await yieldVault.waitForDeployment();

    // Setup roles
    const FREEZE_ADMIN_ROLE = await yieldVault.FREEZE_ADMIN_ROLE();
    const REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
    const WHITELIST_ADMIN_ROLE = await yieldVault.WHITELIST_ADMIN_ROLE();
    const WITHDRAWAL_ADMIN_ROLE = await yieldVault.WITHDRAWAL_ADMIN_ROLE();
    const PAUSER_ROLE = await yieldVault.PAUSER_ROLE();

    await yieldVault.grantRole(FREEZE_ADMIN_ROLE, freezeAdmin.address);
    await yieldVault.grantRole(REWARDS_ADMIN_ROLE, rewardsAdmin.address);
    await yieldVault.grantRole(WHITELIST_ADMIN_ROLE, whitelistAdmin.address);
    await yieldVault.grantRole(WITHDRAWAL_ADMIN_ROLE, withdrawalAdmin.address);
    await yieldVault.grantRole(PAUSER_ROLE, owner.address);

    // Mint USDC to users
    const startAmount = ethers.parseUnits("10000", 6);
    await usdc.mint(user1.address, startAmount);
    await usdc.mint(user2.address, startAmount);
    await usdc.mint(rewardsAdmin.address, startAmount); // For redemption
    await usdc.mint(redeemVault.address, startAmount); // For redeemVault funding

    // Approve YieldVault
    await usdc.connect(user1).approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await usdc.connect(user2).approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await usdc.connect(rewardsAdmin).approve(await yieldVault.getAddress(), ethers.MaxUint256);
    await usdc.connect(redeemVault).approve(await yieldVault.getAddress(), ethers.MaxUint256);

    return { 
      yieldVault, 
      vault: yieldVault, // Alias for tests using 'vault'
      usdc, 
      owner, 
      redeemVault, 
      freezeAdmin, 
      rewardsAdmin, 
      whitelistAdmin,
      withdrawalAdmin,
      user1, 
      user2 
    };
  }

  // ============ Deployment Tests ============

  describe("Deployment", function () {
    it("Should set the correct asset", async function () {
      const { vault, usdc } = await loadFixture(deployYieldVaultFixture);
      expect(await vault.asset()).to.equal(await usdc.getAddress());
    });

    it("Should set the correct name and symbol", async function () {
      const { vault } = await loadFixture(deployYieldVaultFixture);
      expect(await vault.name()).to.equal("Wrapped YLDS");
      expect(await vault.symbol()).to.equal("wYLDS");
    });

    it("Should set the correct redeem vault", async function () {
      const { vault, redeemVault } = await loadFixture(deployYieldVaultFixture);
      expect(await vault.redeemVault()).to.equal(redeemVault.address);
    });

    it("Should support setting initial whitelist in constructor", async function () {
      const [owner, redeemVault, user1] = await ethers.getSigners();
      const MockUSDC = await ethers.getContractFactory("MockUSDC");
      const usdc = await MockUSDC.deploy();
      
      const YieldVault = await ethers.getContractFactory("YieldVault");
      const vault = await upgrades.deployProxy(YieldVault, [
        await usdc.getAddress(),
        "Wrapped YLDS",
        "wYLDS",
        owner.address,
        redeemVault.address,
        user1.address // Pass user1 as initial whitelist
      ], { kind: 'uups' });
      
      expect(await vault.isWhitelisted(user1.address)).to.be.true;
      expect(await vault.getWhitelistCount()).to.equal(1);
    });

    it("Should grant admin role", async function () {
      const { vault, owner } = await loadFixture(deployYieldVaultFixture);
      const DEFAULT_ADMIN_ROLE = await vault.DEFAULT_ADMIN_ROLE();
      expect(await vault.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
    });
  });

  // ============ Deposit Tests ============

  describe("Deposits", function () {
    it("Should allow deposits and mint shares 1:1", async function () {
      const { vault, usdc, user1 } = await loadFixture(deployYieldVaultFixture);
      
      const depositAmount = ethers.parseUnits("1000", 6); // 1000 USDC
      
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      expect(await vault.balanceOf(user1.address)).to.equal(depositAmount);
      expect(await usdc.balanceOf(await vault.getAddress())).to.equal(depositAmount);
    });

    it("Should handle multiple deposits correctly", async function () {
      const { vault, user1 } = await loadFixture(deployYieldVaultFixture);
      
      const deposit1 = ethers.parseUnits("1000", 6);
      const deposit2 = ethers.parseUnits("500", 6);
      
      await vault.connect(user1).deposit(deposit1, user1.address);
      await vault.connect(user1).deposit(deposit2, user1.address);
      
      expect(await vault.balanceOf(user1.address)).to.equal(deposit1 + deposit2);
    });

    it("Should not allow deposits when paused", async function () {
      const { vault, owner, user1 } = await loadFixture(deployYieldVaultFixture);
      
      const PAUSER_ROLE = await vault.PAUSER_ROLE();
      await vault.grantRole(PAUSER_ROLE, owner.address);
      await vault.pause();
      
      const depositAmount = ethers.parseUnits("1000", 6);
      
      await expect(
        vault.connect(user1).deposit(depositAmount, user1.address)
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("Should emit Deposit event", async function () {
      const { vault, user1 } = await loadFixture(deployYieldVaultFixture);
      
      const depositAmount = ethers.parseUnits("1000", 6);
      
      await expect(vault.connect(user1).deposit(depositAmount, user1.address))
        .to.emit(vault, "Deposit")
        .withArgs(user1.address, user1.address, depositAmount, depositAmount);
    });
  });

  // ============ Deposit With Permit Tests ============

  describe("Deposit With Permit", function () {
    async function signPermit(
      token: any,
      owner: any,
      spender: string,
      value: bigint,
      deadline: number
    ) {
      const nonce = await token.nonces(owner.address);
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const name = await token.name();
      
      const domain = {
        name: name,
        version: "1",
        chainId: chainId,
        verifyingContract: await token.getAddress()
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
      
      const message = {
        owner: owner.address,
        spender: spender,
        value: value,
        nonce: nonce,
        deadline: deadline
      };
      
      const signature = await owner.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);
      return { v, r, s };
    }

    it("Should allow deposit with valid permit", async function () {
      const { vault, usdc, user1 } = await loadFixture(deployYieldVaultFixture);
      const amount = ethers.parseUnits("1000", 6);
      const deadline = (await time.latest()) + 3600;
      
      // Ensure user has tokens but NO allowance
      await usdc.connect(user1).approve(await vault.getAddress(), 0);
      
      const { v, r, s } = await signPermit(
        usdc,
        user1,
        await vault.getAddress(),
        amount,
        deadline
      );
      
      await vault.connect(user1).depositWithPermit(
        amount,
        user1.address,
        deadline,
        v,
        r,
        s
      );
      
      expect(await vault.balanceOf(user1.address)).to.equal(amount);
    });

    it("Should revert when paused", async function () {
      const { vault, usdc, owner, user1 } = await loadFixture(deployYieldVaultFixture);
      const amount = ethers.parseUnits("1000", 6);
      const deadline = (await time.latest()) + 3600;
      
      const PAUSER_ROLE = await vault.PAUSER_ROLE();
      await vault.grantRole(PAUSER_ROLE, owner.address);
      await vault.pause();
      
      const { v, r, s } = await signPermit(
        usdc,
        user1,
        await vault.getAddress(),
        amount,
        deadline
      );
      
      await expect(
        vault.connect(user1).depositWithPermit(amount, user1.address, deadline, v, r, s)
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("Should revert when sender is frozen", async function () {
      const { vault, usdc, freezeAdmin, user1 } = await loadFixture(deployYieldVaultFixture);
      const amount = ethers.parseUnits("1000", 6);
      const deadline = (await time.latest()) + 3600;
      
      await vault.connect(freezeAdmin).freezeAccount(user1.address);
      
      const { v, r, s } = await signPermit(
        usdc,
        user1,
        await vault.getAddress(),
        amount,
        deadline
      );
      
      // ERC20Permit throws "ERC20InsufficientAllowance" if permit fails? No, permit itself reverts.
      // But freeze check happens in _update, which is called during transferFrom (inside deposit).
      // Wait, freeze logic is in YieldVault._update. Does deposit call that?
      // Yes, minting shares calls _update(0, user1, shares).
      // So if user1 is frozen, minting shares to them should fail.
      
      // However, permit might succeed (on USDC), but deposit (transferFrom USDC) might succeed,
      // but _mint shares (YieldVault) will fail.
      
      await expect(
        vault.connect(user1).depositWithPermit(amount, user1.address, deadline, v, r, s)
      ).to.be.revertedWithCustomError(vault, "AccountIsFrozen");
    });

    it("Should revert with invalid signature", async function () {
      const { vault, usdc, user1, user2 } = await loadFixture(deployYieldVaultFixture);
      const amount = ethers.parseUnits("1000", 6);
      const deadline = (await time.latest()) + 3600;
      
      // User1 signs, but User2 tries to use it? No, signature includes owner.
      // If we pass wrong signer to permit?
      // ERC20Permit.permit(owner, spender, value, deadline, v, r, s)
      // The contract calls: IERC20Permit(asset()).permit(msg.sender, address(this), ...)
      // So it enforces owner = msg.sender.
      
      // So if I sign with user2, but call with user1, the recovered address will be user2, 
      // but permit expects msg.sender (user1).
      
      const { v, r, s } = await signPermit(
        usdc,
        user2, // Signed by user2
        await vault.getAddress(),
        amount,
        deadline
      );
      
      await expect(
        vault.connect(user1).depositWithPermit(amount, user1.address, deadline, v, r, s)
      ).to.be.revertedWithCustomError(usdc, "ERC2612InvalidSigner");
    });

    it("Should revert with expired deadline", async function () {
      const { vault, usdc, user1 } = await loadFixture(deployYieldVaultFixture);
      const amount = ethers.parseUnits("1000", 6);
      const deadline = (await time.latest()) - 3600; // Expired
      
      const { v, r, s } = await signPermit(
        usdc,
        user1,
        await vault.getAddress(),
        amount,
        deadline
      );
      
      await expect(
        vault.connect(user1).depositWithPermit(amount, user1.address, deadline, v, r, s)
      ).to.be.revertedWithCustomError(usdc, "ERC2612ExpiredSignature");
    });
  });

  // ============ Two-Step Redemption Tests ============

  describe("Two-Step Redemption", function () {
    it("Should allow requesting redemption", async function () {
      const { vault, user1 } = await loadFixture(deployYieldVaultFixture);
      
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      const redeemAmount = ethers.parseUnits("500", 6);
      
      await expect(vault.connect(user1).requestRedeem(redeemAmount))
        .to.emit(vault, "RedemptionRequested")
        .withArgs(user1.address, redeemAmount, redeemAmount, await time.latest() + 1);
      
      const pending = await vault.pendingRedemptions(user1.address);
      expect(pending.shares).to.equal(redeemAmount);
      expect(pending.assets).to.equal(redeemAmount);
    });

    it("Should lock shares when requesting redemption", async function () {
      const { vault, user1 } = await loadFixture(deployYieldVaultFixture);
      
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      const redeemAmount = ethers.parseUnits("500", 6);
      await vault.connect(user1).requestRedeem(redeemAmount);
      
      // Shares should be transferred to vault
      expect(await vault.balanceOf(user1.address)).to.equal(depositAmount - redeemAmount);
      expect(await vault.balanceOf(await vault.getAddress())).to.equal(redeemAmount);
    });

    it("Should not allow multiple pending redemptions", async function () {
      const { vault, user1 } = await loadFixture(deployYieldVaultFixture);
      
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      const redeemAmount = ethers.parseUnits("500", 6);
      await vault.connect(user1).requestRedeem(redeemAmount);
      
      await expect(
        vault.connect(user1).requestRedeem(redeemAmount)
      ).to.be.revertedWithCustomError(vault, "RedemptionAlreadyPending");
    });

    it("Should complete redemption by rewards admin", async function () {
      const { vault, usdc, rewardsAdmin, user1 } = await loadFixture(deployYieldVaultFixture);
      
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      const redeemAmount = ethers.parseUnits("500", 6);
      await vault.connect(user1).requestRedeem(redeemAmount);
      
      const userBalanceBefore = await usdc.balanceOf(user1.address);
      
      await expect(vault.connect(rewardsAdmin).completeRedeem(user1.address))
        .to.emit(vault, "RedemptionCompleted");
      
      const userBalanceAfter = await usdc.balanceOf(user1.address);
      expect(userBalanceAfter - userBalanceBefore).to.equal(redeemAmount);
      
      // Pending redemption should be cleared
      const pending = await vault.pendingRedemptions(user1.address);
      expect(pending.shares).to.equal(0);
    });

    it("Should not allow completing non-existent redemption", async function () {
      const { vault, rewardsAdmin, user1 } = await loadFixture(deployYieldVaultFixture);
      
      await expect(
        vault.connect(rewardsAdmin).completeRedeem(user1.address)
      ).to.be.revertedWithCustomError(vault, "NoRedemptionPending");
    });

    it("Should allow cancelling redemption", async function () {
      const { vault, user1 } = await loadFixture(deployYieldVaultFixture);
      
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      const redeemAmount = ethers.parseUnits("500", 6);
      await vault.connect(user1).requestRedeem(redeemAmount);
      
      await expect(vault.connect(user1).cancelRedeem())
        .to.emit(vault, "RedemptionCancelled")
        .withArgs(user1.address, redeemAmount);
      
      // Shares should be returned
      expect(await vault.balanceOf(user1.address)).to.equal(depositAmount);
      
      // Pending redemption should be cleared
      const pending = await vault.pendingRedemptions(user1.address);
      expect(pending.shares).to.equal(0);
    });

    it("Should revert withdraw() function (disabled in favor of two-step)", async function () {
      const { vault, user1 } = await loadFixture(deployYieldVaultFixture);
      
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      await expect(
        vault.connect(user1).withdraw(ethers.parseUnits("100", 6), user1.address, user1.address)
      ).to.be.revertedWith("Use requestRedeem/completeRedeem");
    });

    it("Should revert redeem() function (disabled in favor of two-step)", async function () {
      const { vault, user1 } = await loadFixture(deployYieldVaultFixture);
      
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      await expect(
        vault.connect(user1).redeem(ethers.parseUnits("100", 6), user1.address, user1.address)
      ).to.be.revertedWith("Use requestRedeem/completeRedeem");
    });

    it("Should revert if redeem vault has insufficient balance", async function () {
      const { vault, usdc, redeemVault, rewardsAdmin, user1 } = await loadFixture(deployYieldVaultFixture);
      
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      const redeemAmount = ethers.parseUnits("500", 6);
      await vault.connect(user1).requestRedeem(redeemAmount);
      
      const redeemVaultBalance = await usdc.balanceOf(redeemVault.address);
      await usdc.connect(redeemVault).transfer(user1.address, redeemVaultBalance);
      
      await expect(
        vault.connect(rewardsAdmin).completeRedeem(user1.address)
      ).to.be.revertedWithCustomError(vault, "InsufficientVaultBalance");
    });
  });

  // ============ Merkle Rewards Tests ============

  describe("Merkle Rewards", function () {
    // Helper function to create merkle tree
    function createMerkleTree(rewards: { user: string; amount: bigint; epoch: number }[]) {
      const leaves = rewards.map((r) => {
        const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "uint256", "uint256"],
          [r.user, r.amount, r.epoch]
        );
        return ethers.keccak256(ethers.concat([ethers.keccak256(encoded)]));
      });
      return new MerkleTree(leaves, ethers.keccak256, { sortPairs: true });
    }

    it("Should create rewards epoch", async function () {
      const { vault, rewardsAdmin, user1 } = await loadFixture(deployYieldVaultFixture);
      
      const epochIndex = 0;
      const rewards = [
        { user: user1.address, amount: ethers.parseUnits("100", 6), epoch: epochIndex },
      ];
      const tree = createMerkleTree(rewards);
      const root = tree.getHexRoot();
      const totalRewards = ethers.parseUnits("100", 6);
      
      await expect(
        vault.connect(rewardsAdmin).createRewardsEpoch(epochIndex, root, totalRewards)
      ).to.emit(vault, "RewardsEpochCreated")
        .withArgs(epochIndex, root, totalRewards, await time.latest() + 1);
      
      const epoch = await vault.rewardsEpochs(epochIndex);
      expect(epoch.merkleRoot).to.equal(root);
      expect(epoch.totalRewards).to.equal(totalRewards);
    });

    it("Should allow claiming rewards with valid proof", async function () {
      const { vault, rewardsAdmin, user1 } = await loadFixture(deployYieldVaultFixture);

      const epochIndex = 0;
      const rewardAmount = ethers.parseUnits("100", 6);
      const rewards = [
        { user: user1.address, amount: rewardAmount, epoch: epochIndex },
      ];
      const tree = createMerkleTree(rewards);
      const root = tree.getHexRoot();

      await vault.connect(rewardsAdmin).createRewardsEpoch(epochIndex, root, rewardAmount);

      const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256"],
        [user1.address, rewardAmount, epochIndex]
      );
      const leaf = ethers.keccak256(ethers.concat([ethers.keccak256(encoded)]));
      const proof = tree.getHexProof(leaf);
      
      const balanceBefore = await vault.balanceOf(user1.address);
      
      await expect(vault.connect(user1).claimRewards(epochIndex, rewardAmount, proof))
        .to.emit(vault, "RewardsClaimed")
        .withArgs(user1.address, epochIndex, rewardAmount);
      
      const balanceAfter = await vault.balanceOf(user1.address);
      expect(balanceAfter - balanceBefore).to.equal(rewardAmount);
    });

    it("Should not allow double claiming", async function () {
      const { vault, rewardsAdmin, user1 } = await loadFixture(deployYieldVaultFixture);
      
      const epochIndex = 0;
      const rewardAmount = ethers.parseUnits("100", 6);
      const rewards = [
        { user: user1.address, amount: rewardAmount, epoch: epochIndex },
      ];
      const tree = createMerkleTree(rewards);
      const root = tree.getHexRoot();
      
      await vault.connect(rewardsAdmin).createRewardsEpoch(epochIndex, root, rewardAmount);

      const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256"],
        [user1.address, rewardAmount, epochIndex]
      );
      const leaf = ethers.keccak256(ethers.concat([ethers.keccak256(encoded)]));
      const proof = tree.getHexProof(leaf);

      await vault.connect(user1).claimRewards(epochIndex, rewardAmount, proof);
      
      await expect(
        vault.connect(user1).claimRewards(epochIndex, rewardAmount, proof)
      ).to.be.revertedWithCustomError(vault, "RewardsAlreadyClaimed");
    });

    it("Should reject invalid proof", async function () {
      const { vault, rewardsAdmin, user1, user2 } = await loadFixture(deployYieldVaultFixture);
      
      const epochIndex = 0;
      const rewardAmount = ethers.parseUnits("100", 6);
      const rewards = [
        { user: user1.address, amount: rewardAmount, epoch: epochIndex },
      ];
      const tree = createMerkleTree(rewards);
      const root = tree.getHexRoot();
      
      await vault.connect(rewardsAdmin).createRewardsEpoch(epochIndex, root, rewardAmount);

      // Try to claim with user2 using user1's proof
      const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256"],
        [user1.address, rewardAmount, epochIndex]
      );
      const leaf = ethers.keccak256(ethers.concat([ethers.keccak256(encoded)]));
      const proof = tree.getHexProof(leaf);
      
      await expect(
        vault.connect(user2).claimRewards(epochIndex, rewardAmount, proof)
      ).to.be.revertedWithCustomError(vault, "InvalidProof");
    });

    it("Should correctly report claimed status via hasClaimedRewards", async function () {
      const { vault, rewardsAdmin, user1, user2 } = await loadFixture(deployYieldVaultFixture);
      
      const epochIndex = 0;
      const rewardAmount = ethers.parseUnits("100", 6);
      const rewards = [
        { user: user1.address, amount: rewardAmount, epoch: epochIndex },
      ];
      const tree = createMerkleTree(rewards);
      const root = tree.getHexRoot();
      
      await vault.connect(rewardsAdmin).createRewardsEpoch(epochIndex, root, rewardAmount);

      expect(await vault.hasClaimedRewards(user1.address, epochIndex)).to.be.false;
      expect(await vault.hasClaimedRewards(user2.address, epochIndex)).to.be.false;

      const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256"],
        [user1.address, rewardAmount, epochIndex]
      );
      const leaf = ethers.keccak256(ethers.concat([ethers.keccak256(encoded)]));
      const proof = tree.getHexProof(leaf);

      await vault.connect(user1).claimRewards(epochIndex, rewardAmount, proof);
      
      expect(await vault.hasClaimedRewards(user1.address, epochIndex)).to.be.true;
      expect(await vault.hasClaimedRewards(user2.address, epochIndex)).to.be.false;
    });

    it("Should track claimed status across multiple epochs", async function () {
      const { vault, rewardsAdmin, user1 } = await loadFixture(deployYieldVaultFixture);
      
      const epochIndex0 = 0;
      const epochIndex1 = 1;
      const rewardAmount = ethers.parseUnits("100", 6);
      
      const rewards0 = [{ user: user1.address, amount: rewardAmount, epoch: epochIndex0 }];
      const tree0 = createMerkleTree(rewards0);
      await vault.connect(rewardsAdmin).createRewardsEpoch(epochIndex0, tree0.getHexRoot(), rewardAmount);
      
      const rewards1 = [{ user: user1.address, amount: rewardAmount, epoch: epochIndex1 }];
      const tree1 = createMerkleTree(rewards1);
      await vault.connect(rewardsAdmin).createRewardsEpoch(epochIndex1, tree1.getHexRoot(), rewardAmount);
      
      expect(await vault.hasClaimedRewards(user1.address, epochIndex0)).to.be.false;
      expect(await vault.hasClaimedRewards(user1.address, epochIndex1)).to.be.false;
      
      const encoded0 = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256"],
        [user1.address, rewardAmount, epochIndex0]
      );
      const leaf0 = ethers.keccak256(ethers.concat([ethers.keccak256(encoded0)]));
      const proof0 = tree0.getHexProof(leaf0);
      
      await vault.connect(user1).claimRewards(epochIndex0, rewardAmount, proof0);
      
      expect(await vault.hasClaimedRewards(user1.address, epochIndex0)).to.be.true;
      expect(await vault.hasClaimedRewards(user1.address, epochIndex1)).to.be.false;
    });
  });

  // ============ Freeze Functionality Tests ============

  describe("Freeze Functionality", function () {
    it("Should freeze account", async function () {
      const { vault, freezeAdmin, user1 } = await loadFixture(deployYieldVaultFixture);
      
      await expect(vault.connect(freezeAdmin).freezeAccount(user1.address))
        .to.emit(vault, "AccountFrozen")
        .withArgs(user1.address);
      
      expect(await vault.frozen(user1.address)).to.be.true;
    });

    it("Should prevent transfers from frozen account", async function () {
      const { vault, freezeAdmin, user1, user2 } = await loadFixture(deployYieldVaultFixture);

      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);

      await vault.connect(freezeAdmin).freezeAccount(user1.address);

      await expect(
        vault.connect(user1).transfer(user2.address, depositAmount)
      ).to.be.revertedWithCustomError(vault, "AccountIsFrozen");
    });

    it("Should prevent transfers to frozen account", async function () {
      const { vault, freezeAdmin, user1, user2 } = await loadFixture(deployYieldVaultFixture);
      
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      await vault.connect(freezeAdmin).freezeAccount(user2.address);
      
      await expect(
        vault.connect(user1).transfer(user2.address, depositAmount)
      ).to.be.revertedWithCustomError(vault, "AccountIsFrozen");
    });

    it("Should thaw account", async function () {
      const { vault, freezeAdmin, user1 } = await loadFixture(deployYieldVaultFixture);
      
      await vault.connect(freezeAdmin).freezeAccount(user1.address);
      
      await expect(vault.connect(freezeAdmin).thawAccount(user1.address))
        .to.emit(vault, "AccountThawed")
        .withArgs(user1.address);
      
      expect(await vault.frozen(user1.address)).to.be.false;
    });

    it("Should allow transfers after thawing", async function () {
      const { vault, freezeAdmin, user1, user2 } = await loadFixture(deployYieldVaultFixture);
      
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      await vault.connect(freezeAdmin).freezeAccount(user1.address);
      await vault.connect(freezeAdmin).thawAccount(user1.address);
      
      await expect(vault.connect(user1).transfer(user2.address, depositAmount))
        .to.not.be.reverted;
    });

    it("Should only allow freeze admin to freeze", async function () {
      const { vault, user1, user2 } = await loadFixture(deployYieldVaultFixture);
      
      await expect(
        vault.connect(user1).freezeAccount(user2.address)
      ).to.be.reverted;
    });
  });

  // ============ Access Control Tests ============

  describe("Access Control", function () {
    it("Should only allow admin to update redeem vault", async function () {
      const { vault, owner, user1, user2 } = await loadFixture(deployYieldVaultFixture);
      
      await expect(
        vault.connect(user1).setRedeemVault(user2.address)
      ).to.be.reverted;
      
      await expect(vault.connect(owner).setRedeemVault(user2.address))
        .to.emit(vault, "RedeemVaultUpdated");
    });

    it("Should only allow pauser to pause", async function () {
      const { vault, owner, user1 } = await loadFixture(deployYieldVaultFixture);
      
      const PAUSER_ROLE = await vault.PAUSER_ROLE();
      await vault.grantRole(PAUSER_ROLE, owner.address);
      
      await expect(vault.connect(user1).pause()).to.be.reverted;
      
      await expect(vault.connect(owner).pause()).to.not.be.reverted;
    });

    it("Should unpause after pausing", async function () {
      const { vault, owner, user1 } = await loadFixture(deployYieldVaultFixture);
      
      const PAUSER_ROLE = await vault.PAUSER_ROLE();
      await vault.grantRole(PAUSER_ROLE, owner.address);
      
      await vault.connect(owner).pause();
      expect(await vault.paused()).to.be.true;
      
      await vault.connect(owner).unpause();
      expect(await vault.paused()).to.be.false;
      
      const depositAmount = ethers.parseUnits("100", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      expect(await vault.balanceOf(user1.address)).to.equal(depositAmount);
    });

    it("Should only allow pauser to unpause", async function () {
      const { vault, owner, user1 } = await loadFixture(deployYieldVaultFixture);
      
      const PAUSER_ROLE = await vault.PAUSER_ROLE();
      await vault.grantRole(PAUSER_ROLE, owner.address);
      
      await vault.connect(owner).pause();
      
      await expect(vault.connect(user1).unpause()).to.be.reverted;
      
      await expect(vault.connect(owner).unpause()).to.not.be.reverted;
    });
  });

  // ============ ERC-4626 Compliance Tests ============

  describe("ERC-4626 Compliance", function () {
    it("Should correctly convert assets to shares", async function () {
      const { vault } = await loadFixture(deployYieldVaultFixture);
      
      const assets = ethers.parseUnits("1000", 6);
      const shares = await vault.convertToShares(assets);
      
      expect(shares).to.equal(assets); // 1:1 initially
    });

    it("Should correctly convert shares to assets", async function () {
      const { vault } = await loadFixture(deployYieldVaultFixture);
      
      const shares = ethers.parseUnits("1000", 6);
      const assets = await vault.convertToAssets(shares);
      
      expect(assets).to.equal(shares); // 1:1 initially
    });

    it("Should preview deposit correctly", async function () {
      const { vault } = await loadFixture(deployYieldVaultFixture);
      
      const assets = ethers.parseUnits("1000", 6);
      const shares = await vault.previewDeposit(assets);
      
      expect(shares).to.equal(assets);
    });

    it("Should return correct total assets", async function () {
      const { vault, user1 } = await loadFixture(deployYieldVaultFixture);
      
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      expect(await vault.totalAssets()).to.equal(depositAmount);
    });
  });

  // ============ Edge Cases ============

  describe("Edge Cases", function () {
    it("Should handle zero deposits correctly", async function () {
      const { vault, user1 } = await loadFixture(deployYieldVaultFixture);

      // ERC4626 may or may not revert on zero - it's implementation dependent
      // OpenZeppelin's implementation doesn't explicitly prevent zero deposits
      const tx = await vault.connect(user1).deposit(0, user1.address);
      await tx.wait();
      expect(await vault.balanceOf(user1.address)).to.equal(0);
    });

    it("Should handle rounding correctly", async function () {
      const { vault, user1 } = await loadFixture(deployYieldVaultFixture);
      
      // Deposit 1 wei
      const smallDeposit = 1n;
      await vault.connect(user1).deposit(smallDeposit, user1.address);
      
      const shares = await vault.balanceOf(user1.address);
      expect(shares).to.be.greaterThan(0);
    });
  });

  // ============ Whitelist Functionality Tests ============

  describe("Whitelist Functionality", function () {
    it("Should add address to whitelist", async function () {
      const { vault, whitelistAdmin, user1 } = await loadFixture(deployYieldVaultFixture);
      
      await expect(vault.connect(whitelistAdmin).addToWhitelist(user1.address))
        .to.emit(vault, "AddressWhitelisted")
        .withArgs(user1.address);
        
      expect(await vault.isWhitelisted(user1.address)).to.be.true;
    });

    it("Should remove address from whitelist", async function () {
      const { vault, whitelistAdmin, user1, user2 } = await loadFixture(deployYieldVaultFixture);
      
      // Add two addresses so we can remove one without violating the "at least one" rule
      await vault.connect(whitelistAdmin).addToWhitelist(user1.address);
      await vault.connect(whitelistAdmin).addToWhitelist(user2.address);
      
      await expect(vault.connect(whitelistAdmin).removeFromWhitelist(user1.address))
        .to.emit(vault, "AddressRemovedFromWhitelist")
        .withArgs(user1.address);
        
      expect(await vault.isWhitelisted(user1.address)).to.be.false;
      expect(await vault.isWhitelisted(user2.address)).to.be.true;
    });

    it("Should prevent non-admin from modifying whitelist", async function () {
      const { vault, user1, user2 } = await loadFixture(deployYieldVaultFixture);
      
      await expect(
        vault.connect(user1).addToWhitelist(user2.address)
      ).to.be.reverted;
      
      await expect(
        vault.connect(user1).removeFromWhitelist(user2.address)
      ).to.be.reverted;
    });

    it("Should not allow duplicate whitelist entries", async function () {
      const { vault, whitelistAdmin, user1 } = await loadFixture(deployYieldVaultFixture);
      
      await vault.connect(whitelistAdmin).addToWhitelist(user1.address);
      
      await expect(
        vault.connect(whitelistAdmin).addToWhitelist(user1.address)
      ).to.be.revertedWithCustomError(vault, "AddressAlreadyWhitelisted");
    });
    
    it("Should correctly list whitelisted addresses", async function () {
      const { vault, whitelistAdmin, user1, user2 } = await loadFixture(deployYieldVaultFixture);
      
      await vault.connect(whitelistAdmin).addToWhitelist(user1.address);
      await vault.connect(whitelistAdmin).addToWhitelist(user2.address);
      
      const list = await vault.getWhitelistedAddresses();
      expect(list.length).to.equal(2);
      expect(list).to.include(user1.address);
      expect(list).to.include(user2.address);
    });

    it("Should prevent removing the last whitelisted address", async function () {
      const { vault, whitelistAdmin, user1 } = await loadFixture(deployYieldVaultFixture);
      
      // Add one address
      await vault.connect(whitelistAdmin).addToWhitelist(user1.address);
      
      // Try to remove it - should fail because it's the only one
      await expect(
        vault.connect(whitelistAdmin).removeFromWhitelist(user1.address)
      ).to.be.revertedWithCustomError(vault, "CannotRemoveLastWhitelistedAddress");
      
      // Add another address
      const [,,, ,, , , additionalUser] = await ethers.getSigners();
      await vault.connect(whitelistAdmin).addToWhitelist(additionalUser.address);
      
      // Now removing user1 should succeed
      await expect(vault.connect(whitelistAdmin).removeFromWhitelist(user1.address))
        .to.emit(vault, "AddressRemovedFromWhitelist")
        .withArgs(user1.address);
    });

    it("Should prevent adding address(0) to whitelist", async function () {
      const { vault, whitelistAdmin } = await loadFixture(deployYieldVaultFixture);
      
      await expect(
        vault.connect(whitelistAdmin).addToWhitelist(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vault, "InvalidAddress");
    });
  });

  // ============ USDC Withdrawal Tests ============

  describe("USDC Withdrawal", function () {
    it("Should allow withdrawal to whitelisted address", async function () {
      const { vault, usdc, withdrawalAdmin, whitelistAdmin, user1, user2 } = await loadFixture(deployYieldVaultFixture);
      
      // Deposit funds first
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      // Whitelist user2
      await vault.connect(whitelistAdmin).addToWhitelist(user2.address);
      
      const withdrawAmount = ethers.parseUnits("500", 6);
      const balanceBefore = await usdc.balanceOf(user2.address);
      
      await expect(vault.connect(withdrawalAdmin).withdrawUSDC(user2.address, withdrawAmount))
        .to.emit(vault, "USDCWithdrawn")
        .withArgs(user2.address, withdrawAmount, withdrawalAdmin.address);
        
      const balanceAfter = await usdc.balanceOf(user2.address);
      expect(balanceAfter - balanceBefore).to.equal(withdrawAmount);
    });

    it("Should prevent withdrawal to non-whitelisted address", async function () {
      const { vault, withdrawalAdmin, user1, user2 } = await loadFixture(deployYieldVaultFixture);
      
      // Deposit funds
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      const withdrawAmount = ethers.parseUnits("500", 6);
      
      await expect(
        vault.connect(withdrawalAdmin).withdrawUSDC(user2.address, withdrawAmount)
      ).to.be.revertedWithCustomError(vault, "AddressNotWhitelisted");
    });

    it("Should prevent non-admin from withdrawing", async function () {
      const { vault, whitelistAdmin, user1, user2 } = await loadFixture(deployYieldVaultFixture);
      
      // Deposit funds
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(user1).deposit(depositAmount, user1.address);
      
      // Whitelist user2
      await vault.connect(whitelistAdmin).addToWhitelist(user2.address);
      
      const withdrawAmount = ethers.parseUnits("500", 6);
      
      await expect(
        vault.connect(user1).withdrawUSDC(user2.address, withdrawAmount)
      ).to.be.reverted;
    });

    it("Should fail if vault has insufficient balance", async function () {
      const { vault, withdrawalAdmin, whitelistAdmin, user1 } = await loadFixture(deployYieldVaultFixture);
      
      await vault.connect(whitelistAdmin).addToWhitelist(user1.address);
      
      const withdrawAmount = ethers.parseUnits("1000", 6);
      
      await expect(
        vault.connect(withdrawalAdmin).withdrawUSDC(user1.address, withdrawAmount)
      ).to.be.revertedWithCustomError(vault, "InsufficientVaultBalance");
    });

    it("Should prevent withdrawal of 0 amount", async function () {
      const { vault, withdrawalAdmin, user1 } = await loadFixture(deployYieldVaultFixture);
      
      await expect(
        vault.connect(withdrawalAdmin).withdrawUSDC(user1.address, 0)
      ).to.be.revertedWithCustomError(vault, "InvalidAmount");
    });

    it("Should prevent withdrawal to address(0)", async function () {
      const { vault, withdrawalAdmin } = await loadFixture(deployYieldVaultFixture);
      
      const withdrawAmount = ethers.parseUnits("100", 6);
      
      await expect(
        vault.connect(withdrawalAdmin).withdrawUSDC(ethers.ZeroAddress, withdrawAmount)
      ).to.be.revertedWithCustomError(vault, "InvalidAddress");
    });
  });
});
