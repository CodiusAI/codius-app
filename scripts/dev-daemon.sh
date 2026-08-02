#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$SCRIPT_DIR/../node_modules/.bin:$PATH"

source "$SCRIPT_DIR/dev-home.sh"

export CODIUS_LISTEN="${CODIUS_LISTEN:-127.0.0.1:6768}"
configure_dev_codius_home

if [ -z "${CODIUS_LOCAL_MODELS_DIR}" ]; then
  export CODIUS_LOCAL_MODELS_DIR="$HOME/.codius/models/local-speech"
  mkdir -p "$CODIUS_LOCAL_MODELS_DIR"
fi

echo "══════════════════════════════════════════════════════"
echo "  Codius Dev Daemon"
echo "══════════════════════════════════════════════════════"
echo "  Home:    ${CODIUS_HOME}"
echo "  Models:  ${CODIUS_LOCAL_MODELS_DIR}"
echo "  Listen:  ${CODIUS_LISTEN}"
echo "══════════════════════════════════════════════════════"

export CODIUS_CORS_ORIGINS="${CODIUS_CORS_ORIGINS:-*}"
export CODIUS_NODE_INSPECT="${CODIUS_NODE_INSPECT:---inspect=0}"

if [ "${CODIUS_SKIP_DEV_SERVER_BUILD:-0}" = "1" ]; then
  exec npm run dev:server:watch
fi

exec sh -c 'npm run build:server-deps && npm run dev:server:watch'
