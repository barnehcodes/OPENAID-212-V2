// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IRegistry.sol";
import "./interfaces/IDonationManager.sol";

/// @title DonationManager — Financial engine for OpenAID +212
/// @author OpenAID +212 Project
/// @notice Handles all asset flows: monetary donations (ERC20 fungible tokens) and
///         in-kind donations (custom NFT-like tracking). Implements escrow hold and
///         the three-way verification flow (donor → coordinator → beneficiary).
///
/// @dev Inherits ERC20 for the AID fungible donation token (1 AID = 1 MAD).
///      In-kind donations use a custom struct + mapping instead of ERC721 inheritance
///      to avoid the `_transfer(address,address,uint256)` signature collision that
///      arises when inheriting both ERC20 and ERC721 from OpenZeppelin v5.
///
///      Circular dependency note: Governance calls DonationManager (to release escrow
///      and toggle crisis states), but DonationManager does NOT call back into Governance.
///      Instead, Governance pushes crisis state changes here via `activateCrisis` /
///      `deactivateCrisis`. This keeps DonationManager self-contained and deployable
///      before Governance.
///
///      Deployment order:
///        1. Deploy Registry
///        2. Deploy DonationManager(registry, address(0))   — governance not set yet
///        3. Deploy Governance(registry, donationManager)
///        4. Call donationManager.setGovernanceContract(governance)
contract DonationManager is ERC20, AccessControl, IDonationManager {
    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Lifecycle stages of an in-kind donation.
    /// @dev    Transitions are strictly one-way: PENDING → ASSIGNED → REDEEMED.
    enum Status { PENDING, ASSIGNED, REDEEMED }

    /// @notice On-chain record for a single in-kind donation item.
    struct InKindDonation {
        uint256 nftId;        // Auto-incremented item identifier (starts at 1)
        address donor;        // Address that committed the item
        string  metadataURI;  // IPFS URI: item description, photos, condition, quantity
        uint256 crisisId;     // Crisis this item is committed to
        Status  status;       // Current lifecycle stage
        address assignedTo;   // Beneficiary assigned by coordinator (address(0) if PENDING)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Registry — source of truth for participant identity and verification.
    IRegistry public immutable registry;

    /// @notice The Governance contract address.
    /// @dev    Set via setGovernanceContract() after Governance is deployed.
    ///         Until set, no donations can be accepted (no crises can be activated).
    address public governanceContract;

    /// @notice True if the crisis is currently accepting donations.
    /// @dev    Toggled by Governance via activateCrisis / deactivateCrisis.
    mapping(uint256 => bool) public activeCrises;

    /// @notice Total AID tokens held in escrow per crisis.
    mapping(uint256 => uint256) public crisisEscrow;

    /// @notice Total AID tokens donated by each address to each crisis.
    ///         Governance reads this to enforce per-role donation caps for voting.
    mapping(address => mapping(uint256 => uint256)) public donorContribution;

    /// @notice Elected coordinator per crisis. Set atomically when escrow is released.
    mapping(uint256 => address) public crisisCoordinator;

    /// @notice In-kind donation records, keyed by item ID.
    mapping(uint256 => InKindDonation) public inKindDonations;

    /// @notice Tracks the current owner of each in-kind item.
    ///         address(this) = held by contract (PENDING); beneficiary = after ASSIGNED.
    mapping(uint256 => address) private _nftOwners;

    /// @notice Auto-incrementing counter for in-kind item IDs. Starts at 0; first ID is 1.
    uint256 private _nftCounter;

    // ─────────────────────────────────────────────────────────────────────────
    // Custom errors
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Caller is not registered in the Registry.
    error NotRegistered(address caller);

    /// @notice The crisis is not in an active state that accepts donations.
    error CrisisNotActive(uint256 crisisId);

    /// @notice The crisis is already active (duplicate activation attempt).
    error CrisisAlreadyActive(uint256 crisisId);

    /// @notice The crisis is not active so it cannot be deactivated.
    error CrisisNotCurrentlyActive(uint256 crisisId);

    /// @notice Amount must be greater than zero.
    error ZeroAmount();

    /// @notice Caller is not the Governance contract.
    error NotGovernance(address caller);

    /// @notice Caller is not the elected coordinator for this crisis.
    error NotCoordinator(address caller, uint256 crisisId);

    /// @notice Caller is not the beneficiary assigned to this in-kind item.
    error NotAssignedBeneficiary(address caller, uint256 nftId);

    /// @notice In-kind item is not in the expected lifecycle stage.
    error WrongNFTStatus(uint256 nftId, Status expected, Status actual);

    /// @notice Beneficiary is not crisis-verified for the relevant crisis.
    error NotCrisisVerifiedBeneficiary(address beneficiary, uint256 crisisId);

    /// @notice A zero address was provided where a non-zero address is required.
    error ZeroAddress();

    /// @notice No escrow exists for this crisis (balance is zero).
    error EmptyEscrow(uint256 crisisId);

    /// @notice The requested in-kind item ID does not exist.
    error NFTNotFound(uint256 nftId);

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event FTDonationReceived(address indexed donor, uint256 indexed crisisId, uint256 amount);
    event InKindDonationReceived(address indexed donor, uint256 indexed crisisId, uint256 indexed nftId);
    event EscrowReleased(uint256 indexed crisisId, address indexed coordinator, uint256 amount);
    event FTDistributed(uint256 indexed crisisId, address indexed coordinator, address indexed beneficiary, uint256 amount);
    event InKindAssigned(uint256 indexed nftId, address indexed beneficiary);
    event InKindRedeemed(uint256 indexed nftId, address indexed beneficiary);
    event CrisisActivated(uint256 indexed crisisId);
    event CrisisDeactivated(uint256 indexed crisisId);
    event GovernanceContractSet(address indexed governance);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Deploy the DonationManager.
    /// @dev    The governance address can be address(0) at construction — use
    ///         setGovernanceContract() once Governance is deployed. Until the
    ///         governance address is set, no crises can be activated and no
    ///         donations can be accepted.
    /// @param _registry    Address of the already-deployed Registry contract.
    /// @param _governance  Governance contract address, or address(0) if not yet deployed.
    constructor(address _registry, address _governance)
        ERC20("OpenAID Donation Token", "AID")
    {
        if (_registry == address(0)) revert ZeroAddress();

        registry = IRegistry(_registry);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        if (_governance != address(0)) {
            governanceContract = _governance;
            emit GovernanceContractSet(_governance);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Configuration — admin only
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Set or update the Governance contract address.
    /// @dev    Callable only by the deployer (DEFAULT_ADMIN_ROLE). Allows the
    ///         governance address to be wired up after deployment to break the
    ///         circular constructor dependency.
    /// @param _governance  Address of the deployed Governance contract.
    function setGovernanceContract(address _governance)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (_governance == address(0)) revert ZeroAddress();
        governanceContract = _governance;
        emit GovernanceContractSet(_governance);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ERC20 configuration
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Return 0 decimals — 1 AID = 1 MAD, whole units only.
    /// @dev    Overrides ERC20's default of 18. Consistent with the thesis's
    ///         integer-only math convention.
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Crisis lifecycle — Governance only
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IDonationManager
    function activateCrisis(uint256 crisisId) external override {
        if (msg.sender != governanceContract) revert NotGovernance(msg.sender);
        if (activeCrises[crisisId]) revert CrisisAlreadyActive(crisisId);

        activeCrises[crisisId] = true;
        emit CrisisActivated(crisisId);
    }

    /// @inheritdoc IDonationManager
    function deactivateCrisis(uint256 crisisId) external override {
        if (msg.sender != governanceContract) revert NotGovernance(msg.sender);
        if (!activeCrises[crisisId]) revert CrisisNotCurrentlyActive(crisisId);

        activeCrises[crisisId] = false;
        emit CrisisDeactivated(crisisId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Donations — monetary (FT)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Donate fungible tokens to a crisis escrow pool.
    /// @dev    Caller must be registered in the Registry. Mints AID tokens directly
    ///         to this contract (escrow) — no ETH payment required in the thesis
    ///         prototype. Production would gate minting behind ETH/stablecoin payment.
    ///         Cumulative contributions per (donor, crisis) pair are tracked for
    ///         Governance's donation-cap voting-eligibility check.
    /// @param crisisId  An active crisis to donate to.
    /// @param amount    Number of AID tokens to mint (1 AID = 1 MAD).
    function donateFT(uint256 crisisId, uint256 amount) external {
        if (!registry.getParticipant(msg.sender).exists) revert NotRegistered(msg.sender);
        if (!activeCrises[crisisId]) revert CrisisNotActive(crisisId);
        if (amount == 0) revert ZeroAmount();

        _mint(address(this), amount);
        crisisEscrow[crisisId]                    += amount;
        donorContribution[msg.sender][crisisId]   += amount;

        emit FTDonationReceived(msg.sender, crisisId, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Donations — in-kind (custom NFT tracking)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Commit a physical item as an in-kind donation.
    /// @dev    Mints a new in-kind record for the item. The contract itself holds
    ///         the item (owner = address(this)) until the coordinator assigns it.
    ///         The metadataURI should point to an IPFS document with item description,
    ///         type, condition, quantity, and supporting photos.
    ///         Item IDs start at 1; ID 0 is used as a sentinel for "not found".
    /// @param crisisId    An active crisis this item is committed to.
    /// @param metadataURI IPFS URI describing the physical item.
    /// @return nftId      The ID assigned to the new in-kind donation record.
    function donateInKind(uint256 crisisId, string calldata metadataURI)
        external
        returns (uint256 nftId)
    {
        if (!registry.getParticipant(msg.sender).exists) revert NotRegistered(msg.sender);
        if (!activeCrises[crisisId]) revert CrisisNotActive(crisisId);

        nftId = ++_nftCounter;
        _nftOwners[nftId] = address(this);

        inKindDonations[nftId] = InKindDonation({
            nftId:       nftId,
            donor:       msg.sender,
            metadataURI: metadataURI,
            crisisId:    crisisId,
            status:      Status.PENDING,
            assignedTo:  address(0)
        });

        emit InKindDonationReceived(msg.sender, crisisId, nftId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Escrow management — Governance only
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IDonationManager
    /// @dev Transfers all FT in the crisis escrow to the elected coordinator and
    ///      records the coordinator's address on-chain. Subsequent distribution calls
    ///      (`distributeFTToBeneficiary`, `assignInKindToBeneficiary`) use this record
    ///      to enforce that only the elected coordinator can distribute.
    function releaseEscrowToCoordinator(uint256 crisisId, address coordinator)
        external
        override
    {
        if (msg.sender != governanceContract) revert NotGovernance(msg.sender);
        if (coordinator == address(0)) revert ZeroAddress();
        if (crisisEscrow[crisisId] == 0) revert EmptyEscrow(crisisId);

        uint256 amount = crisisEscrow[crisisId];
        crisisEscrow[crisisId]        = 0;
        crisisCoordinator[crisisId]   = coordinator;

        _transfer(address(this), coordinator, amount);
        emit EscrowReleased(crisisId, coordinator, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Distribution — elected coordinator only
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Send AID tokens from the coordinator's balance to a verified beneficiary.
    /// @dev    Coordinator must hold sufficient AID balance (received via releaseEscrow).
    ///         Beneficiary must be crisis-verified in the Registry for this specific crisis.
    /// @param crisisId    The crisis under which the distribution is made.
    /// @param beneficiary The crisis-verified beneficiary receiving the funds.
    /// @param amount      Number of AID tokens to transfer (must be > 0).
    function distributeFTToBeneficiary(
        uint256 crisisId,
        address beneficiary,
        uint256 amount
    ) external {
        if (msg.sender != crisisCoordinator[crisisId]) revert NotCoordinator(msg.sender, crisisId);
        if (!registry.isCrisisVerifiedBeneficiary(beneficiary, crisisId)) {
            revert NotCrisisVerifiedBeneficiary(beneficiary, crisisId);
        }
        if (amount == 0) revert ZeroAmount();

        _transfer(msg.sender, beneficiary, amount);
        emit FTDistributed(crisisId, msg.sender, beneficiary, amount);
    }

    /// @notice Assign a pending in-kind item to a crisis-verified beneficiary.
    /// @dev    Transitions the item PENDING → ASSIGNED and records the beneficiary.
    ///         This is step 2 of the three-way verification flow.
    ///         The item's on-chain "owner" is updated to the beneficiary.
    /// @param nftId       ID of the in-kind donation to assign.
    /// @param beneficiary Crisis-verified beneficiary who will receive the item.
    function assignInKindToBeneficiary(uint256 nftId, address beneficiary) external {
        InKindDonation storage donation = inKindDonations[nftId];
        if (donation.nftId == 0) revert NFTNotFound(nftId);

        uint256 crisisId = donation.crisisId;
        if (msg.sender != crisisCoordinator[crisisId]) revert NotCoordinator(msg.sender, crisisId);
        if (donation.status != Status.PENDING) {
            revert WrongNFTStatus(nftId, Status.PENDING, donation.status);
        }
        if (!registry.isCrisisVerifiedBeneficiary(beneficiary, crisisId)) {
            revert NotCrisisVerifiedBeneficiary(beneficiary, crisisId);
        }

        donation.status     = Status.ASSIGNED;
        donation.assignedTo = beneficiary;
        _nftOwners[nftId]   = beneficiary;

        emit InKindAssigned(nftId, beneficiary);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Redemption — assigned beneficiary only
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Confirm physical receipt of an assigned in-kind item.
    /// @dev    Transitions the item ASSIGNED → REDEEMED. This is step 3 of the
    ///         three-way verification flow and closes the accountability loop.
    ///         A missing confirmation is a signal to Governance that the coordinator
    ///         may not have physically delivered the item — it can trigger a misconduct
    ///         vote in the Governance contract.
    /// @param nftId  ID of the in-kind donation being confirmed as received.
    function confirmInKindRedemption(uint256 nftId) external {
        InKindDonation storage donation = inKindDonations[nftId];
        if (donation.nftId == 0) revert NFTNotFound(nftId);
        if (msg.sender != donation.assignedTo) revert NotAssignedBeneficiary(msg.sender, nftId);
        if (donation.status != Status.ASSIGNED) {
            revert WrongNFTStatus(nftId, Status.ASSIGNED, donation.status);
        }

        donation.status = Status.REDEEMED;
        emit InKindRedeemed(nftId, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View functions
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IDonationManager
    function getDonorContribution(address donor, uint256 crisisId)
        external
        view
        override
        returns (uint256)
    {
        return donorContribution[donor][crisisId];
    }

    /// @inheritdoc IDonationManager
    function getCrisisEscrowBalance(uint256 crisisId)
        external
        view
        override
        returns (uint256)
    {
        return crisisEscrow[crisisId];
    }

    /// @notice Return the full in-kind donation record for a given item ID.
    /// @param nftId  The in-kind item ID to query.
    /// @return       The InKindDonation struct (all fields, including current status).
    function getInKindDonation(uint256 nftId)
        external
        view
        returns (InKindDonation memory)
    {
        return inKindDonations[nftId];
    }

    /// @notice Return the current on-chain holder of an in-kind item.
    /// @dev    address(this) = held in contract (PENDING).
    ///         Beneficiary address = assigned (ASSIGNED or REDEEMED).
    /// @param nftId  The in-kind item ID to query.
    /// @return       Address currently holding the item.
    function nftOwnerOf(uint256 nftId) external view returns (address) {
        address owner = _nftOwners[nftId];
        if (owner == address(0)) revert NFTNotFound(nftId);
        return owner;
    }

    /// @notice Return the total number of in-kind donations minted.
    function nftTotalSupply() external view returns (uint256) {
        return _nftCounter;
    }
}
