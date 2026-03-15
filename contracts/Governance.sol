// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IRegistry.sol";
import "./interfaces/IDonationManager.sol";
import "./interfaces/IReputationEngine.sol";
import "./interfaces/IGovernance.sol";

/// @title Governance — Democratic engine for OpenAID +212
/// @author OpenAID +212 Project
/// @notice Implements the full crisis lifecycle: declaration, coordinator election,
///         GO vote compression, and misconduct accountability.
///
/// @dev Authority checks read directly from the Registry rather than duplicating
///      role storage. This ensures that if the Tier-1 or Tier-3 authority address
///      is updated in the Registry, Governance immediately respects the change.
///
///      Circular dependency between Governance ↔ ReputationEngine is broken by
///      deploying Governance with reputationEngine = address(0) and then calling
///      setReputationEngine() once ReputationEngine is live.
///
///      Deployment order:
///        1. Deploy Registry
///        2. Deploy DonationManager(registry, address(0))
///        3. Deploy Governance(registry, donationManager, address(0))
///        4. Call donationManager.setGovernanceContract(governance)
///        5. Deploy ReputationEngine(registry, governance)
///        6. Call governance.setReputationEngine(reputationEngine)   ← Tier-3 multisig
///
///      The GO Vote Compression Algorithm (key anti-capture mechanism):
///        • If ALL GO votes go to ONE candidate → their collective vote counts as 1.
///        • If GOs are SPLIT across candidates → each GO vote counts individually.
///      This prevents a government bloc from unilaterally selecting their preferred
///      coordinator even when outnumbered by NGOs or other voters.
contract Governance is IGovernance {
    // ─────────────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Duration of the coordinator election voting window.
    uint256 public constant VOTING_DURATION = 48 hours;

    /// @notice Duration of the misconduct review voting window.
    uint256 public constant MISCONDUCT_VOTE_DURATION = 72 hours;

    /// @notice Donation cap multiplier for Government Organisations (GO).
    uint256 public constant GO_CAP_MULTIPLIER  = 15;

    /// @notice Donation cap multiplier for Non-Governmental Organisations (NGO).
    uint256 public constant NGO_CAP_MULTIPLIER = 10;

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Source of truth for participant identity and verification status.
    IRegistry       public immutable registry;

    /// @notice Handles AID token escrow, donation accounting, and distribution.
    IDonationManager public immutable donationManager;

    /// @notice Optional — set after deployment to break circular dependency.
    ///         If address(0), reputation scoring calls are silently skipped.
    IReputationEngine public reputationEngine;

    /// @notice Auto-incrementing crisis ID counter. First crisis is ID 1.
    uint256 public nextCrisisId;

    /// @notice Crisis records indexed by crisis ID.
    mapping(uint256 => Crisis) private _crises;

    /// @notice Ordered list of candidates per crisis (for finalization iteration).
    mapping(uint256 => Candidacy[]) private _candidatesList;

    /// @notice 1-indexed candidate position in _candidatesList[crisisId].
    ///         0 means the address is NOT a registered candidate.
    mapping(uint256 => mapping(address => uint256)) private _candidateIndexPlusOne;

    /// @notice Total number of GO votes cast across all candidates in a crisis.
    ///         Used by the compression algorithm — if all GO votes went to one
    ///         candidate, this equals that candidate's goVoteCount.
    mapping(uint256 => uint256) private _totalGOVotes;

    /// @notice Timestamp when the voting window opens for each crisis.
    mapping(uint256 => uint256) public votingStart;

    /// @notice Timestamp when the voting window closes for each crisis.
    mapping(uint256 => uint256) public votingEnd;

    /// @notice Prevents double-voting in coordinator elections.
    ///         hasVoted[voter][crisisId]
    mapping(address => mapping(uint256 => bool)) public hasVoted;

    /// @notice Prevents double-voting in misconduct reviews.
    ///         hasMisconductVoted[voter][crisisId]
    mapping(address => mapping(uint256 => bool)) public hasMisconductVoted;

    /// @notice Misconduct vote tallies indexed by crisis ID.
    mapping(uint256 => MisconductTally) private _misconductTally;

    // ─────────────────────────────────────────────────────────────────────────
    // Custom errors
    // ─────────────────────────────────────────────────────────────────────────

    error ZeroAddress();

    /// @notice Crisis ID does not correspond to a declared crisis.
    error CrisisNotFound(uint256 crisisId);

    /// @notice severity must be between 1 and 5 inclusive.
    error InvalidSeverity(uint256 severity);

    /// @notice Caller is not the Tier-3 Crisis Declaration Multisig.
    error NotCrisisDeclarationAuthority(address caller);

    /// @notice Caller is not the Tier-1 Operational Authority.
    error NotOperationalAuthority(address caller);

    /// @notice Crisis is in the wrong phase for the requested operation.
    error WrongPhase(uint256 crisisId, Phase actual);

    /// @notice Address is already registered as a candidate for this crisis.
    error AlreadyCandidate(address addr, uint256 crisisId);

    /// @notice Address is not a registered candidate for this crisis.
    error NotACandidate(address candidate, uint256 crisisId);

    /// @notice Caller is not a verified GO or NGO.
    error NotVerifiedValidator(address addr);

    /// @notice Caller's donation does not meet the role-specific cap required to participate.
    error InsufficientDonation(address addr, uint256 required, uint256 actual);

    /// @notice Caller is not crisis-verified for this crisis (Beneficiary path).
    error NotCrisisVerifiedBeneficiary(address addr, uint256 crisisId);

    /// @notice Cannot start voting — no candidates have registered yet.
    error NoCandidates(uint256 crisisId);

    /// @notice Voting window is still open; cannot finalize yet.
    error VotingStillOpen(uint256 crisisId);

    /// @notice Voting window has already closed; vote not accepted.
    error VotingClosed(uint256 crisisId);

    /// @notice Caller has already voted in this crisis's election.
    error AlreadyVoted(address voter, uint256 crisisId);

    /// @notice Caller has already voted in this crisis's misconduct review.
    error AlreadyMisconductVoted(address voter, uint256 crisisId);

    /// @notice Caller is not registered in the Registry.
    error NotRegistered(address addr);

    /// @notice Misconduct review window is still open; cannot finalize yet.
    error MisconductVotingStillOpen(uint256 crisisId);

    /// @notice Misconduct review window has already closed; vote not accepted.
    error MisconductVotingClosed(uint256 crisisId);

    /// @notice A misconduct vote has already been initiated for this crisis.
    error MisconductAlreadyFlagged(uint256 crisisId);

    /// @notice Coordinator has not been elected yet.
    error CoordinatorNotElected(uint256 crisisId);

    /// @notice Address was not involved in this crisis and cannot vote on misconduct.
    error NotInvolvedInCrisis(address addr, uint256 crisisId);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Deploy the Governance contract.
    /// @dev    reputationEngine can be address(0) at deployment — use setReputationEngine()
    ///         once the ReputationEngine contract is live. Until set, reputation calls
    ///         are silently skipped (no effect on crisis lifecycle).
    /// @param _registry          Address of the deployed Registry contract.
    /// @param _donationManager   Address of the deployed DonationManager contract.
    /// @param _reputationEngine  ReputationEngine address, or address(0) if not yet deployed.
    constructor(
        address _registry,
        address _donationManager,
        address _reputationEngine
    ) {
        if (_registry       == address(0)) revert ZeroAddress();
        if (_donationManager == address(0)) revert ZeroAddress();

        registry        = IRegistry(_registry);
        donationManager = IDonationManager(_donationManager);

        if (_reputationEngine != address(0)) {
            reputationEngine = IReputationEngine(_reputationEngine);
            emit ReputationEngineSet(_reputationEngine);
        }

        nextCrisisId = 1; // Crisis IDs start at 1; 0 is used as "not found" sentinel
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Configuration — Tier-3 multisig only
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Wire up the ReputationEngine after it is deployed.
    /// @dev    Gated by the Tier-3 Crisis Declaration Multisig because changing the
    ///         reputation engine address is a system-critical action: the wrong address
    ///         could silently disable all post-crisis reputation updates.
    /// @param _reputationEngine  Address of the deployed ReputationEngine contract.
    function setReputationEngine(address _reputationEngine)
        external
    {
        if (msg.sender != registry.crisisDeclarationMultisig()) {
            revert NotCrisisDeclarationAuthority(msg.sender);
        }
        if (_reputationEngine == address(0)) revert ZeroAddress();

        reputationEngine = IReputationEngine(_reputationEngine);
        emit ReputationEngineSet(_reputationEngine);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Crisis declaration — Tier-3 multisig only
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IGovernance
    /// @dev Activates the crisis in DonationManager so donations can be accepted
    ///      immediately after declaration. The crisis phase is DECLARED — candidates
    ///      may begin registering before voting is formally opened.
    function declareCrisis(
        string calldata description,
        uint256 severity,
        uint256 baseDonationCap
    )
        external
        override
        returns (uint256 crisisId)
    {
        if (msg.sender != registry.crisisDeclarationMultisig()) {
            revert NotCrisisDeclarationAuthority(msg.sender);
        }
        if (severity < 1 || severity > 5) revert InvalidSeverity(severity);

        crisisId = nextCrisisId++;

        _crises[crisisId] = Crisis({
            crisisId:         crisisId,
            description:      description,
            severity:         severity,
            baseDonationCap:  baseDonationCap,
            phase:            Phase.DECLARED,
            declaredAt:       block.timestamp,
            coordinator:      address(0),
            misconductFlagged: false
        });

        // Emit before external call (checks-effects-interactions)
        emit CrisisDeclared(crisisId, description, severity);

        // Open donations in DonationManager for this crisis
        donationManager.activateCrisis(crisisId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Candidacy registration — verified GOs and NGOs only
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IGovernance
    /// @dev Registration is open during both DECLARED and VOTING phases, allowing
    ///      late candidates who meet the donation cap to still participate.
    ///      Donation caps: NGO = 10× base, GO = 15× base.
    function registerAsCandidate(uint256 crisisId) external override {
        _requireCrisisExists(crisisId);

        Crisis storage crisis = _crises[crisisId];
        if (crisis.phase != Phase.DECLARED && crisis.phase != Phase.VOTING) {
            revert WrongPhase(crisisId, crisis.phase);
        }
        if (!registry.isVerifiedValidator(msg.sender)) {
            revert NotVerifiedValidator(msg.sender);
        }
        if (_candidateIndexPlusOne[crisisId][msg.sender] != 0) {
            revert AlreadyCandidate(msg.sender, crisisId);
        }

        // Enforce role-specific donation cap
        IRegistry.Participant memory p = registry.getParticipant(msg.sender);
        uint256 multiplier  = _getDonationMultiplier(p.role);
        uint256 requiredCap = crisis.baseDonationCap * multiplier;
        if (requiredCap > 0) {
            uint256 contributed = donationManager.getDonorContribution(msg.sender, crisisId);
            if (contributed < requiredCap) {
                revert InsufficientDonation(msg.sender, requiredCap, contributed);
            }
        }

        _candidatesList[crisisId].push(Candidacy({
            candidate:   msg.sender,
            crisisId:    crisisId,
            voteCount:   0,
            goVoteCount: 0
        }));
        // Store 1-indexed position so 0 can be used as "not registered" sentinel
        _candidateIndexPlusOne[crisisId][msg.sender] = _candidatesList[crisisId].length;

        emit CandidateRegistered(crisisId, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Voting phase transition — Tier-1 Operational Authority only
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IGovernance
    /// @dev Starting the voting phase is procedural — crisis and candidates already
    ///      exist; the operator is just opening the clock. Requires at least one
    ///      registered candidate to prevent an unresolvable election.
    function startVoting(uint256 crisisId) external override {
        if (msg.sender != registry.operationalAuthority()) {
            revert NotOperationalAuthority(msg.sender);
        }
        _requireCrisisExists(crisisId);

        Crisis storage crisis = _crises[crisisId];
        if (crisis.phase != Phase.DECLARED) revert WrongPhase(crisisId, crisis.phase);
        if (_candidatesList[crisisId].length == 0) revert NoCandidates(crisisId);

        crisis.phase         = Phase.VOTING;
        votingStart[crisisId] = block.timestamp;
        votingEnd[crisisId]   = block.timestamp + VOTING_DURATION;

        emit VotingStarted(crisisId, votingStart[crisisId], votingEnd[crisisId]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Voting — eligible participants
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IGovernance
    /// @dev Eligibility rules by role:
    ///      • Beneficiary:      Must be crisis-verified. No donation required.
    ///      • Donor / Company:  Must have donated ≥ 1× baseDonationCap.
    ///      • NGO:              Must have donated ≥ 10× baseDonationCap.
    ///      • GO:               Must have donated ≥ 15× baseDonationCap.
    ///                          GO votes are tracked separately for compression.
    function castVote(uint256 crisisId, address candidate) external override {
        _requireCrisisExists(crisisId);

        Crisis storage crisis = _crises[crisisId];
        if (crisis.phase != Phase.VOTING)              revert WrongPhase(crisisId, crisis.phase);
        if (block.timestamp > votingEnd[crisisId])     revert VotingClosed(crisisId);
        if (hasVoted[msg.sender][crisisId])            revert AlreadyVoted(msg.sender, crisisId);
        if (_candidateIndexPlusOne[crisisId][candidate] == 0) {
            revert NotACandidate(candidate, crisisId);
        }

        IRegistry.Participant memory p = registry.getParticipant(msg.sender);
        if (!p.exists) revert NotRegistered(msg.sender);

        // Role-specific eligibility check
        if (p.role == IRegistry.Role.Beneficiary) {
            if (!registry.isCrisisVerifiedBeneficiary(msg.sender, crisisId)) {
                revert NotCrisisVerifiedBeneficiary(msg.sender, crisisId);
            }
        } else {
            uint256 multiplier  = _getDonationMultiplier(p.role);
            uint256 requiredCap = crisis.baseDonationCap * multiplier;
            if (requiredCap > 0) {
                uint256 contributed = donationManager.getDonorContribution(msg.sender, crisisId);
                if (contributed < requiredCap) {
                    revert InsufficientDonation(msg.sender, requiredCap, contributed);
                }
            }
        }

        // Record vote in the candidate's tally
        uint256 idx = _candidateIndexPlusOne[crisisId][candidate] - 1;
        if (p.role == IRegistry.Role.GO) {
            _candidatesList[crisisId][idx].goVoteCount += 1;
            _totalGOVotes[crisisId]                    += 1;
        } else {
            _candidatesList[crisisId][idx].voteCount += 1;
        }

        hasVoted[msg.sender][crisisId] = true;

        // Emit before external call (checks-effects-interactions)
        emit VoteCast(crisisId, msg.sender, candidate);

        // Track validator voting activeness for reputation scoring (V_i component)
        if (address(reputationEngine) != address(0)) {
            if (p.role == IRegistry.Role.GO || p.role == IRegistry.Role.NGO) {
                reputationEngine.recordVoteCast(msg.sender);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Election finalization — permissionless (after voting window)
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IGovernance
    /// @dev Applies the GO Vote Compression rule before tallying:
    ///
    ///      COMPRESSION RULE:
    ///        Let T = total GO votes cast across all candidates.
    ///        If T > 0 AND all T votes went to the SAME candidate (unanimous):
    ///          → That candidate's effective GO contribution = 1 (not T).
    ///          → Other candidates still get 0 from the GO bloc.
    ///        If GOs are SPLIT (votes distributed across ≥2 candidates):
    ///          → Each GO vote counts at face value (no compression).
    ///
    ///      Tiebreaking: candidate who registered first wins (lower array index).
    ///      Escrow release: skipped (no revert) if crisis escrow is empty.
    ///      Effects precede external calls to prevent reentrancy issues.
    function finalizeElection(uint256 crisisId) external override {
        _requireCrisisExists(crisisId);

        Crisis storage crisis = _crises[crisisId];
        if (crisis.phase != Phase.VOTING)             revert WrongPhase(crisisId, crisis.phase);
        if (block.timestamp <= votingEnd[crisisId])   revert VotingStillOpen(crisisId);

        // ── GO Vote Compression ────────────────────────────────────────────
        uint256 totalGOVotes = _totalGOVotes[crisisId];
        bool goUnanimity     = false;

        if (totalGOVotes > 0) {
            // Unanimity: one candidate holds ALL GO votes
            Candidacy[] storage cList = _candidatesList[crisisId];
            for (uint256 i = 0; i < cList.length; i++) {
                if (cList[i].goVoteCount == totalGOVotes) {
                    goUnanimity = true;
                    break;
                }
            }
        }

        // ── Find winner ────────────────────────────────────────────────────
        // slither-disable-next-line uninitialized-local
        address winner;
        // slither-disable-next-line uninitialized-local
        uint256 winnerVotes;

        {
            Candidacy[] storage cList = _candidatesList[crisisId];
            for (uint256 i = 0; i < cList.length; i++) {
                Candidacy storage c = cList[i];

                uint256 finalVotes = c.voteCount; // Start with non-GO votes

                if (goUnanimity) {
                    // All GOs voted the same → compress their bloc to 1 vote
                    if (c.goVoteCount == totalGOVotes) {
                        finalVotes += 1;
                    }
                    // Other candidates: goVoteCount == 0, so no addition needed
                } else {
                    // GOs split → each vote counts normally
                    finalVotes += c.goVoteCount;
                }

                // First candidate wins ties (first-registered tiebreaker)
                if (i == 0 || finalVotes > winnerVotes) {
                    winner      = c.candidate;
                    winnerVotes = finalVotes;
                }
            }
        }

        // ── State transition (effects before interactions) ─────────────────
        crisis.coordinator = winner;
        crisis.phase       = Phase.ACTIVE;

        // Emit before external calls (checks-effects-interactions)
        emit CoordinatorElected(crisisId, winner, winnerVotes);

        // Close donations — coordinator now distributes from their own balance
        donationManager.deactivateCrisis(crisisId);

        // Release escrow to winner (skip if no funds were donated)
        if (donationManager.getCrisisEscrowBalance(crisisId) > 0) {
            donationManager.releaseEscrowToCoordinator(crisisId, winner);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Misconduct vote initiation — Tier-3 multisig only
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IGovernance
    /// @dev Initiating a misconduct vote is a serious accusation that can trigger
    ///      reputation slashing. Tier-3 (4-of-7) approval across all actor classes
    ///      prevents weaponization against coordinators for political reasons.
    function initiateMisconductVote(uint256 crisisId) external override {
        if (msg.sender != registry.crisisDeclarationMultisig()) {
            revert NotCrisisDeclarationAuthority(msg.sender);
        }
        _requireCrisisExists(crisisId);

        Crisis storage crisis = _crises[crisisId];
        if (crisis.phase != Phase.ACTIVE)             revert WrongPhase(crisisId, crisis.phase);
        if (crisis.coordinator == address(0))         revert CoordinatorNotElected(crisisId);
        if (crisis.misconductFlagged)                 revert MisconductAlreadyFlagged(crisisId);

        crisis.phase            = Phase.REVIEW;
        crisis.misconductFlagged = true;

        uint256 start = block.timestamp;
        uint256 end   = block.timestamp + MISCONDUCT_VOTE_DURATION;

        _misconductTally[crisisId] = MisconductTally({
            crisisId:     crisisId,
            votesFor:     0,
            votesAgainst: 0,
            voteStart:    start,
            voteEnd:      end
        });

        emit MisconductVoteStarted(crisisId, start, end);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Misconduct voting — crisis participants only
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IGovernance
    /// @dev Involvement check: GO/NGO (any verified validator) are always considered
    ///      involved. Beneficiaries must be crisis-verified. Donors and PrivateCompanies
    ///      must have donated ≥ 1 AID to the crisis.
    function castMisconductVote(uint256 crisisId, bool isMisconduct) external override {
        _requireCrisisExists(crisisId);

        Crisis storage crisis = _crises[crisisId];
        if (crisis.phase != Phase.REVIEW)                         revert WrongPhase(crisisId, crisis.phase);

        MisconductTally storage tally = _misconductTally[crisisId];
        if (block.timestamp > tally.voteEnd)                      revert MisconductVotingClosed(crisisId);
        if (hasMisconductVoted[msg.sender][crisisId])             revert AlreadyMisconductVoted(msg.sender, crisisId);
        if (!_wasInvolvedInCrisis(msg.sender, crisisId))          revert NotInvolvedInCrisis(msg.sender, crisisId);

        if (isMisconduct) {
            tally.votesFor     += 1;
        } else {
            tally.votesAgainst += 1;
        }

        hasMisconductVoted[msg.sender][crisisId] = true;
        emit MisconductVoteCast(crisisId, msg.sender, isMisconduct);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Misconduct finalization — permissionless (after review window)
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IGovernance
    /// @dev Simple majority: misconductConfirmed if votesFor > totalVotes / 2.
    ///      If no one voted, misconduct is NOT confirmed (benefit of the doubt).
    ///      State is set to CLOSED before any external call (effects before interactions).
    ///      If reputationEngine is address(0), slashing is silently skipped.
    function finalizeMisconductVote(uint256 crisisId) external override {
        _requireCrisisExists(crisisId);

        Crisis storage crisis = _crises[crisisId];
        if (crisis.phase != Phase.REVIEW) revert WrongPhase(crisisId, crisis.phase);

        MisconductTally storage tally = _misconductTally[crisisId];
        if (block.timestamp <= tally.voteEnd) revert MisconductVotingStillOpen(crisisId);

        uint256 totalVotes        = tally.votesFor + tally.votesAgainst;
        bool    misconductConfirmed = (totalVotes > 0) && (tally.votesFor > totalVotes / 2);

        // Effects before interactions
        crisis.phase = Phase.CLOSED;

        // Emit before external call (checks-effects-interactions)
        emit MisconductVoteFinalized(crisisId, misconductConfirmed, tally.votesFor, tally.votesAgainst);

        if (misconductConfirmed && address(reputationEngine) != address(0)) {
            reputationEngine.recordMisconduct(crisis.coordinator, crisisId);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Clean crisis closure — Tier-1 Operational Authority only
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IGovernance
    /// @dev This path is for crises that complete without misconduct: the coordinator
    ///      has finished distributing, no misconduct was flagged by Tier-3, and the
    ///      Operational Authority signs off. Awarding positive reputation is the
    ///      expected outcome of honest coordination.
    ///      State is set to CLOSED before any external call (effects before interactions).
    function closeCrisis(uint256 crisisId) external override {
        if (msg.sender != registry.operationalAuthority()) {
            revert NotOperationalAuthority(msg.sender);
        }
        _requireCrisisExists(crisisId);

        Crisis storage crisis = _crises[crisisId];
        if (crisis.phase != Phase.ACTIVE)    revert WrongPhase(crisisId, crisis.phase);
        if (crisis.misconductFlagged)        revert MisconductAlreadyFlagged(crisisId);

        // Effects before interactions
        crisis.phase = Phase.CLOSED;

        // Emit before external call (checks-effects-interactions)
        emit CrisisClosed(crisisId);

        if (address(reputationEngine) != address(0)) {
            reputationEngine.recordSuccessfulCoordination(crisis.coordinator, crisisId);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View functions
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IGovernance
    function getCrisis(uint256 crisisId) external view override returns (Crisis memory) {
        return _crises[crisisId];
    }

    /// @inheritdoc IGovernance
    function getCandidates(uint256 crisisId) external view override returns (Candidacy[] memory) {
        return _candidatesList[crisisId];
    }

    /// @inheritdoc IGovernance
    function getMisconductTally(uint256 crisisId)
        external
        view
        override
        returns (MisconductTally memory)
    {
        return _misconductTally[crisisId];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Reverts if crisisId does not correspond to a declared crisis.
    ///      Uses declaredAt != 0 as the existence sentinel (crisis IDs start at 1).
    // slither-disable-next-line incorrect-equality
    function _requireCrisisExists(uint256 crisisId) internal view {
        if (_crises[crisisId].declaredAt == 0) revert CrisisNotFound(crisisId);
    }

    /// @dev Returns the donation cap multiplier for a given role.
    ///      Beneficiaries are exempt (multiplier 0).
    ///      Donors and PrivateCompanies use 1×.
    ///      NGOs use 10×, GOs use 15×.
    function _getDonationMultiplier(IRegistry.Role role) internal pure returns (uint256) {
        if (role == IRegistry.Role.GO)          return GO_CAP_MULTIPLIER;
        if (role == IRegistry.Role.NGO)         return NGO_CAP_MULTIPLIER;
        if (role == IRegistry.Role.Beneficiary) return 0;
        return 1; // Donor and PrivateCompany
    }

    /// @dev Returns true if the address was meaningfully involved in the crisis.
    ///      Involvement is defined as:
    ///        • Verified GO or NGO (institutional actors, always involved).
    ///        • Crisis-verified Beneficiary.
    ///        • Donor or PrivateCompany who donated ≥ 1 AID to the crisis.
    function _wasInvolvedInCrisis(address addr, uint256 crisisId)
        internal
        view
        returns (bool)
    {
        IRegistry.Participant memory p = registry.getParticipant(addr);
        if (!p.exists) return false;

        if (p.role == IRegistry.Role.GO || p.role == IRegistry.Role.NGO) {
            return registry.isVerifiedValidator(addr);
        }
        if (p.role == IRegistry.Role.Beneficiary) {
            return registry.isCrisisVerifiedBeneficiary(addr, crisisId);
        }
        // Donor and PrivateCompany: must have donated
        return donationManager.getDonorContribution(addr, crisisId) > 0;
    }
}
