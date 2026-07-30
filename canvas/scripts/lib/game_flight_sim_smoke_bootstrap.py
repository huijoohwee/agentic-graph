from __future__ import annotations

from playwright.sync_api import Page


FLIGHT_SIM_BROWSER_PROOF_BRIDGE_SCHEMA = (
    "knowgrph-flight-sim-browser-proof-bridge/v1"
)


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
