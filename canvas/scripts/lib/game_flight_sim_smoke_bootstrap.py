from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

from playwright.sync_api import Page


FLIGHT_SIM_BROWSER_PROOF_BRIDGE_SCHEMA = (
    "agentic-graph-flight-sim-browser-proof-bridge/v1"
)


STARTUP_PIPELINE_PROFILE_SCRIPT = """
(() => {
  const flag = '__AG_PIPELINE_PERF_ENABLED__';
  let events = [], timer = null, startedAtMs = null, stoppedAtMs = null;
  let hadFlag = false, priorFlag, closed = true, stopReason = 'not-started', starts = 0;
  const close = (reason = 'finally') => {
    if (closed) return;
    closed = true; stoppedAtMs = performance.now(); stopReason = reason;
    window.removeEventListener('kg-pipeline-perf', capture);
    clearTimeout(timer); timer = null;
    if (hadFlag) window[flag] = priorFlag; else delete window[flag];
  };
  const capture = event => {
    const value = event.detail;
    if (!closed && performance.now() - startedAtMs >= 10000) close('window-expired');
    if (closed || !value || typeof value.name !== 'string'
      || typeof value.stage !== 'string' || !Number.isFinite(value.durationMs)
      || value.durationMs < 0 || !Number.isFinite(value.ts) || value.ts < 0) return;
    events.push({name: value.name.slice(0, 128), stage: value.stage.slice(0, 128),
      durationMs: value.durationMs, ts: value.ts});
    if (events.length === 100) close('event-cap');
  };
  window.__kgFlightStartupProfile = {
    start() {
      close('restarted');
      hadFlag = Object.prototype.hasOwnProperty.call(window, flag);
      priorFlag = window[flag]; events = []; starts += 1;
      startedAtMs = performance.now(); stoppedAtMs = null;
      closed = false; stopReason = null; window[flag] = true;
      window.addEventListener('kg-pipeline-perf', capture);
      timer = setTimeout(() => close('window-expired'), 10000);
    },
    close,
    read: () => ({kind: 'diagnostic-only', starts, startedAtMs, stoppedAtMs,
      closed, stopReason, eventLimit: 100, windowMs: 10000,
      events: events.map(event => ({...event}))}),
  };
})();
"""


def print_startup_pipeline_profile(page: Page) -> None:
    try:
        result = page.evaluate("""() => {
          const profile = window.__kgFlightStartupProfile;
          if (!profile) return {kind: 'diagnostic-only', unavailable: true};
          profile.close(); const result = profile.read();
          delete window.__kgFlightStartupProfile; return result;
        }""")
    except Exception as error:
        result = {"kind": "diagnostic-only", "captureError": str(error)[:500]}
    print("[flight-startup-pipeline-diagnostic] " + json.dumps(result, allow_nan=False))


class BoundedEvaluationPage:
    """Delegate native Page operations; reject unfinished proof evaluations."""

    def __init__(self, page: Page, *, timeout_ms: int = 30_000) -> None:
        if type(timeout_ms) is not int or not 0 < timeout_ms <= 30_000:
            raise ValueError("proof evaluation timeout must be 1..30000 ms")
        self._page = page
        self._timeout_ms = timeout_ms

    def __getattr__(self, name: str) -> Any:
        return getattr(self._page, name)

    def evaluate(self, expression: str, arg: Any = None) -> Any:
        source = expression.strip()
        # Match native Playwright's function-source normalization. Statements
        # and nonfunction expressions keep their native global-eval semantics.
        if re.match(r"^(async)?\s*function(\s|\()", source):
            source = f"({source})"
        caller = sys._getframe(1)
        label = f"{Path(caller.f_code.co_filename).name}:{caller.f_lineno}"
        message = (
            "Flight proof Page.evaluate exceeded "
            f"{self._timeout_ms}ms at {label}"
        )
        wrapped = f"""
        async argument => {{
          let timer;
          const deadline = new Promise((_, reject) => {{
            timer = globalThis.setTimeout(
              () => reject(new Error({json.dumps(message)})),
              {self._timeout_ms}
            );
          }});
          try {{
            return await Promise.race([
              Promise.resolve().then(() => {{
                const value = globalThis.eval({json.dumps(source)});
                return typeof value === 'function' ? value(argument) : value;
              }}),
              deadline,
            ]);
          }} finally {{
            globalThis.clearTimeout(timer);
          }}
        }}
        """
        return self._page.evaluate(wrapped, arg)


def prepare_stable_candidate_page(page: Page, target_url: str) -> None:
    response = page.goto(target_url, wait_until="domcontentloaded")
    if response is None or not response.ok:
        status = response.status if response is not None else "none"
        raise AssertionError(
            "Flight production candidate page did not load: "
            f"{target_url} status={status}"
        )
    page.wait_for_function(
        """
        expectedSchema => (
          window.__kgFlightSimBrowserProof?.schema === expectedSchema
        )
        """,
        arg=FLIGHT_SIM_BROWSER_PROOF_BRIDGE_SCHEMA,
        timeout=120_000,
    )
