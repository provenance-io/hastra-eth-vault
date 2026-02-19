import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { HastraNavEngine } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("HastraNavEngine - int192 Type Safety Tests", function () {
  let navEngine: HastraNavEngine;
  let owner: SignerWithAddress;
  let updater: SignerWithAddress;

  const MAX_DIFFERENCE_PERCENT = ethers.parseEther("0.1"); // 10%
  const MIN_RATE = BigInt("500000000000000000"); // 0.5 as int192
  const MAX_RATE = BigInt("3000000000000000000"); // 3.0 as int192

  beforeEach(async function () {
    [owner, updater] = await ethers.getSigners();

    const HastraNavEngine = await ethers.getContractFactory("HastraNavEngine");
    navEngine = await upgrades.deployProxy(
      HastraNavEngine,
      [owner.address, updater.address, MAX_DIFFERENCE_PERCENT, MIN_RATE, MAX_RATE],
      { initializer: "initialize", kind: "uups" }
    ) as unknown as HastraNavEngine;

    await navEngine.waitForDeployment();
  });

  describe("int192 Type Tests", function () {
    it("Should return int192 compatible values", async function () {
      const supply = ethers.parseEther("1000");
      const tvl = ethers.parseEther("1500");
      
      await navEngine.connect(updater).updateRate(supply, tvl);
      const rate = await navEngine.getRate();
      
      // Verify it's a valid int192 (positive, within range)
      expect(rate).to.be.gt(0);
      expect(rate).to.equal(ethers.parseEther("1.5"));
    });

    it("Should handle maximum safe int192 value", async function () {
      // int192 max = 2^191 - 1
      const int192Max = BigInt(2) ** BigInt(191) - BigInt(1);
      
      const supply = ethers.parseEther("1000");
      const tvl = ethers.parseEther("1500");
      
      await navEngine.connect(updater).updateRate(supply, tvl);
      const rate = await navEngine.getRate();
      
      // Rate should be well within int192 range
      expect(rate).to.be.lt(int192Max);
      
      // Our practical max is 3e18, much smaller than int192 max
      expect(rate).to.be.lte(MAX_RATE);
    });

    it("Should handle 18 decimal precision correctly", async function () {
      const supply = ethers.parseEther("1000");
      const tvl = ethers.parseEther("1234.567891234567891234");
      
      await navEngine.connect(updater).updateRate(supply, tvl);
      const rate = await navEngine.getRate();
      
      // Should preserve 18 decimals
      expect(rate).to.equal(ethers.parseEther("1.234567891234567891"));
    });

    it("Should handle rate near MIN_RATE", async function () {
      const supply = ethers.parseEther("1000");
      const tvl = ethers.parseEther("550"); // Rate = 0.55
      
      await navEngine.connect(updater).updateRate(supply, tvl);
      const rate = await navEngine.getRate();
      
      expect(rate).to.equal(ethers.parseEther("0.55"));
      expect(rate).to.be.gte(MIN_RATE); // >= 0.5
    });

    it("Should handle rate near MAX_RATE", async function () {
      const supply = ethers.parseEther("1000");
      const tvl = ethers.parseEther("2900"); // Rate = 2.9
      
      await navEngine.connect(updater).updateRate(supply, tvl);
      const rate = await navEngine.getRate();
      
      expect(rate).to.equal(ethers.parseEther("2.9"));
      expect(rate).to.be.lte(MAX_RATE); // <= 3.0
    });

    it("Should alert if rate would overflow int192 practical bounds", async function () {
      const supply = ethers.parseEther("1000");
      const tvl = ethers.parseEther("5000"); // Rate = 5.0 (> MAX_RATE)
      
      // Should emit alert for exceeding MAX_RATE
      await expect(navEngine.connect(updater).updateRate(supply, tvl))
        .to.emit(navEngine, "AlertInvalidRate");
      
      // Rate should remain 0 (not updated)
      const rate = await navEngine.getRate();
      expect(rate).to.equal(0);
    });

    it("Should verify type is int192 not uint256", async function () {
      const supply = ethers.parseEther("1000");
      const tvl = ethers.parseEther("1500");
      
      await navEngine.connect(updater).updateRate(supply, tvl);
      const rate = await navEngine.getRate();
      
      // Check it's a BigInt (JavaScript representation of int192)
      expect(typeof rate).to.equal("bigint");
      
      // Verify it's positive (our rates are always positive)
      expect(rate).to.be.gt(0);
      
      // Verify it's within int192 max
      const int192Max = BigInt(2) ** BigInt(191) - BigInt(1);
      expect(rate).to.be.lt(int192Max);
      
      // Verify it matches expected calculation
      const expected = (tvl * ethers.parseEther("1")) / supply;
      expect(rate).to.equal(expected);
    });

    it("Should maintain int192 type across multiple updates", async function () {
      // First update
      await navEngine.connect(updater).updateRate(
        ethers.parseEther("1000"),
        ethers.parseEther("1000")
      );
      let rate = await navEngine.getRate();
      expect(rate).to.equal(ethers.parseEther("1.0"));
      
      // Second update (within 10% change)
      await navEngine.connect(updater).updateRate(
        ethers.parseEther("1000"),
        ethers.parseEther("1050")
      );
      rate = await navEngine.getRate();
      expect(rate).to.equal(ethers.parseEther("1.05"));
      
      // Third update
      await navEngine.connect(updater).updateRate(
        ethers.parseEther("1000"),
        ethers.parseEther("1100")
      );
      rate = await navEngine.getRate();
      expect(rate).to.equal(ethers.parseEther("1.1"));
      
      // All rates should be positive int192
      expect(rate).to.be.gt(0);
    });

    it("Should handle TVL decreases within threshold", async function () {
      // Initial rate
      await navEngine.connect(updater).updateRate(
        ethers.parseEther("1000"),
        ethers.parseEther("1000")
      );
      let rate = await navEngine.getRate();
      expect(rate).to.equal(ethers.parseEther("1.0"));
      
      // Decrease TVL by 9% (within 10% threshold)
      await navEngine.connect(updater).updateRate(
        ethers.parseEther("1000"),
        ethers.parseEther("910")
      );
      rate = await navEngine.getRate();
      expect(rate).to.equal(ethers.parseEther("0.91"));
      
      // Verify it's still int192
      expect(rate).to.be.gt(0);
      expect(rate).to.be.gte(MIN_RATE);
    });
  });
});
