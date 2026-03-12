# Contract 3: Governance

## Purpose

The Governance contract is the **democratic engine** of OpenAID +212. It handles everything related to collective decision-making: declaring crises, electing coordinators, conducting misconduct votes, and enforcing the GO vote-compression mechanism that prevents government capture.

This is where OpenAID's separation of **consensus** (PoA block production by validators) from **governance** (on-chain democratic decisions by all participants) is enforced in code.

---

## Why This Contract Exists

The central problem OpenAID +212 addresses is: *Who decides how aid is distributed, and how do we prevent that person from acting selfishly?*

The Governance contract answers this through three mechanisms:

1. **Coordinator Election** — When a crisis occurs, GOs and NGOs can run as candidates. All eligible participants vote. The winner becomes the coordinator responsible for distributing aid.
2. **GO Vote Compression** — If all GOs vote for the same candidate, their collective vote counts as one. This prevents a government bloc from unilaterally selecting their preferred coordinator.
3. **Misconduct Voting** — After aid distribution, all participants can vote on whether the coordinator performed honestly. A negative result triggers the ReputationEngine's slashing mechanism.

---

## Dependencies

```
Governance ──reads──→ Registry           (role checks, verification status)
Governance ──reads──→ DonationManager    (check donation caps for voting eligibility)
Governance ──calls──→ DonationManager    (release escrow to elected coordinator)
Governance ──calls──→ ReputationEngine   (trigger slashing after misconduct vote)
```

---

## Data Structures

### Crisis

```
Crisis {
    uint256     crisisId            // Unique identifier
    string      description         // What happened (e.g., "Earthquake Al Haouz Sept 2023")
    uint256     severity            // 1-5 scale, set by Tier 3 multisig consensus
    uint256     baseDonationCap     // Minimum donation to earn voting rights (in FT)
    Phase       phase               // DECLARED → VOTING → ACTIVE → REVIEW → CLOSED
    uint256     declaredAt          // Timestamp
    address     coordinator         // Elected coordinator (set after voting)
    bool        misconductFlagged   // Whether a misconduct vote has been initiated
}

enum Phase { DECLARED, VOTING, ACTIVE, REVIEW, CLOSED }
```

### Candidacy

```
Candidacy {
    address     candidate           // Who is running
    uint256     crisisId            // For which crisis
    uint256     voteCount           // Total non-GO votes received
    uint256     goVoteCount         // GO votes received (handled separately)
}
```

### Vote Records

```
mapping(address => mapping(uint256 => bool)) hasVoted
// hasVoted[voterAddress][crisisId] = true/false

mapping(address => mapping(uint256 => bool)) hasMisconductVoted
// hasMisconductVoted[voterAddress][crisisId] = true/false
```

### Misconduct Vote Tally

```
MisconductTally {
    uint256     crisisId
    uint256     votesFor            // Votes saying misconduct occurred
    uint256     votesAgainst        // Votes saying coordinator did well
    uint256     voteStart
    uint256     voteEnd
}
```

---

## The Crisis Lifecycle

Every crisis follows a strict phase progression. No phase can be skipped.

```
DECLARED ──→ VOTING ──→ ACTIVE ──→ REVIEW ──→ CLOSED
   │            │          │          │          │
   │            │          │          │          └─ Crisis archived
   │            │          │          └─ Misconduct vote happens here
   │            │          └─ Coordinator distributes aid
   │            └─ Participants vote for coordinator
   └─ Tier 3 multisig declares crisis, sets severity + cap
```

| Phase | What Happens | Triggered By | Duration |
|-------|-------------|-------------|----------|
| DECLARED | Crisis registered on-chain. Donation cap set. Candidates can register. | Tier 3 multisig (4-of-7) | Until Tier 1 operator triggers voting |
| VOTING | All eligible participants vote for coordinator. Donations accepted. | Tier 1 operator | Fixed time window (e.g., 48 hours) |
| ACTIVE | Coordinator distributes funds and in-kind aid to beneficiaries. | Automatic (after vote finalization) | Until coordinator signals completion or timeout |
| REVIEW | Misconduct vote: did the coordinator do a good job? All participants vote. | Tier 3 multisig (4-of-7) | Fixed time window (e.g., 72 hours) |
| CLOSED | Results finalized. Reputation updated. Crisis archived. | Tier 1 operator or misconduct vote finalization | Permanent |

---

## Functions

### 1. `declareCrisis(string description, uint256 severity, uint256 baseDonationCap)`

