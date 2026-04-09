// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IDonationManager — External interface consumed by the Governance contract
/// @notice Defines the surface the Governance contract needs to orchestrate the
///         donation lifecycle: activate/close crises, release escrow to coordinators,
///         and read donor contributions for voting-eligibility checks.
interface IDonationManager {
    // ─────────────────────────────────────────────────────────────────────────
    // Crisis lifecycle — called by Governance
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Mark a crisis as active so it can accept donations.
    /// @dev    Called by Governance when a crisis is declared. Reverts if the crisis
    ///         is already active to prevent duplicate activations.
    /// @param crisisId  The crisis identifier (same ID used in Governance).
    function activateCrisis(uint256 crisisId) external;

    /// @notice Mark a crisis as no longer accepting donations.
    /// @dev    Called by Governance when a crisis is closed or cancelled.
    /// @param crisisId  The crisis to deactivate.
    function deactivateCrisis(uint256 crisisId) external;

    // ─────────────────────────────────────────────────────────────────────────
    // Escrow — called by Governance after coordinator election
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Transfer all FT in escrow for a crisis to the elected coordinator.
    /// @dev    Callable only by the Governance contract. Sets the on-chain coordinator
    ///         record so subsequent distribution calls can verify the caller.
    /// @param crisisId    The crisis whose escrow is being released.
    /// @param coordinator The elected coordinator address that will distribute funds.
    function releaseEscrowToCoordinator(uint256 crisisId, address coordinator) external;

    // ─────────────────────────────────────────────────────────────────────────
    // View functions — consumed by Governance for voting eligibility
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Return the total FT a donor has contributed to a specific crisis.
    /// @dev    Governance reads this to decide whether a donor meets the per-role
    ///         donation cap required to vote in coordinator elections.
    /// @param donor     The donor address to query.
    /// @param crisisId  The crisis to query against.
    /// @return          Total AID tokens donated by this address to this crisis.
    function getDonorContribution(address donor, uint256 crisisId) external view returns (uint256);

    /// @notice Return the total FT currently held in escrow for a crisis.
    /// @param crisisId  The crisis to query.
    /// @return          Total AID tokens in the crisis escrow pool.
    function getCrisisEscrowBalance(uint256 crisisId) external view returns (uint256);

    // ─────────────────────────────────────────────────────────────────────────
    // Crisis pause/unpause — called by Governance during misconduct flow
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Freeze a crisis: stop donations and revoke coordinator authority.
    /// @param crisisId  The crisis to pause.
    function pauseCrisis(uint256 crisisId) external;

    /// @notice Unfreeze a crisis: reopen donations.
    /// @param crisisId  The crisis to unpause.
    function unpauseCrisis(uint256 crisisId) external;

    // ─────────────────────────────────────────────────────────────────────────
    // Direct donations — non-crisis path
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Mint AID tokens directly to a registered beneficiary without a crisis.
    /// @dev    Non-crisis donation path. Does NOT update donorContribution (no governance
    ///         voting power from direct donations). Does NOT require an active crisis.
    /// @param beneficiary  A registered participant with Role.Beneficiary.
    /// @param amount       Number of AID tokens to mint (must be > 0).
    function directDonateFT(address beneficiary, uint256 amount) external;

    // ─────────────────────────────────────────────────────────────────────────
    // Samaritan Score — donor engagement tracking
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Confirm tracking of a crisis-bound FT donation, incrementing the donor's Samaritan score.
    /// @param crisisId  The crisis the donor contributed FT to.
    function confirmCrisisDonationTracked(uint256 crisisId) external;

    /// @notice Confirm tracking of an in-kind donation, incrementing the donor's Samaritan score.
    /// @param nftId  The in-kind item the donor committed.
    function confirmInKindTracked(uint256 nftId) external;

    /// @notice Return the Samaritan score for a donor.
    /// @param donor  The donor address to query.
    /// @return       The donor's cumulative Samaritan score.
    function getSamaritanScore(address donor) external view returns (uint256);

    /// @notice Check if a donor has already tracked their crisis FT donation.
    /// @param donor     The donor address.
    /// @param crisisId  The crisis to check.
    /// @return          True if the donor has already tracked this crisis donation.
    function hasDonorTrackedCrisis(address donor, uint256 crisisId) external view returns (bool);

    /// @notice Check if a donor has already tracked their in-kind donation.
    /// @param donor  The donor address.
    /// @param nftId  The in-kind item ID to check.
    /// @return       True if the donor has already tracked this in-kind donation.
    function hasDonorTrackedInKind(address donor, uint256 nftId) external view returns (bool);

    // ─────────────────────────────────────────────────────────────────────────
    // FT Beneficiary Confirmation
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Beneficiary confirms receipt of FT distributions for a crisis.
    /// @param crisisId  The crisis the beneficiary received FT from.
    function confirmFTReceipt(uint256 crisisId) external;

    /// @notice Return the cumulative FT amount received by a beneficiary for a crisis.
    /// @param beneficiary  The beneficiary address.
    /// @param crisisId     The crisis to query.
    /// @return             Total AID tokens received by this beneficiary for this crisis.
    function getFTReceivedAmount(address beneficiary, uint256 crisisId) external view returns (uint256);

    /// @notice Check if a beneficiary has confirmed FT receipt for a crisis.
    /// @param beneficiary  The beneficiary address.
    /// @param crisisId     The crisis to check.
    /// @return             True if the beneficiary has confirmed receipt.
    function hasBeneficiaryConfirmedFT(address beneficiary, uint256 crisisId) external view returns (bool);

    // ─────────────────────────────────────────────────────────────────────────
    // Direct FT Donation Tracking — Samaritan Score
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Confirm tracking of a direct FT donation, incrementing the donor's Samaritan score.
    /// @param beneficiary  The beneficiary the donor sent direct FT to.
    function confirmDirectFTTracked(address beneficiary) external;

    /// @notice Return the cumulative direct FT amount donated by a donor to a beneficiary.
    /// @param donor        The donor address.
    /// @param beneficiary  The beneficiary address.
    /// @return             Total AID tokens donated directly to this beneficiary.
    function getDirectFTDonated(address donor, address beneficiary) external view returns (uint256);

    /// @notice Check if a donor has already tracked their direct FT donation to a beneficiary.
    /// @param donor        The donor address.
    /// @param beneficiary  The beneficiary address.
    /// @return             True if the donor has already tracked this direct FT donation.
    function hasDonorTrackedDirectFT(address donor, address beneficiary) external view returns (bool);
}
