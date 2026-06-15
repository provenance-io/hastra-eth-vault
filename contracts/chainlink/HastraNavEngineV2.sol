// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {HastraNavEngine} from "./HastraNavEngine.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title HastraNavEngineV2
 * @notice Adds per-update rate-delta guard, cooldown, and pause/owner split.
 *
 *   New guardrails (REQUIREMENTS §4.5):
 *     - maxRateDeltaPercent: revert if |newRate − oldRate| / oldRate exceeds threshold
 *     - minUpdateInterval:  revert if < N seconds since last updateRate
 *     - pauser:             separate address for pause/unpause (owner can be timelocked)
 *
 *   initializeV2 also tightens maxRate (3.0 → 2.0).
 */
contract HastraNavEngineV2 is HastraNavEngine {

    struct NavEngineV2Storage {
        uint256 maxRateDeltaPercent;
        uint256 minUpdateInterval;
        address pauser;
    }

    // ERC-7201: keccak256(abi.encode(uint256(keccak256("hastra.storage.NavEngineV2")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant NAV_ENGINE_V2_STORAGE_SLOT =
        0x8dd47c1d92291d4861fc19193f0a9c3eb7a67a4aac3e1f17108e59e3d351ec00;

    // ── Custom errors ────────────────────────────────────────────────
    error RateDeltaExceeded(int192 newRate, int192 oldRate, uint256 deltaPct);
    error UpdateTooFrequent(uint256 lastUpdate, uint256 minInterval);
    error InvalidMaxRateDelta();
    error InvalidMinUpdateInterval();
    error InvalidPauser();

    // ── Events ───────────────────────────────────────────────────────
    event PauserSet(address indexed pauser);
    event MaxRateDeltaPercentSet(uint256 maxRateDeltaPercent);
    event MinUpdateIntervalSet(uint256 minUpdateInterval);

    // ── Initializer ──────────────────────────────────────────────────

    /**
     * @notice V2 initializer — call via upgradeToAndCall.
     * @param pauser_               Address with instant pause/unpause authority
     * @param maxRateDeltaPercent_   Max |rate change| per update, scaled 1e18 (e.g. 0.1e18 = 10%)
     * @param minUpdateInterval_    Minimum seconds between updateRate calls
     * @param maxRate_              Tightened maxRate (e.g. 2e18, down from 3e18)
     */
    function initializeV2(
        address pauser_,
        uint256 maxRateDeltaPercent_,
        uint256 minUpdateInterval_,
        int192 maxRate_
    ) external reinitializer(2) {
        _setPauser(pauser_);
        _setMaxRateDeltaPercent(maxRateDeltaPercent_);
        _setMinUpdateInterval(minUpdateInterval_);
        // Tighten maxRate on the V1 storage
        if (maxRate_ > 0) {
            _setMaxRate(maxRate_);
        }
    }

    // ── updateRate override ──────────────────────────────────────────

    function updateRate(
        uint256 totalSupply_,
        uint256 totalTVL_
    ) external override onlyUpdater whenNotPaused returns (int192) {
        if (totalSupply_ == 0) revert TotalSupplyIsZero();
        if (totalTVL_ == 0) revert TVLIsZero();

        NavEngineStorage storage v1 = _getStorage();
        NavEngineV2Storage storage v2 = _getV2Storage();

        // 1. Cooldown — minimum interval between updates
        uint256 lastUpdate = v1.latestUpdateTime;
        if (lastUpdate > 0) {
            if (block.timestamp < lastUpdate + v2.minUpdateInterval) {
                revert UpdateTooFrequent(lastUpdate, v2.minUpdateInterval);
            }
        }

        // 2. Compute new rate
        uint256 calculatedRate = Math.mulDiv(totalTVL_, RATE_PRECISION, totalSupply_);
        if (calculatedRate > uint256(uint192(type(int192).max))) revert RateOverflow(calculatedRate);
        int192 newRate = int192(int256(calculatedRate));

        // 3. Rate-delta guard — |newRate − oldRate| / oldRate <= maxRateDeltaPercent
        int192 oldRate = v1.latestRate;
        if (oldRate > 0) {
            uint256 newRateUint = uint256(uint192(newRate));
            uint256 oldRateUint = uint256(uint192(oldRate));
            uint256 rateAbsDiff = newRateUint > oldRateUint
                ? newRateUint - oldRateUint
                : oldRateUint - newRateUint;
            uint256 deltaPercent = Math.mulDiv(rateAbsDiff, RATE_PRECISION, oldRateUint);
            if (deltaPercent > v2.maxRateDeltaPercent) {
                revert RateDeltaExceeded(newRate, oldRate, deltaPercent);
            }
        }

        // 4. Absolute rate bounds (same as V1)
        if (newRate < v1.minRate || newRate > v1.maxRate) {
            revert RateOutOfBounds(newRate, v1.minRate, v1.maxRate);
        }

        // 5. Store
        v1.latestTVL = totalTVL_;
        v1.latestTotalSupply = totalSupply_;
        v1.latestUpdateTime = block.timestamp;
        v1.latestRate = newRate;

        emit RateUpdated(newRate, totalSupply_, totalTVL_, block.timestamp);
        return newRate;
    }

    // ── pause/unpause — pauser, not owner ────────────────────────────

    function pause() external override {
        if (msg.sender != _getV2Storage().pauser) revert InvalidPauser();
        _pause();
    }

    function unpause() external override {
        if (msg.sender != _getV2Storage().pauser) revert InvalidPauser();
        _unpause();
    }

    // ── Admin setters (onlyOwner) ────────────────────────────────────

    function setPauser(address pauser_) external onlyOwner {
        _setPauser(pauser_);
    }

    function setMaxRateDeltaPercent(uint256 pct_) external onlyOwner {
        _setMaxRateDeltaPercent(pct_);
    }

    function setMinUpdateInterval(uint256 interval_) external onlyOwner {
        _setMinUpdateInterval(interval_);
    }

    // ── Getters ──────────────────────────────────────────────────────

    function getPauser() external view returns (address) {
        return _getV2Storage().pauser;
    }

    function getMaxRateDeltaPercent() external view returns (uint256) {
        return _getV2Storage().maxRateDeltaPercent;
    }

    function getMinUpdateInterval() external view returns (uint256) {
        return _getV2Storage().minUpdateInterval;
    }

    // ── Internal setters ─────────────────────────────────────────────

    function _setPauser(address pauser_) internal {
        if (pauser_ == address(0)) revert InvalidPauser();
        _getV2Storage().pauser = pauser_;
        emit PauserSet(pauser_);
    }

    function _setMaxRateDeltaPercent(uint256 pct_) internal {
        if (pct_ == 0 || pct_ > RATE_PRECISION) revert InvalidMaxRateDelta();
        _getV2Storage().maxRateDeltaPercent = pct_;
        emit MaxRateDeltaPercentSet(pct_);
    }

    function _setMinUpdateInterval(uint256 interval_) internal {
        if (interval_ == 0) revert InvalidMinUpdateInterval();
        _getV2Storage().minUpdateInterval = interval_;
        emit MinUpdateIntervalSet(interval_);
    }

    function _getV2Storage() private pure returns (NavEngineV2Storage storage $) {
        assembly { $.slot := NAV_ENGINE_V2_STORAGE_SLOT }
    }
}