**Who can call:** Crisis Declaration Multisig only (Tier 3 — requires 4-of-7 approval from GO, NGO, and Community representatives)

**What it does:**
- Creates a new Crisis record in DECLARED phase
- Sets the severity level and base donation cap
- Emits `CrisisDeclared(crisisId, description, severity)`

**Why Tier 3:** Crisis declaration triggers the entire governance cycle — donations flow in, coordinators are elected, funds are distributed. A fake crisis declaration could redirect significant resources. Requiring 4-of-7 agreement across all three actor classes ensures no single group can trigger this unilaterally.

```
Pseudocode:
─────────────────────────────────────
require msg.sender == crisisDeclarationMultisig   // Tier 3: 4-of-7 approval required
require severity >= 1 && severity <= 5

crisisId = nextCrisisId++
crises[crisisId] = Crisis(crisisId, description, severity, baseDonationCap, DECLARED, block.timestamp, address(0), false)
emit CrisisDeclared(crisisId, description, severity)
```

> **Why the Social Layer declares crises:** Crisis severity is "not really programmable" — it requires human judgment. Is this a minor local flood or a national emergency? The three actor classes (GO, NGO, Community) must reach consensus through the Tier 3 multisig before a crisis is encoded on-chain.

---

### 2. `registerAsCandidate(uint256 crisisId)`

**Who can call:** Verified NGOs and GOs only

**What it does:**
- Registers the caller as a coordinator candidate for this crisis
- Checks that the caller has met the donation cap for their role (NGO = 10× base, GO = 15× base)
- Emits `CandidateRegistered(crisisId, candidate)`

```
Pseudocode:
─────────────────────────────────────
require crises[crisisId].phase == DECLARED || crises[crisisId].phase == VOTING
require Registry.isVerifiedValidator(msg.sender)

// Check donation cap based on role
Role role = Registry.getParticipant(msg.sender).role
uint256 requiredCap = crises[crisisId].baseDonationCap * getDonationMultiplier(role)
require DonationManager.getDonorContribution(msg.sender, crisisId) >= requiredCap

candidates[crisisId].push(Candidacy(msg.sender, crisisId, 0, 0))
emit CandidateRegistered(crisisId, msg.sender)
```

---

### 3. `startVoting(uint256 crisisId)`

**Who can call:** Operational Authority (Tier 1 — single signer)

**What it does:**
- Transitions the crisis from DECLARED to VOTING phase
- Sets the voting window (start + duration)
- Emits `VotingStarted(crisisId, voteStart, voteEnd)`

**Why Tier 1 is sufficient:** Starting the voting phase is procedural — the crisis has already been declared by Tier 3, candidates have already registered. The operator is just triggering a transition that doesn't grant new power. The outcome is determined by voter behavior, not by whoever starts the clock.

```
Pseudocode:
─────────────────────────────────────
require msg.sender == operationalAuthority        // Tier 1: single signer sufficient
require crises[crisisId].phase == DECLARED
require candidates[crisisId].length > 0          // At least one candidate

crises[crisisId].phase = VOTING
votingStart[crisisId] = block.timestamp
votingEnd[crisisId] = block.timestamp + VOTING_DURATION
emit VotingStarted(crisisId, votingStart[crisisId], votingEnd[crisisId])
```

---

### 4. `castVote(uint256 crisisId, address candidate)`

**Who can call:** Any eligible participant

**What it does:**
- Records a vote for the specified candidate
- Eligibility depends on role:
  - **Donors / Private Companies:** Must have donated ≥ baseDonationCap for this crisis
  - **Beneficiaries:** Must be crisis-verified (no donation requirement)
  - **NGOs:** Must have donated ≥ 10× baseDonationCap
  - **GOs:** Must have donated ≥ 15× baseDonationCap, and **all GOs are required to vote**
- GO votes are tracked separately for the compression mechanism
- Emits `VoteCast(crisisId, voter, candidate)`

```
Pseudocode:
─────────────────────────────────────
require crises[crisisId].phase == VOTING
require block.timestamp <= votingEnd[crisisId]
require hasVoted[msg.sender][crisisId] == false
require isCandidate(crisisId, candidate)

Role role = Registry.getParticipant(msg.sender).role

// Check eligibility
if (role == Beneficiary) {
    require Registry.isCrisisVerifiedBeneficiary(msg.sender, crisisId)
} else {
    uint256 requiredCap = crises[crisisId].baseDonationCap * getDonationMultiplier(role)
    require DonationManager.getDonorContribution(msg.sender, crisisId) >= requiredCap
}

// Record vote
if (role == GO) {
    candidates[crisisId][candidate].goVoteCount += 1
} else {
    candidates[crisisId][candidate].voteCount += 1
}

hasVoted[msg.sender][crisisId] = true
emit VoteCast(crisisId, msg.sender, candidate)
```

