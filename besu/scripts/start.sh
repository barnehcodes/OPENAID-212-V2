#!/usr/bin/env bash
# start.sh — Start the OpenAID QBFT network
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BESU_DIR="$(dirname "$SCRIPT_DIR")"

# Verify keys exist
if [ ! -f "$BESU_DIR/config/node-1/data/key" ]; then
  echo "ERROR: Node keys not found. Run generate-keys.sh first."
  exit 1
fi

if [ ! -f "$BESU_DIR/genesis.json" ]; then
  echo "ERROR: genesis.json not found. Run generate-keys.sh first."
  exit 1
fi

echo "=== Starting OpenAID QBFT Network ==="
cd "$BESU_DIR"
docker compose up -d

echo ""
echo "Waiting for nodes to start and peers to connect..."
sleep 10

# Wait for blocks to be produced (up to 30s)
MAX_WAIT=30
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
  BLOCK_HEX=$(curl -s -X POST http://localhost:18545 \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    2>/dev/null | grep -o '"result":"[^"]*"' | cut -d'"' -f4) || true

  if [ -n "$BLOCK_HEX" ] && [ "$BLOCK_HEX" != "0x0" ]; then
    BLOCK_DEC=$((16#${BLOCK_HEX#0x}))
    echo "Blocks are being produced! Current block: $BLOCK_DEC"
    break
  fi

  sleep 2
  ELAPSED=$((ELAPSED + 2))
  echo "  Waiting... ($ELAPSED/${MAX_WAIT}s)"
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
  echo "WARNING: Timed out waiting for blocks. Check logs with:"
  echo "  docker compose -f $BESU_DIR/docker-compose.yml logs"
  exit 1
fi

# Check peer count
PEERS=$(curl -s -X POST http://localhost:18545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}' \
  2>/dev/null | grep -o '"result":"[^"]*"' | cut -d'"' -f4) || true

if [ -n "$PEERS" ]; then
  PEER_DEC=$((16#${PEERS#0x}))
  echo "Node-1 peers: $PEER_DEC"
fi

echo ""
echo "=== Network is running ==="
echo "  RPC endpoints:"
echo "    Node 1: http://localhost:18545"
echo "    Node 2: http://localhost:18547"
echo "    Node 3: http://localhost:18548"
echo "    Node 4: http://localhost:18549"
echo ""
echo "  Monitoring:"
echo "    Prometheus: http://localhost:19090"
echo "    Grafana:    http://localhost:13001 (admin/openaid)"
echo ""
echo "  Logs: docker compose -f $BESU_DIR/docker-compose.yml logs -f"
