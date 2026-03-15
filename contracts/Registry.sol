// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IRegistry.sol";

/// @title Registry — Identity and verification layer for OpenAID +212
/// @author OpenAID +212 Project
/// @notice The Registry is the base layer of the OpenAID system. Every other contract
///         reads from it to determine who an address is and what it is allowed to do.
///         It has no dependencies on other OpenAID contracts — it is deployed first.
///
/// @dev Authority is split across three tiers to avoid a single-point-of-trust
///      contradiction in a zero-trust system:
///
///      Tier 1 — OPERATIONAL_ROLE (single signer):
///        Low-risk procedural actions: startVoting, closeCrisis (in Governance).
///        Stored here for reference; enforced in Governance.
///
///      Tier 2 — VERIFICATION_ROLE (2-of-3 multisig):
///        Power-granting actions: verifyNGO, verifyBeneficiary.
///        Multisig composition: 1 GO + 1 NGO + 1 Community representative.
///
///      Tier 3 — CRISIS_DECLARATION_ROLE (4-of-7 multisig):
///        System-critical actions: declareCrisis, authority updates.
///        Multisig composition: 2 GO + 2 NGO + 3 Community representatives.
///
///      The Registry stores the multisig CONTRACT addresses; signer management
///      happens inside those multisig contracts (e.g. Gnosis Safe). Tier thresholds
///      are enforced there, not here.
contract Registry is AccessControl, IRegistry {
    // ─────────────────────────────────────────────────────────────────────────
    // Role constants
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Tier-1: Operational authority for low-risk procedural triggers.
    bytes32 public constant OPERATIONAL_ROLE = keccak256("OPERATIONAL_ROLE");

    /// @notice Tier-2: Verification multisig (2-of-3) for identity verification actions.
    bytes32 public constant VERIFICATION_ROLE = keccak256("VERIFICATION_ROLE");

    /// @notice Tier-3: Crisis declaration multisig (4-of-7) for system-critical actions.
    bytes32 public constant CRISIS_DECLARATION_ROLE = keccak256("CRISIS_DECLARATION_ROLE");

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Canonical identity records, keyed by address.
    mapping(address => Participant) private _registry;

    /// @notice Per-crisis beneficiary verification.
    ///         crisisVerification[beneficiary][crisisId] = true means voting rights granted.
    mapping(address => mapping(uint256 => bool)) public crisisVerification;

    /// @notice Tier-1 authority address (single signer for procedural actions).
    address public operationalAuthority;

    /// @notice Tier-2 authority address (2-of-3 multisig for verification actions).
    address public verificationMultisig;

    /// @notice Tier-3 authority address (4-of-7 multisig for crisis and authority changes).
    address public crisisDeclarationMultisig;

    // ─────────────────────────────────────────────────────────────────────────
    // Custom errors
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Emitted when trying to register an already-registered address.
    error AlreadyRegistered(address addr);

    /// @notice Emitted when an operation targets an address that is not registered.
    error NotRegistered(address addr);

    /// @notice Emitted when registerParticipant is called with a role that requires
    ///         a dedicated registration path (GO or NGO).
    error InvalidRoleForOpenRegistration(uint8 role);

    /// @notice Emitted when verifyNGO is called on an address that is not an NGO.
    error NotAnNGO(address addr);

    /// @notice Emitted when verifyBeneficiary is called on an address that is not a Beneficiary.
    error NotABeneficiary(address addr);

    /// @notice Emitted when an address is already verified and a second verification is attempted.
    error AlreadyVerified(address addr);

    /// @notice Emitted when a zero address is supplied where a non-zero address is required.
    error ZeroAddress();

    /// @notice Emitted when registerNGO is called by an address other than the addr being registered.
    error SelfRegistrationRequired(address caller, address addr);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Deploy the Registry and establish the three-tier authority model.
    /// @dev    The deployer retains DEFAULT_ADMIN_ROLE, which is used exclusively to
    ///         register GOs during the initial setup phase. After all GOs are registered,
    ///         the deployer should renounce DEFAULT_ADMIN_ROLE to remove the backdoor.
    /// @param _operationalAuthority       Tier-1 single signer address.
    /// @param _verificationMultisig       Tier-2 2-of-3 multisig contract address.
    /// @param _crisisDeclarationMultisig  Tier-3 4-of-7 multisig contract address.
    constructor(
        address _operationalAuthority,
        address _verificationMultisig,
        address _crisisDeclarationMultisig
    ) {
        if (_operationalAuthority == address(0)) revert ZeroAddress();
        if (_verificationMultisig == address(0)) revert ZeroAddress();
        if (_crisisDeclarationMultisig == address(0)) revert ZeroAddress();

        operationalAuthority       = _operationalAuthority;
        verificationMultisig       = _verificationMultisig;
        crisisDeclarationMultisig  = _crisisDeclarationMultisig;

        // DEFAULT_ADMIN_ROLE → deployer (registerGO, plus OZ admin utilities)
        _grantRole(DEFAULT_ADMIN_ROLE,        msg.sender);
        _grantRole(OPERATIONAL_ROLE,          _operationalAuthority);
        _grantRole(VERIFICATION_ROLE,         _verificationMultisig);
        _grantRole(CRISIS_DECLARATION_ROLE,   _crisisDeclarationMultisig);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Registration — open paths
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IRegistry
    /// @dev Only Donor (2), Beneficiary (3), and PrivateCompany (4) may use this path.
    ///      GOs use registerGO(); NGOs use registerNGO().
    ///      `addr` need not equal msg.sender, allowing assisted registration for beneficiaries
    ///      by trusted operators on the application layer.
    function registerParticipant(address addr, Role role) external override {
        if (_registry[addr].exists) revert AlreadyRegistered(addr);
        if (role == Role.GO || role == Role.NGO) {
            revert InvalidRoleForOpenRegistration(uint8(role));
        }

        _registry[addr] = Participant({
            addr:         addr,
            role:         role,
            exists:       true,
            isVerified:   false,
            registeredAt: block.timestamp
        });

        emit ParticipantRegistered(addr, role);
    }

    /// @inheritdoc IRegistry
    /// @dev The NGO must register itself (addr == msg.sender). This prevents third parties
    ///      from claiming an address as an NGO without consent, which would block that
    ///      address from self-registering with a different role later.
    function registerNGO(address addr) external override {
        if (addr != msg.sender) revert SelfRegistrationRequired(msg.sender, addr);
        if (_registry[addr].exists) revert AlreadyRegistered(addr);

        _registry[addr] = Participant({
            addr:         addr,
            role:         Role.NGO,
            exists:       true,
            isVerified:   false,
            registeredAt: block.timestamp
        });

        emit NGORegistered(addr);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Registration — deployer-only path
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IRegistry
    /// @dev GOs are pre-verified and immediately receive isVerified = true.
    ///      Caller must hold DEFAULT_ADMIN_ROLE (the deployer).
    ///      Adding GOs post-deployment requires a governance proposal to grant
    ///      DEFAULT_ADMIN_ROLE, preventing validator-set capture via proxy GO registration.
    function registerGO(address addr) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        if (addr == address(0)) revert ZeroAddress();
        if (_registry[addr].exists) revert AlreadyRegistered(addr);

        _registry[addr] = Participant({
            addr:         addr,
            role:         Role.GO,
            exists:       true,
            isVerified:   true,
            registeredAt: block.timestamp
        });

        emit GORegistered(addr);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Verification — Tier-2 multisig actions
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IRegistry
    /// @dev `proof` contains the off-chain WANGO verification evidence. The Tier-2 multisig
    ///      is responsible for validating it before calling this function. On-chain we trust
    ///      that the multisig threshold has been met (enforced by the Gnosis Safe contract).
    ///      The proof is not stored to keep gas costs low; the transaction calldata provides
    ///      a permanent on-chain audit trail.
    function verifyNGO(address ngo, bytes calldata /* proof */) external override onlyRole(VERIFICATION_ROLE) {

        Participant storage p = _registry[ngo];
        if (!p.exists) revert NotRegistered(ngo);
        if (p.role != Role.NGO) revert NotAnNGO(ngo);
        if (p.isVerified) revert AlreadyVerified(ngo);

        p.isVerified = true;

        emit NGOVerified(ngo);
    }

    /// @inheritdoc IRegistry
    /// @dev Per-crisis scope: a beneficiary verified for crisis A cannot vote in crisis B.
    ///      This prevents the formation of permanent voting blocs mobilised across crises.
    ///      Proof is kept in calldata for auditability; not stored on-chain.
    function verifyBeneficiary(
        address beneficiary,
        uint256 crisisId,
        bytes calldata /* proof */
    ) external override onlyRole(VERIFICATION_ROLE) {

        Participant storage p = _registry[beneficiary];
        if (!p.exists) revert NotRegistered(beneficiary);
        if (p.role != Role.Beneficiary) revert NotABeneficiary(beneficiary);

        crisisVerification[beneficiary][crisisId] = true;

        emit BeneficiaryVerified(beneficiary, crisisId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View functions
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IRegistry
    function getParticipant(address addr) external view override returns (Participant memory) {
        return _registry[addr];
    }

    /// @inheritdoc IRegistry
    /// @dev Hot path — called frequently by ReputationEngine and Besu permissioning.
    ///      Pure mapping lookup + two boolean checks. O(1).
    function isVerifiedValidator(address addr) external view override returns (bool) {
        Participant storage p = _registry[addr];
        return p.isVerified && (p.role == Role.GO || p.role == Role.NGO);
    }

    /// @inheritdoc IRegistry
    function isCrisisVerifiedBeneficiary(
        address addr,
        uint256 crisisId
    ) external view override returns (bool) {
        return crisisVerification[addr][crisisId];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Authority management — Tier-3 multisig actions
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IRegistry
    /// @dev Revokes OPERATIONAL_ROLE from the old address and grants it to the new one.
    ///      Updating an authority address is a critical governance action — emitting an
    ///      event ensures any change is visible to every chain observer.
    function updateOperationalAuthority(address newAuthority)
        external
        override
        onlyRole(CRISIS_DECLARATION_ROLE)
    {
        if (newAuthority == address(0)) revert ZeroAddress();

        address old = operationalAuthority;
        _revokeRole(OPERATIONAL_ROLE, old);
        _grantRole(OPERATIONAL_ROLE, newAuthority);
        operationalAuthority = newAuthority;

        emit OperationalAuthorityUpdated(old, newAuthority);
    }

    /// @inheritdoc IRegistry
    /// @dev Revokes VERIFICATION_ROLE from the old multisig and grants it to the new one.
    ///      Used when Tier-2 signers rotate or the multisig contract is upgraded.
    function updateVerificationMultisig(address newMultisig)
        external
        override
        onlyRole(CRISIS_DECLARATION_ROLE)
    {
        if (newMultisig == address(0)) revert ZeroAddress();

        address old = verificationMultisig;
        _revokeRole(VERIFICATION_ROLE, old);
        _grantRole(VERIFICATION_ROLE, newMultisig);
        verificationMultisig = newMultisig;

        emit VerificationMultisigUpdated(old, newMultisig);
    }

    /// @inheritdoc IRegistry
    /// @dev The current Tier-3 multisig authorises its own replacement. After this call
    ///      the old address holds no CRISIS_DECLARATION_ROLE and cannot reverse the change.
    ///      This is the most sensitive operation in the system — the 4-of-7 threshold must
    ///      be met inside the Gnosis Safe before this function is invoked.
    function updateCrisisDeclarationMultisig(address newMultisig)
        external
        override
        onlyRole(CRISIS_DECLARATION_ROLE)
    {
        if (newMultisig == address(0)) revert ZeroAddress();

        address old = crisisDeclarationMultisig;
        _revokeRole(CRISIS_DECLARATION_ROLE, old);
        _grantRole(CRISIS_DECLARATION_ROLE, newMultisig);
        crisisDeclarationMultisig = newMultisig;

        emit CrisisDeclarationMultisigUpdated(old, newMultisig);
    }
}
