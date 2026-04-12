// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IGovernance — External interface for the OpenAID +212 Governance contract
/// @notice Defines the democratic engine of OpenAID: crisis lifecycle, coordinator
///         elections, GO vote compression, and misconduct accountability.
///         ReputationEngine imports this interface to read crisis phase and participation data.
interface IGovernance {
    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Crisis phase progression. Includes PAUSED for re-election cycles.
    enum Phase { DECLARED, VOTING, ACTIVE, REVIEW, PAUSED, CLOSED }

    /// @notice On-chain record for a single crisis event.
    struct Crisis {
        uint256 crisisId;
        string  description;        // Human-readable summary (e.g. "Earthquake Al Haouz Sept 2023")
        uint256 baseDonationCap;    // Minimum donation (in AID) for voting rights — multiplied by role
        Phase   phase;
        uint256 declaredAt;         // Block timestamp of declaration
        address coordinator;        // Elected coordinator (address(0) until ACTIVE)
        bool    misconductFlagged;  // True if a misconduct vote has been initiated
    }

    /// @notice Per-candidate vote tally for a crisis election.
    struct Candidacy {
        address candidate;
        uint256 crisisId;
        uint256 voteCount;    // Non-GO votes received
        uint256 goVoteCount;  // GO votes received (tracked separately for compression)
    }

    /// @notice Misconduct vote tally for the REVIEW phase.
    struct MisconductTally {
        uint256 crisisId;
        uint256 votesFor;      // Votes asserting misconduct occurred
        uint256 votesAgainst;  // Votes saying coordinator performed honestly
        uint256 voteStart;
        uint256 voteEnd;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event CrisisDeclared(uint256 indexed crisisId, string description);
    event CandidateRegistered(uint256 indexed crisisId, address indexed candidate);
    event VotingStarted(uint256 indexed crisisId, uint256 voteStart, uint256 voteEnd);
    event VoteCast(uint256 indexed crisisId, address indexed voter, address indexed candidate);
    event CoordinatorElected(uint256 indexed crisisId, address indexed coordinator, uint256 voteCount);
    event MisconductVoteStarted(uint256 indexed crisisId, uint256 voteStart, uint256 voteEnd);
    event MisconductVoteCast(uint256 indexed crisisId, address indexed voter, bool isMisconduct);
    event MisconductVoteFinalized(uint256 indexed crisisId, bool misconductConfirmed, uint256 votesFor, uint256 votesAgainst);
    event CrisisClosed(uint256 indexed crisisId);
    event CrisisPaused(uint256 indexed crisisId, address indexed oldCoordinator);
    event MisconductDismissed(uint256 indexed crisisId);
    event CoordinatorRevoked(uint256 indexed crisisId);
    event ReputationEngineSet(address indexed reputationEngine);

    // ─────────────────────────────────────────────────────────────────────────
    // Crisis lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Declare a new crisis. Caller must be the Tier-3 Crisis Declaration Multisig.
    /// @param description    Human-readable crisis summary.
    /// @param baseDonationCap Minimum AID donation for voting rights (multiplied by role cap multiplier).
    /// @return crisisId      The ID assigned to the new crisis.
    function declareCrisis(
        string calldata description,
        uint256 baseDonationCap
    ) external returns (uint256 crisisId);

    /// @notice Register the caller as a coordinator candidate for a crisis.
    /// @dev    Caller must be a verified GO or NGO and must have met the role-specific donation cap.
    /// @param crisisId  The crisis to run in. Must be in DECLARED or VOTING phase.
    function registerAsCandidate(uint256 crisisId) external;

    /// @notice Transition a crisis from DECLARED to VOTING and open the voting window.
    /// @dev    Caller must be the Tier-1 Operational Authority. At least one candidate required.
    /// @param crisisId  The crisis to start voting for.
    function startVoting(uint256 crisisId) external;

    /// @notice Cast a vote for a coordinator candidate.
    /// @dev    GO votes are tracked separately for the compression mechanism.
    /// @param crisisId   Crisis in VOTING phase.
    /// @param candidate  Registered candidate address to vote for.
    function castVote(uint256 crisisId, address candidate) external;

    /// @notice Finalize the election after the voting window closes.
    /// @dev    Applies GO vote compression. Transitions crisis to ACTIVE. Releases escrow.
    ///         Callable by anyone once block.timestamp > votingEnd[crisisId].
    /// @param crisisId  Crisis in VOTING phase with expired voting window.
    function finalizeElection(uint256 crisisId) external;

    /// @notice Open a misconduct vote for the elected coordinator.
    /// @dev    Caller must be the Tier-3 Crisis Declaration Multisig. Crisis must be ACTIVE.
    /// @param crisisId  The crisis to evaluate.
    function initiateMisconductVote(uint256 crisisId) external;

    /// @notice Cast a vote in the misconduct review phase.
    /// @dev    Caller must have been involved in the crisis (donated, or is GO/NGO, or verified beneficiary).
    /// @param crisisId     Crisis in REVIEW phase.
    /// @param isMisconduct True = misconduct occurred; false = coordinator performed honestly.
    function castMisconductVote(uint256 crisisId, bool isMisconduct) external;

    /// @notice Finalize the misconduct vote after the review window closes.
    /// @dev    If misconduct confirmed (simple majority), triggers ReputationEngine slashing.
    ///         Transitions crisis to CLOSED. Callable by anyone.
    /// @param crisisId  Crisis in REVIEW phase with expired review window.
    function finalizeMisconductVote(uint256 crisisId) external;

    /// @notice Close a cleanly-completed crisis (no misconduct flagged).
    /// @dev    Caller must be the Tier-1 Operational Authority. Awards positive reputation.
    /// @param crisisId  Crisis in ACTIVE phase with no misconduct flag.
    function closeCrisis(uint256 crisisId) external;

    /// @notice Redirect leftover escrow funds from a CLOSED crisis to another crisis.
    /// @dev    Caller must be the Tier-3 Crisis Declaration Multisig.
    /// @param fromCrisisId  The CLOSED crisis to pull funds from.
    /// @param toCrisisId    The target crisis (must not be CLOSED).
    /// @param amount        Amount of AID tokens to redirect.
    function redirectLeftoverFunds(uint256 fromCrisisId, uint256 toCrisisId, uint256 amount) external;

    // ─────────────────────────────────────────────────────────────────────────
    // View functions — consumed by ReputationEngine and frontends
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Return the full Crisis record.
    function getCrisis(uint256 crisisId) external view returns (Crisis memory);

    /// @notice Return the list of candidates registered for a crisis.
    function getCandidates(uint256 crisisId) external view returns (Candidacy[] memory);

    /// @notice Return the misconduct vote tally for a crisis.
    function getMisconductTally(uint256 crisisId) external view returns (MisconductTally memory);
}
