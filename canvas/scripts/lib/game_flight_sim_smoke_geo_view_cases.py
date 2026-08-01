from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

from playwright.sync_api import Page


GEO_XR_VIEW_CASES = (
    (
        "2d",
        "mercator",
        "2D (MapLibre, Classic) Demo tiles",
        "https://demotiles.maplibre.org/style.json",
        "demotiles.maplibre.org",
    ),
    (
        "2d-modern",
        "mercator",
        "2D (MapLibre, Modern) Liberty style",
        "https://tiles.openfreemap.org/styles/liberty",
        "tiles.openfreemap.org",
    ),
    (
        "3d",
        "globe",
        "3D (MapLibre, Classic) Globe style",
        "https://demotiles.maplibre.org/globe.json",
        "demotiles.maplibre.org",
    ),
    (
        "3d-modern",
        "globe",
        "3D (MapLibre, Modern) Liberty style",
        "https://tiles.openfreemap.org/styles/liberty",
        "tiles.openfreemap.org",
    ),
)

GeoXrViewCase = tuple[str, str, str, str, str]


def select_geo_xr_view(page: Page, button_label: str) -> None:
    page.evaluate(
        """
        async () => {
          const graph = await window.__kgFlightSimBrowserProof.importModule(
            'graphStore',
          )
          const state = graph.useGraphStore.getState()
          state.setFloatingPanelOpen(true)
          state.setFloatingPanelView('geo')
        }
        """
    )
    button = page.get_by_label(button_label, exact=True)
    button.wait_for(state="visible", timeout=30_000)
    button.click(timeout=30_000)


def wait_for_surface_contract(
    page: Page,
    *,
    expected: dict[str, Any],
    label: str,
    read_view: Callable[[Page], dict[str, Any]],
    require_revision_sync: bool = False,
) -> dict[str, Any]:
    deadline = time.monotonic() + 30
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        last = read_view(page)
        if (
            all(last.get(key) == value for key, value in expected.items())
            and (not require_revision_sync or bool(last.get("hostRevision"))
                 and last.get("hostRevision") == last.get("overlayRevision"))
        ):
            return last
        page.wait_for_timeout(100)
    raise AssertionError(f"timed out waiting for {label}: {last}")
