import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { MerkleTree } from "merkletreejs";
import type { MockUSDC, YieldVault, YieldVaultV2 } from "../../typechain-types";

/**
 * Tests for the Audit 4.1 per-epoch reward cap on `YieldVaultV2`.
 *
 * Each test deploys a V1 proxy → upgrades to V2 via a single
 * `upgradeToAndCall(impl, initializeV2(version, epochAdmin, redeemOperator, globalCap))`
 * call. `initializeV2` sets both the role grants and the cap state atomically.
 * The Merkle claim path is then driven with a per-epoch budget smaller than the
 * sum of leaves to exercise the over-cap revert.
 *
 * Pre-cap epochs (created before `initializeV2` runs) remain claimable with
 * V1 semantics — covered by the existing `YieldVault.test.ts` suite.
 */
describe("YieldVaultV2 epoch caps (Audit 4.1)", function () {
  function leafFor(user: string, amount: bigint, epoch: number): string {
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "uint256"],
      [user, amount, epoch]
    );
    return ethers.keccak256(ethers.concat([ethers.keccak256(encoded)]));
  }

  function createMerkleTree(
    rewards: { user: string; amount: bigint; epoch: number }[]
  ) {
    const leaves = rewards.map((r) => leafFor(r.user, r.amount, r.epoch));
    return new MerkleTree(leaves, ethers.keccak256, { sortPairs: true });
  }

  async function deployV2WithCapsFixture(globalCap: bigint = ethers.parseUnits("5000000", 6)) {
    const [owner, redeemVault, epochAdmin, redeemOperator, user1, user2, user3] =
      await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = (await MockUSDC.deploy()) as unknown as MockUSDC;
    await usdc.waitForDeployment();

    const YieldVault = await ethers.getContractFactory("YieldVault");
    const v1 = (await upgrades.deployProxy(
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
    await v1.waitForDeployment();

    return { v1, usdc, owner, epochAdmin, redeemOperator, user1, user2, user3, globalCap };
  }

  async function upgradeV1ToV2(
    v1: YieldVault,
    owner: any,
    epochAdmin: string,
    redeemOperator: string,
    globalCap: bigint
  ): Promise<YieldVaultV2> {
    const YieldVaultV2 = await ethers.getContractFactory("YieldVaultV2");
    const newImpl = (await upgrades.prepareUpgrade(
      await v1.getAddress(),
      YieldVaultV2,
      { redeployImplementation: "always" }
    )) as string;

    const v2Iface = new ethers.Interface([
      "function initializeV2(uint64 version, address epochAdmin, address redeemOperator, uint256 globalCap)",
    ]);
    const initV2Calldata = v2Iface.encodeFunctionData("initializeV2", [
      2,
      epochAdmin,
      redeemOperator,
      globalCap,
    ]);
    const uupsIface = new ethers.Interface([
      "function upgradeToAndCall(address newImplementation, bytes data)",
    ]);
    const tx = await owner.sendTransaction({
      to: await v1.getAddress(),
      data: uupsIface.encodeFunctionData("upgradeToAndCall", [newImpl, initV2Calldata]),
    });
    await tx.wait();
    return (await ethers.getContractAt(
      "YieldVaultV2",
      await v1.getAddress()
    )) as unknown as YieldVaultV2;
  }

  async function freshV2(globalCap?: bigint) {
    const ctx = await loadFixture(deployV2WithCapsFixture);
    const cap = globalCap ?? ctx.globalCap;
    const vault = await upgradeV1ToV2(
      ctx.v1,
      ctx.owner,
      ctx.epochAdmin.address,
      ctx.redeemOperator.address,
      cap
    );
    return { ...ctx, vault, cap };
  }

  const ONE_M = ethers.parseUnits("1000000", 6); // 1M wYLDS in 6-dec
  const FIVE_M = ethers.parseUnits("5000000", 6); // 5M wYLDS in 6-dec

  describe("initializeV2 (combined role + caps init)", function () {
    it("snapshots firstCappedEpoch = currentEpochIndex and sets maxEpochCap", async function () {
      const { vault } = await freshV2(FIVE_M);

      // Fresh proxy: no V1 epochs were created, so currentEpochIndex starts at 0
      // and firstCappedEpoch should match.
      expect(await vault.firstCappedEpoch()).to.equal(0n);
      expect(await vault.maxEpochCap()).to.equal(FIVE_M);
    });

    it("snapshots firstCappedEpoch to V1's currentEpochIndex when V1 epochs exist (grandfathering)", async function () {
      const ctx = await loadFixture(deployV2WithCapsFixture);

      // Drive V1 epoch creation BEFORE upgrade so currentEpochIndex advances.
      const REWARDS_ADMIN_ROLE = await ctx.v1.REWARDS_ADMIN_ROLE();
      await ctx.v1.connect(ctx.owner).grantRole(REWARDS_ADMIN_ROLE, ctx.owner.address);
      const root1 = ethers.keccak256(ethers.toUtf8Bytes("v1-epoch-0"));
      const root2 = ethers.keccak256(ethers.toUtf8Bytes("v1-epoch-1"));
      await ctx.v1.connect(ctx.owner).createRewardsEpoch(0, root1, ONE_M);
      await ctx.v1.connect(ctx.owner).createRewardsEpoch(1, root2, ONE_M);
      expect(await ctx.v1.currentEpochIndex()).to.equal(2n);

      const vault = await upgradeV1ToV2(
        ctx.v1,
        ctx.owner,
        ctx.epochAdmin.address,
        ctx.redeemOperator.address,
        FIVE_M
      );

      // Pre-existing V1 epochs (0 and 1) are grandfathered.
      expect(await vault.firstCappedEpoch()).to.equal(2n);
    });

    it("emits FirstCappedEpochSet and MaxEpochCapUpdated", async function () {
      const ctx = await loadFixture(deployV2WithCapsFixture);
      const YieldVaultV2 = await ethers.getContractFactory("YieldVaultV2");
      const newImpl = (await upgrades.prepareUpgrade(
        await ctx.v1.getAddress(),
        YieldVaultV2,
        { redeployImplementation: "always" }
      )) as string;
      const v2Iface = new ethers.Interface([
        "function initializeV2(uint64 version, address epochAdmin, address redeemOperator, uint256 globalCap)",
      ]);
      const initCalldata = v2Iface.encodeFunctionData("initializeV2", [
        2,
        ctx.epochAdmin.address,
        ctx.redeemOperator.address,
        FIVE_M,
      ]);
      const uupsIface = new ethers.Interface([
        "function upgradeToAndCall(address newImplementation, bytes data)",
      ]);
      const tx = ctx.owner.sendTransaction({
        to: await ctx.v1.getAddress(),
        data: uupsIface.encodeFunctionData("upgradeToAndCall", [newImpl, initCalldata]),
      });

      const vault = (await ethers.getContractAt(
        "YieldVaultV2",
        await ctx.v1.getAddress()
      )) as unknown as YieldVaultV2;

      await expect(tx)
        .to.emit(vault, "FirstCappedEpochSet").withArgs(0n)
        .and.to.emit(vault, "MaxEpochCapUpdated").withArgs(0n, FIVE_M);
    });

    it("reverts InvalidGlobalCap on zero cap", async function () {
      const ctx = await loadFixture(deployV2WithCapsFixture);
      await expect(
        upgradeV1ToV2(ctx.v1, ctx.owner, ctx.epochAdmin.address, ctx.redeemOperator.address, 0n)
      ).to.be.revertedWithCustomError(
        await ethers.getContractAt("YieldVaultV2", await ctx.v1.getAddress()),
        "InvalidGlobalCap"
      );
    });

    it("reverts CapsAlreadyInitialized when initializeV2 is re-run with a higher version", async function () {
      // After a successful initializeV2 (maxEpochCap > 0), a subsequent call
      // with a higher reinitializer version must be rejected so firstCappedEpoch
      // and maxEpochCap cannot be overwritten (audit invariant).
      const ctx = await loadFixture(deployV2WithCapsFixture);
      const vault = await upgradeV1ToV2(
        ctx.v1, ctx.owner, ctx.epochAdmin.address, ctx.redeemOperator.address, FIVE_M
      );
      expect(await vault.maxEpochCap()).to.equal(FIVE_M); // caps are live

      // Prepare a higher-version call (version=3 since proxy is now at _initialized=2)
      const YieldVaultV2Factory = await ethers.getContractFactory("YieldVaultV2");
      const newImpl = await upgrades.prepareUpgrade(await vault.getAddress(), YieldVaultV2Factory, {
        redeployImplementation: "always",
      }) as string;
      const iface = new ethers.Interface([
        "function initializeV2(uint64 version, address epochAdmin, address redeemOperator, uint256 globalCap)",
      ]);
      const initCalldata = iface.encodeFunctionData("initializeV2", [
        3, ctx.epochAdmin.address, ctx.redeemOperator.address, ONE_M,
      ]);
      const uupsIface = new ethers.Interface([
        "function upgradeToAndCall(address newImplementation, bytes data)",
      ]);
      await expect(
        ctx.owner.sendTransaction({
          to: await vault.getAddress(),
          data: uupsIface.encodeFunctionData("upgradeToAndCall", [newImpl, initCalldata]),
        })
      ).to.be.revertedWithCustomError(vault, "CapsAlreadyInitialized");

      // State is unchanged after the failed re-run
      expect(await vault.maxEpochCap()).to.equal(FIVE_M);
      expect(await vault.firstCappedEpoch()).to.equal(0n);
    });
  });

  describe("setMaxEpochCap", function () {
    it("admin can raise and lower the cap", async function () {
      const { vault, owner } = await freshV2(FIVE_M);

      await expect(vault.connect(owner).setMaxEpochCap(ONE_M))
        .to.emit(vault, "MaxEpochCapUpdated")
        .withArgs(FIVE_M, ONE_M);
      expect(await vault.maxEpochCap()).to.equal(ONE_M);

      const TEN_M = ethers.parseUnits("10000000", 6);
      await vault.connect(owner).setMaxEpochCap(TEN_M);
      expect(await vault.maxEpochCap()).to.equal(TEN_M);
    });

    it("reverts InvalidGlobalCap on zero", async function () {
      const { vault, owner } = await freshV2();
      await expect(
        vault.connect(owner).setMaxEpochCap(0)
      ).to.be.revertedWithCustomError(vault, "InvalidGlobalCap");
    });

    it("reverts when called by non-admin", async function () {
      const { vault, user1 } = await freshV2();
      await expect(vault.connect(user1).setMaxEpochCap(ONE_M)).to.be.reverted;
    });
  });

  describe("createRewardsEpoch global cap", function () {
    it("accepts totalRewards == maxEpochCap (boundary)", async function () {
      const { vault, epochAdmin } = await freshV2(FIVE_M);

      const root = ethers.keccak256(ethers.toUtf8Bytes("epoch-cap-boundary"));
      await expect(
        vault.connect(epochAdmin).createRewardsEpoch(0, root, FIVE_M)
      ).to.emit(vault, "RewardsEpochCreated");
    });

    it("reverts EpochCapAboveGlobal when totalRewards > maxEpochCap", async function () {
      const { vault, epochAdmin } = await freshV2(FIVE_M);

      const root = ethers.keccak256(ethers.toUtf8Bytes("over-cap"));
      const attempted = FIVE_M + 1n;
      await expect(
        vault.connect(epochAdmin).createRewardsEpoch(0, root, attempted)
      )
        .to.be.revertedWithCustomError(vault, "EpochCapAboveGlobal")
        .withArgs(attempted, FIVE_M);
    });
  });

  describe("claimRewards per-epoch cap", function () {
    it("rejects single claim that alone exceeds epoch.totalRewards", async function () {
      const { vault, epochAdmin, user1 } = await freshV2(FIVE_M);

      // Declare an epoch with totalRewards=100, but the Merkle leaf grants 150.
      const epochIndex = 0;
      const declared = ethers.parseUnits("100", 6);
      const leafAmount = ethers.parseUnits("150", 6);

      const tree = createMerkleTree([
        { user: user1.address, amount: leafAmount, epoch: epochIndex },
      ]);
      const root = tree.getHexRoot();
      await vault.connect(epochAdmin).createRewardsEpoch(epochIndex, root, declared);

      const proof = tree.getHexProof(leafFor(user1.address, leafAmount, epochIndex));
      await expect(vault.connect(user1).claimRewards(epochIndex, leafAmount, proof))
        .to.be.revertedWithCustomError(vault, "EpochCapExceeded")
        .withArgs(epochIndex, leafAmount, 0n, declared);
    });

    it("rejects claim that would push cumulative past epoch.totalRewards; accepts smaller claim after revert", async function () {
      const { vault, epochAdmin, user1, user2, user3 } = await freshV2(FIVE_M);

      const epochIndex = 0;
      const amt = ethers.parseUnits("40", 6);
      const declared = ethers.parseUnits("100", 6); // cap: user1(40) fits, user2(80) busts it
      const overAmt = ethers.parseUnits("30", 6);   // any extra busts the cap

      const tree = createMerkleTree([
        { user: user1.address, amount: amt, epoch: epochIndex },
        { user: user2.address, amount: amt + amt, epoch: epochIndex },
        { user: user3.address, amount: overAmt, epoch: epochIndex },
      ]);
      const root = tree.getHexRoot();
      await vault.connect(epochAdmin).createRewardsEpoch(epochIndex, root, declared);

      // user1 claims 40 → cumulative 40
      await vault
        .connect(user1)
        .claimRewards(
          epochIndex,
          amt,
          tree.getHexProof(leafFor(user1.address, amt, epochIndex))
        );
      expect(await vault.epochClaimedAmount(epochIndex)).to.equal(amt);

      // user2 claims 80 → cumulative 120 → BUSTS cap of 100
      await expect(
        vault
          .connect(user2)
          .claimRewards(
            epochIndex,
            amt + amt,
            tree.getHexProof(leafFor(user2.address, amt + amt, epochIndex))
          )
      )
        .to.be.revertedWithCustomError(vault, "EpochCapExceeded")
        .withArgs(epochIndex, amt + amt, amt, declared);

      // user3 claims 30 → cumulative 70 (counter stayed at 40 because user2 reverted), fits within cap
      await vault
        .connect(user3)
        .claimRewards(
          epochIndex,
          overAmt,
          tree.getHexProof(leafFor(user3.address, overAmt, epochIndex))
        );
      expect(await vault.epochClaimedAmount(epochIndex)).to.equal(amt + overAmt);
    });

    it("accepts cumulative claims that hit exactly cap (boundary)", async function () {
      const { vault, epochAdmin, user1, user2 } = await freshV2(FIVE_M);

      const epochIndex = 0;
      const amt1 = ethers.parseUnits("60", 6);
      const amt2 = ethers.parseUnits("40", 6);
      const declared = amt1 + amt2;

      const tree = createMerkleTree([
        { user: user1.address, amount: amt1, epoch: epochIndex },
        { user: user2.address, amount: amt2, epoch: epochIndex },
      ]);
      const root = tree.getHexRoot();
      await vault.connect(epochAdmin).createRewardsEpoch(epochIndex, root, declared);

      await vault
        .connect(user1)
        .claimRewards(epochIndex, amt1, tree.getHexProof(leafFor(user1.address, amt1, epochIndex)));
      await vault
        .connect(user2)
        .claimRewards(epochIndex, amt2, tree.getHexProof(leafFor(user2.address, amt2, epochIndex)));

      expect(await vault.epochClaimedAmount(epochIndex)).to.equal(declared);
    });

    it("does NOT enforce cap on pre-cap (V1-era) epochs", async function () {
      // Create a V1 epoch first, THEN upgrade. The pre-existing epoch sits at index 0
      // and firstCappedEpoch becomes 1, so epoch 0 retains V1 semantics.
      const ctx = await loadFixture(deployV2WithCapsFixture);
      const REWARDS_ADMIN_ROLE = await ctx.v1.REWARDS_ADMIN_ROLE();
      await ctx.v1.connect(ctx.owner).grantRole(REWARDS_ADMIN_ROLE, ctx.owner.address);

      const epochIndex = 0;
      const declared = ethers.parseUnits("100", 6);
      const leafAmount = ethers.parseUnits("150", 6);
      const tree = createMerkleTree([
        { user: ctx.user1.address, amount: leafAmount, epoch: epochIndex },
      ]);
      const root = tree.getHexRoot();
      await ctx.v1.connect(ctx.owner).createRewardsEpoch(epochIndex, root, declared);

      const vault = await upgradeV1ToV2(
        ctx.v1,
        ctx.owner,
        ctx.epochAdmin.address,
        ctx.redeemOperator.address,
        FIVE_M
      );
      expect(await vault.firstCappedEpoch()).to.equal(1n);

      // user1 can still claim the full leaf — pre-cap epoch.
      const proof = tree.getHexProof(leafFor(ctx.user1.address, leafAmount, epochIndex));
      await expect(vault.connect(ctx.user1).claimRewards(epochIndex, leafAmount, proof))
        .to.emit(vault, "RewardsClaimed")
        .withArgs(ctx.user1.address, epochIndex, leafAmount);
      // Counter not touched for pre-cap epochs.
      expect(await vault.epochClaimedAmount(epochIndex)).to.equal(0n);
    });

    it("counter increments before mint (state mutated correctly on success)", async function () {
      const { vault, epochAdmin, user1 } = await freshV2(FIVE_M);

      const epochIndex = 0;
      const amt = ethers.parseUnits("50", 6);
      const declared = ethers.parseUnits("100", 6);
      const tree = createMerkleTree([
        { user: user1.address, amount: amt, epoch: epochIndex },
      ]);
      const root = tree.getHexRoot();
      await vault.connect(epochAdmin).createRewardsEpoch(epochIndex, root, declared);

      const balBefore = await vault.balanceOf(user1.address);
      await vault
        .connect(user1)
        .claimRewards(epochIndex, amt, tree.getHexProof(leafFor(user1.address, amt, epochIndex)));

      expect(await vault.balanceOf(user1.address)).to.equal(balBefore + amt);
      expect(await vault.epochClaimedAmount(epochIndex)).to.equal(amt);
    });
  });

  describe("Storage layout safety", function () {
    it("OZ validateUpgrade passes for V1 -> V2 upgrade path", async function () {
      // Drives the same plugin that gates production upgrades. If a slot moves
      // or a parent variable shifts, this throws.
      const YieldVault = await ethers.getContractFactory("YieldVault");
      const YieldVaultV2 = await ethers.getContractFactory("YieldVaultV2");
      await upgrades.validateUpgrade(YieldVault, YieldVaultV2, { kind: "uups" });
    });
  });

  describe("createRewardsEpoch cap == 0 defense-in-depth", function () {
    it("skips cap check when maxEpochCap is zero (proxy upgraded without initializeV2)", async function () {
      // This exercises the `if (cap != 0 && ...)` false branch — explicitly
      // documented as dead code for any properly-initialized V2 proxy but
      // retained as defense-in-depth. We reach it by upgrading without calling
      // initializeV2, leaving maxEpochCap == 0, then granting EPOCH_ADMIN_ROLE
      // manually and creating an epoch. The call must succeed (no cap enforcement).
      const ctx = await loadFixture(deployV2WithCapsFixture);

      const YieldVaultV2Factory = await ethers.getContractFactory("YieldVaultV2");
      const newImpl = (await upgrades.prepareUpgrade(
        await ctx.v1.getAddress(),
        YieldVaultV2Factory,
        { redeployImplementation: "always" }
      )) as string;

      // Upgrade with empty calldata — initializeV2 NOT called, maxEpochCap stays 0
      const uupsIface = new ethers.Interface([
        "function upgradeToAndCall(address newImplementation, bytes data)",
      ]);
      await ctx.owner.sendTransaction({
        to: await ctx.v1.getAddress(),
        data: uupsIface.encodeFunctionData("upgradeToAndCall", [newImpl, "0x"]),
      });

      const vault = (await ethers.getContractAt(
        "YieldVaultV2",
        await ctx.v1.getAddress()
      )) as unknown as YieldVaultV2;

      // maxEpochCap is still 0 — the cap guard must be skipped (not reverted)
      expect(await vault.maxEpochCap()).to.equal(0n);

      // Grant EPOCH_ADMIN_ROLE manually so we can call createRewardsEpoch
      const EPOCH_ADMIN_ROLE = await vault.EPOCH_ADMIN_ROLE();
      const DEFAULT_ADMIN_ROLE = await vault.DEFAULT_ADMIN_ROLE();
      // DEFAULT_ADMIN_ROLE was not granted to Timelock here — owner held it via V1
      await vault.connect(ctx.owner).grantRole(EPOCH_ADMIN_ROLE, ctx.owner.address);

      const root = ethers.keccak256(ethers.toUtf8Bytes("cap-zero-test"));
      // totalRewards > 0 — but cap == 0 so the guard is skipped → should succeed
      await expect(
        vault.connect(ctx.owner).createRewardsEpoch(0, root, ethers.parseUnits("999999", 6))
      ).to.not.be.reverted;
    });
  });
});
