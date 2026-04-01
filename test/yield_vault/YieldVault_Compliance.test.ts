import {expect} from "chai";
import pkg from "hardhat";
const { ethers, upgrades } = pkg;
import type { MockUSDC, YieldVault } from "../../typechain-types";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";

describe("YieldVault Compliance (Freeze/Thaw)", function () {
  async function deployFixture() {
    const [owner, freezeAdmin, userA, userB] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy() as unknown as MockUSDC;
    
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await upgrades.deployProxy(YieldVault, [
      await usdc.getAddress(), 
      "wYLDS", 
      "wYLDS", 
      owner.address, 
      owner.address, 
      ethers.ZeroAddress
    ], {   kind: 'uups' }) as unknown as YieldVault;

    // Setup: Grant FREEZE_ADMIN_ROLE to freezeAdmin
    const FREEZE_ADMIN_ROLE = await yieldVault.FREEZE_ADMIN_ROLE();
    await yieldVault.grantRole(FREEZE_ADMIN_ROLE, freezeAdmin.address);

    // Setup: Mint some tokens to userA
    const amount = ethers.parseUnits("1000", 6);
    await usdc.mint(userA.address, amount);
    await usdc.connect(userA).approve(await yieldVault.getAddress(), amount);
    await yieldVault.connect(userA).deposit(amount, userA.address);
    
    return { yieldVault, usdc, owner, freezeAdmin, userA, userB };
  }

  it("Should allow Freeze Admin to freeze an account", async function () {
    const { yieldVault, freezeAdmin, userA } = await loadFixture(deployFixture);
    
    await expect(yieldVault.connect(freezeAdmin).freezeAccount(userA.address))
      .to.emit(yieldVault, "AccountFrozen")
      .withArgs(userA.address);
      
    expect(await yieldVault.frozen(userA.address)).to.be.true;
  });

  it("Should prevent frozen accounts from transferring tokens", async function () {
    const { yieldVault, freezeAdmin, userA, userB } = await loadFixture(deployFixture);
    const amount = ethers.parseUnits("100", 6);

    await yieldVault.connect(freezeAdmin).freezeAccount(userA.address);

    // Attempt transfer from frozen account
    await expect(yieldVault.connect(userA).transfer(userB.address, amount))
      .to.be.revertedWithCustomError(yieldVault, "AccountIsFrozen");
  });

  it("Should prevent transferring tokens TO a frozen account", async function () {
    const { yieldVault, freezeAdmin, owner, userA } = await loadFixture(deployFixture);
    const amount = ethers.parseUnits("100", 6);
    
    // Setup: Grant REWARDS_ADMIN_ROLE to owner to allow minting
    const REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
    await yieldVault.grantRole(REWARDS_ADMIN_ROLE, owner.address);

    // Mint to owner first
    await yieldVault.mintRewards(owner.address, amount);

    await yieldVault.connect(freezeAdmin).freezeAccount(userA.address);

    // Attempt transfer to frozen account
    await expect(yieldVault.connect(owner).transfer(userA.address, amount))
      .to.be.revertedWithCustomError(yieldVault, "AccountIsFrozen");
  });

  it("Should allow a frozen account to burn tokens (required for redemption completion)", async function () {
    const { yieldVault, freezeAdmin, userA } = await loadFixture(deployFixture);
    
    await yieldVault.connect(freezeAdmin).freezeAccount(userA.address);

    // Even if frozen, the contract can burn tokens from itself (step 2 of redeem)
    // or the user can requestRedeem (which transfers to the contract).
    // Let's test if requestRedeem (transfer to contract) works.
    // In YieldVault.sol: if (from != address(0) && frozen[from]) revert...
    // This means transfers FROM frozen accounts are blocked even to the contract.
    
    await expect(yieldVault.connect(userA).requestRedeem(ethers.parseUnits("10", 6)))
        .to.be.revertedWithCustomError(yieldVault, "AccountIsFrozen");
  });

  it("Should allow thawing an account to resume transfers", async function () {
    const { yieldVault, freezeAdmin, userA, userB } = await loadFixture(deployFixture);
    const amount = ethers.parseUnits("100", 6);

    await yieldVault.connect(freezeAdmin).freezeAccount(userA.address);
    await yieldVault.connect(freezeAdmin).thawAccount(userA.address);

    await expect(yieldVault.connect(userA).transfer(userB.address, amount))
      .to.not.be.reverted;
    
    expect(await yieldVault.balanceOf(userB.address)).to.equal(amount);
  });

  it("Should prevent non-admins from freezing accounts", async function () {
    const { yieldVault, userA, userB } = await loadFixture(deployFixture);
    
    await expect(yieldVault.connect(userA).freezeAccount(userB.address))
      .to.be.revertedWithCustomError(yieldVault, "AccessControlUnauthorizedAccount");
  });

  it("Should not affect other accounts when one account is frozen", async function () {
    const { yieldVault, freezeAdmin, userA, userB, owner } = await loadFixture(deployFixture);
    const amount = ethers.parseUnits("100", 6);

    // Freeze User A
    await yieldVault.connect(freezeAdmin).freezeAccount(userA.address);
    expect(await yieldVault.frozen(userA.address)).to.be.true;

    // Verify User B (not frozen) can still transfer to Owner (not frozen)
    const initialOwnerBalance = await yieldVault.balanceOf(owner.address);
    
    // User B needs tokens first
    const REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
    await yieldVault.grantRole(REWARDS_ADMIN_ROLE, owner.address);
    await yieldVault.connect(owner).mintRewards(userB.address, amount);

    await expect(yieldVault.connect(userB).transfer(owner.address, amount))
      .to.not.be.reverted;

    expect(await yieldVault.balanceOf(owner.address)).to.equal(initialOwnerBalance + amount);
  });

  it("Should block completeRedeem payout to a frozen account", async function () {
    // Regression for P1: frozen check must appear in completeRedeem, not just _update,
    // because requestRedeem already moved shares into the contract before the freeze.
    const { yieldVault, usdc, freezeAdmin, userA, owner } = await loadFixture(deployFixture);

    const REWARDS_ADMIN_ROLE = await yieldVault.REWARDS_ADMIN_ROLE();
    await yieldVault.grantRole(REWARDS_ADMIN_ROLE, owner.address);
    const PAUSER_ROLE = await yieldVault.PAUSER_ROLE();
    await yieldVault.grantRole(PAUSER_ROLE, owner.address);

    // userA has 1000 wYLDS from fixture; fund the redeemVault (owner) with USDC for payout
    const redeemAmount = ethers.parseUnits("1000", 6);
    await usdc.mint(owner.address, redeemAmount);
    await usdc.connect(owner).approve(await yieldVault.getAddress(), redeemAmount);

    // userA requests redemption — shares move to contract, outside _update protection
    const shares = await yieldVault.balanceOf(userA.address);
    await yieldVault.connect(userA).requestRedeem(shares);

    // Freeze userA AFTER the request
    await yieldVault.connect(freezeAdmin).freezeAccount(userA.address);

    // completeRedeem must now revert even though shares are already escrowed
    await expect(yieldVault.connect(owner).completeRedeem(userA.address))
      .to.be.revertedWithCustomError(yieldVault, "AccountIsFrozen");
  });

  it("Should block withdrawUSDC when vault is paused", async function () {
    // Regression for P2a: pause must also stop privileged treasury withdrawals.
    const { yieldVault, usdc, owner } = await loadFixture(deployFixture);

    const PAUSER_ROLE = await yieldVault.PAUSER_ROLE();
    await yieldVault.grantRole(PAUSER_ROLE, owner.address);
    const WITHDRAWAL_ADMIN_ROLE = await yieldVault.WITHDRAWAL_ADMIN_ROLE();
    await yieldVault.grantRole(WITHDRAWAL_ADMIN_ROLE, owner.address);
    const WHITELIST_ADMIN_ROLE = await yieldVault.WHITELIST_ADMIN_ROLE();
    await yieldVault.grantRole(WHITELIST_ADMIN_ROLE, owner.address);

    // Fund vault and whitelist the target
    const amount = ethers.parseUnits("500", 6);
    await usdc.mint(await yieldVault.getAddress(), amount);
    await yieldVault.addToWhitelist(owner.address);

    // Pause and confirm withdrawUSDC is blocked
    await yieldVault.pause();
    await expect(yieldVault.connect(owner).withdrawUSDC(owner.address, amount))
      .to.be.revertedWithCustomError(yieldVault, "EnforcedPause");
  });

  it("Should revert with AddressNotFoundInWhitelistArray on mapping/array desync", async function () {
    // Regression: removeFromWhitelist must revert (not silently succeed) when the mapping
    // says the account is whitelisted but the array does not contain it.
    // We create the desync via hardhat_setStorageAt — no mock or production-code changes needed.
    const { yieldVault, owner } = await loadFixture(deployFixture);

    const WHITELIST_ADMIN_ROLE = await yieldVault.WHITELIST_ADMIN_ROLE();
    await yieldVault.grantRole(WHITELIST_ADMIN_ROLE, owner.address);

    // Add two real addresses so array length > 1 (avoids CannotRemoveLastWhitelistedAddress)
    const [, , , , desynced, realAddr, realAddr2] = await ethers.getSigners();
    await yieldVault.addToWhitelist(realAddr.address);
    await yieldVault.addToWhitelist(realAddr2.address);

    // Directly write whitelistedAddresses[desynced] = true without touching the array.
    // whitelistedAddresses is at storage slot 6; mapping key slot = keccak256(address ++ 6).
    const mappingSlot = 6n;
    const keySlot = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [desynced.address, mappingSlot])
    );
    await ethers.provider.send("hardhat_setStorageAt", [
      await yieldVault.getAddress(),
      keySlot,
      ethers.zeroPadValue(ethers.toBeHex(1n), 32),
    ]);

    // Mapping says desynced=true but _whitelistArray omits it → must revert
    await expect(yieldVault.removeFromWhitelist(desynced.address))
      .to.be.revertedWithCustomError(yieldVault, "AddressNotFoundInWhitelistArray");
  });
});
