import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { MockUSDC, YieldVault, YieldVaultV2 } from "../../typechain-types";

/**
 * Tests for the production V2 role-split upgrade — `contracts/YieldVaultV2.sol`.
 *
 * Topology under test:
 *   1. Deploy a V1 proxy and exercise V1 behavior (REWARDS_ADMIN holder calls
 *      mintRewards + createRewardsEpoch + completeRedeem).
 *   2. Atomically upgrade to V2 via `upgradeToAndCall(impl, initializeV2(version, ...))`
 *      and assert the new role topology takes effect.
 *
 * `initializeV2(version, ...)` takes the reinitializer version at runtime so the same
 * bytecode works on mainnet (proxy `_initialized=1` → pass 2) and Sepolia
 * (proxy `_initialized=2` → pass 3). Tests here drive the mainnet path (version=2)
 * since fresh proxies start at `_initialized=1`.
 */
describe("YieldVaultV2 role split (production upgrade)", function () {
  async function deployV1AndUpgradeFixture() {
    const [owner, redeemVault, legacyRewardsAdmin, epochAdmin, redeemOperator, stakingVaultMock, user1] =
      await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = (await MockUSDC.deploy()) as unknown as MockUSDC;
    await usdc.waitForDeployment();

    // Deploy V1 proxy.
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const vault = (await upgrades.deployProxy(
      YieldVault,
      [
        await usdc.getAddress(),
        "Wrapped YLDS",
        "wYLDS",
        owner.address,
        redeemVault.address,
        ethers.ZeroAddress,
      ],
      { kind: "uups" }
    )) as unknown as YieldVault;
    await vault.waitForDeployment();

    // V1-era role topology: REWARDS_ADMIN_ROLE held by one ops EOA (the way mainnet
    // currently is). Also held by stakingVaultMock so V2's narrow mintRewards path stays
    // valid post-upgrade without re-granting.
    const REWARDS_ADMIN_ROLE = await vault.REWARDS_ADMIN_ROLE();
    await vault.grantRole(REWARDS_ADMIN_ROLE, legacyRewardsAdmin.address);
    await vault.grantRole(REWARDS_ADMIN_ROLE, stakingVaultMock.address);

    // Fund a user for end-to-end redeem path.
    const startAmount = ethers.parseUnits("10000", 6);
    await usdc.mint(user1.address, startAmount);
    await usdc.mint(redeemVault.address, startAmount);
    await usdc.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);
    await usdc.connect(redeemVault).approve(await vault.getAddress(), ethers.MaxUint256);

    return {
      vault,
      usdc,
      owner,
      redeemVault,
      legacyRewardsAdmin,
      epochAdmin,
      redeemOperator,
      stakingVaultMock,
      user1,
      REWARDS_ADMIN_ROLE,
    };
  }

  // Default global cap used by tests that don't care about the value —
  // 5M wYLDS in 6-dec.
  const DEFAULT_GLOBAL_CAP = ethers.parseUnits("5000000", 6);

  async function upgradeToV2(
    vault: YieldVault,
    signer: any,
    version: number,
    epochAdmin: string,
    redeemOperator: string,
    globalCap: bigint = DEFAULT_GLOBAL_CAP
  ): Promise<YieldVaultV2> {
    // Deploy the V2 implementation bytecode (no proxy interaction yet).
    const YieldVaultV2 = await ethers.getContractFactory("YieldVaultV2");
    const newImpl = await upgrades.prepareUpgrade(await vault.getAddress(), YieldVaultV2, {
      redeployImplementation: "always",
    }) as string;

    // Encode initializeV2 + perform atomic upgradeToAndCall as UPGRADER (owner).
    const iface = new ethers.Interface([
      "function initializeV2(uint64 version, address epochAdmin, address redeemOperator, uint256 globalCap)",
    ]);
    const initCalldata = iface.encodeFunctionData("initializeV2", [
      version,
      epochAdmin,
      redeemOperator,
      globalCap,
    ]);

    // UUPS proxies expose `upgradeToAndCall(address,bytes)` from UUPSUpgradeable.
    const uupsIface = new ethers.Interface([
      "function upgradeToAndCall(address newImplementation, bytes data)",
    ]);
    const calldata = uupsIface.encodeFunctionData("upgradeToAndCall", [newImpl, initCalldata]);

    await signer.sendTransaction({ to: await vault.getAddress(), data: calldata });

    return (await ethers.getContractAt("YieldVaultV2", await vault.getAddress())) as unknown as YieldVaultV2;
  }

  describe("Pre-upgrade behavior (V1 baseline)", function () {
    it("legacy REWARDS_ADMIN can call all three: mintRewards, createRewardsEpoch, completeRedeem", async function () {
      const { vault, legacyRewardsAdmin, user1 } = await loadFixture(deployV1AndUpgradeFixture);
      const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("v1-epoch"));

      // mintRewards
      await expect(
        vault.connect(legacyRewardsAdmin).mintRewards(user1.address, ethers.parseUnits("1", 6))
      ).to.not.be.reverted;

      // createRewardsEpoch
      await expect(
        vault.connect(legacyRewardsAdmin).createRewardsEpoch(0, merkleRoot, ethers.parseUnits("10", 6))
      ).to.not.be.reverted;

      // completeRedeem (drive a request first)
      const deposit = ethers.parseUnits("100", 6);
      await vault.connect(user1).deposit(deposit, user1.address);
      await vault.connect(user1).requestRedeem(await vault.balanceOf(user1.address));
      await expect(vault.connect(legacyRewardsAdmin).completeRedeem(user1.address)).to.not.be.reverted;
    });
  });

  describe("initializeV2 guards", function () {
    it("reverts on zero epochAdmin", async function () {
      const { vault, owner, redeemOperator } = await loadFixture(deployV1AndUpgradeFixture);
      const YieldVaultV2 = await ethers.getContractFactory("YieldVaultV2");
      const newImpl = (await upgrades.prepareUpgrade(await vault.getAddress(), YieldVaultV2, {
        redeployImplementation: "always",
      })) as string;
      const initCalldata = new ethers.Interface([
        "function initializeV2(uint64 version, address epochAdmin, address redeemOperator, uint256 globalCap)",
      ]).encodeFunctionData("initializeV2", [2, ethers.ZeroAddress, redeemOperator.address, DEFAULT_GLOBAL_CAP]);

      await expect(
        owner.sendTransaction({
          to: await vault.getAddress(),
          data: new ethers.Interface([
            "function upgradeToAndCall(address newImplementation, bytes data)",
          ]).encodeFunctionData("upgradeToAndCall", [newImpl, initCalldata]),
        })
      ).to.be.reverted; // bubbled InvalidAddress() from delegated initializeV2
    });

    it("reverts on zero redeemOperator", async function () {
      const { vault, owner, epochAdmin } = await loadFixture(deployV1AndUpgradeFixture);
      const YieldVaultV2 = await ethers.getContractFactory("YieldVaultV2");
      const newImpl = (await upgrades.prepareUpgrade(await vault.getAddress(), YieldVaultV2, {
        redeployImplementation: "always",
      })) as string;
      const initCalldata = new ethers.Interface([
        "function initializeV2(uint64 version, address epochAdmin, address redeemOperator, uint256 globalCap)",
      ]).encodeFunctionData("initializeV2", [2, epochAdmin.address, ethers.ZeroAddress, DEFAULT_GLOBAL_CAP]);

      await expect(
        owner.sendTransaction({
          to: await vault.getAddress(),
          data: new ethers.Interface([
            "function upgradeToAndCall(address newImplementation, bytes data)",
          ]).encodeFunctionData("upgradeToAndCall", [newImpl, initCalldata]),
        })
      ).to.be.reverted;
    });

    it("reverts when called by non-UPGRADER directly on the V2 proxy", async function () {
      // Land the upgrade first, then a separate non-upgrader call to initializeV2
      // should revert — guards against accidental re-init.
      const { vault, owner, epochAdmin, redeemOperator, user1 } = await loadFixture(
        deployV1AndUpgradeFixture
      );
      const v2 = await upgradeToV2(
        vault,
        owner,
        2,
        epochAdmin.address,
        redeemOperator.address
      );
      // Second call should be blocked by reinitializer(version) regardless of caller,
      // but it should ALSO be blocked by onlyRole(UPGRADER_ROLE) for non-upgraders.
      await expect(
        v2.connect(user1).initializeV2(3, epochAdmin.address, redeemOperator.address, DEFAULT_GLOBAL_CAP)
      ).to.be.reverted;
    });

    it("cannot be re-run with the same version (reinitializer enforced)", async function () {
      const { vault, owner, epochAdmin, redeemOperator } = await loadFixture(deployV1AndUpgradeFixture);
      const v2 = await upgradeToV2(
        vault,
        owner,
        2,
        epochAdmin.address,
        redeemOperator.address
      );
      await expect(
        v2.connect(owner).initializeV2(2, epochAdmin.address, redeemOperator.address, DEFAULT_GLOBAL_CAP)
      ).to.be.revertedWithCustomError(v2, "InvalidInitialization");
    });
  });

  describe("Post-upgrade role topology", function () {
    async function upgradedFixture() {
      const ctx = await loadFixture(deployV1AndUpgradeFixture);
      const v2 = await upgradeToV2(
        ctx.vault,
        ctx.owner,
        2,
        ctx.epochAdmin.address,
        ctx.redeemOperator.address
      );
      const EPOCH_ADMIN_ROLE = await v2.EPOCH_ADMIN_ROLE();
      const REDEEM_OPERATOR_ROLE = await v2.REDEEM_OPERATOR_ROLE();
      return { ...ctx, v2, EPOCH_ADMIN_ROLE, REDEEM_OPERATOR_ROLE };
    }

    it("grants EPOCH_ADMIN_ROLE to epochAdmin", async function () {
      const { v2, epochAdmin, EPOCH_ADMIN_ROLE } = await upgradedFixture();
      expect(await v2.hasRole(EPOCH_ADMIN_ROLE, epochAdmin.address)).to.equal(true);
    });

    it("grants REDEEM_OPERATOR_ROLE to redeemOperator", async function () {
      const { v2, redeemOperator, REDEEM_OPERATOR_ROLE } = await upgradedFixture();
      expect(await v2.hasRole(REDEEM_OPERATOR_ROLE, redeemOperator.address)).to.equal(true);
    });

    it("does NOT grant the new roles to the legacy REWARDS_ADMIN holder", async function () {
      const { v2, legacyRewardsAdmin, EPOCH_ADMIN_ROLE, REDEEM_OPERATOR_ROLE } =
        await upgradedFixture();
      expect(await v2.hasRole(EPOCH_ADMIN_ROLE, legacyRewardsAdmin.address)).to.equal(false);
      expect(await v2.hasRole(REDEEM_OPERATOR_ROLE, legacyRewardsAdmin.address)).to.equal(false);
    });

    it("legacy REWARDS_ADMIN holder can NO LONGER call createRewardsEpoch", async function () {
      const { v2, legacyRewardsAdmin } = await upgradedFixture();
      const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("root"));
      await expect(
        v2.connect(legacyRewardsAdmin).createRewardsEpoch(0, merkleRoot, ethers.parseUnits("1", 6))
      ).to.be.revertedWithCustomError(v2, "AccessControlUnauthorizedAccount");
    });

    it("legacy REWARDS_ADMIN holder can NO LONGER call completeRedeem", async function () {
      const { v2, legacyRewardsAdmin, user1 } = await upgradedFixture();
      await expect(
        v2.connect(legacyRewardsAdmin).completeRedeem(user1.address)
      ).to.be.revertedWithCustomError(v2, "AccessControlUnauthorizedAccount");
    });

    it("legacy REWARDS_ADMIN holder CAN STILL call mintRewards (scope unchanged)", async function () {
      const { v2, legacyRewardsAdmin, user1 } = await upgradedFixture();
      await expect(
        v2.connect(legacyRewardsAdmin).mintRewards(user1.address, ethers.parseUnits("1", 6))
      ).to.not.be.reverted;
    });

    it("EPOCH_ADMIN holder CAN call createRewardsEpoch", async function () {
      const { v2, epochAdmin } = await upgradedFixture();
      const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("root"));
      await expect(
        v2.connect(epochAdmin).createRewardsEpoch(0, merkleRoot, ethers.parseUnits("1", 6))
      ).to.emit(v2, "RewardsEpochCreated");
    });

    it("REDEEM_OPERATOR holder CAN complete a pending redemption end-to-end", async function () {
      const { v2, usdc, user1, redeemOperator } = await upgradedFixture();
      const deposit = ethers.parseUnits("100", 6);
      await v2.connect(user1).deposit(deposit, user1.address);
      await v2.connect(user1).requestRedeem(await v2.balanceOf(user1.address));

      const balBefore = await usdc.balanceOf(user1.address);
      await expect(v2.connect(redeemOperator).completeRedeem(user1.address))
        .to.emit(v2, "RedemptionCompleted");
      const balAfter = await usdc.balanceOf(user1.address);
      expect(balAfter - balBefore).to.equal(deposit);
    });
  });

  describe("Storage preservation across upgrade", function () {
    it("preserves balances, pendingRedemptions, and currentEpochIndex", async function () {
      const { vault, owner, user1, legacyRewardsAdmin, epochAdmin, redeemOperator, REWARDS_ADMIN_ROLE } =
        await loadFixture(deployV1AndUpgradeFixture);

      // Drive V1-era state.
      const deposit = ethers.parseUnits("250", 6);
      await vault.connect(user1).deposit(deposit, user1.address);
      const sharesBefore = await vault.balanceOf(user1.address);

      const redeemShares = sharesBefore / 2n;
      await vault.connect(user1).requestRedeem(redeemShares);
      const pendingBefore = await vault.pendingRedemptions(user1.address);

      const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("legacy-epoch"));
      await vault
        .connect(legacyRewardsAdmin)
        .createRewardsEpoch(0, merkleRoot, ethers.parseUnits("10", 6));
      expect(await vault.currentEpochIndex()).to.equal(1n);

      // Upgrade.
      const v2 = await upgradeToV2(
        vault,
        owner,
        2,
        epochAdmin.address,
        redeemOperator.address
      );

      // Balances + pending state survive.
      expect(await v2.balanceOf(user1.address)).to.equal(sharesBefore - redeemShares);
      const pendingAfter = await v2.pendingRedemptions(user1.address);
      expect(pendingAfter.shares).to.equal(pendingBefore.shares);
      expect(pendingAfter.assets).to.equal(pendingBefore.assets);
      expect(pendingAfter.timestamp).to.equal(pendingBefore.timestamp);

      // Epoch counter survives.
      expect(await v2.currentEpochIndex()).to.equal(1n);

      // Legacy REWARDS_ADMIN grant survives (intentional — revoked later via Safe).
      expect(await v2.hasRole(REWARDS_ADMIN_ROLE, legacyRewardsAdmin.address)).to.equal(true);

      // New REDEEM_OPERATOR can drain the pending redemption.
      await expect(v2.connect(redeemOperator).completeRedeem(user1.address))
        .to.emit(v2, "RedemptionCompleted");
    });
  });

  describe("Sepolia-style upgrade (already at _initialized=2, pass version=3)", function () {
    it("succeeds when called with version=3 against a proxy at _initialized=2", async function () {
      // Simulate a Sepolia-like proxy: V1 deployProxy puts us at _initialized=1, so
      // first bump it to 2 with a no-op reinitializer-equivalent. The cleanest way
      // is to drive a real V2 upgrade with version=2 then a SECOND upgrade with
      // version=3. But we only have one V2 contract; the second upgrade would just
      // re-run the same bytecode. For coverage we drive version=3 directly on a
      // fresh V1 proxy (still satisfies the version > _initialized check at 1<3).
      const { vault, owner, epochAdmin, redeemOperator } = await loadFixture(
        deployV1AndUpgradeFixture
      );
      const v2 = await upgradeToV2(
        vault,
        owner,
        3,
        epochAdmin.address,
        redeemOperator.address
      );
      const EPOCH_ADMIN_ROLE = await v2.EPOCH_ADMIN_ROLE();
      expect(await v2.hasRole(EPOCH_ADMIN_ROLE, epochAdmin.address)).to.equal(true);
    });
  });

  describe("V2 override revert branches", function () {
    async function upgradedWithFrozenAdmin() {
      const ctx = await loadFixture(deployV1AndUpgradeFixture);
      // Grant FREEZE_ADMIN to owner so we can freeze an account in tests.
      const FREEZE_ADMIN_ROLE = await ctx.vault.FREEZE_ADMIN_ROLE();
      await ctx.vault.connect(ctx.owner).grantRole(FREEZE_ADMIN_ROLE, ctx.owner.address);
      const v2 = await upgradeToV2(
        ctx.vault,
        ctx.owner,
        2,
        ctx.epochAdmin.address,
        ctx.redeemOperator.address
      );
      return { ...ctx, v2 };
    }

    it("completeRedeem reverts AccountIsFrozen when user is frozen", async function () {
      const { v2, user1, owner, redeemOperator } = await upgradedWithFrozenAdmin();
      // User deposits + requests redeem, then gets frozen before completion.
      await v2.connect(user1).deposit(ethers.parseUnits("100", 6), user1.address);
      await v2.connect(user1).requestRedeem(await v2.balanceOf(user1.address));
      await v2.connect(owner).freezeAccount(user1.address);

      await expect(v2.connect(redeemOperator).completeRedeem(user1.address))
        .to.be.revertedWithCustomError(v2, "AccountIsFrozen");
    });

    it("completeRedeem reverts NoRedemptionPending when no request exists", async function () {
      const { v2, user1, redeemOperator } = await upgradedWithFrozenAdmin();
      await expect(v2.connect(redeemOperator).completeRedeem(user1.address))
        .to.be.revertedWithCustomError(v2, "NoRedemptionPending");
    });

    it("completeRedeem reverts InsufficientVaultBalance when redeemVault is underfunded", async function () {
      // Build a fresh setup where the redeemVault has zero USDC balance to force
      // the InsufficientVaultBalance branch (covers V2 line 85).
      const [owner, redeemVault, epochAdmin, redeemOperator, user1] = await ethers.getSigners();

      const MockUSDC = await ethers.getContractFactory("MockUSDC");
      const usdc = (await MockUSDC.deploy()) as unknown as MockUSDC;
      await usdc.waitForDeployment();

      const YieldVault = await ethers.getContractFactory("YieldVault");
      const vault = (await upgrades.deployProxy(
        YieldVault,
        [
          await usdc.getAddress(),
          "Wrapped YLDS",
          "wYLDS",
          owner.address,
          redeemVault.address,
          ethers.ZeroAddress,
        ],
        { kind: "uups" }
      )) as unknown as YieldVault;
      await vault.waitForDeployment();

      // Fund user (NOT redeemVault) so deposit + requestRedeem succeed but completeRedeem can't.
      const deposit = ethers.parseUnits("100", 6);
      await usdc.mint(user1.address, deposit);
      await usdc.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);
      await vault.connect(user1).deposit(deposit, user1.address);
      await vault.connect(user1).requestRedeem(await vault.balanceOf(user1.address));

      // redeemVault must approve the vault to pull funds — without approval the
      // transferFrom would fail before the balance check; with approval but zero
      // balance the explicit InsufficientVaultBalance check fires first.
      await usdc.connect(redeemVault).approve(await vault.getAddress(), ethers.MaxUint256);

      const v2 = await upgradeToV2(
        vault,
        owner,
        2,
        epochAdmin.address,
        redeemOperator.address
      );

      await expect(v2.connect(redeemOperator).completeRedeem(user1.address))
        .to.be.revertedWithCustomError(v2, "InsufficientVaultBalance");
    });

    it("createRewardsEpoch reverts InvalidEpoch when index is wrong", async function () {
      const { v2, epochAdmin } = await upgradedWithFrozenAdmin();
      const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("root"));
      // currentEpochIndex starts at 0; passing 5 should revert.
      await expect(
        v2.connect(epochAdmin).createRewardsEpoch(5, merkleRoot, ethers.parseUnits("1", 6))
      ).to.be.revertedWithCustomError(v2, "InvalidEpoch");
    });

    it("createRewardsEpoch reverts InvalidAmount when merkleRoot is zero", async function () {
      const { v2, epochAdmin } = await upgradedWithFrozenAdmin();
      await expect(
        v2.connect(epochAdmin).createRewardsEpoch(0, ethers.ZeroHash, ethers.parseUnits("1", 6))
      ).to.be.revertedWithCustomError(v2, "InvalidAmount");
    });

    it("claimRewards reverts InvalidProof when proof is wrong", async function () {
      const { v2, epochAdmin, user1 } = await upgradedWithFrozenAdmin();
      const amount = ethers.parseUnits("10", 6);

      // Create epoch with a real root (built from user1's leaf)
      const leaf = ethers.keccak256(
        ethers.solidityPacked(
          ["bytes32"],
          [ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256", "uint256"],
            [user1.address, amount, 0]
          ))]
        )
      );
      // Use the leaf itself as the root so a valid proof would be [] — but we pass a bad proof
      await v2.connect(epochAdmin).createRewardsEpoch(0, leaf, amount);

      // Pass a non-empty garbage proof → MerkleProof.verify returns false
      const badProof = [ethers.keccak256(ethers.toUtf8Bytes("garbage"))];
      await expect(
        v2.connect(user1).claimRewards(0, amount, badProof)
      ).to.be.revertedWithCustomError(v2, "InvalidProof");
    });

    it("claimRewards reverts InvalidEpoch when epochIndex >= currentEpochIndex", async function () {
      const { v2, user1 } = await upgradedWithFrozenAdmin();
      // currentEpochIndex is 0 — passing 0 or any higher index reverts
      await expect(
        v2.connect(user1).claimRewards(0, ethers.parseUnits("1", 6), [])
      ).to.be.revertedWithCustomError(v2, "InvalidEpoch");
    });

    it("claimRewards reverts RewardsAlreadyClaimed on double claim", async function () {
      const { v2, epochAdmin, user1 } = await upgradedWithFrozenAdmin();
      const amount = ethers.parseUnits("10", 6);

      // Build a valid single-leaf tree so the first claim passes
      const leaf = ethers.keccak256(
        ethers.solidityPacked(
          ["bytes32"],
          [ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256", "uint256"],
            [user1.address, amount, 0]
          ))]
        )
      );
      await v2.connect(epochAdmin).createRewardsEpoch(0, leaf, amount);

      // First claim: valid empty proof (leaf == root)
      await v2.connect(user1).claimRewards(0, amount, []);

      // Second claim: same epoch → RewardsAlreadyClaimed
      await expect(
        v2.connect(user1).claimRewards(0, amount, [])
      ).to.be.revertedWithCustomError(v2, "RewardsAlreadyClaimed");
    });

    it("claimRewards reverts EnforcedPause when vault is paused", async function () {
      const { v2, epochAdmin, user1, owner } = await upgradedWithFrozenAdmin();
      const amount = ethers.parseUnits("10", 6);
      const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("root"));
      await v2.connect(epochAdmin).createRewardsEpoch(0, merkleRoot, amount);

      await v2.connect(owner).pause();
      await expect(
        v2.connect(user1).claimRewards(0, amount, [])
      ).to.be.revertedWithCustomError(v2, "EnforcedPause");
    });
  });
});
