#!/usr/bin/env bash
set -euo pipefail

# Publishes agentic-graph Canvas to Cloudflare Pages content folder:
#   agentic-graph/canvas/dist -> huijoohwee/content/agentic-graph
#
# Usage (from /GitHub/agentic-graph):
#   ./scripts/publish-to-huijoohwee.sh
#
# Notes:
# - Builds with BASE path /agentic-graph/ (for airvio.co/agentic-graph).
# - Skips docs generation (python deps) to keep the publish step lean.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CANVAS_DIR="${ROOT_DIR}/canvas"

export VITE_BASE_PATH="${VITE_BASE_PATH:-/agentic-graph/}"
export AG_SKIP_DOCS_UPDATE="${AG_SKIP_DOCS_UPDATE:-1}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}"

echo "[agentic-graph] installing deps (canvas)..."
npm --prefix "${CANVAS_DIR}" install --no-audit --no-fund

echo "[agentic-graph] rebuilding native deps (esbuild)..."
npm --prefix "${CANVAS_DIR}" rebuild esbuild || true

echo "[agentic-graph] building (canvas) with base=${VITE_BASE_PATH}..."
npm --prefix "${CANVAS_DIR}" run build

echo "[agentic-graph] syncing dist -> huijoohwee/content/agentic-graph..."
node "${ROOT_DIR}/scripts/sync-pages-agentic-graph.mjs"

echo "[agentic-graph] done. Now commit+push in the huijoohwee repo:"
echo "  cd ../huijoohwee && git add content/agentic-graph _redirects _headers && git commit -m \"Publish agentic-graph\" && git push"

