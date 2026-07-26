#!/bin/bash
# Potluck standalone server (no watchdog — use scripts/potluck for auto-restart)
# Usage: scripts/start-standalone.sh [port]
# Default: 21023

set -e
POTLUCK_PORT="${1:-${PORT:-21023}}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/.next/standalone"

cd "$DIR"
echo "Potluck on port $POTLUCK_PORT (PID: $$)"

# PORT must be exported explicitly — a plain shell variable never reaches node.
PORT="$POTLUCK_PORT" exec node custom-server.js
