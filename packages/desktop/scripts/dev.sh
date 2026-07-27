#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$DESKTOP_DIR/../.." && pwd)"

source "$ROOT_DIR/scripts/dev-home.sh"

export PATH="$ROOT_DIR/node_modules/.bin:$PATH"
export CODIUS_LISTEN="${CODIUS_LISTEN:-127.0.0.1:6768}"
configure_dev_codius_home

DEV_ROOT="${CODIUS_DEV_ROOT:-$(default_dev_codius_root)}"
export CODIUS_ELECTRON_USER_DATA_DIR="${CODIUS_ELECTRON_USER_DATA_DIR:-$DEV_ROOT/.dev/user-data}"
mkdir -p "$CODIUS_ELECTRON_USER_DATA_DIR"

if [ -z "${EXPO_PORT:-}" ]; then
  EXPO_PORT=$(NO_COLOR=1 FORCE_COLOR=0 "$ROOT_DIR/node_modules/.bin/get-port" 8082 8083 8084 8085 8086 8087 8088 8089)
fi
export EXPO_PORT
export EXPO_DEV_URL="http://localhost:${EXPO_PORT}"

DAEMON_ENDPOINT="$(resolve_dev_daemon_endpoint)"
export CODIUS_DAEMON_ENDPOINT="$DAEMON_ENDPOINT"

REMOTE_DEBUGGING_PORT="${CODIUS_ELECTRON_REMOTE_DEBUGGING_PORT:-9223}"
export CODIUS_ELECTRON_FLAGS="${CODIUS_ELECTRON_FLAGS:+$CODIUS_ELECTRON_FLAGS }--remote-debugging-port=$REMOTE_DEBUGGING_PORT"
export CODIUS_CORS_ORIGINS="${CODIUS_CORS_ORIGINS:-*}"

npm run build:main

echo "══════════════════════════════════════════════════════"
echo "  Codius Dev"
echo "══════════════════════════════════════════════════════"
echo "  Metro:      ${EXPO_DEV_URL}"
echo "  CDP:        http://127.0.0.1:${REMOTE_DEBUGGING_PORT}"
echo "  Daemon:     ${CODIUS_LISTEN}"
echo "  Home:       ${CODIUS_HOME}"
echo "  userData:   ${CODIUS_ELECTRON_USER_DATA_DIR}"
echo "══════════════════════════════════════════════════════"

exec node "$SCRIPT_DIR/dev-runner.mjs"
