#!/usr/bin/env bash
set -euo pipefail

DEERFLOW_PORT="${DEERFLOW_PORT:-8001}"
DEERFLOW_REPO="${DEERFLOW_REPO_PATH:-../deer-flow}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cleanup() {
  if [ -n "${DEERFLOW_PID:-}" ] && kill -0 "$DEERFLOW_PID" 2>/dev/null; then
    echo "[dev:all] Stopping DeerFlow gateway (PID $DEERFLOW_PID)"
    kill "$DEERFLOW_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if curl -sf --max-time 2 "http://localhost:${DEERFLOW_PORT}/api/llm/chat/completions" >/dev/null 2>&1; then
  echo "[dev:all] DeerFlow gateway already running on port ${DEERFLOW_PORT}"
else
  if [ ! -d "$DEERFLOW_REPO" ]; then
    echo "[dev:all] WARNING: DeerFlow repo not found at ${DEERFLOW_REPO}"
    echo "[dev:all] Set DEERFLOW_REPO_PATH to your deer-flow repo location"
    echo "[dev:all] Starting AgenticGraph dev server only (no DeerFlow gateway)"
  else
    echo "[dev:all] Starting DeerFlow gateway on port ${DEERFLOW_PORT} from ${DEERFLOW_REPO}"
    cd "$DEERFLOW_REPO"
    python3 -m deer_flow.server --port "$DEERFLOW_PORT" &
    DEERFLOW_PID=$!
    cd "$PROJECT_DIR"
    sleep 2
    if ! kill -0 "$DEERFLOW_PID" 2>/dev/null; then
      echo "[dev:all] ERROR: DeerFlow gateway failed to start"
      unset DEERFLOW_PID
    else
      echo "[dev:all] DeerFlow gateway started (PID $DEERFLOW_PID)"
    fi
  fi
fi

echo "[dev:all] Starting AgenticGraph dev server"
cd "$PROJECT_DIR"
npm run dev
