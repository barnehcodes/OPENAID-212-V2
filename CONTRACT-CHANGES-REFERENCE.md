# Contract Changes Reference — Post-Supervisor Feedback

Internal reference for generating Claude Code prompts and updating documentation.

---

## Change 1: Escrow Model — Coordinator Gets Authority, Not Funds

### Problem
`releaseEscrowToCoordinator()` transfers all AID tokens from escrow to the coordinator's wallet. If the coordinator misbehaves, they take the funds with them.

### Solution
Coordinator never holds funds. They have distribution authority over the escrow. Funds move directly from `address(this)` to beneficiaries.

### Files to Modify

**DonationManager.sol**

#### `releaseEscrowToCoordinator()` — remove the transfer

Current:
```solidity
uint256 amount = crisisEscrow[crisisId];
crisisEscrow[crisisId] = 0;
crisisCoordinator[crisisId] = coordinator;
_transfer(address(this), coordinator, amount);
emit EscrowReleased(crisisId, coordinator, amount);
```

New:
```solidity
crisisCoordinator[crisisId] = coordinator;
emit EscrowReleased(crisisId, coordinator, crisisEscrow[crisisId]);
// Funds stay in address(this). Escrow balance NOT zeroed.
```

#### `distributeFTToBeneficiary()` — pull from escrow, not coordinator balance

Current:
```solidity
_transfer(msg.sender, beneficiary, amount);
```

New:
```solidity
if (amount > crisisEscrow[crisisId]) revert InsufficientEscrow(crisisId, amount);
crisisEscrow[crisisId] -= amount;
_transfer(address(this), beneficiary, amount);
```

#### New error needed:
```solidity
error InsufficientEscrow(uint256 crisisId, uint256 requested);
```

### Limitation (acknowledged in thesis)
Coordinator cannot use funds for operational expenses (logistics, supplies, hiring). The system is designed for direct beneficiary transfers only. Operational costs are assumed to be covered by the coordinating organization's institutional budget.

### Future Work (mentioned, not implemented)
Option 2 — Operational expense allocation: reserve a percentage (e.g., 15%) of escrow as an operational budget that the coordinator can withdraw. Partially reintroduces the custody risk but in a bounded way.

---

## Change 2: PAUSED State + Re-Election Cycle

### Problem
When misconduct is confirmed, `finalizeMisconductVote()` sets the phase to CLOSED. No re-election possible. Remaining escrow (under the new model) is locked forever.

### Solution
Add a PAUSED phase. Misconduct confirmation freezes the crisis (not kills it). The system re-enters the election cycle with the old coordinator banned.

### New Lifecycle

```
DECLARED → VOTING → ACTIVE → CLOSED (clean path, Tier-1)
                       │
                       ↓
                    REVIEW (Tier-3 triggers misconduct vote, 72hr window)
                       │
                  ┌────┴────┐
                  │         │
               dismissed  confirmed
                  │         │
               ACTIVE    PAUSED (escrow frozen)
               (resume)     │
                            ↓
                         VOTING (re-election, old coordinator banned)
                            │
                            ↓
                         ACTIVE (new coordinator, remaining escrow)
                            │
                            ↓
                         CLOSED (or PAUSED again if new one misbehaves)
```

### Escrow-Phase Link

| Crisis Phase | Escrow State | Donations | Distributions |
|---|---|---|---|
| DECLARED | Open | Yes | No (no coordinator) |
| VOTING | Open | Yes | No (no coordinator) |
| ACTIVE | Sealed | No | Yes (coordinator distributes) |
| REVIEW | Frozen | No | No (under investigation) |
| PAUSED | Frozen | No | No (awaiting re-election) |
| VOTING (re-election) | Open | Yes (new candidates need cap) | No |
| ACTIVE (new coord) | Sealed | No | Yes |
| CLOSED | Closed | No | No |

### Files to Modify

**IGovernance.sol** — add PAUSED to Phase enum:
```solidity
enum Phase { DECLARED, VOTING, ACTIVE, REVIEW, PAUSED, CLOSED }
```

