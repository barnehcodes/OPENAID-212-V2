# Contract 2: DonationManager

## Purpose

The DonationManager handles **all asset flows** in OpenAID +212 — both monetary donations (fungible tokens) and in-kind donations (non-fungible tokens). It is the financial engine of the system.

In v1, donations were split across three contracts (DonationToken ERC20, InKindNFT ERC721, and OpenAidCore). In v2, we consolidate them into one contract that inherits both ERC20 and ERC721 capabilities. This reduces inter-contract calls, lowers gas costs, and simplifies the audit surface.

---

## Why This Contract Exists

OpenAID +212 tracks two types of aid:

1. **Monetary donations (FT)** — Represented as ERC20 tokens. 1 FT = 1 MAD (Moroccan Dirham) for simplicity. Donors purchase tokens, which are held in escrow until distributed by a coordinator.
2. **In-kind donations (NFT)** — Represented as ERC721 tokens. Each NFT represents a physical item (food package, tent, medical kit). The NFT carries metadata about the item and tracks its journey from donor to beneficiary.

The DonationManager is responsible for:

- Minting FTs when donors contribute money
- Minting NFTs when donors commit physical goods
- Holding funds in escrow during crisis coordination
- Releasing funds to the elected coordinator for distribution
- Tracking that donations actually reach beneficiaries
- Enforcing donation caps (which gate voting rights in the Governance contract)

---

## Dependencies

```
DonationManager ──reads──→ Registry  (role checks: who can donate, who can receive)
Governance ──calls──→ DonationManager  (release escrow to coordinator, check donation amounts for voting eligibility)
```

The DonationManager **does not** interact with ReputationEngine directly. Reputation is about validator behavior, not donation flow.

---

## Data Structures

### Donation Record (for FTs)

```
FTDonation {
    address     donor           // Who donated
    uint256     amount          // Amount in FT (1 FT = 1 MAD)
    uint256     crisisId        // Which crisis this donation is for
    uint256     timestamp       // When the donation was made
    bool        distributed     // Has the coordinator distributed this?
}
```

### In-Kind Donation Record (for NFTs)

```
InKindDonation {
    uint256     nftId           // The ERC721 token ID
    address     donor           // Who donated the item
    string      metadataURI     // IPFS hash pointing to item description, photos, etc.
    uint256     crisisId        // Which crisis this is committed to
    Status      status          // PENDING → ASSIGNED → REDEEMED
    address     assignedTo      // Beneficiary this item is assigned to (set by coordinator)
}

enum Status { PENDING, ASSIGNED, REDEEMED }
```

### Crisis Escrow

Each crisis has a pool of donated funds held in escrow until a coordinator is elected and authorized to distribute them.

```
mapping(uint256 => uint256) crisisEscrow
// crisisEscrow[crisisId] = total FT held for this crisis
```

### Donor Contribution Tracking

Tracks how much each donor has contributed to each crisis. This is critical because **donation amount gates voting rights** — the Governance contract reads this to determine if a donor has met the donation cap.

```
mapping(address => mapping(uint256 => uint256)) donorContribution
// donorContribution[donorAddress][crisisId] = total FT donated
```

---

## Functions

### 1. `donateFT(uint256 crisisId, uint256 amount)`

**Who can call:** Any registered participant (Donor, PrivateCompany, NGO, GO)

**What it does:**

- Checks that the caller is registered in the Registry
- Checks that the crisis exists and is active (reads from Governance contract)
- Mints `amount` FT tokens and deposits them into the crisis escrow
- Records the donation and updates the donor's contribution total for this crisis
- Emits `FTDonationReceived(donor, crisisId, amount)`

```
Pseudocode:
─────────────────────────────────────
require Registry.getParticipant(msg.sender).exists == true
require crisisIsActive(crisisId)                          // Crisis must be open
require amount > 0

_mint(address(this), amount)                              // Mint FT to this contract (escrow)
crisisEscrow[crisisId] += amount
donorContribution[msg.sender][crisisId] += amount

donations.push(FTDonation(msg.sender, amount, crisisId, block.timestamp, false))
emit FTDonationReceived(msg.sender, crisisId, amount)
```

> **Design Note:** In a production system, donors would send real ETH/stablecoin and receive FT in return. For the thesis prototype, we simplify by minting directly — the focus is on governance logic, not payment processing.

---

### 2. `donateInKind(uint256 crisisId, string metadataURI)`

**Who can call:** Any registered participant

**What it does:**

- Mints a new ERC721 token representing the physical item
- The `metadataURI` points to an IPFS document describing the item (type, quantity, condition, photos)
- Sets status to PENDING — the item exists but hasn't been assigned to a beneficiary yet
- Emits `InKindDonationReceived(donor, crisisId, nftId)`

