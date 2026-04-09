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

const EMPTY_PROOF = "0x";

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("DirectFTTracking", function () {
  let deployer:        HardhatEthersSigner;
  let operationalAuth: HardhatEthersSigner;
  let verificationMS:  HardhatEthersSigner;
  let crisisMS:        HardhatEthersSigner;
  let governance:      HardhatEthersSigner;
  let donor1:          HardhatEthersSigner;
  let donor2:          HardhatEthersSigner;
  let beneficiary1:    HardhatEthersSigner;
  let beneficiary2:    HardhatEthersSigner;
  let stranger:        HardhatEthersSigner;

  let registry: Registry;
  let dm:       DonationManager;

  beforeEach(async function () {
    [
      deployer,
      operationalAuth,
      verificationMS,
      crisisMS,
      governance,
      donor1,
      donor2,
      beneficiary1,
      beneficiary2,
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

    // Register participants
    await registry.connect(donor1).registerParticipant(donor1.address, Role.Donor);
    await registry.connect(donor2).registerParticipant(donor2.address, Role.Donor);
    await registry.connect(beneficiary1).registerParticipant(beneficiary1.address, Role.Beneficiary);
    await registry.connect(beneficiary2).registerParticipant(beneficiary2.address, Role.Beneficiary);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // confirmDirectFTTracked — happy path
  // ═══════════════════════════════════════════════════════════════════════════

  it("donor tracks after direct FT donation → score increments", async function () {
    await dm.connect(donor1).directDonateFT(beneficiary1.address, 100n);
    await expect(dm.connect(donor1).confirmDirectFTTracked(beneficiary1.address))
      .to.emit(dm, "DirectFTDonationTracked")
      .withArgs(donor1.address, beneficiary1.address, 1n);

    expect(await dm.getSamaritanScore(donor1.address)).to.equal(1n);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // confirmDirectFTTracked — revert cases
  // ═══════════════════════════════════════════════════════════════════════════

  it("non-donor gets NoDirectFTToBeneficiary", async function () {
    await expect(dm.connect(donor1).confirmDirectFTTracked(beneficiary1.address))
      .to.be.revertedWithCustomError(dm, "NoDirectFTToBeneficiary")
      .withArgs(donor1.address, beneficiary1.address);
  });

  it("double-track reverts with AlreadyTrackedDirectFT", async function () {
    await dm.connect(donor1).directDonateFT(beneficiary1.address, 50n);
    await dm.connect(donor1).confirmDirectFTTracked(beneficiary1.address);

    await expect(dm.connect(donor1).confirmDirectFTTracked(beneficiary1.address))
      .to.be.revertedWithCustomError(dm, "AlreadyTrackedDirectFT")
      .withArgs(donor1.address, beneficiary1.address);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Score accumulation
  // ═══════════════════════════════════════════════════════════════════════════

  it("score accumulates: donor sends direct FT to two beneficiaries, tracks both → score = 2", async function () {
    await dm.connect(donor1).directDonateFT(beneficiary1.address, 100n);
    await dm.connect(donor1).directDonateFT(beneficiary2.address, 200n);

    await dm.connect(donor1).confirmDirectFTTracked(beneficiary1.address);
    await dm.connect(donor1).confirmDirectFTTracked(beneficiary2.address);

    expect(await dm.getSamaritanScore(donor1.address)).to.equal(2n);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // directFTDonated accumulation
  // ═══════════════════════════════════════════════════════════════════════════

  it("directFTDonated accumulates across multiple donations to same beneficiary", async function () {
    await dm.connect(donor1).directDonateFT(beneficiary1.address, 100n);
    await dm.connect(donor1).directDonateFT(beneficiary1.address, 250n);

    expect(await dm.getDirectFTDonated(donor1.address, beneficiary1.address)).to.equal(350n);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // View functions
  // ═══════════════════════════════════════════════════════════════════════════

  it("getDirectFTDonated returns correct value", async function () {
    expect(await dm.getDirectFTDonated(donor1.address, beneficiary1.address)).to.equal(0n);

    await dm.connect(donor1).directDonateFT(beneficiary1.address, 42n);
    expect(await dm.getDirectFTDonated(donor1.address, beneficiary1.address)).to.equal(42n);
  });

  it("hasDonorTrackedDirectFT returns correct values", async function () {
    await dm.connect(donor1).directDonateFT(beneficiary1.address, 100n);

    expect(await dm.hasDonorTrackedDirectFT(donor1.address, beneficiary1.address)).to.be.false;

    await dm.connect(donor1).confirmDirectFTTracked(beneficiary1.address);

    expect(await dm.hasDonorTrackedDirectFT(donor1.address, beneficiary1.address)).to.be.true;
  });
});
