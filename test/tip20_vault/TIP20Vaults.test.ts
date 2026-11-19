import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type {
  MockUSDC,
  MockTIP20,
  MockFeedVerifier,
  YieldVaultTIP20,
  StakingVaultTIP20,
} from "../../typechain-types";

describe("YieldVaultTIP20", function () {
  async function deployFixture() {
    const [admin, redeemVault, freezeAdmin, rewardsAdmin, whitelistAdmin, withdrawalAdmin, user1, user2] =
      await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = (await MockUSDC.deploy()) as unknown as MockUSDC;

    const MockTIP20 = await ethers.getContractFactory("MockTIP20");
    const wylds = (await MockTIP20.deploy("Wrapped YLDS", "wYLDS", admin.address)) as unknown as MockTIP20;

    const YieldVaultTIP20 = await ethers.getContractFactory("YieldVaultTIP20");
    const vault = (await upgrades.deployProxy(
      YieldVaultTIP20,
      [await usdc.getAddress(), await wylds.getAddress(), admin.address, redeemVault.address, ethers.ZeroAddress],
      { kind: "uups" }
    )) as unknown as YieldVaultTIP20;

    // Grant the vault ISSUER_ROLE on the TIP-20 token — the real-world equivalent of
    // the Safe handing mint/burn authority to this contract.
    const ISSUER_ROLE = await wylds.ISSUER_ROLE();
    await wylds.connect(admin).grantRole(ISSUER_ROLE, await vault.getAddress());

    await vault.grantRole(await vault.FREEZE_ADMIN_ROLE(), freezeAdmin.address);
    await vault.grantRole(await vault.REWARDS_ADMIN_ROLE(), rewardsAdmin.address);
    await vault.grantRole(await vault.WHITELIST_ADMIN_ROLE(), whitelistAdmin.address);
    await vault.grantRole(await vault.WITHDRAWAL_ADMIN_ROLE(), withdrawalAdmin.address);
    await vault.grantRole(await vault.PAUSER_ROLE(), admin.address);

    const startAmount = ethers.parseUnits("10000", 6);
    await usdc.mint(user1.address, startAmount);
    await usdc.mint(user2.address, startAmount);
    await usdc.mint(redeemVault.address, startAmount);

    await usdc.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);
    await usdc.connect(user2).approve(await vault.getAddress(), ethers.MaxUint256);
    await usdc.connect(redeemVault).approve(await vault.getAddress(), ethers.MaxUint256);

    return { vault, usdc, wylds, admin, redeemVault, freezeAdmin, rewardsAdmin, whitelistAdmin, withdrawalAdmin, user1, user2 };
  }

  it("mints the real TIP-20 token 1:1 to the receiver on deposit, pulling collateral from the sender", async function () {
    const { vault, usdc, wylds, user1, user2 } = await deployFixture();
    const amount = ethers.parseUnits("100", 6);

    await expect(vault.connect(user1).deposit(amount, user2.address))
      .to.emit(vault, "Deposit")
      .withArgs(user1.address, user2.address, amount, amount);

    expect(await wylds.balanceOf(user2.address)).to.equal(amount);
    expect(await wylds.balanceOf(user1.address)).to.equal(0);
    expect(await usdc.balanceOf(await vault.getAddress())).to.equal(amount);
  });

  it("reverts on deposit if the vault does not hold ISSUER_ROLE on the TIP-20 token", async function () {
    const { vault, wylds, admin, user1 } = await deployFixture();
    const ISSUER_ROLE = await wylds.ISSUER_ROLE();
    await wylds.connect(admin).revokeRole(ISSUER_ROLE, await vault.getAddress());

    await expect(vault.connect(user1).deposit(ethers.parseUnits("10", 6), user1.address)).to.be.reverted;
  });

  it("escrows real TIP-20 shares on requestRedeem and burns them on completeRedeem, paying out from redeemVault", async function () {
    const { vault, usdc, wylds, redeemVault, rewardsAdmin, user1 } = await deployFixture();
    const amount = ethers.parseUnits("100", 6);
    await vault.connect(user1).deposit(amount, user1.address);

    await wylds.connect(user1).approve(await vault.getAddress(), amount);
    await vault.connect(user1).requestRedeem(amount);

    expect(await wylds.balanceOf(await vault.getAddress())).to.equal(amount);
    expect(await wylds.balanceOf(user1.address)).to.equal(0);

    const redeemVaultUsdcBefore = await usdc.balanceOf(redeemVault.address);
    await vault.connect(rewardsAdmin).completeRedeem(user1.address);

    expect(await wylds.totalSupply()).to.equal(0); // burned, not just moved
    expect(await usdc.balanceOf(redeemVault.address)).to.equal(redeemVaultUsdcBefore - amount);
    expect(await usdc.balanceOf(user1.address)).to.equal(ethers.parseUnits("10000", 6)); // back to start
  });

  it("returns escrowed shares to the user on cancelRedeem", async function () {
    const { vault, wylds, user1 } = await deployFixture();
    const amount = ethers.parseUnits("50", 6);
    await vault.connect(user1).deposit(amount, user1.address);
    await wylds.connect(user1).approve(await vault.getAddress(), amount);
    await vault.connect(user1).requestRedeem(amount);

    await vault.connect(user1).cancelRedeem();
    expect(await wylds.balanceOf(user1.address)).to.equal(amount);
  });

  it("blocks vault-mediated actions for a frozen account but cannot block its peer-to-peer TIP-20 transfers", async function () {
    const { vault, wylds, freezeAdmin, user1, user2 } = await deployFixture();
    const amount = ethers.parseUnits("20", 6);
    await vault.connect(user1).deposit(amount, user1.address);

    await vault.connect(freezeAdmin).freezeAccount(user1.address);

    // Vault-mediated action: blocked.
    await expect(vault.connect(user1).deposit(amount, user1.address)).to.be.revertedWithCustomError(
      vault,
      "AccountIsFrozen"
    );

    // Peer-to-peer transfer of the real TIP-20 balance: NOT blocked — the vault has
    // no hook into the token's own transfer function once shares live externally.
    await wylds.connect(user1).transfer(user2.address, amount);
    expect(await wylds.balanceOf(user2.address)).to.equal(amount);
  });

  it("mints rewards via mintRewards and claimRewards as external TIP-20 mints", async function () {
    const { vault, wylds, rewardsAdmin, user1 } = await deployFixture();
    const amount = ethers.parseUnits("5", 6);
    await vault.connect(rewardsAdmin).mintRewards(user1.address, amount);
    expect(await wylds.balanceOf(user1.address)).to.equal(amount);
  });

  it("blocks deposit while paused", async function () {
    const { vault, admin, user1 } = await deployFixture();
    await vault.connect(admin).pause();
    await expect(vault.connect(user1).deposit(1, user1.address)).to.be.reverted;
  });
});

