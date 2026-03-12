import { expect } from "chai";
import { ethers } from "hardhat";
import { Registry } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Mirror the Role enum from the contract (matches IRegistry.Role order)
enum Role {
  GO = 0,
  NGO = 1,
  Donor = 2,
  Beneficiary = 3,
  PrivateCompany = 4,
}

const EMPTY_PROOF = "0x";

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Registry", function () {
  // Named signers — each represents a conceptual actor in the system
  let deployer: HardhatEthersSigner;       // holds DEFAULT_ADMIN_ROLE
  let operationalAuth: HardhatEthersSigner; // Tier-1 single signer
  let verificationMS: HardhatEthersSigner;  // Tier-2 2-of-3 multisig (simulated as EOA)
  let crisisMS: HardhatEthersSigner;        // Tier-3 4-of-7 multisig (simulated as EOA)
  let go1: HardhatEthersSigner;
  let ngo1: HardhatEthersSigner;
  let ngo2: HardhatEthersSigner;
  let donor1: HardhatEthersSigner;
  let beneficiary1: HardhatEthersSigner;
  let company1: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;        // holds no roles — the "bad actor"

  let registry: Registry;

  // Role hash constants (recomputed from contract's keccak256 values)
  let VERIFICATION_ROLE: string;
  let CRISIS_DECLARATION_ROLE: string;
  let OPERATIONAL_ROLE: string;
  let DEFAULT_ADMIN_ROLE: string;

  // ── Deploy fresh registry before every test ──────────────────────────────
  beforeEach(async function () {
    [
      deployer,
      operationalAuth,
      verificationMS,
      crisisMS,
      go1,
      ngo1,
      ngo2,
      donor1,
      beneficiary1,
      company1,
      stranger,
    ] = await ethers.getSigners();

    const RegistryFactory = await ethers.getContractFactory("Registry");
    registry = await RegistryFactory.deploy(
      operationalAuth.address,
      verificationMS.address,
      crisisMS.address
    );

    // Fetch role hashes from the deployed contract
    VERIFICATION_ROLE       = await registry.VERIFICATION_ROLE();
    CRISIS_DECLARATION_ROLE = await registry.CRISIS_DECLARATION_ROLE();
    OPERATIONAL_ROLE        = await registry.OPERATIONAL_ROLE();
    DEFAULT_ADMIN_ROLE      = await registry.DEFAULT_ADMIN_ROLE();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Constructor / initial state
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("stores the three tier addresses correctly", async function () {
      expect(await registry.operationalAuthority()).to.equal(operationalAuth.address);
      expect(await registry.verificationMultisig()).to.equal(verificationMS.address);
      expect(await registry.crisisDeclarationMultisig()).to.equal(crisisMS.address);
    });

    it("grants DEFAULT_ADMIN_ROLE to the deployer", async function () {
      expect(await registry.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.be.true;
    });

    it("grants OPERATIONAL_ROLE to the operational authority", async function () {
      expect(await registry.hasRole(OPERATIONAL_ROLE, operationalAuth.address)).to.be.true;
    });

    it("grants VERIFICATION_ROLE to the verification multisig", async function () {
      expect(await registry.hasRole(VERIFICATION_ROLE, verificationMS.address)).to.be.true;
    });

    it("grants CRISIS_DECLARATION_ROLE to the crisis declaration multisig", async function () {
      expect(await registry.hasRole(CRISIS_DECLARATION_ROLE, crisisMS.address)).to.be.true;
    });

    it("reverts when constructed with a zero operational authority", async function () {
      const F = await ethers.getContractFactory("Registry");
      await expect(
        F.deploy(ethers.ZeroAddress, verificationMS.address, crisisMS.address)
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });

    it("reverts when constructed with a zero verification multisig", async function () {
      const F = await ethers.getContractFactory("Registry");
      await expect(
        F.deploy(operationalAuth.address, ethers.ZeroAddress, crisisMS.address)
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });

    it("reverts when constructed with a zero crisis declaration multisig", async function () {
      const F = await ethers.getContractFactory("Registry");
      await expect(
        F.deploy(operationalAuth.address, verificationMS.address, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // registerParticipant
  // ═══════════════════════════════════════════════════════════════════════════

  describe("registerParticipant", function () {
    it("registers a Donor and emits ParticipantRegistered", async function () {
      await expect(registry.registerParticipant(donor1.address, Role.Donor))
        .to.emit(registry, "ParticipantRegistered")
        .withArgs(donor1.address, Role.Donor);

      const p = await registry.getParticipant(donor1.address);
      expect(p.addr).to.equal(donor1.address);
      expect(p.role).to.equal(Role.Donor);
      expect(p.exists).to.be.true;
      expect(p.isVerified).to.be.false;
      expect(p.registeredAt).to.be.gt(0n);
    });

    it("registers a Beneficiary successfully", async function () {
      await expect(registry.registerParticipant(beneficiary1.address, Role.Beneficiary))
        .to.emit(registry, "ParticipantRegistered")
        .withArgs(beneficiary1.address, Role.Beneficiary);

      const p = await registry.getParticipant(beneficiary1.address);
      expect(p.role).to.equal(Role.Beneficiary);
      expect(p.isVerified).to.be.false;
    });

    it("registers a PrivateCompany successfully", async function () {
      await expect(registry.registerParticipant(company1.address, Role.PrivateCompany))
        .to.emit(registry, "ParticipantRegistered")
        .withArgs(company1.address, Role.PrivateCompany);
    });

    it("reverts when the same address is registered twice", async function () {
      await registry.registerParticipant(donor1.address, Role.Donor);

      await expect(
        registry.registerParticipant(donor1.address, Role.Donor)
      ).to.be.revertedWithCustomError(registry, "AlreadyRegistered")
        .withArgs(donor1.address);
    });

    it("reverts when role is GO (must use registerGO)", async function () {
      await expect(
        registry.registerParticipant(go1.address, Role.GO)
      ).to.be.revertedWithCustomError(registry, "InvalidRoleForOpenRegistration")
        .withArgs(Role.GO);
    });

    it("reverts when role is NGO (must use registerNGO)", async function () {
      await expect(
        registry.registerParticipant(ngo1.address, Role.NGO)
      ).to.be.revertedWithCustomError(registry, "InvalidRoleForOpenRegistration")
        .withArgs(Role.NGO);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // registerGO
  // ═══════════════════════════════════════════════════════════════════════════

  describe("registerGO", function () {
    it("registers a GO when called by the deployer and emits GORegistered", async function () {
      await expect(registry.connect(deployer).registerGO(go1.address))
        .to.emit(registry, "GORegistered")
        .withArgs(go1.address);

      const p = await registry.getParticipant(go1.address);
      expect(p.role).to.equal(Role.GO);
      expect(p.exists).to.be.true;
      expect(p.isVerified).to.be.true;  // GOs are pre-verified
    });

    it("reverts when called by a non-deployer (e.g. stranger)", async function () {
      await expect(
        registry.connect(stranger).registerGO(go1.address)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
        .withArgs(stranger.address, DEFAULT_ADMIN_ROLE);
    });

    it("reverts when called by the operational authority (Tier-1 is not deployer)", async function () {
      await expect(
        registry.connect(operationalAuth).registerGO(go1.address)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("reverts when the address is already registered", async function () {
      await registry.connect(deployer).registerGO(go1.address);

      await expect(
        registry.connect(deployer).registerGO(go1.address)
      ).to.be.revertedWithCustomError(registry, "AlreadyRegistered")
        .withArgs(go1.address);
    });

    it("reverts when the zero address is supplied", async function () {
      await expect(
        registry.connect(deployer).registerGO(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // registerNGO
  // ═══════════════════════════════════════════════════════════════════════════

  describe("registerNGO", function () {
    it("registers an NGO (self-called) and emits NGORegistered", async function () {
      await expect(registry.connect(ngo1).registerNGO(ngo1.address))
        .to.emit(registry, "NGORegistered")
        .withArgs(ngo1.address);

      const p = await registry.getParticipant(ngo1.address);
      expect(p.role).to.equal(Role.NGO);
      expect(p.exists).to.be.true;
      expect(p.isVerified).to.be.false;  // not yet verified by Tier-2
    });

    it("reverts when called for a different address (not self-registration)", async function () {
      // stranger tries to register ngo1 — must revert
      await expect(
        registry.connect(stranger).registerNGO(ngo1.address)
      ).to.be.revertedWithCustomError(registry, "SelfRegistrationRequired")
        .withArgs(stranger.address, ngo1.address);
    });

    it("reverts when the address is already registered", async function () {
      await registry.connect(ngo1).registerNGO(ngo1.address);

      await expect(
        registry.connect(ngo1).registerNGO(ngo1.address)
      ).to.be.revertedWithCustomError(registry, "AlreadyRegistered")
        .withArgs(ngo1.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // verifyNGO
  // ═══════════════════════════════════════════════════════════════════════════

  describe("verifyNGO", function () {
    // Register ngo1 before each sub-test
    beforeEach(async function () {
      await registry.connect(ngo1).registerNGO(ngo1.address);
    });

    it("verifies an NGO when called by the Tier-2 multisig and emits NGOVerified", async function () {
      // This simulates the 2-of-3 multisig having collected enough approvals
      // and now forwarding the call from the multisig contract address.
      await expect(
        registry.connect(verificationMS).verifyNGO(ngo1.address, EMPTY_PROOF)
      ).to.emit(registry, "NGOVerified").withArgs(ngo1.address);

      const p = await registry.getParticipant(ngo1.address);
      expect(p.isVerified).to.be.true;
    });

    it("reverts when called from a non-multisig address (simulates 1-of-3 / missing threshold)", async function () {
      // In the real system, a single signer would call their Gnosis Safe, which would
      // not reach the threshold and therefore never call Registry.verifyNGO().
      // Here we directly simulate a non-multisig caller attempting the call.
      await expect(
        registry.connect(stranger).verifyNGO(ngo1.address, EMPTY_PROOF)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
        .withArgs(stranger.address, VERIFICATION_ROLE);
    });

    it("reverts when the Tier-1 operational authority attempts to verify (wrong tier)", async function () {
      await expect(
        registry.connect(operationalAuth).verifyNGO(ngo1.address, EMPTY_PROOF)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("reverts when the Tier-3 crisis multisig attempts to verify (wrong tier)", async function () {
      await expect(
        registry.connect(crisisMS).verifyNGO(ngo1.address, EMPTY_PROOF)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("reverts when the address is not registered", async function () {
      await expect(
        registry.connect(verificationMS).verifyNGO(stranger.address, EMPTY_PROOF)
      ).to.be.revertedWithCustomError(registry, "NotRegistered")
        .withArgs(stranger.address);
    });

    it("reverts when the address is registered but not as an NGO", async function () {
      await registry.registerParticipant(donor1.address, Role.Donor);

      await expect(
        registry.connect(verificationMS).verifyNGO(donor1.address, EMPTY_PROOF)
      ).to.be.revertedWithCustomError(registry, "NotAnNGO")
        .withArgs(donor1.address);
    });

    it("reverts when the NGO is already verified", async function () {
      await registry.connect(verificationMS).verifyNGO(ngo1.address, EMPTY_PROOF);

      await expect(
        registry.connect(verificationMS).verifyNGO(ngo1.address, EMPTY_PROOF)
      ).to.be.revertedWithCustomError(registry, "AlreadyVerified")
        .withArgs(ngo1.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // isVerifiedValidator
  // ═══════════════════════════════════════════════════════════════════════════

  describe("isVerifiedValidator", function () {
    it("returns false for an unregistered address", async function () {
      expect(await registry.isVerifiedValidator(stranger.address)).to.be.false;
    });

    it("returns true for a registered GO (always verified)", async function () {
      await registry.connect(deployer).registerGO(go1.address);
      expect(await registry.isVerifiedValidator(go1.address)).to.be.true;
    });

    it("returns false for an NGO before Tier-2 verification", async function () {
      await registry.connect(ngo1).registerNGO(ngo1.address);
      // NGO is registered but not yet verified — cannot be a validator
      expect(await registry.isVerifiedValidator(ngo1.address)).to.be.false;
    });

    it("returns true for an NGO after Tier-2 verification", async function () {
      await registry.connect(ngo1).registerNGO(ngo1.address);
      await registry.connect(verificationMS).verifyNGO(ngo1.address, EMPTY_PROOF);
      expect(await registry.isVerifiedValidator(ngo1.address)).to.be.true;
    });

    it("returns false for a Donor (non-validator role)", async function () {
      await registry.registerParticipant(donor1.address, Role.Donor);
      expect(await registry.isVerifiedValidator(donor1.address)).to.be.false;
    });

    it("returns false for a Beneficiary (non-validator role)", async function () {
      await registry.registerParticipant(beneficiary1.address, Role.Beneficiary);
      expect(await registry.isVerifiedValidator(beneficiary1.address)).to.be.false;
    });

    it("returns false for a PrivateCompany (non-validator role)", async function () {
      await registry.registerParticipant(company1.address, Role.PrivateCompany);
      expect(await registry.isVerifiedValidator(company1.address)).to.be.false;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // verifyBeneficiary / isCrisisVerifiedBeneficiary
  // ═══════════════════════════════════════════════════════════════════════════

  describe("verifyBeneficiary", function () {
    const CRISIS_ID_1 = 1n;
    const CRISIS_ID_2 = 2n;

    beforeEach(async function () {
      await registry.registerParticipant(beneficiary1.address, Role.Beneficiary);
    });

    it("verifies a beneficiary for a specific crisis and emits BeneficiaryVerified", async function () {
      await expect(
        registry.connect(verificationMS).verifyBeneficiary(
          beneficiary1.address,
          CRISIS_ID_1,
          EMPTY_PROOF
        )
      )
        .to.emit(registry, "BeneficiaryVerified")
        .withArgs(beneficiary1.address, CRISIS_ID_1);

      expect(
        await registry.isCrisisVerifiedBeneficiary(beneficiary1.address, CRISIS_ID_1)
      ).to.be.true;
    });

    it("returns false for a different crisis than the one verified", async function () {
      await registry.connect(verificationMS).verifyBeneficiary(
        beneficiary1.address,
        CRISIS_ID_1,
        EMPTY_PROOF
      );

      // Verified for crisis 1 but NOT for crisis 2
      expect(
        await registry.isCrisisVerifiedBeneficiary(beneficiary1.address, CRISIS_ID_2)
      ).to.be.false;
    });

    it("allows separate verification for multiple crises", async function () {
      await registry.connect(verificationMS).verifyBeneficiary(
        beneficiary1.address, CRISIS_ID_1, EMPTY_PROOF
      );
      await registry.connect(verificationMS).verifyBeneficiary(
        beneficiary1.address, CRISIS_ID_2, EMPTY_PROOF
      );

      expect(await registry.isCrisisVerifiedBeneficiary(beneficiary1.address, CRISIS_ID_1)).to.be.true;
      expect(await registry.isCrisisVerifiedBeneficiary(beneficiary1.address, CRISIS_ID_2)).to.be.true;
    });

    it("reverts when called from a non-multisig address", async function () {
      await expect(
        registry.connect(stranger).verifyBeneficiary(
          beneficiary1.address, CRISIS_ID_1, EMPTY_PROOF
        )
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
        .withArgs(stranger.address, VERIFICATION_ROLE);
    });

    it("reverts when the address is not registered", async function () {
      await expect(
        registry.connect(verificationMS).verifyBeneficiary(
          stranger.address, CRISIS_ID_1, EMPTY_PROOF
        )
      ).to.be.revertedWithCustomError(registry, "NotRegistered")
        .withArgs(stranger.address);
    });

    it("reverts when the address is registered but not as a Beneficiary", async function () {
      await registry.registerParticipant(donor1.address, Role.Donor);

      await expect(
        registry.connect(verificationMS).verifyBeneficiary(
          donor1.address, CRISIS_ID_1, EMPTY_PROOF
        )
      ).to.be.revertedWithCustomError(registry, "NotABeneficiary")
        .withArgs(donor1.address);
    });

    it("isCrisisVerifiedBeneficiary returns false for an unregistered address", async function () {
      expect(
        await registry.isCrisisVerifiedBeneficiary(stranger.address, CRISIS_ID_1)
      ).to.be.false;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateOperationalAuthority
  // ═══════════════════════════════════════════════════════════════════════════

  describe("updateOperationalAuthority", function () {
    it("updates authority when called by Tier-3 multisig and emits event", async function () {
      await expect(
        registry.connect(crisisMS).updateOperationalAuthority(stranger.address)
      )
        .to.emit(registry, "OperationalAuthorityUpdated")
        .withArgs(operationalAuth.address, stranger.address);

      expect(await registry.operationalAuthority()).to.equal(stranger.address);
    });

    it("grants OPERATIONAL_ROLE to the new address", async function () {
      await registry.connect(crisisMS).updateOperationalAuthority(stranger.address);
      expect(await registry.hasRole(OPERATIONAL_ROLE, stranger.address)).to.be.true;
    });

    it("revokes OPERATIONAL_ROLE from the old address", async function () {
      await registry.connect(crisisMS).updateOperationalAuthority(stranger.address);
      expect(await registry.hasRole(OPERATIONAL_ROLE, operationalAuth.address)).to.be.false;
    });

    it("reverts when called by the Tier-2 verification multisig (wrong tier)", async function () {
      await expect(
        registry.connect(verificationMS).updateOperationalAuthority(stranger.address)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
        .withArgs(verificationMS.address, CRISIS_DECLARATION_ROLE);
    });

    it("reverts when called by the Tier-1 operational authority itself (wrong tier)", async function () {
      await expect(
        registry.connect(operationalAuth).updateOperationalAuthority(stranger.address)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("reverts when called by an unrelated address", async function () {
      await expect(
        registry.connect(stranger).updateOperationalAuthority(donor1.address)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("reverts when newAuthority is the zero address", async function () {
      await expect(
        registry.connect(crisisMS).updateOperationalAuthority(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateVerificationMultisig
  // ═══════════════════════════════════════════════════════════════════════════

  describe("updateVerificationMultisig", function () {
    it("updates the Tier-2 multisig when called by Tier-3 and emits event", async function () {
      await expect(
        registry.connect(crisisMS).updateVerificationMultisig(stranger.address)
      )
        .to.emit(registry, "VerificationMultisigUpdated")
        .withArgs(verificationMS.address, stranger.address);

      expect(await registry.verificationMultisig()).to.equal(stranger.address);
    });

    it("grants VERIFICATION_ROLE to the new multisig", async function () {
      await registry.connect(crisisMS).updateVerificationMultisig(stranger.address);
      expect(await registry.hasRole(VERIFICATION_ROLE, stranger.address)).to.be.true;
    });

    it("revokes VERIFICATION_ROLE from the old multisig", async function () {
      await registry.connect(crisisMS).updateVerificationMultisig(stranger.address);
      expect(await registry.hasRole(VERIFICATION_ROLE, verificationMS.address)).to.be.false;
    });

    it("old multisig can no longer verify NGOs after being replaced", async function () {
      await registry.connect(ngo1).registerNGO(ngo1.address);
      await registry.connect(crisisMS).updateVerificationMultisig(stranger.address);

      // Old multisig tries to verify — should now be rejected
      await expect(
        registry.connect(verificationMS).verifyNGO(ngo1.address, EMPTY_PROOF)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("new multisig can verify NGOs after the update", async function () {
      await registry.connect(ngo1).registerNGO(ngo1.address);
      await registry.connect(crisisMS).updateVerificationMultisig(stranger.address);

      await expect(
        registry.connect(stranger).verifyNGO(ngo1.address, EMPTY_PROOF)
      ).to.emit(registry, "NGOVerified").withArgs(ngo1.address);
    });

    it("reverts when called by the Tier-2 multisig (cannot self-elevate)", async function () {
      await expect(
        registry.connect(verificationMS).updateVerificationMultisig(stranger.address)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("reverts when newMultisig is the zero address", async function () {
      await expect(
        registry.connect(crisisMS).updateVerificationMultisig(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateCrisisDeclarationMultisig (self-update)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("updateCrisisDeclarationMultisig", function () {
    it("replaces itself when Tier-3 calls and emits event", async function () {
      await expect(
        registry.connect(crisisMS).updateCrisisDeclarationMultisig(stranger.address)
      )
        .to.emit(registry, "CrisisDeclarationMultisigUpdated")
        .withArgs(crisisMS.address, stranger.address);

      expect(await registry.crisisDeclarationMultisig()).to.equal(stranger.address);
    });

    it("grants CRISIS_DECLARATION_ROLE to the new multisig", async function () {
      await registry.connect(crisisMS).updateCrisisDeclarationMultisig(stranger.address);
      expect(await registry.hasRole(CRISIS_DECLARATION_ROLE, stranger.address)).to.be.true;
    });

    it("revokes CRISIS_DECLARATION_ROLE from the old multisig after self-update", async function () {
      await registry.connect(crisisMS).updateCrisisDeclarationMultisig(stranger.address);
      expect(await registry.hasRole(CRISIS_DECLARATION_ROLE, crisisMS.address)).to.be.false;
    });

    it("old Tier-3 multisig cannot make further authority changes after self-update", async function () {
      await registry.connect(crisisMS).updateCrisisDeclarationMultisig(stranger.address);

      // The old Tier-3 address is now powerless
      await expect(
        registry.connect(crisisMS).updateOperationalAuthority(donor1.address)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("new Tier-3 multisig can make authority changes after self-update", async function () {
      await registry.connect(crisisMS).updateCrisisDeclarationMultisig(stranger.address);

      await expect(
        registry.connect(stranger).updateOperationalAuthority(ngo1.address)
      ).to.emit(registry, "OperationalAuthorityUpdated");
    });

    it("reverts when called by a non-Tier-3 address", async function () {
      await expect(
        registry.connect(verificationMS).updateCrisisDeclarationMultisig(stranger.address)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("reverts when newMultisig is the zero address", async function () {
      await expect(
        registry.connect(crisisMS).updateCrisisDeclarationMultisig(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // End-to-end: full registration → verification → validator check flow
  // ═══════════════════════════════════════════════════════════════════════════

  describe("End-to-end flows", function () {
    it("full NGO lifecycle: register → unverified → verified → valid validator", async function () {
      // Step 1: NGO self-registers
      await registry.connect(ngo1).registerNGO(ngo1.address);

      // Step 2: Before verification, isVerifiedValidator must be false
      expect(await registry.isVerifiedValidator(ngo1.address)).to.be.false;

      // Step 3: Tier-2 multisig completes WANGO off-chain, confirms on-chain
      await registry.connect(verificationMS).verifyNGO(ngo1.address, EMPTY_PROOF);

      // Step 4: Now the NGO is a valid validator
      expect(await registry.isVerifiedValidator(ngo1.address)).to.be.true;
    });

    it("full beneficiary lifecycle: register → verify for crisis 1 → correct scoping", async function () {
      await registry.registerParticipant(beneficiary1.address, Role.Beneficiary);

      // Not verified for any crisis yet
      expect(
        await registry.isCrisisVerifiedBeneficiary(beneficiary1.address, 1n)
      ).to.be.false;

      // Tier-2 verifies for crisis 1
      await registry.connect(verificationMS).verifyBeneficiary(
        beneficiary1.address, 1n, EMPTY_PROOF
      );

      expect(await registry.isCrisisVerifiedBeneficiary(beneficiary1.address, 1n)).to.be.true;
      // Crisis 2 is unaffected
      expect(await registry.isCrisisVerifiedBeneficiary(beneficiary1.address, 2n)).to.be.false;
    });

    it("multiple GOs can be registered at deployment — all are valid validators", async function () {
      await registry.connect(deployer).registerGO(go1.address);
      await registry.connect(deployer).registerGO(ngo1.address); // reusing signer as a second GO

      expect(await registry.isVerifiedValidator(go1.address)).to.be.true;
      expect(await registry.isVerifiedValidator(ngo1.address)).to.be.true;
    });
  });
});
