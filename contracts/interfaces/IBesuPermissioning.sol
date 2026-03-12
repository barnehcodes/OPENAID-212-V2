// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IBesuPermissioning — Interface for Hyperledger Besu's validator permissioning
/// @notice Defines the functions the ReputationEngine calls to add/remove validators
///         from the blockchain's active consensus set.
/// @dev    In production, this would be Besu's on-chain permissioning contract.
///         For the thesis prototype, a mock implementation is used.
interface IBesuPermissioning {
    /// @notice Add an address to the active validator set.
    function addValidator(address validator) external;

    /// @notice Remove an address from the active validator set.
    function removeValidator(address validator) external;

    /// @notice Return the list of currently active validators.
    function getValidators() external view returns (address[] memory);
}