describe("StakingVaultTIP20", function () {
  async function deployFixture() {
    const [admin, navUpdater, freezeAdmin, rewardsAdmin, user1, user2] = await ethers.getSigners();

    const MockTIP20 = await ethers.getContractFactory("MockTIP20");
    const wylds = (await MockTIP20.deploy("Wrapped YLDS", "wYLDS", admin.address)) as unknown as MockTIP20;
    const prime = (await MockTIP20.deploy("Prime Staked YLDS", "PRIME", admin.address)) as unknown as MockTIP20;

    const MockFeedVerifier = await ethers.getContractFactory("MockFeedVerifier");
    const feedVerifier = (await MockFeedVerifier.deploy()) as unknown as MockFeedVerifier;
    const feedId = ethers.id("wYLDS/PRIME-NAV");

    // StakingVaultTIP20 only needs a contract exposing mintRewards(to, amount) — reuse a real
    // YieldVaultTIP20 deployment (minting the same wYLDS TIP-20) as that source.
    const YieldVaultTIP20 = await ethers.getContractFactory("YieldVaultTIP20");
    const usdcForYieldVault = await (await ethers.getContractFactory("MockUSDC")).deploy();
    const yieldVault = (await upgrades.deployProxy(
      YieldVaultTIP20,
      [await usdcForYieldVault.getAddress(), await wylds.getAddress(), admin.address, admin.address, ethers.ZeroAddress],
      { kind: "uups" }
    )) as unknown as YieldVaultTIP20;
    await wylds.connect(admin).grantRole(await wylds.ISSUER_ROLE(), await yieldVault.getAddress());

    const StakingVaultTIP20 = await ethers.getContractFactory("StakingVaultTIP20");
    const vault = (await upgrades.deployProxy(
      StakingVaultTIP20,
      [await wylds.getAddress(), await prime.getAddress(), admin.address, await yieldVault.getAddress()],
      { kind: "uups" }
    )) as unknown as StakingVaultTIP20;

    // StakingVaultTIP20 itself is the caller of YieldVaultTIP20.mintRewards during distributeRewards.
    await yieldVault.grantRole(await yieldVault.REWARDS_ADMIN_ROLE(), await vault.getAddress());
    await prime.connect(admin).grantRole(await prime.ISSUER_ROLE(), await vault.getAddress());
    await vault.grantRole(await vault.NAV_ORACLE_UPDATER_ROLE(), navUpdater.address);
    await vault.grantRole(await vault.FREEZE_ADMIN_ROLE(), freezeAdmin.address);
    await vault.grantRole(await vault.REWARDS_ADMIN_ROLE(), rewardsAdmin.address);

    // 1 PRIME = 1 wYLDS to start (1e18-scaled NAV).
    await vault.connect(navUpdater).setNavOracle(await feedVerifier.getAddress(), feedId);
    await feedVerifier.setPrice(feedId, ethers.parseUnits("1", 18), Math.floor(Date.now() / 1000));

    // Test-only: give admin ISSUER_ROLE on wYLDS so the fixture can fund test users directly.
    await wylds.connect(admin).grantRole(await wylds.ISSUER_ROLE(), admin.address);
    await wylds.connect(admin).mint(user1.address, ethers.parseUnits("1000", 6));
    await wylds.connect(admin).mint(user2.address, ethers.parseUnits("1000", 6));
    await wylds.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);
    await wylds.connect(user2).approve(await vault.getAddress(), ethers.MaxUint256);

    return { vault, wylds, prime, feedVerifier, feedId, yieldVault, admin, navUpdater, freezeAdmin, rewardsAdmin, user1, user2 };
  }

  it("stakes wYLDS and mints real PRIME per the NAV oracle", async function () {
    const { vault, wylds, prime, user1 } = await deployFixture();
    const amount = ethers.parseUnits("100", 6);

    await expect(vault.connect(user1).deposit(amount, user1.address))
      .to.emit(vault, "Deposit")
      .withArgs(user1.address, user1.address, amount, amount); // 1:1 NAV

    expect(await prime.balanceOf(user1.address)).to.equal(amount);
    expect(await wylds.balanceOf(await vault.getAddress())).to.equal(amount);
    expect(await vault.totalAssets()).to.equal(amount);
  });

  it("reverts deposit when no NAV oracle is set", async function () {
    const { vault, wylds, navUpdater, user1 } = await deployFixture();
    await vault.connect(navUpdater).setNavOracle(ethers.ZeroAddress, ethers.ZeroHash);
    await wylds.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);
    await expect(vault.connect(user1).deposit(ethers.parseUnits("10", 6), user1.address)).to.be.reverted;
  });

  it("self-redeems: burns the caller's own PRIME and returns wYLDS, without any prior approval", async function () {
    const { vault, wylds, prime, user1 } = await deployFixture();
    const amount = ethers.parseUnits("100", 6);
    await vault.connect(user1).deposit(amount, user1.address);

    // Note: no prime.approve(vault, ...) call — the privileged TIP-20 burn doesn't need it.
    await expect(vault.connect(user1).redeem(amount, user1.address))
      .to.emit(vault, "Withdraw")
      .withArgs(user1.address, user1.address, amount, amount);

    expect(await prime.balanceOf(user1.address)).to.equal(0);
    expect(await wylds.balanceOf(user1.address)).to.equal(ethers.parseUnits("1000", 6));
  });

  it("blocks vault-mediated actions for a frozen account but not peer-to-peer PRIME transfers", async function () {
    const { vault, prime, freezeAdmin, user1, user2 } = await deployFixture();
    const amount = ethers.parseUnits("30", 6);
    await vault.connect(user1).deposit(amount, user1.address);

    await vault.connect(freezeAdmin).freezeAccount(user1.address);
    await expect(vault.connect(user1).redeem(amount, user1.address)).to.be.revertedWithCustomError(
      vault,
      "AccountIsFrozen"
    );

    await prime.connect(user1).transfer(user2.address, amount);
    expect(await prime.balanceOf(user2.address)).to.equal(amount);
  });

  it("distributes rewards by pulling newly minted wYLDS from the YieldVault(TIP20)", async function () {
    const { vault, wylds, rewardsAdmin, user1 } = await deployFixture();
    await vault.connect(user1).deposit(ethers.parseUnits("1000", 6), user1.address);

    const reward = ethers.parseUnits("5", 6); // within 75bps cap of 1000
    await expect(vault.connect(rewardsAdmin).distributeRewards(reward))
      .to.emit(vault, "RewardsDistributed");

    expect(await wylds.balanceOf(await vault.getAddress())).to.equal(ethers.parseUnits("1005", 6));
    expect(await vault.totalAssets()).to.equal(ethers.parseUnits("1005", 6));
  });

  it("enforces the per-call reward percentage cap", async function () {
    const { vault, rewardsAdmin, user1 } = await deployFixture();
    await vault.connect(user1).deposit(ethers.parseUnits("1000", 6), user1.address);

    // 75bps of 1000 wYLDS = 7.5 wYLDS; 100 wYLDS should exceed it.
    await expect(vault.connect(rewardsAdmin).distributeRewards(ethers.parseUnits("100", 6))).to.be.revertedWithCustomError(
      vault,
      "RewardExceedsMaxDelta"
    );
  });
});
