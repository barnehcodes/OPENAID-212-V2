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

const EMPTY_PROOF  = "0x";
const SAMPLE_URI   = "ipfs://QmSampleMetadataHash";
const CRISIS_ID    = 1n;
const CRISIS_ID_2  = 2n;

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Samaritan Score & FT Beneficiary Confirmation", function () {
  // ── Signers ────────────────────────────────────────────────────────────────
  let deployer:        HardhatEthersSigner;
  let operationalAuth: HardhatEthersSigner;
  let verificationMS:  HardhatEthersSigner;
  let crisisMS:        HardhatEthersSigner;
  let governance:      HardhatEthersSigner;
  let coordinator:     HardhatEthersSigner;
  let donor1:          HardhatEthersSigner;
  let donor2:          HardhatEthersSigner;
  let beneficiary1:    HardhatEthersSigner;
  let beneficiary2:    HardhatEthersSigner;
  let facility:        HardhatEthersSigner;
  let stranger:        HardhatEthersSigner;

  // ── Contracts ──────────────────────────────────────────────────────────────
  let registry: Registry;
  let dm:       DonationManager;

  // ─────────────────────────────────────────────────────────────────────────
  // Shared setup
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
      facility,
      stranger,
    ] = await ethers.getSigners();

    // Deploy Registry
    const RegistryFactory = await ethers.getContractFactory("Registry");
    registry = await RegistryFactory.deploy(
      operationalAuth.address,
      verificationMS.address,
      crisisMS.address
    );

    // Deploy DonationManager
    const DMFactory = await ethers.getContractFactory("DonationManager");
    dm = await DMFactory.deploy(registry.target, ethers.ZeroAddress);
    await dm.connect(deployer).setGovernanceContract(governance.address);

    // Populate Registry
    // coordinator = verified NGO
    await registry.connect(coordinator).registerNGO(coordinator.address);
    await registry.connect(verificationMS).verifyNGO(coordinator.address, EMPTY_PROOF);

    // facility = verified GO (registerGO requires DEFAULT_ADMIN_ROLE; GOs are auto-verified)
    await registry.connect(deployer).registerGO(facility.address);

    // Donors
    await registry.connect(donor1).registerParticipant(donor1.address, Role.Donor);
    await registry.connect(donor2).registerParticipant(donor2.address, Role.Donor);

    // Beneficiaries (registered + crisis-verified for CRISIS_ID)
    await registry.connect(beneficiary1).registerParticipant(beneficiary1.address, Role.Beneficiary);
    await registry.connect(beneficiary2).registerParticipant(beneficiary2.address, Role.Beneficiary);
    await registry.connect(verificationMS).verifyBeneficiary(beneficiary1.address, CRISIS_ID, EMPTY_PROOF);

    // Activate crisis
    await dm.connect(governance).activateCrisis(CRISIS_ID);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Helper: bring crisis to distributing state (coordinator elected)
  // ═══════════════════════════════════════════════════════════════════════════

  async function setupCrisisWithCoordinator(crisisId: bigint = CRISIS_ID) {
    // Donor donates, governance releases escrow to coordinator
    await dm.connect(donor1).donateFT(crisisId, 1000n);
    await dm.connect(governance).deactivateCrisis(crisisId);
    await dm.connect(governance).releaseEscrowToCoordinator(crisisId, coordinator.address);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Samaritan Score — Crisis FT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("confirmCrisisDonationTracked", function () {
    it("increments score after coordinator is elected", async function () {
      await setupCrisisWithCoordinator();

      await dm.connect(donor1).confirmCrisisDonationTracked(CRISIS_ID);
      expect(await dm.getSamaritanScore(donor1.address)).to.equal(1n);
      expect(await dm.hasDonorTrackedCrisis(donor1.address, CRISIS_ID)).to.be.true;
    });

    it("reverts for non-donor with NotDonorForCrisis", async function () {
      await setupCrisisWithCoordinator();

      await expect(
        dm.connect(donor2).confirmCrisisDonationTracked(CRISIS_ID)
      ).to.be.revertedWithCustomError(dm, "NotDonorForCrisis")
        .withArgs(donor2.address, CRISIS_ID);
    });

    it("reverts on double-track with AlreadyTrackedCrisis", async function () {
      await setupCrisisWithCoordinator();

      await dm.connect(donor1).confirmCrisisDonationTracked(CRISIS_ID);
      await expect(
        dm.connect(donor1).confirmCrisisDonationTracked(CRISIS_ID)
      ).to.be.revertedWithCustomError(dm, "AlreadyTrackedCrisis")
        .withArgs(donor1.address, CRISIS_ID);
    });

    it("reverts before distribution with CrisisNotYetDistributing", async function () {
      // Donor donates but no coordinator elected yet
      await dm.connect(donor1).donateFT(CRISIS_ID, 500n);

      await expect(
        dm.connect(donor1).confirmCrisisDonationTracked(CRISIS_ID)
      ).to.be.revertedWithCustomError(dm, "CrisisNotYetDistributing")
        .withArgs(CRISIS_ID);
    });

    it("allows tracking when crisis is paused", async function () {
      await setupCrisisWithCoordinator();
      // Pause the crisis (simulates misconduct)
      await dm.connect(governance).pauseCrisis(CRISIS_ID);

      await dm.connect(donor1).confirmCrisisDonationTracked(CRISIS_ID);
      expect(await dm.getSamaritanScore(donor1.address)).to.equal(1n);
    });

    it("accumulates score across multiple crises", async function () {
      // Setup crisis 2
      await dm.connect(governance).activateCrisis(CRISIS_ID_2);
      await dm.connect(donor1).donateFT(CRISIS_ID_2, 500n);
      await dm.connect(governance).deactivateCrisis(CRISIS_ID_2);
      await dm.connect(governance).releaseEscrowToCoordinator(CRISIS_ID_2, coordinator.address);

      // Setup crisis 1
      await setupCrisisWithCoordinator();

      // Track both
      await dm.connect(donor1).confirmCrisisDonationTracked(CRISIS_ID);
      await dm.connect(donor1).confirmCrisisDonationTracked(CRISIS_ID_2);

      expect(await dm.getSamaritanScore(donor1.address)).to.equal(2n);
    });

    it("emits CrisisDonationTracked event", async function () {
      await setupCrisisWithCoordinator();

      await expect(dm.connect(donor1).confirmCrisisDonationTracked(CRISIS_ID))
        .to.emit(dm, "CrisisDonationTracked")
        .withArgs(donor1.address, CRISIS_ID, 1n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Samaritan Score — In-Kind
  // ═══════════════════════════════════════════════════════════════════════════

  describe("confirmInKindTracked", function () {
    it("increments score after coordinator assigns crisis-bound item", async function () {
      // Donate in-kind to crisis
      await dm.connect(donor1).donateInKind(CRISIS_ID, SAMPLE_URI);
      const nftId = 1n;

      // Coordinator elected and assigns item
      await setupCrisisWithCoordinator();
      await dm.connect(coordinator).assignInKindToBeneficiary(nftId, beneficiary1.address);

      await dm.connect(donor1).confirmInKindTracked(nftId);
      expect(await dm.getSamaritanScore(donor1.address)).to.equal(1n);
      expect(await dm.hasDonorTrackedInKind(donor1.address, nftId)).to.be.true;
    });

    it("increments score after facility confirms direct in-kind delivery", async function () {
      // Direct in-kind donation through facility
      await dm.connect(donor1).directDonateInKind(facility.address, beneficiary1.address, SAMPLE_URI);
      const nftId = 1n;

      // Facility confirms delivery (PENDING → ASSIGNED)
      await dm.connect(facility).confirmFacilityDelivery(nftId);

      await dm.connect(donor1).confirmInKindTracked(nftId);
      expect(await dm.getSamaritanScore(donor1.address)).to.equal(1n);
    });

    it("works when item is REDEEMED", async function () {
      // Direct in-kind → facility confirms → beneficiary redeems
      await dm.connect(donor1).directDonateInKind(facility.address, beneficiary1.address, SAMPLE_URI);
      const nftId = 1n;

      await dm.connect(facility).confirmFacilityDelivery(nftId);
      await dm.connect(beneficiary1).confirmInKindRedemption(nftId);

      await dm.connect(donor1).confirmInKindTracked(nftId);
      expect(await dm.getSamaritanScore(donor1.address)).to.equal(1n);
    });

    it("reverts for non-donor with NotDonorOfItem", async function () {
      await dm.connect(donor1).directDonateInKind(facility.address, beneficiary1.address, SAMPLE_URI);
      const nftId = 1n;
      await dm.connect(facility).confirmFacilityDelivery(nftId);

      await expect(
        dm.connect(donor2).confirmInKindTracked(nftId)
      ).to.be.revertedWithCustomError(dm, "NotDonorOfItem")
        .withArgs(donor2.address, nftId);
    });

    it("reverts while PENDING with InKindNotYetAssigned", async function () {
      await dm.connect(donor1).donateInKind(CRISIS_ID, SAMPLE_URI);
      const nftId = 1n;

      await expect(
        dm.connect(donor1).confirmInKindTracked(nftId)
      ).to.be.revertedWithCustomError(dm, "InKindNotYetAssigned")
        .withArgs(nftId);
    });

    it("reverts on double-track with AlreadyTrackedInKind", async function () {
      await dm.connect(donor1).directDonateInKind(facility.address, beneficiary1.address, SAMPLE_URI);
      const nftId = 1n;
      await dm.connect(facility).confirmFacilityDelivery(nftId);

      await dm.connect(donor1).confirmInKindTracked(nftId);
      await expect(
        dm.connect(donor1).confirmInKindTracked(nftId)
      ).to.be.revertedWithCustomError(dm, "AlreadyTrackedInKind")
        .withArgs(donor1.address, nftId);
    });

    it("reverts for non-existent NFT with NFTNotFound", async function () {
      await expect(
        dm.connect(donor1).confirmInKindTracked(999n)
      ).to.be.revertedWithCustomError(dm, "NFTNotFound")
        .withArgs(999n);
    });

    it("emits InKindDonationTracked event", async function () {
      await dm.connect(donor1).directDonateInKind(facility.address, beneficiary1.address, SAMPLE_URI);
      const nftId = 1n;
      await dm.connect(facility).confirmFacilityDelivery(nftId);

      await expect(dm.connect(donor1).confirmInKindTracked(nftId))
        .to.emit(dm, "InKindDonationTracked")
        .withArgs(donor1.address, nftId, 1n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Samaritan Score — View functions
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Samaritan Score view functions", function () {
    it("getSamaritanScore returns 0 for address with no tracking", async function () {
      expect(await dm.getSamaritanScore(stranger.address)).to.equal(0n);
    });

    it("hasDonorTrackedCrisis returns false when not tracked", async function () {
      expect(await dm.hasDonorTrackedCrisis(donor1.address, CRISIS_ID)).to.be.false;
    });

    it("hasDonorTrackedInKind returns false when not tracked", async function () {
      expect(await dm.hasDonorTrackedInKind(donor1.address, 1n)).to.be.false;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FT Beneficiary Confirmation
  // ═══════════════════════════════════════════════════════════════════════════

  describe("confirmFTReceipt", function () {
    it("beneficiary confirms after receiving distribution", async function () {
      await setupCrisisWithCoordinator();
      await dm.connect(coordinator).distributeFTToBeneficiary(CRISIS_ID, beneficiary1.address, 100n);

      await dm.connect(beneficiary1).confirmFTReceipt(CRISIS_ID);
      expect(await dm.hasBeneficiaryConfirmedFT(beneficiary1.address, CRISIS_ID)).to.be.true;
    });

    it("reverts for non-beneficiary role", async function () {
      await expect(
        dm.connect(donor1).confirmFTReceipt(CRISIS_ID)
      ).to.be.revertedWithCustomError(dm, "NotRegisteredBeneficiary")
        .withArgs(donor1.address);
    });

    it("reverts with NothingToConfirm when no FT received", async function () {
      await expect(
        dm.connect(beneficiary1).confirmFTReceipt(CRISIS_ID)
      ).to.be.revertedWithCustomError(dm, "NothingToConfirm")
        .withArgs(beneficiary1.address, CRISIS_ID);
    });

    it("reverts on double-confirm with AlreadyConfirmedFT", async function () {
      await setupCrisisWithCoordinator();
      await dm.connect(coordinator).distributeFTToBeneficiary(CRISIS_ID, beneficiary1.address, 100n);

      await dm.connect(beneficiary1).confirmFTReceipt(CRISIS_ID);
      await expect(
        dm.connect(beneficiary1).confirmFTReceipt(CRISIS_ID)
      ).to.be.revertedWithCustomError(dm, "AlreadyConfirmedFT")
        .withArgs(beneficiary1.address, CRISIS_ID);
    });

    it("ftReceived accumulates across multiple distributions", async function () {
      await setupCrisisWithCoordinator();
      await dm.connect(coordinator).distributeFTToBeneficiary(CRISIS_ID, beneficiary1.address, 100n);
      await dm.connect(coordinator).distributeFTToBeneficiary(CRISIS_ID, beneficiary1.address, 200n);

      expect(await dm.getFTReceivedAmount(beneficiary1.address, CRISIS_ID)).to.equal(300n);

      // Confirm emits the cumulative amount
      await expect(dm.connect(beneficiary1).confirmFTReceipt(CRISIS_ID))
        .to.emit(dm, "FTReceiptConfirmed")
        .withArgs(beneficiary1.address, CRISIS_ID, 300n);
    });

    it("emits FTReceiptConfirmed event with correct amount", async function () {
      await setupCrisisWithCoordinator();
      await dm.connect(coordinator).distributeFTToBeneficiary(CRISIS_ID, beneficiary1.address, 250n);

      await expect(dm.connect(beneficiary1).confirmFTReceipt(CRISIS_ID))
        .to.emit(dm, "FTReceiptConfirmed")
        .withArgs(beneficiary1.address, CRISIS_ID, 250n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FT Confirmation — View functions
  // ═══════════════════════════════════════════════════════════════════════════

  describe("FT Confirmation view functions", function () {
    it("getFTReceivedAmount returns 0 when nothing received", async function () {
      expect(await dm.getFTReceivedAmount(beneficiary1.address, CRISIS_ID)).to.equal(0n);
    });

    it("hasBeneficiaryConfirmedFT returns false when not confirmed", async function () {
      expect(await dm.hasBeneficiaryConfirmedFT(beneficiary1.address, CRISIS_ID)).to.be.false;
    });
  });
});
