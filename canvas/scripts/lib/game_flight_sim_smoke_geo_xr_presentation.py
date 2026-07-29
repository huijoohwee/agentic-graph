from __future__ import annotations

import time
from typing import Any

from playwright.sync_api import Page

from lib.game_flight_sim_smoke_geo_view_cases import (
    GEO_XR_VIEW_CASES,
    select_geo_xr_view,
)
from lib.game_flight_sim_smoke_geo_xr import _read_view, _wait_for_view
from lib.game_flight_sim_smoke_geo_xr_layout import (
    prepare_reported_singapore_geo_handoff,
)
from lib.game_flight_sim_smoke_source_selection import (
    close_source_files_selection_surface,
)


def restore_flight_sim_panel(page: Page) -> None:
    page.evaluate(
        """
        async () => {
          const graph = await window.__kgFlightSimBrowserProof.importModule(
            'graphStore',
          )
          const state = graph.useGraphStore.getState()
          state.setFloatingPanelOpen(true)
          state.setFloatingPanelView('flightSim')
        }
        """
    )
    page.locator('[aria-label="Flight Sim"]').wait_for(
        state="visible", timeout=30_000,
    )


def verify_geo_xr_four_view_presentation(page: Page) -> dict[str, Any]:
    baseline_camera = page.evaluate(
        """
        async () => {
          const [camera, cameraSource, graph, gympgrph] = await Promise.all([
            window.__kgFlightSimBrowserProof.importModule('flightSimCameraRuntime'),
            window.__kgFlightSimBrowserProof.importModule('xrNativeControllerCameraRuntime'),
            window.__kgFlightSimBrowserProof.importModule('graphStore'),
            window.__kgFlightSimBrowserProof.importModule('gympgrphStore'),
          ])
          const state = graph.useGraphStore.getState()
          return {
            cameraPreference: camera.readFlightSimCameraSnapshot().view,
            cameraSourceMode: cameraSource.readXrNativeControllerCamera().mode,
            floatingPanelOpen: state.floatingPanelOpen,
            floatingPanelView: state.floatingPanelView,
            geospatialViewMode:
              gympgrph.useGympgrphStore.getState().geospatialViewMode,
            geospatialStyleUrl: localStorage.getItem(
              gympgrph.LS_KEYS.geospatialStyleUrl,
            ) || '',
          }
        }
        """
    )
    results: list[dict[str, Any]] = []
    source_files_opened = False
    source_files_transition: dict[str, Any] | None = None
    reported_handoff: dict[str, Any] | None = None
    try:
        reported_handoff = prepare_reported_singapore_geo_handoff(page)
        source_files_opened = True
        for (
            view_mode,
            projection,
            button_label,
            style_url,
            provider_host,
        ) in GEO_XR_VIEW_CASES:
            select_geo_xr_view(page, button_label)
            _wait_for_view(
                page,
                expected_provider_host=provider_host,
                expected_view=view_mode,
                expected_projection=projection,
                expected_style_url=style_url,
            )
            restore_flight_sim_panel(page)
            observed = _wait_for_view(
                page,
                expected_provider_host=provider_host,
                expected_view=view_mode,
                expected_projection=projection,
                expected_style_url=style_url,
                require_visual_layout=True,
            )
            exact_contract = {
                "hostActive": True,
                "rendererCanvasCount": 1,
                "canvasStable": True,
                "rendererAlpha": True,
                "terrainCount": 0,
                "nativeVisualCount": 0,
                "flightR3fVisualCount": 0,
                "visualProjection": "maplibre",
                "rendererPointerTransparent": True,
                "exclusivePlainGeoOverlayCount": 0,
                "cameraPreference": baseline_camera["cameraPreference"],
                "cameraSource": baseline_camera["cameraSourceMode"],
            }
            for key, expected in exact_contract.items():
                if observed.get(key) != expected:
                    raise AssertionError(
                        f"Geo+XR {view_mode} violated {key}: "
                        f"expected={expected!r} observed={observed}"
                    )
            if not observed.get("hostRevision"):
                raise AssertionError(
                    f"Geo+XR {view_mode} did not publish a Flight revision: "
                    f"{observed}"
                )
            results.append(observed)
        before_movement = _read_view(page)
        page.evaluate(
            """
            async () => {
              const flight = await window.__kgFlightSimBrowserProof.importModule(
                'flightSimRuntime',
              )
              flight.restartFlightSim()
              return flight.startFlightSim()
            }
            """
        )
        page.keyboard.down("KeyW")
        try:
            movement_deadline = time.monotonic() + 15
            after_movement: dict[str, Any] = {}
            while time.monotonic() < movement_deadline:
                after_movement = _read_view(page)
                layout = after_movement.get("layoutOcclusion") or {}
                if (
                    after_movement.get("flightTick", 0)
                    > before_movement.get("flightTick", 0)
                    and after_movement.get("overlayRevision")
                    != before_movement.get("overlayRevision")
                    and after_movement.get("aircraftCoordinate")
                    != before_movement.get("aircraftCoordinate")
                    and layout.get("aircraftUnoccluded") is True
                ):
                    break
                page.wait_for_timeout(100)
            else:
                raise AssertionError(
                    "MapLibre Flight aircraft did not move through the exposed "
                    f"viewport: before={before_movement} after={after_movement}"
                )
        finally:
            page.keyboard.up("KeyW")
            page.evaluate(
                """
                async () => {
                  const flight = await window.__kgFlightSimBrowserProof.importModule(
                    'flightSimRuntime',
                  )
                  flight.restartFlightSim()
                }
                """
            )
    finally:
        prior_case = next(
            (
                case for case in GEO_XR_VIEW_CASES
                if case[0] == baseline_camera["geospatialViewMode"]
                and case[3] == baseline_camera["geospatialStyleUrl"]
            ),
            None,
        )
        if prior_case is None:
            raise AssertionError(
                "source-authored Geo view/style was outside the four-view "
                f"contract: {baseline_camera}"
            )
        select_geo_xr_view(page, prior_case[2])
        _wait_for_view(
            page,
            expected_provider_host=prior_case[4],
            expected_view=prior_case[0],
            expected_projection=prior_case[1],
            expected_style_url=prior_case[3],
        )
        restore_flight_sim_panel(page)
        restored_view = _wait_for_view(
            page,
            expected_provider_host=prior_case[4],
            expected_view=prior_case[0],
            expected_projection=prior_case[1],
            expected_style_url=prior_case[3],
            require_visual_layout=source_files_opened,
        )
        if source_files_opened:
            source_files_transition = close_source_files_selection_surface(page)
        page.evaluate(
            """
            async prior => {
              const graph = await window.__kgFlightSimBrowserProof.importModule(
                'graphStore',
              )
              const state = graph.useGraphStore.getState()
              state.setFloatingPanelOpen(prior.floatingPanelOpen)
              state.setFloatingPanelView(prior.floatingPanelView)
            }
            """,
            {
                "floatingPanelOpen": baseline_camera["floatingPanelOpen"],
                "floatingPanelView": baseline_camera["floatingPanelView"],
            },
        )
    return {
        "baselineCameraPreference": baseline_camera["cameraPreference"],
        "baselineCameraSource": baseline_camera["cameraSourceMode"],
        "reportedSingaporeGeoHandoff": reported_handoff,
        "sourceFilesTransition": source_files_transition,
        "sourceView": baseline_camera["geospatialViewMode"],
        "sourceStyleUrl": baseline_camera["geospatialStyleUrl"],
        "restoredView": restored_view,
        "liveMovement": {
            "before": before_movement,
            "after": after_movement,
        },
        "views": results,
    }
