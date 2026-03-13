# OpenAID +212 — Blockchain Humanitarian Aid Distribution

A blockchain-based humanitarian aid distribution system designed for Morocco, built as a master's thesis implementation. The platform runs on a Hyperledger Besu QBFT permissioned network and uses four interconnected Solidity smart contracts with an EGT-derived dynamic reputation engine to ensure transparent, accountable, and efficient aid delivery.

## Tech Stack

| Component       | Technology                          |
|-----------------|-------------------------------------|
| Blockchain      | Hyperledger Besu (QBFT consensus)   |
| Smart Contracts | Solidity 0.8.20                     |
| Framework       | Hardhat 2 + TypeScript              |
| Libraries       | OpenZeppelin Contracts v5.x         |
| Testing         | Chai + Ethers.js v6                 |
| Infrastructure  | Docker Compose (4-node QBFT network)|
| Monitoring      | Prometheus + Grafana                |

## Quick Start

```bash
# Install dependencies
npm install

# Compile contracts
npm run compile

# Run tests
npm test

# Run tests with gas reporting
npm run test:gas

# Deploy to local Hardhat network
npm run deploy:local

# Deploy to Besu QBFT network (must be running first)
npm run deploy:besu
```

## Contract Architecture

| Contract             | Purpose                                                                 |
|----------------------|-------------------------------------------------------------------------|
| **Registry**         | Identity layer — role management, entity registration, tiered multisig verification |
| **DonationManager**  | ERC20 donation token, escrow management, 3-way donation verification    |
| **Governance**       | Crisis lifecycle management, weighted voting, GO vote compression       |
| **ReputationEngine** | Dynamic EGT-derived scoring, quadratic penalties, validator management  |

Contracts are deployed in order: Registry → DonationManager → Governance → ReputationEngine, with post-deployment wiring to connect cross-contract references.

For detailed design documents, see [docs/design/](docs/design/).

## Besu Network

The project includes a 4-node QBFT permissioned network configuration. See [besu/README.md](besu/README.md) for setup and operation instructions.

## Project Structure

```
OPENAID-212-V2/
├── contracts/           # Solidity smart contracts
│   ├── interfaces/      # Contract interfaces
│   ├── mocks/           # Test doubles
│   ├── Registry.sol
│   ├── DonationManager.sol
│   ├── Governance.sol
│   └── ReputationEngine.sol
├── test/                # Hardhat test files (TypeScript)
├── scripts/             # Deployment scripts
├── docs/design/         # Contract design documents
├── besu/                # QBFT network (Docker, keys, monitoring)
├── deployments/         # Deployed contract addresses (generated)
├── hardhat.config.ts
└── README.md
```