**Governance.sol**

#### New state variables:
```solidity
mapping(uint256 => mapping(address => bool)) private _blacklisted;
mapping(uint256 => uint256) public electionRound; // starts at 0, incremented on re-election
```

Change `hasVoted` to include round:
```solidity
// OLD: mapping(address => mapping(uint256 => bool)) public hasVoted;
// NEW:
mapping(address => mapping(uint256 => mapping(uint256 => bool))) public hasVoted;
// hasVoted[voter][crisisId][round]
```

#### New events:
```solidity
event CrisisPaused(uint256 indexed crisisId, address indexed oldCoordinator);
event MisconductDismissed(uint256 indexed crisisId);
event CoordinatorRevoked(uint256 indexed crisisId);
```

#### New error:
```solidity
error BlacklistedFromCrisis(address addr, uint256 crisisId);
```

#### `finalizeMisconductVote()` — branch on outcome:

```solidity
if (misconductConfirmed) {
    // Slash
    if (address(reputationEngine) != address(0)) {
        reputationEngine.recordMisconduct(crisis.coordinator, crisisId);
    }

    // Ban old coordinator from this crisis
    _blacklisted[crisisId][crisis.coordinator] = true;
    emit CrisisPaused(crisisId, crisis.coordinator);

    // Strip authority
    crisis.coordinator = address(0);
    crisis.phase = Phase.PAUSED;
    crisis.misconductFlagged = false; // allow future flags for new coordinator

    // Clear old candidates
    delete _candidatesList[crisisId];
    // Note: _candidateIndexPlusOne per-address entries become stale but harmless
    // because _candidatesList is empty, so length check fails

    // Reset voting round
    electionRound[crisisId] += 1;
    delete votingStart[crisisId];
    delete votingEnd[crisisId];

    // Freeze escrow in DonationManager
    donationManager.pauseCrisis(crisisId);
} else {
    // Coordinator vindicated — resume
    crisis.phase = Phase.ACTIVE;
    crisis.misconductFlagged = false;

    // Unfreeze escrow
    donationManager.unpauseCrisis(crisisId);

    emit MisconductDismissed(crisisId);
}
```

#### `initiateMisconductVote()` — freeze escrow immediately on REVIEW entry:

Add after setting phase to REVIEW:
```solidity
donationManager.pauseCrisis(crisisId);
```

#### `startVoting()` — accept PAUSED as valid source phase:

```solidity
// OLD:
if (crisis.phase != Phase.DECLARED) revert WrongPhase(crisisId, crisis.phase);

// NEW:
if (crisis.phase != Phase.DECLARED && crisis.phase != Phase.PAUSED) {
    revert WrongPhase(crisisId, crisis.phase);
}
```

When transitioning from PAUSED → VOTING, unfreeze and reopen donations:
```solidity
if (crisis.phase == Phase.PAUSED) {
    donationManager.unpauseCrisis(crisisId); // unfreezes + reopens donations
}
```

#### `registerAsCandidate()` — accept PAUSED + blacklist check:

```solidity
// Add PAUSED as valid phase
if (crisis.phase != Phase.DECLARED && crisis.phase != Phase.VOTING && crisis.phase != Phase.PAUSED) {
    revert WrongPhase(crisisId, crisis.phase);
}

// Add blacklist check
if (_blacklisted[crisisId][msg.sender]) {
    revert BlacklistedFromCrisis(msg.sender, crisisId);
}
```

#### `castVote()` — use election round for double-vote prevention:

```solidity
// OLD:
if (hasVoted[msg.sender][crisisId]) revert AlreadyVoted(msg.sender, crisisId);
// ...
hasVoted[msg.sender][crisisId] = true;

// NEW:
uint256 round = electionRound[crisisId];
if (hasVoted[msg.sender][crisisId][round]) revert AlreadyVoted(msg.sender, crisisId);
// ...
hasVoted[msg.sender][crisisId][round] = true;
```

**DonationManager.sol** — add pause/unpause functions:

