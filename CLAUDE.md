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

4 contracts, deployed in this order:

1. Registry — Identity layer, roles, verification (base, no dependencies)
2. DonationManager(registry, address(0)) — ERC20 donations, continuous-flow escrow (donations stay open during ACTIVE/REVIEW/PAUSED phases), cross-crisis carryover, 3-way verification.
3. Governance(registry, donationManager, address(0)) — Crisis lifecycle (no severity parameter), voting, GO compression, Tier-3 leftover fund redirection.
4. ReputationEngine(registry, governance, besuPermissioning) — Dynamic scoring, validator management

Post-deployment wiring:
- donationManager.setGovernanceContract(governance)
- governance.setReputationEngine(reputationEngine)

*Note: We use a continuous-flow escrow model. Donations are never closed until a crisis is explicitly CLOSED. Leftover funds from CLOSED crises can be redirected to active crises via Tier-3 governance.*
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
- DonationManager supports a `directDonateFT()` function for non-crisis donor-to-beneficiary transfers. FT only (in-kind stays crisis-only). Does NOT update donorContribution — direct donations grant no governance voting power.
- ReputationEngine.updateScores() is triggered by an off-chain cron script (scripts/epoch-cron.ts) on a time-based schedule. The contract is already permissionless for this call.

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

### Phase 6: End-to-End Scenario Testing on Besu ✅
- Full crisis lifecycle tested on live QBFT network (83 transactions)
- Demo contracts deployed (GovernanceDemo with 30s voting windows) for Besu compatibility
- Scenario A (clean path): DECLARED → VOTING → ACTIVE → CLOSED with GO compression verified
- Scenario B (misconduct path): DECLARED → VOTING → ACTIVE → REVIEW → CLOSED with slashing
- Epoch update ran successfully, all 5 validators scored
- Results saved to scenario-results/summary.json
- Demo deployment at deployments/demo-addresses.json

## Project Structure
```
OPENAID-212-V2/
├── contracts/           # Solidity smart contracts
│   ├── interfaces/      # Contract interfaces (IRegistry, etc.)
│   ├── mocks/           # Test doubles (MockBesuPermissioning, etc.)
│   ├── demo/            # Demo variants (GovernanceDemo with short windows)
│   ├── Registry.sol
│   ├── DonationManager.sol
│   ├── Governance.sol
│   └── ReputationEngine.sol
├── test/                # Hardhat test files (TypeScript)
├── scripts/             # Deployment and scenario scripts
├── docs/design/         # Contract design documents
├── docs/audit/          # Static analysis audit report
├── besu/                # QBFT network (Docker Compose, keys, monitoring)
├── deployments/         # Contract addresses (addresses.json, demo-addresses.json)
├── scenario-results/    # Scenario test output (summary.json)
├── hardhat.config.ts
├── CLAUDE.md            # This file
└── README.md
```

##  Phase: Contract Changes — Supervisor Feedback (Phase 7)✅

**Group 1: Escrow Model Fix**
- Coordinator gets distribution authority, not funds
- releaseEscrowToCoordinator() no longer transfers tokens
- distributeFTToBeneficiary() pulls from escrow directly to beneficiary

**Group 2: PAUSED State + Re-Election Cycle**
- New Phase.PAUSED added to crisis lifecycle
- Misconduct confirmed → crisis paused, coordinator banned, escrow frozen
- Re-election cycle: PAUSED → VOTING → ACTIVE with new coordinator
- Escrow freeze/unfreeze linked to crisis state
- hasVoted gains election round dimension
- pauseCrisis() / unpauseCrisis() added to DonationManager

**Group 3: Direct In-Kind Donations**
- directDonateInKind(facility, beneficiary, metadataURI) — three-party flow
- facility field added to InKindDonation struct
- confirmFacilityDelivery() — facility confirms delivery
- Existing confirmInKindRedemption() works unchanged for beneficiary step

**Group 4: Documentation Cleanup**
- Update all docs/technical/ files to reflect changes
- ReputationEngine docs: strip theoretical EGT concepts, keep only implemented math

## Phase 8 Update — UI Continuation

