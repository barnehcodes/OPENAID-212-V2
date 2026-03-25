# DonationManager — Financial Engine

## Purpose

The DonationManager (`contracts/DonationManager.sol`) handles all asset flows in OpenAID +212. It is responsible for:

- Minting and managing the **AID ERC20 token** (1 AID = 1 MAD)
- Holding **crisis-bound escrow** until a coordinator is elected
- Tracking **in-kind donations** through a custom NFT-like lifecycle
- Enabling **direct non-crisis donations** from donors to beneficiaries
- Enforcing the **three-way verification flow** (donor → coordinator → beneficiary)

## Contract Inheritance

```
DonationManager is ERC20, AccessControl, IDonationManager
```

- **ERC20** (OpenZeppelin v5): The AID fungible token — `"OpenAID Donation Token"` with symbol `"AID"`
- **AccessControl** (OpenZeppelin v5): Admin role for governance contract wiring
- **IDonationManager**: Interface defining the public API and events

## ERC20 AID Token

| Property | Value |
|----------|-------|
| Name | `OpenAID Donation Token` |
| Symbol | `AID` |
| Decimals | `0` (overridden from ERC20's default of 18) |
| Minting | On-chain via `_mint()` — no ETH payment required (thesis prototype) |
| Peg | 1 AID = 1 MAD (Moroccan Dirham), whole units only |

The `decimals()` function returns `0`, consistent with the system's integer-only math convention. In production, minting would be gated behind ETH/stablecoin payment.

## Donation Paths

### 1. Crisis-Bound FT Donations: `donateFT(uint256 crisisId, uint256 amount)`

- **Caller**: Any registered participant
- **Flow**: Mints `amount` AID tokens to `address(this)` (escrow)
- **State updates**:
  - `crisisEscrow[crisisId] += amount`
  - `donorContribution[msg.sender][crisisId] += amount`
- **Preconditions**: Crisis must be active, amount > 0, caller registered
- **Voting power**: `donorContribution` is read by Governance to enforce per-role donation caps for voting eligibility

### 2. Direct FT Donations: `directDonateFT(address beneficiary, uint256 amount)`

- **Caller**: Any registered participant
- **Flow**: Mints `amount` AID tokens **directly to the beneficiary**
- **No crisis required** — this is for non-crisis peer-to-peer aid
- **No voting power** — `donorContribution` is NOT updated
- **Preconditions**: Beneficiary must be a registered Beneficiary (checked via Registry)
- **Events**: `DirectFTDonation(donor, beneficiary, amount)`

### 3. In-Kind Donations: `donateInKind(uint256 crisisId, string calldata metadataURI)`

- **Caller**: Any registered participant
- **Flow**: Creates an `InKindDonation` record with auto-incremented ID (starting at 1)
- **Metadata**: `metadataURI` should point to an IPFS document describing the physical item (type, condition, quantity, photos)
- **Ownership**: Contract holds the item (`_nftOwners[nftId] = address(this)`)
- **Status**: Starts as `PENDING`
- **Returns**: The assigned `nftId`

#### Why Not ERC721?

Inheriting both ERC20 and ERC721 from OpenZeppelin v5 causes a function signature collision: both define `_transfer(address, address, uint256)` with incompatible semantics. Rather than introducing complex resolution patterns, in-kind donations use a custom struct with manual ownership tracking. This provides the same lifecycle guarantees (PENDING → ASSIGNED → REDEEMED) without the inheritance conflict.

## In-Kind Donation Lifecycle

```solidity
enum Status { PENDING, ASSIGNED, REDEEMED }

struct InKindDonation {
    uint256 nftId;        // Auto-incremented item ID (starts at 1)
    address donor;        // Address that committed the item
    string  metadataURI;  // IPFS URI: item description, photos, condition
    uint256 crisisId;     // Crisis this item is committed to
    Status  status;       // Current lifecycle stage
    address assignedTo;   // Beneficiary assigned by coordinator
}
```

```mermaid
stateDiagram-v2
    [*] --> PENDING: donateInKind()
    PENDING --> ASSIGNED: assignInKindToBeneficiary()
    ASSIGNED --> REDEEMED: confirmInKindRedemption()
    REDEEMED --> [*]

    note right of PENDING
        Owner: contract (address(this))
        Donor commits physical item
    end note

    note right of ASSIGNED
        Owner: beneficiary
        Coordinator assigns to beneficiary
    end note

    note right of REDEEMED
        Owner: beneficiary
        Beneficiary confirms receipt
    end note
```

| Transition | Called By | Preconditions |
|-----------|----------|---------------|
| PENDING → ASSIGNED | Elected coordinator (`crisisCoordinator[crisisId]`) | Item exists, status == PENDING, beneficiary is crisis-verified |
| ASSIGNED → REDEEMED | Assigned beneficiary (`donation.assignedTo`) | Item exists, status == ASSIGNED, caller == assignedTo |

## Three-Way Verification Flow

The three-way verification flow creates an accountability chain for every donation:

```mermaid
sequenceDiagram
    participant Donor
    participant DM as DonationManager
    participant GOV as Governance
    participant Coord as Coordinator
    participant Ben as Beneficiary

    Note over Donor,Ben: Step 1: Donor commits funds
    Donor->>DM: donateFT(crisisId, amount)
    DM->>DM: _mint(address(this), amount)
    Note over DM: Funds held in escrow

    Note over GOV: Election finalizes...
    GOV->>DM: releaseEscrowToCoordinator(crisisId, winner)
    DM->>DM: _transfer(address(this), coordinator, amount)
    Note over DM: Coordinator holds funds

    Note over Coord,Ben: Step 2: Coordinator distributes
    Coord->>DM: distributeFTToBeneficiary(crisisId, ben, amount)
    DM->>DM: _transfer(coordinator, beneficiary, amount)
    Note over DM: Beneficiary receives funds

    Note over Donor,Ben: In-Kind Path
    Donor->>DM: donateInKind(crisisId, metadataURI)
    Note over DM: Item record created (PENDING)
    Coord->>DM: assignInKindToBeneficiary(nftId, ben)
    Note over DM: Status → ASSIGNED
    Ben->>DM: confirmInKindRedemption(nftId)
    Note over DM: Status → REDEEMED
```

### FT Donation Flow (Detailed)

```mermaid
flowchart LR
    DONOR["Donor<br/>donateFT()"] -->|mint AID| ESCROW["Crisis Escrow<br/>address(this)"]
    ESCROW -->|releaseEscrowToCoordinator()| COORD["Coordinator<br/>elected winner"]
    COORD -->|distributeFTToBeneficiary()| BEN["Beneficiary<br/>crisis-verified"]

    style ESCROW fill:#fff3e0,stroke:#e65100
    style COORD fill:#f3e5f5,stroke:#4a148c
    style BEN fill:#c8e6c9,stroke:#1b5e20
```

## Escrow Management

### `releaseEscrowToCoordinator(uint256 crisisId, address coordinator)`

- **Caller**: Governance contract only
- **Flow**: Transfers all AID in `crisisEscrow[crisisId]` to the coordinator
- **Side effects**:
  - Sets `crisisCoordinator[crisisId] = coordinator` (enables distribution calls)
  - Zeros out `crisisEscrow[crisisId]`
- **Preconditions**: Coordinator not zero, escrow not empty

### `distributeFTToBeneficiary(uint256 crisisId, address beneficiary, uint256 amount)`

- **Caller**: Elected coordinator only (`msg.sender == crisisCoordinator[crisisId]`)
- **Flow**: Transfers AID from coordinator's balance to the beneficiary
- **Preconditions**: Beneficiary is crisis-verified via Registry, amount > 0

## Crisis Lifecycle Integration

The DonationManager tracks crisis activation state via the `activeCrises` mapping. Governance controls this:

| Function | Called By | Effect |
|----------|----------|--------|
| `activateCrisis(crisisId)` | Governance (on `declareCrisis()`) | Opens donations for this crisis |
| `deactivateCrisis(crisisId)` | Governance (on `finalizeElection()`) | Closes donations — coordinator now distributes |

## State Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `registry` | `IRegistry` (immutable) | Source of truth for identity |
| `governanceContract` | `address` | Governance contract — set post-deployment |
| `activeCrises` | `mapping(uint256 => bool)` | Whether a crisis is accepting donations |
| `crisisEscrow` | `mapping(uint256 => uint256)` | AID held in escrow per crisis |
| `donorContribution` | `mapping(address => mapping(uint256 => uint256))` | Per-donor per-crisis donation total |
| `crisisCoordinator` | `mapping(uint256 => address)` | Elected coordinator per crisis |
| `inKindDonations` | `mapping(uint256 => InKindDonation)` | In-kind donation records |
| `_nftOwners` | `mapping(uint256 => address)` | Current holder of each in-kind item |
| `_nftCounter` | `uint256` | Auto-incrementing item ID counter |

## View Functions

| Function | Returns |
|----------|---------|
| `getDonorContribution(donor, crisisId)` | Cumulative AID donated by `donor` to `crisisId` |
| `getCrisisEscrowBalance(crisisId)` | AID currently held in escrow for `crisisId` |
| `getInKindDonation(nftId)` | Full `InKindDonation` struct |
| `nftOwnerOf(nftId)` | Current holder address (`address(this)` if PENDING, beneficiary if ASSIGNED/REDEEMED) |
| `nftTotalSupply()` | Total number of in-kind donations minted |

## Custom Errors

| Error | Trigger |
|-------|---------|
| `NotRegistered(caller)` | Caller not in Registry |
| `CrisisNotActive(crisisId)` | Donation to inactive crisis |
| `CrisisAlreadyActive(crisisId)` | Double activation |
| `CrisisNotCurrentlyActive(crisisId)` | Deactivation of inactive crisis |
| `ZeroAmount()` | Zero-value donation or distribution |
| `NotGovernance(caller)` | Non-Governance caller for restricted functions |
| `NotCoordinator(caller, crisisId)` | Non-coordinator calling distribution functions |
| `NotAssignedBeneficiary(caller, nftId)` | Wrong beneficiary confirming redemption |
| `WrongNFTStatus(nftId, expected, actual)` | In-kind item not in expected lifecycle stage |
| `NotCrisisVerifiedBeneficiary(beneficiary, crisisId)` | Beneficiary not verified for this crisis |
| `ZeroAddress()` | Zero address in constructor or setGovernanceContract |
| `EmptyEscrow(crisisId)` | Releasing escrow with zero balance |
| `NFTNotFound(nftId)` | Nonexistent in-kind item ID |
| `NotRegisteredBeneficiary(beneficiary)` | `directDonateFT` to non-beneficiary |
