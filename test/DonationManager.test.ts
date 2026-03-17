import { expect } from "chai";
import { ethers } from "hardhat";
import { DonationManager, Registry } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

enum Role {
  GO          = 0,
  NGO         = 1,
  Donor       = 2,
  Beneficiary = 3,
  PrivateCompany = 4,
}

enum Status {
  PENDING  = 0,
  ASSIGNED = 1,
  REDEEMED = 2,
}

const EMPTY_PROOF  = "0x";
const SAMPLE_URI   = "ipfs://QmSampleMetadataHash";
const CRISIS_ID    = 1n;
const CRISIS_ID_2  = 2n;

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("DonationManager", function () {
  // ── Signers ────────────────────────────────────────────────────────────────
  let deployer:       HardhatEthersSigner;  // DEFAULT_ADMIN_ROLE on both contracts
  let operationalAuth: HardhatEthersSigner; // Tier-1 (Registry)
  let verificationMS:  HardhatEthersSigner; // Tier-2 2-of-3 (Registry)
  let crisisMS:        HardhatEthersSigner; // Tier-3 4-of-7 (Registry)
  let governance:      HardhatEthersSigner; // Simulates the Governance contract
  let coordinator:     HardhatEthersSigner; // Elected coordinator (verified NGO)
  let donor1:          HardhatEthersSigner;
  let donor2:          HardhatEthersSigner;
  let beneficiary1:    HardhatEthersSigner;
  let beneficiary2:    HardhatEthersSigner;
  let company:         HardhatEthersSigner;
  let stranger:        HardhatEthersSigner; // Not registered anywhere

  // ── Contracts ──────────────────────────────────────────────────────────────
  let registry:        Registry;
  let dm:              DonationManager;

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
      coordinator,
      donor1,
      donor2,
      beneficiary1,
      beneficiary2,
      company,
      stranger,
    ] = await ethers.getSigners();

    // ── 1. Deploy Registry ─────────────────────────────────────────────────
    const RegistryFactory = await ethers.getContractFactory("Registry");
    registry = await RegistryFactory.deploy(
      operationalAuth.address,
      verificationMS.address,
      crisisMS.address
    );

    // ── 2. Deploy DonationManager (governance = address(0) initially) ──────
    const DMFactory = await ethers.getContractFactory("DonationManager");
    dm = await DMFactory.deploy(registry.target, ethers.ZeroAddress);

    // ── 3. Wire up the simulated governance address ────────────────────────
    await dm.connect(deployer).setGovernanceContract(governance.address);

    // ── 4. Populate the Registry ───────────────────────────────────────────
    // coordinator = NGO (self-registers then gets verified)
    await registry.connect(coordinator).registerNGO(coordinator.address);
    await registry.connect(verificationMS).verifyNGO(coordinator.address, EMPTY_PROOF);

    // Donors
    await registry.connect(donor1).registerParticipant(donor1.address, Role.Donor);
    await registry.connect(donor2).registerParticipant(donor2.address, Role.Donor);

    // Beneficiaries (registered + crisis-verified for CRISIS_ID)
    await registry.connect(beneficiary1).registerParticipant(beneficiary1.address, Role.Beneficiary);
    await registry.connect(beneficiary2).registerParticipant(beneficiary2.address, Role.Beneficiary);
    await registry.connect(verificationMS).verifyBeneficiary(beneficiary1.address, CRISIS_ID, EMPTY_PROOF);

    // PrivateCompany
    await registry.connect(company).registerParticipant(company.address, Role.PrivateCompany);

    // ── 5. Activate crisis so donation tests can proceed ───────────────────
    await dm.connect(governance).activateCrisis(CRISIS_ID);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Constructor / initial state
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Constructor", function () {
    it("sets the registry address correctly", async function () {
      expect(await dm.registry()).to.equal(registry.target);
    });

    it("sets the governance address after setGovernanceContract()", async function () {
      expect(await dm.governanceContract()).to.equal(governance.address);
    });

    it("grants DEFAULT_ADMIN_ROLE to the deployer", async function () {
      const ADMIN = await dm.DEFAULT_ADMIN_ROLE();
      expect(await dm.hasRole(ADMIN, deployer.address)).to.be.true;
    });

    it("has name 'OpenAID Donation Token' and symbol 'AID'", async function () {
      expect(await dm.name()).to.equal("OpenAID Donation Token");
      expect(await dm.symbol()).to.equal("AID");
    });

    it("has 0 decimals (1 AID = 1 MAD, whole units)", async function () {
      expect(await dm.decimals()).to.equal(0);
    });

    it("starts with zero total supply", async function () {
      expect(await dm.totalSupply()).to.equal(0n);
    });

    it("starts with zero in-kind supply", async function () {
      expect(await dm.nftTotalSupply()).to.equal(0n);
    });

    it("reverts if registry address is zero", async function () {
      const DMFactory = await ethers.getContractFactory("DonationManager");
      await expect(DMFactory.deploy(ethers.ZeroAddress, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(dm, "ZeroAddress");
    });

    it("sets governance address when supplied in constructor", async function () {
      const DMFactory = await ethers.getContractFactory("DonationManager");
      const dm2 = await DMFactory.deploy(registry.target, governance.address);
      expect(await dm2.governanceContract()).to.equal(governance.address);
    });

    it("emits GovernanceContractSet when governance supplied in constructor", async function () {
      const DMFactory = await ethers.getContractFactory("DonationManager");
      const dm2 = await DMFactory.deploy(registry.target, governance.address);
      const receipt = await dm2.deploymentTransaction()!.wait();
      const iface = dm2.interface;
      const topic = iface.getEvent("GovernanceContractSet")!.topicHash;
      const log   = receipt!.logs.find(l => l.topics[0] === topic);
      expect(log).to.not.be.undefined;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // setGovernanceContract
  // ═══════════════════════════════════════════════════════════════════════════

  describe("setGovernanceContract()", function () {
    it("allows the deployer to update the governance address", async function () {
      await dm.connect(deployer).setGovernanceContract(stranger.address);
      expect(await dm.governanceContract()).to.equal(stranger.address);
    });

    it("emits GovernanceContractSet on update", async function () {
      await expect(dm.connect(deployer).setGovernanceContract(stranger.address))
        .to.emit(dm, "GovernanceContractSet")
        .withArgs(stranger.address);
    });

    it("reverts when called by a non-admin", async function () {
      await expect(dm.connect(stranger).setGovernanceContract(stranger.address))
        .to.be.revertedWithCustomError(dm, "AccessControlUnauthorizedAccount");
    });

    it("reverts when new governance address is zero", async function () {
      await expect(dm.connect(deployer).setGovernanceContract(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(dm, "ZeroAddress");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // activateCrisis / deactivateCrisis
  // ═══════════════════════════════════════════════════════════════════════════

  describe("activateCrisis()", function () {
    it("governance can activate a new crisis", async function () {
      await dm.connect(governance).activateCrisis(CRISIS_ID_2);
      expect(await dm.activeCrises(CRISIS_ID_2)).to.be.true;
    });

    it("emits CrisisActivated", async function () {
      await expect(dm.connect(governance).activateCrisis(CRISIS_ID_2))
        .to.emit(dm, "CrisisActivated")
        .withArgs(CRISIS_ID_2);
    });

    it("reverts when caller is not governance", async function () {
      await expect(dm.connect(stranger).activateCrisis(CRISIS_ID_2))
        .to.be.revertedWithCustomError(dm, "NotGovernance")
        .withArgs(stranger.address);
    });

    it("reverts when crisis is already active", async function () {
      // CRISIS_ID was activated in beforeEach
      await expect(dm.connect(governance).activateCrisis(CRISIS_ID))
        .to.be.revertedWithCustomError(dm, "CrisisAlreadyActive")
        .withArgs(CRISIS_ID);
    });
  });

  describe("deactivateCrisis()", function () {
    it("governance can deactivate an active crisis", async function () {
      await dm.connect(governance).deactivateCrisis(CRISIS_ID);
      expect(await dm.activeCrises(CRISIS_ID)).to.be.false;
    });

    it("emits CrisisDeactivated", async function () {
      await expect(dm.connect(governance).deactivateCrisis(CRISIS_ID))
        .to.emit(dm, "CrisisDeactivated")
        .withArgs(CRISIS_ID);
    });

    it("reverts when caller is not governance", async function () {
      await expect(dm.connect(stranger).deactivateCrisis(CRISIS_ID))
        .to.be.revertedWithCustomError(dm, "NotGovernance")
        .withArgs(stranger.address);
    });

    it("reverts when crisis is not currently active", async function () {
      await expect(dm.connect(governance).deactivateCrisis(CRISIS_ID_2))
        .to.be.revertedWithCustomError(dm, "CrisisNotCurrentlyActive")
        .withArgs(CRISIS_ID_2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // donateFT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("donateFT()", function () {
    it("registered donor can donate FT to an active crisis", async function () {
      await dm.connect(donor1).donateFT(CRISIS_ID, 100n);
      expect(await dm.crisisEscrow(CRISIS_ID)).to.equal(100n);
    });

    it("mints AID tokens to the contract (escrow)", async function () {
      await dm.connect(donor1).donateFT(CRISIS_ID, 200n);
      expect(await dm.balanceOf(dm.target)).to.equal(200n);
      expect(await dm.totalSupply()).to.equal(200n);
    });

    it("tracks donor contribution for the crisis", async function () {
      await dm.connect(donor1).donateFT(CRISIS_ID, 150n);
      expect(await dm.donorContribution(donor1.address, CRISIS_ID)).to.equal(150n);
    });

    it("accumulates contributions across multiple donations by same donor", async function () {
      await dm.connect(donor1).donateFT(CRISIS_ID, 100n);
      await dm.connect(donor1).donateFT(CRISIS_ID, 50n);
      expect(await dm.donorContribution(donor1.address, CRISIS_ID)).to.equal(150n);
      expect(await dm.crisisEscrow(CRISIS_ID)).to.equal(150n);
    });

    it("tracks contributions separately per donor", async function () {
      await dm.connect(donor1).donateFT(CRISIS_ID, 100n);
      await dm.connect(donor2).donateFT(CRISIS_ID, 200n);
      expect(await dm.donorContribution(donor1.address, CRISIS_ID)).to.equal(100n);
      expect(await dm.donorContribution(donor2.address, CRISIS_ID)).to.equal(200n);
      expect(await dm.crisisEscrow(CRISIS_ID)).to.equal(300n);
    });

    it("tracks contributions separately per crisis", async function () {
      await dm.connect(governance).activateCrisis(CRISIS_ID_2);
      await dm.connect(donor1).donateFT(CRISIS_ID, 100n);
      await dm.connect(donor1).donateFT(CRISIS_ID_2, 50n);
      expect(await dm.donorContribution(donor1.address, CRISIS_ID)).to.equal(100n);
      expect(await dm.donorContribution(donor1.address, CRISIS_ID_2)).to.equal(50n);
    });

    it("emits FTDonationReceived with correct args", async function () {
      await expect(dm.connect(donor1).donateFT(CRISIS_ID, 100n))
        .to.emit(dm, "FTDonationReceived")
        .withArgs(donor1.address, CRISIS_ID, 100n);
    });

    it("allows PrivateCompany to donate", async function () {
      await dm.connect(company).donateFT(CRISIS_ID, 500n);
      expect(await dm.donorContribution(company.address, CRISIS_ID)).to.equal(500n);
    });

    it("reverts when caller is not registered", async function () {
      await expect(dm.connect(stranger).donateFT(CRISIS_ID, 100n))
        .to.be.revertedWithCustomError(dm, "NotRegistered")
        .withArgs(stranger.address);
    });

    it("reverts when crisis is not active", async function () {
      await expect(dm.connect(donor1).donateFT(CRISIS_ID_2, 100n))
        .to.be.revertedWithCustomError(dm, "CrisisNotActive")
        .withArgs(CRISIS_ID_2);
    });

    it("reverts when crisis has been deactivated", async function () {
      await dm.connect(governance).deactivateCrisis(CRISIS_ID);
      await expect(dm.connect(donor1).donateFT(CRISIS_ID, 100n))
        .to.be.revertedWithCustomError(dm, "CrisisNotActive")
        .withArgs(CRISIS_ID);
    });

    it("reverts when amount is zero", async function () {
      await expect(dm.connect(donor1).donateFT(CRISIS_ID, 0n))
        .to.be.revertedWithCustomError(dm, "ZeroAmount");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // donateInKind
  // ═══════════════════════════════════════════════════════════════════════════

  describe("donateInKind()", function () {
    it("registered participant can donate an in-kind item", async function () {
      await dm.connect(donor1).donateInKind(CRISIS_ID, SAMPLE_URI);
      expect(await dm.nftTotalSupply()).to.equal(1n);
    });

    it("returns the new NFT ID starting at 1", async function () {
      const tx   = await dm.connect(donor1).donateInKind.staticCall(CRISIS_ID, SAMPLE_URI);
      expect(tx).to.equal(1n);
    });

    it("increments NFT ID for subsequent donations", async function () {
      await dm.connect(donor1).donateInKind(CRISIS_ID, SAMPLE_URI);
      const id2 = await dm.connect(donor2).donateInKind.staticCall(CRISIS_ID, SAMPLE_URI);
      expect(id2).to.equal(2n);
    });

    it("stores the correct InKindDonation record", async function () {
      await dm.connect(donor1).donateInKind(CRISIS_ID, SAMPLE_URI);
      const record = await dm.getInKindDonation(1n);

      expect(record.nftId).to.equal(1n);
      expect(record.donor).to.equal(donor1.address);
      expect(record.metadataURI).to.equal(SAMPLE_URI);
      expect(record.crisisId).to.equal(CRISIS_ID);
      expect(record.status).to.equal(Status.PENDING);
      expect(record.assignedTo).to.equal(ethers.ZeroAddress);
    });

    it("initial owner is the contract itself (held in escrow)", async function () {
      await dm.connect(donor1).donateInKind(CRISIS_ID, SAMPLE_URI);
      expect(await dm.nftOwnerOf(1n)).to.equal(dm.target);
    });

    it("emits InKindDonationReceived with correct args", async function () {
      await expect(dm.connect(donor1).donateInKind(CRISIS_ID, SAMPLE_URI))
        .to.emit(dm, "InKindDonationReceived")
        .withArgs(donor1.address, CRISIS_ID, 1n);
    });

    it("reverts when caller is not registered", async function () {
      await expect(dm.connect(stranger).donateInKind(CRISIS_ID, SAMPLE_URI))
        .to.be.revertedWithCustomError(dm, "NotRegistered")
        .withArgs(stranger.address);
    });

    it("reverts when crisis is not active", async function () {
      await expect(dm.connect(donor1).donateInKind(CRISIS_ID_2, SAMPLE_URI))
        .to.be.revertedWithCustomError(dm, "CrisisNotActive")
        .withArgs(CRISIS_ID_2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // releaseEscrowToCoordinator
  // ═══════════════════════════════════════════════════════════════════════════

  describe("releaseEscrowToCoordinator()", function () {
    beforeEach(async function () {
      await dm.connect(donor1).donateFT(CRISIS_ID, 300n);
      await dm.connect(donor2).donateFT(CRISIS_ID, 200n);
    });

    it("transfers all escrow funds to the coordinator", async function () {
      await dm.connect(governance).releaseEscrowToCoordinator(CRISIS_ID, coordinator.address);
      expect(await dm.balanceOf(coordinator.address)).to.equal(500n);
    });

    it("resets the crisis escrow to zero after release", async function () {
      await dm.connect(governance).releaseEscrowToCoordinator(CRISIS_ID, coordinator.address);
      expect(await dm.crisisEscrow(CRISIS_ID)).to.equal(0n);
    });

    it("records the coordinator on-chain for subsequent distribution checks", async function () {
      await dm.connect(governance).releaseEscrowToCoordinator(CRISIS_ID, coordinator.address);
      expect(await dm.crisisCoordinator(CRISIS_ID)).to.equal(coordinator.address);
    });

    it("emits EscrowReleased with correct args", async function () {
      await expect(dm.connect(governance).releaseEscrowToCoordinator(CRISIS_ID, coordinator.address))
        .to.emit(dm, "EscrowReleased")
        .withArgs(CRISIS_ID, coordinator.address, 500n);
    });

    it("reverts when caller is not governance", async function () {
      await expect(dm.connect(stranger).releaseEscrowToCoordinator(CRISIS_ID, coordinator.address))
        .to.be.revertedWithCustomError(dm, "NotGovernance")
        .withArgs(stranger.address);
    });

    it("reverts when coordinator address is zero", async function () {
      await expect(dm.connect(governance).releaseEscrowToCoordinator(CRISIS_ID, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(dm, "ZeroAddress");
    });

    it("reverts when escrow balance is zero", async function () {
      await expect(dm.connect(governance).releaseEscrowToCoordinator(CRISIS_ID_2, coordinator.address))
        .to.be.revertedWithCustomError(dm, "EmptyEscrow")
        .withArgs(CRISIS_ID_2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // distributeFTToBeneficiary
  // ═══════════════════════════════════════════════════════════════════════════

  describe("distributeFTToBeneficiary()", function () {
    beforeEach(async function () {
      await dm.connect(donor1).donateFT(CRISIS_ID, 500n);
      await dm.connect(governance).releaseEscrowToCoordinator(CRISIS_ID, coordinator.address);
    });

    it("coordinator can send AID to a crisis-verified beneficiary", async function () {
      await dm.connect(coordinator).distributeFTToBeneficiary(CRISIS_ID, beneficiary1.address, 100n);
      expect(await dm.balanceOf(beneficiary1.address)).to.equal(100n);
      expect(await dm.balanceOf(coordinator.address)).to.equal(400n);
    });

    it("emits FTDistributed with correct args", async function () {
      await expect(
        dm.connect(coordinator).distributeFTToBeneficiary(CRISIS_ID, beneficiary1.address, 100n)
      )
        .to.emit(dm, "FTDistributed")
        .withArgs(CRISIS_ID, coordinator.address, beneficiary1.address, 100n);
    });

    it("coordinator can distribute to the same beneficiary multiple times", async function () {
      await dm.connect(coordinator).distributeFTToBeneficiary(CRISIS_ID, beneficiary1.address, 50n);
      await dm.connect(coordinator).distributeFTToBeneficiary(CRISIS_ID, beneficiary1.address, 75n);
      expect(await dm.balanceOf(beneficiary1.address)).to.equal(125n);
    });

    it("reverts when caller is not the elected coordinator", async function () {
      await expect(
        dm.connect(stranger).distributeFTToBeneficiary(CRISIS_ID, beneficiary1.address, 100n)
      )
        .to.be.revertedWithCustomError(dm, "NotCoordinator")
        .withArgs(stranger.address, CRISIS_ID);
    });

    it("reverts when beneficiary is not crisis-verified", async function () {
      // beneficiary2 is registered but NOT crisis-verified for CRISIS_ID
      await expect(
        dm.connect(coordinator).distributeFTToBeneficiary(CRISIS_ID, beneficiary2.address, 100n)
      )
        .to.be.revertedWithCustomError(dm, "NotCrisisVerifiedBeneficiary")
        .withArgs(beneficiary2.address, CRISIS_ID);
    });

    it("reverts when amount is zero", async function () {
      await expect(
        dm.connect(coordinator).distributeFTToBeneficiary(CRISIS_ID, beneficiary1.address, 0n)
      )
        .to.be.revertedWithCustomError(dm, "ZeroAmount");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // assignInKindToBeneficiary
  // ═══════════════════════════════════════════════════════════════════════════

  describe("assignInKindToBeneficiary()", function () {
    beforeEach(async function () {
      // Mint an in-kind item and elect the coordinator
      await dm.connect(donor1).donateInKind(CRISIS_ID, SAMPLE_URI); // nftId = 1
      await dm.connect(donor1).donateFT(CRISIS_ID, 1n);             // need non-zero escrow
      await dm.connect(governance).releaseEscrowToCoordinator(CRISIS_ID, coordinator.address);
    });

    it("coordinator can assign a pending item to a verified beneficiary", async function () {
      await dm.connect(coordinator).assignInKindToBeneficiary(1n, beneficiary1.address);
      const record = await dm.getInKindDonation(1n);
      expect(record.status).to.equal(Status.ASSIGNED);
      expect(record.assignedTo).to.equal(beneficiary1.address);
    });

    it("transfers on-chain ownership to the beneficiary", async function () {
      await dm.connect(coordinator).assignInKindToBeneficiary(1n, beneficiary1.address);
      expect(await dm.nftOwnerOf(1n)).to.equal(beneficiary1.address);
    });

    it("emits InKindAssigned with correct args", async function () {
      await expect(dm.connect(coordinator).assignInKindToBeneficiary(1n, beneficiary1.address))
        .to.emit(dm, "InKindAssigned")
        .withArgs(1n, beneficiary1.address);
    });

    it("reverts when caller is not the elected coordinator", async function () {
      await expect(dm.connect(stranger).assignInKindToBeneficiary(1n, beneficiary1.address))
        .to.be.revertedWithCustomError(dm, "NotCoordinator")
        .withArgs(stranger.address, CRISIS_ID);
    });

    it("reverts when item is not in PENDING status (already ASSIGNED)", async function () {
      await dm.connect(coordinator).assignInKindToBeneficiary(1n, beneficiary1.address);
      await expect(dm.connect(coordinator).assignInKindToBeneficiary(1n, beneficiary1.address))
        .to.be.revertedWithCustomError(dm, "WrongNFTStatus")
        .withArgs(1n, Status.PENDING, Status.ASSIGNED);
    });

    it("reverts when beneficiary is not crisis-verified", async function () {
      await expect(dm.connect(coordinator).assignInKindToBeneficiary(1n, beneficiary2.address))
        .to.be.revertedWithCustomError(dm, "NotCrisisVerifiedBeneficiary")
        .withArgs(beneficiary2.address, CRISIS_ID);
    });

    it("reverts when NFT ID does not exist", async function () {
      await expect(dm.connect(coordinator).assignInKindToBeneficiary(999n, beneficiary1.address))
        .to.be.revertedWithCustomError(dm, "NFTNotFound")
        .withArgs(999n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // confirmInKindRedemption
  // ═══════════════════════════════════════════════════════════════════════════

  describe("confirmInKindRedemption()", function () {
    beforeEach(async function () {
      await dm.connect(donor1).donateInKind(CRISIS_ID, SAMPLE_URI); // nftId = 1
      await dm.connect(donor1).donateFT(CRISIS_ID, 1n);
      await dm.connect(governance).releaseEscrowToCoordinator(CRISIS_ID, coordinator.address);
      await dm.connect(coordinator).assignInKindToBeneficiary(1n, beneficiary1.address);
    });

    it("assigned beneficiary can confirm receipt", async function () {
      await dm.connect(beneficiary1).confirmInKindRedemption(1n);
      const record = await dm.getInKindDonation(1n);
      expect(record.status).to.equal(Status.REDEEMED);
    });

    it("emits InKindRedeemed with correct args", async function () {
      await expect(dm.connect(beneficiary1).confirmInKindRedemption(1n))
        .to.emit(dm, "InKindRedeemed")
        .withArgs(1n, beneficiary1.address);
    });

    it("reverts when caller is not the assigned beneficiary", async function () {
      await expect(dm.connect(stranger).confirmInKindRedemption(1n))
        .to.be.revertedWithCustomError(dm, "NotAssignedBeneficiary")
        .withArgs(stranger.address, 1n);
    });

    it("reverts when item is still PENDING (not yet assigned)", async function () {
      await dm.connect(donor1).donateInKind(CRISIS_ID, SAMPLE_URI); // nftId = 2, PENDING
      // Need to make beneficiary1 "own" nftId=2 somehow — but they can't since it's PENDING.
      // Instead, confirm we can't redeem a PENDING item using the direct call.
      // We simulate this by assigning nftId=2 first, then test a fresh PENDING item.
      // Actually the simplest test: confirm nftId=2 (PENDING) by the correct beneficiary
      // is impossible since assignedTo == address(0). We test via NotAssignedBeneficiary.
      await expect(dm.connect(beneficiary1).confirmInKindRedemption(2n))
        .to.be.revertedWithCustomError(dm, "NotAssignedBeneficiary")
        .withArgs(beneficiary1.address, 2n);
    });

    it("reverts when item is already REDEEMED (double-redemption)", async function () {
      await dm.connect(beneficiary1).confirmInKindRedemption(1n);
      await expect(dm.connect(beneficiary1).confirmInKindRedemption(1n))
        .to.be.revertedWithCustomError(dm, "WrongNFTStatus")
        .withArgs(1n, Status.ASSIGNED, Status.REDEEMED);
    });

    it("reverts when NFT ID does not exist", async function () {
      await expect(dm.connect(beneficiary1).confirmInKindRedemption(999n))
        .to.be.revertedWithCustomError(dm, "NFTNotFound")
        .withArgs(999n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Three-way verification flow (end-to-end)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Three-way verification flow", function () {
    it("completes the full PENDING → ASSIGNED → REDEEMED lifecycle", async function () {
      // Step 1: Donor commits item
      await dm.connect(donor1).donateInKind(CRISIS_ID, SAMPLE_URI);
      let record = await dm.getInKindDonation(1n);
      expect(record.status).to.equal(Status.PENDING);
      expect(await dm.nftOwnerOf(1n)).to.equal(dm.target);

      // Release escrow so coordinator is set
      await dm.connect(donor1).donateFT(CRISIS_ID, 1n);
      await dm.connect(governance).releaseEscrowToCoordinator(CRISIS_ID, coordinator.address);

      // Step 2: Coordinator assigns item
      await dm.connect(coordinator).assignInKindToBeneficiary(1n, beneficiary1.address);
      record = await dm.getInKindDonation(1n);
      expect(record.status).to.equal(Status.ASSIGNED);
      expect(record.assignedTo).to.equal(beneficiary1.address);
      expect(await dm.nftOwnerOf(1n)).to.equal(beneficiary1.address);

      // Step 3: Beneficiary confirms receipt
      await dm.connect(beneficiary1).confirmInKindRedemption(1n);
      record = await dm.getInKindDonation(1n);
      expect(record.status).to.equal(Status.REDEEMED);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // View functions
  // ═══════════════════════════════════════════════════════════════════════════

  describe("getDonorContribution()", function () {
    it("returns zero for a donor who has not donated to the crisis", async function () {
      expect(await dm.getDonorContribution(stranger.address, CRISIS_ID)).to.equal(0n);
    });

    it("returns the correct cumulative donation amount", async function () {
      await dm.connect(donor1).donateFT(CRISIS_ID, 100n);
      await dm.connect(donor1).donateFT(CRISIS_ID, 200n);
      expect(await dm.getDonorContribution(donor1.address, CRISIS_ID)).to.equal(300n);
    });
  });

  describe("getCrisisEscrowBalance()", function () {
    it("returns zero for a crisis with no donations", async function () {
      expect(await dm.getCrisisEscrowBalance(CRISIS_ID_2)).to.equal(0n);
    });

    it("returns the correct total after donations", async function () {
      await dm.connect(donor1).donateFT(CRISIS_ID, 100n);
      await dm.connect(donor2).donateFT(CRISIS_ID, 250n);
      expect(await dm.getCrisisEscrowBalance(CRISIS_ID)).to.equal(350n);
    });

    it("returns zero after escrow is released", async function () {
      await dm.connect(donor1).donateFT(CRISIS_ID, 100n);
      await dm.connect(governance).releaseEscrowToCoordinator(CRISIS_ID, coordinator.address);
      expect(await dm.getCrisisEscrowBalance(CRISIS_ID)).to.equal(0n);
    });
  });

  describe("nftOwnerOf()", function () {
    it("reverts for a non-existent NFT ID", async function () {
      await expect(dm.nftOwnerOf(42n))
        .to.be.revertedWithCustomError(dm, "NFTNotFound")
        .withArgs(42n);
    });
  });

  describe("getInKindDonation()", function () {
    it("returns zero-value struct for a non-existent ID (sentinel check)", async function () {
      const record = await dm.getInKindDonation(999n);
      expect(record.nftId).to.equal(0n);
      expect(record.donor).to.equal(ethers.ZeroAddress);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // directDonateFT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("directDonateFT()", function () {
    it("registered donor can donate directly to a registered beneficiary", async function () {
      await dm.connect(donor1).directDonateFT(beneficiary1.address, 50n);
      expect(await dm.balanceOf(beneficiary1.address)).to.equal(50n);
    });

    it("mints tokens directly to the beneficiary (not escrow)", async function () {
      await dm.connect(donor1).directDonateFT(beneficiary1.address, 100n);
      expect(await dm.balanceOf(beneficiary1.address)).to.equal(100n);
      // Contract (escrow) balance should be unchanged
      expect(await dm.balanceOf(dm.target)).to.equal(0n);
    });

    it("does NOT update donorContribution mapping", async function () {
      await dm.connect(donor1).directDonateFT(beneficiary1.address, 200n);
      // donorContribution is per-crisis; direct donations have no crisis
      // Check crisis 1 (the active one) — should still be 0
      expect(await dm.donorContribution(donor1.address, CRISIS_ID)).to.equal(0n);
    });

    it("does NOT update crisisEscrow", async function () {
      await dm.connect(donor1).directDonateFT(beneficiary1.address, 100n);
      expect(await dm.crisisEscrow(CRISIS_ID)).to.equal(0n);
    });

    it("works when no crisis is active", async function () {
      // Deactivate the only active crisis
      await dm.connect(governance).deactivateCrisis(CRISIS_ID);
      // Direct donation should still work
      await dm.connect(donor1).directDonateFT(beneficiary1.address, 50n);
      expect(await dm.balanceOf(beneficiary1.address)).to.equal(50n);
    });

    it("emits DirectFTDonation event with correct args", async function () {
      await expect(dm.connect(donor1).directDonateFT(beneficiary1.address, 75n))
        .to.emit(dm, "DirectFTDonation")
        .withArgs(donor1.address, beneficiary1.address, 75n);
    });

    it("reverts when caller is not registered", async function () {
      await expect(dm.connect(stranger).directDonateFT(beneficiary1.address, 50n))
        .to.be.revertedWithCustomError(dm, "NotRegistered")
        .withArgs(stranger.address);
    });

    it("reverts when beneficiary is not registered", async function () {
      await expect(dm.connect(donor1).directDonateFT(stranger.address, 50n))
        .to.be.revertedWithCustomError(dm, "NotRegisteredBeneficiary")
        .withArgs(stranger.address);
    });

    it("reverts when beneficiary is registered but wrong role (Donor)", async function () {
      await expect(dm.connect(donor1).directDonateFT(donor2.address, 50n))
        .to.be.revertedWithCustomError(dm, "NotRegisteredBeneficiary")
        .withArgs(donor2.address);
    });

    it("reverts when beneficiary is registered but wrong role (PrivateCompany)", async function () {
      await expect(dm.connect(donor1).directDonateFT(company.address, 50n))
        .to.be.revertedWithCustomError(dm, "NotRegisteredBeneficiary")
        .withArgs(company.address);
    });

    it("reverts when amount is zero", async function () {
      await expect(dm.connect(donor1).directDonateFT(beneficiary1.address, 0n))
        .to.be.revertedWithCustomError(dm, "ZeroAmount");
    });
  });
});
