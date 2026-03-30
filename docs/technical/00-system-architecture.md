# System Architecture — OpenAID +212

## Overview

The system runs on **Hyperledger Besu** with **QBFT consensus** (4-node network, 2-second block time) and implements four smart contracts that together provide:

- **Identity and verification** — who is allowed to participate, and in what capacity
- **Financial escrow and distribution** — how donated funds and goods flow from donors to beneficiaries
- **Democratic governance** — how coordinators are elected and held accountable
- **Dynamic reputation scoring** — how honest behavior is rewarded and misconduct is punished, with consequences for validator participation

All business logic lives on-chain. The frontend is a presentation layer only.

## Four-Contract Architecture

The system is composed of four contracts deployed in strict order, each building on the previous:

| Order | Contract | Purpose | Dependencies |
|-------|----------|---------|-------------|
| 1 | **Registry** | Identity layer : roles, verification, authority management | None |
| 2 | **DonationManager** | Financial engine : ERC20 token, escrow, distribution | Registry |
| 3 | **Governance** | Democratic engine : crisis lifecycle, elections, misconduct, re-election | Registry, DonationManager |
| 4 | **ReputationEngine** | Scoring engine : validator reputation, Besu permissioning | Registry, Governance |

### Contract Dependency Graph

```mermaid
graph TD
    RE["ReputationEngine<br/><i>Dynamic validator scoring</i>"]
    GOV["Governance<br/><i>Crisis lifecycle & elections</i>"]
    DM["DonationManager<br/><i>ERC20 token & escrow</i>"]
    REG["Registry<br/><i>Identity & verification</i>"]
    BESU["Besu Permissioning<br/><i>Validator set management</i>"]

    RE -->|reads roles| REG
    RE -->|called by| GOV
    RE -->|manages validators| BESU
    GOV -->|reads roles, authorities| REG
    GOV -->|activates/deactivates crises<br/>releases escrow<br/>pause/unpause| DM
    GOV -->|records misconduct/success| RE
    DM -->|reads roles, verification| REG

    style REG fill:#e1f5fe,stroke:#01579b
    style DM fill:#fff3e0,stroke:#e65100
    style GOV fill:#f3e5f5,stroke:#4a148c
    style RE fill:#e8f5e9,stroke:#1b5e20
    style BESU fill:#fce4ec,stroke:#880e4f
```

### Deployment and Wiring Sequence

```mermaid
sequenceDiagram
    participant D as Deployer
    participant REG as Registry
    participant DM as DonationManager
    participant GOV as Governance
    participant RE as ReputationEngine

    D->>REG: 1. deploy(operationalAuth, verificationMS, crisisMS)
    D->>DM: 2. deploy(registry, address(0))
    Note right of DM: governance not yet deployed
    D->>GOV: 3. deploy(registry, donationManager, address(0))
    Note right of GOV: reputationEngine not yet deployed
    D->>DM: 4. setGovernanceContract(governance)
    Note right of DM: DM ↔ GOV wiring complete
    D->>RE: 5. deploy(registry, governance, besuPermissioning)
    D->>GOV: 6. setReputationEngine(reputationEngine)
    Note right of GOV: GOV ↔ RE wiring complete
```

The circular dependency between Governance and ReputationEngine (Governance calls RE for scoring; RE requires Governance as its caller) is broken by deploying with `address(0)` placeholders and wiring up post-deployment.

## Crisis Lifecycle Overview

Every crisis follows a phase progression with multiple possible paths, including a re-election cycle after misconduct:


 ![Crisis Lifecycle](./docs/technical/crisis-lifecycle.png)
 
### Escrow-Phase Link

| Crisis Phase | Escrow State | Donations | Distributions |
|---|---|---|---|
| DECLARED | Open | Yes | No (no coordinator) |
| VOTING | Open | Yes | No (no coordinator) |
| ACTIVE | Sealed | No | Yes (coordinator distributes from escrow) |
| REVIEW | Frozen | No | No (under investigation) |
| PAUSED | Frozen | No | No (awaiting re-election) |
| VOTING (re-election) | Open | Yes | No |
| ACTIVE (new coordinator) | Sealed | No | Yes |
| CLOSED | Closed | No | No |

