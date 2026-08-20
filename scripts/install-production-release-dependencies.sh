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

npx playwright install --with-deps chromium