```
Pseudocode:
─────────────────────────────────────
require Registry.getParticipant(msg.sender).exists == true
require crisisIsActive(crisisId)

nftId = _mintNFT(msg.sender, metadataURI)
inKindDonations[nftId] = InKindDonation(nftId, msg.sender, metadataURI, crisisId, PENDING, address(0))
emit InKindDonationReceived(msg.sender, crisisId, nftId)
```

---

### 3. `releaseEscrowToCoordinator(uint256 crisisId, address coordinator)`

**Who can call:** Governance contract only (after coordinator election)

**What it does:**

- Transfers all FT in the crisis escrow to the elected coordinator
- The coordinator is now responsible for distributing these funds to beneficiaries
- Emits `EscrowReleased(crisisId, coordinator, amount)`

```
Pseudocode:
─────────────────────────────────────
require msg.sender == governanceContract          // Only Governance can trigger this
require crisisEscrow[crisisId] > 0

uint256 amount = crisisEscrow[crisisId]
crisisEscrow[crisisId] = 0
_transfer(address(this), coordinator, amount)     // Transfer FT from escrow to coordinator
emit EscrowReleased(crisisId, coordinator, amount)
```

> **Security Note:** The coordinator receives the funds but is now under the full scrutiny of the ReputationEngine. Any misconduct in distribution triggers the slashing mechanism. The funds are released, but accountability follows.

---

### 4. `distributeFTToBeneficiary(uint256 crisisId, address beneficiary, uint256 amount)`

**Who can call:** The elected coordinator for this crisis only

**What it does:**

- The coordinator sends FT from their balance to a verified beneficiary
- Checks that the beneficiary is crisis-verified (via Registry)
- Records the distribution on-chain for transparency
- Emits `FTDistributed(crisisId, coordinator, beneficiary, amount)`

```
Pseudocode:
─────────────────────────────────────
require msg.sender == getCoordinator(crisisId)    // Only the elected coordinator
require Registry.isCrisisVerifiedBeneficiary(beneficiary, crisisId)
require balanceOf(msg.sender) >= amount

_transfer(msg.sender, beneficiary, amount)
emit FTDistributed(crisisId, msg.sender, beneficiary, amount)
```

---

### 5. `assignInKindToBeneficiary(uint256 nftId, address beneficiary)`

**Who can call:** The elected coordinator for the relevant crisis

**What it does:**

- Assigns a pending in-kind donation to a specific beneficiary
- Changes the NFT status from PENDING to ASSIGNED
- Emits `InKindAssigned(nftId, beneficiary)`

```
Pseudocode:
─────────────────────────────────────
require msg.sender == getCoordinator(inKindDonations[nftId].crisisId)
require inKindDonations[nftId].status == PENDING
require Registry.isCrisisVerifiedBeneficiary(beneficiary, inKindDonations[nftId].crisisId)

inKindDonations[nftId].status = ASSIGNED
inKindDonations[nftId].assignedTo = beneficiary
_transferNFT(address(this), beneficiary, nftId)
emit InKindAssigned(nftId, beneficiary)
```

---

### 6. `confirmInKindRedemption(uint256 nftId)`

**Who can call:** The assigned beneficiary only

**What it does:**

- The beneficiary confirms they physically received the item
- Changes status from ASSIGNED to REDEEMED
- This confirmation feeds into the coordinator's reputation (via the Governance contract's misconduct assessment)
- Emits `InKindRedeemed(nftId, beneficiary)`

```
Pseudocode:
─────────────────────────────────────
require msg.sender == inKindDonations[nftId].assignedTo
require inKindDonations[nftId].status == ASSIGNED

inKindDonations[nftId].status = REDEEMED
emit InKindRedeemed(nftId, msg.sender)
```

> **Why this matters:** This is the **three-way verification** concept from the thesis. The donor commits an item (step 1), the coordinator assigns it (step 2), and the beneficiary confirms receipt (step 3). If the beneficiary never confirms, that's a signal that the coordinator may not have actually delivered — which feeds into the misconduct voting process.

---

### 7. `getDonorContribution(address donor, uint256 crisisId) → uint256`

**Who can call:** Anyone (view function)

**What it does:** Returns the total FT amount a donor has contributed to a specific crisis. The Governance contract calls this to check if a donor meets the donation cap required for voting rights.

---

### 8. `getCrisisEscrowBalance(uint256 crisisId) → uint256`

**Who can call:** Anyone (view function)

**What it does:** Returns the total FT currently held in escrow for a crisis. Transparency — anyone can see how much has been collected.

---

## Events


| Event                                                       | When Emitted                           | Why It Matters                  |
| ----------------------------------------------------------- | -------------------------------------- | ------------------------------- |
| `FTDonationReceived(donor, crisisId, amount)`               | Monetary donation made                 | Transparency, frontend display  |
| `InKindDonationReceived(donor, crisisId, nftId)`            | Physical item committed                | Track in-kind pipeline          |
| `EscrowReleased(crisisId, coordinator, amount)`             | Coordinator elected, funds released    | Audit trail — who got the money |
| `FTDistributed(crisisId, coordinator, beneficiary, amount)` | Coordinator sends funds to beneficiary | Core transparency event         |
| `InKindAssigned(nftId, beneficiary)`                        | Coordinator assigns item               | Track assignment                |
| `InKindRedeemed(nftId, beneficiary)`                        | Beneficiary confirms receipt           | Three-way verification complete |