## Escrow Authority Model

a desing choice was made that makes the coordinator **never holds funds**. When a coordinator is elected, `releaseEscrowToCoordinator()` records the coordinator's address as having distribution authority (right to use the funds), but the AID tokens remain in the DonationManager contract (`address(this)`). Distribution calls (`distributeFTToBeneficiary()`) transfer tokens directly from the contract's escrow to the beneficiary, deducting from `crisisEscrow[crisisId]`.

This prevents a misbehaving coordinator from taking funds. If misconduct is confirmed, the coordinator is banned and loses distribution authority (can't be coordinator for that crisis again),  and the funds are still in escrow and available for the next coordinator.

## Three-Tier Authority Model (just the idea)

Authority is split across three tiers to prevent a single-point-of-trust contradiction in a zero-trust system. Each tier corresponds to a different risk level and requires a different approval threshold.

```mermaid
graph TD
    T3["Tier 3 — Crisis Declaration Multisig<br/><b>4-of-7</b><br/>2 GO + 2 NGO + 3 Community"]
    T2["Tier 2 — Verification Multisig<br/><b>2-of-3</b><br/>1 GO + 1 NGO + 1 Community"]
    T1["Tier 1 — Operational Authority<br/><b>Single Signer</b><br/>Procedural actions only"]

    T3 -->|governs| T2
    T3 -->|governs| T1

    style T3 fill:#ffcdd2,stroke:#b71c1c
    style T2 fill:#fff9c4,stroke:#f57f17
    style T1 fill:#c8e6c9,stroke:#1b5e20
```

| Tier | Signers | Threshold | Actions | Rationale |
|------|---------|-----------|---------|-----------|
| **Tier 1** | Single signer | 1-of-1 | `startVoting()`, `closeCrisis()`, `setSystemPhase()`, `recordParticipation()` | Low-risk procedural triggers that don't grant or remove power |
| **Tier 2** | 2-of-3 multisig (1 GO + 1 NGO + 1 Community) | 2-of-3 | `verifyNGO()`, `verifyBeneficiary()` | Power-granting actions — verification unlocks voting and validator rights |
| **Tier 3** | 4-of-7 multisig (2 GO + 2 NGO + 3 Community) | 4-of-7 | `declareCrisis()`, `initiateMisconductVote()`, `updateAuthority()`, `setPhaseConfig()` | System-critical actions — no single actor class can reach threshold alone |

IMPORTANT :
**for now we only implement 3 address to represnt each tier, the actual multi sig implementation is not done yet at this level. for testing**
when we would want to implement the Gnosis safe multisig, we can do so by swapping that address ( see below ) for a real Gnosis Safe contract in production, the current contract code checks checks `msg.sender == verificationMultisig ` so we will not change anything in the contracts if we were to adobt it.


Tier 3 can update any authority address (including itself) via `updateOperationalAuthority()`, `updateVerificationMultisig()`, and `updateCrisisDeclarationMultisig()`. Each update atomically revokes the old address's role and grants it to the new one.

## On-Chain vs Off-Chain Boundary

| Aspect | On-Chain | Off-Chain |
|--------|----------|-----------|
| **Identity** | Role assignment, verification status, authority addresses | WANGO proof validation, KYC checks, physical identity verification |
| **Donations** | ERC20 minting, escrow hold/release, in-kind record tracking | Physical item logistics, IPFS metadata upload, MAD→AID conversion |
| **Governance** | Crisis declaration, candidate registration, voting, election finalization | Multisig signer coordination (Gnosis Safe), off-chain deliberation |
| **Misconduct** | Misconduct vote initiation/finalization, reputation slashing, escrow freeze | Evidence gathering, investigation, Tier-3 deliberation |
| **Reputation** | Score calculation, validator activation/deactivation | Epoch trigger (cron script calls `updateScores()`), participation monitoring |
| **Consensus** | Besu QBFT block production, validator set via permissioning contract | Node infrastructure, Docker networking, Prometheus/Grafana monitoring |

The social layer (multisig signers, cron jobs, IPFS, monitoring) handles everything that requires human judgment or external infrastructure. The smart contracts enforce the rules that the social layer has agreed upon.

