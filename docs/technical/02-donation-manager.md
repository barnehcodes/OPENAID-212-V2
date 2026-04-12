# DonationManager — Financial Engine

## Purpose

The DonationManager (`contracts/DonationManager.sol`) handles all asset flows in OpenAID +212. It is responsible for:

- Minting and managing the **AID ERC20 token** (1 AID = 1 MAD)
- Holding **crisis-bound escrow** and granting **distribution authority** to coordinators
- Tracking **in-kind donations** through a custom NFT-like lifecycle
- Enabling **direct non-crisis donations** (FT and in-kind) from donors to beneficiaries
- Enforcing the **three-way verification flow** (donor → coordinator → beneficiary)
- Supporting **escrow freeze/unfreeze** during misconduct investigations

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
- **Preconditions**: Crisis must not be CLOSED, amount > 0, caller registered
- **Donation window**: Open across the entire crisis lifecycle except CLOSED — DECLARED, VOTING, ACTIVE, REVIEW, and PAUSED all accept donations (continuous-flow escrow). Only `closeCrisis()` stops new donations.
- **Voting power**: `donorContribution` is read by Governance to enforce per-role donation caps for voting eligibility

### 2. Direct FT Donations: `directDonateFT(address beneficiary, uint256 amount)`

- **Caller**: Any registered participant
- **Flow**: Mints `amount` AID tokens **directly to the beneficiary**
- **No crisis required** — this is for non-crisis peer-to-peer aid
- **No voting power** — `donorContribution` is NOT updated
- **Preconditions**: Beneficiary must be a registered Beneficiary (checked via Registry)
- **Events**: `DirectFTDonation(donor, beneficiary, amount)`

### 3. Crisis-Bound In-Kind Donations: `donateInKind(uint256 crisisId, string calldata metadataURI)`

- **Caller**: Any registered participant
- **Flow**: Creates an `InKindDonation` record with auto-incremented ID (starting at 1)
- **Metadata**: `metadataURI` should point to an IPFS document describing the physical item (type, condition, quantity, photos)
- **Ownership**: Contract holds the item (`_nftOwners[nftId] = address(this)`)
- **Status**: Starts as `PENDING`, `facility` set to `address(0)` (crisis-bound)
- **Returns**: The assigned `nftId`

### 4. Direct In-Kind Donations: `directDonateInKind(address facility, address beneficiary, string calldata metadataURI)`

- **Caller**: Any registered participant
- **Flow**: Creates an `InKindDonation` record routed through a verified facility (GO/NGO)
- **Three-party flow**: Donor → Facility confirms delivery → Beneficiary confirms receipt
- **No crisis required** — `crisisId` is set to 0
- **Preconditions**: Facility must be a verified validator, beneficiary must be a registered Beneficiary
- **Events**: `DirectInKindDonation(donor, facility, beneficiary, nftId)`

#### Why Not ERC721?

Inheriting both ERC20 and ERC721 from OpenZeppelin v5 causes a function signature collision: 
in simple terms both ERC20 (for Fungible tokens ) and ERC721 (for non-FT) have the same internal function` _transfer`  same name, and same parameter types `(address, address, uint256)`, but do diffrent things.
if we inherits both,  the code wont knwo which is which (tranfer FT or NFT), so the solution i came up with is to inherits only ERC20 (for the AID token) and handles in-kind donations with a plain struct and mapping: 
@note: there's another way of doing this and still inherits both, but that would require to override both and manually seperate concerns (gets complicated), teh current approach is not the ultimate win, we lose some featuires that come with ERC721 transferFrom, approve, and some wallets compatibility but we are willing to make that loss since its humanitarian not marketplace.

```solidity 
mapping(uint256 => InKindDonation) public inKindDonations;
mapping(uint256 => address) private _nftOwners;
uint256 private _nftCounter;
```

## In-Kind Donation Lifecycle

