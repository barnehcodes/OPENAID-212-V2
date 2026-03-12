// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IRegistry — External interface for the OpenAID +212 Registry contract
/// @notice Defines the identity layer consumed by every other contract in the system.
///         Other contracts import this interface to read participant roles and verification
///         status without coupling to Registry's internal implementation.
interface IRegistry {
    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Enumeration of all participant roles in the OpenAID system.
    /// @dev Order matters — do not change without updating all consumers.
    enum Role {
        GO,             // 0 — Government Organisation (Ministries, Civil Protection, etc.)
        NGO,            // 1 — Non-Governmental Organisation (requires WANGO verification)
        Donor,          // 2 — Individual or entity donating funds (open registration)
        Beneficiary,    // 3 — Crisis-affected person eligible to vote (open registration)
        PrivateCompany  // 4 — Corporate donor / logistics partner (open registration)
    }

    /// @notice On-chain identity record for every registered address.
    struct Participant {
        address addr;        // The Ethereum address
        Role    role;        // Role assigned at registration
        bool    exists;      // True once registered; prevents re-registration
        bool    isVerified;  // GOs: always true. NGOs: set by Tier-2 multisig.
                             // Beneficiaries: reflects global state; use crisisVerification for per-crisis eligibility.
        uint256 registeredAt; // Block timestamp of initial registration
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event ParticipantRegistered(address indexed addr, Role role);
    event GORegistered(address indexed addr);
    event NGORegistered(address indexed addr);
    event NGOVerified(address indexed addr);
    event BeneficiaryVerified(address indexed beneficiary, uint256 indexed crisisId);
    event OperationalAuthorityUpdated(address indexed oldAuthority, address indexed newAuthority);
    event VerificationMultisigUpdated(address indexed oldMultisig, address indexed newMultisig);
    event CrisisDeclarationMultisigUpdated(address indexed oldMultisig, address indexed newMultisig);

    // ─────────────────────────────────────────────────────────────────────────
    // Registration — open paths
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Self-register as a Donor, Beneficiary, or PrivateCompany.
    /// @param addr  The address to register (may differ from msg.sender for proxied setups).
    /// @param role  Must be Donor, Beneficiary, or PrivateCompany.
    function registerParticipant(address addr, Role role) external;

    /// @notice Register an NGO address. Sets isVerified = false; Tier-2 verification follows.
    /// @dev    Must be called by the NGO address itself (addr == msg.sender).
    /// @param addr  The NGO's Ethereum address.
    function registerNGO(address addr) external;

    // ─────────────────────────────────────────────────────────────────────────
    // Registration — privileged paths
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Register a government organisation. Sets isVerified = true immediately.
    /// @dev    Callable only by the contract deployer (DEFAULT_ADMIN_ROLE).
    ///         GOs are pre-defined; adding them post-deployment requires a governance proposal.
    /// @param addr  The GO's Ethereum address.
    function registerGO(address addr) external;

    // ─────────────────────────────────────────────────────────────────────────
    // Verification — Tier-2 multisig actions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Confirm WANGO verification for a registered NGO.
    /// @dev    Caller must be the Tier-2 (2-of-3) Verification Multisig.
    ///         The off-chain WANGO check is already complete; `proof` is stored for auditability.
    /// @param ngo    NGO address to verify.
    /// @param proof  Off-chain verification evidence (signature, document hash, etc.).
    function verifyNGO(address ngo, bytes calldata proof) external;

    /// @notice Mark a beneficiary as verified for a specific crisis, granting voting rights.
    /// @dev    Caller must be the Tier-2 (2-of-3) Verification Multisig.
    ///         Per-crisis scope prevents permanent voting blocs.
    /// @param beneficiary  Beneficiary address to verify.
    /// @param crisisId     The crisis for which voting rights are granted.
    /// @param proof        Off-chain evidence (government DB record, NGO field report hash, etc.).
    function verifyBeneficiary(address beneficiary, uint256 crisisId, bytes calldata proof) external;

    // ─────────────────────────────────────────────────────────────────────────
    // View functions — consumed by all other contracts
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Return the full identity record for an address.
    function getParticipant(address addr) external view returns (Participant memory);

    /// @notice Check whether an address is eligible to be a validator (verified GO or NGO).
    /// @return True if addr is a verified GO or a verified NGO.
    function isVerifiedValidator(address addr) external view returns (bool);

    /// @notice Check whether a beneficiary is verified for a specific crisis.
    /// @return True only for the exact (beneficiary, crisisId) pair that was verified.
    function isCrisisVerifiedBeneficiary(address addr, uint256 crisisId) external view returns (bool);

    /// @notice Return the current Tier-1 Operational Authority address.
    function operationalAuthority() external view returns (address);

    /// @notice Return the current Tier-2 Verification Multisig address.
    function verificationMultisig() external view returns (address);

    /// @notice Return the current Tier-3 Crisis Declaration Multisig address.
    function crisisDeclarationMultisig() external view returns (address);

    // ─────────────────────────────────────────────────────────────────────────
    // Authority management — Tier-3 multisig actions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Replace the Tier-1 Operational Authority address.
    /// @dev    Requires Tier-3 (4-of-7) Crisis Declaration Multisig approval.
    function updateOperationalAuthority(address newAuthority) external;

    /// @notice Replace the Tier-2 Verification Multisig contract address.
    /// @dev    Requires Tier-3 (4-of-7) Crisis Declaration Multisig approval.
    function updateVerificationMultisig(address newMultisig) external;

    /// @notice Replace the Tier-3 Crisis Declaration Multisig contract address (self-update).
    /// @dev    Requires the current Tier-3 multisig to approve its own replacement.
    ///         The old address immediately loses all Tier-3 authority.
    function updateCrisisDeclarationMultisig(address newMultisig) external;
}
