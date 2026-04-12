import { expect } from "chai";
import { ethers } from "hardhat";
import { Governance, DonationManager, Registry, MockReputationEngine } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

enum Role {
  GO             = 0,
  NGO            = 1,
  Donor          = 2,
  Beneficiary    = 3,
  PrivateCompany = 4,
}

enum Phase {
  DECLARED = 0,
  VOTING   = 1,
  ACTIVE   = 2,
  REVIEW   = 3,
  PAUSED   = 4,
  CLOSED   = 5,
}

const EMPTY_PROOF         = "0x";
const VOTING_DURATION     = 48 * 60 * 60;       // 48 hours in seconds
const MISCONDUCT_DURATION = 72 * 60 * 60;       // 72 hours in seconds
const BASE_CAP            = 100n;               // baseDonationCap = 100 AID
const GO_REQUIRED         = BASE_CAP * 15n;     // 1500 AID to vote / run as GO
const NGO_REQUIRED        = BASE_CAP * 10n;     // 1000 AID to vote / run as NGO
const DONOR_REQUIRED      = BASE_CAP * 1n;      // 100 AID to vote as Donor

async function mineTime(seconds: number): Promise<void> {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Governance", function () {
  // ── Signers ─────────────────────────────────────────────────────────────────
  let deployer:        HardhatEthersSigner;
  let operationalAuth: HardhatEthersSigner; // Tier-1
  let verificationMS:  HardhatEthersSigner; // Tier-2
  let crisisMS:        HardhatEthersSigner; // Tier-3 (declares crisis + misconduct)
  let go1:             HardhatEthersSigner; // Government Organisation #1
  let go2:             HardhatEthersSigner; // Government Organisation #2
  let go3:             HardhatEthersSigner; // Government Organisation #3
  let ngo1:            HardhatEthersSigner; // Candidate NGO #1
  let ngo2:            HardhatEthersSigner; // Candidate NGO #2
  let donor1:          HardhatEthersSigner; // Regular donor / voter
  let donor2:          HardhatEthersSigner;
  let donor3:          HardhatEthersSigner;
  let beneficiary1:    HardhatEthersSigner; // Crisis-verified beneficiary
  let stranger:        HardhatEthersSigner; // Not registered

  // ── Contracts ────────────────────────────────────────────────────────────────
  let registry:    Registry;
  let dm:          DonationManager;
  let governance:  Governance;
  let mockRepEng:  MockReputationEngine;

  // ─────────────────────────────────────────────────────────────────────────
  // Shared fixture — runs before every test
  // ─────────────────────────────────────────────────────────────────────────

  beforeEach(async function () {
    [
      deployer,
      operationalAuth,
      verificationMS,
      crisisMS,
      go1, go2, go3,
      ngo1, ngo2,
      donor1, donor2, donor3,
      beneficiary1,
      stranger,
    ] = await ethers.getSigners();

    // ── 1. Registry ──────────────────────────────────────────────────────────
    const RegistryFactory = await ethers.getContractFactory("Registry");
    registry = await RegistryFactory.deploy(
      operationalAuth.address,
      verificationMS.address,
      crisisMS.address,
    );

    // ── 2. DonationManager (governance not wired yet) ────────────────────────
    const DMFactory = await ethers.getContractFactory("DonationManager");
    dm = await DMFactory.deploy(registry.target, ethers.ZeroAddress);

    // ── 3. MockReputationEngine ───────────────────────────────────────────────
    const MockRepFactory = await ethers.getContractFactory("MockReputationEngine");
    mockRepEng = await MockRepFactory.deploy();

    // ── 4. Governance ────────────────────────────────────────────────────────
    const GovFactory = await ethers.getContractFactory("Governance");
    governance = await GovFactory.deploy(
      registry.target,
      dm.target,
      ethers.ZeroAddress, // ReputationEngine wired up separately
    );

    // ── 5. Wire up cross-contract references ─────────────────────────────────
    await dm.connect(deployer).setGovernanceContract(governance.target);
    await governance.connect(crisisMS).setReputationEngine(mockRepEng.target);

    // ── 6. Populate Registry ─────────────────────────────────────────────────
    // GOs (pre-verified by deployer)
    await registry.connect(deployer).registerGO(go1.address);
    await registry.connect(deployer).registerGO(go2.address);
    await registry.connect(deployer).registerGO(go3.address);

    // NGOs (self-register, then Tier-2 verifies)
    await registry.connect(ngo1).registerNGO(ngo1.address);
    await registry.connect(verificationMS).verifyNGO(ngo1.address, EMPTY_PROOF);
    await registry.connect(ngo2).registerNGO(ngo2.address);
    await registry.connect(verificationMS).verifyNGO(ngo2.address, EMPTY_PROOF);

    // Donors
    await registry.connect(donor1).registerParticipant(donor1.address, Role.Donor);
    await registry.connect(donor2).registerParticipant(donor2.address, Role.Donor);
    await registry.connect(donor3).registerParticipant(donor3.address, Role.Donor);

    // Beneficiary (registered; crisis-verification happens per test)
    await registry.connect(beneficiary1).registerParticipant(beneficiary1.address, Role.Beneficiary);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Helper: declare a crisis and return its ID
  // ─────────────────────────────────────────────────────────────────────────
  async function declareCrisis(baseCap = BASE_CAP): Promise<bigint> {
    const tx = await governance
      .connect(crisisMS)
      .declareCrisis("Earthquake Al Haouz", baseCap);
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((log) => {
        try { return governance.interface.parseLog(log); } catch { return null; }
      })
      .find((e) => e?.name === "CrisisDeclared");
    return event!.args.crisisId as bigint;
  }

  // Helper: reach VOTING phase (crisis declared + candidates registered + startVoting)
  async function reachVotingPhase(crisisId: bigint): Promise<void> {
    // GOs donate to meet their cap
    await dm.connect(go1).donateFT(crisisId, GO_REQUIRED);
    await dm.connect(go2).donateFT(crisisId, GO_REQUIRED);
    await dm.connect(go3).donateFT(crisisId, GO_REQUIRED);
    // NGO candidates donate to meet their cap
    await dm.connect(ngo1).donateFT(crisisId, NGO_REQUIRED);
    await dm.connect(ngo2).donateFT(crisisId, NGO_REQUIRED);
    // Register candidates
    await governance.connect(ngo1).registerAsCandidate(crisisId);
    await governance.connect(ngo2).registerAsCandidate(crisisId);
    // Start voting
    await governance.connect(operationalAuth).startVoting(crisisId);
  }

  // Helper: advance past voting window and finalize
  async function finalizeElectionAfterVoting(crisisId: bigint): Promise<void> {
    await mineTime(VOTING_DURATION + 1);
    await governance.connect(stranger).finalizeElection(crisisId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Deployment & configuration
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("stores registry and donationManager addresses", async function () {
      expect(await governance.registry()).to.equal(registry.target);
      expect(await governance.donationManager()).to.equal(dm.target);
    });

    it("starts with nextCrisisId = 1", async function () {
      expect(await governance.nextCrisisId()).to.equal(1n);
    });

    it("stores the reputation engine set in setUp", async function () {
      expect(await governance.reputationEngine()).to.equal(mockRepEng.target);
    });

    it("emits ReputationEngineSet when wiring reputation engine", async function () {
      // Deploy fresh Governance and wire up
      const GovFactory = await ethers.getContractFactory("Governance");
      const g2 = await GovFactory.deploy(registry.target, dm.target, ethers.ZeroAddress);
      await expect(g2.connect(crisisMS).setReputationEngine(mockRepEng.target))
        .to.emit(g2, "ReputationEngineSet")
        .withArgs(mockRepEng.target);
    });

    it("reverts if non-Tier-3 tries to set reputation engine", async function () {
      const GovFactory = await ethers.getContractFactory("Governance");
      const g2 = await GovFactory.deploy(registry.target, dm.target, ethers.ZeroAddress);
      await expect(g2.connect(stranger).setReputationEngine(mockRepEng.target))
        .to.be.revertedWithCustomError(g2, "NotCrisisDeclarationAuthority")
        .withArgs(stranger.address);
    });

    it("reverts if zero address passed to setReputationEngine", async function () {
      const GovFactory = await ethers.getContractFactory("Governance");
      const g2 = await GovFactory.deploy(registry.target, dm.target, ethers.ZeroAddress);
      await expect(g2.connect(crisisMS).setReputationEngine(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(g2, "ZeroAddress");
    });

    it("reverts if zero addresses passed to constructor", async function () {
      const GovFactory = await ethers.getContractFactory("Governance");
      await expect(
        GovFactory.deploy(ethers.ZeroAddress, dm.target, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(governance, "ZeroAddress");
      await expect(
        GovFactory.deploy(registry.target, ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(governance, "ZeroAddress");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. declareCrisis
  // ═══════════════════════════════════════════════════════════════════════════

  describe("declareCrisis", function () {
    it("Tier-3 multisig can declare a crisis", async function () {
      await expect(
        governance.connect(crisisMS).declareCrisis("Flood Souss", BASE_CAP)
      )
        .to.emit(governance, "CrisisDeclared")
        .withArgs(1n, "Flood Souss");

      const crisis = await governance.getCrisis(1n);
      expect(crisis.crisisId).to.equal(1n);
      expect(crisis.description).to.equal("Flood Souss");
      expect(crisis.baseDonationCap).to.equal(BASE_CAP);
      expect(crisis.phase).to.equal(Phase.DECLARED);
      expect(crisis.coordinator).to.equal(ethers.ZeroAddress);
      expect(crisis.misconductFlagged).to.be.false;
    });

    it("auto-increments crisis IDs", async function () {
      const tx1 = await governance.connect(crisisMS).declareCrisis("Crisis A", BASE_CAP);
      const tx2 = await governance.connect(crisisMS).declareCrisis("Crisis B", BASE_CAP);
      await tx1.wait();
      await tx2.wait();
      const c1 = await governance.getCrisis(1n);
      const c2 = await governance.getCrisis(2n);
      expect(c1.crisisId).to.equal(1n);
      expect(c2.crisisId).to.equal(2n);
      expect(await governance.nextCrisisId()).to.equal(3n);
    });

    it("activates the crisis in DonationManager", async function () {
      await governance.connect(crisisMS).declareCrisis("Flood", BASE_CAP);
      expect(await dm.activeCrises(1n)).to.be.true;
    });

    it("reverts if caller is not Tier-3 multisig", async function () {
      await expect(
        governance.connect(operationalAuth).declareCrisis("Flood", BASE_CAP)
      )
        .to.be.revertedWithCustomError(governance, "NotCrisisDeclarationAuthority")
        .withArgs(operationalAuth.address);

      await expect(
        governance.connect(stranger).declareCrisis("Flood", BASE_CAP)
      )
        .to.be.revertedWithCustomError(governance, "NotCrisisDeclarationAuthority")
        .withArgs(stranger.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. registerAsCandidate
  // ═══════════════════════════════════════════════════════════════════════════

  describe("registerAsCandidate", function () {
    let crisisId: bigint;

    beforeEach(async function () {
      crisisId = await declareCrisis();
    });

    it("verified NGO who met donation cap can register", async function () {
      await dm.connect(ngo1).donateFT(crisisId, NGO_REQUIRED);
      await expect(governance.connect(ngo1).registerAsCandidate(crisisId))
        .to.emit(governance, "CandidateRegistered")
        .withArgs(crisisId, ngo1.address);

      const candidates = await governance.getCandidates(crisisId);
      expect(candidates.length).to.equal(1);
      expect(candidates[0].candidate).to.equal(ngo1.address);
      expect(candidates[0].voteCount).to.equal(0n);
      expect(candidates[0].goVoteCount).to.equal(0n);
    });

    it("verified GO who met donation cap can register", async function () {
      await dm.connect(go1).donateFT(crisisId, GO_REQUIRED);
      await expect(governance.connect(go1).registerAsCandidate(crisisId))
        .to.emit(governance, "CandidateRegistered")
        .withArgs(crisisId, go1.address);
    });

    it("reverts if candidate is not a verified validator", async function () {
      // Unverified NGO (not yet WANGO-verified)
      await registry.connect(stranger).registerParticipant(stranger.address, Role.Donor);
      await expect(governance.connect(stranger).registerAsCandidate(crisisId))
        .to.be.revertedWithCustomError(governance, "NotVerifiedValidator")
        .withArgs(stranger.address);
    });

    it("reverts if unverified NGO tries to register", async function () {
      const [,,,,,,,,,,,,, unverifiedNGO] = await ethers.getSigners();
      await registry.connect(unverifiedNGO).registerNGO(unverifiedNGO.address);
      // Not verified by Tier-2 multisig
      await expect(governance.connect(unverifiedNGO).registerAsCandidate(crisisId))
        .to.be.revertedWithCustomError(governance, "NotVerifiedValidator")
        .withArgs(unverifiedNGO.address);
    });

    it("reverts if NGO has not met the 10× donation cap", async function () {
      await dm.connect(ngo1).donateFT(crisisId, NGO_REQUIRED - 1n); // 1 AID short
      await expect(governance.connect(ngo1).registerAsCandidate(crisisId))
        .to.be.revertedWithCustomError(governance, "InsufficientDonation")
        .withArgs(ngo1.address, NGO_REQUIRED, NGO_REQUIRED - 1n);
    });

    it("reverts if GO has not met the 15× donation cap", async function () {
      await dm.connect(go1).donateFT(crisisId, GO_REQUIRED - 1n);
      await expect(governance.connect(go1).registerAsCandidate(crisisId))
        .to.be.revertedWithCustomError(governance, "InsufficientDonation")
        .withArgs(go1.address, GO_REQUIRED, GO_REQUIRED - 1n);
    });

    it("reverts on duplicate registration", async function () {
      await dm.connect(ngo1).donateFT(crisisId, NGO_REQUIRED);
      await governance.connect(ngo1).registerAsCandidate(crisisId);
      await expect(governance.connect(ngo1).registerAsCandidate(crisisId))
        .to.be.revertedWithCustomError(governance, "AlreadyCandidate")
        .withArgs(ngo1.address, crisisId);
    });

    it("reverts for a non-existent crisis", async function () {
      await expect(governance.connect(ngo1).registerAsCandidate(999n))
        .to.be.revertedWithCustomError(governance, "CrisisNotFound")
        .withArgs(999n);
    });

    it("reverts if crisis is past VOTING phase (ACTIVE)", async function () {
      await reachVotingPhase(crisisId);
      await finalizeElectionAfterVoting(crisisId);
      await expect(governance.connect(ngo1).registerAsCandidate(crisisId))
        .to.be.revertedWithCustomError(governance, "WrongPhase");
    });

    it("allows registration during VOTING phase", async function () {
      await dm.connect(ngo1).donateFT(crisisId, NGO_REQUIRED);
      await governance.connect(ngo1).registerAsCandidate(crisisId);
      await governance.connect(operationalAuth).startVoting(crisisId);

      // ngo2 registers during VOTING phase
      await dm.connect(ngo2).donateFT(crisisId, NGO_REQUIRED);
      await expect(governance.connect(ngo2).registerAsCandidate(crisisId))
        .to.emit(governance, "CandidateRegistered")
        .withArgs(crisisId, ngo2.address);
    });

    it("allows registration when baseDonationCap is 0 (open election)", async function () {
      const openCrisisId = await declareCrisis(0n);
      await expect(governance.connect(ngo1).registerAsCandidate(openCrisisId))
        .to.emit(governance, "CandidateRegistered");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. startVoting
  // ═══════════════════════════════════════════════════════════════════════════

  describe("startVoting", function () {
    let crisisId: bigint;

    beforeEach(async function () {
      crisisId = await declareCrisis();
      await dm.connect(ngo1).donateFT(crisisId, NGO_REQUIRED);
      await governance.connect(ngo1).registerAsCandidate(crisisId);
    });

    it("Tier-1 operator starts voting and emits event", async function () {
      const tx = await governance.connect(operationalAuth).startVoting(crisisId);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      await expect(tx)
        .to.emit(governance, "VotingStarted")
        .withArgs(crisisId, block!.timestamp, block!.timestamp + VOTING_DURATION);

      const crisis = await governance.getCrisis(crisisId);
      expect(crisis.phase).to.equal(Phase.VOTING);
      expect(await governance.votingEnd(crisisId)).to.be.gt(0n);
    });

    it("reverts if caller is not Tier-1 operator", async function () {
      await expect(governance.connect(crisisMS).startVoting(crisisId))
        .to.be.revertedWithCustomError(governance, "NotOperationalAuthority")
        .withArgs(crisisMS.address);
      await expect(governance.connect(stranger).startVoting(crisisId))
        .to.be.revertedWithCustomError(governance, "NotOperationalAuthority")
        .withArgs(stranger.address);
    });

    it("reverts if crisis is not in DECLARED phase", async function () {
      await governance.connect(operationalAuth).startVoting(crisisId);
      await expect(governance.connect(operationalAuth).startVoting(crisisId))
        .to.be.revertedWithCustomError(governance, "WrongPhase");
    });

    it("reverts if no candidates have registered", async function () {
      const id2 = await declareCrisis();
      await expect(governance.connect(operationalAuth).startVoting(id2))
        .to.be.revertedWithCustomError(governance, "NoCandidates")
        .withArgs(id2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. castVote
  // ═══════════════════════════════════════════════════════════════════════════

  describe("castVote", function () {
    let crisisId: bigint;

    beforeEach(async function () {
      crisisId = await declareCrisis();
      await reachVotingPhase(crisisId);
      // Donors meet 1× cap
      await dm.connect(donor1).donateFT(crisisId, DONOR_REQUIRED);
      await dm.connect(donor2).donateFT(crisisId, DONOR_REQUIRED);
      // Beneficiary crisis-verified
      await registry
        .connect(verificationMS)
        .verifyBeneficiary(beneficiary1.address, crisisId, EMPTY_PROOF);
    });

    it("donor who met cap can vote", async function () {
      await expect(governance.connect(donor1).castVote(crisisId, ngo1.address))
        .to.emit(governance, "VoteCast")
        .withArgs(crisisId, donor1.address, ngo1.address);

      const candidates = await governance.getCandidates(crisisId);
      const ngo1Entry = candidates.find((c) => c.candidate === ngo1.address)!;
      expect(ngo1Entry.voteCount).to.equal(1n);
      expect(await governance.hasVoted(donor1.address, crisisId, 0n)).to.be.true;
    });

    it("crisis-verified beneficiary can vote without donation", async function () {
      await expect(
        governance.connect(beneficiary1).castVote(crisisId, ngo1.address)
      ).to.emit(governance, "VoteCast");
    });

    it("GO vote is tracked separately (goVoteCount increases)", async function () {
      await governance.connect(go1).castVote(crisisId, ngo1.address);

      const candidates = await governance.getCandidates(crisisId);
      const ngo1Entry = candidates.find((c) => c.candidate === ngo1.address)!;
      expect(ngo1Entry.goVoteCount).to.equal(1n);
      expect(ngo1Entry.voteCount).to.equal(0n);
    });

    it("reverts if donor has not met the 1× donation cap", async function () {
      await expect(governance.connect(donor3).castVote(crisisId, ngo1.address))
        .to.be.revertedWithCustomError(governance, "InsufficientDonation")
        .withArgs(donor3.address, DONOR_REQUIRED, 0n);
    });

    it("reverts if beneficiary is not crisis-verified", async function () {
      const [,,,,,,,,,,,,,,, unverifiedBenef] = await ethers.getSigners();
      await registry
        .connect(unverifiedBenef)
        .registerParticipant(unverifiedBenef.address, Role.Beneficiary);
      await expect(
        governance.connect(unverifiedBenef).castVote(crisisId, ngo1.address)
      )
        .to.be.revertedWithCustomError(governance, "NotCrisisVerifiedBeneficiary")
        .withArgs(unverifiedBenef.address, crisisId);
    });

    it("reverts on double vote", async function () {
      await governance.connect(donor1).castVote(crisisId, ngo1.address);
      await expect(governance.connect(donor1).castVote(crisisId, ngo1.address))
        .to.be.revertedWithCustomError(governance, "AlreadyVoted")
        .withArgs(donor1.address, crisisId);
    });

    it("reverts if candidate is not registered", async function () {
      await expect(governance.connect(donor1).castVote(crisisId, stranger.address))
        .to.be.revertedWithCustomError(governance, "NotACandidate")
        .withArgs(stranger.address, crisisId);
    });

    it("reverts if crisis is not in VOTING phase", async function () {
      const id2 = await declareCrisis();
      await expect(governance.connect(donor1).castVote(id2, ngo1.address))
        .to.be.revertedWithCustomError(governance, "WrongPhase");
    });

    it("reverts if voting window has closed", async function () {
      await mineTime(VOTING_DURATION + 1);
      await expect(governance.connect(donor1).castVote(crisisId, ngo1.address))
        .to.be.revertedWithCustomError(governance, "VotingClosed")
        .withArgs(crisisId);
    });

    it("reverts if unregistered address tries to vote", async function () {
      await expect(governance.connect(stranger).castVote(crisisId, ngo1.address))
        .to.be.revertedWithCustomError(governance, "NotRegistered")
        .withArgs(stranger.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. finalizeElection — including GO vote compression
  // ═══════════════════════════════════════════════════════════════════════════

  describe("finalizeElection", function () {
    let crisisId: bigint;

    beforeEach(async function () {
      crisisId = await declareCrisis();
      await reachVotingPhase(crisisId);
      await dm.connect(donor1).donateFT(crisisId, DONOR_REQUIRED);
      await dm.connect(donor2).donateFT(crisisId, DONOR_REQUIRED);
      await dm.connect(donor3).donateFT(crisisId, DONOR_REQUIRED);
    });

    it("cannot finalize before voting window closes", async function () {
      await expect(governance.finalizeElection(crisisId))
        .to.be.revertedWithCustomError(governance, "VotingStillOpen")
        .withArgs(crisisId);
    });

    it("anyone can finalize after window closes", async function () {
      await mineTime(VOTING_DURATION + 1);
      await expect(governance.connect(stranger).finalizeElection(crisisId))
        .to.emit(governance, "CoordinatorElected");
    });

    it("crisis transitions to ACTIVE after finalization", async function () {
      await mineTime(VOTING_DURATION + 1);
      await governance.finalizeElection(crisisId);
      const crisis = await governance.getCrisis(crisisId);
      expect(crisis.phase).to.equal(Phase.ACTIVE);
    });

    it("keeps donations open after finalization (continuous-flow model)", async function () {
      await mineTime(VOTING_DURATION + 1);
      await governance.finalizeElection(crisisId);
      expect(await dm.activeCrises(crisisId)).to.be.true;
    });

    it("elects candidate with most non-GO votes when GOs don't vote", async function () {
      // 3 votes for ngo1, 1 vote for ngo2
      await governance.connect(donor1).castVote(crisisId, ngo1.address);
      await governance.connect(donor2).castVote(crisisId, ngo1.address);
      await governance.connect(donor3).castVote(crisisId, ngo1.address);

      await mineTime(VOTING_DURATION + 1);
      await expect(governance.finalizeElection(crisisId))
        .to.emit(governance, "CoordinatorElected")
        .withArgs(crisisId, ngo1.address, 3n);

      const crisis = await governance.getCrisis(crisisId);
      expect(crisis.coordinator).to.equal(ngo1.address);
    });

    it("grants coordinator authority over escrow (funds stay in contract)", async function () {
      await governance.connect(donor1).castVote(crisisId, ngo1.address);
      await mineTime(VOTING_DURATION + 1);
      await governance.finalizeElection(crisisId);

      // Coordinator gets authority, not funds — balance stays 0
      const ngo1Balance = await dm.balanceOf(ngo1.address);
      const escrowLeft  = await dm.getCrisisEscrowBalance(crisisId);
      expect(ngo1Balance).to.equal(0n);
      expect(escrowLeft).to.be.gt(0n);
    });

    it("first registered candidate wins a tie", async function () {
      // ngo1 was registered first. Both get 1 vote.
      await governance.connect(donor1).castVote(crisisId, ngo1.address);
      await governance.connect(donor2).castVote(crisisId, ngo2.address);

      await mineTime(VOTING_DURATION + 1);
      await governance.finalizeElection(crisisId);

      const crisis = await governance.getCrisis(crisisId);
      expect(crisis.coordinator).to.equal(ngo1.address);
    });

    it("first candidate wins with no votes cast", async function () {
      // No one votes — ngo1 was registered first
      await mineTime(VOTING_DURATION + 1);
      await governance.finalizeElection(crisisId);
      const crisis = await governance.getCrisis(crisisId);
      expect(crisis.coordinator).to.equal(ngo1.address);
    });

    // ── GO Vote Compression ────────────────────────────────────────────────

    describe("GO vote compression", function () {
      it("unanimous GO votes compress to 1: minority-supported candidate can win", async function () {
        // Scenario:
        //   ngo1: 1 non-GO vote + all 3 GOs (unanimous → compressed to 1 GO vote)
        //         effective = 1 + 1 = 2
        //   ngo2: 3 non-GO votes + 0 GO votes
        //         effective = 3 + 0 = 3
        // Without compression ngo1 would have 1+3=4, beating ngo2's 3.
        // With compression ngo1 has 2, ngo2 has 3 → ngo2 wins.

        await governance.connect(donor1).castVote(crisisId, ngo1.address);
        await governance.connect(donor2).castVote(crisisId, ngo2.address);
        await governance.connect(donor3).castVote(crisisId, ngo2.address);

        // Additional donor votes for ngo2 to make it decisive
        const signers = await ethers.getSigners();
        const extraDonor = signers[15];
        await registry.connect(extraDonor).registerParticipant(extraDonor.address, Role.Donor);
        await dm.connect(extraDonor).donateFT(crisisId, DONOR_REQUIRED);
        await governance.connect(extraDonor).castVote(crisisId, ngo2.address);

        // All 3 GOs vote unanimously for ngo1
        await governance.connect(go1).castVote(crisisId, ngo1.address);
        await governance.connect(go2).castVote(crisisId, ngo1.address);
        await governance.connect(go3).castVote(crisisId, ngo1.address);

        // Without compression: ngo1 = 1+3=4, ngo2 = 4+0=4 → tie → ngo1 wins (first registered)
        // With compression:    ngo1 = 1+1=2, ngo2 = 4+0=4 → ngo2 wins
        await mineTime(VOTING_DURATION + 1);
        await governance.finalizeElection(crisisId);

        const crisis = await governance.getCrisis(crisisId);
        expect(crisis.coordinator).to.equal(ngo2.address);
      });

      it("split GO votes count individually (no compression)", async function () {
        // Scenario:
        //   ngo1: 0 non-GO votes + 2 GO votes (go1 + go2)
        //   ngo2: 1 non-GO vote  + 1 GO vote  (go3)
        // GOs are split → no compression:
        //   ngo1 effective = 0 + 2 = 2
        //   ngo2 effective = 1 + 1 = 2 → tie → ngo1 wins (first registered)

        await governance.connect(donor1).castVote(crisisId, ngo2.address);
        await governance.connect(go1).castVote(crisisId, ngo1.address);
        await governance.connect(go2).castVote(crisisId, ngo1.address);
        await governance.connect(go3).castVote(crisisId, ngo2.address);

        await mineTime(VOTING_DURATION + 1);
        await governance.finalizeElection(crisisId);

        // ngo1 wins: 2 vs 2 tie, ngo1 registered first
        const crisis = await governance.getCrisis(crisisId);
        expect(crisis.coordinator).to.equal(ngo1.address);
      });

      it("no compression when no GOs voted", async function () {
        await governance.connect(donor1).castVote(crisisId, ngo2.address);
        await governance.connect(donor2).castVote(crisisId, ngo2.address);
        await governance.connect(donor3).castVote(crisisId, ngo1.address);
        // GOs don't vote — totalGOVotes = 0, no compression logic runs

        await mineTime(VOTING_DURATION + 1);
        await governance.finalizeElection(crisisId);

        // ngo2 wins 2-1
        const crisis = await governance.getCrisis(crisisId);
        expect(crisis.coordinator).to.equal(ngo2.address);
      });
    });

    it("reverts if crisis is not in VOTING phase", async function () {
      const id2 = await declareCrisis();
      await expect(governance.finalizeElection(id2))
        .to.be.revertedWithCustomError(governance, "WrongPhase");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. initiateMisconductVote
  // ═══════════════════════════════════════════════════════════════════════════

  describe("initiateMisconductVote", function () {
    let crisisId: bigint;

    beforeEach(async function () {
      crisisId = await declareCrisis();
      await reachVotingPhase(crisisId);
      await mineTime(VOTING_DURATION + 1);
      await governance.finalizeElection(crisisId);
    });

    it("Tier-3 multisig can initiate misconduct vote", async function () {
      await expect(governance.connect(crisisMS).initiateMisconductVote(crisisId))
        .to.emit(governance, "MisconductVoteStarted");

      const crisis = await governance.getCrisis(crisisId);
      expect(crisis.phase).to.equal(Phase.REVIEW);
      expect(crisis.misconductFlagged).to.be.true;
    });

    it("sets misconduct tally with correct window", async function () {
      const tx = await governance.connect(crisisMS).initiateMisconductVote(crisisId);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      const tally = await governance.getMisconductTally(crisisId);
      expect(tally.votesFor).to.equal(0n);
      expect(tally.votesAgainst).to.equal(0n);
      expect(tally.voteStart).to.equal(BigInt(block!.timestamp));
      expect(tally.voteEnd).to.equal(BigInt(block!.timestamp) + BigInt(MISCONDUCT_DURATION));
    });

    it("reverts if caller is not Tier-3 multisig", async function () {
      await expect(governance.connect(operationalAuth).initiateMisconductVote(crisisId))
        .to.be.revertedWithCustomError(governance, "NotCrisisDeclarationAuthority")
        .withArgs(operationalAuth.address);
      await expect(governance.connect(stranger).initiateMisconductVote(crisisId))
        .to.be.revertedWithCustomError(governance, "NotCrisisDeclarationAuthority")
        .withArgs(stranger.address);
    });

    it("reverts if crisis is not in ACTIVE phase", async function () {
      const id2 = await declareCrisis();
      await expect(governance.connect(crisisMS).initiateMisconductVote(id2))
        .to.be.revertedWithCustomError(governance, "WrongPhase");
    });

    it("reverts if misconduct vote already initiated", async function () {
      await governance.connect(crisisMS).initiateMisconductVote(crisisId);
      // Now phase is REVIEW, not ACTIVE → WrongPhase
      await expect(governance.connect(crisisMS).initiateMisconductVote(crisisId))
        .to.be.revertedWithCustomError(governance, "WrongPhase");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. castMisconductVote
  // ═══════════════════════════════════════════════════════════════════════════

  describe("castMisconductVote", function () {
    let crisisId: bigint;

    beforeEach(async function () {
      crisisId = await declareCrisis();
      // Donors contribute to be "involved"
      await dm.connect(donor1).donateFT(crisisId, DONOR_REQUIRED);
      await dm.connect(donor2).donateFT(crisisId, DONOR_REQUIRED);
      await reachVotingPhase(crisisId);
      await mineTime(VOTING_DURATION + 1);
      await governance.finalizeElection(crisisId);
      await governance.connect(crisisMS).initiateMisconductVote(crisisId);
      // Beneficiary crisis-verified
      await registry
        .connect(verificationMS)
        .verifyBeneficiary(beneficiary1.address, crisisId, EMPTY_PROOF);
    });

    it("involved donor can vote (isMisconduct = true)", async function () {
      await expect(governance.connect(donor1).castMisconductVote(crisisId, true))
        .to.emit(governance, "MisconductVoteCast")
        .withArgs(crisisId, donor1.address, true);
      const tally = await governance.getMisconductTally(crisisId);
      expect(tally.votesFor).to.equal(1n);
    });

    it("involved GO can vote (isMisconduct = false)", async function () {
      await expect(governance.connect(go1).castMisconductVote(crisisId, false))
        .to.emit(governance, "MisconductVoteCast")
        .withArgs(crisisId, go1.address, false);
      const tally = await governance.getMisconductTally(crisisId);
      expect(tally.votesAgainst).to.equal(1n);
    });

    it("crisis-verified beneficiary can vote", async function () {
      await expect(governance.connect(beneficiary1).castMisconductVote(crisisId, true))
        .to.emit(governance, "MisconductVoteCast");
    });

    it("involved NGO can vote", async function () {
      await expect(governance.connect(ngo1).castMisconductVote(crisisId, false))
        .to.emit(governance, "MisconductVoteCast");
    });

    it("reverts if voter was not involved in the crisis", async function () {
      // donor3 never donated
      await expect(governance.connect(donor3).castMisconductVote(crisisId, true))
        .to.be.revertedWithCustomError(governance, "NotInvolvedInCrisis")
        .withArgs(donor3.address, crisisId);
    });

    it("reverts on double misconduct vote", async function () {
      await governance.connect(donor1).castMisconductVote(crisisId, true);
      await expect(governance.connect(donor1).castMisconductVote(crisisId, true))
        .to.be.revertedWithCustomError(governance, "AlreadyMisconductVoted")
        .withArgs(donor1.address, crisisId);
    });

    it("reverts if misconduct window has closed", async function () {
      await mineTime(MISCONDUCT_DURATION + 1);
      await expect(governance.connect(donor1).castMisconductVote(crisisId, true))
        .to.be.revertedWithCustomError(governance, "MisconductVotingClosed")
        .withArgs(crisisId);
    });

    it("reverts if crisis is not in REVIEW phase", async function () {
      const id2 = await declareCrisis();
      await expect(governance.connect(donor1).castMisconductVote(id2, true))
        .to.be.revertedWithCustomError(governance, "WrongPhase");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. finalizeMisconductVote
  // ═══════════════════════════════════════════════════════════════════════════

  describe("finalizeMisconductVote", function () {
    let crisisId: bigint;
    let coordinator: string;

    beforeEach(async function () {
      crisisId = await declareCrisis();
      await dm.connect(donor1).donateFT(crisisId, DONOR_REQUIRED);
      await dm.connect(donor2).donateFT(crisisId, DONOR_REQUIRED);
      await dm.connect(donor3).donateFT(crisisId, DONOR_REQUIRED);
      await reachVotingPhase(crisisId);
      // 2 votes for ngo1, 1 for ngo2 → ngo1 elected
      await governance.connect(donor1).castVote(crisisId, ngo1.address);
      await governance.connect(donor2).castVote(crisisId, ngo1.address);
      await governance.connect(donor3).castVote(crisisId, ngo2.address);
      await mineTime(VOTING_DURATION + 1);
      await governance.finalizeElection(crisisId);
      coordinator = (await governance.getCrisis(crisisId)).coordinator;
      expect(coordinator).to.equal(ngo1.address);
      await governance.connect(crisisMS).initiateMisconductVote(crisisId);
    });

    it("cannot finalize before review window closes", async function () {
      await expect(governance.finalizeMisconductVote(crisisId))
        .to.be.revertedWithCustomError(governance, "MisconductVotingStillOpen")
        .withArgs(crisisId);
    });

    it("misconduct confirmed → PAUSED, coordinator banned, reputation slashed", async function () {
      // 2 votes for, 1 against → majority (2/3 > 0.5)
      await governance.connect(go1).castMisconductVote(crisisId, true);
      await governance.connect(go2).castMisconductVote(crisisId, true);
      await governance.connect(go3).castMisconductVote(crisisId, false);

      await mineTime(MISCONDUCT_DURATION + 1);
      await expect(governance.finalizeMisconductVote(crisisId))
        .to.emit(governance, "MisconductVoteFinalized")
        .withArgs(crisisId, true, 2n, 1n);

      const crisis = await governance.getCrisis(crisisId);
      expect(crisis.phase).to.equal(Phase.PAUSED);
      expect(crisis.coordinator).to.equal(ethers.ZeroAddress);
      expect(crisis.misconductFlagged).to.be.false;
      expect(await mockRepEng.misconductCallCount()).to.equal(1n);
      expect(await mockRepEng.lastMisconductValidator()).to.equal(coordinator);
      expect(await mockRepEng.lastMisconductCrisisId()).to.equal(crisisId);
      // Election round incremented
      expect(await governance.electionRound(crisisId)).to.equal(1n);
    });

    it("misconduct not confirmed → ACTIVE, coordinator vindicated", async function () {
      // 1 vote for, 2 against → no majority
      await governance.connect(go1).castMisconductVote(crisisId, true);
      await governance.connect(go2).castMisconductVote(crisisId, false);
      await governance.connect(go3).castMisconductVote(crisisId, false);

      await mineTime(MISCONDUCT_DURATION + 1);
      await expect(governance.finalizeMisconductVote(crisisId))
        .to.emit(governance, "MisconductVoteFinalized")
        .withArgs(crisisId, false, 1n, 2n);

      expect(await mockRepEng.misconductCallCount()).to.equal(0n);
      const crisis = await governance.getCrisis(crisisId);
      expect(crisis.phase).to.equal(Phase.ACTIVE);
      expect(crisis.misconductFlagged).to.be.false;
    });

    it("no votes cast → misconduct not confirmed (benefit of the doubt)", async function () {
      await mineTime(MISCONDUCT_DURATION + 1);
      await expect(governance.finalizeMisconductVote(crisisId))
        .to.emit(governance, "MisconductVoteFinalized")
        .withArgs(crisisId, false, 0n, 0n);

      expect(await mockRepEng.misconductCallCount()).to.equal(0n);
    });

    it("anyone can finalize after window closes", async function () {
      await mineTime(MISCONDUCT_DURATION + 1);
      await expect(governance.connect(stranger).finalizeMisconductVote(crisisId))
        .to.emit(governance, "MisconductVoteFinalized");
    });

    it("simple majority: exact tie (3 for, 3 against) is NOT confirmed", async function () {
      // 3 votesFor, 3 votesAgainst → 3 > 6/2=3 is FALSE
      await governance.connect(go1).castMisconductVote(crisisId, true);
      await governance.connect(go2).castMisconductVote(crisisId, true);
      await governance.connect(go3).castMisconductVote(crisisId, true);
      await governance.connect(ngo1).castMisconductVote(crisisId, false);
      await governance.connect(ngo2).castMisconductVote(crisisId, false);
      await governance.connect(donor1).castMisconductVote(crisisId, false);

      await mineTime(MISCONDUCT_DURATION + 1);
      await expect(governance.finalizeMisconductVote(crisisId))
        .to.emit(governance, "MisconductVoteFinalized")
        .withArgs(crisisId, false, 3n, 3n);
    });

    it("skips reputation call if reputationEngine is not set", async function () {
      const GovFactory = await ethers.getContractFactory("Governance");
      const g2 = await GovFactory.deploy(registry.target, dm.target, ethers.ZeroAddress);
      // Deactivate existing crisis before switching governance (continuous-flow keeps it active)
      const govAddr = await governance.getAddress();
      await ethers.provider.send("hardhat_setBalance", [govAddr, "0xDE0B6B3A7640000"]);
      await ethers.provider.send("hardhat_impersonateAccount", [govAddr]);
      const govSigner = await ethers.getSigner(govAddr);
      await dm.connect(govSigner).deactivateCrisis(crisisId);
      await ethers.provider.send("hardhat_stopImpersonatingAccount", [govAddr]);
      await dm.connect(deployer).setGovernanceContract(g2.target);

      const id2 = await (async () => {
        const tx = await g2.connect(crisisMS).declareCrisis("Test", 0n);
        const r = await tx.wait();
        const ev = r!.logs
          .map((l) => { try { return g2.interface.parseLog(l); } catch { return null; } })
          .find((e) => e?.name === "CrisisDeclared");
        return ev!.args.crisisId as bigint;
      })();

      // baseDonationCap=0, so no donation needed to register as candidate
      await g2.connect(ngo1).registerAsCandidate(id2);
      await g2.connect(operationalAuth).startVoting(id2);
      await mineTime(VOTING_DURATION + 1);
      await g2.finalizeElection(id2);
      await g2.connect(crisisMS).initiateMisconductVote(id2);

      await g2.connect(go1).castMisconductVote(id2, true);
      await mineTime(MISCONDUCT_DURATION + 1);
      // Should not revert even though reputationEngine is address(0)
      await expect(g2.finalizeMisconductVote(id2))
        .to.emit(g2, "MisconductVoteFinalized");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. closeCrisis (clean close — no misconduct)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("closeCrisis", function () {
    let crisisId: bigint;
    let coordinator: string;

    beforeEach(async function () {
      crisisId = await declareCrisis();
      await reachVotingPhase(crisisId);
      await mineTime(VOTING_DURATION + 1);
      await governance.finalizeElection(crisisId);
      coordinator = (await governance.getCrisis(crisisId)).coordinator;
    });

    it("Tier-1 operator can close a clean crisis", async function () {
      await expect(governance.connect(operationalAuth).closeCrisis(crisisId))
        .to.emit(governance, "CrisisClosed")
        .withArgs(crisisId);

      const crisis = await governance.getCrisis(crisisId);
      expect(crisis.phase).to.equal(Phase.CLOSED);
    });

    it("awards positive reputation to coordinator", async function () {
      await governance.connect(operationalAuth).closeCrisis(crisisId);

      expect(await mockRepEng.successCallCount()).to.equal(1n);
      expect(await mockRepEng.lastSuccessValidator()).to.equal(coordinator);
      expect(await mockRepEng.lastSuccessCrisisId()).to.equal(crisisId);
    });

    it("reverts if caller is not Tier-1 operator", async function () {
      await expect(governance.connect(crisisMS).closeCrisis(crisisId))
        .to.be.revertedWithCustomError(governance, "NotOperationalAuthority")
        .withArgs(crisisMS.address);
      await expect(governance.connect(stranger).closeCrisis(crisisId))
        .to.be.revertedWithCustomError(governance, "NotOperationalAuthority")
        .withArgs(stranger.address);
    });

    it("reverts if crisis is not in ACTIVE phase", async function () {
      const id2 = await declareCrisis();
      await expect(governance.connect(operationalAuth).closeCrisis(id2))
        .to.be.revertedWithCustomError(governance, "WrongPhase");
    });

    it("reverts if misconduct was already flagged", async function () {
      await governance.connect(crisisMS).initiateMisconductVote(crisisId);
      // Crisis is now in REVIEW — the misconductFlagged check isn't even reached,
      // but WrongPhase fires first (REVIEW ≠ ACTIVE)
      await expect(governance.connect(operationalAuth).closeCrisis(crisisId))
        .to.be.revertedWithCustomError(governance, "WrongPhase");
    });

    it("skips reputation call if reputationEngine not set", async function () {
      const GovFactory = await ethers.getContractFactory("Governance");
      const g2 = await GovFactory.deploy(registry.target, dm.target, ethers.ZeroAddress);
      // Deactivate existing crisis before switching governance (continuous-flow keeps it active)
      const govAddr = await governance.getAddress();
      await ethers.provider.send("hardhat_setBalance", [govAddr, "0xDE0B6B3A7640000"]);
      await ethers.provider.send("hardhat_impersonateAccount", [govAddr]);
      const govSigner = await ethers.getSigner(govAddr);
      await dm.connect(govSigner).deactivateCrisis(crisisId);
      await ethers.provider.send("hardhat_stopImpersonatingAccount", [govAddr]);
      await dm.connect(deployer).setGovernanceContract(g2.target);

      const id2 = await (async () => {
        const tx = await g2.connect(crisisMS).declareCrisis("Test", 0n);
        const r = await tx.wait();
        const ev = r!.logs
          .map((l) => { try { return g2.interface.parseLog(l); } catch { return null; } })
          .find((e) => e?.name === "CrisisDeclared");
        return ev!.args.crisisId as bigint;
      })();

      await g2.connect(ngo1).registerAsCandidate(id2);
      await g2.connect(operationalAuth).startVoting(id2);
      await mineTime(VOTING_DURATION + 1);
      await g2.finalizeElection(id2);

      await expect(g2.connect(operationalAuth).closeCrisis(id2))
        .to.emit(g2, "CrisisClosed");
      // No revert and no reputation engine call needed
      expect(await mockRepEng.successCallCount()).to.equal(0n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. Full lifecycle integration test
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Full lifecycle", function () {
    it("DECLARED → VOTING → ACTIVE → REVIEW → PAUSED (misconduct path)", async function () {
      // 1. Declare
      const crisisId = await declareCrisis();
      expect((await governance.getCrisis(crisisId)).phase).to.equal(Phase.DECLARED);

      // 2. Donate + register candidates + start voting
      await dm.connect(go1).donateFT(crisisId, GO_REQUIRED);
      await dm.connect(ngo1).donateFT(crisisId, NGO_REQUIRED);
      await governance.connect(ngo1).registerAsCandidate(crisisId);
      await governance.connect(operationalAuth).startVoting(crisisId);
      expect((await governance.getCrisis(crisisId)).phase).to.equal(Phase.VOTING);

      // 3. Vote + finalize
      await governance.connect(go1).castVote(crisisId, ngo1.address);
      await mineTime(VOTING_DURATION + 1);
      await governance.finalizeElection(crisisId);
      expect((await governance.getCrisis(crisisId)).phase).to.equal(Phase.ACTIVE);

      // 4. Initiate misconduct
      await governance.connect(crisisMS).initiateMisconductVote(crisisId);
      expect((await governance.getCrisis(crisisId)).phase).to.equal(Phase.REVIEW);

      // 5. Vote on misconduct (majority confirms) → PAUSED
      await governance.connect(go1).castMisconductVote(crisisId, true);
      await mineTime(MISCONDUCT_DURATION + 1);
      await governance.finalizeMisconductVote(crisisId);
      expect((await governance.getCrisis(crisisId)).phase).to.equal(Phase.PAUSED);
      expect(await mockRepEng.misconductCallCount()).to.equal(1n);
    });

    it("DECLARED → VOTING → ACTIVE → CLOSED (clean path)", async function () {
      const crisisId = await declareCrisis();
      await dm.connect(ngo1).donateFT(crisisId, NGO_REQUIRED);
      await governance.connect(ngo1).registerAsCandidate(crisisId);
      await governance.connect(operationalAuth).startVoting(crisisId);
      await mineTime(VOTING_DURATION + 1);
      await governance.finalizeElection(crisisId);

      await governance.connect(operationalAuth).closeCrisis(crisisId);
      expect((await governance.getCrisis(crisisId)).phase).to.equal(Phase.CLOSED);
      expect(await mockRepEng.successCallCount()).to.equal(1n);
    });

    it("Full re-election cycle: ACTIVE → REVIEW → PAUSED → VOTING → ACTIVE → CLOSED", async function () {
      // 1. Declare + get to ACTIVE with ngo1 as coordinator
      const crisisId = await declareCrisis();
      await dm.connect(go1).donateFT(crisisId, GO_REQUIRED);
      await dm.connect(ngo1).donateFT(crisisId, NGO_REQUIRED);
      await dm.connect(ngo2).donateFT(crisisId, NGO_REQUIRED);
      await governance.connect(ngo1).registerAsCandidate(crisisId);
      await governance.connect(operationalAuth).startVoting(crisisId);
      await governance.connect(go1).castVote(crisisId, ngo1.address);
      await mineTime(VOTING_DURATION + 1);
      await governance.finalizeElection(crisisId);
      expect((await governance.getCrisis(crisisId)).coordinator).to.equal(ngo1.address);

      // 2. Misconduct → PAUSED
      await governance.connect(crisisMS).initiateMisconductVote(crisisId);
      await governance.connect(go1).castMisconductVote(crisisId, true);
      await mineTime(MISCONDUCT_DURATION + 1);
      await governance.finalizeMisconductVote(crisisId);
      expect((await governance.getCrisis(crisisId)).phase).to.equal(Phase.PAUSED);

      // 3. ngo1 is blacklisted — cannot re-register
      await expect(governance.connect(ngo1).registerAsCandidate(crisisId))
        .to.be.revertedWithCustomError(governance, "BlacklistedFromCrisis");

      // 4. ngo2 registers and triggers re-election
      await governance.connect(ngo2).registerAsCandidate(crisisId);
      await governance.connect(operationalAuth).startVoting(crisisId);
      expect((await governance.getCrisis(crisisId)).phase).to.equal(Phase.VOTING);

      // 5. go1 can vote again in the new round
      await governance.connect(go1).castVote(crisisId, ngo2.address);
      expect(await governance.hasVoted(go1.address, crisisId, 1n)).to.be.true;
      // Still shows true for round 0 too
      expect(await governance.hasVoted(go1.address, crisisId, 0n)).to.be.true;

      // 6. Finalize re-election
      await mineTime(VOTING_DURATION + 1);
      await governance.finalizeElection(crisisId);
      expect((await governance.getCrisis(crisisId)).coordinator).to.equal(ngo2.address);
      expect((await governance.getCrisis(crisisId)).phase).to.equal(Phase.ACTIVE);

      // 7. Clean close
      await governance.connect(operationalAuth).closeCrisis(crisisId);
      expect((await governance.getCrisis(crisisId)).phase).to.equal(Phase.CLOSED);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. PAUSED state + Re-election cycle
  // ═══════════════════════════════════════════════════════════════════════════

  describe("PAUSED state and re-election", function () {
    let crisisId: bigint;

    beforeEach(async function () {
      crisisId = await declareCrisis();
      await dm.connect(go1).donateFT(crisisId, GO_REQUIRED);
      await dm.connect(ngo1).donateFT(crisisId, NGO_REQUIRED);
      await dm.connect(ngo2).donateFT(crisisId, NGO_REQUIRED);
      await dm.connect(donor1).donateFT(crisisId, DONOR_REQUIRED);
      await governance.connect(ngo1).registerAsCandidate(crisisId);
      await governance.connect(operationalAuth).startVoting(crisisId);
      await governance.connect(donor1).castVote(crisisId, ngo1.address);
      await mineTime(VOTING_DURATION + 1);
      await governance.finalizeElection(crisisId);
      // ngo1 is coordinator
      await governance.connect(crisisMS).initiateMisconductVote(crisisId);
      await governance.connect(go1).castMisconductVote(crisisId, true);
      await mineTime(MISCONDUCT_DURATION + 1);
      await governance.finalizeMisconductVote(crisisId);
      // Now in PAUSED state
    });

    it("crisis is in PAUSED phase after misconduct confirmation", async function () {
      expect((await governance.getCrisis(crisisId)).phase).to.equal(Phase.PAUSED);
    });

    it("old coordinator is address(0)", async function () {
      expect((await governance.getCrisis(crisisId)).coordinator).to.equal(ethers.ZeroAddress);
    });

    it("election round is incremented", async function () {
      expect(await governance.electionRound(crisisId)).to.equal(1n);
    });

    it("candidates list is cleared", async function () {
      const candidates = await governance.getCandidates(crisisId);
      expect(candidates.length).to.equal(0);
    });

    it("blacklisted coordinator cannot register", async function () {
      await expect(governance.connect(ngo1).registerAsCandidate(crisisId))
        .to.be.revertedWithCustomError(governance, "BlacklistedFromCrisis")
        .withArgs(ngo1.address, crisisId);
    });

    it("non-blacklisted NGO can register during PAUSED", async function () {
      await governance.connect(ngo2).registerAsCandidate(crisisId);
      const candidates = await governance.getCandidates(crisisId);
      expect(candidates.length).to.equal(1);
      expect(candidates[0].candidate).to.equal(ngo2.address);
    });

    it("startVoting works from PAUSED", async function () {
      await governance.connect(ngo2).registerAsCandidate(crisisId);
      await governance.connect(operationalAuth).startVoting(crisisId);
      expect((await governance.getCrisis(crisisId)).phase).to.equal(Phase.VOTING);
    });

    it("voters can vote again in new round", async function () {
      await governance.connect(ngo2).registerAsCandidate(crisisId);
      await governance.connect(operationalAuth).startVoting(crisisId);
      // donor1 voted in round 0, can vote again in round 1
      await governance.connect(donor1).castVote(crisisId, ngo2.address);
      expect(await governance.hasVoted(donor1.address, crisisId, 1n)).to.be.true;
    });

    it("escrow is frozen during PAUSED", async function () {
      expect(await dm.crisisPaused(crisisId)).to.be.true;
    });

    it("escrow unfreezes when startVoting from PAUSED", async function () {
      await governance.connect(ngo2).registerAsCandidate(crisisId);
      await governance.connect(operationalAuth).startVoting(crisisId);
      expect(await dm.crisisPaused(crisisId)).to.be.false;
      expect(await dm.activeCrises(crisisId)).to.be.true;
    });

    it("misconduct dismissed → ACTIVE, escrow unfreezes", async function () {
      // Create a fresh crisis for the dismiss test
      const crisisId2 = await declareCrisis();
      await dm.connect(ngo1).donateFT(crisisId2, NGO_REQUIRED);
      await dm.connect(donor1).donateFT(crisisId2, DONOR_REQUIRED);
      await governance.connect(ngo1).registerAsCandidate(crisisId2);
      await governance.connect(operationalAuth).startVoting(crisisId2);
      await governance.connect(donor1).castVote(crisisId2, ngo1.address);
      await mineTime(VOTING_DURATION + 1);
      await governance.finalizeElection(crisisId2);
      await governance.connect(crisisMS).initiateMisconductVote(crisisId2);

      // Vote dismiss
      await governance.connect(go1).castMisconductVote(crisisId2, false);
      await mineTime(MISCONDUCT_DURATION + 1);
      await governance.finalizeMisconductVote(crisisId2);

      expect((await governance.getCrisis(crisisId2)).phase).to.equal(Phase.ACTIVE);
      expect(await dm.crisisPaused(crisisId2)).to.be.false;
    });

    it("initiateMisconductVote freezes escrow immediately", async function () {
      // Use a new crisis to test the freeze on REVIEW entry
      const crisisId2 = await declareCrisis();
      await dm.connect(ngo1).donateFT(crisisId2, NGO_REQUIRED);
      await governance.connect(ngo1).registerAsCandidate(crisisId2);
      await governance.connect(operationalAuth).startVoting(crisisId2);
      await mineTime(VOTING_DURATION + 1);
      await governance.finalizeElection(crisisId2);

      expect(await dm.crisisPaused(crisisId2)).to.be.false;
      await governance.connect(crisisMS).initiateMisconductVote(crisisId2);
      expect(await dm.crisisPaused(crisisId2)).to.be.true;
    });
  });
});
