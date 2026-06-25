import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { MockUSDC, YieldVault } from "../../typechain-types";

describe("YieldVault Upgradeability", function () {
  async function deployFixture() {
    const [owner] = await ethers.getSigners();
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy() as unknown as MockUSDC;
    
    const YieldVault = await ethers.getContractFactory("YieldVault");
    const yieldVault = await upgrades.deployProxy(YieldVault, [
      await usdc.getAddress(), "wYLDS", "wYLDS", owner.address, owner.address, ethers.ZeroAddress
    ], {   kind: 'uups' }) as unknown as YieldVault;
    
    return { yieldVault, owner };
  }

  it("Should upgrade implementation successfully", async function () {
    const { yieldVault, owner } = await loadFixture(deployFixture);
    
    const YieldVaultUpgradeMock = await ethers.getContractFactory("YieldVaultUpgradeMock");
    const yieldVaultV2 = await upgrades.upgradeProxy(await yieldVault.getAddress(), YieldVaultUpgradeMock);
    
    expect(await yieldVaultV2.version()).to.equal(3);
    expect(await yieldVaultV2.getAddress()).to.equal(await yieldVault.getAddress());
  });
});