```solidity
mapping(uint256 => bool) public crisisPaused;

function pauseCrisis(uint256 crisisId) external {
    if (msg.sender != governanceContract) revert NotGovernance(msg.sender);
    crisisPaused[crisisId] = true;
    activeCrises[crisisId] = false; // stop new donations
    crisisCoordinator[crisisId] = address(0); // revoke distribution authority
    emit CrisisPaused(crisisId);
}

function unpauseCrisis(uint256 crisisId) external {
    if (msg.sender != governanceContract) revert NotGovernance(msg.sender);
    crisisPaused[crisisId] = false;
    activeCrises[crisisId] = true; // reopen donations
    emit CrisisUnpaused(crisisId);
}
```

Add pause check to distribution functions:

```solidity
// In distributeFTToBeneficiary():
if (crisisPaused[crisisId]) revert CrisisIsPaused(crisisId);

// In assignInKindToBeneficiary():
if (crisisPaused[crisisId]) revert CrisisIsPaused(crisisId);
```

New errors and events in DonationManager:
```solidity
error CrisisIsPaused(uint256 crisisId);
event CrisisPaused(uint256 indexed crisisId);
event CrisisUnpaused(uint256 indexed crisisId);
```

**IDonationManager.sol** — add to interface:
```solidity
function pauseCrisis(uint256 crisisId) external;
function unpauseCrisis(uint256 crisisId) external;
```

---

## Change 3: Direct In-Kind Donations (Three-Party Flow)

### Problem
In-kind donations only exist within crises. No way to donate physical items outside a crisis context.

### Solution
Add `directDonateInKind()` with a three-party flow: Donor → Facility (GO/NGO) → Beneficiary. Mirrors the existing `directDonateFT()` for tokens.

### The Three-Party Flow

| Step | Who | Function | Status |
|---|---|---|---|
| 1 | Donor | `directDonateInKind(facility, beneficiary, metadataURI)` | PENDING |
| 2 | Facility (GO/NGO) | `confirmFacilityDelivery(nftId)` | ASSIGNED |
| 3 | Beneficiary | `confirmInKindRedemption(nftId)` (existing function) | REDEEMED |

### Parallel with Existing Paths

| | Crisis-Bound | Direct |
|---|---|---|
| FT | Donor → Escrow → Coordinator → Beneficiary | Donor → Beneficiary |
| In-Kind | Donor → Coordinator assigns → Beneficiary confirms | Donor → Facility delivers → Beneficiary confirms |

### Files to Modify

**DonationManager.sol**

#### Modify `InKindDonation` struct — add `facility` field:
```solidity
struct InKindDonation {
    uint256 nftId;
    address donor;
    string  metadataURI;
    uint256 crisisId;     // 0 = direct donation, >0 = crisis-bound
    Status  status;
    address assignedTo;
    address facility;     // GO/NGO handling logistics. address(0) for crisis-bound.
}
```

Note: All existing code that creates InKindDonation structs (in `donateInKind()`) needs to include `facility: address(0)`.

#### New function — `directDonateInKind()`:
```solidity
function directDonateInKind(
    address facility,
    address beneficiary,
    string calldata metadataURI
) external returns (uint256 nftId) {
    if (!registry.getParticipant(msg.sender).exists) revert NotRegistered(msg.sender);
    if (!registry.isVerifiedValidator(facility)) revert NotVerifiedValidator(facility);

    IRegistry.Participant memory p = registry.getParticipant(beneficiary);
    if (!p.exists || p.role != IRegistry.Role.Beneficiary) {
        revert NotRegisteredBeneficiary(beneficiary);
    }

    nftId = ++_nftCounter;
    _nftOwners[nftId] = address(this); // held until facility confirms

    inKindDonations[nftId] = InKindDonation({
        nftId:       nftId,
        donor:       msg.sender,
        metadataURI: metadataURI,
        crisisId:    0,
        status:      Status.PENDING,
        assignedTo:  beneficiary,
        facility:    facility
    });

    emit DirectInKindDonation(msg.sender, facility, beneficiary, nftId);
}
```

