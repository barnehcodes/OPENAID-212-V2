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
        uint256 crisisId;     // Crisis this item is committed to (0 = direct donation)
        Status  status;       // Current lifecycle stage
        address assignedTo;   // Beneficiary assigned by coordinator (address(0) if PENDING)
        address facility;     // GO/NGO handling logistics. address(0) for crisis-bound.
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
    /// @dev    Set true on `activateCrisis` (called from Governance.declareCrisis,
    ///         so donations open at DECLARED) and only set false on `deactivateCrisis`
    ///         (called from Governance.closeCrisis). Donations therefore remain open
    ///         throughout DECLARED, VOTING, ACTIVE, REVIEW, and PAUSED phases —
    ///         only CLOSED stops new donations. Distribution is gated separately by
    ///         `crisisPaused`.
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

    /// @notice Whether a crisis is currently paused (frozen escrow, no distributions).
    mapping(uint256 => bool) public crisisPaused;

    /// @notice Auto-incrementing counter for in-kind item IDs. Starts at 0; first ID is 1.
    uint256 private _nftCounter;

    /// @notice Samaritan score: incremented each time a donor confirms they tracked a donation.
    mapping(address => uint256) public samaritanScore;

    /// @notice Whether a donor has already tracked their crisis-bound FT donation.
    mapping(address => mapping(uint256 => bool)) public hasTrackedCrisis;

    /// @notice Whether a donor has already tracked their in-kind donation.
    mapping(address => mapping(uint256 => bool)) public hasTrackedInKind;

    /// @notice Cumulative FT amount received by a beneficiary for a given crisis.
    mapping(address => mapping(uint256 => uint256)) public ftReceived;

    /// @notice Whether a beneficiary has confirmed FT receipt for a given crisis.
    mapping(address => mapping(uint256 => bool)) public ftConfirmed;

    /// @notice Cumulative direct FT amount donated by a donor to a specific beneficiary.
    mapping(address => mapping(address => uint256)) public directFTDonated;

    /// @notice Whether a donor has already tracked their direct FT donation to a beneficiary.
    mapping(address => mapping(address => bool)) public hasTrackedDirectFT;

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

    /// @notice Escrow balance is less than the requested distribution amount.
    error InsufficientEscrow(uint256 crisisId, uint256 requested);

    /// @notice The requested in-kind item ID does not exist.
    error NFTNotFound(uint256 nftId);

    /// @notice The target address is not a registered beneficiary.
    error NotRegisteredBeneficiary(address beneficiary);

    /// @notice The facility address is not a verified validator (GO/NGO).
    error NotVerifiedValidator(address facility);

    /// @notice Caller is not the designated facility for this in-kind item.
    error NotFacility(address caller, uint256 nftId);

    /// @notice The crisis is currently paused (frozen escrow, no distributions).
    error CrisisIsPaused(uint256 crisisId);

    /// @notice Caller has not donated FT to this crisis.
    error NotDonorForCrisis(address caller, uint256 crisisId);

    /// @notice Caller is not the donor of this in-kind item.
    error NotDonorOfItem(address caller, uint256 nftId);

    /// @notice Donor has already tracked this crisis donation.
    error AlreadyTrackedCrisis(address caller, uint256 crisisId);

    /// @notice Donor has already tracked this in-kind donation.
    error AlreadyTrackedInKind(address caller, uint256 nftId);

    /// @notice Crisis has no coordinator yet and is not paused — distribution hasn't started.
    error CrisisNotYetDistributing(uint256 crisisId);

    /// @notice In-kind item is still PENDING — not yet assigned or delivered.
    error InKindNotYetAssigned(uint256 nftId);

    /// @notice Beneficiary has not received any FT for this crisis.
    error NothingToConfirm(address caller, uint256 crisisId);

    /// @notice Beneficiary has already confirmed FT receipt for this crisis.
    error AlreadyConfirmedFT(address caller, uint256 crisisId);

    /// @notice Caller has not donated direct FT to this beneficiary.
    error NoDirectFTToBeneficiary(address caller, address beneficiary);

    /// @notice Caller has already tracked their direct FT donation to this beneficiary.
    error AlreadyTrackedDirectFT(address caller, address beneficiary);

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
    event DirectFTDonation(address indexed donor, address indexed beneficiary, uint256 amount);
    event DirectInKindDonation(address indexed donor, address indexed facility, address indexed beneficiary, uint256 nftId);
    event FacilityDeliveryConfirmed(uint256 indexed nftId, address indexed facility, address indexed beneficiary);
    event CrisisPaused(uint256 indexed crisisId);
    event CrisisUnpaused(uint256 indexed crisisId);
    event FundsRedirected(uint256 indexed fromCrisisId, uint256 indexed toCrisisId, uint256 amount);
    event CrisisDonationTracked(address indexed donor, uint256 indexed crisisId, uint256 newScore);
    event InKindDonationTracked(address indexed donor, uint256 indexed nftId, uint256 newScore);
    event FTReceiptConfirmed(address indexed beneficiary, uint256 indexed crisisId, uint256 amount);
    event DirectFTDonationTracked(address indexed donor, address indexed beneficiary, uint256 newScore);

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
    /// @dev Called from Governance.closeCrisis. Stops new donations for the
    ///      crisis. Existing escrow remains and can be redirected via
    ///      carryOverEscrow() to an open crisis.
    function deactivateCrisis(uint256 crisisId) external override {
        if (msg.sender != governanceContract) revert NotGovernance(msg.sender);
        if (!activeCrises[crisisId]) revert CrisisNotCurrentlyActive(crisisId);

        activeCrises[crisisId] = false;
        emit CrisisDeactivated(crisisId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Crisis pause/unpause — Governance only
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IDonationManager
    /// @dev Freezes distributions and revokes coordinator authority.
    ///      Incoming donations remain accepted (continuous-flow model).
    function pauseCrisis(uint256 crisisId) external override {
        if (msg.sender != governanceContract) revert NotGovernance(msg.sender);
        crisisPaused[crisisId] = true;
        crisisCoordinator[crisisId] = address(0);
        emit CrisisPaused(crisisId);
    }

    /// @inheritdoc IDonationManager
    /// @dev Unfreezes escrow: reopens donations.
    function unpauseCrisis(uint256 crisisId) external override {
        if (msg.sender != governanceContract) revert NotGovernance(msg.sender);
        crisisPaused[crisisId] = false;
        activeCrises[crisisId] = true;
        emit CrisisUnpaused(crisisId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Escrow carryover — Governance only
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IDonationManager
    /// @dev Moves leftover funds from a closed crisis to an open crisis.
    ///      fromCrisisId must NOT be active (closed). toCrisisId must be active.
    function carryOverEscrow(
        uint256 fromCrisisId,
        uint256 toCrisisId,
        uint256 amount
    ) external override {
        if (msg.sender != governanceContract) revert NotGovernance(msg.sender);
        if (amount == 0) revert ZeroAmount();
        if (!activeCrises[toCrisisId]) revert CrisisNotActive(toCrisisId);
        if (amount > crisisEscrow[fromCrisisId]) revert InsufficientEscrow(fromCrisisId, amount);

        crisisEscrow[fromCrisisId] -= amount;
        crisisEscrow[toCrisisId]   += amount;

        emit FundsRedirected(fromCrisisId, toCrisisId, amount);
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
    // Direct donations — non-crisis path
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Mint AID tokens directly to a registered beneficiary without a crisis.
    /// @dev    Non-crisis donation path for registered participants who want to give
    ///         directly to beneficiaries. Does NOT update donorContribution (direct
    ///         donations grant no governance voting power). Does NOT require an active
    ///         crisis or escrow — tokens are minted directly to the beneficiary.
    /// @param beneficiary  A registered participant with Role.Beneficiary.
    /// @param amount       Number of AID tokens to mint (must be > 0).
    function directDonateFT(address beneficiary, uint256 amount) external override {
        if (!registry.getParticipant(msg.sender).exists) revert NotRegistered(msg.sender);
        if (amount == 0) revert ZeroAmount();

        IRegistry.Participant memory p = registry.getParticipant(beneficiary);
        if (!p.exists || p.role != IRegistry.Role.Beneficiary) {
            revert NotRegisteredBeneficiary(beneficiary);
        }

        _mint(beneficiary, amount);
        directFTDonated[msg.sender][beneficiary] += amount;
        emit DirectFTDonation(msg.sender, beneficiary, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Direct donations — in-kind (three-party flow)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Create a direct (non-crisis) in-kind donation routed through a facility.
    /// @dev    Three-party flow: Donor → Facility (verified GO/NGO) → Beneficiary.
    ///         The facility must confirm delivery before the beneficiary can redeem.
    /// @param facility     A verified GO or NGO handling logistics.
    /// @param beneficiary  A registered beneficiary who will receive the item.
    /// @param metadataURI  IPFS URI describing the physical item.
    /// @return nftId       The ID assigned to the new in-kind donation record.
    function directDonateInKind(
        address facility,
        address beneficiary,
        string calldata metadataURI
    ) external returns (uint256 nftId) {
        if (!registry.getParticipant(msg.sender).exists) revert NotRegistered(msg.sender);
        if (!registry.isVerifiedValidator(facility)) revert NotVerifiedValidator(facility);

        IRegistry.Participant memory p = registry.getParticipant(beneficiary);
        if (!p.exists || p.role != IRegistry.Role.Beneficiary) {
            revert NotRegisteredBeneficiary(beneficiary);
        }

        nftId = ++_nftCounter;
        _nftOwners[nftId] = address(this);

        inKindDonations[nftId] = InKindDonation({
            nftId:       nftId,
            donor:       msg.sender,
            metadataURI: metadataURI,
            crisisId:    0,
            status:      Status.PENDING,
            assignedTo:  beneficiary,
            facility:    facility
        });

        emit DirectInKindDonation(msg.sender, facility, beneficiary, nftId);
    }

    /// @notice Facility confirms physical delivery of a direct in-kind donation.
    /// @dev    Transitions PENDING → ASSIGNED and transfers ownership to beneficiary.
    ///         Only the designated facility can call this.
    /// @param nftId  The in-kind item ID to confirm delivery for.
    function confirmFacilityDelivery(uint256 nftId) external {
        InKindDonation storage donation = inKindDonations[nftId];
        if (donation.nftId == 0) revert NFTNotFound(nftId);
        if (msg.sender != donation.facility) revert NotFacility(msg.sender, nftId);
        if (donation.status != Status.PENDING) {
            revert WrongNFTStatus(nftId, Status.PENDING, donation.status);
        }

        donation.status = Status.ASSIGNED;
        _nftOwners[nftId] = donation.assignedTo;

        emit FacilityDeliveryConfirmed(nftId, msg.sender, donation.assignedTo);
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
            assignedTo:  address(0),
            facility:    address(0)
        });

        emit InKindDonationReceived(msg.sender, crisisId, nftId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Escrow management — Governance only
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IDonationManager
    /// @dev Records the coordinator's address on-chain and grants distribution
    ///      authority. Funds remain in address(this) — the coordinator never holds
    ///      tokens. Subsequent distribution calls pull directly from escrow.
    function releaseEscrowToCoordinator(uint256 crisisId, address coordinator)
        external
        override
    {
        if (msg.sender != governanceContract) revert NotGovernance(msg.sender);
        if (coordinator == address(0)) revert ZeroAddress();
        if (crisisEscrow[crisisId] == 0) revert EmptyEscrow(crisisId);

        crisisCoordinator[crisisId] = coordinator;
        emit EscrowReleased(crisisId, coordinator, crisisEscrow[crisisId]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Distribution — elected coordinator only
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Send AID tokens from the crisis escrow to a verified beneficiary.
    /// @dev    Pulls directly from address(this) escrow balance. Coordinator has
    ///         distribution authority but never holds the tokens.
    /// @param crisisId    The crisis under which the distribution is made.
    /// @param beneficiary The crisis-verified beneficiary receiving the funds.
    /// @param amount      Number of AID tokens to transfer (must be > 0).
    function distributeFTToBeneficiary(
        uint256 crisisId,
        address beneficiary,
        uint256 amount
    ) external {
        if (crisisPaused[crisisId]) revert CrisisIsPaused(crisisId);
        if (msg.sender != crisisCoordinator[crisisId]) revert NotCoordinator(msg.sender, crisisId);
        if (!registry.isCrisisVerifiedBeneficiary(beneficiary, crisisId)) {
            revert NotCrisisVerifiedBeneficiary(beneficiary, crisisId);
        }
        if (amount == 0) revert ZeroAmount();
        if (amount > crisisEscrow[crisisId]) revert InsufficientEscrow(crisisId, amount);

        crisisEscrow[crisisId] -= amount;
        ftReceived[beneficiary][crisisId] += amount;
        _transfer(address(this), beneficiary, amount);
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
        if (crisisPaused[crisisId]) revert CrisisIsPaused(crisisId);
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

    // ─────────────────────────────────────────────────────────────────────────
    // Samaritan Score — donor engagement tracking
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Confirm tracking of a crisis-bound FT donation, incrementing the donor's Samaritan score.
    /// @dev    Donor must have contributed to the crisis and distribution must have started
    ///         (coordinator elected or crisis paused). Each (donor, crisis) pair can only be tracked once.
    /// @param crisisId  The crisis the donor contributed FT to.
    function confirmCrisisDonationTracked(uint256 crisisId) external {
        if (donorContribution[msg.sender][crisisId] == 0) revert NotDonorForCrisis(msg.sender, crisisId);
        if (hasTrackedCrisis[msg.sender][crisisId]) revert AlreadyTrackedCrisis(msg.sender, crisisId);
        if (crisisCoordinator[crisisId] == address(0) && !crisisPaused[crisisId]) {
            revert CrisisNotYetDistributing(crisisId);
        }

        hasTrackedCrisis[msg.sender][crisisId] = true;
        samaritanScore[msg.sender] += 1;
        emit CrisisDonationTracked(msg.sender, crisisId, samaritanScore[msg.sender]);
    }

    /// @notice Confirm tracking of an in-kind donation, incrementing the donor's Samaritan score.
    /// @dev    Covers both crisis-bound and direct in-kind donations. The item must have
    ///         progressed past PENDING (ASSIGNED or REDEEMED). Each (donor, nftId) pair
    ///         can only be tracked once.
    /// @param nftId  The in-kind item the donor committed.
    function confirmInKindTracked(uint256 nftId) external {
        InKindDonation storage donation = inKindDonations[nftId];
        if (donation.nftId == 0) revert NFTNotFound(nftId);
        if (donation.donor != msg.sender) revert NotDonorOfItem(msg.sender, nftId);
        if (hasTrackedInKind[msg.sender][nftId]) revert AlreadyTrackedInKind(msg.sender, nftId);
        if (donation.status == Status.PENDING) revert InKindNotYetAssigned(nftId);

        hasTrackedInKind[msg.sender][nftId] = true;
        samaritanScore[msg.sender] += 1;
        emit InKindDonationTracked(msg.sender, nftId, samaritanScore[msg.sender]);
    }

    /// @notice Return the Samaritan score for a donor.
    /// @param donor  The donor address to query.
    /// @return       The donor's cumulative Samaritan score.
    function getSamaritanScore(address donor) external view returns (uint256) {
        return samaritanScore[donor];
    }

    /// @notice Check if a donor has already tracked their crisis FT donation.
    /// @param donor     The donor address.
    /// @param crisisId  The crisis to check.
    /// @return          True if the donor has already tracked this crisis donation.
    function hasDonorTrackedCrisis(address donor, uint256 crisisId) external view returns (bool) {
        return hasTrackedCrisis[donor][crisisId];
    }

    /// @notice Check if a donor has already tracked their in-kind donation.
    /// @param donor  The donor address.
    /// @param nftId  The in-kind item ID to check.
    /// @return       True if the donor has already tracked this in-kind donation.
    function hasDonorTrackedInKind(address donor, uint256 nftId) external view returns (bool) {
        return hasTrackedInKind[donor][nftId];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FT Beneficiary Confirmation
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Beneficiary confirms receipt of FT distributions for a crisis.
    /// @dev    Beneficiary must have received FT via distributeFTToBeneficiary().
    ///         Each (beneficiary, crisis) pair can only be confirmed once.
    /// @param crisisId  The crisis the beneficiary received FT from.
    function confirmFTReceipt(uint256 crisisId) external {
        IRegistry.Participant memory p = registry.getParticipant(msg.sender);
        if (!p.exists || p.role != IRegistry.Role.Beneficiary) {
            revert NotRegisteredBeneficiary(msg.sender);
        }
        if (ftReceived[msg.sender][crisisId] == 0) revert NothingToConfirm(msg.sender, crisisId);
        if (ftConfirmed[msg.sender][crisisId]) revert AlreadyConfirmedFT(msg.sender, crisisId);

        ftConfirmed[msg.sender][crisisId] = true;
        emit FTReceiptConfirmed(msg.sender, crisisId, ftReceived[msg.sender][crisisId]);
    }

    /// @notice Return the cumulative FT amount received by a beneficiary for a crisis.
    /// @param beneficiary  The beneficiary address.
    /// @param crisisId     The crisis to query.
    /// @return             Total AID tokens received by this beneficiary for this crisis.
    function getFTReceivedAmount(address beneficiary, uint256 crisisId) external view returns (uint256) {
        return ftReceived[beneficiary][crisisId];
    }

    /// @notice Check if a beneficiary has confirmed FT receipt for a crisis.
    /// @param beneficiary  The beneficiary address.
    /// @param crisisId     The crisis to check.
    /// @return             True if the beneficiary has confirmed receipt.
    function hasBeneficiaryConfirmedFT(address beneficiary, uint256 crisisId) external view returns (bool) {
        return ftConfirmed[beneficiary][crisisId];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Direct FT Donation Tracking — Samaritan Score
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Confirm tracking of a direct FT donation, incrementing the donor's Samaritan score.
    /// @dev    Donor must have previously called directDonateFT() for this beneficiary.
    ///         Each (donor, beneficiary) pair can only be tracked once.
    /// @param beneficiary  The beneficiary the donor sent direct FT to.
    function confirmDirectFTTracked(address beneficiary) external {
        if (directFTDonated[msg.sender][beneficiary] == 0) {
            revert NoDirectFTToBeneficiary(msg.sender, beneficiary);
        }
        if (hasTrackedDirectFT[msg.sender][beneficiary]) {
            revert AlreadyTrackedDirectFT(msg.sender, beneficiary);
        }

        hasTrackedDirectFT[msg.sender][beneficiary] = true;
        samaritanScore[msg.sender] += 1;
        emit DirectFTDonationTracked(msg.sender, beneficiary, samaritanScore[msg.sender]);
    }

    /// @notice Return the cumulative direct FT amount donated by a donor to a beneficiary.
    /// @param donor        The donor address.
    /// @param beneficiary  The beneficiary address.
    /// @return             Total AID tokens donated directly to this beneficiary.
    function getDirectFTDonated(address donor, address beneficiary) external view returns (uint256) {
        return directFTDonated[donor][beneficiary];
    }

    /// @notice Check if a donor has already tracked their direct FT donation to a beneficiary.
    /// @param donor        The donor address.
    /// @param beneficiary  The beneficiary address.
    /// @return             True if the donor has already tracked this direct FT donation.
    function hasDonorTrackedDirectFT(address donor, address beneficiary) external view returns (bool) {
        return hasTrackedDirectFT[donor][beneficiary];
    }
}