```solidity
enum Status { PENDING, ASSIGNED, REDEEMED }

struct InKindDonation {
    uint256 nftId;        // Auto-incremented item ID (starts at 1)
    address donor;        // Address that committed the item
    string  metadataURI;  // IPFS URI: item description, photos, condition
    uint256 crisisId;     // Crisis this item is committed to (0 = direct donation)
    Status  status;       // Current lifecycle stage
    address assignedTo;   // Beneficiary assigned by coordinator
    address facility;     // GO/NGO handling logistics (address(0) for crisis-bound)
}
```
**Crisis-bound in-kind donations**  follows the three-way verification flow through the elected coordinator,  it starts by the donor commiting a physical item by calling donateInKind() with the crisis ID and an IPFS metadata URI describing the item (type, condition, quantity, photos).  The contract creates a record with status PENDING and holds ownership itself, so far the item is committed but not yet allocated to anyone. 
Once a coordinator is elected for that crisis, they review pending items and assign each one to a crisis-verified beneficiary by calling `assignInKindToBeneficiary()`. Now this transitions the item to ASSIGNED and transfers on-chain ownership to the beneficiary.
The coordinator is responsible for physically delivering the item. Finally, the beneficiary calls `confirmInKindRedemption()` to confirm they actually received it, moving the status to REDEEMED. 
If this confirmation never comes, the item stays at ASSIGNED on-chain => delivery may have failed 

**Direct in-kind donations**  using a facility (any verified GO or NGO) as the intermediary (warhouse) instead of an elected coordinator. The donor calls `directDonateInKind()` specifying three things:
- which facility will handle delivery
- which beneficiary should receive the item
- the IPFS metadata URI
The contract creates a record with status PENDING, with the facility and beneficiary pre-assigned at creation. The facility then receives the physical item from the donor and delivers it to the beneficiary, calling `confirmFacilityDelivery()` to confirm this on-chain. The nthe status moves to ASSIGNED and ownership transfers to the beneficiary. they then call `confirmInKindRedemption()` to confirm receipt, completing the cycle at REDEEMED.

Donors can track the status of their in-kind donations at any time by querying getInKindDonation(nftId) with the item ID returned at donation time. The returned record shows the current lifecycle status (PENDING, ASSIGNED, or REDEEMED), which beneficiary was assigned the item, and  for direct donations  which facility handled delivery .
Every state transition also emits an indexed event, creating a permanent on-chain timeline that any block explorer or frontend can display. This gives donors independent, verifiable proof that their specific donation reached a specific beneficiary, confirmed by that beneficiary's own on-chain signature



## Escrow Authority Model

The coordinator **never holds funds**. instead of sending the coordinator the escrow funds, risking lossing them after they have been kicked out of coordinationship, they instead only get the authority to spedn those funds:
they tell the contract send X amount from your balance to this beneficiary."  The contract holds the tokens, not the coordinator. 

in technical terms DonationManager inherits ERC20, so the contract itself is the token ledger. When `donateFT()` mints tokens, it mints them to `address(this)` — the contract's own address holds a balance on its own ledger (like a bank). When` distributeFTToBeneficiary()` calls`_transfer(address(this), beneficiary, amount)`, the contract is transferring from its own balance to the beneficiary. The coordinator's address appears nowhere in that transfer,  they're just the` msg.sender` who triggered it, and the contract checks that `msg.sender == crisisCoordinator[crisisId] `before executing.

if coordinator is no loger a coordinator thsi privilege goes with it , and also they cannot become coordinator in that specific crisis again (more on that in Governance contract) 


### `releaseEscrowToCoordinator(uint256 crisisId, address coordinator)`

- **Caller**: Governance contract only
- **Flow**: Records coordinator address, **does NOT transfer tokens**
- **Side effects**:
  - Sets `crisisCoordinator[crisisId] = coordinator` (enables distribution calls)
  - Escrow balance is **NOT zeroed** — funds remain in `address(this)`
- **Preconditions**: Coordinator not zero, escrow not empty

### `distributeFTToBeneficiary(uint256 crisisId, address beneficiary, uint256 amount)`

- **Caller**: Elected coordinator only (`msg.sender == crisisCoordinator[crisisId]`)
- **Flow**: Transfers AID from **contract escrow** (`address(this)`) to the beneficiary
- **State updates**: `crisisEscrow[crisisId] -= amount`
- **Preconditions**: Crisis not paused, beneficiary is crisis-verified, amount > 0, sufficient escrow balance

### FT Donation Flow

