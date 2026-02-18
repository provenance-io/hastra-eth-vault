import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
    StakingVault,
    YieldVault,
    MockLinkToken,
    MockRewardManager,
    MockFeeManager,
    MockVerifierProxy,
    MockUSDC
} from "../typechain-types";

describe("StakingVault - Chainlink NAV Integration", function () {
    let admin: SignerWithAddress;
    let updater: SignerWithAddress;
    let user1: SignerWithAddress;
    let stakingVault: StakingVault;
    let yieldVault: YieldVault;
    let underlyingAsset: MockUSDC;
    let linkToken: MockLinkToken;
    let rewardManager: MockRewardManager;
    let feeManager: MockFeeManager;
    let verifierProxy: MockVerifierProxy;

    const FEED_ID = ethers.encodeBytes32String("ETH/USD");
    const MIN_RATE = ethers.parseEther("0.5");  // 0.5
    const MAX_RATE = ethers.parseEther("3");    // 3.0
    const MAX_DIFF_PERCENT = ethers.parseEther("0.1"); // 10%
    
    const NAV_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("NAV_ADMIN"));

    beforeEach(async function () {
        [admin, updater, user1] = await ethers.getSigners();

        // Deploy mock USDC as underlying asset
        const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
        underlyingAsset = await MockUSDCFactory.deploy();
        await underlyingAsset.waitForDeployment();

        // Deploy YieldVault first
        const YieldVaultFactory = await ethers.getContractFactory("YieldVault");
        yieldVault = await upgrades.deployProxy(
            YieldVaultFactory,
            [
                await underlyingAsset.getAddress(),
                "Wrapped Yield Token",
                "wYLDS",
                admin.address,
                admin.address, // use admin as redeem vault for testing
                admin.address, // initial whitelist
            ],
            { kind: "uups", initializer: "initialize" }
        ) as any;
        await yieldVault.waitForDeployment();

        // Deploy Chainlink mocks
        linkToken = await (await ethers.getContractFactory("MockLinkToken")).deploy();
        await linkToken.waitForDeployment();

        rewardManager = await (await ethers.getContractFactory("MockRewardManager")).deploy(
            await linkToken.getAddress()
        );
        await rewardManager.waitForDeployment();

        feeManager = await (await ethers.getContractFactory("MockFeeManager")).deploy(
            await linkToken.getAddress(),
            ethers.ZeroAddress,
            await rewardManager.getAddress(),
            ethers.parseEther("0.1") // 0.1 LINK fee
        );
        await feeManager.waitForDeployment();

        verifierProxy = await (await ethers.getContractFactory("MockVerifierProxy")).deploy(
            await feeManager.getAddress()
        );
        await verifierProxy.waitForDeployment();

        // Deploy StakingVault
        const StakingVaultFactory = await ethers.getContractFactory("StakingVault");
        stakingVault = await upgrades.deployProxy(
            StakingVaultFactory,
            [
                await yieldVault.getAddress(),
                "Prime Staked YLDS",
                "PRIME",
                admin.address,
                await yieldVault.getAddress(),
            ],
            {
                kind: "uups",
                initializer: "initialize",
                unsafeAllow: ["missing-public-upgradeto", "parent-initialization-missing"]
            }
        ) as any;
        await stakingVault.waitForDeployment();

        // Initialize Chainlink NAV
        await stakingVault.connect(admin).initializeChainlinkNav(
            await verifierProxy.getAddress(),
            FEED_ID,
            updater.address,
            MIN_RATE,
            MAX_RATE,
            MAX_DIFF_PERCENT
        );

        // Fund the staking vault with LINK tokens for fees
        await linkToken.mint(await stakingVault.getAddress(), ethers.parseEther("100"));
    });

    describe("Initialization", function () {
        it("Should initialize Chainlink NAV parameters correctly", async function () {
            expect(await stakingVault.getFeedId()).to.equal(FEED_ID);
            expect(await stakingVault.getUpdater()).to.equal(updater.address);
            expect(await stakingVault.getMinRate()).to.equal(MIN_RATE);
            expect(await stakingVault.getMaxRate()).to.equal(MAX_RATE);
            expect(await stakingVault.getMaxDifferencePercent()).to.equal(MAX_DIFF_PERCENT);
            expect(await stakingVault.getVerifierProxy()).to.equal(await verifierProxy.getAddress());
        });

        it("Should grant NAV_ADMIN_ROLE to admin", async function () {
            expect(await stakingVault.hasRole(NAV_ADMIN_ROLE, admin.address)).to.be.true;
        });

        it("Should not allow re-initialization", async function () {
            await expect(
                stakingVault.connect(admin).initializeChainlinkNav(
                    await verifierProxy.getAddress(),
                    FEED_ID,
                    updater.address,
                    MIN_RATE,
                    MAX_RATE,
                    MAX_DIFF_PERCENT
                )
            ).to.be.revertedWithCustomError(stakingVault, "InvalidInitialization");
        });
    });

    describe("Update Exchange Rate", function () {
        function encodeReportV7(params: {
            feedId: string;
            validFromTimestamp: number;
            observationsTimestamp: number;
            nativeFee: bigint;
            linkFee: bigint;
            expiresAt: number;
            exchangeRate: bigint;
        }) {
            const reportData = ethers.AbiCoder.defaultAbiCoder().encode(
                [
                    "bytes32", // feedId
                    "uint32",  // validFromTimestamp
                    "uint32",  // observationsTimestamp
                    "uint192", // nativeFee
                    "uint192", // linkFee
                    "uint32",  // expiresAt
                    "int192"   // exchangeRate
                ],
                [
                    params.feedId,
                    params.validFromTimestamp,
                    params.observationsTimestamp,
                    params.nativeFee,
                    params.linkFee,
                    params.expiresAt,
                    params.exchangeRate
                ]
            );

            // Prepend schema version (0x0007 for v7)
            const versionedReportData = ethers.concat([
                "0x0007",
                reportData
            ]);

            // Wrap in unverified report format (header + report data)
            const header = [
                ethers.encodeBytes32String("header1"),
                ethers.encodeBytes32String("header2"),
                ethers.encodeBytes32String("header3")
            ];

            return ethers.AbiCoder.defaultAbiCoder().encode(
                ["bytes32[3]", "bytes"],
                [header, versionedReportData]
            );
        }

        it("Should update exchange rate with valid report", async function () {
            const now = Math.floor(Date.now() / 1000);
            const exchangeRate = ethers.parseEther("1.5"); // 1.5 NAV

            const report = encodeReportV7({
                feedId: FEED_ID,
                validFromTimestamp: now - 60,
                observationsTimestamp: now,
                nativeFee: 0n,
                linkFee: ethers.parseEther("0.1"),
                expiresAt: now + 3600,
                exchangeRate: exchangeRate
            });

            await expect(stakingVault.connect(updater).updateExchangeRate(report))
                .to.emit(stakingVault, "ExchangeRateUpdated")
                .withArgs(exchangeRate, now, await ethers.provider.getBlock("latest").then(b => b!.timestamp + 1));

            expect(await stakingVault.getExchangeRate()).to.equal(exchangeRate);
        });

        it("Should reject report from non-updater", async function () {
            const now = Math.floor(Date.now() / 1000);
            const exchangeRate = ethers.parseEther("1.5");

            const report = encodeReportV7({
                feedId: FEED_ID,
                validFromTimestamp: now - 60,
                observationsTimestamp: now,
                nativeFee: 0n,
                linkFee: ethers.parseEther("0.1"),
                expiresAt: now + 3600,
                exchangeRate: exchangeRate
            });

            await expect(
                stakingVault.connect(user1).updateExchangeRate(report)
            ).to.be.revertedWithCustomError(stakingVault, "NotUpdater");
        });

        it("Should reject rate below minimum", async function () {
            const now = Math.floor(Date.now() / 1000);
            const exchangeRate = ethers.parseEther("0.3"); // Below 0.5 min

            const report = encodeReportV7({
                feedId: FEED_ID,
                validFromTimestamp: now - 60,
                observationsTimestamp: now,
                nativeFee: 0n,
                linkFee: ethers.parseEther("0.1"),
                expiresAt: now + 3600,
                exchangeRate: exchangeRate
            });

            await expect(stakingVault.connect(updater).updateExchangeRate(report))
                .to.emit(stakingVault, "AlertInvalidRate");

            // Rate should not update
            expect(await stakingVault.getExchangeRate()).to.equal(0);
        });

        it("Should reject rate above maximum", async function () {
            const now = Math.floor(Date.now() / 1000);
            const exchangeRate = ethers.parseEther("3.5"); // Above 3.0 max

            const report = encodeReportV7({
                feedId: FEED_ID,
                validFromTimestamp: now - 60,
                observationsTimestamp: now,
                nativeFee: 0n,
                linkFee: ethers.parseEther("0.1"),
                expiresAt: now + 3600,
                exchangeRate: exchangeRate
            });

            await expect(stakingVault.connect(updater).updateExchangeRate(report))
                .to.emit(stakingVault, "AlertInvalidRate");

            expect(await stakingVault.getExchangeRate()).to.equal(0);
        });

        it("Should reject expired report", async function () {
            const now = Math.floor(Date.now() / 1000);
            const exchangeRate = ethers.parseEther("1.5");

            const report = encodeReportV7({
                feedId: FEED_ID,
                validFromTimestamp: now - 7200,
                observationsTimestamp: now - 3600,
                nativeFee: 0n,
                linkFee: ethers.parseEther("0.1"),
                expiresAt: now - 60, // Expired
                exchangeRate: exchangeRate
            });

            await expect(stakingVault.connect(updater).updateExchangeRate(report))
                .to.emit(stakingVault, "AlertExpiredReport");

            expect(await stakingVault.getExchangeRate()).to.equal(0);
        });

        it("Should reject stale report (older than 24 hours)", async function () {
            const now = Math.floor(Date.now() / 1000);
            const exchangeRate = ethers.parseEther("1.5");

            const report = encodeReportV7({
                feedId: FEED_ID,
                validFromTimestamp: now - 86400 - 3600,
                observationsTimestamp: now - 86400 - 60, // >24 hours old
                nativeFee: 0n,
                linkFee: ethers.parseEther("0.1"),
                expiresAt: now + 3600,
                exchangeRate: exchangeRate
            });

            await expect(stakingVault.connect(updater).updateExchangeRate(report))
                .to.emit(stakingVault, "AlertStaleReport");

            expect(await stakingVault.getExchangeRate()).to.equal(0);
        });

        it("Should reject rate change exceeding max difference", async function () {
            const now = Math.floor(Date.now() / 1000);
            
            // First update with rate of 1.0
            let exchangeRate = ethers.parseEther("1.0");
            let report = encodeReportV7({
                feedId: FEED_ID,
                validFromTimestamp: now - 60,
                observationsTimestamp: now,
                nativeFee: 0n,
                linkFee: ethers.parseEther("0.1"),
                expiresAt: now + 3600,
                exchangeRate: exchangeRate
            });

            await stakingVault.connect(updater).updateExchangeRate(report);
            expect(await stakingVault.getExchangeRate()).to.equal(exchangeRate);

            // Try to update with rate of 1.5 (50% increase, > 10% max)
            exchangeRate = ethers.parseEther("1.5");
            report = encodeReportV7({
                feedId: FEED_ID,
                validFromTimestamp: now,
                observationsTimestamp: now + 60,
                nativeFee: 0n,
                linkFee: ethers.parseEther("0.1"),
                expiresAt: now + 3660,
                exchangeRate: exchangeRate
            });

            await expect(stakingVault.connect(updater).updateExchangeRate(report))
                .to.emit(stakingVault, "AlertInvalidRateDifference");

            // Rate should remain at 1.0
            expect(await stakingVault.getExchangeRate()).to.equal(ethers.parseEther("1.0"));
        });
    });

    describe("Admin Functions", function () {
        it("Should allow NAV_ADMIN to update updater", async function () {
            await stakingVault.connect(admin).setNavUpdater(user1.address);
            expect(await stakingVault.getUpdater()).to.equal(user1.address);
        });

        it("Should allow NAV_ADMIN to update min rate", async function () {
            const newMinRate = ethers.parseEther("0.8");
            await stakingVault.connect(admin).setMinRate(newMinRate);
            expect(await stakingVault.getMinRate()).to.equal(newMinRate);
        });

        it("Should allow NAV_ADMIN to update max rate", async function () {
            const newMaxRate = ethers.parseEther("5");
            await stakingVault.connect(admin).setMaxRate(newMaxRate);
            expect(await stakingVault.getMaxRate()).to.equal(newMaxRate);
        });

        it("Should allow NAV_ADMIN to update max difference percent", async function () {
            const newMaxDiff = ethers.parseEther("0.2"); // 20%
            await stakingVault.connect(admin).setMaxDifferencePercent(newMaxDiff);
            expect(await stakingVault.getMaxDifferencePercent()).to.equal(newMaxDiff);
        });

        it("Should prevent non-admin from updating parameters", async function () {
            await expect(
                stakingVault.connect(user1).setNavUpdater(user1.address)
            ).to.be.reverted;
        });
    });

    describe("View Functions", function () {
        it("Should return correct staleness status", async function () {
            expect(await stakingVault.isStale(3600)).to.be.true; // No update yet

            // Make an update
            const now = Math.floor(Date.now() / 1000);
            const exchangeRate = ethers.parseEther("1.5");
            const report = encodeReportV7({
                feedId: FEED_ID,
                validFromTimestamp: now - 60,
                observationsTimestamp: now,
                nativeFee: 0n,
                linkFee: ethers.parseEther("0.1"),
                expiresAt: now + 3600,
                exchangeRate: exchangeRate
            });

            await stakingVault.connect(updater).updateExchangeRate(report);
            
            expect(await stakingVault.isStale(3600)).to.be.false;
            expect(await stakingVault.isStale(0)).to.be.true;
        });
    });
});
