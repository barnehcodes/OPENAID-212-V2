# Contract 1: Registry

## Purpose

The Registry is the **identity layer** of OpenAID +212. Every other contract in the system reads from it to answer one question: *"Who is this address, and what are they allowed to do?"*

Without the Registry, no donations can be made, no votes can be cast, no reputation can be tracked. It is deployed first and referenced by every other contract.

---

## Why This Contract Exists

OpenAID +212 operates under a **zero-trust actor model** — every participant (GO, NGO, Donor, Beneficiary, Private Company) is assumed to be potentially malicious until proven otherwise. The Registry enforces:

1. **Identity separation** — Different roles have different permissions. A Donor cannot run for coordinator. A Beneficiary cannot verify an NGO. The Registry is the single source of truth for "who can do what."
2. **Gated entry** — Not everyone can join with any role. GOs are pre-registered (they represent known government bodies). NGOs must be verified off-chain via WANGO and then confirmed on-chain. Donors and Beneficiaries self-register but with constraints.
3. **On-chain identity for off-chain trust** — The Registry bridges the gap between real-world identity (a government ministry, a verified NGO) and on-chain addresses. This is what makes PoA meaningful — authority is tied to verified identity, not anonymous capital.

---

## Roles and Their Properties

| Role | Who | How They Register | Starting Reputation | Can Be Validator? |
|------|-----|-------------------|--------------------|--------------------|
| **GO** (Government Org) | Ministries, civil protection, etc. | Pre-registered by contract deployer | 100 | Yes (required) |
| **NGO** | Verified non-governmental orgs | Self-register → off-chain WANGO verification → on-chain confirmation by Verification Multisig (Tier 2) | 100 | Yes (after verification) |
| **Donor** | Any individual or entity donating funds | Self-register (open) | 0 | No |
| **Beneficiary** | People affected by a crisis | Self-register (open) | 0 | No |
| **Private Company** | Corporate donors / logistics partners | Self-register (open) | 0 | No |

---

## Data Structures

### Participant Record

Each registered address maps to a `Participant` struct:

```
Participant {
    address     addr            // The Ethereum address
    Role        role            // Enum: GO, NGO, Donor, Beneficiary, PrivateCompany
    bool        exists          // Whether this address is registered
    bool        isVerified      // For NGOs: has WANGO verification been confirmed on-chain?
                                // For Beneficiaries: are they verified for any crisis?
    uint256     registeredAt    // Block timestamp of registration
}
```

### Crisis-Specific Beneficiary Verification

Beneficiaries aren't globally verified — they are verified **per crisis**. A person affected by an earthquake in Al Haouz is not automatically eligible to vote in a flood response in Tangier.

```
mapping(address => mapping(uint256 => bool)) crisisVerification
// crisisVerification[beneficiaryAddress][crisisId] = true/false
```

### Social Layer Authority — Tiered Model

A zero-trust system cannot funnel all authority through a single address. OpenAID +212 splits the Social Layer Authority into **three tiers** based on the risk level of each action, with each tier requiring a different level of collective agreement.

```
address operationalAuthority              // Tier 1: single signer for procedural actions
address verificationMultisig              // Tier 2: 2-of-3 multisig for identity verification
address crisisDeclarationMultisig         // Tier 3: 4-of-7 multisig for crisis declaration
```

#### Tier 1 — Operational (Single Signer)

Low-risk procedural actions where the outcome is already determined by other mechanisms. A single trusted operator can trigger these without creating a centralization risk.

Actions: `startVoting()`, `closeCrisis()` (no misconduct case)

Why single signer is acceptable: Starting a voting phase doesn't grant power to anyone — candidates are already registered, voters already eligible. The operator is just pressing "go." Similarly, closing a clean crisis is procedural — the coordinator already delivered, no misconduct was flagged.

#### Tier 2 — Verification (2-of-3 Multisig)

Medium-risk actions that grant real power: validator eligibility (NGO verification) and voting rights (beneficiary verification). These require independent agreement from multiple actor classes.

Actions: `verifyNGO()`, `verifyBeneficiary()`

Multisig composition (2-of-3):
- 1 GO representative (government perspective)
- 1 NGO representative (civil society perspective)
- 1 Community representative (independent oversight)

Any 2 of these 3 must agree that the verification is legitimate. This means:
- A GO alone cannot rubber-stamp a friendly NGO
- An NGO alone cannot self-verify through a sympathetic community member
- Collusion requires corrupting at least 2 of 3 independent actor classes

#### Tier 3 — Crisis Declaration (4-of-7 Multisig)

