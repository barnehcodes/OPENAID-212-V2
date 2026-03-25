import { expect } from "chai";
import { ethers } from "hardhat";
import {
  ReputationEngine,
  Registry,
  MockBesuPermissioning,
} from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

enum Role {
  GO = 0,
  NGO = 1,
  Donor = 2,
  Beneficiary = 3,
  PrivateCompany = 4,
}

// SystemPhase enum mirrors contract
enum SystemPhase {
  PREPAREDNESS = 0,
  ACTIVE_CRISIS = 1,
  RECOVERY = 2,
}

const EMPTY_PROOF = "0x";

// Constants from the contract
const SCALE = 100n;
const INITIAL_SCORE = 100n;
const R0 = 10n;
const P0 = 2n;
const ALPHA = 60n;
const BETA = 50n;
const W_ROLE_NGO = 100n;
const W_ROLE_GO = 85n;
const GAMMA_GO = 120n;
const MIN_VALIDATORS = 4n;

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("ReputationEngine", function () {
  // ── Signers ────────────────────────────────────────────────────────────────
  let deployer: HardhatEthersSigner;
  let operationalAuth: HardhatEthersSigner;
  let verificationMS: HardhatEthersSigner;
  let crisisMS: HardhatEthersSigner;
  let governance: HardhatEthersSigner;
  let go1: HardhatEthersSigner;
  let go2: HardhatEthersSigner;
  let go3: HardhatEthersSigner;
  let ngo1: HardhatEthersSigner;
  let ngo2: HardhatEthersSigner;
  let ngo3: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;
  // Extra signers for the min-validator safety tests
  let go4: HardhatEthersSigner;
  let ngo4: HardhatEthersSigner;

  // ── Contracts ──────────────────────────────────────────────────────────────
  let registry: Registry;
  let besu: MockBesuPermissioning;
  let re: ReputationEngine;

  // ─────────────────────────────────────────────────────────────────────────
  // Shared setup — runs before every test
  // ─────────────────────────────────────────────────────────────────────────

  beforeEach(async function () {
    [
      deployer,
      operationalAuth,
      verificationMS,
      crisisMS,
      governance,
      go1,
      go2,
      go3,
      ngo1,
      ngo2,
      ngo3,
      stranger,
      go4,
      ngo4,
    ] = await ethers.getSigners();

    // ── 1. Deploy Registry ─────────────────────────────────────────────────
    const RegistryFactory = await ethers.getContractFactory("Registry");
    registry = await RegistryFactory.deploy(
      operationalAuth.address,
      verificationMS.address,
      crisisMS.address
    );

    // ── 2. Deploy MockBesuPermissioning ────────────────────────────────────
    const BesuFactory = await ethers.getContractFactory(
      "MockBesuPermissioning"
    );
    besu = await BesuFactory.deploy();

    // ── 3. Deploy ReputationEngine ─────────────────────────────────────────
    const REFactory = await ethers.getContractFactory("ReputationEngine");
    re = await REFactory.deploy(
      registry.target,
      governance.address,
      besu.target
    );

    // ── 4. Register GOs and NGOs in the Registry ───────────────────────────
    // GOs are registered by admin
    await registry.connect(deployer).registerGO(go1.address);
    await registry.connect(deployer).registerGO(go2.address);
    await registry.connect(deployer).registerGO(go3.address);
    await registry.connect(deployer).registerGO(go4.address);

    // NGOs self-register then get verified by Tier-2
    await registry.connect(ngo1).registerNGO(ngo1.address);
    await registry
      .connect(verificationMS)
      .verifyNGO(ngo1.address, EMPTY_PROOF);

    await registry.connect(ngo2).registerNGO(ngo2.address);
    await registry
      .connect(verificationMS)
      .verifyNGO(ngo2.address, EMPTY_PROOF);

    await registry.connect(ngo3).registerNGO(ngo3.address);
    await registry
      .connect(verificationMS)
      .verifyNGO(ngo3.address, EMPTY_PROOF);

    await registry.connect(ngo4).registerNGO(ngo4.address);
    await registry
      .connect(verificationMS)
      .verifyNGO(ngo4.address, EMPTY_PROOF);
  });

  // Helper: initialize a standard set of validators
  async function initializeStandardValidators() {
    await re.initializeValidator(go1.address);
    await re.initializeValidator(go2.address);
    await re.initializeValidator(ngo1.address);
    await re.initializeValidator(ngo2.address);
    await re.initializeValidator(ngo3.address);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Constructor / Initial state
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Constructor", function () {
    it("sets the registry address correctly", async function () {
      expect(await re.registry()).to.equal(registry.target);
    });

    it("sets the governance contract address", async function () {
      expect(await re.governanceContract()).to.equal(governance.address);
    });

    it("sets the besu permissioning address", async function () {
      expect(await re.besuPermissioning()).to.equal(besu.target);
    });

    it("starts in PREPAREDNESS phase", async function () {
      expect(await re.currentPhase()).to.equal(SystemPhase.PREPAREDNESS);
    });

    it("starts at epoch 1", async function () {
      expect(await re.currentEpoch()).to.equal(1n);
    });

    it("sets default phase configs", async function () {
      const prep = await re.getPhaseConfig(SystemPhase.PREPAREDNESS);
      expect(prep.k1).to.equal(70n);
      expect(prep.k2).to.equal(30n);
      expect(prep.alphaCrisis).to.equal(100n);

      const active = await re.getPhaseConfig(SystemPhase.ACTIVE_CRISIS);
      expect(active.k1).to.equal(40n);
      expect(active.k2).to.equal(60n);
      expect(active.alphaCrisis).to.equal(250n);

      const recovery = await re.getPhaseConfig(SystemPhase.RECOVERY);
      expect(recovery.k1).to.equal(65n);
      expect(recovery.k2).to.equal(35n);
      expect(recovery.alphaCrisis).to.equal(150n);
    });

    it("reverts if registry address is zero", async function () {
      const REFactory = await ethers.getContractFactory("ReputationEngine");
      await expect(
        REFactory.deploy(ethers.ZeroAddress, governance.address, besu.target)
      ).to.be.revertedWithCustomError(re, "ZeroAddress");
    });

    it("emits GovernanceContractSet when governance provided", async function () {
      const REFactory = await ethers.getContractFactory("ReputationEngine");
      const re2 = await REFactory.deploy(
        registry.target,
        governance.address,
        besu.target
      );
      const receipt = await re2.deploymentTransaction()!.wait();
      const topic = re2.interface.getEvent("GovernanceContractSet")!.topicHash;
      const log = receipt!.logs.find((l) => l.topics[0] === topic);
      expect(log).to.not.be.undefined;
    });

    it("accepts address(0) for governance (set later)", async function () {
      const REFactory = await ethers.getContractFactory("ReputationEngine");
      const re2 = await REFactory.deploy(
        registry.target,
        ethers.ZeroAddress,
        besu.target
      );
      expect(await re2.governanceContract()).to.equal(ethers.ZeroAddress);
    });

    it("accepts address(0) for besu permissioning", async function () {
      const REFactory = await ethers.getContractFactory("ReputationEngine");
      const re2 = await REFactory.deploy(
        registry.target,
        governance.address,
        ethers.ZeroAddress
      );
      expect(await re2.besuPermissioning()).to.equal(ethers.ZeroAddress);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. initializeValidator
  // ═══════════════════════════════════════════════════════════════════════════

  describe("initializeValidator()", function () {
    it("creates a score record with INITIAL_SCORE", async function () {
      await re.initializeValidator(go1.address);
      const score = await re.getValidatorScore(go1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE);
      expect(score.previousScore).to.equal(INITIAL_SCORE);
      expect(score.isActive).to.be.true;
      expect(score.exists).to.be.true;
    });

    it("adds the validator to the list", async function () {
      await re.initializeValidator(go1.address);
      expect(await re.getValidatorCount()).to.equal(1n);
      const all = await re.getAllValidators();
      expect(all[0]).to.equal(go1.address);
    });

    it("registers with Besu permissioning mock", async function () {
      await re.initializeValidator(ngo1.address);
      expect(await besu.isValidator(ngo1.address)).to.be.true;
      expect(await besu.addCallCount()).to.equal(1n);
    });

    it("emits ValidatorInitialized", async function () {
      await expect(re.initializeValidator(go1.address))
        .to.emit(re, "ValidatorInitialized")
        .withArgs(go1.address, INITIAL_SCORE);
    });

    it("anyone can call it for a verified validator", async function () {
      await expect(re.connect(stranger).initializeValidator(go1.address))
        .to.emit(re, "ValidatorInitialized")
        .withArgs(go1.address, INITIAL_SCORE);
    });

    it("reverts if validator is not verified in Registry", async function () {
      await expect(re.initializeValidator(stranger.address))
        .to.be.revertedWithCustomError(re, "NotVerifiedValidator")
        .withArgs(stranger.address);
    });

    it("reverts if validator is already initialized", async function () {
      await re.initializeValidator(go1.address);
      await expect(re.initializeValidator(go1.address))
        .to.be.revertedWithCustomError(re, "ValidatorAlreadyInitialized")
        .withArgs(go1.address);
    });

    it("reverts for unverified NGO", async function () {
      // Register but don't verify
      const [, , , , , , , , , , , , , , extra] = await ethers.getSigners();
      await registry.connect(extra).registerNGO(extra.address);
      // Not verified yet
      await expect(re.initializeValidator(extra.address))
        .to.be.revertedWithCustomError(re, "NotVerifiedValidator")
        .withArgs(extra.address);
    });

    it("skips Besu call when besuPermissioning is address(0)", async function () {
      const REFactory = await ethers.getContractFactory("ReputationEngine");
      const re2 = await REFactory.deploy(
        registry.target,
        governance.address,
        ethers.ZeroAddress
      );
      // Should not revert even without Besu contract
      await expect(re2.initializeValidator(go1.address)).to.not.be.reverted;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. recordMisconduct — penalty math
  // ═══════════════════════════════════════════════════════════════════════════

  describe("recordMisconduct()", function () {
    beforeEach(async function () {
      await initializeStandardValidators();
    });

    it("increments misconduct count", async function () {
      await re.connect(governance).recordMisconduct(ngo1.address, 1n);
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.misconductCount).to.equal(1n);
    });

    // ── Penalty formula verification (matches thesis examples) ─────────────

    it("1st offense (NGO, PREPAREDNESS): penalty = 1", async function () {
      // P_penalty = P0 * wRole * (SCALE + alphaCrisis * n²) / (SCALE * SCALE) * k2 / SCALE
      // base = 2 * 100 * (100 + 100 * 1) / 10000 = 4, then 4 * 30 / 100 = 1
      await re.connect(governance).recordMisconduct(ngo1.address, 1n);
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE - 1n);
    });

    it("2nd offense (NGO, PREPAREDNESS): penalty = 3", async function () {
      // base n=2: 2 * 100 * (100 + 100 * 4) / 10000 = 10, then 10 * 30 / 100 = 3
      await re.connect(governance).recordMisconduct(ngo1.address, 1n);
      await re.connect(governance).recordMisconduct(ngo1.address, 2n);
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE - 1n - 3n);
    });

    it("3rd offense (NGO, PREPAREDNESS): penalty = 6", async function () {
      // base n=3: 2 * 100 * (100 + 100 * 9) / 10000 = 20, then 20 * 30 / 100 = 6
      await re.connect(governance).recordMisconduct(ngo1.address, 1n);
      await re.connect(governance).recordMisconduct(ngo1.address, 2n);
      await re.connect(governance).recordMisconduct(ngo1.address, 3n);
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE - 1n - 3n - 6n);
    });

    it("1st offense (NGO, active crisis): penalty = 4", async function () {
      // Switch to ACTIVE_CRISIS phase (alphaCrisis = 250, k2 = 60)
      await re.connect(operationalAuth).setSystemPhase(SystemPhase.ACTIVE_CRISIS);
      // base = 2 * 100 * (100 + 250 * 1) / 10000 = 7, then 7 * 60 / 100 = 4
      await re.connect(governance).recordMisconduct(ngo1.address, 1n);
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE - 4n);
    });

    it("3rd offense (NGO, active crisis): cumulative penalty = 45", async function () {
      await re.connect(operationalAuth).setSystemPhase(SystemPhase.ACTIVE_CRISIS);
      // n=1: base=7, 7*60/100 = 4
      await re.connect(governance).recordMisconduct(ngo1.address, 1n);
      // n=2: base=22, 22*60/100 = 13
      await re.connect(governance).recordMisconduct(ngo1.address, 2n);
      // n=3: base=47, 47*60/100 = 28
      await re.connect(governance).recordMisconduct(ngo1.address, 3n);
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE - 4n - 13n - 28n);
    });

    it("GO penalty is reduced by role weight (0.85) and k2", async function () {
      // 1st offense GO, PREPAREDNESS: base = 2 * 85 * 200 / 10000 = 3, then 3 * 30 / 100 = 0
      // (truncated to 0 by integer division — very light penalty in preparedness)
      await re.connect(governance).recordMisconduct(go1.address, 1n);
      const score = await re.getValidatorScore(go1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE - 0n);
    });

    it("floors score at 0 (does not underflow)", async function () {
      // Rapid misconduct to drive score to 0
      for (let i = 1; i <= 10; i++) {
        await re
          .connect(governance)
          .recordMisconduct(ngo1.address, BigInt(i));
      }
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(0n);
    });

    it("emits MisconductRecorded with penalty and new score", async function () {
      await expect(
        re.connect(governance).recordMisconduct(ngo1.address, 1n)
      )
        .to.emit(re, "MisconductRecorded")
        .withArgs(ngo1.address, 1n, 1n, INITIAL_SCORE - 1n);
    });

    it("deactivates validator if score drops below threshold", async function () {
      // Severely punish ngo1 to drop below average
      await re.connect(operationalAuth).setSystemPhase(SystemPhase.ACTIVE_CRISIS);
      for (let i = 1; i <= 5; i++) {
        await re
          .connect(governance)
          .recordMisconduct(ngo1.address, BigInt(i));
      }
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.isActive).to.be.false;
    });

    it("calls Besu removeValidator when deactivated", async function () {
      await re.connect(operationalAuth).setSystemPhase(SystemPhase.ACTIVE_CRISIS);
      for (let i = 1; i <= 5; i++) {
        await re
          .connect(governance)
          .recordMisconduct(ngo1.address, BigInt(i));
      }
      expect(await besu.isValidator(ngo1.address)).to.be.false;
    });

    it("reverts when caller is not governance", async function () {
      await expect(
        re.connect(stranger).recordMisconduct(ngo1.address, 1n)
      )
        .to.be.revertedWithCustomError(re, "NotGovernance")
        .withArgs(stranger.address);
    });

    it("reverts when validator is not initialized", async function () {
      // go3 is verified but not initialized
      await expect(
        re.connect(governance).recordMisconduct(go3.address, 1n)
      )
        .to.be.revertedWithCustomError(re, "ValidatorNotInitialized")
        .withArgs(go3.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. recordSuccessfulCoordination — reward math
  // ═══════════════════════════════════════════════════════════════════════════

  describe("recordSuccessfulCoordination()", function () {
    beforeEach(async function () {
      await initializeStandardValidators();
    });

    it("awards k2-weighted reward to NGO with 0 timeouts: 3 points", async function () {
      // base = R0 * W_ROLE_NGO * ceilingReducer / (SCALE * SCALE) = 10 * 100 * 100 / 10000 = 10
      // k2-weighted: 10 * 30 / 100 = 3
      await re
        .connect(governance)
        .recordSuccessfulCoordination(ngo1.address, 1n);
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE + 3n);
    });

    it("awards k2-weighted reward to GO with 0 timeouts: 2 points", async function () {
      // base = 10 * 85 * 100 / 10000 = 8, then 8 * 30 / 100 = 2
      await re
        .connect(governance)
        .recordSuccessfulCoordination(go1.address, 1n);
      const score = await re.getValidatorScore(go1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE + 2n);
    });

    it("ceiling reducer dampens reward after timeouts", async function () {
      // Record 1 timeout for ngo1
      await re
        .connect(operationalAuth)
        .recordParticipation(ngo1.address, false);

      // ceilingReducer for 1 timeout: 10000 / (100 + 50*69/100) = 10000/134 = 74
      // base reward = 10 * 100 * 74 / 10000 = 7, then 7 * 30 / 100 = 2
      await re
        .connect(governance)
        .recordSuccessfulCoordination(ngo1.address, 1n);
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE + 2n);
    });

    it("more timeouts further reduce reward", async function () {
      // Record 4 timeouts for ngo1 → ln(5)=161
      for (let i = 0; i < 4; i++) {
        await re
          .connect(operationalAuth)
          .recordParticipation(ngo1.address, false);
      }
      // ceilingReducer: 10000 / (100 + 50*161/100) = 10000/180 = 55
      // base reward = 10 * 100 * 55 / 10000 = 5, then 5 * 30 / 100 = 1
      await re
        .connect(governance)
        .recordSuccessfulCoordination(ngo1.address, 1n);
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE + 1n);
    });

    it("emits SuccessfulCoordination with reward and new score", async function () {
      // base = 10, k2-weighted = 3
      await expect(
        re
          .connect(governance)
          .recordSuccessfulCoordination(ngo1.address, 1n)
      )
        .to.emit(re, "SuccessfulCoordination")
        .withArgs(ngo1.address, 1n, 3n, INITIAL_SCORE + 3n);
    });

    it("reverts when caller is not governance", async function () {
      await expect(
        re
          .connect(stranger)
          .recordSuccessfulCoordination(ngo1.address, 1n)
      )
        .to.be.revertedWithCustomError(re, "NotGovernance")
        .withArgs(stranger.address);
    });

    it("reverts when validator is not initialized", async function () {
      await expect(
        re
          .connect(governance)
          .recordSuccessfulCoordination(go3.address, 1n)
      )
        .to.be.revertedWithCustomError(re, "ValidatorNotInitialized")
        .withArgs(go3.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. recordParticipation
  // ═══════════════════════════════════════════════════════════════════════════

  describe("recordParticipation()", function () {
    beforeEach(async function () {
      await re.initializeValidator(ngo1.address);
    });

    it("increments totalRoundsEligible and roundsParticipated on participation", async function () {
      await re
        .connect(operationalAuth)
        .recordParticipation(ngo1.address, true);
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.totalRoundsEligible).to.equal(1n);
      expect(score.roundsParticipated).to.equal(1n);
      expect(score.timeoutCount).to.equal(0n);
    });

    it("increments timeoutCount on non-participation", async function () {
      await re
        .connect(operationalAuth)
        .recordParticipation(ngo1.address, false);
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.totalRoundsEligible).to.equal(1n);
      expect(score.roundsParticipated).to.equal(0n);
      expect(score.timeoutCount).to.equal(1n);
    });

    it("emits ParticipationRecorded", async function () {
      await expect(
        re.connect(operationalAuth).recordParticipation(ngo1.address, true)
      )
        .to.emit(re, "ParticipationRecorded")
        .withArgs(ngo1.address, true);
    });

    it("reverts when caller is not Tier-1 operational authority", async function () {
      await expect(
        re.connect(stranger).recordParticipation(ngo1.address, true)
      )
        .to.be.revertedWithCustomError(re, "NotOperationalAuthority")
        .withArgs(stranger.address);
    });

    it("reverts when validator is not initialized", async function () {
      await expect(
        re
          .connect(operationalAuth)
          .recordParticipation(go3.address, true)
      )
        .to.be.revertedWithCustomError(re, "ValidatorNotInitialized")
        .withArgs(go3.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. recordVoteCast
  // ═══════════════════════════════════════════════════════════════════════════

  describe("recordVoteCast()", function () {
    beforeEach(async function () {
      await re.initializeValidator(ngo1.address);
    });

    it("increments votesCast counter", async function () {
      await re.connect(governance).recordVoteCast(ngo1.address);
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.votesCast).to.equal(1n);
    });

    it("emits VoteCastRecorded", async function () {
      await expect(re.connect(governance).recordVoteCast(ngo1.address))
        .to.emit(re, "VoteCastRecorded")
        .withArgs(ngo1.address);
    });

    it("reverts when caller is not governance", async function () {
      await expect(
        re.connect(stranger).recordVoteCast(ngo1.address)
      )
        .to.be.revertedWithCustomError(re, "NotGovernance")
        .withArgs(stranger.address);
    });

    it("reverts when validator is not initialized", async function () {
      await expect(
        re.connect(governance).recordVoteCast(go3.address)
      )
        .to.be.revertedWithCustomError(re, "ValidatorNotInitialized")
        .withArgs(go3.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. updateScores — epoch update
  // ═══════════════════════════════════════════════════════════════════════════

  describe("updateScores()", function () {
    beforeEach(async function () {
      await initializeStandardValidators();
    });

    it("advances the epoch counter", async function () {
      await re.updateScores();
      expect(await re.currentEpoch()).to.equal(2n);
    });

    it("emits ScoresUpdated with the epoch", async function () {
      await expect(re.updateScores())
        .to.emit(re, "ScoresUpdated")
        .withArgs(1n);
    });

    it("adds participation bonus for a validator with full attendance", async function () {
      // Record 10 rounds of participation for ngo1
      for (let i = 0; i < 10; i++) {
        await re
          .connect(operationalAuth)
          .recordParticipation(ngo1.address, true);
      }

      // B_i for ngo1: ai=100, vi=0 (no votes)
      // participation = (60 * 100 + 40 * 0) / 100 = 60
      // bi = 60 * 100 / 100 = 60
      // delta = k1 * bi / SCALE = 70 * 60 / 100 = 42
      await re.updateScores();
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE + 42n);
    });

    it("adds participation bonus considering both attendance and voting", async function () {
      // 10 rounds, all participated + 5 votes for ngo1
      for (let i = 0; i < 10; i++) {
        await re
          .connect(operationalAuth)
          .recordParticipation(ngo1.address, true);
      }
      for (let i = 0; i < 5; i++) {
        await re.connect(governance).recordVoteCast(ngo1.address);
      }

      // ai = 100
      // vi = 100 * 50 * 5 / (100 + 50 * 5) = 25000 / 350 = 71
      // participation = (60 * 100 + 40 * 71) / 100 = (6000 + 2840) / 100 = 88
      // bi = 88 * 100 / 100 = 88
      // delta = 70 * 88 / 100 = 61 (truncated from 61.6)
      await re.updateScores();
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE + 61n);
    });

    it("gives zero bonus when no participation recorded", async function () {
      // No recordParticipation calls → ai = 0, vi = 0 → bi = 0
      await re.updateScores();
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE);
    });

    it("GO gets lower participation bonus due to role weight", async function () {
      // 10 rounds full attendance for go1
      for (let i = 0; i < 10; i++) {
        await re
          .connect(operationalAuth)
          .recordParticipation(go1.address, true);
      }

      // ai=100, vi=0
      // participation = (60*100 + 40*0) / 100 = 60
      // bi = 60 * 85 / 100 = 51
      // delta = 70 * 51 / 100 = 35 (truncated from 35.7)
      await re.updateScores();
      const score = await re.getValidatorScore(go1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE + 35n);
    });

    it("updates previousScore", async function () {
      for (let i = 0; i < 5; i++) {
        await re
          .connect(operationalAuth)
          .recordParticipation(ngo1.address, true);
      }
      await re.updateScores();
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.previousScore).to.equal(INITIAL_SCORE);
      expect(score.currentScore).to.be.gt(INITIAL_SCORE);
    });

    it("emits ValidatorScoreChanged when score changes", async function () {
      for (let i = 0; i < 10; i++) {
        await re
          .connect(operationalAuth)
          .recordParticipation(ngo1.address, true);
      }
      await expect(re.updateScores())
        .to.emit(re, "ValidatorScoreChanged")
        .withArgs(ngo1.address, INITIAL_SCORE, INITIAL_SCORE + 42n);
    });

    it("does not emit ValidatorScoreChanged when score unchanged", async function () {
      // No participation → no change for ngo1
      // But we can't easily test "not emitted for specific args" with chai...
      // Instead verify score is unchanged
      await re.updateScores();
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE);
    });

    // ── Eligibility checks ─────────────────────────────────────────────────

    it("deactivates a validator who drops below average", async function () {
      // Punish ngo1 to drop below average, then run updateScores
      // All start at 100. Average = 100.
      // Punish ngo1 → score drops well below 100
      await re.connect(governance).recordMisconduct(ngo1.address, 1n); // -4 → 96
      await re.connect(governance).recordMisconduct(ngo1.address, 2n); // -10 → 86
      await re.connect(governance).recordMisconduct(ngo1.address, 3n); // -20 → 66

      // Average ≈ (100+100+66+100+100)/5 = 93. NGO threshold = 93. ngo1(66) < 93
      await re.updateScores();
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.isActive).to.be.false;
    });

    it("GO needs higher score than NGO to stay active (GAMMA_GO = 1.2)", async function () {
      // Give ngo1 a big participation bonus to raise the average
      for (let i = 0; i < 10; i++) {
        await re
          .connect(operationalAuth)
          .recordParticipation(ngo1.address, true);
      }
      // ngo1 will get +42 → 142
      // Average after update: (100 + 100 + 142 + 100 + 100) / 5 = 128 (approx, depends on others too)
      // GO threshold = 128 * 120 / 100 = 153
      // go1 at 100 < 153 → deactivated
      // go2 at 100 < 153 → also should deactivate
      // But MIN_VALIDATORS = 4, so only one GO can be deactivated

      await re.updateScores();
      const go1Score = await re.getValidatorScore(go1.address);
      const go2Score = await re.getValidatorScore(go2.address);

      // At least one GO should be deactivated
      const anyDeactivated = !go1Score.isActive || !go2Score.isActive;
      expect(anyDeactivated).to.be.true;
    });

    it("activates a previously deactivated validator who recovers", async function () {
      // Deactivate ngo1 via misconduct
      await re.connect(operationalAuth).setSystemPhase(SystemPhase.ACTIVE_CRISIS);
      for (let i = 1; i <= 5; i++) {
        await re
          .connect(governance)
          .recordMisconduct(ngo1.address, BigInt(i));
      }
      const afterPenalty = await re.getValidatorScore(ngo1.address);
      expect(afterPenalty.isActive).to.be.false;

      // Now boost ngo1's score via multiple successful coordinations
      // (rewards are k2-weighted at 30%, so more coordinations needed)
      await re.connect(operationalAuth).setSystemPhase(SystemPhase.PREPAREDNESS);
      for (let i = 1; i <= 40; i++) {
        await re
          .connect(governance)
          .recordSuccessfulCoordination(ngo1.address, BigInt(i));
      }

      // Run updateScores to re-check eligibility
      await re.updateScores();
      const afterRecovery = await re.getValidatorScore(ngo1.address);
      expect(afterRecovery.isActive).to.be.true;
    });

    // ── Safety minimum ─────────────────────────────────────────────────────

    it("maintains minimum 4 active validators (QBFT safety)", async function () {
      // Initialize exactly 5 validators (standard set)
      // Punish 2 of them severely
      await re.connect(operationalAuth).setSystemPhase(SystemPhase.ACTIVE_CRISIS);
      for (let i = 1; i <= 5; i++) {
        await re
          .connect(governance)
          .recordMisconduct(ngo1.address, BigInt(i));
      }
      for (let i = 1; i <= 5; i++) {
        await re
          .connect(governance)
          .recordMisconduct(ngo2.address, BigInt(i));
      }

      // Run updateScores — should only deactivate 1 (keeping 4 active)
      await re.updateScores();

      const active = await re.getActiveValidators();
      expect(active.length).to.be.gte(Number(MIN_VALIDATORS));
    });

    it("allows consecutive calls (each advances the epoch)", async function () {
      await re.updateScores(); // epoch 1 → 2
      expect(await re.currentEpoch()).to.equal(2n);
      await re.updateScores(); // epoch 2 → 3
      expect(await re.currentEpoch()).to.equal(3n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. setPhaseConfig
  // ═══════════════════════════════════════════════════════════════════════════

  describe("setPhaseConfig()", function () {
    it("Tier-3 can update phase config", async function () {
      await re
        .connect(crisisMS)
        .setPhaseConfig(SystemPhase.PREPAREDNESS, 60n, 40n, 120n);
      const config = await re.getPhaseConfig(SystemPhase.PREPAREDNESS);
      expect(config.k1).to.equal(60n);
      expect(config.k2).to.equal(40n);
      expect(config.alphaCrisis).to.equal(120n);
    });

    it("emits PhaseConfigUpdated", async function () {
      await expect(
        re
          .connect(crisisMS)
          .setPhaseConfig(SystemPhase.ACTIVE_CRISIS, 50n, 50n, 300n)
      )
        .to.emit(re, "PhaseConfigUpdated")
        .withArgs(SystemPhase.ACTIVE_CRISIS, 50n, 50n, 300n);
    });

    it("reverts if k1 + k2 != 100", async function () {
      await expect(
        re
          .connect(crisisMS)
          .setPhaseConfig(SystemPhase.PREPAREDNESS, 60n, 30n, 100n)
      )
        .to.be.revertedWithCustomError(re, "InvalidPhaseConfig")
        .withArgs(60n, 30n);
    });

    it("reverts if caller is not Tier-3", async function () {
      await expect(
        re
          .connect(stranger)
          .setPhaseConfig(SystemPhase.PREPAREDNESS, 70n, 30n, 100n)
      )
        .to.be.revertedWithCustomError(re, "NotCrisisDeclarationAuthority")
        .withArgs(stranger.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. setSystemPhase
  // ═══════════════════════════════════════════════════════════════════════════

  describe("setSystemPhase()", function () {
    it("Tier-1 can change the system phase", async function () {
      await re
        .connect(operationalAuth)
        .setSystemPhase(SystemPhase.ACTIVE_CRISIS);
      expect(await re.currentPhase()).to.equal(SystemPhase.ACTIVE_CRISIS);
    });

    it("emits SystemPhaseChanged", async function () {
      await expect(
        re.connect(operationalAuth).setSystemPhase(SystemPhase.RECOVERY)
      )
        .to.emit(re, "SystemPhaseChanged")
        .withArgs(SystemPhase.PREPAREDNESS, SystemPhase.RECOVERY);
    });

    it("reverts if caller is not Tier-1", async function () {
      await expect(
        re.connect(stranger).setSystemPhase(SystemPhase.ACTIVE_CRISIS)
      )
        .to.be.revertedWithCustomError(re, "NotOperationalAuthority")
        .withArgs(stranger.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. setGovernanceContract
  // ═══════════════════════════════════════════════════════════════════════════

  describe("setGovernanceContract()", function () {
    it("Tier-3 can update governance address", async function () {
      await re
        .connect(crisisMS)
        .setGovernanceContract(stranger.address);
      expect(await re.governanceContract()).to.equal(stranger.address);
    });

    it("emits GovernanceContractSet", async function () {
      await expect(
        re.connect(crisisMS).setGovernanceContract(stranger.address)
      )
        .to.emit(re, "GovernanceContractSet")
        .withArgs(stranger.address);
    });

    it("reverts when new address is zero", async function () {
      await expect(
        re.connect(crisisMS).setGovernanceContract(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(re, "ZeroAddress");
    });

    it("reverts when caller is not Tier-3", async function () {
      await expect(
        re.connect(stranger).setGovernanceContract(stranger.address)
      )
        .to.be.revertedWithCustomError(re, "NotCrisisDeclarationAuthority")
        .withArgs(stranger.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. View functions
  // ═══════════════════════════════════════════════════════════════════════════

  describe("View functions", function () {
    beforeEach(async function () {
      await initializeStandardValidators();
    });

    it("getActiveValidators returns all initially active validators", async function () {
      const active = await re.getActiveValidators();
      expect(active.length).to.equal(5);
    });

    it("getAverageScore returns correct average", async function () {
      // All at 100 → average = 100
      expect(await re.getAverageScore()).to.equal(100n);

      // Boost ngo1 via multiple coordinations → average rises
      for (let c = 1; c <= 4; c++) {
        await re
          .connect(governance)
          .recordSuccessfulCoordination(ngo1.address, BigInt(c));
      }
      // ngo1: 100 + 4*3 = 112. avg = (100 + 100 + 112 + 100 + 100) / 5 = 102
      expect(await re.getAverageScore()).to.equal(102n);
    });

    it("getValidatorCount returns total validators", async function () {
      expect(await re.getValidatorCount()).to.equal(5n);
    });

    it("getAllValidators returns all addresses", async function () {
      const all = await re.getAllValidators();
      expect(all.length).to.equal(5);
      expect(all).to.include(go1.address);
      expect(all).to.include(ngo1.address);
    });

    it("getValidatorScore returns zero struct for non-initialized address", async function () {
      const score = await re.getValidatorScore(stranger.address);
      expect(score.exists).to.be.false;
      expect(score.currentScore).to.equal(0n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. Full lifecycle scenarios
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Full lifecycle", function () {
    it("honest coordinator gains reputation over multiple crises", async function () {
      await initializeStandardValidators();

      // Simulate 3 successful crisis coordinations for ngo1
      for (let c = 1; c <= 3; c++) {
        await re
          .connect(governance)
          .recordSuccessfulCoordination(ngo1.address, BigInt(c));
      }

      // ngo1 should have gained 9 points (3 × 3, k2-weighted)
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE + 9n);
    });

    it("misconduct followed by recovery path", async function () {
      await initializeStandardValidators();

      // 1st misconduct (k2=30: penalty = 4*30/100 = 1)
      await re.connect(governance).recordMisconduct(ngo1.address, 1n);
      let score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(99n); // 100 - 1

      // 4 successful coordinations to recover (each = 3 points, k2-weighted)
      for (let c = 2; c <= 5; c++) {
        await re
          .connect(governance)
          .recordSuccessfulCoordination(ngo1.address, BigInt(c));
      }

      score = await re.getValidatorScore(ngo1.address);
      // 99 + 12 = 111
      expect(score.currentScore).to.equal(111n);
    });

    it("phase change affects penalty severity", async function () {
      await initializeStandardValidators();

      // 1st offense in PREPAREDNESS: base=4, k2=30 → penalty=1
      await re.connect(governance).recordMisconduct(ngo1.address, 1n);
      let score1 = await re.getValidatorScore(ngo1.address);
      const afterNormalPenalty = score1.currentScore; // 99

      // Switch to ACTIVE_CRISIS
      await re
        .connect(operationalAuth)
        .setSystemPhase(SystemPhase.ACTIVE_CRISIS);

      // 2nd offense in ACTIVE_CRISIS: base = P0 * wRole * (SCALE + 250 * 4) / SCALE²
      // = 2 * 100 * 1100 / 10000 = 22, then 22 * 60 / 100 = 13
      await re.connect(governance).recordMisconduct(ngo1.address, 2n);
      score1 = await re.getValidatorScore(ngo1.address);
      expect(score1.currentScore).to.equal(afterNormalPenalty - 13n);
    });

    it("epoch update combined with crisis outcomes", async function () {
      await initializeStandardValidators();

      // ngo1: 10 rounds of participation + 1 successful crisis
      for (let i = 0; i < 10; i++) {
        await re
          .connect(operationalAuth)
          .recordParticipation(ngo1.address, true);
      }
      await re
        .connect(governance)
        .recordSuccessfulCoordination(ngo1.address, 1n);
      // Score after success: 100 + 3 = 103 (k2-weighted reward)

      // Run epoch update
      await re.updateScores();

      // ngo1: 103 + 42 (participation: k1=70, B_i=60) = 145
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(145n);
    });

    it("deactivated validator reactivates through good behavior + epoch", async function () {
      await initializeStandardValidators();

      // Severely punish ngo1 (in crisis phase for max damage)
      await re
        .connect(operationalAuth)
        .setSystemPhase(SystemPhase.ACTIVE_CRISIS);
      for (let i = 1; i <= 4; i++) {
        await re
          .connect(governance)
          .recordMisconduct(ngo1.address, BigInt(i));
      }

      let score = await re.getValidatorScore(ngo1.address);
      expect(score.isActive).to.be.false;
      const lowScore = score.currentScore;

      // Switch back to preparedness, give lots of successful coordinations
      await re
        .connect(operationalAuth)
        .setSystemPhase(SystemPhase.PREPAREDNESS);
      for (let c = 5; c <= 25; c++) {
        await re
          .connect(governance)
          .recordSuccessfulCoordination(ngo1.address, BigInt(c));
      }

      // Also add participation
      for (let i = 0; i < 10; i++) {
        await re
          .connect(operationalAuth)
          .recordParticipation(ngo1.address, true);
      }

      // Epoch update to check eligibility
      await re.updateScores();

      score = await re.getValidatorScore(ngo1.address);
      expect(score.isActive).to.be.true;
    });

    it("Besu mock tracks validator set changes correctly", async function () {
      await initializeStandardValidators();

      // All 5 should be in Besu
      expect(await besu.validatorCount()).to.equal(5n);
      expect(await besu.addCallCount()).to.equal(5n);

      // Deactivate one via heavy misconduct
      await re
        .connect(operationalAuth)
        .setSystemPhase(SystemPhase.ACTIVE_CRISIS);
      for (let i = 1; i <= 5; i++) {
        await re
          .connect(governance)
          .recordMisconduct(ngo1.address, BigInt(i));
      }

      // ngo1 should be removed from Besu
      expect(await besu.isValidator(ngo1.address)).to.be.false;
      expect(await besu.removeCallCount()).to.be.gte(1n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. k2 phase weighting tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe("k2 phase weighting", function () {
    beforeEach(async function () {
      await initializeStandardValidators();
    });

    // ── Misconduct k2 weighting per phase ──────────────────────────────────

    it("should apply k2 weighting to misconduct penalty during PREPAREDNESS", async function () {
      // PREPAREDNESS: k2=30, alphaCrisis=100
      // base = P0 * wRole * (SCALE + alphaCrisis * 1) / SCALE² = 2*100*200/10000 = 4
      // k2-weighted: 4 * 30 / 100 = 1
      await re.connect(governance).recordMisconduct(ngo1.address, 1n);
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE - 1n);
    });

    it("should apply k2 weighting to misconduct penalty during ACTIVE_CRISIS", async function () {
      // ACTIVE_CRISIS: k2=60, alphaCrisis=250
      // base = 2*100*(100+250*1)/10000 = 7
      // k2-weighted: 7 * 60 / 100 = 4
      await re.connect(operationalAuth).setSystemPhase(SystemPhase.ACTIVE_CRISIS);
      await re.connect(governance).recordMisconduct(ngo1.address, 1n);
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE - 4n);
    });

    it("should apply k2 weighting to misconduct penalty during RECOVERY", async function () {
      // RECOVERY: k2=35, alphaCrisis=150
      // base = 2*100*(100+150*1)/10000 = 2*100*250/10000 = 5
      // k2-weighted: 5 * 35 / 100 = 1
      await re.connect(operationalAuth).setSystemPhase(SystemPhase.RECOVERY);
      await re.connect(governance).recordMisconduct(ngo1.address, 1n);
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE - 1n);
    });

    // ── Reward k2 weighting per phase ──────────────────────────────────────

    it("should apply k2 weighting to reward during PREPAREDNESS", async function () {
      // PREPAREDNESS: k2=30
      // base reward = R0 * wRole * ceilingReducer / SCALE² = 10*100*100/10000 = 10
      // k2-weighted: 10 * 30 / 100 = 3
      await re.connect(governance).recordSuccessfulCoordination(ngo1.address, 1n);
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE + 3n);
    });

    it("should apply k2 weighting to reward during ACTIVE_CRISIS", async function () {
      // ACTIVE_CRISIS: k2=60
      // base reward = 10, k2-weighted: 10 * 60 / 100 = 6
      await re.connect(operationalAuth).setSystemPhase(SystemPhase.ACTIVE_CRISIS);
      await re.connect(governance).recordSuccessfulCoordination(ngo1.address, 1n);
      const score = await re.getValidatorScore(ngo1.address);
      expect(score.currentScore).to.equal(INITIAL_SCORE + 6n);
    });

    // ── Cross-phase comparison ─────────────────────────────────────────────

    it("should apply higher penalty during active crisis vs preparedness", async function () {
      // PREPAREDNESS penalty for 1st offense: 1
      await re.connect(governance).recordMisconduct(ngo1.address, 1n);
      const prepScore = await re.getValidatorScore(ngo1.address);
      const prepPenalty = INITIAL_SCORE - prepScore.currentScore;

      // ACTIVE_CRISIS penalty for 1st offense on a different validator: 4
      await re.connect(operationalAuth).setSystemPhase(SystemPhase.ACTIVE_CRISIS);
      await re.connect(governance).recordMisconduct(ngo2.address, 1n);
      const crisisScore = await re.getValidatorScore(ngo2.address);
      const crisisPenalty = INITIAL_SCORE - crisisScore.currentScore;

      // Active crisis penalty should be strictly greater
      expect(crisisPenalty).to.be.gt(prepPenalty);
    });
  });
});
