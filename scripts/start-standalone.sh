#!/bin/bash
# Potluck standalone server (no watchdog — use scripts/potluck for auto-restart)
# Usage: scripts/start-standalone.sh [port]
# Default: 20129

set -e
PORT="${1:-20129}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/.next/standalone"

cd "$DIR"
echo "Potluck on port $PORT (PID: $$)"

# PORT must be exported explicitly — a plain shell variable never reaches node.
PORT="$PORT" exec node custom-server.js