High-risk actions that trigger the entire governance cycle and determine how much money flows. These require broad consensus.

Actions: `declareCrisis()`, `initiateMisconductVote()`

Multisig composition (4-of-7):
- 2 GO representatives
- 2 NGO representatives
- 3 Community representatives

Why 4-of-7: This threshold means no single actor class can declare a crisis alone. GOs (2 signers) need at least 2 others. NGOs (2 signers) need at least 2 others. Even the Community bloc (3 signers) needs at least 1 GO or NGO to agree. This mirrors the tripartite EGT model — the three strategic actors must cooperate to trigger high-stakes actions.

Why misconduct votes are Tier 3: Initiating a misconduct vote is a serious accusation that can slash a coordinator's reputation. It should require the same level of consensus as declaring a crisis — preventing weaponized misconduct votes against legitimate coordinators.

> **Implementation Note:** The multisig contracts can be implemented using Gnosis Safe (battle-tested, audited) or a lightweight custom multisig. The Registry stores the multisig contract addresses, not individual signer addresses. Signer management happens within the multisig contracts themselves.

> **EGT Connection:** This tiered model directly maps to the thesis's game theory framework. The EGT analysis models three independent actors (GO, NGO, Community). The tiered multisig requires collective action from these same three actor classes for critical decisions — meaning the implementation's trust assumptions align with the game theory's actor independence assumptions. This resolves the contradiction where a "zero-trust" system had a single trusted authority.

---

## Functions

### 1. `registerParticipant(address addr, Role role)`

**Who can call:** Anyone (for Donor, Beneficiary, PrivateCompany roles)

**What it does:**
- Checks that `addr` is not already registered
- Checks that the role is one of: Donor, Beneficiary, PrivateCompany (GOs and NGOs have their own registration paths)
- Creates a new Participant record with `exists = true`, `isVerified = false`, reputation = 0
- Emits `ParticipantRegistered(addr, role)`

**Why:** Open registration for non-privileged roles. Anyone can join the network as a donor or beneficiary. The constraints on what they can *do* are enforced by other contracts (e.g., donation caps in Governance, crisis verification for voting).

```
Pseudocode:
─────────────────────────────────────
require registry[addr].exists == false         // No double registration
require role ∈ {Donor, Beneficiary, PrivateCompany}  // Restricted roles
registry[addr] = Participant(addr, role, true, false, block.timestamp)
emit ParticipantRegistered(addr, role)
```

---

### 2. `registerGO(address addr)`

**Who can call:** Contract deployer only (during initial setup)

**What it does:**
- Registers a government organization with pre-assigned authority
- Sets `isVerified = true` immediately (GOs are known entities)
- Initializes reputation to 100 (via ReputationEngine, not stored here)
- Emits `GORegistered(addr)`

**Why:** GOs are pre-defined. In the Moroccan context, these are known government bodies (Ministry of Interior, Civil Protection, etc.). They don't need off-chain verification — their identity is established before the network launches.

```
Pseudocode:
─────────────────────────────────────
require msg.sender == deployer
require registry[addr].exists == false
registry[addr] = Participant(addr, GO, true, true, block.timestamp)
emit GORegistered(addr)
```

> **Important:** The number of GOs is fixed at deployment. Adding new GOs post-deployment would require a governance proposal — this is intentional. Government capture of the validator set by adding friendly GOs is a known attack vector (see Eghatha analysis in thesis).

---

### 3. `registerNGO(address addr)`

**Who can call:** The NGO itself (self-registration as first step)

**What it does:**
- Creates a Participant record with role = NGO, but `isVerified = false`
- The NGO is registered but **cannot act as a validator or run for coordinator** until verified
- Emits `NGORegistered(addr)` — signals to the Social Layer that verification is needed

**Why:** This is a two-step process by design. The NGO registers its address on-chain (step 1), then must be verified off-chain via WANGO and confirmed on-chain by the Social Layer Authority (step 2). This prevents anyone from claiming to be an NGO without proof.

```
Pseudocode:
─────────────────────────────────────
require registry[addr].exists == false
registry[addr] = Participant(addr, NGO, true, false, block.timestamp)
emit NGORegistered(addr)
```

---

### 4. `verifyNGO(address ngo, bytes proof)`

**Who can call:** Verification Multisig only (Tier 2 — requires 2-of-3 approval from GO, NGO, and Community representatives)

**What it does:**
- Confirms that the off-chain WANGO verification process has been completed
- Sets `isVerified = true` for the NGO
- The `proof` parameter contains the off-chain verification evidence (could be a signature, a hash of verification documents, etc.)
- Emits `NGOVerified(ngo)`