#### New function — `confirmFacilityDelivery()`:
```solidity
function confirmFacilityDelivery(uint256 nftId) external {
    InKindDonation storage donation = inKindDonations[nftId];
    if (donation.nftId == 0) revert NFTNotFound(nftId);
    if (msg.sender != donation.facility) revert NotFacility(msg.sender, nftId);
    if (donation.status != Status.PENDING) {
        revert WrongNFTStatus(nftId, Status.PENDING, donation.status);
    }

    donation.status = Status.ASSIGNED;
    _nftOwners[nftId] = donation.assignedTo;

    emit FacilityDeliveryConfirmed(nftId, msg.sender, donation.assignedTo);
}
```

#### New errors:
```solidity
error NotVerifiedValidator(address facility);
error NotFacility(address caller, uint256 nftId);
```

#### New events:
```solidity
event DirectInKindDonation(address indexed donor, address indexed facility, address indexed beneficiary, uint256 nftId);
event FacilityDeliveryConfirmed(uint256 indexed nftId, address indexed facility, address indexed beneficiary);
```

#### `confirmInKindRedemption()` — no changes needed
Already checks `msg.sender == donation.assignedTo` and `status == ASSIGNED`. Works for both crisis-bound and direct paths.

---

## Change 4: ReputationEngine Documentation Cleanup

### Problem
Current docs mix theoretical EGT concepts with what's actually in the contracts. Supervisor confused about what C_i and B_i actually mean in code.

### What the Code Actually Does

The contract has two scoring paths, applied at different times:

#### Path 1: Participation (B_i) — applied at epoch boundaries via `updateScores()`

```
B_i = w_role × [α × A_i + (1 - α) × V_i]
```

Where:
- `A_i = roundsParticipated / totalRoundsEligible` — attendance ratio
- `V_i = SCALE × BETA × votes / (SCALE + BETA × votes)` — voting saturation (integer approx of `1 - e^(-β×votes)`)
- `w_role` = 100 (NGO) or 85 (GO)
- `α = 60` (ALPHA constant) — 60% attendance, 40% voting
- Applied as: `score += k1 × B_i / SCALE`

Code: `_calculateParticipation()` computes B_i. `updateScores()` applies it.

#### Path 2: Behavioral (C_i) — applied immediately when events occur

**Penalty** (`recordMisconduct()`):
```
penalty = P0 × w_role × (SCALE + α_crisis × n²) / (SCALE × SCALE)
penalty = penalty × k2 / SCALE
score -= penalty (floored at 0)
```
Then immediate eligibility check: if score < threshold and activeCount > 4, deactivate.

**Reward** (`recordSuccessfulCoordination()`):
```
ceilingReducer = SCALE × SCALE / (SCALE + BETA × ln(1 + timeoutCount) / SCALE)
reward = R0 × w_role × ceilingReducer / (SCALE × SCALE)
reward = reward × k2 / SCALE
score += reward
```

#### The Full Formula

```
R_i(n) = R_i(n-1) + k1 × B_i + k2 × C_i
```

But B_i and C_i are NOT computed together. B_i is batch-applied at epoch end. C_i is applied transaction-by-transaction as misconduct/success events occur. Both are weighted by their respective k1/k2 phase parameters.

#### Phase Parameters (from constructor defaults)

| Phase | k1 | k2 | α_crisis |
|---|---|---|---|
| PREPAREDNESS | 70 | 30 | 100 |
| ACTIVE_CRISIS | 40 | 60 | 250 |
| RECOVERY | 65 | 35 | 150 |

k1 + k2 = 100 always (enforced by `setPhaseConfig()`).

#### Eligibility Thresholds

- NGO: score ≥ averageScore
- GO: score ≥ averageScore × 120 / 100 (GAMMA_GO = 120, i.e., 20% above average)
- Safety floor: never deactivate below MIN_VALIDATORS = 4

#### Besu Integration