---

### 5. `finalizeElection(uint256 crisisId)`

**Who can call:** Anyone (after voting period ends)

**What it does:**
- Applies the **GO vote compression** rule
- Calculates final vote counts
- Selects the winner (most votes)
- Transitions crisis to ACTIVE phase
- Calls DonationManager to release escrow to the elected coordinator
- Emits `CoordinatorElected(crisisId, coordinator, voteCount)`

**The GO Vote Compression Algorithm:**

This is a key anti-capture mechanism. Here's how it works:

```
1. Count all GO votes per candidate
2. Count total registered GOs
3. If ALL GOs voted for the SAME candidate:
     → Their collective vote counts as ONE vote (compression)
4. If GOs are split across candidates:
     → Each GO vote counts normally (no compression)
```

The rationale: If all GOs unanimously support one candidate, that's suspicious — it suggests coordinated behavior, possibly political. Compressing their vote to 1 neutralizes the bloc effect. If GOs are genuinely split (some vote A, some vote B), that's healthy disagreement and each vote stands.

```
Pseudocode:
─────────────────────────────────────
require crises[crisisId].phase == VOTING
require block.timestamp > votingEnd[crisisId]

// Apply GO vote compression
uint256 totalGOs = getTotalRegisteredGOs()
bool allGOsSameCandidate = checkGOUnanimity(crisisId)

for each candidate in candidates[crisisId]:
    uint256 finalVotes = candidate.voteCount    // Start with non-GO votes

    if allGOsSameCandidate:
        // All GOs voted the same → compress to 1
        if candidate.goVoteCount == totalGOs:
            finalVotes += 1
    else:
        // GOs split → each counts normally
        finalVotes += candidate.goVoteCount

    candidate.finalVoteCount = finalVotes

// Select winner
address winner = candidateWithMostVotes(crisisId)
crises[crisisId].coordinator = winner
crises[crisisId].phase = ACTIVE

// Release escrow funds to coordinator
DonationManager.releaseEscrowToCoordinator(crisisId, winner)

emit CoordinatorElected(crisisId, winner, winnerVoteCount)
```

> **Edge case — tie:** If two candidates tie, the one who registered as candidate first wins. This is simple and deterministic. A more sophisticated system could use VRF (Verifiable Random Function) for randomized tiebreaking, but that's out of scope for the thesis prototype.

> **Edge case — no GOs vote:** If GOs don't participate, their vote count is 0. The election proceeds with non-GO votes only. However, non-participation by required GOs should be flagged — it can feed into their reputation score in the ReputationEngine (they failed to fulfill their mandatory participation duty).

---

### 6. `initiateMisconductVote(uint256 crisisId)`

**Who can call:** Crisis Declaration Multisig (Tier 3 — requires 4-of-7 approval)

**What it does:**
- Transitions the crisis from ACTIVE to REVIEW phase
- Opens a misconduct voting window
- All participants in the crisis can now vote on whether the coordinator performed honestly
- Emits `MisconductVoteStarted(crisisId, voteStart, voteEnd)`

**Why Tier 3:** Initiating a misconduct vote is a serious accusation — it can trigger reputation slashing against the coordinator. Without high-threshold approval, this mechanism could be weaponized: a single authority could initiate misconduct votes against coordinators they dislike for political reasons. Requiring 4-of-7 cross-actor-class agreement prevents this.

```
Pseudocode:
─────────────────────────────────────
require msg.sender == crisisDeclarationMultisig   // Tier 3: 4-of-7 approval required
require crises[crisisId].phase == ACTIVE
require crises[crisisId].coordinator != address(0)

crises[crisisId].phase = REVIEW
crises[crisisId].misconductFlagged = true
misconductTally[crisisId] = MisconductTally(crisisId, 0, 0, block.timestamp, block.timestamp + MISCONDUCT_VOTE_DURATION)
emit MisconductVoteStarted(crisisId, block.timestamp, block.timestamp + MISCONDUCT_VOTE_DURATION)
```

---

