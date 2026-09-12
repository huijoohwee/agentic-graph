#!/usr/bin/env bash
set -euo pipefail

for attempt in 1 2 3; do
  if npm ci; then
    break
  fi
  if [ "$attempt" -eq 3 ]; then
    echo "npm ci failed after $attempt attempts" >&2
    exit 1
  fi
  sleep "$((attempt * 10))"
done

# The mirror's seal checker imports its own lockfile-pinned Agentic OS package.
mirror_root="${AGENTIC_OS_PUBLISH_REPOSITORY_ROOT:-../huijoohwee}"
for attempt in 1 2 3; do
  if npm --prefix "$mirror_root" ci --ignore-scripts --include=dev; then
    break
  fi
  if [ "$attempt" -eq 3 ]; then
    echo "mirror npm ci failed after $attempt attempts" >&2
    exit 1
  fi
  sleep "$((attempt * 10))"
done

# Each release job starts without the linked packages' generated exports.
npm run smoke:prepare

npx playwright install --with-deps chromium
