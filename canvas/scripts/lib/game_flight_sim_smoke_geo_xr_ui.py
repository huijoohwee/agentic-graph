from __future__ import annotations

from typing import Any

from playwright.sync_api import Locator, Page, expect


def _click_with_trusted_proof(
    page: Page,
    locator: Locator,
    key: str,
) -> None:
    locator.evaluate(
        """
        (element, key) => {
          const proof = window.__kgFlightSimGeoXrUiPath
          proof[key] = false
          element.addEventListener(
            'click',
            event => {
              proof[key] = event.isTrusted === true
            },
            { capture: true, once: true },
          )
        }
        """,
        key,
    )
    locator.click(timeout=30_000)
    page.wait_for_function(
        "key => window.__kgFlightSimGeoXrUiPath?.[key] === true",
        arg=key,
        timeout=5_000,
    )


def activate_geo_xr_from_toolbar(page: Page) -> dict[str, Any]:
    page.evaluate(
        "() => { window.__kgFlightSimGeoXrUiPath = Object.create(null) }"
    )
    floating_panel = page.locator(
        '[data-kg-floating-panel-root="true"]:visible'
    )
    expect(floating_panel).to_have_count(1)
    camera_trigger = floating_panel.locator(
        '[data-kg-floating-panel-view-trigger="camera"]'
    )
    _click_with_trusted_proof(
        page,
        camera_trigger,
        "cameraPrestateClicked",
    )
    camera_panel = floating_panel.locator('[aria-label="Camera panel"]')
    geo_panel = floating_panel.locator('[aria-label="Geospatial panel"]')
    expect(camera_panel).to_be_visible(timeout=30_000)
    expect(geo_panel).not_to_be_visible(timeout=30_000)

    toolbar = page.get_by_role(
        "navigation",
        name="Main Toolbar",
        exact=True,
    )
    mode_trigger = toolbar.locator(
        '[data-kg-toolbar-dropdown-trigger="canvas-view-mode"]'
    )
    expect(mode_trigger).to_have_count(1)
    _click_with_trusted_proof(page, mode_trigger, "modeTriggerClicked")
    menu = page.locator("menu.kg-toolbar-dropdown-menu:visible")
    expect(menu).to_have_count(1)
    surface = menu.get_by_role("button", name="Surface Mode", exact=True)
    try:
        expect(surface).to_have_attribute(
            "aria-expanded",
            "true",
            timeout=1_000,
        )
    except AssertionError:
        _click_with_trusted_proof(page, surface, "surfaceModeClicked")
    else:
        _click_with_trusted_proof(page, surface, "surfaceModeClicked")
        expect(surface).to_have_attribute("aria-expanded", "false")
        surface.click(timeout=30_000)
    expect(surface).to_have_attribute("aria-expanded", "true")

    geo_xr_option = menu.get_by_role(
        "button",
        name="Geo+XR Mode",
        exact=True,
    )
    _click_with_trusted_proof(page, geo_xr_option, "geoXrModeClicked")
    expect(mode_trigger).to_have_attribute(
        "aria-label",
        "2D Mode: Geo+XR Mode",
    )
    expect(geo_panel).to_be_visible(timeout=30_000)
    expect(camera_panel).not_to_be_visible(timeout=30_000)

    _click_with_trusted_proof(
        page,
        camera_trigger,
        "cameraResetClicked",
    )
    expect(camera_panel).to_be_visible(timeout=30_000)
    expect(geo_panel).not_to_be_visible(timeout=30_000)
    geo_trigger = floating_panel.locator(
        '[data-kg-floating-panel-view-trigger="geo"]'
    )
    _click_with_trusted_proof(page, geo_trigger, "geoTriggerClicked")
    expect(geo_panel).to_be_visible(timeout=30_000)
    expect(camera_panel).not_to_be_visible(timeout=30_000)
    expect(page.locator(
        '[data-kg-flight-geospatial-overlay="active"]'
    )).to_be_visible()

    proof = page.evaluate(
        "() => ({ ...window.__kgFlightSimGeoXrUiPath })"
    )
    expected_keys = {
        "cameraPrestateClicked",
        "modeTriggerClicked",
        "surfaceModeClicked",
        "geoXrModeClicked",
        "cameraResetClicked",
        "geoTriggerClicked",
    }
    if any(proof.get(key) is not True for key in expected_keys):
        raise AssertionError(f"Geo+XR UI path was not trusted: {proof}")
    return {
        **proof,
        "geoXrOpenedGeoPanel": True,
        "geoTriggerOpenedGeoPanel": True,
    }
