from __future__ import annotations

import time
from typing import Any, Callable

from playwright.sync_api import Page


def _open_editor_workspace(page: Page) -> None:
    editor_workspace_button = page.get_by_role(
        "button", name="Editor Workspace", exact=True
    )
    if (
        editor_workspace_button.count() == 0
        or not editor_workspace_button.first.is_visible()
    ):
        workspace_view_button = page.get_by_role(
            "button", name="Workspace View", exact=True
        )
        workspace_view_button.wait_for(state="visible", timeout=120_000)
        workspace_view_button.click()
    storage_sync_on_button = page.get_by_role(
        "button", name="Storage Sync: On", exact=True
    )
    if (
        storage_sync_on_button.count() > 0
        and storage_sync_on_button.first.is_visible()
    ):
        storage_sync_on_button.click()
        page.get_by_role(
            "button", name="Storage Sync: Off", exact=True
        ).wait_for(state="visible", timeout=120_000)
    editor_workspace_button.wait_for(state="visible", timeout=120_000)
    editor_workspace_button.click()


def prepare_source_files_selection_surface(page: Page) -> None:
    _open_editor_workspace(page)
    page.locator(
        '[aria-label="Workspace editor overlay shell"]'
    ).wait_for(state="visible", timeout=120_000)
    page.locator(
        '[aria-label="Markdown Workspace"]'
    ).wait_for(state="visible", timeout=120_000)
    explorer_toggle = page.get_by_role(
        "checkbox", name="Show Explorer pane", exact=True
    )
    explorer_toggle.wait_for(state="visible", timeout=120_000)
    if not explorer_toggle.is_checked():
        explorer_toggle.check()
    source_files_button = page.get_by_role(
        "button", name="Source Files", exact=True
    )
    source_files_button.wait_for(state="visible", timeout=120_000)
    if source_files_button.get_attribute("aria-expanded") != "true":
        source_files_button.click()
    page.locator(
        '[aria-label="Source Files content"]'
    ).wait_for(state="visible", timeout=120_000)
    page.get_by_role(
        "button", name="Folder docs", exact=True
    ).wait_for(state="visible", timeout=120_000)


