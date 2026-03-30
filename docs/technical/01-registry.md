# Registry — Identity and Verification Layer

## Purpose

The Registry (`contracts/Registry.sol`) is the base layer of OpenAID +212. It is the single source of truth for:

- **Who** an address represents (role assignment)
- **Whether** they are verified (identity confirmation)
- **Who** holds authority to perform privileged actions (three-tier authority addresses)

Every other contract in the system reads from the Registry to make authorization decisions. The Registry has no dependencies on other OpenAID contracts — it is always deployed first.

## Contract Inheritance

```
Registry is AccessControl, IRegistry
```

- **AccessControl** (OpenZeppelin v5): Role-based permission management via `bytes32` role identifiers
- **IRegistry**: Interface defining the public API, events, and the `Participant` struct + `Role` enum

## Role Enum

Defined in `IRegistry`:

```solidity
enum Role { GO, NGO, Donor, Beneficiary, PrivateCompany }
// Values: GO=0, NGO=1, Donor=2, Beneficiary=3, PrivateCompany=4
```

| Role | Description | Registration Path | Verification Required |
|------|-------------|-------------------|-----------------------|
| **GO** (0) | Government Organisation | `registerGO()` — admin only | Pre-verified at registration |
| **NGO** (1) | Non-Governmental Organisation | `registerNGO()` — self-registration | Yes — Tier-2 via `verifyNGO()` |
| **Donor** (2) | Individual or institutional donor | `registerParticipant()` — open | No |
| **Beneficiary** (3) | Aid recipient | `registerParticipant()` — open | Per-crisis via `verifyBeneficiary()` |
| **PrivateCompany** (4) | Corporate participant | `registerParticipant()` — open | No |

## Participant Record

```solidity
struct Participant {
    address addr;           // The participant's address
    Role    role;           // One of the 5 roles
    bool    exists;         // True if registered (existence sentinel)
    bool    isVerified;     // True if identity is confirmed
    uint256 registeredAt;   // Block timestamp of registration
}
```

Stored in `mapping(address => Participant) private _registry`.

## Registration Paths

### Open Registration: `registerParticipant(address addr, Role role)`

- Available for: **Donor**, **Beneficiary**, **PrivateCompany**
- Caller: Anyone (including operators performing assisted registration for beneficiaries)
- `addr` need not equal `msg.sender` — this allows field operators to register beneficiaries on their behalf
- Reverts with `InvalidRoleForOpenRegistration` if role is GO or NGO
- Reverts with `AlreadyRegistered` if address is already in the registry
- Sets `isVerified = false`

### NGO Self-Registration: `registerNGO(address addr)`

- Available for: **NGO** only
- Caller: Must be `msg.sender == addr` (enforced by `SelfRegistrationRequired` error)
- This constraint prevents third parties from claiming an address as an NGO without consent, which would block that address from self-registering with a different role
- Sets `isVerified = false` — verification requires a separate Tier-2 action

### Admin-Only Registration: `registerGO(address addr)`

- Available for: **GO** only
- Caller: Must hold `DEFAULT_ADMIN_ROLE` (the deployer)
- GOs are **pre-verified**: `isVerified = true` at registration
- This reflects the real-world trust model: government organisations are known entities whose identity is established before the system is deployed
- Adding GOs post-deployment requires a governance proposal to grant `DEFAULT_ADMIN_ROLE`, preventing validator-set capture via proxy GO registration

### Registration Flow Diagram

```mermaid
flowchart TD
    START([New participant]) --> ROLE{Role?}

    ROLE -->|Donor / Beneficiary / Company| OPEN["registerParticipant(addr, role)<br/><i>Anyone can call</i>"]
    ROLE -->|NGO| SELF["registerNGO(addr)<br/><i>addr == msg.sender</i>"]
    ROLE -->|GO| ADMIN["registerGO(addr)<br/><i>DEFAULT_ADMIN_ROLE only</i>"]

    OPEN --> UNREG["Registered, unverified"]
    SELF --> UNREG
    ADMIN --> VERIFIED["Registered + verified"]

    UNREG -->|NGO path| VERIFY_NGO["verifyNGO(ngo, proof)<br/><i>Tier-2 multisig</i>"]
    UNREG -->|Beneficiary path| VERIFY_BEN["verifyBeneficiary(ben, crisisId, proof)<br/><i>Tier-2 multisig, per-crisis</i>"]
    UNREG -->|Donor/Company| DONE["No verification needed"]

    VERIFY_NGO --> VERIFIED
    VERIFY_BEN --> CRISIS_VERIFIED["Crisis-verified<br/><i>crisisVerification[ben][crisisId] = true</i>"]

    style VERIFIED fill:#c8e6c9,stroke:#1b5e20
    style CRISIS_VERIFIED fill:#c8e6c9,stroke:#1b5e20
    style UNREG fill:#fff9c4,stroke:#f57f17
```

## Verification Flows

### NGO Verification: `verifyNGO(address ngo, bytes calldata proof)`

- **Caller**: Tier-2 Verification Multisig (`VERIFICATION_ROLE`)
- **Preconditions**: Address must be registered, must be Role.NGO, must not already be verified
- **Effect**: Sets `isVerified = true` on the Participant record
- **Proof parameter**: Contains off-chain WANGO verification evidence (e.g., registration certificate hash). The proof is kept in calldata for permanent on-chain auditability but is **not stored** in contract state. The Tier-2 multisig signers are responsible for validating the proof before signing the transaction.
- **Events**: `NGOVerified(ngo)`

