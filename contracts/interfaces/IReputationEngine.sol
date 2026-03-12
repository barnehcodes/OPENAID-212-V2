// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IReputationEngine — Minimal interface consumed by the Governance contract
/// @notice Governance calls these two functions to update coordinator reputation after
///         a crisis concludes. The full scoring formula lives inside ReputationEngine.
interface IReputationEngine {
    /// @notice Record a confirmed misconduct event for a coordinator.
    /// @dev    Triggers the quadratic penalty component of the scoring formula.
    ///         Called by Governance after a misconduct vote passes a simple majority.
    /// @param validator  The coordinator's address.
    /// @param crisisId   The crisis in which the misconduct occurred.
    function recordMisconduct(address validator, uint256 crisisId) external;

    /// @notice Record a successfully completed coordination cycle.
    /// @dev    Triggers the linear reward component of the scoring formula.
    ///         Called by Governance when the Tier-1 Operational Authority closes a
    ///         crisis cleanly (no misconduct flag).
    /// @param validator  The coordinator's address.
    /// @param crisisId   The crisis that was completed successfully.
    function recordSuccessfulCoordination(address validator, uint256 crisisId) external;

    /// @notice Record that a validator cast a governance vote.
    /// @dev    Increments the V_i (voting activeness) counter in the scoring formula.
    ///         Called by Governance when a verified GO or NGO casts any governance vote.
    /// @param validator  The validator who cast a vote.
    function recordVoteCast(address validator) external;
}