### 7. `castMisconductVote(uint256 crisisId, bool isMisconduct)`

**Who can call:** Any participant who was involved in this crisis (donors who donated, verified beneficiaries, GOs, NGOs)

**What it does:**
- Records a misconduct vote (yes = misconduct occurred, no = coordinator did well)
- Emits `MisconductVoteCast(crisisId, voter, isMisconduct)`

```
Pseudocode:
─────────────────────────────────────
require crises[crisisId].phase == REVIEW
require block.timestamp <= misconductTally[crisisId].voteEnd
require hasMisconductVoted[msg.sender][crisisId] == false
require wasInvolvedInCrisis(msg.sender, crisisId)    // Donated, or is verified beneficiary, or is GO/NGO

if (isMisconduct) {
    misconductTally[crisisId].votesFor += 1
} else {
    misconductTally[crisisId].votesAgainst += 1
}

hasMisconductVoted[msg.sender][crisisId] = true
emit MisconductVoteCast(crisisId, msg.sender, isMisconduct)
```

---

### 8. `finalizeMisconductVote(uint256 crisisId)`

**Who can call:** Anyone (after misconduct voting period ends)

**What it does:**
- Counts the votes
- If misconduct votes > threshold (e.g., simple majority of participants), triggers slashing via ReputationEngine
- Transitions crisis to CLOSED phase
- Emits `MisconductVoteFinalized(crisisId, misconductConfirmed, votesFor, votesAgainst)`

```
Pseudocode:
─────────────────────────────────────
require crises[crisisId].phase == REVIEW
require block.timestamp > misconductTally[crisisId].voteEnd

uint256 totalVotes = misconductTally[crisisId].votesFor + misconductTally[crisisId].votesAgainst
bool misconductConfirmed = misconductTally[crisisId].votesFor > (totalVotes / 2)

if (misconductConfirmed) {
    // Trigger slashing in ReputationEngine
    ReputationEngine.recordMisconduct(crises[crisisId].coordinator, crisisId)
}

crises[crisisId].phase = CLOSED
emit MisconductVoteFinalized(crisisId, misconductConfirmed, misconductTally[crisisId].votesFor, misconductTally[crisisId].votesAgainst)
```

---

### 9. `closeCrisis(uint256 crisisId)`

**Who can call:** Operational Authority (Tier 1 — single signer, for crises that complete without misconduct)

**What it does:**
- If no misconduct was flagged, the Operational Authority can close the crisis after the coordinator signals completion
- Awards positive reputation to the coordinator via ReputationEngine
- Transitions to CLOSED phase

**Why Tier 1 is sufficient:** Closing a clean crisis is procedural — the coordinator has already finished distributing, no misconduct was flagged. The only effect is awarding positive reputation, which is the expected outcome of honest coordination.

```
Pseudocode:
─────────────────────────────────────
require msg.sender == operationalAuthority        // Tier 1: procedural action
require crises[crisisId].phase == ACTIVE
require crises[crisisId].misconductFlagged == false

ReputationEngine.recordSuccessfulCoordination(crises[crisisId].coordinator, crisisId)
crises[crisisId].phase = CLOSED
emit CrisisClosed(crisisId)
```

---

## Events

| Event | When Emitted | Why It Matters |
|-------|-------------|----------------|
| `CrisisDeclared(id, desc, severity)` | New crisis registered | Triggers donations and candidacy |
| `CandidateRegistered(crisisId, candidate)` | GO/NGO runs for coordinator | Public candidacy list |
| `VotingStarted(crisisId, start, end)` | Voting window opens | Frontend shows voting interface |
| `VoteCast(crisisId, voter, candidate)` | Vote recorded | Can be used for turnout tracking |
| `CoordinatorElected(crisisId, coordinator, votes)` | Winner declared | Coordinator takes control of funds |
| `MisconductVoteStarted(crisisId, start, end)` | Review phase begins | All participants can now evaluate |
| `MisconductVoteCast(crisisId, voter, isMisconduct)` | Misconduct vote recorded | Transparency |
| `MisconductVoteFinalized(crisisId, confirmed, for, against)` | Results in | Triggers slashing if confirmed |
| `CrisisClosed(crisisId)` | Crisis lifecycle complete | Archival |

---

## The GO Vote Compression — Detailed Rationale

This is one of OpenAID's most distinctive mechanisms, directly derived from the Eghatha analysis.

