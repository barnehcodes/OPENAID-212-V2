#!/usr/bin/env bash
# stop.sh — Stop the OpenAID QBFT network
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BESU_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Stopping OpenAID QBFT Network ==="
cd "$BESU_DIR"
docker compose down

if [ "${1:-}" = "--clean" ]; then
  echo "Cleaning up node data (keeping keys)..."
  # Use Docker to remove root-owned files created by Besu containers
  docker run --rm -v "$BESU_DIR/config:/config" alpine sh -c "
    for i in 1 2 3 4; do
      rm -rf /config/node-\$i/data/database
      rm -rf /config/node-\$i/data/caches
      rm -rf /config/node-\$i/data/DATABASE_METADATA.json
    done
  "
  docker compose down -v
  echo "Volumes and node databases cleaned."
else
  echo "Node data preserved. Use --clean to remove databases and volumes."
fi

echo "Network stopped."
