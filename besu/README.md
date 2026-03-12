# OpenAID +212 — Besu QBFT Network

Local 4-node Hyperledger Besu network using QBFT consensus for development and testing.

## Prerequisites

- Docker (v20+)
- Docker Compose (v2+)

## Quick Start

```bash
# 1. Generate validator keys and genesis (first time only)
chmod +x besu/scripts/*.sh
./besu/scripts/generate-keys.sh

# 2. Start the network
./besu/scripts/start.sh

# 3. Verify blocks are being produced
curl -s -X POST http://localhost:18545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

## Port Mapping

| Service     | Host Port | Description         |
|-------------|-----------|---------------------|
| Node 1 RPC  | 18545     | HTTP JSON-RPC       |
| Node 1 WS   | 18546     | WebSocket           |
| Node 2 RPC  | 18547     | HTTP JSON-RPC       |
| Node 3 RPC  | 18548     | HTTP JSON-RPC       |
| Node 4 RPC  | 18549     | HTTP JSON-RPC       |
| Prometheus  | 19090     | Metrics             |
| Grafana     | 13001     | Dashboards          |

## Network Details

- **Consensus**: QBFT (4 validators, 2s block time)
- **Chain ID**: 1337
- **Gas limit**: 0x1fffffffffffff
- **Gas price**: 0 (free transactions for development)
- **Funded account**: `0xfe3b557e8fb62b89f4916b721be55ceb828dbd73`
  - Private key: `0x8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63`
  - This is a well-known Besu dev account — **never use in production**

## Stopping the Network

```bash
# Stop (preserve data)
./besu/scripts/stop.sh

# Stop and clean all data
./besu/scripts/stop.sh --clean
```

## Monitoring

- **Grafana**: http://localhost:13001 (login: admin / openaid)
- **Prometheus**: http://localhost:19090

The Grafana dashboard shows block height, peer count, pending transactions, and JVM memory.

## Connecting Hardhat

Add this network to `hardhat.config.ts`:

```typescript
networks: {
  besu: {
    url: "http://localhost:18545",
    chainId: 1337,
    accounts: ["0x8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63"],
    gasPrice: 0,
  }
}
```

Then deploy with: `npx hardhat run scripts/deploy.ts --network besu`

## Useful RPC Commands

```bash
# Block number
curl -s -X POST http://localhost:18545 -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Peer count
curl -s -X POST http://localhost:18545 -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}'

# QBFT validators
curl -s -X POST http://localhost:18545 -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"qbft_getValidatorsByBlockNumber","params":["latest"],"id":1}'

# Account balance
curl -s -X POST http://localhost:18545 -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0xfe3b557e8fb62b89f4916b721be55ceb828dbd73","latest"],"id":1}'
```

## File Structure

```
besu/
├── genesis.json              # Generated QBFT genesis (created by generate-keys.sh)
├── docker-compose.yml        # 4 Besu nodes + Prometheus + Grafana
├── config/
│   ├── qbft-config.json      # Input config for key generation
│   ├── prometheus.yml        # Prometheus scrape config
│   ├── grafana/              # Grafana provisioning and dashboards
│   ├── node-1/data/key[.pub] # Generated validator keys
│   ├── node-2/data/key[.pub]
│   ├── node-3/data/key[.pub]
│   └── node-4/data/key[.pub]
├── scripts/
│   ├── generate-keys.sh      # One-time key + genesis generation
│   ├── start.sh              # Start network
│   └── stop.sh               # Stop network
└── README.md
```