**Why Tier 2:** Verifying an NGO grants it validator eligibility and the right to run for coordinator. This is a power-granting action — a compromised single signer could verify fake NGOs to pack the validator set. Requiring 2-of-3 from independent actor classes prevents this.

```
Pseudocode:
─────────────────────────────────────
require msg.sender == verificationMultisig     // Tier 2: 2-of-3 approval required
require registry[ngo].role == NGO
require registry[ngo].isVerified == false       // Not already verified
// Off-chain proof verification (signature check or hash comparison)
registry[ngo].isVerified = true
emit NGOVerified(ngo)
```

---

### 5. `verifyBeneficiary(address beneficiary, uint256 crisisId, bytes proof)`

**Who can call:** Verification Multisig only (Tier 2 — requires 2-of-3 approval)

**What it does:**
- Marks a beneficiary as verified **for a specific crisis**
- The `proof` contains off-chain evidence of crisis membership (from government social assistance databases, local municipality crisis registries, or NGO field reports)
- Emits `BeneficiaryVerified(beneficiary, crisisId)`

**Why Tier 2:** Beneficiary verification grants voting rights. A compromised single signer could fabricate verified beneficiaries to stuff votes. Requiring cross-actor-class agreement ensures the verification reflects genuine crisis impact.

```
Pseudocode:
─────────────────────────────────────
require msg.sender == verificationMultisig     // Tier 2: 2-of-3 approval required
require registry[beneficiary].role == Beneficiary
require registry[beneficiary].exists == true
crisisVerification[beneficiary][crisisId] = true
emit BeneficiaryVerified(beneficiary, crisisId)
```

---

### 6. `getParticipant(address addr) → Participant`

**Who can call:** Anyone (view function, no gas cost)

**What it does:** Returns the full Participant record for an address. Used by every other contract to check identity and permissions.

---

### 7. `isVerifiedValidator(address addr) → bool`

**Who can call:** Anyone (view function)

**What it does:** Returns `true` only if the address is a verified GO or a verified NGO. This is the function that the ReputationEngine and Besu permissioning layer will call to determine who is eligible to be a validator.

```
Pseudocode:
─────────────────────────────────────
return (registry[addr].role == GO && registry[addr].isVerified)
    || (registry[addr].role == NGO && registry[addr].isVerified)
```

---

### 8. `isCrisisVerifiedBeneficiary(address addr, uint256 crisisId) → bool`

**Who can call:** Anyone (view function)

**What it does:** Returns `true` if the beneficiary is verified for the specified crisis. Used by the Governance contract to determine voting eligibility.

---

### 9. `updateOperationalAuthority(address newAuthority)`

**Who can call:** Crisis Declaration Multisig (Tier 3 — highest authority level)

**What it does:** Replaces the Tier 1 operational authority address. Requires the highest-tier approval because changing any authority address is a critical governance action.

---

### 10. `updateVerificationMultisig(address newMultisig)`

**Who can call:** Crisis Declaration Multisig (Tier 3)

**What it does:** Replaces the Tier 2 verification multisig contract address. Used when signers need to be rotated or the multisig contract is upgraded.

---

### 11. `updateCrisisDeclarationMultisig(address newMultisig)`

**Who can call:** Current Crisis Declaration Multisig (Tier 3 — self-update)

**What it does:** Replaces the Tier 3 multisig itself. This is the most sensitive operation — it requires the current highest authority to authorize its own replacement.

> **Security Note:** Authority address updates should emit events for full transparency. Any change to who controls the system is a critical audit event.

---

## Events

| Event | When Emitted | Why It Matters |
|-------|-------------|----------------|
| `ParticipantRegistered(addr, role)` | Self-registration | Frontend can show new participants |
| `GORegistered(addr)` | GO added at deployment | Transparency — everyone sees who the GOs are |
| `NGORegistered(addr)` | NGO self-registers | Signals verification multisig to begin WANGO verification |
| `NGOVerified(addr)` | Verification Multisig confirms NGO | NGO can now be a validator and run for coordinator |
| `BeneficiaryVerified(addr, crisisId)` | Verification Multisig confirms beneficiary | Beneficiary can now vote in this specific crisis |
| `OperationalAuthorityUpdated(old, new)` | Tier 1 authority changed | Critical audit trail |
| `VerificationMultisigUpdated(old, new)` | Tier 2 multisig changed | Critical audit trail |
| `CrisisDeclarationMultisigUpdated(old, new)` | Tier 3 multisig changed | Critical audit trail |

