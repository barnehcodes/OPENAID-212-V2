// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReputationEngine.sol";

/// @title MockReputationEngine — Test double for the ReputationEngine contract
/// @dev   Used in Governance tests to verify that reputation calls are made correctly
///        without needing the full ReputationEngine implementation deployed.
///        Records the most recent call and a counter for each function.
contract MockReputationEngine is IReputationEngine {
    address public lastMisconductValidator;
    uint256 public lastMisconductCrisisId;
    uint256 public misconductCallCount;

    address public lastSuccessValidator;
    uint256 public lastSuccessCrisisId;
    uint256 public successCallCount;

    function recordMisconduct(address validator, uint256 crisisId) external override {
        lastMisconductValidator = validator;
        lastMisconductCrisisId  = crisisId;
        misconductCallCount++;
    }

    function recordSuccessfulCoordination(address validator, uint256 crisisId) external override {
        lastSuccessValidator = validator;
        lastSuccessCrisisId  = crisisId;
        successCallCount++;
    }

    address public lastVoteCastValidator;
    uint256 public voteCastCallCount;

    function recordVoteCast(address validator) external override {
        lastVoteCastValidator = validator;
        voteCastCallCount++;
    }
}