### Beneficiary Verification: `verifyBeneficiary(address beneficiary, uint256 crisisId, bytes calldata proof)`

- **Caller**: Tier-2 Verification Multisig (`VERIFICATION_ROLE`)
- **Preconditions**: Address must be registered, must be Role.Beneficiary
- **Effect**: Sets `crisisVerification[beneficiary][crisisId] = true`
- **Scope**: Per-crisis — a beneficiary verified for crisis 1 cannot vote in crisis 2. This prevents the formation of permanent voting blocs mobilised across crises.
- **Events**: `BeneficiaryVerified(beneficiary, crisisId)`

```mermaid
sequenceDiagram
    participant NGO as NGO Address
    participant T2 as Tier-2 Multisig
    participant REG as Registry

    Note over NGO,REG: NGO Verification Flow
    NGO->>REG: registerNGO(self)
    REG-->>NGO: NGORegistered event
    Note over T2: Signers validate WANGO proof off-chain
    T2->>REG: verifyNGO(ngo, proof)
    REG-->>T2: NGOVerified event
    Note over REG: isVerified = true

    Note over NGO,REG: Beneficiary Verification Flow
    Note over T2: Signers validate identity proof off-chain
    T2->>REG: verifyBeneficiary(ben, crisisId, proof)
    REG-->>T2: BeneficiaryVerified event
    Note over REG: crisisVerification[ben][crisisId] = true
```

## Authority Management

All authority updates are gated by `CRISIS_DECLARATION_ROLE` (Tier 3). Each function atomically revokes the old address's role and grants it to the new address.

| Function | Updates | AccessControl Role |
|----------|---------|-------------------|
| `updateOperationalAuthority(newAuthority)` | `operationalAuthority` | `OPERATIONAL_ROLE` |
| `updateVerificationMultisig(newMultisig)` | `verificationMultisig` | `VERIFICATION_ROLE` |
| `updateCrisisDeclarationMultisig(newMultisig)` | `crisisDeclarationMultisig` | `CRISIS_DECLARATION_ROLE` |

The most sensitive operation is `updateCrisisDeclarationMultisig`: the current Tier-3 multisig authorizes its own replacement. After the call, the old address holds no `CRISIS_DECLARATION_ROLE` and cannot reverse the change.

## View Functions

| Function | Returns | Used By |
|----------|---------|---------|
| `getParticipant(addr)` | Full `Participant` struct | All contracts — role checks, existence checks |
| `isVerifiedValidator(addr)` | `bool` — true if `isVerified && (role == GO \|\| role == NGO)` | ReputationEngine — validator initialization gate |
| `isCrisisVerifiedBeneficiary(addr, crisisId)` | `bool` — reads `crisisVerification` mapping | DonationManager, Governance — distribution and voting eligibility |
| `operationalAuthority()` | `address` | Governance, ReputationEngine — Tier-1 caller check |
| `verificationMultisig()` | `address` | (exposed for transparency) |
| `crisisDeclarationMultisig()` | `address` | Governance, ReputationEngine — Tier-3 caller check |

## Access Control Matrix

| Function | DEFAULT_ADMIN | OPERATIONAL (T1) | VERIFICATION (T2) | CRISIS_DECL (T3) | Anyone |
|----------|:---:|:---:|:---:|:---:|:---:|
| `registerGO()` | x | | | | |
| `registerNGO()` | | | | | x (self only) |
| `registerParticipant()` | | | | | x |
| `verifyNGO()` | | | x | | |
| `verifyBeneficiary()` | | | x | | |
| `updateOperationalAuthority()` | | | | x | |
| `updateVerificationMultisig()` | | | | x | |
| `updateCrisisDeclarationMultisig()` | | | | x | |
| `getParticipant()` | | | | | x |
| `isVerifiedValidator()` | | | | | x |
| `isCrisisVerifiedBeneficiary()` | | | | | x |

## AccessControl Role Constants

```solidity
bytes32 public constant OPERATIONAL_ROLE          = keccak256("OPERATIONAL_ROLE");
bytes32 public constant VERIFICATION_ROLE         = keccak256("VERIFICATION_ROLE");
bytes32 public constant CRISIS_DECLARATION_ROLE   = keccak256("CRISIS_DECLARATION_ROLE");
```

`DEFAULT_ADMIN_ROLE` is the OpenZeppelin zero-value role (`0x00`), granted to the deployer in the constructor. After all GOs are registered, the deployer should renounce this role to eliminate the backdoor.

## Custom Errors

| Error | Trigger |
|-------|---------|
| `AlreadyRegistered(addr)` | Address already has a Participant record |
| `NotRegistered(addr)` | Operation on an unregistered address |
| `InvalidRoleForOpenRegistration(role)` | `registerParticipant()` called with GO or NGO |
| `NotAnNGO(addr)` | `verifyNGO()` called on a non-NGO address |
| `NotABeneficiary(addr)` | `verifyBeneficiary()` called on a non-Beneficiary |
| `AlreadyVerified(addr)` | NGO already verified |
| `ZeroAddress()` | Zero address supplied to constructor or authority update |
| `SelfRegistrationRequired(caller, addr)` | `registerNGO()` where `addr != msg.sender` |
