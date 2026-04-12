#!/usr/bin/env bash
# generate-keys.sh — Generate 4 QBFT validator keys and genesis using Besu's operator tool.
# Run this ONCE during initial setup.
set -euo pipefail

# Disable MSYS/Git-Bash path auto-conversion on Windows. Without this, args like
# /opt/besu/bin/besu get rewritten to C:/Program Files/Git/opt/besu/bin/besu
# before reaching docker, and the container fails to find the binary.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BESU_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$BESU_DIR/config"
BESU_IMAGE="hyperledger/besu:latest"

echo "=== OpenAID +212 — QBFT Key Generation ==="

# Clean previous config (Docker creates files as root, so use a container to clean)
if [ -d "$CONFIG_DIR/networkFiles" ] || [ -d "$CONFIG_DIR/node-1" ]; then
  echo "Cleaning previous config..."
  docker run --rm -v "$CONFIG_DIR:/config" alpine sh -c \
    "rm -rf /config/networkFiles /config/node-1 /config/node-2 /config/node-3 /config/node-4"
fi

# Create QBFT config file for the operator command
cat > "$CONFIG_DIR/qbft-config.json" << 'QBFTCFG'
{
  "genesis": {
    "config": {
      "chainId": 1337,
      "berlinBlock": 0,
      "londonBlock": 0,
      "qbft": {
        "blockperiodseconds": 2,
        "epochlength": 30000,
        "requesttimeoutseconds": 4
      }
    },
    "nonce": "0x0",
    "timestamp": "0x0",
    "gasLimit": "0x1fffffffffffff",
    "difficulty": "0x1",
    "mixHash": "0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365",
    "coinbase": "0x0000000000000000000000000000000000000000",
    "alloc": {
      "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73": {
        "balance": "0x200000000000000000000000000000000000000000000000000000000000000"
      }
    }
  },
  "blockchain": {
    "nodes": {
      "generate": true,
      "count": 4
    }
  }
}
QBFTCFG

echo "Pulling Besu image..."
docker pull "$BESU_IMAGE"

echo "Generating QBFT blockchain config (4 validators)..."
# Use --entrypoint to bypass the default entrypoint which initializes Besu's
# data directory and conflicts with the operator command's --to directory.
docker run --rm \
  --entrypoint sh \
  -v "$CONFIG_DIR:/config" \
  "$BESU_IMAGE" \
  -c "/opt/besu/bin/besu operator generate-blockchain-config \
    --config-file=/config/qbft-config.json \
    --to=/config/networkFiles \
    --private-key-file-name=key"

# Fix ownership — Docker creates files as root
HOST_UID=$(id -u)
HOST_GID=$(id -g)
docker run --rm -v "$CONFIG_DIR:/config" alpine chown -R "$HOST_UID:$HOST_GID" /config/networkFiles

# Move generated files into per-node directories
KEYS_DIR="$CONFIG_DIR/networkFiles/keys"
GENESIS_SRC="$CONFIG_DIR/networkFiles/genesis.json"

# Copy genesis to besu root
cp "$GENESIS_SRC" "$BESU_DIR/genesis.json"
echo "Genesis file written to besu/genesis.json"

# Create per-node config dirs
NODE_NUM=1
for NODE_KEY_DIR in "$KEYS_DIR"/0x*; do
  NODE_DIR="$CONFIG_DIR/node-${NODE_NUM}"
  mkdir -p "$NODE_DIR/data"
  cp "$NODE_KEY_DIR/key" "$NODE_DIR/data/key"
  cp "$NODE_KEY_DIR/key.pub" "$NODE_DIR/data/key.pub"
  echo "Node $NODE_NUM key: $(cat "$NODE_KEY_DIR/key.pub")"
  NODE_NUM=$((NODE_NUM + 1))
done

# Generate static-nodes.json for peer discovery
echo "Generating static-nodes.json..."
NODE_IPS=("172.16.240.11" "172.16.240.12" "172.16.240.13" "172.16.240.14")
ENODES="["
for i in 1 2 3 4; do
  PUBKEY=$(cat "$CONFIG_DIR/node-$i/data/key.pub" | sed 's/^0x//')
  ENODE="\"enode://${PUBKEY}@${NODE_IPS[$((i-1))]}:30303\""
  if [ $i -lt 4 ]; then
    ENODES="${ENODES}\n  ${ENODE},"
  else
    ENODES="${ENODES}\n  ${ENODE}"
  fi
done
ENODES="${ENODES}\n]"

for i in 1 2 3 4; do
  echo -e "$ENODES" > "$CONFIG_DIR/node-$i/data/static-nodes.json"
done
echo "Static nodes written to each node's data directory."

echo ""
echo "=== Key generation complete ==="
echo "  - Genesis:  besu/genesis.json"
echo "  - Node keys: besu/config/node-{1..4}/data/key"
echo ""
echo "Next: run ./besu/scripts/start.sh to launch the network."
