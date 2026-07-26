#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. Install Docker Desktop, then run this script again." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but not running. Start Docker Desktop, then run this script again." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose is unavailable. Update Docker Desktop, then run this script again." >&2
  exit 1
fi

POTLUCK_PORT="${PORT:-21023}"
export PORT="$POTLUCK_PORT"

echo "Building and starting Potluck on http://localhost:$POTLUCK_PORT ..."
docker compose up --detach --build --wait --wait-timeout 180 potluck

echo "Potluck is ready: http://localhost:$POTLUCK_PORT"
