#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
npm run smoke:prepare
configured_public_origin="$(
  node -e "const registry = require('./config/surface-registry.json'); const url = new URL(registry.publicOrigin); if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('surface registry publicOrigin must be an HTTPS origin'); process.stdout.write(url.origin)"
)"
agent_ready_base_url="${AGENTICGRAPH_AGENT_READY_BASE_URL:-$configured_public_origin}"
# Release readiness excludes the operator-owned x402 wallet gate while the
# default agent-ready check continues to enforce it for commerce readiness.
for attempt in 1 2 3 4 5; do
  if AGENTICGRAPH_AGENT_READY_BASE_URL="$agent_ready_base_url" \
    AGENTICGRAPH_AGENT_READY_INCLUDE_X402=false \
    npm run agent-ready:check; then
    exit 0
  fi
  if [[ "$attempt" == "5" ]]; then
    exit 1
  fi
  echo "[agenticgraph] release smoke attempt $attempt failed; retrying after Pages propagation"
  sleep 15
done
