import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * Tests for HastraTimelockController — the OZ TimelockController wrapper
 * deployed by scripts/admin/deploy-timelock.ts.
 *
 * Covers:
 *   - Construction wires the expected roles (PROPOSER, CANCELLER, EXECUTOR,
 *     DEFAULT_ADMIN) to the right addresses.
 *   - getMinDelay() reflects the 24h default required by REQUIREMENTS §4.3.
 *   - Schedule -> wait -> execute happy path.
 *   - Execute before delay reverts.
 *   - Cancel by canceller succeeds; cancel by random EOA reverts.
 *   - Non-proposer schedule reverts.
 *   - "Open execution" (anyone may execute after delay) holds.
 */
describe("HastraTimelockController", function () {
  const DELAY = 86_400; // 24h — REQUIREMENTS §4.3 default

  async function deployFixture() {
    const [admin, safe, executor, randomUser] = await ethers.getSigners();

    // Minimal target so we can schedule a real call. MockUSDC is already
    // available in this repo; we only need its address + known calldata.
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const target = await MockUSDC.deploy();

    const Timelock = await ethers.getContractFactory("HastraTimelockController");
    const timelock = await Timelock.deploy(
      DELAY,
      [safe.address],            // proposers
      [ethers.ZeroAddress],      // executors — open (anyone)
      safe.address               // admin (== TIMELOCK_ADMIN / DEFAULT_ADMIN_ROLE)
    );

    const PROPOSER_ROLE  = await timelock.PROPOSER_ROLE();
    const EXECUTOR_ROLE  = await timelock.EXECUTOR_ROLE();
    const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
    const DEFAULT_ADMIN  = await timelock.DEFAULT_ADMIN_ROLE();

    return {
      timelock, target,
      admin, safe, executor, randomUser,
      PROPOSER_ROLE, EXECUTOR_ROLE, CANCELLER_ROLE, DEFAULT_ADMIN,
    };
  }

  // Build a no-op call against the target: balanceOf(address) — a view fn,
  // safe to call through the timelock with value=0.
  function buildOp(targetAddr: string, who: string) {
    const iface = new ethers.Interface(["function balanceOf(address)"]);
    return {
      to: targetAddr,
      value: 0n,
      data: iface.encodeFunctionData("balanceOf", [who]),
      predecessor: ethers.ZeroHash,
      salt: ethers.ZeroHash,
    };
  }

  describe("Construction", function () {
    it("sets minDelay to the value passed in", async function () {
      const { timelock } = await loadFixture(deployFixture);
      expect(await timelock.getMinDelay()).to.equal(DELAY);
    });

    it("grants PROPOSER_ROLE only to the safe", async function () {
      const { timelock, safe, randomUser, PROPOSER_ROLE } = await loadFixture(deployFixture);
      expect(await timelock.hasRole(PROPOSER_ROLE, safe.address)).to.equal(true);
      expect(await timelock.hasRole(PROPOSER_ROLE, randomUser.address)).to.equal(false);
    });

    it("grants CANCELLER_ROLE only to the safe", async function () {
      const { timelock, safe, randomUser, CANCELLER_ROLE } = await loadFixture(deployFixture);
      expect(await timelock.hasRole(CANCELLER_ROLE, safe.address)).to.equal(true);
      expect(await timelock.hasRole(CANCELLER_ROLE, randomUser.address)).to.equal(false);
    });

    it("grants EXECUTOR_ROLE to address(0) (open execution)", async function () {
      const { timelock, EXECUTOR_ROLE } = await loadFixture(deployFixture);
      expect(await timelock.hasRole(EXECUTOR_ROLE, ethers.ZeroAddress)).to.equal(true);
    });

    it("grants DEFAULT_ADMIN_ROLE to the safe (sole admin)", async function () {
      const { timelock, safe, admin, randomUser, DEFAULT_ADMIN } = await loadFixture(deployFixture);
      expect(await timelock.hasRole(DEFAULT_ADMIN, safe.address)).to.equal(true);
      expect(await timelock.hasRole(DEFAULT_ADMIN, admin.address)).to.equal(false);
      expect(await timelock.hasRole(DEFAULT_ADMIN, randomUser.address)).to.equal(false);
    });
  });

  describe("Schedule / execute lifecycle", function () {
    it("non-proposer cannot schedule", async function () {
      const { timelock, target, randomUser } = await loadFixture(deployFixture);
      const op = buildOp(await target.getAddress(), randomUser.address);
      await expect(
        timelock.connect(randomUser).schedule(op.to, op.value, op.data, op.predecessor, op.salt, DELAY)
      ).to.be.reverted;
    });

    it("proposer can schedule and operation becomes Pending", async function () {
      const { timelock, target, safe } = await loadFixture(deployFixture);
      const op = buildOp(await target.getAddress(), safe.address);
      await expect(
        timelock.connect(safe).schedule(op.to, op.value, op.data, op.predecessor, op.salt, DELAY)
      ).to.emit(timelock, "CallScheduled");

      const id = await timelock.hashOperation(op.to, op.value, op.data, op.predecessor, op.salt);
      expect(await timelock.isOperationPending(id)).to.equal(true);
      expect(await timelock.isOperationReady(id)).to.equal(false);
      expect(await timelock.isOperationDone(id)).to.equal(false);
    });

    it("execute before delay reverts", async function () {
      const { timelock, target, safe, randomUser } = await loadFixture(deployFixture);
      const op = buildOp(await target.getAddress(), safe.address);
      await timelock.connect(safe).schedule(op.to, op.value, op.data, op.predecessor, op.salt, DELAY);

      // Same block — definitely not ready.
      await expect(
        timelock.connect(randomUser).execute(op.to, op.value, op.data, op.predecessor, op.salt)
      ).to.be.reverted;

      // Well short of the delay — still not ready.
      await time.increase(DELAY / 2);
      await expect(
        timelock.connect(randomUser).execute(op.to, op.value, op.data, op.predecessor, op.salt)
      ).to.be.reverted;
    });

    it("anyone can execute after delay (open execution)", async function () {
      const { timelock, target, safe, randomUser } = await loadFixture(deployFixture);
      const op = buildOp(await target.getAddress(), safe.address);
      await timelock.connect(safe).schedule(op.to, op.value, op.data, op.predecessor, op.salt, DELAY);

      await time.increase(DELAY + 1);

      await expect(
        timelock.connect(randomUser).execute(op.to, op.value, op.data, op.predecessor, op.salt)
      ).to.emit(timelock, "CallExecuted");

      const id = await timelock.hashOperation(op.to, op.value, op.data, op.predecessor, op.salt);
      expect(await timelock.isOperationDone(id)).to.equal(true);
    });

    it("scheduling with delay < minDelay reverts", async function () {
      const { timelock, target, safe } = await loadFixture(deployFixture);
      const op = buildOp(await target.getAddress(), safe.address);
      await expect(
        timelock.connect(safe).schedule(op.to, op.value, op.data, op.predecessor, op.salt, DELAY - 1)
      ).to.be.reverted;
    });
  });

  describe("Cancellation", function () {
    it("canceller (safe) can cancel a pending operation", async function () {
      const { timelock, target, safe } = await loadFixture(deployFixture);
      const op = buildOp(await target.getAddress(), safe.address);
      await timelock.connect(safe).schedule(op.to, op.value, op.data, op.predecessor, op.salt, DELAY);
      const id = await timelock.hashOperation(op.to, op.value, op.data, op.predecessor, op.salt);

      await expect(timelock.connect(safe).cancel(id)).to.emit(timelock, "Cancelled");
      expect(await timelock.isOperationPending(id)).to.equal(false);
    });

    it("non-canceller cannot cancel", async function () {
      const { timelock, target, safe, randomUser } = await loadFixture(deployFixture);
      const op = buildOp(await target.getAddress(), safe.address);
      await timelock.connect(safe).schedule(op.to, op.value, op.data, op.predecessor, op.salt, DELAY);
      const id = await timelock.hashOperation(op.to, op.value, op.data, op.predecessor, op.salt);

      await expect(timelock.connect(randomUser).cancel(id)).to.be.reverted;
    });

    it("cancelled operation cannot be executed", async function () {
      const { timelock, target, safe, randomUser } = await loadFixture(deployFixture);
      const op = buildOp(await target.getAddress(), safe.address);
      await timelock.connect(safe).schedule(op.to, op.value, op.data, op.predecessor, op.salt, DELAY);
      const id = await timelock.hashOperation(op.to, op.value, op.data, op.predecessor, op.salt);
      await timelock.connect(safe).cancel(id);

      await time.increase(DELAY + 1);
      await expect(
        timelock.connect(randomUser).execute(op.to, op.value, op.data, op.predecessor, op.salt)
      ).to.be.reverted;
    });
  });

  describe("Admin can manage roles", function () {
    it("safe (admin) can grant PROPOSER_ROLE to a new address", async function () {
      const { timelock, safe, randomUser, PROPOSER_ROLE } = await loadFixture(deployFixture);
      await timelock.connect(safe).grantRole(PROPOSER_ROLE, randomUser.address);
      expect(await timelock.hasRole(PROPOSER_ROLE, randomUser.address)).to.equal(true);
    });

    it("non-admin cannot grant roles", async function () {
      const { timelock, randomUser, PROPOSER_ROLE } = await loadFixture(deployFixture);
      await expect(
        timelock.connect(randomUser).grantRole(PROPOSER_ROLE, randomUser.address)
      ).to.be.reverted;
    });
  });
});
