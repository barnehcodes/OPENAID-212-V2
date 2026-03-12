# OpenAID +212 — Smart Contract Architecture

## Overview

OpenAID +212 uses **4 smart contracts** that together implement a transparent, zero-trust humanitarian aid distribution system on a permissioned Ethereum network (Hyperledger Besu with QBFT consensus).

```
┌──────────────────────────────────────────────────────────┐
│                    Besu QBFT Consensus                    │
│              (Block production by validators)             │
└──────────────────────┬───────────────────────────────────┘
                       │ addValidator / removeValidator
                       │
┌──────────────────────┴───────────────────────────────────┐
│              04. ReputationEngine                         │
│     Dynamic scoring formula, validator set management     │
│     The thesis math lives here                            │
└─────────┬────────────────────────────────┬───────────────┘
          │ reads                          │ called by
          │                                │
┌─────────┴──────────┐      ┌─────────────┴───────────────┐
│  01. Registry      │      │  03. Governance              │
│  Identity layer    │◄─────│  Crisis mgmt, voting,        │
│  Roles, verify     │reads │  coordinator election        │
└─────────┬──────────┘      └─────────────┬───────────────┘
          │                               │
          │ reads                          │ reads + calls
          │                               │
          │         ┌─────────────────────┴───────────────┐
          └────────►│  02. DonationManager                │
                    │  FT/NFT donations, escrow,           │
                    │  distribution, 3-way verification     │
                    └─────────────────────────────────────┘
```

## Contract Summary

| # | Contract | Responsibility | Depends On | Key Thesis Concept |
|---|----------|---------------|------------|-------------------|
| 01 | **Registry** | Identity, roles, verification | Nothing (base layer) | Zero-trust actor model |
| 02 | **DonationManager** | FT/NFT assets, escrow, distribution | Registry | Three-way verification |
| 03 | **Governance** | Crisis lifecycle, voting, GO compression | Registry, DonationManager | Democratic consensus, anti-capture |
| 04 | **ReputationEngine** | Dynamic scoring, validator management | Registry, Governance | EGT-derived incentive mechanism |

## Deployment Order

1. **Multisig Contracts** — Deploy Tier 2 (2-of-3) and Tier 3 (4-of-7) multisig contracts first (or use Gnosis Safe instances)
2. **Registry** — Deploy with multisig addresses and Operational Authority address
3. **ReputationEngine** — Needs Registry address
4. **DonationManager** — Needs Registry address
5. **Governance** — Needs Registry, DonationManager, and ReputationEngine addresses

After deployment, set cross-references:
- Grant Governance permission to call ReputationEngine's `recordMisconduct` and `recordSuccessfulCoordination`
- Grant Governance permission to call DonationManager's `releaseEscrowToCoordinator`
- Grant Registry permission to call ReputationEngine's `initializeValidator`
- Governance reads authority addresses from Registry for access control checks

## Design Principles

1. **Separation of concerns** — Each contract handles one domain. Identity ≠ money ≠ voting ≠ scoring.
2. **Minimal inter-contract calls** — Contracts read from each other but only call (write) when absolutely necessary.
3. **On-chain transparency** — Every action emits an event. Anyone can audit the full history.
4. **Zero-trust** — Every role (GO, NGO, Donor, Beneficiary) is assumed potentially malicious. The architecture constrains all of them.
5. **Tiered authority** — No single address controls the system. Critical actions require multisig approval across independent actor classes (see below).
6. **Game-theoretic grounding** — The ReputationEngine parameters aren't arbitrary; they're derived from the EGT equilibrium conditions.

## Social Layer Authority — Tiered Model

The Social Layer Authority is split into three tiers to prevent single-point-of-trust contradictions in a zero-trust system:

| Tier | Mechanism | Actions | Rationale |
|------|-----------|---------|-----------|
| **Tier 1** | Single signer (Operational Authority) | `startVoting()`, `closeCrisis()` | Procedural — outcomes already determined by other mechanisms |
| **Tier 2** | 2-of-3 multisig (1 GO + 1 NGO + 1 Community) | `verifyNGO()`, `verifyBeneficiary()` | Power-granting — verification creates validators and voters |
| **Tier 3** | 4-of-7 multisig (2 GO + 2 NGO + 3 Community) | `declareCrisis()`, `initiateMisconductVote()`, `setPhaseConfig()` | System-critical — triggers governance cycles and controls incentive parameters |

This maps directly to the EGT model's three independent actor classes. No single actor class can unilaterally perform high-risk actions. See [01_Registry.md](./01_Registry.md) for full details.

## File Index

- [01_Registry.md](./01_Registry.md) — Identity and verification
- [02_DonationManager.md](./02_DonationManager.md) — Asset flows and three-way verification
- [03_Governance.md](./03_Governance.md) — Crisis lifecycle and democratic coordination
- [04_ReputationEngine.md](./04_ReputationEngine.md) — Dynamic scoring and validator management

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain client | Hyperledger Besu (QBFT) |
| Smart contracts | Solidity 0.8.x |
| Contract framework | Hardhat (development + testing) |
| Token standards | OpenZeppelin ERC20 + ERC721 |
| Local testing | Hardhat Network (fast iteration) |
| Network testing | Besu Docker Compose (4 QBFT nodes) |
| Benchmarking | Hyperledger Caliper |
| Monitoring | Prometheus + Grafana (Besu built-in) |

## Next Steps

1. Review each contract design document
2. Identify any missing functions or edge cases
3. Define Solidity interfaces for each contract
4. Implement and test on Hardhat
5. Deploy to local Besu QBFT network
6. Run Caliper benchmarks