def _read_source_files_selection_surface(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        async () => {
          const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
          const state = store.useGraphStore.getState()
          const overlay = document.querySelector(
            '[aria-label="Workspace editor overlay shell"]',
          )
          const style = overlay ? window.getComputedStyle(overlay) : null
          const rect = overlay?.getBoundingClientRect()
          return {
            overlayPresent: Boolean(overlay),
            overlayVisible: Boolean(
              overlay
              && style?.display !== 'none'
              && style?.visibility !== 'hidden'
              && rect
              && rect.width > 0
              && rect.height > 0
            ),
            workspaceCanvasPaneOpen: state.workspaceCanvasPaneOpen,
            workspaceViewMode: state.workspaceViewMode,
          }
        }
        """
    )


def close_source_files_selection_surface(page: Page) -> dict[str, Any]:
    before = _read_source_files_selection_surface(page)
    overlay = page.locator(
        '[aria-label="Workspace editor overlay shell"]'
    ).first
    close_button = overlay.locator(
        'main[aria-label="Markdown Editor and Viewer"] '
        'button[title="Close"]'
    )
    if close_button.count() != 1 or not close_button.first.is_visible():
        raise AssertionError(
            "Source Files selection surface exposed no exact Close action: "
            f"count={close_button.count()}, surface={before}"
        )
    close_button.first.click(timeout=5_000)
    deadline = time.monotonic() + 5
    after = _read_source_files_selection_surface(page)
    while time.monotonic() < deadline:
        after = _read_source_files_selection_surface(page)
        if (
            after.get("workspaceViewMode") == "canvas"
            and after.get("workspaceCanvasPaneOpen") is False
            and after.get("overlayVisible") is False
        ):
            return {"before": before, "after": after}
        page.wait_for_timeout(50)
    raise AssertionError(
        f"Source Files selection surface did not close before Flight apply: "
        f"before={before}, after={after}"
    )


def _show_workspace_seed_files(
    page: Page,
    *,
    flight_basename: str,
) -> None:
    flight_button = page.get_by_role(
        "button", name=f"File {flight_basename}", exact=True
    )
    workspace_seeds_button = page.get_by_role(
        "button", name="Folder workspace-seeds", exact=True
    )
    docs_button = page.get_by_role(
        "button", name="Folder docs", exact=True
    )
    if docs_button.count() == 0 or not docs_button.first.is_visible():
        prepare_source_files_selection_surface(page)
    if workspace_seeds_button.count() == 0:
        docs_button.click()
        workspace_seeds_button.wait_for(state="visible", timeout=120_000)
    if flight_button.count() == 0:
        workspace_seeds_button.click()
        flight_button.wait_for(state="visible", timeout=120_000)


def read_flight_hud_activation(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        async () => {
          const [
            store,
            readiness,
            runtime,
            ownership,
            gympgrphStore,
          ] = await Promise.all([
            window.__kgFlightSimBrowserProof.importModule('graphStore'),
            window.__kgFlightSimBrowserProof.importModule(
              'sourceFilesBootstrapReadiness',
            ),
            window.__kgFlightSimBrowserProof.importModule('flightSimRuntime'),
            window.__kgFlightSimBrowserProof.importModule(
              'flightSimSurfaceOwnershipStatus',
            ),
            window.__kgFlightSimBrowserProof.importModule('gympgrphStore'),
          ])
          const state = store.useGraphStore.getState()
          const hud = document.querySelector(
            '[data-kg-flight-sim-hud="1"]',
          )
          const mapCanvases = Array.from(document.querySelectorAll(
            'canvas.maplibregl-canvas',
          ))
          const geospatialRoot = document.querySelector(
            '[data-kg-flight-geospatial-overlay="active"]',
          )
          const visible = element => {
            if (!(element instanceof HTMLElement)) return false
            const rect = element.getBoundingClientRect()
            if (rect.width <= 0 || rect.height <= 0) return false
            let current = element
            while (current instanceof HTMLElement) {
              const style = window.getComputedStyle(current)
              if (
                style.display === 'none'
                || style.visibility === 'hidden'
                || Number(style.opacity || '1') <= 0
              ) return false
              current = current.parentElement
            }
            return true
          }
          const visibleMapCanvases = mapCanvases.filter(visible)
          return {
            bootstrap: readiness.readSourceFilesBootstrapSnapshot(),
            canvas3dMode: state.canvas3dMode,
            documentName: state.markdownDocumentName,
            flight: runtime.readFlightSimSnapshot(),
            geospatialModeEnabled:
              gympgrphStore.isGeospatialModeEnabled() === true,
            geospatialPresentation: geospatialRoot
              ? {
                  overlay: geospatialRoot.dataset.kgFlightGeospatialOverlay
                    || null,
                  presentedRevision:
                    geospatialRoot.dataset.kgFlightGeospatialPresentedRevision
                    || null,
                  revision:
                    geospatialRoot.dataset.kgFlightGeospatialRevision || null,
                }
              : null,
            hudCount: document.querySelectorAll(
              '[data-kg-flight-sim-hud="1"]',
            ).length,
            hudVisible: visible(hud),
            mapCanvasCount: mapCanvases.length,
            mapCanvasVisible: visibleMapCanvases.length > 0,
            visibleMapCanvasCount: visibleMapCanvases.length,
            ownership: ownership.readFlightSimSurfaceOwnershipStatus(),
            renderMode: state.canvasRenderMode,
          }
        }
        """
    )


