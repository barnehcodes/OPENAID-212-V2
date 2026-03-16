# Demo Contracts

This directory contains **demo-only** variants of production contracts with shortened time windows.

## GovernanceDemo.sol

Identical to `../Governance.sol` except:

- `VOTING_DURATION` = **30 seconds** (production: 48 hours)
- `MISCONDUCT_VOTE_DURATION` = **30 seconds** (production: 72 hours)

### Why?

Hyperledger Besu does not support `evm_increaseTime` / `evm_mine` RPCs. On the live QBFT network, we cannot fast-forward time to test voting window expiry. These demo contracts allow the full crisis lifecycle to execute with real-time waits (~35 seconds per window).

### Usage

```bash
# Deploy demo contracts to Besu
npx hardhat run scripts/deploy-demo.ts --network besu

# Run scenario with demo contracts (uses real-time waits)
npx hardhat run scripts/scenario.ts --network besu
```

### DO NOT use in production

These contracts are for thesis demonstration and integration testing only. The 30-second voting windows are not suitable for real governance.
