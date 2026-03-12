# Contract 4: ReputationEngine

## Purpose

The ReputationEngine is where **the thesis math lives on-chain**. It implements the dynamic validator scoring formula derived from the evolutionary game theory analysis, manages the active validator set, and interfaces with Besu's permissioning layer to add or remove validators based on their scores.

This is the contract that makes OpenAID +212 more than just another PoA blockchain — it's the mechanism that makes authority **earned, dynamic, and revocable**.

---

## Why This Contract Exists

Standard PoA has a fatal flaw: the validator set is static. Once you're in, you stay in. There's no built-in mechanism to punish bad behavior or reward good behavior. OpenAID +212 solves this by layering a **dynamic reputation system** on top of PoA, where:

- Every validator (GO and NGO) has a score that changes based on their behavior
- Scores are updated every epoch (a defined time period or after each crisis cycle)
- Validators whose scores drop below the threshold are removed from the active set
- GOs face a higher threshold than NGOs (the γ_GO modifier) to counteract structural capture risk

The ReputationEngine is the bridge between the **game theory layer** (which says cooperation should be the stable equilibrium) and the **implementation layer** (which enforces it through code).

---

## Dependencies

```
ReputationEngine ──reads──→  Registry           (who is a verified validator)
ReputationEngine ──reads──→  Governance          (crisis phase, participation records)
Governance       ──calls──→  ReputationEngine    (record misconduct, record success)
ReputationEngine ──calls──→  Besu Permissioning  (addValidator, removeValidator)
```

---

## The Scoring Formula

This is the core formula from the thesis, implemented on-chain:

```
R_i(n) = R_i(n-1) + k1(phase) × B_i + k2(phase) × C_i
```

Where:
- `R_i(n)` = Validator i's score at epoch n
- `R_i(n-1)` = Their previous score (carries forward)
- `k1` = Weight for historical/participation component (varies by crisis phase)
- `k2` = Weight for real-time behavioral component (varies by crisis phase)
- `B_i` = Participation quality score
- `C_i` = Behavioral quality score (rewards minus penalties)

---

## Breaking Down Each Component

### B_i — Participation Quality

```
B_i = w_role × [α × A_i + (1 - α) × V_i]
```

| Symbol | Meaning | Value |
|--------|---------|-------|
| `w_role` | Role weight. NGOs = 1.0, GOs = 0.85 (compressed) | Fixed per role |
| `α` | Balance between attendance and voting (e.g., 0.6) | Tunable parameter |
| `A_i` | Attendance ratio = rounds participated / rounds eligible | 0 to 1 |
| `V_i` | Voting activeness = 1 - e^(-β × votes_cast) | 0 to ~1 (saturates) |

**What A_i measures:** Did you show up when you were supposed to? If there were 10 consensus rounds and you participated in 8, your A_i = 0.8.

**What V_i measures:** How actively did you vote in governance? The exponential saturation means going from 0 to 5 votes is a big signal, but going from 50 to 55 doesn't add much — you're already clearly engaged. This prevents gaming by spam-voting.

**Why w_role is lower for GOs (0.85 vs 1.0):** This is the "GO compression" from the thesis. GOs inherently have institutional advantages (resources, infrastructure, staff). A slightly lower role weight means they need to work harder to achieve the same score as an NGO — encoding the structural capture concern directly into the mathematics.

---

### C_i — Behavioral Quality

```
C_i = R_reward - P_penalty
```

**The Reward Function (linear, slow growth):**

```
R_reward = r0 × w_role × [1 / (1 + β × ln(1 + n_timeout))] × 𝟙[on_time]
```

| Symbol | Meaning | Example Value |
|--------|---------|--------------|
| `r0` | Base reward per successful round | 10 points |
| `w_role` | Same role weight as above | 0.85 or 1.0 |
| `n_timeout` | Number of past timeouts | Counter |
| `𝟙[on_time]` | 1 if task completed on time, 0 if not | Binary |

