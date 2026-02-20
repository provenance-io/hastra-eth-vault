import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { YieldVault, MockUSDC } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * @title YieldVault 1:1 Conversion Invariant Tests
 * @notice Tests that convertToShares/convertToAssets ALWAYS returns 1:1,
 *         regardless of USDC being withdrawn or transferred in/out of the vault.
 *         
 *         This demonstrates that the vault PROMISES 1:1 redemptions even when
 *         the actual backing (totalAssets/totalSupply) may differ.
 */
describe("YieldVault - 1:1 Conversion Invariant", function () {
    let yieldVault: YieldVault;
    let usdc: MockUSDC;
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let redeemVault: SignerWithAddress;
    let withdrawalDestination: SignerWithAddress;

    const USDC_DECIMALS = 6;
    const INITIAL_USDC_SUPPLY = ethers.parseUnits("10000000", USDC_DECIMALS); // 10M USDC
    
    const REWARDS_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REWARDS_ADMIN"));
    const WITHDRAWAL_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WITHDRAWAL_ADMIN"));
    const WHITELIST_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WHITELIST_ADMIN"));

    beforeEach(async function () {
        [owner, user1, user2, redeemVault, withdrawalDestination] = await ethers.getSigners();

        // Deploy mock USDC
        const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
        usdc = await MockUSDCFactory.deploy();
        await usdc.waitForDeployment();

        // Mint USDC to users
        await usdc.mint(user1.address, INITIAL_USDC_SUPPLY);
        await usdc.mint(user2.address, INITIAL_USDC_SUPPLY);
        await usdc.mint(redeemVault.address, INITIAL_USDC_SUPPLY);

        // Deploy YieldVault as upgradeable proxy
        const YieldVaultFactory = await ethers.getContractFactory("YieldVault");
        yieldVault = await upgrades.deployProxy(
            YieldVaultFactory,
            [
                await usdc.getAddress(),
                "Wrapped Yield Secured",
                "wYLDS",
                owner.address,
                redeemVault.address,
                withdrawalDestination.address // Initial whitelist
            ],
            { kind: "uups" }
        ) as unknown as YieldVault;
        await yieldVault.waitForDeployment();

        // Grant roles
        await yieldVault.connect(owner).grantRole(REWARDS_ADMIN_ROLE, owner.address);
        await yieldVault.connect(owner).grantRole(WITHDRAWAL_ADMIN_ROLE, owner.address);
        await yieldVault.connect(owner).grantRole(WHITELIST_ADMIN_ROLE, owner.address);
    });

    describe("1:1 Conversion Invariant - Complex Scenario", function () {
        it("should maintain 1:1 conversion regardless of USDC movements in/out", async function () {
            const depositAmount1 = ethers.parseUnits("1000000", USDC_DECIMALS); // 1M USDC
            const depositAmount2 = ethers.parseUnits("500000", USDC_DECIMALS);  // 500k USDC
            const withdrawAmount = ethers.parseUnits("200000", USDC_DECIMALS);  // 200k USDC
            const directTransfer = ethers.parseUnits("50000", USDC_DECIMALS);   // 50k USDC

            console.log("\n=== INITIAL STATE ===");
            console.log("User1 USDC:", ethers.formatUnits(depositAmount1, USDC_DECIMALS));
            console.log("User2 USDC:", ethers.formatUnits(depositAmount2, USDC_DECIMALS));

            // ========================================
            // STEP 1: User1 deposits 1M USDC
            // ========================================
            await usdc.connect(user1).approve(await yieldVault.getAddress(), depositAmount1);
            await yieldVault.connect(user1).deposit(depositAmount1, user1.address);

            const user1Shares = await yieldVault.balanceOf(user1.address);
            expect(user1Shares).to.equal(depositAmount1, "User1 should receive 1:1 wYLDS");

            console.log("\n=== AFTER USER1 DEPOSIT ===");
            console.log("User1 wYLDS:", ethers.formatUnits(user1Shares, USDC_DECIMALS));
            console.log("Vault totalSupply:", ethers.formatUnits(await yieldVault.totalSupply(), USDC_DECIMALS));
            console.log("Vault totalAssets:", ethers.formatUnits(await yieldVault.totalAssets(), USDC_DECIMALS));

            // Verify 1:1 conversion functions
            expect(await yieldVault.convertToShares(depositAmount1))
                .to.equal(depositAmount1, "convertToShares should be 1:1");
            expect(await yieldVault.convertToAssets(depositAmount1))
                .to.equal(depositAmount1, "convertToAssets should be 1:1");

            // ========================================
            // STEP 2: Withdraw 200k USDC (treasury management)
            // ========================================
            await yieldVault.connect(owner).withdrawUSDC(withdrawalDestination.address, withdrawAmount);

            const totalSupplyAfterWithdraw = await yieldVault.totalSupply();
            const totalAssetsAfterWithdraw = await yieldVault.totalAssets();
            
            console.log("\n=== AFTER 200k USDC WITHDRAWAL ===");
            console.log("Vault totalSupply:", ethers.formatUnits(totalSupplyAfterWithdraw, USDC_DECIMALS));
            console.log("Vault totalAssets:", ethers.formatUnits(totalAssetsAfterWithdraw, USDC_DECIMALS));
            console.log("Actual ratio:", (Number(totalAssetsAfterWithdraw) / Number(totalSupplyAfterWithdraw)).toFixed(6));

            // ⚠️ CRITICAL: Vault is now undercollateralized
            expect(totalAssetsAfterWithdraw).to.be.lt(totalSupplyAfterWithdraw, 
                "Vault should be undercollateralized after withdrawal");

            // ✅ BUT conversion functions STILL return 1:1
            expect(await yieldVault.convertToShares(depositAmount1))
                .to.equal(depositAmount1, "convertToShares STILL 1:1 despite undercollateralization");
            expect(await yieldVault.convertToAssets(user1Shares))
                .to.equal(user1Shares, "convertToAssets STILL 1:1 despite undercollateralization");

            // ========================================
            // STEP 3: User2 deposits 500k USDC
            // ========================================
            await usdc.connect(user2).approve(await yieldVault.getAddress(), depositAmount2);
            await yieldVault.connect(user2).deposit(depositAmount2, user2.address);

            const user2Shares = await yieldVault.balanceOf(user2.address);
            
            console.log("\n=== AFTER USER2 DEPOSIT ===");
            console.log("User2 wYLDS:", ethers.formatUnits(user2Shares, USDC_DECIMALS));
            console.log("Vault totalSupply:", ethers.formatUnits(await yieldVault.totalSupply(), USDC_DECIMALS));
            console.log("Vault totalAssets:", ethers.formatUnits(await yieldVault.totalAssets(), USDC_DECIMALS));

            // User2 ALSO gets 1:1, even though vault is undercollateralized
            expect(user2Shares).to.equal(depositAmount2, "User2 should STILL receive 1:1 wYLDS");

            // ========================================
            // STEP 4: Direct USDC transfer (no wYLDS minted)
            // ========================================
            await usdc.connect(user2).transfer(await yieldVault.getAddress(), directTransfer);

            const totalSupplyAfterTransfer = await yieldVault.totalSupply();
            const totalAssetsAfterTransfer = await yieldVault.totalAssets();

            console.log("\n=== AFTER 50k DIRECT USDC TRANSFER ===");
            console.log("Vault totalSupply:", ethers.formatUnits(totalSupplyAfterTransfer, USDC_DECIMALS));
            console.log("Vault totalAssets:", ethers.formatUnits(totalAssetsAfterTransfer, USDC_DECIMALS));
            console.log("Actual ratio:", (Number(totalAssetsAfterTransfer) / Number(totalSupplyAfterTransfer)).toFixed(6));

            // totalSupply unchanged (no mint), totalAssets increased
            expect(totalSupplyAfterTransfer).to.equal(totalSupplyAfterWithdraw + depositAmount2, 
                "totalSupply should not change from direct transfer");
            expect(totalAssetsAfterTransfer).to.equal(totalAssetsAfterWithdraw + depositAmount2 + directTransfer,
                "totalAssets should include direct transfer");

            // ✅ Conversion functions STILL 1:1
            expect(await yieldVault.convertToShares(ethers.parseUnits("100", USDC_DECIMALS)))
                .to.equal(ethers.parseUnits("100", USDC_DECIMALS), "convertToShares STILL 1:1");
            expect(await yieldVault.convertToAssets(ethers.parseUnits("100", USDC_DECIMALS)))
                .to.equal(ethers.parseUnits("100", USDC_DECIMALS), "convertToAssets STILL 1:1");

            // ========================================
            // STEP 5: Test redemption (promises 1:1)
            // ========================================
            const redeemAmount = ethers.parseUnits("100000", USDC_DECIMALS); // 100k wYLDS
            
            await yieldVault.connect(user1).requestRedeem(redeemAmount);
            
            const [hasPending, pendingShares, pendingAssets] = await yieldVault.getPendingRedemption(user1.address);
            
            console.log("\n=== REDEMPTION REQUEST ===");
            console.log("User1 requested:", ethers.formatUnits(redeemAmount, USDC_DECIMALS), "wYLDS");
            console.log("Promised USDC:", ethers.formatUnits(pendingAssets, USDC_DECIMALS));
            
            expect(hasPending).to.be.true;
            expect(pendingShares).to.equal(redeemAmount);
            expect(pendingAssets).to.equal(redeemAmount, "Redemption PROMISES 1:1 USDC");

            // ========================================
            // FINAL VERIFICATION
            // ========================================
            console.log("\n=== FINAL STATE ===");
            const finalSupply = await yieldVault.totalSupply();
            const finalAssets = await yieldVault.totalAssets();
            console.log("Total wYLDS:", ethers.formatUnits(finalSupply, USDC_DECIMALS));
            console.log("Total USDC:", ethers.formatUnits(finalAssets, USDC_DECIMALS));
            console.log("Actual backing:", (Number(finalAssets) / Number(finalSupply)).toFixed(6), "USDC per wYLDS");

            // Summary
            console.log("\n=== SUMMARY ===");
            console.log("✅ convertToShares: ALWAYS 1:1");
            console.log("✅ convertToAssets: ALWAYS 1:1");
            console.log("✅ Deposits: ALWAYS 1:1");
            console.log("✅ Redemptions: PROMISE 1:1");
            console.log("⚠️  Actual backing: VARIES based on USDC movements");

            // The invariant: conversion functions ALWAYS return 1:1
            const testAmount = ethers.parseUnits("12345.67", USDC_DECIMALS);
            expect(await yieldVault.convertToShares(testAmount)).to.equal(testAmount);
            expect(await yieldVault.convertToAssets(testAmount)).to.equal(testAmount);
        });

        it("should show that actual backing can diverge from 1:1 promise", async function () {
            const depositAmount = ethers.parseUnits("1000000", USDC_DECIMALS); // 1M USDC
            const withdrawAmount = ethers.parseUnits("300000", USDC_DECIMALS); // 300k USDC (30%)

            // Deposit 1M USDC
            await usdc.connect(user1).approve(await yieldVault.getAddress(), depositAmount);
            await yieldVault.connect(user1).deposit(depositAmount, user1.address);

            // Withdraw 300k USDC (reduce backing to 70%)
            await yieldVault.connect(owner).withdrawUSDC(withdrawalDestination.address, withdrawAmount);

            const totalSupply = await yieldVault.totalSupply();
            const totalAssets = await yieldVault.totalAssets();
            
            // Actual backing is 0.7 USDC per wYLDS
            const actualRatio = Number(totalAssets) / Number(totalSupply);
            expect(actualRatio).to.be.closeTo(0.7, 0.01, "Actual backing should be ~70%");

            // But conversion functions STILL promise 1:1
            const oneWYLDS = ethers.parseUnits("1", USDC_DECIMALS);
            expect(await yieldVault.convertToAssets(oneWYLDS))
                .to.equal(oneWYLDS, "Promises 1 USDC per wYLDS");
            
            // This means the vault is undercollateralized by 30%
            const promisedValue = await yieldVault.convertToAssets(totalSupply);
            const actualValue = totalAssets;
            const shortfall = promisedValue - actualValue;
            
            console.log("\n=== UNDERCOLLATERALIZATION ===");
            console.log("Total wYLDS:", ethers.formatUnits(totalSupply, USDC_DECIMALS));
            console.log("Promised USDC:", ethers.formatUnits(promisedValue, USDC_DECIMALS));
            console.log("Actual USDC:", ethers.formatUnits(actualValue, USDC_DECIMALS));
            console.log("Shortfall:", ethers.formatUnits(shortfall, USDC_DECIMALS));
            console.log("Undercollateralized:", ((Number(shortfall) / Number(promisedValue)) * 100).toFixed(2) + "%");

            expect(shortfall).to.equal(withdrawAmount, "Shortfall equals withdrawn amount");
        });

        it("should maintain 1:1 even with multiple withdraw/deposit cycles", async function () {
            const amounts = [
                ethers.parseUnits("500000", USDC_DECIMALS),
                ethers.parseUnits("300000", USDC_DECIMALS),
                ethers.parseUnits("150000", USDC_DECIMALS),
            ];

            for (let i = 0; i < 3; i++) {
                // Deposit
                await usdc.connect(user1).approve(await yieldVault.getAddress(), amounts[i]);
                await yieldVault.connect(user1).deposit(amounts[i], user1.address);

                // Withdraw 20%
                const withdrawAmt = amounts[i] * 20n / 100n;
                await yieldVault.connect(owner).withdrawUSDC(withdrawalDestination.address, withdrawAmt);

                // Direct transfer 5%
                const directAmt = amounts[i] * 5n / 100n;
                await usdc.connect(user2).transfer(await yieldVault.getAddress(), directAmt);

                // ALWAYS 1:1 after each cycle
                const testAmt = ethers.parseUnits("1000", USDC_DECIMALS);
                expect(await yieldVault.convertToShares(testAmt))
                    .to.equal(testAmt, `Cycle ${i}: convertToShares should be 1:1`);
                expect(await yieldVault.convertToAssets(testAmt))
                    .to.equal(testAmt, `Cycle ${i}: convertToAssets should be 1:1`);
            }

            console.log("\n=== AFTER 3 CYCLES ===");
            console.log("Total Supply:", ethers.formatUnits(await yieldVault.totalSupply(), USDC_DECIMALS));
            console.log("Total Assets:", ethers.formatUnits(await yieldVault.totalAssets(), USDC_DECIMALS));
            console.log("✅ Conversions remained 1:1 throughout all cycles");
        });
    });

    describe("Edge Cases - Conversion Invariant", function () {
        it("should return 1:1 even when vault is completely drained", async function () {
            const depositAmount = ethers.parseUnits("100000", USDC_DECIMALS);
            
            // Deposit
            await usdc.connect(user1).approve(await yieldVault.getAddress(), depositAmount);
            await yieldVault.connect(user1).deposit(depositAmount, user1.address);

            // Withdraw ALL USDC
            await yieldVault.connect(owner).withdrawUSDC(
                withdrawalDestination.address, 
                await usdc.balanceOf(await yieldVault.getAddress())
            );

            // Vault has 0 USDC but 100k wYLDS supply
            expect(await yieldVault.totalAssets()).to.equal(0n, "Vault should be empty");
            expect(await yieldVault.totalSupply()).to.equal(depositAmount, "wYLDS still exists");

            // Conversion STILL returns 1:1 (promises 100k USDC that doesn't exist!)
            expect(await yieldVault.convertToAssets(depositAmount))
                .to.equal(depositAmount, "STILL promises 1:1 even with 0 backing");
            
            console.log("\n=== CRITICAL EDGE CASE ===");
            console.log("wYLDS supply:", ethers.formatUnits(depositAmount, USDC_DECIMALS));
            console.log("USDC backing:", "0.0");
            console.log("Promised at 1:1:", ethers.formatUnits(depositAmount, USDC_DECIMALS));
            console.log("⚠️  100% undercollateralized!");
        });

        it("should maintain 1:1 with extreme precision amounts", async function () {
            const preciseAmount = ethers.parseUnits("123456.789012", USDC_DECIMALS);
            
            expect(await yieldVault.convertToShares(preciseAmount)).to.equal(preciseAmount);
            expect(await yieldVault.convertToAssets(preciseAmount)).to.equal(preciseAmount);
        });

        it("should maintain 1:1 with zero amount", async function () {
            expect(await yieldVault.convertToShares(0)).to.equal(0);
            expect(await yieldVault.convertToAssets(0)).to.equal(0);
        });

        it("should maintain 1:1 with max uint256", async function () {
            const maxAmount = ethers.MaxUint256;
            
            expect(await yieldVault.convertToShares(maxAmount)).to.equal(maxAmount);
            expect(await yieldVault.convertToAssets(maxAmount)).to.equal(maxAmount);
        });
    });
});
