#!/usr/bin/env bash
set -euo pipefail

# One attempt per lockfile. Preserve the failure; retry only after diagnosis.
# Source the shared helper so its key and Git transport settings are unset here too.
export AGENTIC_GRAPH_NATIVE_REBUILD=skip
source "$(dirname "${BASH_SOURCE[0]}")/install-agentic-graph-dependencies.sh"
unset AGENTIC_GRAPH_NATIVE_REBUILD

# The mirror seal checker imports its own lockfile-pinned Agentic OS package.
mirror_root="${AGENTIC_OS_PUBLISH_REPOSITORY_ROOT:-../huijoohwee}"
npm --prefix "$mirror_root" ci --ignore-scripts --include=dev

# Each release job starts without the linked packages' generated exports.
npm run smoke:prepare

npx playwright install --with-deps chromium