```mermaid
flowchart LR
    DONOR["Donor<br/>donateFT()"] -->|mint AID| ESCROW["Crisis Escrow<br/>address(this)"]
    ESCROW -->|distributeFTToBeneficiary&#40;&#41;| BEN["Beneficiary<br/>crisis-verified"]
    COORD["Coordinator<br/>(authority only)"] -.->|authorizes| ESCROW

    style ESCROW fill:#fff3e0,stroke:#e65100
    style COORD fill:#f3e5f5,stroke:#4a148c
    style BEN fill:#c8e6c9,stroke:#1b5e20
```


## Crisis Pause/Unpause

When a misconduct investigation begins or misconduct is confirmed, the escrow is frozen:

### `pauseCrisis(uint256 crisisId)`

- **Caller**: Governance contract only
- **Effects**:
  - `crisisPaused[crisisId] = true` (freezes distribution and in-kind assignment)
  - `crisisCoordinator[crisisId] = address(0)` (revokes distribution authority)
  - `activeCrises[crisisId]` is **untouched** — donations stay open during PAUSED (continuous-flow escrow)
- **Events**: `CrisisPaused(crisisId)`

### `unpauseCrisis(uint256 crisisId)`

- **Caller**: Governance contract only
- **Effects**:
  - `crisisPaused[crisisId] = false` (unfreezes distribution)
  - `activeCrises[crisisId] = true` (idempotent — donations were already open during PAUSED)
- **Events**: `CrisisUnpaused(crisisId)`

### Pause Checks

Both `distributeFTToBeneficiary()` and `assignInKindToBeneficiary()` check `crisisPaused[crisisId]` and revert with `CrisisIsPaused` if true. This ensures no distributions occur during an investigation or while the crisis is paused for re-election.

## Crisis Lifecycle Integration

The DonationManager tracks the donation window via the `activeCrises` mapping and the distribution freeze via `crisisPaused`. The two are independent: donations stay open through every phase except CLOSED, while distributions can be frozen mid-lifecycle (PAUSED) without blocking new contributions.

| Function | Called By | Effect |
|----------|----------|--------|
| `activateCrisis(crisisId)` | Governance (on `declareCrisis()`) | Opens donations the moment a crisis is declared |
| `deactivateCrisis(crisisId)` | Governance (on `closeCrisis()`) | Stops new donations. Existing escrow remains and can be redirected via `carryOverEscrow()` to an open crisis |
| `pauseCrisis(crisisId)` | Governance (on `initiateMisconductVote()` or confirmed misconduct) | Freezes distribution, revokes coordinator. **Does not** stop donations |
| `unpauseCrisis(crisisId)` | Governance (on dismissed misconduct or `startVoting()` from PAUSED) | Unfreezes distribution. Donations were never closed |

### Donation Window vs. Distribution Window

| Phase    | Donations open? | Distribution allowed? |
|----------|-----------------|-----------------------|
| DECLARED | yes             | no (no coordinator yet) |
| VOTING   | yes             | no (no coordinator yet) |
| ACTIVE   | yes             | yes |
| REVIEW   | yes             | yes |
| PAUSED   | yes             | no (frozen pending re-election or misconduct outcome) |
| CLOSED   | no              | no |

This is the continuous-flow escrow model: the public can keep contributing while a crisis is being investigated, re-electing a coordinator, or wrapping up. Leftover escrow at CLOSE is never stranded — Tier-3 governance can redirect it to any open crisis through `Governance.redirectLeftoverFunds()` → `DonationManager.carryOverEscrow()`.


## Samaritan Score — Donor Engagement Tracking

The Samaritan Score is a simple on-chain counter (`samaritanScore[address]`) that tracks donor engagement. Each time a donor confirms they checked on the outcome of a donation, their score increments by 1. This maps to the EGT parameter **S** (Samaritan incentive) — donors who actively verify their donations receive a higher score, signaling trustworthiness and engagement to the system.

### Functions

Three functions cover three of the four donation paths:

| Function | Donation Path | Precondition |
|----------|--------------|--------------|
| `confirmCrisisDonationTracked(crisisId)` | Crisis-bound FT | Caller has `donorContribution > 0` for this crisis; coordinator must be elected OR crisis must be paused |
| `confirmInKindTracked(nftId)` | Crisis-bound in-kind | Caller is the `donor` on the in-kind record; item status must be ASSIGNED or REDEEMED |
| `confirmInKindTracked(nftId)` | Direct in-kind | Same as above — works for both crisis-bound and direct in-kind (checks `donor` field, not `crisisId`) |
| `confirmDirectFTTracked(beneficiary)` | Direct FT | Caller has `directFTDonated > 0` for this beneficiary |