def wait_for_flight_hud_activation(
    page: Page,
    *,
    timeout_ms: int = 10_000,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_ms / 1000
    last_value: dict[str, Any] = {}
    while time.monotonic() < deadline:
        last_value = read_flight_hud_activation(page)
        flight = last_value.get("flight") or {}
        presentation = last_value.get("geospatialPresentation") or {}
        revision = str(presentation.get("revision") or "")
        presented_revision = str(
            presentation.get("presentedRevision") or ""
        )
        if (
            last_value.get("hudVisible") is True
            and last_value.get("geospatialModeEnabled") is True
            and last_value.get("mapCanvasVisible") is True
            and last_value.get("visibleMapCanvasCount") == 1
            and flight.get("active") is True
            and not flight.get("runtimeError")
            and presentation.get("overlay") == "active"
            and revision != ""
            and presented_revision == revision
        ):
            return last_value
        bootstrap = last_value.get("bootstrap") or {}
        if bootstrap.get("phase") == "error":
            raise AssertionError(
                "Flight Source Files activation failed before HUD mount: "
                f"{last_value}"
            )
        page.wait_for_timeout(50)
    raise AssertionError(
        "Flight Source Files activation did not present Flight above the "
        "visible native geospatial MapLibre surface: "
        f"{last_value}"
    )


def verify_source_file_button_round_trip(
    page: Page,
    expected_source_text: str,
    *,
    flight_basename: str,
    physics_basename: str,
    poll: Callable[..., dict[str, Any]],
    read_source_identity: Callable[[Page, str], dict[str, Any]],
) -> dict[str, Any]:
    _show_workspace_seed_files(
        page,
        flight_basename=flight_basename,
    )
    flight_button = page.get_by_role(
        "button", name=f"File {flight_basename}", exact=True
    )
    physics_button = page.get_by_role(
        "button", name=f"File {physics_basename}", exact=True
    )
    flight_button.wait_for(state="visible", timeout=120_000)
    flight_button.click()
    flight = poll(
        page,
        lambda: read_source_identity(page, expected_source_text),
        lambda value: (
            str(value.get("documentName") or "").endswith(flight_basename)
            and value.get("active") is True
            and value.get("authoredSeedByteIdentical") is True
            and value.get("workspaceSourceByteIdentical") is True
            and all((value.get("sourceContract") or {}).values())
            and value.get("surfaceMode") == "geo-xr"
            and value.get("renderMode") == "3d"
            and value.get("canvas3dMode") == "xr"
        ),
        label="Flight Source Files button Geo+XR activation",
    )
    wait_for_flight_hud_activation(page)
    flight_surface = page.evaluate(
        """
        () => {
          const root = document.querySelector(
            '[data-kg-xr-scene-media-drop="1"]',
          )
          const canvas = root?.querySelector('canvas') || null
          return {
            retainedCanvas: Boolean(canvas)
              && canvas === window.__kgFlightSimCanvas,
            rendererCanvasCount: Array.from(
              document.querySelectorAll('canvas'),
            ).filter(candidate => String(
              candidate.dataset.engine || '',
            ).startsWith('three.js')).length,
          }
        }
        """
    )
    if (
        flight_surface.get("retainedCanvas") is not True
        or flight_surface.get("rendererCanvasCount") != 1
    ):
        raise AssertionError(
            f"Flight file click replaced the shared XR Canvas: {flight_surface}"
        )

    physics_button.wait_for(state="visible", timeout=120_000)
    physics_button.click()
    restored = poll(
        page,
        lambda: page.evaluate(
            """
            async () => {
              const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
              const demos = await window.__kgFlightSimBrowserProof.importModule('workspaceRunReadyDemos')
              const state = store.useGraphStore.getState()
              const root = document.querySelector(
                '[data-kg-xr-scene-media-drop="1"]',
              )
              const canvas = root?.querySelector('canvas') || null
              return {
                documentName: state.markdownDocumentName,
                active: demos.isXrPhysicsRunReadyDemoActive(
                  state.markdownDocumentName,
                  state.markdownDocumentText,
                ),
                renderMode: state.canvasRenderMode,
                canvas3dMode: state.canvas3dMode,
                retainedCanvas: Boolean(canvas)
                  && canvas === window.__kgFlightSimCanvas,
                flightHudCount: document.querySelectorAll(
                  '[data-kg-flight-sim-hud="1"]',
                ).length,
              }
            }
            """
        ),
        lambda value: (
            str(value.get("documentName") or "").endswith(physics_basename)
            and value.get("active") is True
            and value.get("renderMode") == "3d"
            and value.get("canvas3dMode") == "xr"
            and value.get("retainedCanvas") is True
            and value.get("flightHudCount") == 0
        ),
        label="Physics Source Files button restoration",
    )
    return {
        "flight": flight,
        "flightSurface": flight_surface,
        "physics": restored,
    }
