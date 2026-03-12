# OpenAID +212 — Project Context

## What This Project Is

OpenAID +212 is a blockchain-based humanitarian aid distribution system for Morocco.
It uses Hyperledger Besu with QBFT consensus and 4 Solidity smart contracts.
This is a master's thesis implementation — correctness and clarity matter more than gas micro-optimization.

## Tech Stack

- Solidity 0.8.20+
- Hardhat with TypeScript
- OpenZeppelin Contracts v5.x (ERC20, ERC721, AccessControl)
- Target: Hyperledger Besu (QBFT) — EVM-compatible, no Besu-specific Solidity needed
- Testing: Hardhat + Chai + Ethers.js v6

## Contract Architecture

4 contracts, deployed in this order:

1. Registry — Identity layer, roles, verification (base, no dependencies)
2. ReputationEngine — Dynamic scoring formula, validator management
3. DonationManager — ERC20/ERC721 donations, escrow, 3-way verification
4. Governance — Crisis lifecycle, voting, GO compression, misconduct

Full design docs in /docs/ — READ THESE BEFORE WRITING ANY CODE.

## Coding Standards

- Use OpenZeppelin's AccessControl for role-based permissions (not Ownable)
- Use custom errors (not require strings) for gas efficiency
- Use events for every state change
- NatSpec comments on all public/external functions
- No floating point — use scaled integers (multiply by 100 or 1000)
- Solidity naming: PascalCase for contracts/structs/events, camelCase for functions/variables, UPPER_CASE for constants
- Each contract in its own file under contracts/
- Each contract gets its own test file under test/

## Important Design Decisions

- Social Layer Authority uses a TIERED MULTISIG model (Tier 1/2/3). See docs/01_Registry.md.
- GO vote compression: if all GOs vote unanimously, their votes compress to 1.
- Reputation scoring uses quadratic penalties and linear rewards (asymmetric by design).
- All math uses integer arithmetic scaled by 100. No decimals.
- ERC20 and ERC721 functionality is inherited inside DonationManager (not separate contracts).

## What NOT To Do

- Don't use Foundry/Forge — we use Hardhat
- Don't create separate ERC20/ERC721 contracts — they're part of DonationManager
- Don't implement the Besu permissioning interface yet — use a mock for now
- Don't optimize gas aggressively — prioritize readability and correctness
- Don't use msg.sender == owner patterns — use AccessControl roles

## Current Phase: Besu QBFT Network Setup

### What's Done

- All 4 smart contracts implemented and tested (314 tests passing)
- Registry, DonationManager, Governance, ReputationEngine all in contracts/
- Tests in test/ — all passing on Hardhat local network

### What We're Doing Now

Setting up a local 4-node Besu QBFT network via Docker Compose.
This is INFRASTRUCTURE ONLY — no contract deployment yet.

### Besu Requirements

- Hyperledger Besu (latest stable Docker image: hyperledger/besu)
- QBFT consensus (NOT IBFT2, NOT Clique — specifically QBFT)
- 4 validator nodes (minimum for QBFT: 3f+1 where f=1)
- Prometheus + Grafana monitoring enabled
- All nodes on a shared Docker network
- Genesis file must use QBFT configuration
- Block time: 2 seconds (fast enough for testing, slow enough to observe)
- Chain ID: 1337 (local development)
- Gas limit: 0x1fffffffffffff (high limit for complex contract calls)

### File Structure for Besu

Put all Besu configuration in a /besu/ directory at the project root:

- besu/genesis.json — QBFT genesis configuration
- besu/docker-compose.yml — 4-node network definition
- besu/config/ — node configs and keys
- besu/scripts/ — helper scripts (start, stop, generate keys)

### What NOT To Do

- Don't deploy contracts yet — just get the network running
- Don't use IBFT2 — use QBFT (it's the successor, better for our use case)
- Don't use Besu's quickstart tutorial genesis files — they may use Clique
- Don't expose RPC ports publicly — localhost only
- Don't modify anything in contracts/ or test/ during this phase