### Why Direct FT Was Previously Excluded

`directDonateFT()` originally minted tokens directly to a beneficiary without creating any trackable record. This gap has now been closed — see the **Direct FT Donation Tracking** section below. All four donation paths are now covered by the Samaritan Score.

### State

- `mapping(address => uint256) public samaritanScore` — cumulative score per donor
- `mapping(address => mapping(uint256 => bool)) public hasTrackedCrisis` — prevents double-tracking per (donor, crisisId)
- `mapping(address => mapping(uint256 => bool)) public hasTrackedInKind` — prevents double-tracking per (donor, nftId)

### Events

- `CrisisDonationTracked(address indexed donor, uint256 indexed crisisId, uint256 newScore)`
- `InKindDonationTracked(address indexed donor, uint256 indexed nftId, uint256 newScore)`

## FT Beneficiary Confirmation

FT Beneficiary Confirmation allows beneficiaries to confirm on-chain that they received FT distributions from a crisis escrow. This parallels the existing `confirmInKindRedemption()` flow for in-kind items and maps to the EGT parameter **c** (cooperation signal) — a beneficiary's confirmation closes the accountability loop for fungible token distributions.

### How ftReceived Is Populated

The `ftReceived[beneficiary][crisisId]` mapping is updated automatically inside `distributeFTToBeneficiary()`. Each time the coordinator distributes FT to a beneficiary, the amount is added to their cumulative total:

```solidity
ftReceived[beneficiary][crisisId] += amount;
```

This means a beneficiary who receives multiple distributions within the same crisis accumulates a single total, and their confirmation covers all distributions at once.

### Confirmation Function

`confirmFTReceipt(uint256 crisisId)`:
1. Verifies the caller is a registered Beneficiary (via Registry lookup)
2. Checks `ftReceived[msg.sender][crisisId] > 0` — the beneficiary must have received something
3. Checks `!ftConfirmed[msg.sender][crisisId]` — prevents double-confirmation
4. Sets `ftConfirmed` to true and emits `FTReceiptConfirmed` with the cumulative amount

### State

- `mapping(address => mapping(uint256 => uint256)) public ftReceived` — cumulative FT received per (beneficiary, crisisId), populated by `distributeFTToBeneficiary()`
- `mapping(address => mapping(uint256 => bool)) public ftConfirmed` — whether the beneficiary has confirmed receipt

### Events

- `FTReceiptConfirmed(address indexed beneficiary, uint256 indexed crisisId, uint256 amount)`

## Direct FT Donation Tracking

### What It Is

Direct FT Donation Tracking extends the Samaritan Score to cover the fourth and final donation path — `directDonateFT()`. Previously, direct FT donations were excluded because they produced no on-chain identifier (no crisis ID, no NFT ID). This feature adds a cumulative tracking mapping keyed by `(donor, beneficiary)`, allowing donors to confirm engagement with their direct FT donations.

### Why It Was Added

The Samaritan Score originally covered three of four donation paths (crisis FT, crisis in-kind, direct in-kind). Direct FT was the gap. By adding `directFTDonated` accumulation inside `directDonateFT()` and a `confirmDirectFTTracked()` function, all four donation paths now contribute to the Samaritan Score, giving a complete picture of donor engagement.

### Mapping Structure

- `mapping(address => mapping(address => uint256)) public directFTDonated` — cumulative AID tokens donated by a donor to a specific beneficiary via `directDonateFT()`. Updated automatically on each call.
- `mapping(address => mapping(address => bool)) public hasTrackedDirectFT` — prevents double-tracking per (donor, beneficiary) pair.

### Confirm Function

`confirmDirectFTTracked(address beneficiary)`:
1. Checks `directFTDonated[msg.sender][beneficiary] > 0` — the donor must have donated
2. Checks `!hasTrackedDirectFT[msg.sender][beneficiary]` — prevents double-tracking
3. Sets `hasTrackedDirectFT` to true, increments `samaritanScore[msg.sender]`
4. Emits `DirectFTDonationTracked(donor, beneficiary, newScore)`

### Events

- `DirectFTDonationTracked(address indexed donor, address indexed beneficiary, uint256 newScore)`