---

## The Donation Cap Mechanism

Donation caps are a core governance mechanism in OpenAID +212. They serve two purposes:

1. **Gate voting rights** — You must donate at least the cap amount to vote for a coordinator. This is the Proof-of-Contribution mechanism.
2. **Vary by role** — Different roles have different caps, reflecting their different capacities and responsibilities.


| Role            | Donation Cap (relative to base) | Rationale                                              |
| --------------- | ------------------------------- | ------------------------------------------------------ |
| Donor           | 1× base cap                     | Low barrier — encourage participation                  |
| Private Company | 1× base cap                     | Same as donor                                          |
| Beneficiary     | 0 (no donation required)        | Vote based on crisis verification, not money           |
| NGO             | 10× base cap                    | Higher stake to run for coordinator                    |
| GO              | 15× base cap                    | Highest stake — reflects their institutional resources |


The **base cap is set per crisis** by the Social Layer (via the Governance contract), because crisis severity determines what's an appropriate contribution. A minor local flood might have a base cap of 100 FT; a national earthquake might have 1000 FT.

> **Important:** The DonationManager stores the donation amounts. The Governance contract reads them and enforces the cap logic. The DonationManager itself doesn't know about caps — it just records who donated how much.

---

## The Three-Way Verification Flow

This is one of OpenAID +212's key contributions — no other humanitarian blockchain implements this:

```
Step 1: Donor commits item
  └─ donateInKind() → NFT minted, status = PENDING

Step 2: Coordinator assigns item to beneficiary  
  └─ assignInKindToBeneficiary() → status = ASSIGNED, NFT transferred

Step 3: Beneficiary confirms receipt
  └─ confirmInKindRedemption() → status = REDEEMED

If Step 3 never happens:
  └─ Signal to Governance that coordinator may not have delivered
  └─ Can trigger misconduct vote
  └─ Feeds into ReputationEngine slashing
```

---

## Design Decisions and Trade-offs

### Why combine ERC20 and ERC721 in one contract?

In v1, they were separate (DonationToken + InKindNFT). This meant OpenAidCore had to reference two external contracts for every donation operation, increasing gas and complexity. Since both token types serve the same domain purpose (tracking donations), they belong together. We use OpenZeppelin's `ERC20` and `ERC721` inherited implementations — battle-tested, audited code.

### Why escrow instead of direct transfer?

If donors sent funds directly to a not-yet-elected coordinator, the funds could be lost or stolen if no coordinator is elected, or if the elected coordinator is different from who the donor expected. Escrow ensures:

- Funds are safe during the voting period
- All funds go to the **actually elected** coordinator
- If no coordinator is elected (unlikely but possible), funds can be returned

### Why does the beneficiary need to confirm in-kind redemption?

Without confirmation, there's no on-chain proof that aid was actually delivered. The coordinator could assign items on-chain but never physically deliver them. Beneficiary confirmation closes the loop and provides the data needed for accountability assessment.

### What if a beneficiary doesn't confirm (lost phone, no access)?

This is a known limitation. A missing confirmation doesn't automatically trigger slashing — it triggers a flag that the Governance contract can investigate. The misconduct voting process handles the nuance (maybe the beneficiary lost access, maybe the coordinator didn't deliver). The system is designed to escalate signals, not auto-punish.

---

## Gas Considerations

- `donateFT` and `donateInKind` are the most frequently called functions. They should be optimized (minimal storage writes, efficient mapping updates)
- NFT minting is inherently more expensive than FT operations due to ERC721's storage requirements
- Escrow operations are infrequent (once per crisis cycle)
- View functions for checking donation amounts are free

---

## Testing Scenarios


| Scenario                                                                        | Expected Result                                 |
| ------------------------------------------------------------------------------- | ----------------------------------------------- |
| Unregistered address tries to donate                                            | Revert                                          |
| Donor donates FT to active crisis                                               | Success, escrow updated, contribution tracked   |
| Donor donates FT to non-existent crisis                                         | Revert                                          |
| Escrow released to coordinator                                                  | Coordinator balance increases, escrow goes to 0 |
| Non-coordinator tries to distribute funds                                       | Revert                                          |
| Coordinator distributes to non-verified beneficiary                             | Revert                                          |
| Beneficiary confirms in-kind receipt                                            | Status changes to REDEEMED                      |
| Non-assigned address tries to confirm redemption                                | Revert                                          |
| Donor contribution correctly tracks cumulative amount across multiple donations | Total should sum                                |
| In-kind NFT assigned twice                                                      | Revert (already assigned)                       |


