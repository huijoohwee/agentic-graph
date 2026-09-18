#!/usr/bin/env bash
set -euo pipefail

# One attempt per lockfile. Preserve the failure; retry only after diagnosis.
npm ci

# The mirror's seal checker imports its own lockfile-pinned Agentic OS package.
mirror_root="${AGENTIC_OS_PUBLISH_REPOSITORY_ROOT:-../huijoohwee}"
npm --prefix "$mirror_root" ci --ignore-scripts --include=dev

# Each release job starts without the linked packages' generated exports.
npm run smoke:prepare

npx playwright install --with-deps chromium