- `IBesuPermissioning` interface with `addValidator()` / `removeValidator()`
- Called in `initializeValidator()`, `recordMisconduct()` (immediate deactivation), `updateScores()` (epoch eligibility)
- All calls guarded by `if (address(besuPermissioning) != address(0))`
- In thesis prototype: mock contract. In production: Besu's native smart contract permissioning (`--permissions-nodes-contract-enabled`)
- NO changes to consensus algorithm code (Go, Java). Uses Besu's built-in permissioning feature.

#### Constants (all in contract)

| Constant | Value | Meaning |
|---|---|---|
| SCALE | 100 | Integer arithmetic scale |
| INITIAL_SCORE | 100 | Starting score |
| R0 | 10 | Base reward |
| P0 | 2 | Base penalty |
| ALPHA | 60 | Attendance weight (60%) |
| BETA | 50 | Voting saturation / timeout decay rate |
| W_ROLE_NGO | 100 | NGO weight (1.0) |
| W_ROLE_GO | 85 | GO weight (0.85) |
| GAMMA_GO | 120 | GO threshold multiplier (1.2×) |
| MIN_VALIDATORS | 4 | QBFT safety floor |

#### What's NOT in the contract (remove from docs)

- λ (enforcement effectiveness) — theoretical only
- δ_G (political damage) — off-chain consequence
- φ_G (GO-specific penalty) — same function for everyone, difference is only w_role
- ω (community verification complementarity) — community not scored
- Three-player game framing — implementation is two-population (GO vs NGO)

---

## Summary: All Changes to Implement

### DonationManager.sol
1. Modify `releaseEscrowToCoordinator()` — remove fund transfer, just record coordinator
2. Modify `distributeFTToBeneficiary()` — pull from escrow, add escrow balance check
3. Add `InsufficientEscrow` error
4. Add `facility` field to `InKindDonation` struct
5. Update `donateInKind()` to set `facility: address(0)` in struct creation
6. Add `directDonateInKind()` function
7. Add `confirmFacilityDelivery()` function
8. Add `pauseCrisis()` and `unpauseCrisis()` functions
9. Add `crisisPaused` mapping
10. Add pause checks in `distributeFTToBeneficiary()` and `assignInKindToBeneficiary()`
11. Add new errors: `InsufficientEscrow`, `CrisisIsPaused`, `NotVerifiedValidator`, `NotFacility`
12. Add new events: `DirectInKindDonation`, `FacilityDeliveryConfirmed`, `CrisisPaused`, `CrisisUnpaused`

### IDonationManager.sol
13. Add `pauseCrisis()` and `unpauseCrisis()` to interface

### IGovernance.sol
14. Add `PAUSED` to Phase enum (between REVIEW and CLOSED)

### Governance.sol
15. Add `_blacklisted` mapping
16. Add `electionRound` mapping
17. Change `hasVoted` to three-level mapping (add round dimension)
18. Modify `finalizeMisconductVote()` — branch: confirmed → PAUSED + ban + freeze; dismissed → ACTIVE + unfreeze
19. Modify `initiateMisconductVote()` — freeze escrow on REVIEW entry
20. Modify `startVoting()` — accept PAUSED as source phase, unfreeze on transition
21. Modify `registerAsCandidate()` — accept PAUSED phase, add blacklist check
22. Modify `castVote()` — use election round for double-vote prevention
23. Add new errors: `BlacklistedFromCrisis`
24. Add new events: `CrisisPaused`, `MisconductDismissed`

### Documentation
25. Update 00-system-architecture.md — new lifecycle diagram, escrow model
26. Update 02-donation-manager.md — escrow changes, direct in-kind, pause/unpause
27. Update 03-governance.md — PAUSED phase, re-election cycle, blacklist
28. Update 04-reputation-engine.md — strip theoretical concepts, keep only implemented math

### Tests
29. All existing tests need updating for:
    - `hasVoted` signature change (add round parameter)
    - `InKindDonation` struct change (add facility field)
    - Escrow model change (coordinator no longer holds funds)
30. New tests needed for:
    - PAUSED state transitions
    - Re-election cycle
    - Blacklist enforcement
    - Escrow freeze/unfreeze
    - `directDonateInKind()` three-party flow
    - `confirmFacilityDelivery()`
    - Pause checks on distribution functions