---

## Access Control Summary

| Function | Caller | Tier | Condition |
|----------|--------|------|-----------|
| `registerParticipant` | Anyone | — | Role must be Donor/Beneficiary/PrivateCompany |
| `registerGO` | Deployer only | — | Only during initial setup |
| `registerNGO` | The NGO itself | — | Address not already registered |
| `verifyNGO` | Verification Multisig | Tier 2 (2-of-3) | NGO must be registered but unverified |
| `verifyBeneficiary` | Verification Multisig | Tier 2 (2-of-3) | Beneficiary must be registered |
| `updateOperationalAuthority` | Crisis Declaration Multisig | Tier 3 (4-of-7) | — |
| `updateVerificationMultisig` | Crisis Declaration Multisig | Tier 3 (4-of-7) | — |
| `updateCrisisDeclarationMultisig` | Crisis Declaration Multisig | Tier 3 (4-of-7) | Self-update |
| All view functions | Anyone | — | — |

---

## Interactions with Other Contracts

```
Registry ──reads──→ (nothing — it's the base layer)

DonationManager ──reads──→ Registry   (check role before accepting donations)
Governance      ──reads──→ Registry   (check role + verification for voting)
ReputationEngine──reads──→ Registry   (check isVerifiedValidator for scoring)
Besu Permissioning ──reads──→ Registry (via ReputationEngine, for validator set)
```

The Registry has **no dependencies** on other contracts. It is the foundation.

---

## Design Decisions and Trade-offs

### Why not store reputation in the Registry?

Reputation is dynamic and computed per-epoch based on behavior. Storing it in the Registry would couple identity (slow-changing) with scoring (fast-changing), increasing gas costs for score updates and making the Registry contract unnecessarily complex. The ReputationEngine handles all scoring logic separately.

### Why a tiered multisig instead of a single Social Layer Authority?

A zero-trust system cannot have a single trusted address controlling all critical actions — that would contradict the foundational design principle. The tiered model splits authority by risk level: procedural actions (Tier 1) use a single operator for efficiency, identity verification (Tier 2) requires cross-actor-class agreement via 2-of-3 multisig, and crisis declaration (Tier 3) requires broad consensus via 4-of-7 multisig. This maps directly to the EGT model's three independent actor classes (GO, NGO, Community), ensuring the implementation's trust assumptions are consistent with the game theory.

The tiered approach also provides defense in depth: compromising the Tier 1 operator only gives access to procedural triggers (no power-granting capability). Compromising 2 of 3 Tier 2 signers allows fake verifications but not crisis declaration. Only compromising 4 of 7 Tier 3 signers enables the most dangerous actions — a significantly harder attack than compromising a single address.

### Why can't GOs be added after deployment?

This is a deliberate anti-capture mechanism. If GOs could be added dynamically, a colluding government could register multiple ministry addresses to gain voting majority in the validator set — exactly the attack vector identified in the Eghatha analysis. The fixed GO set forces government accountability: if a GO behaves badly, it gets slashed and potentially removed, and cannot simply be replaced by another friendly address.

### Why are Beneficiaries verified per-crisis and not globally?

A globally verified beneficiary could vote in every crisis, even those that don't affect them. This would create a permanent voting bloc that could be mobilized for political purposes. Per-crisis verification ensures voting rights are tied to actual impact.

---

## Gas Considerations

- Registration functions are one-time operations per address — gas cost is not a recurring concern
- View functions (`getParticipant`, `isVerifiedValidator`, etc.) are free to call
- The most frequently called function by other contracts will be `isVerifiedValidator` — it should be optimized (simple mapping lookup + role check)
- All data is stored in mappings (O(1) lookup), not arrays (no iteration needed)

---

## Testing Scenarios

| Scenario | Expected Result |
|----------|----------------|
| Register as Donor | Success, emits event |
| Register same address twice | Revert |
| Register as GO without being deployer | Revert |
| Register as NGO, then try to act as validator before verification | Should fail when checked by other contracts |
| Verify NGO from single non-multisig address | Revert |
| Verify NGO with only 1-of-3 multisig approval | Revert (needs 2-of-3) |
| Verify NGO with 2-of-3 multisig approval | Success |
| Verify beneficiary for crisis via Tier 2 multisig | Returns true for that crisis, false for others |
| Update Tier 1 authority from Tier 2 multisig | Revert (requires Tier 3) |
| Update Tier 1 authority from Tier 3 multisig | Success |
| Tier 3 multisig updates itself | Success, old multisig loses control |
