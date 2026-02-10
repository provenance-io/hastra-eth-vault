import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { StakingVault, YieldVault, MockUSDC } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Branch Coverage Tests", function () {
  let yieldVault: YieldVault;
  let stakingVault: StakingVault;
  let usdc: MockUSDC;
  let admin: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let redeemVault: SignerWithAddress;

  beforeEach(async function () {
    [admin, user1, user2, redeemVault] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();

    // Deploy YieldVault
    const YieldVault = await ethers.getContractFactory("YieldVault");
    yieldVault = (await upgrades.deployProxy(YieldVault, [
      await usdc.getAddress(),
      "Wrapped YLDS",
      "wYLDS",
      admin.address,
      redeemVault.address,
      admin.address,
    ])) as unknown as YieldVault;

    // Deploy StakingVault
    const StakingVault = await ethers.getContractFactory("StakingVault");
    stakingVault = (await upgrades.deployProxy(StakingVault, [
      await yieldVault.getAddress(),
      "Prime Staked YLDS",
      "PRIME",
      admin.address,
      await yieldVault.getAddress(),
    ])) as unknown as StakingVault;
  });

  describe("StakingVault - Initialize Error Branches", function () {
    it("should revert when admin is zero address", async function () {
      const StakingVault = await ethers.getContractFactory("StakingVault");
      await expect(
        upgrades.deployProxy(StakingVault, [
          await yieldVault.getAddress(),
          "Prime Staked YLDS",
          "PRIME",
          ethers.ZeroAddress,
          await yieldVault.getAddress(),
        ])
      ).to.be.revertedWithCustomError(stakingVault, "InvalidAddress");
    });

    it("should revert when yieldVault is zero address", async function () {
      const StakingVault = await ethers.getContractFactory("StakingVault");
      await expect(
        upgrades.deployProxy(StakingVault, [
          await yieldVault.getAddress(),
          "Prime Staked YLDS",
          "PRIME",
          admin.address,
          ethers.ZeroAddress,
        ])
      ).to.be.revertedWithCustomError(stakingVault, "InvalidAddress");
    });
  });

  describe("StakingVault - Freeze Error Branches", function () {
    it("should revert when trying to freeze already frozen account", async function () {
      const FREEZE_ADMIN_ROLE = await stakingVault.FREEZE_ADMIN_ROLE();
      await stakingVault.grantRole(FREEZE_ADMIN_ROLE, admin.address);

      await stakingVault.freezeAccount(user1.address);
      await expect(stakingVault.freezeAccount(user1.address))
        .to.be.revertedWithCustomError(stakingVault, "AccountIsFrozen");
    });

    it("should revert when trying to thaw non-frozen account", async function () {
      const FREEZE_ADMIN_ROLE = await stakingVault.FREEZE_ADMIN_ROLE();
      await stakingVault.grantRole(FREEZE_ADMIN_ROLE, admin.address);

      await expect(stakingVault.thawAccount(user1.address))
        .to.be.revertedWithCustomError(stakingVault, "AccountNotFrozen");
    });
  });

  describe("StakingVault - Admin Function Error Branches", function () {
    it("should revert setYieldVault with zero address", async function () {
      await expect(stakingVault.setYieldVault(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(stakingVault, "InvalidAddress");
    });
  });

  describe("YieldVault - Initialize Error Branches", function () {
    it("should revert when admin is zero address", async function () {
      const YieldVault = await ethers.getContractFactory("YieldVault");
      await expect(
        upgrades.deployProxy(YieldVault, [
          await usdc.getAddress(),
          "Wrapped YLDS",
          "wYLDS",
          ethers.ZeroAddress,
          redeemVault.address,
          admin.address,
        ])
      ).to.be.revertedWithCustomError(yieldVault, "InvalidAddress");
    });

    it("should revert when redeemVault is zero address", async function () {
      const YieldVault = await ethers.getContractFactory("YieldVault");
      await expect(
        upgrades.deployProxy(YieldVault, [
          await usdc.getAddress(),
          "Wrapped YLDS",
          "wYLDS",
          admin.address,
          ethers.ZeroAddress,
          admin.address,
        ])
      ).to.be.revertedWithCustomError(yieldVault, "InvalidAddress");
    });
  });

  describe("YieldVault - Freeze Error Branches", function () {
    it("should revert when trying to freeze already frozen account", async function () {
      const FREEZE_ADMIN_ROLE = await yieldVault.FREEZE_ADMIN_ROLE();
      await yieldVault.grantRole(FREEZE_ADMIN_ROLE, admin.address);

      await yieldVault.freezeAccount(user1.address);
      await expect(yieldVault.freezeAccount(user1.address))
        .to.be.revertedWithCustomError(yieldVault, "AccountIsFrozen");
    });

    it("should revert when trying to thaw non-frozen account", async function () {
      const FREEZE_ADMIN_ROLE = await yieldVault.FREEZE_ADMIN_ROLE();
      await yieldVault.grantRole(FREEZE_ADMIN_ROLE, admin.address);

      await expect(yieldVault.thawAccount(user1.address))
        .to.be.revertedWithCustomError(yieldVault, "AccountNotFrozen");
    });
  });

  describe("YieldVault - Rewards Error Branches", function () {
    it("should revert createRewardsEpoch with zero merkle root", async function () {
      const REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
      await yieldVault.grantRole(REWARDS_ADMIN_ROLE, admin.address);

      await expect(
        yieldVault.createRewardsEpoch(0, ethers.ZeroHash, 1000)
      ).to.be.revertedWithCustomError(yieldVault, "InvalidAmount");
    });

    it("should revert mintRewards with zero amount", async function () {
      const REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
      await yieldVault.grantRole(REWARDS_ADMIN_ROLE, admin.address);

      await expect(
        yieldVault.mintRewards(user1.address, 0)
      ).to.be.revertedWithCustomError(yieldVault, "InvalidAmount");
    });

    it("should revert mintRewards with zero address", async function () {
      const REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
      await yieldVault.grantRole(REWARDS_ADMIN_ROLE, admin.address);

      await expect(
        yieldVault.mintRewards(ethers.ZeroAddress, 1000)
      ).to.be.revertedWithCustomError(yieldVault, "InvalidAddress");
    });
  });

  describe("YieldVault - Admin Function Error Branches", function () {
    it("should revert setRedeemVault with zero address", async function () {
      await expect(yieldVault.setRedeemVault(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(yieldVault, "InvalidAddress");
    });
  });

  describe("YieldVault - Whitelist Error Branches", function () {
    it("should revert addToWhitelist with zero address", async function () {
      const WHITELIST_ADMIN_ROLE = await yieldVault.WHITELIST_ADMIN_ROLE();
      await yieldVault.grantRole(WHITELIST_ADMIN_ROLE, admin.address);

      await expect(yieldVault.addToWhitelist(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(yieldVault, "InvalidAddress");
    });

    it("should revert when adding already whitelisted address", async function () {
      const WHITELIST_ADMIN_ROLE = await yieldVault.WHITELIST_ADMIN_ROLE();
      await yieldVault.grantRole(WHITELIST_ADMIN_ROLE, admin.address);

      await yieldVault.addToWhitelist(user1.address);
      await expect(yieldVault.addToWhitelist(user1.address))
        .to.be.revertedWithCustomError(yieldVault, "AddressAlreadyWhitelisted");
    });

    it("should revert when removing non-whitelisted address", async function () {
      const WHITELIST_ADMIN_ROLE = await yieldVault.WHITELIST_ADMIN_ROLE();
      await yieldVault.grantRole(WHITELIST_ADMIN_ROLE, admin.address);

      await expect(yieldVault.removeFromWhitelist(user1.address))
        .to.be.revertedWithCustomError(yieldVault, "AddressNotInWhitelist");
    });

    it("should revert when removing last whitelisted address", async function () {
      const WHITELIST_ADMIN_ROLE = await yieldVault.WHITELIST_ADMIN_ROLE();
      await yieldVault.grantRole(WHITELIST_ADMIN_ROLE, admin.address);

      // Admin is already whitelisted from initialization
      await expect(yieldVault.removeFromWhitelist(admin.address))
        .to.be.revertedWithCustomError(yieldVault, "CannotRemoveLastWhitelistedAddress");
    });
  });

  describe("YieldVault - withdrawUSDC Error Branches", function () {
    it("should revert withdrawUSDC with zero address", async function () {
      const WITHDRAWAL_ADMIN_ROLE = await yieldVault.WITHDRAWAL_ADMIN_ROLE();
      await yieldVault.grantRole(WITHDRAWAL_ADMIN_ROLE, admin.address);

      await expect(yieldVault.withdrawUSDC(ethers.ZeroAddress, 1000))
        .to.be.revertedWithCustomError(yieldVault, "InvalidAddress");
    });

    it("should revert withdrawUSDC with zero amount", async function () {
      const WITHDRAWAL_ADMIN_ROLE = await yieldVault.WITHDRAWAL_ADMIN_ROLE();
      await yieldVault.grantRole(WITHDRAWAL_ADMIN_ROLE, admin.address);

      await expect(yieldVault.withdrawUSDC(admin.address, 0))
        .to.be.revertedWithCustomError(yieldVault, "InvalidAmount");
    });

    it("should revert withdrawUSDC to non-whitelisted address", async function () {
      const WITHDRAWAL_ADMIN_ROLE = await yieldVault.WITHDRAWAL_ADMIN_ROLE();
      await yieldVault.grantRole(WITHDRAWAL_ADMIN_ROLE, admin.address);

      await expect(yieldVault.withdrawUSDC(user1.address, 1000))
        .to.be.revertedWithCustomError(yieldVault, "AddressNotWhitelisted");
    });
  });

  describe("YieldVault - Redemption Error Branches", function () {
    it("should revert requestRedeem with zero shares", async function () {
      await expect(yieldVault.connect(user1).requestRedeem(0))
        .to.be.revertedWithCustomError(yieldVault, "InvalidAmount");
    });

    it("should revert completeRedeem when no redemption pending", async function () {
      const REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
      await yieldVault.grantRole(REWARDS_ADMIN_ROLE, admin.address);

      await expect(yieldVault.completeRedeem(user1.address))
        .to.be.revertedWithCustomError(yieldVault, "NoRedemptionPending");
    });

    it("should revert cancelRedeem when no redemption pending", async function () {
      await expect(yieldVault.connect(user1).cancelRedeem())
        .to.be.revertedWithCustomError(yieldVault, "NoRedemptionPending");
    });
  });

  describe("StakingVault - distributeRewards Error Branch", function () {
    it("should revert distributeRewards with zero amount", async function () {
      const REWARDS_ADMIN_ROLE = await stakingVault.REWARDS_ADMIN_ROLE();
      await stakingVault.grantRole(REWARDS_ADMIN_ROLE, admin.address);

      await expect(stakingVault.distributeRewards(0))
        .to.be.revertedWithCustomError(stakingVault, "InvalidAmount");
    });
  });

  describe("YieldVault - Epoch Error Branches", function () {
    it("should revert claimRewards with invalid epoch", async function () {
      await expect(
        yieldVault.connect(user1).claimRewards(999, 1000, [])
      ).to.be.revertedWithCustomError(yieldVault, "InvalidEpoch");
    });
  });

  describe("StakingVault - Pause Modifiers", function () {
    it("should prevent deposit when paused", async function () {
      const PAUSER_ROLE = await stakingVault.PAUSER_ROLE();
      await stakingVault.grantRole(PAUSER_ROLE, admin.address);

      await stakingVault.pause();
      await expect(stakingVault.deposit(1000, user1.address))
        .to.be.revertedWithCustomError(stakingVault, "EnforcedPause");
    });

    it("should prevent mint when paused", async function () {
      const PAUSER_ROLE = await stakingVault.PAUSER_ROLE();
      await stakingVault.grantRole(PAUSER_ROLE, admin.address);

      await stakingVault.pause();
      await expect(stakingVault.mint(1000, user1.address))
        .to.be.revertedWithCustomError(stakingVault, "EnforcedPause");
    });

    it("should prevent redeem when paused", async function () {
      const PAUSER_ROLE = await stakingVault.PAUSER_ROLE();
      await stakingVault.grantRole(PAUSER_ROLE, admin.address);

      await stakingVault.pause();
      await expect(stakingVault.redeem(1000, user1.address, user1.address))
        .to.be.revertedWithCustomError(stakingVault, "EnforcedPause");
    });

    it("should prevent withdraw when paused", async function () {
      const PAUSER_ROLE = await stakingVault.PAUSER_ROLE();
      await stakingVault.grantRole(PAUSER_ROLE, admin.address);

      await stakingVault.pause();
      await expect(stakingVault.withdraw(1000, user1.address, user1.address))
        .to.be.revertedWithCustomError(stakingVault, "EnforcedPause");
    });

    it("should prevent depositWithPermit when paused", async function () {
      const PAUSER_ROLE = await stakingVault.PAUSER_ROLE();
      await stakingVault.grantRole(PAUSER_ROLE, admin.address);

      await stakingVault.pause();
      await expect(
        stakingVault.depositWithPermit(1000, user1.address, 999999999, 27, ethers.ZeroHash, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(stakingVault, "EnforcedPause");
    });
  });

  describe("YieldVault - Pause Modifiers", function () {
    it("should prevent deposit when paused", async function () {
      const PAUSER_ROLE = await yieldVault.PAUSER_ROLE();
      await yieldVault.grantRole(PAUSER_ROLE, admin.address);

      await yieldVault.pause();
      await expect(yieldVault.deposit(1000, user1.address))
        .to.be.revertedWithCustomError(yieldVault, "EnforcedPause");
    });

    it("should prevent mint when paused", async function () {
      const PAUSER_ROLE = await yieldVault.PAUSER_ROLE();
      await yieldVault.grantRole(PAUSER_ROLE, admin.address);

      await yieldVault.pause();
      await expect(yieldVault.mint(1000, user1.address))
        .to.be.revertedWithCustomError(yieldVault, "EnforcedPause");
    });

    it("should prevent requestRedeem when paused", async function () {
      const PAUSER_ROLE = await yieldVault.PAUSER_ROLE();
      await yieldVault.grantRole(PAUSER_ROLE, admin.address);

      await yieldVault.pause();
      await expect(yieldVault.connect(user1).requestRedeem(1000))
        .to.be.revertedWithCustomError(yieldVault, "EnforcedPause");
    });

    it("should prevent depositWithPermit when paused", async function () {
      const PAUSER_ROLE = await yieldVault.PAUSER_ROLE();
      await yieldVault.grantRole(PAUSER_ROLE, admin.address);

      await yieldVault.pause();
      await expect(
        yieldVault.depositWithPermit(1000, user1.address, 999999999, 27, ethers.ZeroHash, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(yieldVault, "EnforcedPause");
    });

    it("should prevent claimRewards when paused", async function () {
      const PAUSER_ROLE = await yieldVault.PAUSER_ROLE();
      await yieldVault.grantRole(PAUSER_ROLE, admin.address);

      await yieldVault.pause();
      await expect(yieldVault.connect(user1).claimRewards(0, 1000, []))
        .to.be.revertedWithCustomError(yieldVault, "EnforcedPause");
    });
  });

  describe("YieldVault - Role-Based Access Control", function () {
    it("should prevent non-REWARDS_ADMIN from calling completeRedeem", async function () {
      await expect(yieldVault.connect(user1).completeRedeem(user2.address))
        .to.be.reverted;
    });

    it("should prevent non-REWARDS_ADMIN from calling createRewardsEpoch", async function () {
      await expect(yieldVault.connect(user1).createRewardsEpoch(0, ethers.id("test"), 1000))
        .to.be.reverted;
    });

    it("should prevent non-REWARDS_ADMIN from calling mintRewards", async function () {
      await expect(yieldVault.connect(user1).mintRewards(user1.address, 1000))
        .to.be.reverted;
    });

    it("should prevent non-FREEZE_ADMIN from freezing account", async function () {
      await expect(yieldVault.connect(user1).freezeAccount(user2.address))
        .to.be.reverted;
    });

    it("should prevent non-WHITELIST_ADMIN from adding to whitelist", async function () {
      await expect(yieldVault.connect(user1).addToWhitelist(user2.address))
        .to.be.reverted;
    });

    it("should prevent non-WITHDRAWAL_ADMIN from withdrawing USDC", async function () {
      await expect(yieldVault.connect(user1).withdrawUSDC(admin.address, 1000))
        .to.be.reverted;
    });

    it("should prevent non-PAUSER from pausing", async function () {
      await expect(yieldVault.connect(user1).pause())
        .to.be.reverted;
    });

    it("should prevent non-UPGRADER from upgrading", async function () {
      const YieldVaultV2 = await ethers.getContractFactory("YieldVaultV2");
      const newImpl = await YieldVaultV2.deploy();
      const yieldVaultAddress = await yieldVault.getAddress();
      
      await expect(
        upgrades.upgradeProxy(yieldVaultAddress, YieldVaultV2.connect(user1))
      ).to.be.reverted;
    });
  });

  describe("StakingVault - Role-Based Access Control", function () {
    it("should prevent non-REWARDS_ADMIN from distributing rewards", async function () {
      await expect(stakingVault.connect(user1).distributeRewards(1000))
        .to.be.reverted;
    });

    it("should prevent non-FREEZE_ADMIN from freezing account", async function () {
      await expect(stakingVault.connect(user1).freezeAccount(user2.address))
        .to.be.reverted;
    });

    it("should prevent non-PAUSER from pausing", async function () {
      await expect(stakingVault.connect(user1).pause())
        .to.be.reverted;
    });

    it("should prevent non-UPGRADER from upgrading", async function () {
      const StakingVaultV2 = await ethers.getContractFactory("StakingVaultV2");
      const newImpl = await StakingVaultV2.deploy();
      const stakingVaultAddress = await stakingVault.getAddress();
      
      await expect(
        upgrades.upgradeProxy(stakingVaultAddress, StakingVaultV2.connect(user1))
      ).to.be.reverted;
    });

    it("should prevent non-DEFAULT_ADMIN from setting yield vault", async function () {
      await expect(stakingVault.connect(user1).setYieldVault(user2.address))
        .to.be.reverted;
    });
  });

  describe("YieldVault - Redemption Additional Branches", function () {
    it("should revert requestRedeem when already has pending redemption", async function () {
      // Setup: mint some shares first
      await usdc.mint(user1.address, 2000);
      await usdc.connect(user1).approve(await yieldVault.getAddress(), 2000);
      await yieldVault.connect(user1).deposit(2000, user1.address);

      // Request first redemption
      await yieldVault.connect(user1).requestRedeem(1000);

      // Try to request another redemption
      await expect(yieldVault.connect(user1).requestRedeem(500))
        .to.be.revertedWithCustomError(yieldVault, "RedemptionAlreadyPending");
    });

    it("should revert completeRedeem when vault has insufficient balance", async function () {
      const REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
      await yieldVault.grantRole(REWARDS_ADMIN_ROLE, admin.address);

      // Setup: mint shares and request redemption
      await usdc.mint(user1.address, 1000);
      await usdc.connect(user1).approve(await yieldVault.getAddress(), 1000);
      await yieldVault.connect(user1).deposit(1000, user1.address);
      await yieldVault.connect(user1).requestRedeem(1000);

      // Complete should fail because redeemVault has no USDC
      await expect(yieldVault.completeRedeem(user1.address))
        .to.be.revertedWithCustomError(yieldVault, "InsufficientVaultBalance");
    });
  });

  describe("YieldVault - Whitelist Array Loop Coverage", function () {
    it("should cover removeFromWhitelist loop when address is in middle", async function () {
      const WHITELIST_ADMIN_ROLE = await yieldVault.WHITELIST_ADMIN_ROLE();
      await yieldVault.grantRole(WHITELIST_ADMIN_ROLE, admin.address);

      // Add multiple addresses
      await yieldVault.addToWhitelist(user1.address);
      await yieldVault.addToWhitelist(user2.address);

      // Remove the first one (admin) - this tests the loop
      await expect(yieldVault.removeFromWhitelist(admin.address))
        .to.emit(yieldVault, "AddressRemovedFromWhitelist")
        .withArgs(admin.address);
    });
  });

  describe("YieldVault - withdrawUSDC Additional Coverage", function () {
    it("should revert withdrawUSDC when vault balance is insufficient", async function () {
      const WITHDRAWAL_ADMIN_ROLE = await yieldVault.WITHDRAWAL_ADMIN_ROLE();
      await yieldVault.grantRole(WITHDRAWAL_ADMIN_ROLE, admin.address);

      // Vault has no USDC, but admin is whitelisted
      await expect(yieldVault.withdrawUSDC(admin.address, 1000))
        .to.be.revertedWithCustomError(yieldVault, "InsufficientVaultBalance");
    });
  });

  describe("StakingVault - Unpause Coverage", function () {
    it("should allow unpausing after pause", async function () {
      const PAUSER_ROLE = await stakingVault.PAUSER_ROLE();
      await stakingVault.grantRole(PAUSER_ROLE, admin.address);
      const REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
      await yieldVault.grantRole(REWARDS_ADMIN_ROLE, admin.address);

      await stakingVault.pause();
      await stakingVault.unpause();

      // Should work after unpause - mint wYLDS to user and deposit in staking vault
      await yieldVault.mintRewards(user1.address, 1000);
      await yieldVault.connect(user1).approve(await stakingVault.getAddress(), 1000);
      await expect(stakingVault.connect(user1).deposit(1000, user1.address))
        .to.not.be.reverted;
    });
  });

  describe("YieldVault - Additional OR Condition Coverage", function () {
    it("should handle initialization with null initial whitelist", async function () {
      const YieldVault = await ethers.getContractFactory("YieldVault");
      const vault2 = (await upgrades.deployProxy(YieldVault, [
        await usdc.getAddress(),
        "Wrapped YLDS 2",
        "wYLDS2",
        admin.address,
        redeemVault.address,
        ethers.ZeroAddress, // null initial whitelist
      ])) as unknown as YieldVault;

      expect(await vault2.getWhitelistCount()).to.equal(0);
    });
  });
});