**The problem:** In Morocco, government bodies (Ministry of Interior, Civil Protection, etc.) can act as a coordinated bloc. If there are 3 GOs and 5 NGOs, and all 3 GOs vote for the same candidate, they represent 3/8 = 37.5% of organizational votes — enough to strongly influence outcomes, especially if NGO votes are split.

**The solution:** When all GOs vote unanimously, their collective vote collapses to 1. Now they represent 1/6 of organizational votes instead of 3/8. If GOs genuinely disagree and split their votes, each vote counts normally — because genuine disagreement signals independence.

**The math from the thesis:**
- With 3 GOs, 5 NGOs, and unanimous GO voting: Effective votes = 1 (compressed GO) + 5 (NGOs) = 6 total. GO influence = 16.7%
- Without compression: 3 + 5 = 8. GO influence = 37.5%

This doesn't eliminate GO participation — they still vote, still have a voice. It just prevents bloc behavior from dominating.

---

## Donation Cap Multipliers

The `getDonationMultiplier(role)` function returns:

| Role | Multiplier | If base cap = 100 FT |
|------|-----------|---------------------|
| Donor | 1× | 100 FT to vote |
| Private Company | 1× | 100 FT to vote |
| Beneficiary | 0× (exempt) | No donation needed |
| NGO | 10× | 1,000 FT to vote/run |
| GO | 15× | 1,500 FT to vote/run |

> **Why GOs pay the most:** Their institutional resources are the largest, and their participation should represent genuine commitment, not a token amount. The higher cap also means GOs have more "skin in the game" — their donated funds go to the escrow and are distributed to beneficiaries.

---

## Design Decisions and Trade-offs

### Why is crisis declaration gated by Tier 3 multisig (4-of-7)?

Crisis severity requires human judgment — a smart contract can't determine whether an earthquake killed 10 or 10,000 people. But the judgment shouldn't come from a single person. The Tier 3 multisig requires 4-of-7 signers across all three actor classes (GO, NGO, Community), ensuring that crisis declaration reflects genuine cross-stakeholder consensus rather than a single authority's decision. This is the most consequential action in the system — it triggers donations, elections, and fund distribution — so it gets the highest trust threshold.

### Why a fixed voting duration instead of quorum-based?

A quorum system ("wait until 50% have voted") is vulnerable to last-minute strategic manipulation and can stall if turnout is low. A fixed time window is predictable, simple, and ensures that the crisis response isn't delayed indefinitely by low voter turnout.

### What if no one runs as candidate?

This is an edge case the thesis acknowledges. If no GO or NGO registers as a candidate, the crisis stays in DECLARED phase. The Tier 3 multisig would need to intervene — potentially proposing a new crisis declaration with a lower donation cap, or the Tier 1 Operational Authority could extend the candidacy registration period. The contract does not allow direct appointment of a coordinator — that would bypass the democratic election mechanism.

### Why is the misconduct vote a simple majority?

A supermajority (e.g., 2/3) would make it too hard to hold coordinators accountable — especially if the coordinator has allies among voters. A simple majority (>50%) makes accountability achievable while still requiring broad agreement. The cost of a false misconduct conviction is mitigated by the graduated penalty system in the ReputationEngine — a first offense is a moderate hit, not career-ending.

---

## Testing Scenarios

| Scenario | Expected Result |
|----------|----------------|
| Tier 3 multisig declares crisis (4-of-7 approval) | New crisis created in DECLARED phase |
| Single address tries to declare crisis | Revert |
| Tier 3 with only 3-of-7 approval tries to declare crisis | Revert (needs 4-of-7) |
| Verified NGO registers as candidate | Success |
| Unverified NGO registers as candidate | Revert |
| Donor who hasn't met cap tries to vote | Revert |
| Verified beneficiary votes without donation | Success |
| All 3 GOs vote for same candidate | Their 3 votes compress to 1 |
| GOs split 2-1 across candidates | Each GO vote counts individually |
| Voting finalized, winner gets escrow | Coordinator balance increases |
| Tier 3 multisig initiates misconduct vote | Review phase begins |
| Tier 1 operator tries to initiate misconduct vote | Revert (requires Tier 3) |
| Misconduct vote passes majority | ReputationEngine.recordMisconduct called |
| Misconduct vote fails majority | Coordinator keeps reputation |
| Tier 1 operator closes crisis without misconduct | Coordinator gets positive reputation |
| Participant tries to vote twice | Revert |
| Vote cast after deadline | Revert |
