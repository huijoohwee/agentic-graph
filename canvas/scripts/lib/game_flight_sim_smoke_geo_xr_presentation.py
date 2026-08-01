from __future__ import annotations

import time
from typing import Any, Callable

from playwright.sync_api import Page

from lib.game_flight_sim_smoke_geo_view_cases import (
    GEO_XR_VIEW_CASES,
    select_geo_xr_view,
)
from lib.game_flight_sim_smoke_geo_xr import _read_view, _wait_for_view
from lib.game_flight_sim_smoke_geo_xr_layout import (
    prepare_reported_singapore_geo_handoff,
)
from lib.game_flight_sim_smoke_city_regional_poi import (
    require_city_regional_poi_contract,
    require_city_regional_poi_teardown_contract,
)
from lib.game_flight_sim_smoke_source_selection import (
    close_source_files_selection_surface,
    prepare_source_files_selection_surface,
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
    page.locator('[data-kg-flight-sim-floating-panel="1"]').wait_for(
        state="visible", timeout=30_000,
    )


def _wait_for_browser_contract(
    page: Page,
    *,
    label: str,
    accepted: Callable[[dict[str, Any]], bool],
) -> dict[str, Any]:
    deadline = time.monotonic() + 30
    observed: dict[str, Any] = {}
    while time.monotonic() < deadline:
        observed = _read_view(page)
        if accepted(observed):
            return observed
        page.wait_for_timeout(100)
    raise AssertionError(
        f"timed out waiting for {label}: {observed}"
    )


def _exit_city_for_cleanup(page: Page) -> None:
    observed = _read_view(page)
    if observed.get("cityActive") is not True:
        return
    city_panel = page.locator('[data-kg-city-sim-floating-panel="1"]').first
    exit_button = city_panel.locator('[data-kg-city-sim-exit="1"]').first
    if exit_button.count() != 1 or not exit_button.is_visible():
        return
    exit_button.click(timeout=30_000)
    _wait_for_browser_contract(
        page,
        label="City cleanup restoration",
        accepted=lambda value: value.get("cityActive") is False
        and value.get("geospatialEnabled") is True
        and value.get("geospatialPreferenceEnabled") is True,
    )


def _install_city_map_retention_audit(page: Page) -> None:
    page.evaluate(
        """
        async () => {
          const gympgrph = await window.__kgFlightSimBrowserProof.importModule(
            'gympgrphStore',
          )
          const map = gympgrph.readActiveMapLibreMap?.() || null
          if (!map || typeof map.remove !== 'function') {
            throw new Error('City handoff expected a live Flight MapLibre owner.')
          }
          const remove = map.remove
          const audit = {
            map,
            removeCalls: 0,
          }
          window.__kgFlightCityMapRetentionAudit = audit
          map.remove = function (...args) {
            audit.removeCalls += 1
            return remove.apply(this, args)
          }
        }
        """
    )

def verify_flight_geo_xr_city_handoff(
    page: Page,
    *,
    expected_provider_host: str,
    expected_view: str,
    expected_projection: str,
    expected_style_url: str,
) -> dict[str, Any]:
    before = _read_view(page)
    if (
        before.get("flightActive") is not True
        or before.get("hudVisible") is not True
        or before.get("geospatialEnabled") is not True
        or before.get("geospatialPreferenceEnabled") is not True
    ):
        raise AssertionError(
            "City handoff requires an active Flight Geo+XR surface: "
            f"{before}"
        )

    _install_city_map_retention_audit(page)
    source_basenames = page.evaluate(
        """
        async () => {
          const demos = await window.__kgFlightSimBrowserProof.importModule(
            'workspaceRunReadyDemos',
          )
          return {
            city: demos.CITY_SIM_DEMO_WORKSPACE_SEED_BASENAME,
            flight: demos.FLIGHT_SIM_DEMO_WORKSPACE_SEED_BASENAME,
          }
        }
        """
    )
    city_source_basename = str(source_basenames.get("city") or "")
    flight_source_basename = str(source_basenames.get("flight") or "")
    if not city_source_basename or not flight_source_basename:
        raise AssertionError(
            "City handoff could not resolve the canonical source registry: "
            f"{source_basenames}"
        )
    city_source_button = page.get_by_role(
        "button",
        name=f"File {city_source_basename}",
        exact=True,
    ).first
    city_source_button.wait_for(state="visible", timeout=30_000)
    city_source_button.click(timeout=30_000)
    city_source_surface_transition = close_source_files_selection_surface(page)
    city_panel = page.locator('[data-kg-city-sim-floating-panel="1"]').first
    city_panel.wait_for(state="visible", timeout=30_000)

    city = _wait_for_browser_contract(
        page,
        label=(
            "source-authored MapLibre-owned City Geo+XR surface after "
            "Flight Geo+XR"
        ),
        accepted=lambda value: (
            value.get("flightActive") is False
            and value.get("cityActive") is True
            and value.get("cityPanelVisible") is True
            and value.get("citySemanticSurfaceActive") is True
            and value.get("citySemanticSurfaceNodeName") == "FIGURE"
            and value.get("citySemanticSurfaceAccessibleName")
            == "Interactive City simulation media stage"
            and value.get("citySemanticSurfaceSelectableMarker") == ""
            and value.get("citySemanticSurfaceAriaHidden") is False
            and value.get("citySemanticSurfaceVisibleMapLibreCanvasCount") == 1
            and value.get("citySemanticSurfaceCenterMapLibreOwned") is True
            and value.get("citySemanticSurfaceCaptionId")
            == value.get("cityMapLibreCanvasAriaLabelledBy")
            and value.get("cityMapLibreCanvasAriaLabelledByName")
            == "Interactive City simulation media stage"
            and value.get("cityMapLibreCanvasAccessibleName")
            == "Interactive City simulation media stage"
            and value.get("cityMapLibreCanvasAriaHidden") is False
            and value.get("cityMapLibreCanvasSelectableMarker") == "1"
            and value.get("cityMapLibreCanvasSelectableOwnerIsCanvas") is True
            and value.get("cityMapLibreCanvasSelectableOwnerNodeName")
            == "CANVAS"
            and value.get("cityMapLibreOwnerCount") == 1
            and value.get("floatingPanelOpen") is True
            and value.get("floatingPanelView") == "cityBuilder"
            and value.get("renderMode") == "3d"
            and value.get("canvas3dMode") == "xr"
            and value.get("geospatialEnabled") is True
            and value.get("geospatialPreferenceEnabled") is True
            and value.get("geoXrSurfaceActive") is True
            and value.get("geoXrSurfaceCount") == 1
            and value.get("geoXrLayerCount") == 1
            and value.get("activeMapPresent") is True
            and value.get("mapLibreCanvasCount") == 1
            and value.get("visibleMapLibreCanvasCount") == 1
            and value.get("threeCanvasOwnerCount") == 1
            and value.get("threeCanvasActiveCount") == 0
            and value.get("threeCanvasInactiveCount") == 1
            and value.get("canvasStable") is True
            and value.get("rendererPointerTransparent") is True
            and value.get("rendererSurfaceVisible") is False
            and value.get("flightR3fVisualCount") == 0
            and value.get("hudVisible") is False
            and value.get("flightHudCount") == 0
            and value.get("flightSourceFeatures") == 0
            and value.get("flightSourcePresent") is False
            and value.get("flightLayersReady") is False
            and value.get("aircraftLayerType") == ""
            and value.get("aircraftGeometryType") == ""
            and value.get("overlayPhase") == "stopped"
            and value.get("overlayRoutePointCount") == 0
            and value.get("sourceKinds") == []
            and value.get("environmentId") == ""
            and value.get("environmentSourceFeatures") == 0
            and value.get("environmentLayerCount") == 0
            and value.get("environmentPoiIds") == []
            and value.get("renderedEnvironmentPoiIds") == []
            and value.get("environmentSourceExactlyMatchesOverlay") is True
            and value.get("environmentSourcePresent") is False
            and isinstance(value.get("cityExpectedParcelCount"), int)
            and value.get("cityExpectedParcelCount") > 0
            and value.get("cityPresentationStateCount") > 0
            and value.get("cityPresentationExact") is True
            and value.get("cityOwnedSourceCount") == 0
            and value.get("cityOwnedLayerCount") == 0
            and value.get("renderedFeatureCount") == 0
            and value.get("renderedEnvironmentFeatureCount") == 0
        ),
    )
    regional_poi = require_city_regional_poi_contract(page)
    retention = page.evaluate(
        """
        async () => {
          const audit = window.__kgFlightCityMapRetentionAudit || null
          const gympgrph = await window.__kgFlightSimBrowserProof.importModule(
            'gympgrphStore',
          )
          const currentMap = gympgrph.readActiveMapLibreMap?.() || null
          return {
            removeCalls: Number(audit?.removeCalls || 0),
            sameMap: Boolean(audit?.map) && audit.map === currentMap,
          }
        }
        """
    )
    if (
        not isinstance(retention, dict)
        or retention.get("sameMap") is not True
        or retention.get("removeCalls") != 0
    ):
        raise AssertionError(
            "City did not retain the existing MapLibre owner: "
            f"{retention}"
        )

    exit_button = city_panel.locator('[data-kg-city-sim-exit="1"]').first
    exit_button.wait_for(state="visible", timeout=30_000)
    if exit_button.is_disabled():
        raise AssertionError("City Builder Exit was disabled during handoff proof")
    exit_button.click(timeout=30_000)
    restored = _wait_for_browser_contract(
        page,
        label="awaited City prior-surface restoration",
        accepted=lambda value: (
            value.get("flightActive") is False
            and value.get("cityActive") is False
            and value.get("cityPanelVisible") is False
            and value.get("citySemanticSurfaceActive") is False
            and value.get("cityMapLibreCanvasAriaLabelledBy") == ""
            and value.get("cityMapLibreCanvasAccessibleName") == "Map"
            and value.get("cityMapLibreCanvasAriaHidden") is False
            and value.get("cityMapLibreCanvasSelectableMarker") == ""
            and value.get(
                "cityMapLibreCanvasSelectableOwnerIsCanvas"
            ) is False
            and value.get("cityMapLibreCanvasSelectableOwnerNodeName") == ""
            and value.get("cityMapLibreOwnerCount") == 0
            and value.get("floatingPanelOpen") is True
            and value.get("floatingPanelView") == "flightSim"
            and value.get("renderMode") == "3d"
            and value.get("canvas3dMode") == "xr"
            and value.get("geospatialEnabled") is True
            and value.get("geospatialPreferenceEnabled") is True
            and value.get("geoXrSurfaceActive") is True
            and value.get("geoXrSurfaceCount") == 1
            and value.get("geoXrLayerCount") == 1
            and value.get("activeMapPresent") is True
            and value.get("mapLibreCanvasCount") == 1
            and value.get("visibleMapLibreCanvasCount") == 1
            and value.get("threeCanvasOwnerCount") == 1
            and value.get("threeCanvasActiveCount") == 1
            and value.get("threeCanvasInactiveCount") == 0
            and value.get("rendererPointerTransparent") is True
            and value.get("rendererSurfaceVisible") is True
            and value.get("hudVisible") is False
            and value.get("flightHudCount") == 0
            and value.get("flightSourceFeatures") == 0
            and value.get("environmentSourceFeatures") == 0
            and value.get("cityOwnedSourceCount") == 0
            and value.get("cityOwnedLayerCount") == 0
            and value.get("renderedFeatureCount") == 0
            and value.get("renderedEnvironmentFeatureCount") == 0
        ),
    )
    exited_regional_poi = require_city_regional_poi_teardown_contract(page)

    prepare_source_files_selection_surface(page)
    flight_source_button = page.get_by_role(
        "button",
        name=f"File {flight_source_basename}",
        exact=True,
    ).first
    flight_source_button.wait_for(state="visible", timeout=30_000)
    flight_source_button.click(timeout=30_000)
    reopened = _wait_for_view(
        page,
        expected_provider_host=expected_provider_host,
        expected_view=expected_view,
        expected_projection=expected_projection,
        expected_style_url=expected_style_url,
        require_visual_layout=True,
    )
    if (
        reopened.get("cityActive") is not False
        or reopened.get("citySemanticSurfaceActive") is not False
        or reopened.get("cityMapLibreCanvasAriaLabelledBy") != ""
        or reopened.get("cityMapLibreCanvasAccessibleName") != "Map"
        or reopened.get("cityMapLibreCanvasAriaHidden") is not False
        or reopened.get("cityMapLibreCanvasSelectableMarker") != ""
        or reopened.get(
            "cityMapLibreCanvasSelectableOwnerIsCanvas"
        ) is not False
        or reopened.get("cityMapLibreCanvasSelectableOwnerNodeName") != ""
        or reopened.get("cityMapLibreOwnerCount") != 0
        or reopened.get("cityOwnedSourceCount") != 0
        or reopened.get("cityOwnedLayerCount") != 0
        or reopened.get("hudVisible") is not True
    ):
        raise AssertionError(
            "normal Flight reopen did not restore the Flight-only Geo+XR view: "
            f"{reopened}"
        )
    reopened_regional_poi = require_city_regional_poi_teardown_contract(page)
    return {
        "before": before,
        "city": city,
        "regionalPoi": regional_poi,
        "regionalPoiAfterCityExit": exited_regional_poi,
        "regionalPoiAfterFlightReopen": reopened_regional_poi,
        "mapRetention": retention,
        "restored": restored,
        "reopened": reopened,
        "citySourceSurfaceTransition": city_source_surface_transition,
    }


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
    city_handoff: dict[str, Any] | None = None
    restored_view: dict[str, Any] = {}

    def restore_baseline() -> None:
        nonlocal restored_view, source_files_transition
        _exit_city_for_cleanup(page)
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

    primary_error: BaseException | None = None
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
                "flightR3fVisualNames": [],
                "visualProjection": "",
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
        current_case = GEO_XR_VIEW_CASES[-1]
        city_handoff = verify_flight_geo_xr_city_handoff(
            page,
            expected_provider_host=current_case[4],
            expected_view=current_case[0],
            expected_projection=current_case[1],
            expected_style_url=current_case[3],
        )
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
    except BaseException as error:
        primary_error = error
        raise
    finally:
        try:
            restore_baseline()
        except BaseException:
            if primary_error is None:
                raise
    return {
        "baselineCameraPreference": baseline_camera["cameraPreference"],
        "baselineCameraSource": baseline_camera["cameraSourceMode"],
        "reportedSingaporeGeoHandoff": reported_handoff,
        "cityHandoff": city_handoff,
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
