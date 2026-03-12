// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IBesuPermissioning.sol";

/// @title MockBesuPermissioning — Test double for Besu's validator permissioning
/// @dev   Tracks added/removed validators in memory so tests can verify the
///        ReputationEngine integrates correctly with the consensus layer.
contract MockBesuPermissioning is IBesuPermissioning {
    address[] private _validators;
    mapping(address => bool) private _isValidator;
    mapping(address => uint256) private _indexPlusOne;

    uint256 public addCallCount;
    uint256 public removeCallCount;
    address public lastAdded;
    address public lastRemoved;

    function addValidator(address validator) external override {
        addCallCount++;
        lastAdded = validator;

        if (!_isValidator[validator]) {
            _validators.push(validator);
            _indexPlusOne[validator] = _validators.length;
            _isValidator[validator] = true;
        }
    }

    function removeValidator(address validator) external override {
        removeCallCount++;
        lastRemoved = validator;

        if (_isValidator[validator]) {
            _isValidator[validator] = false;
            // Swap-and-pop for clean removal
            uint256 idx = _indexPlusOne[validator] - 1;
            uint256 lastIdx = _validators.length - 1;
            if (idx != lastIdx) {
                address last = _validators[lastIdx];
                _validators[idx] = last;
                _indexPlusOne[last] = idx + 1;
            }
            _validators.pop();
            _indexPlusOne[validator] = 0;
        }
    }

    function getValidators() external view override returns (address[] memory) {
        return _validators;
    }

    function isValidator(address validator) external view returns (bool) {
        return _isValidator[validator];
    }

    function validatorCount() external view returns (uint256) {
        return _validators.length;
    }
}
