# OpenAID +212 — Project Context

## What This Project Is

OpenAID +212 is a blockchain-based humanitarian aid distribution system for Morocco.
It uses Hyperledger Besu with QBFT consensus and 4 Solidity smart contracts.
This is a master's thesis implementation — correctness and clarity matter more than gas micro-optimization.

## Tech Stack

- Solidity 0.8.20
- Hardhat 2 with TypeScript
- OpenZeppelin Contracts v5.x (ERC20, AccessControl)
- Target: Hyperledger Besu (QBFT) — EVM-compatible, no Besu-specific Solidity needed
- Testing: Hardhat + Chai + Ethers.js v6
- Infrastructure: Docker Compose (4-node QBFT network)
- Monitoring: Prometheus + Grafana

## Contract Architecture

4 contracts, deployed in this order:

1. Registry — Identity layer, roles, verification (base, no dependencies)
2. DonationManager(registry, address(0)) — ERC20 donations, escrow, 3-way verification
3. Governance(registry, donationManager, address(0)) — Crisis lifecycle, voting, GO compression
4. ReputationEngine(registry, governance, besuPermissioning) — Dynamic scoring, validator management

Post-deployment wiring:
- donationManager.setGovernanceContract(governance)
- governance.setReputationEngine(reputationEngine)

Full design docs in /docs/design/ — READ THESE BEFORE WRITING ANY CODE.

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

- Social Layer Authority uses a TIERED MULTISIG model (Tier 1/2/3). See docs/design/01_Registry.md.
- GO vote compression: if all GOs vote unanimously, their votes compress to 1.
- Reputation scoring uses quadratic penalties and linear rewards (asymmetric by design).
- All math uses integer arithmetic scaled by 100. No decimals.
- ERC20 functionality is inherited inside DonationManager. In-kind donations use a custom struct + mapping (NOT ERC721 inheritance — avoids signature collision).

## What NOT To Do

- Don't use Foundry/Forge — we use Hardhat
- Don't create separate ERC20/ERC721 contracts — they're part of DonationManager
- Don't implement the Besu permissioning interface yet — use a mock for now
- Don't optimize gas aggressively — prioritize readability and correctness
- Don't use msg.sender == owner patterns — use AccessControl roles
- Don't modify contracts/ or test/ unless explicitly asked

## Completed Phases

### Phase 1: Smart Contracts ✅
- All 4 contracts implemented and tested (305 tests passing after Lock removal)
- Registry, DonationManager, Governance, ReputationEngine in contracts/
- Interfaces in contracts/interfaces/, mocks in contracts/mocks/
- All tests in test/ passing on Hardhat local network
- Critical fixes applied: epoch guard on updateScores(), recordVoteCast() wired into Governance

### Phase 2: Besu QBFT Network ✅
- 4-node QBFT network running via Docker Compose
- Blocks producing every 2 seconds, full mesh (3 peers per node)
- Prometheus + Grafana monitoring live
- Funded dev account: 0xfe3b557e8fb62b89f4916b721be55ceb828dbd73
- Node 1 RPC: http://localhost:18545 (chain ID 1337, gasPrice 0)
- All Besu config in /besu/ directory
- Workaround applied: Besu v26.2.0 entrypoint conflict fixed via --entrypoint sh

### Phase 3: Repo Cleanup ✅
- Lock.sol boilerplate removed (contracts, test, ignition module)
- Deploy script created at scripts/deploy.ts
- hardhat.config.ts updated (solc 0.8.20, optimizer, Besu network, gas reporter)
- README.md replaced with proper project documentation
- docs/Contracts_plans/ renamed to docs/design/
- .env.example created
- package.json scripts added (compile, test, deploy:local, deploy:besu)

### Phase 4: Static Analysis Audit ✅
- Slither v0.11.5 + Solhint v6.0.3 run on all 4 contracts
- 29 Slither findings: 21 fixed, 6 acknowledged, 2 false positives
- Key fixes: reentrancy in updateScores(), divide-before-multiply precision, besuPermissioning→immutable
- Epoch guard bug fixed (was preventing multiple updateScores() calls)
- Events reordered to follow checks-effects-interactions pattern
- All 305 tests passing after fixes
- Audit report: docs/audit/static-analysis-report.md

### Phase 5: Contract Deployment to Besu ✅
- All 4 contracts deployed to Besu QBFT network (chain ID 1337)
- Registry: 0x42699A7612A82f1d9C36148af9C77354759b210b
- DonationManager: 0xa50a51c09a5c451C52BB714527E1974b686D8e77
- Governance: 0x9a3DBCa554e9f6b9257aAa24010DA8377C57c17e
- ReputationEngine: 0x2E1f232a9439C3D459FcEca0BeEf13acc8259Dd8
- All post-deployment wiring verified (governance↔DM, governance↔RE)
- Fix applied: Besu min gas price is 7, not 0 — hardhat.config.ts updated
- Deployment record saved to deployments/addresses.json

## Project Structure
```
OPENAID-212-V2/
├── contracts/           # Solidity smart contracts
│   ├── interfaces/      # Contract interfaces (IRegistry, etc.)
│   ├── mocks/           # Test doubles (MockBesuPermissioning, etc.)
│   ├── Registry.sol
│   ├── DonationManager.sol
│   ├── Governance.sol
│   └── ReputationEngine.sol
├── test/                # Hardhat test files (TypeScript)
├── scripts/             # Deployment scripts
├── docs/design/         # Contract design documents
├── besu/                # QBFT network (Docker Compose, keys, monitoring)
├── hardhat.config.ts
├── CLAUDE.md            # This file
└── README.md
```

## Completed: Static Analysis Audit (Slither + Solhint) ✅

Audit completed. See `docs/audit/static-analysis-report.md` for full results.
All fixes applied, 305 tests passing. Ready for Besu deployment.
```

## Current Phase: End-to-End Scenario Testing on Besu

### What We're Doing Now
Running a full crisis lifecycle scenario against the live Besu network.
This is an integration test that exercises every contract function on-chain.

### Goals
- Prove the system works end-to-end on a real QBFT network (not just Hardhat tests)
- Collect real transaction data (gas costs, block numbers, timing) for the thesis
- Test both the clean path (successful coordination) and misconduct path (slashing)
- Generate Grafana-visible transaction activity for screenshots

### What NOT To Do
- Don't build a UI yet — that comes later
- Don't modify contract code — if something fails, diagnose and fix the script
- Don't redeploy contracts — use the existing deployment addresses
- Keep the scenario script idempotent where possible (use fresh accounts for reruns)

### Future Phase: Frontend UI
A web UI will be built after all backend integration testing is complete.
The UI is a presentation layer — all business logic lives in the contracts.