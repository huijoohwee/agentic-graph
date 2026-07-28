from __future__ import annotations

import time
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

def _select_view(page: Page, button_label: str) -> None:
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


def _read_view(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        async () => {
          const graph = await window.__kgFlightSimBrowserProof.importModule(
            'graphStore',
          )
          const gympgrph = await window.__kgFlightSimBrowserProof.importModule(
            'gympgrphStore',
          )
          const camera = await window.__kgFlightSimBrowserProof.importModule(
            'flightSimCameraRuntime',
          )
          const cameraSource = await window.__kgFlightSimBrowserProof.importModule(
            'xrNativeControllerCameraRuntime',
          )
          const flight = await window.__kgFlightSimBrowserProof.importModule(
            'flightSimRuntime',
          )
          const graphState = graph.useGraphStore.getState()
          const gympgrphState = gympgrph.useGympgrphStore.getState()
          const flightSnapshot = flight.readFlightSimSnapshot()
          const blob = await graphState.captureThreeGltfSnapshot()
          const gltf = blob ? JSON.parse(await blob.text()) : null
          const nodes = Array.isArray(gltf?.nodes) ? gltf.nodes : []
          const host = document.querySelector(
            '[data-kg-flight-geospatial-overlay="active"]',
          )
          const hud = document.querySelector('[data-kg-flight-sim-hud="1"]')
          const isVisible = element => {
            const rect = element?.getBoundingClientRect()
            const style = element ? getComputedStyle(element) : null
            return Boolean(rect?.width > 0 && rect?.height > 0)
              && style?.display !== 'none' && style?.visibility !== 'hidden'
              && Number(style?.opacity || '1') > 0
          }
          const rendererCanvases = Array.from(
            document.querySelectorAll('canvas'),
          ).filter(
            canvas => String(canvas.dataset.engine || '').startsWith('three.js'),
          )
          const rendererCanvas = rendererCanvases[0] || null
          const mapCanvases = host
            ? Array.from(host.querySelectorAll('canvas.maplibregl-canvas'))
            : []
          const visibleMapCanvases = mapCanvases.filter(isVisible)
          const map = gympgrph.readActiveMapLibreMap?.() || null
          const overlay = gympgrph.readFlightGeoOverlay?.() || null
          const sourceId = gympgrph.FLIGHT_GEO_OVERLAY_SOURCE_ID
            || 'kg-flight-sim:geo-overlay'
          const layerIds = [
            `${sourceId}:route`,
            `${sourceId}:route-points`,
            `${sourceId}:aircraft-outline`,
            `${sourceId}:aircraft`,
          ]
          const source = map?.getSource?.(sourceId) || null
          const aircraftLayer = map?.getLayer?.(
            `${sourceId}:aircraft`,
          ) || null
          let sourceData = null
          try {
            sourceData = typeof source?.getData === 'function'
              ? await source.getData()
              : source?.serialize?.()?.data || null
          } catch {
            sourceData = null
          }
          const sourceFeatures = Array.isArray(sourceData?.features)
            ? sourceData.features
            : []
          const mapStyle = map?.getStyle?.() || null
          const styleLayerIds = Array.isArray(mapStyle?.layers)
            ? mapStyle.layers.map(layer => String(layer?.id || ''))
            : []
          const flightLayerOrder = styleLayerIds.filter(
            id => layerIds.includes(id),
          )
          const topLayerOrder = styleLayerIds.slice(-layerIds.length)
          let renderedFeatures = []
          try {
            renderedFeatures = map?.queryRenderedFeatures?.({
              layers: layerIds,
            }) || []
          } catch {
            renderedFeatures = []
          }
          const renderedKinds = Array.from(new Set(
            renderedFeatures.map(
              feature => feature?.properties?.kgFlightOverlayKind || '',
            ).filter(Boolean),
          )).sort()
          const mapCanvas = visibleMapCanvases[0] || null
          const mapWidth = Number(mapCanvas?.clientWidth || 0)
          const mapHeight = Number(mapCanvas?.clientHeight || 0)
          const projectedRoute = Array.isArray(overlay?.route)
            ? overlay.route.map(point => {
                const projected = map?.project?.(point.coordinate)
                return {
                  id: point.id,
                  x: Number(projected?.x),
                  y: Number(projected?.y),
                }
              })
            : []
          const aircraftProjected = overlay?.aircraft?.coordinate
            ? map?.project?.(overlay.aircraft.coordinate)
            : null
          const finiteRoute = projectedRoute.filter(point => (
            Number.isFinite(point.x) && Number.isFinite(point.y)
          ))
          const routeScreenSpan = finiteRoute.length > 1
            ? {
                x: Math.max(...finiteRoute.map(point => point.x))
                  - Math.min(...finiteRoute.map(point => point.x)),
                y: Math.max(...finiteRoute.map(point => point.y))
                  - Math.min(...finiteRoute.map(point => point.y)),
              }
            : { x: 0, y: 0 }
          const routeInViewport = finiteRoute.length === overlay?.route?.length
            && finiteRoute.every(point => (
              point.x >= 0
              && point.y >= 0
              && point.x <= mapWidth
              && point.y <= mapHeight
            ))
          const aircraftInViewport = Number.isFinite(aircraftProjected?.x)
            && Number.isFinite(aircraftProjected?.y)
            && aircraftProjected.x >= 0
            && aircraftProjected.y >= 0
            && aircraftProjected.x <= mapWidth
            && aircraftProjected.y <= mapHeight
          let mapPointerHit = null
          if (mapCanvas) {
            const rect = mapCanvas.getBoundingClientRect()
            const candidates = [
              [0.32, 0.48],
              [0.2, 0.62],
              [0.45, 0.7],
            ]
            for (const [ratioX, ratioY] of candidates) {
              const x = rect.left + rect.width * ratioX
              const y = rect.top + rect.height * ratioY
              const hit = document.elementFromPoint(x, y)
              if (hit === mapCanvas) {
                mapPointerHit = { x, y }
                break
              }
            }
          }
          let rendererPointerRoot = rendererCanvas?.parentElement || null
          while (
            rendererPointerRoot
            && !String(rendererPointerRoot.className || '').includes('z-[10]')
          ) {
            rendererPointerRoot = rendererPointerRoot.parentElement
          }
          const styleFingerprint = JSON.stringify({
            glyphs: mapStyle?.glyphs || '',
            sources: mapStyle?.sources || {},
            sprite: mapStyle?.sprite || '',
          })
          const contextAttributes = rendererCanvas
            ?.getContext('webgl2')
            ?.getContextAttributes?.()
            || rendererCanvas
              ?.getContext('webgl')
              ?.getContextAttributes?.()
            || null
          return {
            hostActive: Boolean(host),
            hostRevision: host?.getAttribute(
              'data-kg-flight-geospatial-revision',
            ) || '',
            geospatialEnabled: gympgrphState.geospatialModeEnabled === true,
            viewMode: gympgrphState.geospatialViewMode,
            renderMode: graphState.canvasRenderMode,
            canvas3dMode: graphState.canvas3dMode,
            floatingPanelOpen: graphState.floatingPanelOpen,
            floatingPanelView: graphState.floatingPanelView,
            geoXrSurfaceActive: Boolean(document.querySelector(
              '[data-kg-geo-xr-surface="active"]',
            )),
            hudVisible: isVisible(hud),
            styleUrl: localStorage.getItem(
              gympgrph.LS_KEYS.geospatialStyleUrl,
            ) || '',
            styleFingerprint,
            projection: map?.getProjection?.()?.type || 'mercator',
            center: map?.getCenter?.()?.toArray?.() || null,
            zoom: map?.getZoom?.() ?? null,
            mapLibreCanvasCount: mapCanvases.length,
            visibleMapLibreCanvasCount: visibleMapCanvases.length,
            flightSourceFeatures: sourceFeatures.length,
            flightLayersReady: layerIds.every(id => Boolean(map?.getLayer?.(id))),
            flightLayerOrder,
            flightLayersTopmost:
              JSON.stringify(topLayerOrder) === JSON.stringify(layerIds),
            aircraftLayerType: aircraftLayer?.type || '',
            renderedKinds,
            renderedFeatureCount: renderedFeatures.length,
            routeInViewport,
            routeScreenSpan,
            aircraftInViewport,
            aircraftScreenPoint: aircraftProjected
              ? { x: aircraftProjected.x, y: aircraftProjected.y }
              : null,
            mapPointerHit,
            rendererCanvasCount: rendererCanvases.length,
            canvasStable: Boolean(rendererCanvas)
              && rendererCanvas === window.__kgFlightSimCanvas,
            rendererAlpha: contextAttributes?.alpha === true,
            terrainCount: nodes.filter(
              node => String(node?.name || '').startsWith(
                'kg_xr_native_terrain_',
              ),
            ).length,
            nativeVisualCount: nodes.filter(node => {
              const name = String(node?.name || '')
              return name.startsWith('kg_xr_native_controller_')
                || name.startsWith('kg_xr_native_terrain_')
                || name.startsWith('kg_xr_stage_preset_')
                || name.startsWith('kg_xr_playground_')
            }).length,
            flightR3fVisualCount: nodes.filter(node => {
              const name = String(node?.name || '')
              return name.startsWith('kg_flight_sim_')
                || name.startsWith('kg_flight-sim_')
            }).length,
            visualProjection:
              rendererCanvas?.dataset.kgFlightSimVisualProjection || '',
            rendererPointerTransparent:
              Boolean(rendererPointerRoot)
              && getComputedStyle(rendererPointerRoot).pointerEvents === 'none',
            exclusivePlainGeoOverlayCount: document.querySelectorAll(
              '[data-kg-flight-sim-geo-overlay="1"]',
            ).length,
            overlayRevision: overlay?.revision || '',
            aircraftCoordinate: overlay?.aircraft?.coordinate || null,
            flightActive: flightSnapshot.active,
            flightPhase: flightSnapshot.phase,
            flightRuntimeError: flightSnapshot.runtimeError || '',
            flightTick: flightSnapshot.tick,
            cameraPreference: camera.readFlightSimCameraSnapshot().view,
            cameraSource: cameraSource.readXrNativeControllerCamera().mode,
          }
        }
        """
    )


def _wait_for_view(
    page: Page,
    *,
    expected_provider_host: str,
    expected_view: str,
    expected_projection: str,
    expected_style_url: str,
) -> dict[str, Any]:
    deadline = time.monotonic() + 30
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        last = _read_view(page)
        if (
            last.get("viewMode") == expected_view
            and last.get("styleUrl") == expected_style_url
            and expected_provider_host in str(
                last.get("styleFingerprint") or ""
            )
            and last.get("projection") == expected_projection
            and last.get("visibleMapLibreCanvasCount", 0) >= 1
            and last.get("flightLayersReady") is True
            and last.get("flightLayersTopmost") is True
            and last.get("aircraftLayerType") == "symbol"
            and (last.get("flightSourceFeatures") or 0) >= 6
            and set(last.get("renderedKinds") or [])
            == {"aircraft", "route", "route-point"}
            and last.get("routeInViewport") is True
            and max(
                float((last.get("routeScreenSpan") or {}).get("x") or 0),
                float((last.get("routeScreenSpan") or {}).get("y") or 0),
            ) >= 80
            and last.get("aircraftInViewport") is True
            and bool(last.get("mapPointerHit"))
        ):
            return last
        page.wait_for_timeout(100)
    raise AssertionError(
        "timed out waiting for native MapLibre Geo+XR view "
        f"{expected_view}/{expected_projection}/{expected_style_url}: {last}"
    )


def _wait_for_surface_contract(
    page: Page, *, label: str, expected: dict[str, Any],
    require_flight_visuals: bool = False, require_revision_sync: bool = False,
) -> dict[str, Any]:
    deadline = time.monotonic() + 30
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        last = _read_view(page)
        if (
            all(last.get(key) == value for key, value in expected.items())
            and (not require_flight_visuals
                 or last.get("flightR3fVisualCount", 0) > 0)
            and (not require_revision_sync or bool(last.get("hostRevision"))
                 and last.get("hostRevision") == last.get("overlayRevision"))
        ):
            return last
        page.wait_for_timeout(100)
    raise AssertionError(f"timed out waiting for {label}: {last}")


def prepare_canvas_view_standalone_flight_xr(page: Page) -> tuple[dict[str, Any], GeoXrViewCase, dict[str, Any]]:
    baseline = _read_view(page)
    source_case = next(
        (case for case in GEO_XR_VIEW_CASES if case[0] == baseline["viewMode"]
         and case[3] == baseline["styleUrl"]),
        None,
    )
    if source_case is None:
        raise AssertionError(f"unsupported source Geo view/style: {baseline}")
    page.evaluate(
        """
        async () => {
          const geo = await window.__kgFlightSimBrowserProof.importModule('geospatialModeBridge')
          await geo.setGeospatialModeEnabled(false)
        }
        """
    )
    standalone = _wait_for_surface_contract(
        page, label="standalone Flight XR surface",
        expected={
            "hostActive": False, "geospatialEnabled": False,
            "renderMode": "3d", "canvas3dMode": "xr", "hudVisible": True,
            "geoXrSurfaceActive": False, "rendererCanvasCount": 1,
            "canvasStable": True, "rendererAlpha": True,
            "visualProjection": "r3f", "rendererPointerTransparent": False,
            "exclusivePlainGeoOverlayCount": 0, "flightActive": True,
            "flightPhase": "ready", "flightRuntimeError": "",
        }, require_flight_visuals=True,
    )
    return baseline, source_case, standalone


def wait_for_canvas_view_geo_xr_handoff(page: Page, source_case: GeoXrViewCase) -> dict[str, Any]:
    _wait_for_view(
        page, expected_provider_host=source_case[4],
        expected_view=source_case[0], expected_projection=source_case[1],
        expected_style_url=source_case[3],
    )
    return _wait_for_surface_contract(
        page, label="real-menu Geo+XR Flight ownership handoff",
        expected={
            "hostActive": True, "geospatialEnabled": True,
            "renderMode": "3d", "canvas3dMode": "xr", "hudVisible": True,
            "geoXrSurfaceActive": True, "rendererCanvasCount": 1,
            "canvasStable": True, "rendererAlpha": True,
            "flightR3fVisualCount": 0, "visualProjection": "maplibre",
            "rendererPointerTransparent": True, "flightActive": True,
            "exclusivePlainGeoOverlayCount": 0, "flightRuntimeError": "",
        }, require_revision_sync=True,
    )


def verify_geo_xr_four_view_presentation(page: Page) -> dict[str, Any]:
    baseline_camera = page.evaluate(
        """
        async () => {
          const camera = await window.__kgFlightSimBrowserProof.importModule(
            'flightSimCameraRuntime',
          )
          const cameraSource = await window.__kgFlightSimBrowserProof.importModule(
            'xrNativeControllerCameraRuntime',
          )
          const graph = await window.__kgFlightSimBrowserProof.importModule(
            'graphStore',
          )
          const gympgrph = await window.__kgFlightSimBrowserProof.importModule(
            'gympgrphStore',
          )
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
    try:
        for (
            view_mode,
            projection,
            button_label,
            style_url,
            provider_host,
        ) in GEO_XR_VIEW_CASES:
            _select_view(page, button_label)
            observed = _wait_for_view(
                page,
                expected_provider_host=provider_host,
                expected_view=view_mode,
                expected_projection=projection,
                expected_style_url=style_url,
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
                if (
                    after_movement.get("flightTick", 0)
                    > before_movement.get("flightTick", 0)
                    and after_movement.get("overlayRevision")
                    != before_movement.get("overlayRevision")
                    and after_movement.get("aircraftCoordinate")
                    != before_movement.get("aircraftCoordinate")
                    and after_movement.get("aircraftInViewport") is True
                ):
                    break
                page.wait_for_timeout(100)
            else:
                raise AssertionError(
                    "MapLibre Flight aircraft did not move with gameplay: "
                    f"before={before_movement} after={after_movement}"
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
        _select_view(page, prior_case[2])
        restored_view = _wait_for_view(
            page,
            expected_provider_host=prior_case[4],
            expected_view=prior_case[0],
            expected_projection=prior_case[1],
            expected_style_url=prior_case[3],
        )
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
        "sourceView": baseline_camera["geospatialViewMode"],
        "sourceStyleUrl": baseline_camera["geospatialStyleUrl"],
        "restoredView": restored_view,
        "liveMovement": {
            "before": before_movement,
            "after": after_movement,
        },
        "views": results,
    }
