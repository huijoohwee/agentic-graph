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
