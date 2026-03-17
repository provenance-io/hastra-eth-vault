import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { HastraNavEngine } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("HastraNavEngine", function () {
  let navEngine: HastraNavEngine;
  let owner: SignerWithAddress;
  let updater: SignerWithAddress;
  let user: SignerWithAddress;

  const MAX_DIFFERENCE_PERCENT = ethers.parseEther("0.1"); // 10%
  const MIN_RATE = BigInt("500000000000000000"); // 0.5 as int192
  const MAX_RATE = BigInt("3000000000000000000"); // 3.0 as int192
  const RATE_PRECISION = ethers.parseEther("1");

  beforeEach(async function () {
    [owner, updater, user] = await ethers.getSigners();

    const HastraNavEngine = await ethers.getContractFactory("HastraNavEngine");
    navEngine = await upgrades.deployProxy(
      HastraNavEngine,
      [owner.address, updater.address, MAX_DIFFERENCE_PERCENT, MIN_RATE, MAX_RATE],
      { initializer: "initialize", kind: "uups" }
    ) as unknown as HastraNavEngine;

    await navEngine.waitForDeployment();
  });

  describe("Initialization", function () {
    it("Should set correct owner", async function () {
      expect(await navEngine.owner()).to.equal(owner.address);
    });

    it("Should set correct updater", async function () {
      expect(await navEngine.getUpdater()).to.equal(updater.address);
    });

    it("Should set correct bounds", async function () {
      expect(await navEngine.getMinRate()).to.equal(MIN_RATE);
      expect(await navEngine.getMaxRate()).to.equal(MAX_RATE);
    });

    it("Should set correct max difference percent", async function () {
      expect(await navEngine.getMaxDifferencePercent()).to.equal(MAX_DIFFERENCE_PERCENT);
    });

    it("Should prevent re-initialization", async function () {
      // Try to initialize again - should revert
      await expect(
        navEngine.initialize(
          owner.address,
          updater.address,
          MAX_DIFFERENCE_PERCENT,
          MIN_RATE,
          MAX_RATE
        )
      ).to.be.revertedWithCustomError(navEngine, "InvalidInitialization");
    });
  });

  describe("Update Rate", function () {
    const totalSupply = ethers.parseEther("1000"); // 1000 shares
    const totalTVL = ethers.parseEther("1500"); // 1500 ETH
    const expectedRate = BigInt("1500000000000000000"); // 1.5

    it("Should update rate successfully", async function () {
      const tx = await navEngine.connect(updater).updateRate(totalSupply, totalTVL);
      await expect(tx)
        .to.emit(navEngine, "RateUpdated")
        .withArgs(expectedRate, totalSupply, totalTVL, await ethers.provider.getBlock("latest").then(b => b?.timestamp));

      expect(await navEngine.getRate()).to.equal(expectedRate);
      expect(await navEngine.getLatestTotalSupply()).to.equal(totalSupply);
      expect(await navEngine.getLatestTVL()).to.equal(totalTVL);
    });

    it("Should return int192 type (Schema v7 compliant)", async function () {
      await navEngine.connect(updater).updateRate(totalSupply, totalTVL);
      const rate = await navEngine.getRate();
      
      // Verify it's int192 by checking it's in valid range
      expect(rate).to.be.gte(MIN_RATE);
      expect(rate).to.be.lte(MAX_RATE);
    });



    it("Should properly convert uint256 to int192", async function () {
      // Test boundary conversion
      const supply = ethers.parseEther("1");
      
      // Rate that should work (well within int192 range)
      const safeTVL = ethers.parseEther("2.5");
      await navEngine.connect(updater).updateRate(supply, safeTVL);
      const safeRate = await navEngine.getRate();
      
      // Verify it's positive and correct
      expect(safeRate).to.be.gt(0);
      expect(safeRate).to.equal(ethers.parseEther("2.5"));
      
      // Verify it's within int192 range
      // int192 max = 2^191 - 1
      const int192Max = BigInt(2) ** BigInt(191) - BigInt(1);
      expect(safeRate).to.be.lt(int192Max);
    });

    it("Should revert if calculated rate exceeds bounds", async function () {
      const supply = ethers.parseEther("1");
      const excessiveTVL = ethers.parseEther("5"); // rate = 5.0 > maxRate 3.0
      await expect(navEngine.connect(updater).updateRate(supply, excessiveTVL))
        .to.be.revertedWithCustomError(navEngine, "RateOutOfBounds");
    });

    it("Should revert if not updater", async function () {
      await expect(
        navEngine.connect(user).updateRate(totalSupply, totalTVL)
      ).to.be.revertedWith("Not updater");
    });

    it("Should revert if total supply is zero", async function () {
      await expect(
        navEngine.connect(updater).updateRate(0, totalTVL)
      ).to.be.revertedWithCustomError(navEngine, "TotalSupplyIsZero");
    });

    it("Should revert if TVL is zero", async function () {
      await navEngine.connect(updater).updateRate(totalSupply, totalTVL);
      await expect(navEngine.connect(updater).updateRate(totalSupply, 0))
        .to.be.revertedWithCustomError(navEngine, "TVLIsZero");
    });

    it("Should revert if rate below minRate", async function () {
      const lowTVL = ethers.parseEther("400"); // rate = 0.4 < minRate 0.5
      await expect(navEngine.connect(updater).updateRate(totalSupply, lowTVL))
        .to.be.revertedWithCustomError(navEngine, "RateOutOfBounds");
    });

    it("Should revert if rate above maxRate", async function () {
      const highTVL = ethers.parseEther("3500"); // rate = 3.5 > maxRate 3.0
      await expect(navEngine.connect(updater).updateRate(totalSupply, highTVL))
        .to.be.revertedWithCustomError(navEngine, "RateOutOfBounds");
    });

    it("Should revert if TVL changes too much", async function () {
      await navEngine.connect(updater).updateRate(totalSupply, totalTVL);
      const newTVL = ethers.parseEther("1700"); // ~13% increase > 10% maxDiff
      await expect(navEngine.connect(updater).updateRate(totalSupply, newTVL))
        .to.be.revertedWithCustomError(navEngine, "TVLDifferenceExceeded");
    });

    it("Should allow TVL change within threshold", async function () {
      // First update
      await navEngine.connect(updater).updateRate(totalSupply, totalTVL);

      // Second update with <10% TVL change
      const newTVL = ethers.parseEther("1620"); // ~8% increase
      const expectedNewRate = BigInt("1620000000000000000"); // 1.62
      
      await navEngine.connect(updater).updateRate(totalSupply, newTVL);
      
      expect(await navEngine.getRate()).to.equal(expectedNewRate);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to set new updater", async function () {
      await navEngine.connect(owner).setUpdater(user.address);
      expect(await navEngine.getUpdater()).to.equal(user.address);
    });

    it("Should not allow non-owner to set updater", async function () {
      await expect(
        navEngine.connect(user).setUpdater(user.address)
      ).to.be.revertedWithCustomError(navEngine, "OwnableUnauthorizedAccount");
    });

    it("Should revert when setting updater to zero address", async function () {
      await expect(
        navEngine.connect(owner).setUpdater(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid updater");
    });

    it("Should allow owner to update bounds", async function () {
      const newMin = BigInt("600000000000000000"); // 0.6
      const newMax = BigInt("2500000000000000000"); // 2.5

      await navEngine.connect(owner).setMinRate(newMin);
      await navEngine.connect(owner).setMaxRate(newMax);

      expect(await navEngine.getMinRate()).to.equal(newMin);
      expect(await navEngine.getMaxRate()).to.equal(newMax);
    });

    it("Should allow owner to pause and unpause", async function () {
      await navEngine.connect(owner).pause();
      
      await expect(
        navEngine.connect(updater).updateRate(ethers.parseEther("1000"), ethers.parseEther("1500"))
      ).to.be.revertedWithCustomError(navEngine, "EnforcedPause");

      await navEngine.connect(owner).unpause();
      
      await expect(
        navEngine.connect(updater).updateRate(ethers.parseEther("1000"), ethers.parseEther("1500"))
      ).to.not.be.reverted;
    });
  });

  describe("Access Control - Negative Tests", function () {
    let nonOwner: SignerWithAddress;
    let nonUpdater: SignerWithAddress;

    beforeEach(async function () {
      const signers = await ethers.getSigners();
      nonOwner = signers[3];
      nonUpdater = signers[4];
    });

    describe("onlyUpdater Functions", function () {
      it("Should revert when non-updater calls updateRate", async function () {
        await expect(
          navEngine.connect(nonUpdater).updateRate(
            ethers.parseEther("1000"),
            ethers.parseEther("1500")
          )
        ).to.be.revertedWith("Not updater");
      });

      it("Should revert when owner (not updater) calls updateRate", async function () {
        // Owner is different from updater in our setup
        await expect(
          navEngine.connect(owner).updateRate(
            ethers.parseEther("1000"),
            ethers.parseEther("1500")
          )
        ).to.be.revertedWith("Not updater");
      });
    });

    describe("onlyOwner Functions", function () {
      it("Should revert when non-owner calls setUpdater", async function () {
        await expect(
          navEngine.connect(nonOwner).setUpdater(nonOwner.address)
        ).to.be.revertedWithCustomError(navEngine, "OwnableUnauthorizedAccount");
      });

      it("Should revert when non-owner calls setMinRate", async function () {
        await expect(
          navEngine.connect(nonOwner).setMinRate(ethers.parseEther("0.6"))
        ).to.be.revertedWithCustomError(navEngine, "OwnableUnauthorizedAccount");
      });

      it("Should revert when non-owner calls setMaxRate", async function () {
        await expect(
          navEngine.connect(nonOwner).setMaxRate(ethers.parseEther("2.5"))
        ).to.be.revertedWithCustomError(navEngine, "OwnableUnauthorizedAccount");
      });

      it("Should revert when non-owner calls setMaxDifferencePercent", async function () {
        await expect(
          navEngine.connect(nonOwner).setMaxDifferencePercent(ethers.parseEther("0.2"))
        ).to.be.revertedWithCustomError(navEngine, "OwnableUnauthorizedAccount");
      });

      it("Should revert when non-owner calls pause", async function () {
        await expect(
          navEngine.connect(nonOwner).pause()
        ).to.be.revertedWithCustomError(navEngine, "OwnableUnauthorizedAccount");
      });

      it("Should revert when non-owner calls unpause", async function () {
        // First pause with owner
        await navEngine.connect(owner).pause();
        
        // Try to unpause with non-owner
        await expect(
          navEngine.connect(nonOwner).unpause()
        ).to.be.revertedWithCustomError(navEngine, "OwnableUnauthorizedAccount");
      });

      it("Should revert when updater (not owner) calls pause", async function () {
        await expect(
          navEngine.connect(updater).pause()
        ).to.be.revertedWithCustomError(navEngine, "OwnableUnauthorizedAccount");
      });

      it("Should revert when updater calls setMinRate", async function () {
        await expect(
          navEngine.connect(updater).setMinRate(ethers.parseEther("0.6"))
        ).to.be.revertedWithCustomError(navEngine, "OwnableUnauthorizedAccount");
      });

      it("Should revert when non-owner tries to upgrade", async function () {
        const HastraNavEngineV2 = await ethers.getContractFactory("HastraNavEngine");
        await expect(
          upgrades.upgradeProxy(await navEngine.getAddress(), HastraNavEngineV2.connect(nonOwner))
        ).to.be.reverted;
      });
    });
  });

  describe("View Functions", function () {
    it("Should return zero rate initially", async function () {
      expect(await navEngine.getRate()).to.equal(0);
    });

    it("Should return correct update time", async function () {
      const totalSupply = ethers.parseEther("1000");
      const totalTVL = ethers.parseEther("1500");

      await navEngine.connect(updater).updateRate(totalSupply, totalTVL);
      
      const latestBlock = await ethers.provider.getBlock("latest");
      expect(await navEngine.getLatestUpdateTime()).to.equal(latestBlock?.timestamp);
    });
  });

  describe("Upgradeability", function () {
    it("Should be upgradeable by owner", async function () {
      const HastraNavEngineV2 = await ethers.getContractFactory("HastraNavEngine");
      const upgraded = await upgrades.upgradeProxy(await navEngine.getAddress(), HastraNavEngineV2);
      
      expect(await upgraded.getAddress()).to.equal(await navEngine.getAddress());
    });

    it("Should preserve state after upgrade", async function () {
      const totalSupply = ethers.parseEther("1000");
      const totalTVL = ethers.parseEther("1500");
      
      await navEngine.connect(updater).updateRate(totalSupply, totalTVL);
      const rateBefore = await navEngine.getRate();

      const HastraNavEngineV2 = await ethers.getContractFactory("HastraNavEngine");
      const upgraded = await upgrades.upgradeProxy(await navEngine.getAddress(), HastraNavEngineV2) as unknown as HastraNavEngine;
      
      expect(await upgraded.getRate()).to.equal(rateBefore);
      expect(await upgraded.getUpdater()).to.equal(updater.address);
    });
  });
});