### Changes from Initial Landing Page Build
The landing page is built and compiling. Before proceeding to build the full UI, apply these corrections:

### 1. REMOVE Morocco Crisis Map
Delete the MoroccoMap component entirely. It doesn't work well as a static SVG and isn't worth the effort. Replace that section with a **Crisis Timeline** — a vertical or horizontal timeline showing crises chronologically with status badges (Active/Resolved/Monitoring), donation totals, and coordinator names. This is more informative and easier to build. Use shadcn/ui's existing components (Card, Badge) and Framer Motion for staggered reveals.

### 2. REPLACE Liquid Hearts — Use Professional Gauge/Arc Components Instead
The liquid-fill hearts are too playful for a governance platform dealing with humanitarian crises. Replace ALL liquid heart instances with one of these alternatives:

**Primary choice: Radial Arc Gauges**
- A semi-circular or circular arc that fills from 0-100%
- Clean stroke-based SVG, not filled shapes
- The arc color follows the status: `#4CAF8B` (green) for on-track, `#D4A03A` (amber) for in-progress, `#D44040` (red) for critical
- Percentage number in the center, label below
- Reference: think of a speedometer or the gauges in Grafana dashboards — your project already uses Grafana for Besu monitoring, so this is visually consistent

**Implementation:**
```tsx
// components/ui/RadialGauge.tsx
// SVG circle with stroke-dasharray animation
// Props: value (0-100), label, size, color
// Use a <circle> with stroke-dashoffset transition for the fill animation
// Center text shows the percentage
// Below the circle, a small label in DM Sans
```

**Where to replace:**
- Landing page LiveStats: 3 hearts → 3 radial gauges (FT Donations %, In-Kind Aid %, Distributed %)
- Donor dashboard crisis overview: heart → radial gauge for distribution progress  
- CTA footer: floating heart → remove entirely, just keep the text CTA
- Anywhere else hearts appear

**Secondary option for smaller inline indicators: Linear Progress Bars**
- For tight spaces (table cells, card rows), use a horizontal progress bar instead of any circular element
- shadcn/ui has a Progress component — use that with custom colors

### 3. LOGO Integration
The logo file is at `frontend/public/logo.png` (or wherever you placed it in the frontend directory).

**Logo description:** A tilted square/rhombus frame in red (#E84C3D) with a mint/teal (#5DDBAB) rounded square inside containing a dark "O+" symbol. Below it: "OPENAID" in red, "+212" in dark green.

**Usage rules:**
- Sidebar: show only the icon mark (the tilted square with O+), sized 32x32px. Use `<Image>` from next/image
- Navbar: icon mark (32x32) + "OpenAID" text + "+212" badge
- Footer: icon mark (24x24) + "OpenAID +212" text
- Favicon: crop to just the icon mark
- Do NOT use the gradient square placeholder anymore — use the actual logo image

### 4. MOROCCAN ZELLIGE PATTERNS as Background Design
Add subtle Moroccan geometric patterns (zellige-inspired) as background textures. These should be:

**How to implement:**
- Create a CSS/SVG repeating pattern in Tailwind as a background utility
- The pattern should be VERY subtle — think 3-5% opacity on the cream (#EFECE3) background
- Use the geometric star/tessellation motifs typical of Moroccan zellige tilework
- Primary use: hero section background, section dividers, card hover states, the dark zero-trust section

**Pattern generation approach:**
- Build a small SVG tile (single zellige star unit, ~60x60px) using clean geometric paths
- Repeat it via CSS `background-image` with `background-repeat: repeat`
- Color it using the palette: strokes in `#DDD8CC` (border color) at 5-8% opacity on light sections, `#4A70A9` (deepBlue) at 3-5% opacity on dark sections
- Do NOT use images/external assets — generate the pattern as inline SVG or CSS

**Placement:**
- Landing page hero section: subtle pattern behind the text
- Dashboard sidebar: very faint pattern on the dark background
- Card headers or section dividers: pattern as a thin decorative strip
- Zero-trust dark section: pattern in deep blue at low opacity
- Registration page background

This gives the UI a distinct Moroccan cultural identity without being heavy-handed.

---


