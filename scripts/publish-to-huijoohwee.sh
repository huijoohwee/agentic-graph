#!/usr/bin/env bash
set -euo pipefail

# Publishes AgenticGraph Canvas to Cloudflare Pages content folder:
#   agenticgraph/canvas/dist -> huijoohwee/content/agenticgraph
#
# Usage (from /GitHub/agenticgraph):
#   ./scripts/publish-to-huijoohwee.sh
#
# Notes:
# - Builds with BASE path /agenticgraph/ (for airvio.co/agenticgraph).
# - Skips docs generation (python deps) to keep the publish step lean.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CANVAS_DIR="${ROOT_DIR}/canvas"

export VITE_BASE_PATH="${VITE_BASE_PATH:-/agenticgraph/}"
export AG_SKIP_DOCS_UPDATE="${AG_SKIP_DOCS_UPDATE:-1}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}"

echo "[agenticgraph] installing deps (canvas)..."
npm --prefix "${CANVAS_DIR}" install --no-audit --no-fund

echo "[agenticgraph] rebuilding native deps (esbuild)..."
npm --prefix "${CANVAS_DIR}" rebuild esbuild || true

echo "[agenticgraph] building (canvas) with base=${VITE_BASE_PATH}..."
npm --prefix "${CANVAS_DIR}" run build

echo "[agenticgraph] syncing dist -> huijoohwee/content/agenticgraph..."
node "${ROOT_DIR}/scripts/sync-pages-agenticgraph.mjs"

echo "[agenticgraph] done. Now commit+push in the huijoohwee repo:"
echo "  cd ../huijoohwee && git add content/agenticgraph _redirects _headers && git commit -m \"Publish agenticgraph\" && git push"

