#!/usr/bin/env bash
# The node (scripts/node.sh) and the app with hot reload (:5175), stopped together.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
"$here/scripts/node.sh" &
node_pid=$!
trap 'kill "$node_pid" 2>/dev/null || true' EXIT INT TERM
cd "$here"
pnpm dev