In plain language: you earn steady rewards for doing your job, but a history of being late erodes your earning capacity. The logarithmic ceiling reducer means past irresponsibility permanently limits (but doesn't eliminate) your future gains.

**The Penalty Function (quadratic, fast growth):**

```
P_penalty = p0 × w_role × (1 + α_crisis × n_misconduct²)
```

| Symbol | Meaning | Example Value |
|--------|---------|--------------|
| `p0` | Base penalty per offense | 2 points |
| `α_crisis` | Crisis phase multiplier | 1.0 (normal), 2.5 (active crisis) |
| `n_misconduct` | Number of confirmed violations (cumulative) | Counter |

The quadratic growth is the key design choice. Here's what it looks like in practice:

**During normal operations (α_crisis = 1.0):**

| Offense # | Penalty | Cumulative |
|-----------|---------|------------|
| 1st | 2 × (1 + 1 × 1) = 4 | 4 |
| 2nd | 2 × (1 + 1 × 4) = 10 | 14 |
| 3rd | 2 × (1 + 1 × 9) = 20 | 34 |
| 4th | 2 × (1 + 1 × 16) = 34 | 68 |

**During active crisis (α_crisis = 2.5):**

| Offense # | Penalty | Cumulative |
|-----------|---------|------------|
| 1st | 2 × (1 + 2.5 × 1) = 7 | 7 |
| 2nd | 2 × (1 + 2.5 × 4) = 22 | 29 |
| 3rd | 2 × (1 + 2.5 × 9) = 47 | 76 |

**The asymmetry is the point.** A validator earns maybe +10 points per round for honest behavior. But a 3rd offense during a crisis costs 47 points — nearly 5 clean rounds of work wiped out. This exploits the behavioral economics insight that people feel losses more acutely than gains, making defection irrational.

---

### Phase-Based Parameter Shifting

The k1/k2 weights change depending on the current crisis phase:

| Phase | k1 (history weight) | k2 (real-time weight) | α_crisis (penalty multiplier) |
|-------|--------------------|-----------------------|-------------------------------|
| Pre-crisis / Preparedness | 0.7 | 0.3 | 1.0 |
| Active crisis | 0.4 | 0.6 | 2.5 |
| Recovery | 0.65 | 0.35 | 1.5 |

**Why the shift matters:**
- During a **live disaster**, what you did six months ago matters less than whether you're delivering aid *right now*. Real-time behavior (k2) dominates.
- During **preparedness**, you want to reward validators who've built sustained credibility. History (k1) dominates.
- During **recovery**, you gradually restore the balance.

---

### The Eligibility Threshold

A validator remains in the active set only if their score exceeds the dynamic average:

```
For NGOs:    R_i(n) ≥ R̄(n)
For GOs:     R_i(n) ≥ R̄(n) × γ_GO     where γ_GO = 1.2
```

Where `R̄(n)` is the mean score of all registered validators at epoch n.

**Why γ_GO = 1.2:** GOs need to be 20% above average to stay active. This is the eligibility counterpart to the role weight compression — it encodes the principle that government validators should be held to a higher standard because they carry greater structural power and capture risk.

**Why a dynamic average instead of a fixed minimum:**
- No fixed floor to game — you can't just maintain exactly 100 points forever
- As the network improves, the bar rises
- As bad actors are penalized and drop the average, recovering validators get a path back

---

## Data Structures

### Validator Score Record

```
ValidatorScore {
    address     validator
    uint256     currentScore        // R_i(n)
    uint256     previousScore       // R_i(n-1)
    uint256     totalRoundsEligible // How many rounds they could have participated
    uint256     roundsParticipated  // How many they actually did
    uint256     votesCast           // Total governance votes cast
    uint256     timeoutCount        // Number of past timeouts
    uint256     misconductCount     // Number of confirmed misconduct events
    uint256     lastUpdatedEpoch    // When this score was last recalculated
    bool        isActive            // Currently in the active validator set?
}
```

### Phase Configuration

```
PhaseConfig {
    uint256     k1                  // History weight (scaled by 100 for integer math, e.g., 70 = 0.7)
    uint256     k2                  // Real-time weight
    uint256     alphaCrisis         // Penalty multiplier (scaled by 100)
}
```

### Constants

```
uint256 constant INITIAL_SCORE = 100        // Starting score for GOs and NGOs
uint256 constant R0 = 10                    // Base reward per round
uint256 constant P0 = 2                     // Base penalty per offense
uint256 constant ALPHA = 60                 // Balance: 60% attendance, 40% voting (scaled by 100)
uint256 constant BETA = 50                  // Voting saturation rate (scaled by 100)
uint256 constant W_ROLE_NGO = 100           // 1.0 (scaled by 100)
uint256 constant W_ROLE_GO = 85             // 0.85 (scaled by 100)
uint256 constant GAMMA_GO = 120             // 1.2 (scaled by 100)
```

> **Integer Math Note:** Solidity doesn't support floating point. All decimal values are scaled by 100 (or 1000 for more precision). The contract performs all calculations in integers and scales down at the end. This is standard practice for on-chain math.

---

## Functions

### 1. `initializeValidator(address validator)`

**Who can call:** Registry contract (when a GO is registered or an NGO is verified)

**What it does:**
- Creates a ValidatorScore record with INITIAL_SCORE (100)
- Calls Besu's permissioning contract to add this address as a validator
- Emits `ValidatorInitialized(validator, INITIAL_SCORE)`

```
Pseudocode:
─────────────────────────────────────
require msg.sender == registryContract
require Registry.isVerifiedValidator(validator)

scores[validator] = ValidatorScore(validator, INITIAL_SCORE, INITIAL_SCORE, 0, 0, 0, 0, 0, currentEpoch, true)
BesuPermissioning.addValidator(validator)
emit ValidatorInitialized(validator, INITIAL_SCORE)
```

---

### 2. `updateScores()`

**Who can call:** Anyone (typically called at the end of each epoch, can be automated)

**What it does:**
- Iterates over all registered validators
- Recalculates each validator's score using the full formula
- Checks eligibility against the dynamic threshold
- Adds/removes validators from Besu's active set based on eligibility
- Emits `ScoresUpdated(epoch)` and individual `ValidatorScoreChanged(validator, oldScore, newScore)`

```
Pseudocode:
─────────────────────────────────────
PhaseConfig config = getCurrentPhaseConfig()

// Step 1: Calculate new scores
for each validator in registeredValidators:
    B_i = calculateParticipation(validator)
    C_i = calculateBehavior(validator, config.alphaCrisis)
    newScore = scores[validator].currentScore + (config.k1 * B_i + config.k2 * C_i) / 100

    scores[validator].previousScore = scores[validator].currentScore
    scores[validator].currentScore = newScore

// Step 2: Calculate average
uint256 avgScore = sum(all scores) / validatorCount

// Step 3: Check eligibility
for each validator in registeredValidators:
    Role role = Registry.getParticipant(validator).role
    uint256 threshold = (role == GO) ? (avgScore * GAMMA_GO / 100) : avgScore

    if scores[validator].currentScore >= threshold:
        if !scores[validator].isActive:
            BesuPermissioning.addValidator(validator)
            scores[validator].isActive = true
            emit ValidatorActivated(validator)
    else:
        if scores[validator].isActive:
            BesuPermissioning.removeValidator(validator)
            scores[validator].isActive = false
            emit ValidatorDeactivated(validator, scores[validator].currentScore, threshold)

scores[validator].lastUpdatedEpoch = currentEpoch
emit ScoresUpdated(currentEpoch)
```

> **Gas Concern:** Iterating over all validators is O(n). For a system with 10-20 validators (realistic for the Moroccan humanitarian context), this is negligible. For a larger deployment, this could be batched or moved to a Layer 2 computation with on-chain verification.

---

### 3. `recordMisconduct(address validator, uint256 crisisId)`

**Who can call:** Governance contract only (after a misconduct vote passes)

**What it does:**
- Increments the validator's misconduct count
- Applies the quadratic penalty immediately
- If the penalty drops the score below threshold, removes from active set
- Emits `MisconductRecorded(validator, crisisId, penaltyAmount, newScore)`

```
Pseudocode:
─────────────────────────────────────
require msg.sender == governanceContract

scores[validator].misconductCount += 1
uint256 n = scores[validator].misconductCount
PhaseConfig config = getCurrentPhaseConfig()

uint256 penalty = P0 * getWRole(validator) * (100 + config.alphaCrisis * n * n) / (100 * 100)
scores[validator].currentScore = safeSub(scores[validator].currentScore, penalty)  // Floor at 0

// Immediate eligibility check
uint256 avgScore = calculateAverageScore()
uint256 threshold = getThreshold(validator, avgScore)
if scores[validator].currentScore < threshold && scores[validator].isActive:
    BesuPermissioning.removeValidator(validator)
    scores[validator].isActive = false
    emit ValidatorDeactivated(validator, scores[validator].currentScore, threshold)

emit MisconductRecorded(validator, crisisId, penalty, scores[validator].currentScore)
```

---

### 4. `recordSuccessfulCoordination(address validator, uint256 crisisId)`

**Who can call:** Governance contract only (when a crisis is closed without misconduct)

**What it does:**
- Awards the reward to the validator's score
- Adjusted by their timeout history (past irresponsibility limits future gains)
- Emits `SuccessfulCoordination(validator, crisisId, rewardAmount, newScore)`

```
Pseudocode:
─────────────────────────────────────
require msg.sender == governanceContract

uint256 timeouts = scores[validator].timeoutCount
uint256 ceilingReducer = 100 / (100 + BETA * ln(1 + timeouts))  // Scaled integer math
uint256 reward = R0 * getWRole(validator) * ceilingReducer / (100 * 100)

scores[validator].currentScore += reward
emit SuccessfulCoordination(validator, crisisId, reward, scores[validator].currentScore)
```

---

### 5. `recordParticipation(address validator, bool participated)`

**Who can call:** Internal or triggered by consensus round completion

**What it does:**
- Updates the rounds eligible and rounds participated counters
- Called each consensus round to track whether the validator was active

```
Pseudocode:
─────────────────────────────────────
scores[validator].totalRoundsEligible += 1
if participated:
    scores[validator].roundsParticipated += 1
else:
    scores[validator].timeoutCount += 1
```

---

### 6. `recordVoteCast(address validator)`

**Who can call:** Governance contract (when a validator casts any governance vote)

**What it does:** Increments the votes cast counter for the voting activeness component.

---

### 7. `getValidatorScore(address validator) → ValidatorScore`

**Who can call:** Anyone (view function)

**What it does:** Returns the full score record for a validator. Transparency — anyone can see any validator's score, history, and standing.

---

### 8. `getActiveValidators() → address[]`

**Who can call:** Anyone (view function)

**What it does:** Returns the list of currently active validators. This should match Besu's actual validator set.

---

### 9. `getAverageScore() → uint256`

**Who can call:** Anyone (view function)

**What it does:** Returns the current average score across all registered validators. Useful for understanding the eligibility threshold.

---

### 10. `setPhaseConfig(Phase phase, uint256 k1, uint256 k2, uint256 alphaCrisis)`

**Who can call:** Crisis Declaration Multisig (Tier 3 — requires 4-of-7 approval)

**What it does:** Updates the phase configuration parameters. This allows tuning the system without redeployment.

**Why Tier 3:** Phase parameters directly control how harshly misconduct is punished (α_crisis) and how much historical vs. real-time behavior matters (k1/k2). Malicious parameter changes could effectively disable slashing (set α_crisis to 0) or make the eligibility threshold meaningless. These are system-critical parameters that require the same level of consensus as crisis declaration.

---

## Events

| Event | When Emitted | Why It Matters |
|-------|-------------|----------------|
| `ValidatorInitialized(addr, score)` | New validator joins | Track validator set growth |
| `ScoresUpdated(epoch)` | Epoch-end score recalculation | Audit trail for scoring |
| `ValidatorScoreChanged(addr, old, new)` | Score changes | Per-validator tracking |
| `ValidatorActivated(addr)` | Validator enters active set | Besu permissioning updated |
| `ValidatorDeactivated(addr, score, threshold)` | Validator removed from active set | Critical accountability event |
| `MisconductRecorded(addr, crisisId, penalty, newScore)` | Misconduct confirmed | Slashing transparency |
| `SuccessfulCoordination(addr, crisisId, reward, newScore)` | Good performance recorded | Positive incentive visible |

---

## Besu Permissioning Integration

This is where the ReputationEngine connects to the actual blockchain consensus layer.

Besu provides a **permissioning smart contract interface** that controls which nodes can act as validators. The key functions are:

```
// Besu's permissioning contract interface
interface NodePermissioning {
    function addValidator(address validator) external;
    function removeValidator(address validator) external;
    function getValidators() external view returns (address[] memory);
}
```

The ReputationEngine is the **only contract** authorized to call these functions. This ensures that:
- Validators cannot add each other directly (no mutual protection)
- Validators cannot remove competitors (no political purges)
- Only the scoring system — driven by collective democratic input via Governance — determines who validates

This is the architectural enforcement of the thesis claim: *"OpenAID transfers add/remove validator power from the validators themselves to the collective social layer."*

---

## The Connection to Game Theory

This is the thesis's core contribution. The formula isn't arbitrary — each parameter maps to a condition from the EGT analysis:

| EGT Condition | What It Says | How the Formula Enforces It |
|---------------|-------------|----------------------------|
| B_G - C_G + λP > 0 | GOs benefit from oversight | GO role weight (0.85) + higher threshold (γ_GO = 1.2) makes participation necessary |
| μT + κR_history > ε | Long-term reputation + slashing > cheating gain | Quadratic penalty (n²) makes repeated cheating catastrophically expensive |
| V_C - C_verify + ω > 0 | Community verification is net positive | Beneficiary confirmation feeds into misconduct detection |
| κ > C_verify / p_pivotal | Slashing must exceed verification cost | P0 and α_crisis calibrated to satisfy this |

The claim: *OpenAID is the first humanitarian blockchain consensus mechanism whose incentive parameters are derived from and provably aligned with the evolutionarily stable strategy conditions of a formally specified multi-actor emergency response game.*

---

## Design Decisions and Trade-offs

### Why on-chain scoring instead of off-chain computation?

Transparency and verifiability. If scores were computed off-chain, validators could dispute the results. On-chain computation means anyone can verify any score by reading the contract state. The gas cost is acceptable because score updates happen per-epoch (not per-transaction) and the validator set is small.

### Why quadratic penalties instead of linear or exponential?

Linear penalties are too lenient — a repeat offender pays the same cost each time. Exponential would be too harsh — a second offense would essentially be permanent exclusion, leaving no path to redemption. Quadratic is the middle ground: first offense is recoverable, second is painful, third is nearly fatal, and fourth is effectively permanent exclusion. This matches the behavioral economics literature on optimal deterrence.

### Why not use VRF for validator selection?

VRF (Verifiable Random Function) adds cryptographic randomness to leader selection, which prevents prediction-based attacks. Wang et al.'s RVR paper uses this. For OpenAID, the validator set is small enough (10-20) that deterministic round-robin with reputation-weighted probability is sufficient and simpler to implement. VRF is noted as a future enhancement.

### What happens if all validators drop below threshold?

Safety mechanism: the system maintains a minimum of 4 active validators (the QBFT minimum). If the threshold would exclude everyone, the top 4 by score remain active regardless. This prevents a total network halt.

### Can a slashed validator recover?

Yes, but slowly. The quadratic penalty means a 3rd offense costs ~20 points. At +10 points per clean round, that's 2 clean rounds minimum just to offset the penalty. Plus the timeout history limits reward capacity via the ceiling reducer. Recovery is possible but requires sustained good behavior — which is exactly the design intent.

---

## Gas Considerations

- `updateScores()` is the most expensive function — it iterates all validators. With n=20 validators, this is ~20 × (read + compute + write) = manageable
- `recordMisconduct` and `recordSuccessfulCoordination` are infrequent (once per crisis per coordinator)
- View functions are free
- Integer math with scaling avoids the need for external math libraries
- All mappings are O(1) lookup

---

## Testing Scenarios

| Scenario | Expected Result |
|----------|----------------|
| New validator initialized | Score = 100, added to Besu validator set |
| Validator participates in all rounds | A_i = 1.0, B_i maximized |
| Validator misses half the rounds | A_i = 0.5, B_i reduced |
| First misconduct | Moderate penalty, score drops but stays above threshold |
| Third misconduct during active crisis | Severe penalty (47 points), likely drops below threshold |
| Validator drops below threshold | Removed from Besu validator set |
| GO with score exactly at average | Fails threshold (needs 1.2× average), gets deactivated |
| NGO with score exactly at average | Passes threshold, stays active |
| All validators drop below threshold | Top 4 remain active (safety mechanism) |
| Validator recovers after penalty | Score climbs back above threshold, re-added to Besu |
| Phase changes from preparedness to active crisis | k2 increases, α_crisis jumps to 2.5 |
| Score update with no behavior changes | Score remains the same (B_i and C_i are 0 delta) |
