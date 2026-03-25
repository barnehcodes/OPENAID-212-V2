// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IRegistry.sol";
import "./interfaces/IReputationEngine.sol";
import "./interfaces/IBesuPermissioning.sol";

/// @title ReputationEngine — Dynamic validator scoring for OpenAID +212
/// @author OpenAID +212 Project
/// @notice Implements the thesis scoring formula derived from evolutionary game theory.
///         Manages validator reputation scores, applies quadratic penalties for misconduct,
///         linear rewards for honest coordination, and interfaces with Besu's permissioning
///         layer to add/remove validators based on their scores.
///
/// @dev Scoring formula: R_i(n) = R_i(n-1) + k1 × B_i + k2 × C_i
///
///      B_i (Participation Quality):
///        B_i = w_role × [α × A_i + (1 - α) × V_i]
///        A_i = roundsParticipated / totalRoundsEligible
///        V_i ≈ β×votes / (SCALE + β×votes)  (integer approximation of 1 - e^(-β×votes))
///
///      C_i (Behavioral Quality) — applied immediately via recordMisconduct / recordSuccess:
///        Reward = R0 × w_role × ceilingReducer × (k2 / SCALE)
///        Penalty = P0 × w_role × (1 + α_crisis × n_misconduct²) × (k2 / SCALE)
///
///      Eligibility:
///        NGOs:  score ≥ averageScore
///        GOs:   score ≥ averageScore × γ_GO  (γ_GO = 1.2, higher bar for government actors)
///
///      Safety: minimum of MIN_VALIDATORS (4) always remain active (QBFT requirement).
///
///      All math uses integer arithmetic scaled by 100. No floating point.
///
///      Deployment order:
///        1. Deploy Registry
///        2. Deploy DonationManager(registry, address(0))
///        3. Deploy Governance(registry, donationManager, address(0))
///        4. Call donationManager.setGovernanceContract(governance)
///        5. Deploy ReputationEngine(registry, governance, besuPermissioning)
///        6. Call governance.setReputationEngine(reputationEngine)
contract ReputationEngine is IReputationEngine {
    // ─────────────────────────────────────────────────────────────────────────
    // Constants — from the thesis EGT analysis
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Scale factor for integer arithmetic (100 = two decimal places).
    uint256 public constant SCALE = 100;

    /// @notice Starting reputation score for all validators.
    uint256 public constant INITIAL_SCORE = 100;

    /// @notice Base reward per successful coordination round.
    uint256 public constant R0 = 10;

    /// @notice Base penalty per confirmed misconduct event.
    uint256 public constant P0 = 2;

    /// @notice Balance between attendance (60%) and voting (40%) in B_i.
    uint256 public constant ALPHA = 60;

    /// @notice Voting saturation rate / timeout decay rate.
    uint256 public constant BETA = 50;

    /// @notice NGO role weight (1.0 scaled by 100).
    uint256 public constant W_ROLE_NGO = 100;

    /// @notice GO role weight (0.85 scaled by 100) — compressed to counteract capture risk.
    uint256 public constant W_ROLE_GO = 85;

    /// @notice GO eligibility threshold multiplier (1.2 scaled by 100).
    ///         GOs must score 20% above average to remain active validators.
    uint256 public constant GAMMA_GO = 120;

    /// @notice Minimum active validators (QBFT consensus requirement).
    uint256 public constant MIN_VALIDATORS = 4;

    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice System-wide operational phase. Affects scoring weights and penalty multipliers.
    enum SystemPhase { PREPAREDNESS, ACTIVE_CRISIS, RECOVERY }

    /// @notice Phase-dependent parameters for the scoring formula.
    struct PhaseConfig {
        uint256 k1;          // History/participation weight (scaled by 100, e.g. 70 = 0.7)
        uint256 k2;          // Real-time behavioral weight (scaled by 100)
        uint256 alphaCrisis; // Penalty multiplier (scaled by 100, e.g. 250 = 2.5)
    }

    /// @notice On-chain reputation record for a single validator.
    struct ValidatorScore {
        address validator;
        uint256 currentScore;
        uint256 previousScore;
        uint256 totalRoundsEligible;
        uint256 roundsParticipated;
        uint256 votesCast;
        uint256 timeoutCount;
        uint256 misconductCount;
        uint256 lastUpdatedEpoch;
        bool    isActive;
        bool    exists;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Source of truth for participant identity and verification status.
    IRegistry public immutable registry;

    /// @notice The Governance contract — the only caller for recordMisconduct/recordSuccess.
    address public governanceContract;

    /// @notice Besu validator permissioning contract (mock for thesis prototype).
    IBesuPermissioning public immutable besuPermissioning;

    /// @notice Current system-wide operational phase.
    SystemPhase public currentPhase;

    /// @notice Auto-incrementing epoch counter. First epoch is 1.
    uint256 public currentEpoch;

    /// @notice Validator score records indexed by address.
    mapping(address => ValidatorScore) private _scores;

    /// @notice Ordered list of all registered validators (for iteration in updateScores).
    address[] private _validators;

    /// @notice Phase-dependent scoring parameters.
    mapping(SystemPhase => PhaseConfig) private _phaseConfigs;

    /// @notice Tracks the last epoch for which updateScores was called.
    ///         Prevents repeated calls within the same epoch (score inflation attack).
    uint256 private _lastUpdatedEpoch;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event ValidatorInitialized(address indexed validator, uint256 score);
    event ScoresUpdated(uint256 indexed epoch);
    event ValidatorScoreChanged(address indexed validator, uint256 oldScore, uint256 newScore);
    event ValidatorActivated(address indexed validator);
    event ValidatorDeactivated(address indexed validator, uint256 score, uint256 threshold);
    event MisconductRecorded(address indexed validator, uint256 indexed crisisId, uint256 penalty, uint256 newScore);
    event SuccessfulCoordination(address indexed validator, uint256 indexed crisisId, uint256 reward, uint256 newScore);
    event ParticipationRecorded(address indexed validator, bool participated);
    event VoteCastRecorded(address indexed validator);
    event SystemPhaseChanged(SystemPhase indexed oldPhase, SystemPhase indexed newPhase);
    event PhaseConfigUpdated(SystemPhase indexed phase, uint256 k1, uint256 k2, uint256 alphaCrisis);
    event GovernanceContractSet(address indexed governance);

    // ─────────────────────────────────────────────────────────────────────────
    // Custom errors
    // ─────────────────────────────────────────────────────────────────────────

    error ZeroAddress();
    error NotGovernance(address caller);
    error NotOperationalAuthority(address caller);
    error NotCrisisDeclarationAuthority(address caller);
    error ValidatorAlreadyInitialized(address validator);
    error ValidatorNotInitialized(address validator);
    error NotVerifiedValidator(address validator);
    error InvalidPhaseConfig(uint256 k1, uint256 k2);
    error EpochAlreadyUpdated(uint256 epoch);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Deploy the ReputationEngine.
    /// @param _registry          Address of the deployed Registry contract.
    /// @param _governance        Governance contract address (can be address(0) if not yet deployed).
    /// @param _besuPermissioning Besu permissioning contract (or mock). Can be address(0) for testing.
    constructor(
        address _registry,
        address _governance,
        address _besuPermissioning
    ) {
        if (_registry == address(0)) revert ZeroAddress();

        registry = IRegistry(_registry);

        if (_governance != address(0)) {
            governanceContract = _governance;
            emit GovernanceContractSet(_governance);
        }

        // Always assign (immutable requires unconditional assignment).
        // address(0) is safe — all call sites guard with address(besuPermissioning) != address(0).
        besuPermissioning = IBesuPermissioning(_besuPermissioning);

        // Default phase configs from the thesis EGT analysis
        _phaseConfigs[SystemPhase.PREPAREDNESS]  = PhaseConfig(70, 30, 100);
        _phaseConfigs[SystemPhase.ACTIVE_CRISIS] = PhaseConfig(40, 60, 250);
        _phaseConfigs[SystemPhase.RECOVERY]      = PhaseConfig(65, 35, 150);

        currentPhase = SystemPhase.PREPAREDNESS;
        currentEpoch = 1;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Configuration — privileged callers only
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Set or update the Governance contract address.
    /// @dev    Gated by Tier-3 Crisis Declaration Multisig.
    /// @param _governance  Address of the deployed Governance contract.
    function setGovernanceContract(address _governance) external {
        if (msg.sender != registry.crisisDeclarationMultisig()) {
            revert NotCrisisDeclarationAuthority(msg.sender);
        }
        if (_governance == address(0)) revert ZeroAddress();

        governanceContract = _governance;
        emit GovernanceContractSet(_governance);
    }

    /// @notice Transition the system to a new operational phase.
    /// @dev    Gated by Tier-1 Operational Authority. Affects scoring weights and
    ///         penalty multipliers for all subsequent score calculations.
    /// @param newPhase  The new system-wide phase.
    function setSystemPhase(SystemPhase newPhase) external {
        if (msg.sender != registry.operationalAuthority()) {
            revert NotOperationalAuthority(msg.sender);
        }

        SystemPhase oldPhase = currentPhase;
        currentPhase = newPhase;
        emit SystemPhaseChanged(oldPhase, newPhase);
    }

    /// @notice Update the scoring parameters for a specific phase.
    /// @dev    Gated by Tier-3 Crisis Declaration Multisig because these parameters
    ///         directly control slashing severity and eligibility thresholds.
    ///         k1 + k2 must equal SCALE (100) to maintain the weighting invariant.
    /// @param phase       The phase whose config is being updated.
    /// @param k1          History/participation weight (0–100).
    /// @param k2          Real-time behavioral weight (0–100).
    /// @param alphaCrisis Penalty multiplier (scaled by 100).
    function setPhaseConfig(
        SystemPhase phase,
        uint256 k1,
        uint256 k2,
        uint256 alphaCrisis
    ) external {
        if (msg.sender != registry.crisisDeclarationMultisig()) {
            revert NotCrisisDeclarationAuthority(msg.sender);
        }
        if (k1 + k2 != SCALE) revert InvalidPhaseConfig(k1, k2);

        _phaseConfigs[phase] = PhaseConfig(k1, k2, alphaCrisis);
        emit PhaseConfigUpdated(phase, k1, k2, alphaCrisis);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Validator initialization — permissionless (Registry-verified)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Initialize a validator's reputation record.
    /// @dev    Can be called by anyone, but the validator must be a verified GO or NGO
    ///         in the Registry. Creates a score record at INITIAL_SCORE and adds the
    ///         validator to Besu's active set via the permissioning contract.
    /// @param validator  Address of the verified GO or NGO to initialize.
    function initializeValidator(address validator) external {
        if (!registry.isVerifiedValidator(validator)) {
            revert NotVerifiedValidator(validator);
        }
        if (_scores[validator].exists) {
            revert ValidatorAlreadyInitialized(validator);
        }

        _scores[validator] = ValidatorScore({
            validator:           validator,
            currentScore:        INITIAL_SCORE,
            previousScore:       INITIAL_SCORE,
            totalRoundsEligible: 0,
            roundsParticipated:  0,
            votesCast:           0,
            timeoutCount:        0,
            misconductCount:     0,
            lastUpdatedEpoch:    currentEpoch,
            isActive:            true,
            exists:              true
        });

        _validators.push(validator);

        // Emit before external call (checks-effects-interactions)
        emit ValidatorInitialized(validator, INITIAL_SCORE);

        // Register with Besu's consensus layer
        if (address(besuPermissioning) != address(0)) {
            besuPermissioning.addValidator(validator);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // IReputationEngine — called by Governance contract
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IReputationEngine
    /// @dev Applies the quadratic penalty formula immediately:
    ///        P_penalty = P0 × w_role × (1 + α_crisis × n²)
    ///      where n = cumulative misconduct count (after increment).
    ///
    ///      The quadratic growth is the key deterrent: 1st offense = recoverable,
    ///      2nd = painful, 3rd = nearly fatal, 4th = effectively permanent exclusion.
    ///
    ///      Performs an immediate eligibility check — if the penalty drops the score
    ///      below the dynamic threshold, the validator is removed from the active set.
    function recordMisconduct(address validator, uint256 crisisId) external override {
        if (msg.sender != governanceContract) revert NotGovernance(msg.sender);
        if (!_scores[validator].exists) revert ValidatorNotInitialized(validator);

        ValidatorScore storage score = _scores[validator];
        score.misconductCount += 1;

        uint256 n     = score.misconductCount;
        uint256 wRole = _getWRole(validator);
        PhaseConfig memory config = _phaseConfigs[currentPhase];

        // P_penalty = P0 × w_role × (1 + α_crisis × n²)
        // Scaled:    P0 * wRole * (SCALE + alphaCrisis * n * n) / (SCALE * SCALE)
        uint256 penalty = P0 * wRole * (SCALE + config.alphaCrisis * n * n) / (SCALE * SCALE);

        // Apply phase-dependent k2 weighting to behavioral scoring
        penalty = penalty * config.k2 / SCALE;

        // Floor score at 0
        if (penalty >= score.currentScore) {
            score.currentScore = 0;
        } else {
            score.currentScore -= penalty;
        }

        // Emit before any external calls (checks-effects-interactions)
        emit MisconductRecorded(validator, crisisId, penalty, score.currentScore);

        // Immediate eligibility check
        if (score.isActive) {
            uint256 avgScore  = _calculateAverageScore();
            uint256 threshold = _getThreshold(validator, avgScore);
            uint256 activeCount = _countActiveValidators();

            if (score.currentScore < threshold && activeCount > MIN_VALIDATORS) {
                score.isActive = false;
                emit ValidatorDeactivated(validator, score.currentScore, threshold);
                if (address(besuPermissioning) != address(0)) {
                    besuPermissioning.removeValidator(validator);
                }
            }
        }
    }

    /// @inheritdoc IReputationEngine
    /// @dev Awards the linear reward, dampened by the validator's timeout history:
    ///        R_reward = R0 × w_role × [1 / (1 + β × ln(1 + n_timeout))]
    ///
    ///      The logarithmic ceiling reducer means past irresponsibility permanently
    ///      limits (but doesn't eliminate) future earning capacity.
    function recordSuccessfulCoordination(address validator, uint256 crisisId) external override {
        if (msg.sender != governanceContract) revert NotGovernance(msg.sender);
        if (!_scores[validator].exists) revert ValidatorNotInitialized(validator);

        ValidatorScore storage score = _scores[validator];
        uint256 wRole          = _getWRole(validator);
        uint256 ceilingReducer = _calculateCeilingReducer(score.timeoutCount);

        // R_reward = R0 × w_role × ceilingReducer
        // Scaled:   R0 * wRole * ceilingReducer / (SCALE * SCALE)
        uint256 reward = R0 * wRole * ceilingReducer / (SCALE * SCALE);

        // Apply phase-dependent k2 weighting to behavioral scoring
        PhaseConfig memory config = _phaseConfigs[currentPhase];
        reward = reward * config.k2 / SCALE;

        score.currentScore += reward;

        emit SuccessfulCoordination(validator, crisisId, reward, score.currentScore);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Participation tracking — Tier-1 Operational Authority
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Record whether a validator participated in a consensus round.
    /// @dev    Gated by the Tier-1 Operational Authority. Updates the counters used
    ///         to compute A_i (attendance ratio) in the B_i participation formula.
    ///         Non-participation also increments the timeout counter, which reduces
    ///         future reward capacity via the ceiling reducer.
    /// @param validator    The validator whose participation is being recorded.
    /// @param participated True if the validator participated in the round.
    function recordParticipation(address validator, bool participated) external {
        if (msg.sender != registry.operationalAuthority()) {
            revert NotOperationalAuthority(msg.sender);
        }
        if (!_scores[validator].exists) revert ValidatorNotInitialized(validator);

        ValidatorScore storage score = _scores[validator];
        score.totalRoundsEligible += 1;

        if (participated) {
            score.roundsParticipated += 1;
        } else {
            score.timeoutCount += 1;
        }

        emit ParticipationRecorded(validator, participated);
    }

    /// @notice Record that a validator cast a governance vote.
    /// @dev    Gated by the Governance contract. Increments the vote counter used
    ///         to compute V_i (voting activeness) in the B_i participation formula.
    /// @param validator  The validator who cast a vote.
    function recordVoteCast(address validator) external {
        if (msg.sender != governanceContract) revert NotGovernance(msg.sender);
        if (!_scores[validator].exists) revert ValidatorNotInitialized(validator);

        _scores[validator].votesCast += 1;
        emit VoteCastRecorded(validator);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Epoch update — permissionless
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Recalculate all validator scores and update eligibility.
    /// @dev    Callable by anyone (typically automated at epoch boundaries).
    ///
    ///         Step 1: For each validator, compute B_i (participation quality) and
    ///                 add k1 × B_i / SCALE to their score.
    ///         Step 2: Compute the dynamic average score across all validators.
    ///         Step 3: Check each validator against the role-adjusted threshold.
    ///                 Activate/deactivate accordingly, respecting MIN_VALIDATORS safety.
    ///
    ///         Gas: O(n) where n = number of registered validators. Acceptable for
    ///         the expected 10–20 validators in the Moroccan humanitarian context.
    // slither-disable-next-line reentrancy-no-eth,calls-loop,reentrancy-events
    function updateScores() external {
        uint256 epoch = currentEpoch;
        if (_lastUpdatedEpoch == epoch) revert EpochAlreadyUpdated(epoch);

        // Set epoch guard BEFORE external calls to prevent reentrancy
        _lastUpdatedEpoch = epoch;

        PhaseConfig memory config = _phaseConfigs[currentPhase];
        uint256 validatorCount    = _validators.length;

        // ── Step 1: Recalculate scores ──────────────────────────────────────
        for (uint256 i = 0; i < validatorCount; i++) {
            address v = _validators[i];
            ValidatorScore storage score = _scores[v];

            uint256 oldScore = score.currentScore;
            uint256 bi       = _calculateParticipation(v);

            // Apply participation component: k1 × B_i / SCALE
            score.previousScore    = oldScore;
            score.currentScore     = oldScore + config.k1 * bi / SCALE;
            score.lastUpdatedEpoch = currentEpoch;

            if (score.currentScore != oldScore) {
                emit ValidatorScoreChanged(v, oldScore, score.currentScore);
            }
        }

        // ── Step 2: Calculate average ──────────────────────────────────────
        uint256 avgScore    = _calculateAverageScore();
        uint256 activeCount = _countActiveValidators();

        // ── Step 3: Check eligibility ──────────────────────────────────────
        for (uint256 i = 0; i < validatorCount; i++) {
            address v = _validators[i];
            ValidatorScore storage score = _scores[v];
            uint256 threshold = _getThreshold(v, avgScore);

            if (score.currentScore >= threshold) {
                if (!score.isActive) {
                    score.isActive = true;
                    activeCount++;
                    // Emit before external call (checks-effects-interactions)
                    emit ValidatorActivated(v);
                    if (address(besuPermissioning) != address(0)) {
                        besuPermissioning.addValidator(v);
                    }
                }
            } else {
                // Deactivate only if we won't drop below the safety minimum
                if (score.isActive && activeCount > MIN_VALIDATORS) {
                    score.isActive = false;
                    activeCount--;
                    // Emit before external call (checks-effects-interactions)
                    emit ValidatorDeactivated(v, score.currentScore, threshold);
                    if (address(besuPermissioning) != address(0)) {
                        besuPermissioning.removeValidator(v);
                    }
                }
            }
        }

        emit ScoresUpdated(epoch);
        currentEpoch = epoch + 1;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View functions — anyone can inspect validator scores (transparency)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Return the full reputation record for a validator.
    /// @param validator  The validator address to query.
    /// @return           The complete ValidatorScore struct.
    function getValidatorScore(address validator) external view returns (ValidatorScore memory) {
        return _scores[validator];
    }

    /// @notice Return the list of currently active validators.
    /// @return  Array of active validator addresses.
    function getActiveValidators() external view returns (address[] memory) {
        uint256 len = _validators.length;
        uint256 count = 0;
        for (uint256 i = 0; i < len; i++) {
            if (_scores[_validators[i]].isActive) count++;
        }

        address[] memory active = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < len; i++) {
            if (_scores[_validators[i]].isActive) {
                active[idx++] = _validators[i];
            }
        }
        return active;
    }

    /// @notice Return the current average score across all registered validators.
    /// @return  The mean score (used as the base eligibility threshold).
    function getAverageScore() external view returns (uint256) {
        return _calculateAverageScore();
    }

    /// @notice Return the scoring parameters for a specific phase.
    /// @param phase  The system phase to query.
    /// @return       The PhaseConfig struct (k1, k2, alphaCrisis).
    function getPhaseConfig(SystemPhase phase) external view returns (PhaseConfig memory) {
        return _phaseConfigs[phase];
    }

    /// @notice Return the total number of registered validators (active + inactive).
    function getValidatorCount() external view returns (uint256) {
        return _validators.length;
    }

    /// @notice Return the list of all registered validators (active + inactive).
    function getAllValidators() external view returns (address[] memory) {
        return _validators;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers — scoring math
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Returns the role weight for a validator (W_ROLE_GO or W_ROLE_NGO).
    function _getWRole(address validator) internal view returns (uint256) {
        IRegistry.Participant memory p = registry.getParticipant(validator);
        if (p.role == IRegistry.Role.GO) return W_ROLE_GO;
        return W_ROLE_NGO;
    }

    /// @dev Returns the eligibility threshold for a validator based on their role.
    ///      GOs need to be 20% above the average score (γ_GO = 1.2).
    function _getThreshold(address validator, uint256 avgScore) internal view returns (uint256) {
        IRegistry.Participant memory p = registry.getParticipant(validator);
        if (p.role == IRegistry.Role.GO) {
            return avgScore * GAMMA_GO / SCALE;
        }
        return avgScore;
    }

    /// @dev Computes the mean score across all registered validators.
    function _calculateAverageScore() internal view returns (uint256) {
        uint256 count = _validators.length;
        if (count == 0) return 0;

        uint256 total = 0;
        for (uint256 i = 0; i < count; i++) {
            total += _scores[_validators[i]].currentScore;
        }
        return total / count;
    }

    /// @dev Counts the number of currently active validators.
    function _countActiveValidators() internal view returns (uint256) {
        uint256 len = _validators.length;
        uint256 count = 0;
        for (uint256 i = 0; i < len; i++) {
            if (_scores[_validators[i]].isActive) count++;
        }
        return count;
    }

    /// @dev Computes B_i (Participation Quality) as a percentage (0–100).
    ///
    ///      B_i = w_role × [α × A_i + (1 - α) × V_i]
    ///
    ///      A_i = attendance ratio (0 to 100, scaled)
    ///      V_i = voting saturation (0 to 100, scaled)
    ///
    ///      Returns a value 0–100 representing participation quality percentage.
    function _calculateParticipation(address validator) internal view returns (uint256) {
        ValidatorScore storage score = _scores[validator];
        uint256 wRole = _getWRole(validator);

        // A_i: attendance ratio (0..SCALE)
        uint256 ai = 0;
        if (score.totalRoundsEligible > 0) {
            ai = score.roundsParticipated * SCALE / score.totalRoundsEligible;
        }

        // V_i: voting saturation (0..SCALE)
        // Integer approximation of 1 - e^(-β × votes):
        //   V_i ≈ SCALE × β × votes / (SCALE + β × votes)
        uint256 vi = _votingSaturation(score.votesCast);

        // B_i = wRole × (α × A_i + (1-α) × V_i) / SCALE²
        // Combined to avoid divide-before-multiply precision loss.
        // Max intermediate: 100 * 100 * 100 = 1,000,000 — safe for uint256.
        return (ALPHA * ai + (SCALE - ALPHA) * vi) * wRole / (SCALE * SCALE);
    }

    /// @dev Integer approximation of the voting activeness function:
    ///        V_i = 1 - e^(-β × votes)
    ///      Approximated as: β×votes / (SCALE + β×votes)
    ///      Returns 0..SCALE (0..100).
    ///
    ///      Saturation behavior: 1 vote → 33, 5 votes → 71, 10 → 83, 100 → 98.
    function _votingSaturation(uint256 votesCast) internal pure returns (uint256) {
        if (votesCast == 0) return 0;
        return SCALE * BETA * votesCast / (SCALE + BETA * votesCast);
    }

    /// @dev Computes the ceiling reducer for the reward function:
    ///        1 / (1 + β × ln(1 + n_timeout))
    ///      Returns 0..SCALE (0..100).
    ///
    ///      A history of timeouts permanently reduces (but never eliminates) future
    ///      reward capacity. 0 timeouts → 100 (full reward), 1 → 74, 5 → 55.
    function _calculateCeilingReducer(uint256 timeoutCount) internal pure returns (uint256) {
        if (timeoutCount == 0) return SCALE;

        uint256 lnVal = _lnScaled(1 + timeoutCount);
        // denominator = SCALE + BETA × ln(1+n) / SCALE
        uint256 denom = SCALE + BETA * lnVal / SCALE;
        if (denom == 0) return SCALE;
        return SCALE * SCALE / denom;
    }

    /// @dev Returns ln(x) × 100 using a lookup table for x = 1..11 and a Padé
    ///      approximation for x > 11.
    ///
    ///      Accuracy: exact for x ≤ 11, within ~3% for x ≤ 30.
    ///      Sufficient for the expected range of timeout counts (0–20).
    function _lnScaled(uint256 x) internal pure returns (uint256) {
        if (x <= 1)  return 0;
        if (x == 2)  return 69;
        if (x == 3)  return 110;
        if (x == 4)  return 139;
        if (x == 5)  return 161;
        if (x == 6)  return 179;
        if (x == 7)  return 195;
        if (x == 8)  return 208;
        if (x == 9)  return 220;
        if (x == 10) return 230;
        if (x == 11) return 240;
        // For x > 11: ln(x) ≈ ln(10) + 2×(x-10)/(x+10)  (Padé approximation)
        return 230 + 200 * (x - 10) / (x + 10);
    }
}
