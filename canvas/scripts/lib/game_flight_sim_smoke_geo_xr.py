from __future__ import annotations

import math
import time
from typing import Any

from playwright.sync_api import Page
from lib.game_flight_sim_smoke_geo_view_cases import (
    GEO_XR_VIEW_CASES,
    GeoXrViewCase,
    select_geo_xr_view,
    wait_for_surface_contract,
)
from lib.game_flight_sim_smoke_geo_xr_layout import (
    read_geo_xr_layout_occlusion,
)


def _has_authored_environment_surface(
    last: dict[str, Any],
    *,
    surface_id: str,
    base_height_meters: float,
    height_meters: float,
    width_meters: float,
    depth_meters: float,
    require_viewport_bounds: bool = False,
) -> bool:
    surfaces = last.get("environmentSurfaceMeters") or []
    surface = next(
        (
            candidate
            for candidate in surfaces
            if isinstance(candidate, dict)
            and candidate.get("id") == surface_id
        ),
        None,
    )
    if not isinstance(surface, dict):
        return False

    def close(key: str, expected: float, tolerance: float = 0.12) -> bool:
        value = surface.get(key)
        return isinstance(value, (int, float)) and math.isclose(
            float(value), expected, abs_tol=tolerance,
        )

    return (
        close("baseHeightMeters", base_height_meters, tolerance=0.01)
        and close("heightMeters", height_meters, tolerance=0.01)
        and close("widthMeters", width_meters)
        and close("depthMeters", depth_meters)
        and (
            not require_viewport_bounds
            or surface.get("viewportBounded") is True
        )
    )


def _read_view(page: Page) -> dict[str, Any]:
    view = page.evaluate(
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
          const allMapCanvases = Array.from(
            document.querySelectorAll('canvas.maplibregl-canvas'),
          )
          const mapCanvases = host
            ? Array.from(host.querySelectorAll('canvas.maplibregl-canvas'))
            : allMapCanvases
          const visibleMapCanvases = mapCanvases.filter(isVisible)
          const map = gympgrph.readActiveMapLibreMap?.() || null
          const overlay = gympgrph.readFlightGeoOverlay?.() || null
          const sourceId = gympgrph.FLIGHT_GEO_OVERLAY_SOURCE_ID
            || 'kg-flight-sim:geo-overlay'
          const environmentSourceId = gympgrph.FLIGHT_GEO_ENVIRONMENT_SOURCE_ID
            || 'kg-flight-geo-environment'
          const environmentLayerIds = gympgrph.FLIGHT_GEO_ENVIRONMENT_LAYER_IDS
          const aircraftImageIds = gympgrph.FLIGHT_GEO_AIRCRAFT_IMAGE_IDS
          const environmentSource = map?.getSource?.(environmentSourceId) || null
          const layerIds = [
            `${sourceId}:route`,
            `${sourceId}:objective-guide`,
            `${sourceId}:route-points`,
            `${sourceId}:aircraft-outline`,
            `${sourceId}:aircraft`,
          ]
          const source = map?.getSource?.(sourceId) || null
          const aircraftLayer = map?.getLayer?.(
            `${sourceId}:aircraft`,
          ) || null
          const aircraftImage = map?.getImage?.(aircraftImageIds?.day) || null
          const readSourceData = async source => {
            try {
              return typeof source?.getData === 'function'
                ? await source.getData()
                : source?.serialize?.()?.data || null
            } catch { return null }
          }
          const sourceData = await readSourceData(source)
          const environmentData = await readSourceData(environmentSource)
          const sourceFeatures = Array.isArray(sourceData?.features)
            ? sourceData.features
            : []
          const environmentFeatures = Array.isArray(environmentData?.features)
            ? environmentData.features
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
          const environment3d = String(gympgrphState.geospatialViewMode)
            .startsWith('3d')
          const activeEnvironmentLayer = environment3d
            ? environmentLayerIds?.extrusion3d : environmentLayerIds?.fill2d
          let renderedEnvironment = []
          try {
            renderedEnvironment = map?.queryRenderedFeatures?.({
              layers: [activeEnvironmentLayer],
            }) || []
          } catch { renderedEnvironment = [] }
          const renderedKinds = Array.from(new Set(
            renderedFeatures.map(
              feature => feature?.properties?.kgFlightOverlayKind || '',
            ).filter(Boolean),
          )).sort()
          const mapCanvas = visibleMapCanvases[0] || null
          const mapWidth = Number(mapCanvas?.clientWidth || 0)
          const mapHeight = Number(mapCanvas?.clientHeight || 0)
          const environmentSurfaceMeters = environmentFeatures.map(feature => {
            const ring = Array.isArray(feature?.geometry?.coordinates?.[0])
              ? feature.geometry.coordinates[0]
              : []
            const coordinates = ring.filter(coordinate => (
              Array.isArray(coordinate)
              && Number.isFinite(Number(coordinate[0]))
              && Number.isFinite(Number(coordinate[1]))
            )).map(coordinate => [
              Number(coordinate[0]),
              Number(coordinate[1]),
            ])
            const latitude = coordinates.length > 0
              ? coordinates.reduce((sum, coordinate) => sum + coordinate[1], 0)
                / coordinates.length
              : NaN
            const metersPerLongitudeDegree = 111_320
              * Math.cos(latitude * Math.PI / 180)
            const longitudes = coordinates.map(coordinate => coordinate[0])
            const latitudes = coordinates.map(coordinate => coordinate[1])
            const projected = coordinates.map(coordinate => map?.project?.(coordinate))
            const viewportBounded = coordinates.length >= 4
              && mapWidth > 0
              && mapHeight > 0
              && projected.length === coordinates.length
              && projected.every(point => (
                Number.isFinite(point?.x)
                && Number.isFinite(point?.y)
                && point.x >= 0
                && point.y >= 0
                && point.x <= mapWidth
                && point.y <= mapHeight
              ))
            return {
              baseHeightMeters: Number(feature?.properties?.kgBaseHeightMeters),
              heightMeters: Number(feature?.properties?.kgHeightMeters),
              id: String(feature?.properties?.kgSurfaceId || ''),
              kind: String(feature?.properties?.kgSurfaceKind || ''),
              depthMeters: latitudes.length > 0
                ? (Math.max(...latitudes) - Math.min(...latitudes)) * 111_320
                : NaN,
              widthMeters: longitudes.length > 0
                ? (Math.max(...longitudes) - Math.min(...longitudes))
                  * metersPerLongitudeDegree
                : NaN,
              viewportBounded,
            }
          })
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
          const cityPanel = document.querySelector(
            '[data-kg-city-sim-floating-panel="1"]',
          )
          const cityStage = document.querySelector(
            '[data-kg-city-sim-stage="active"]',
          )
          return {
            hostActive: Boolean(host),
            activeMapPresent: Boolean(map),
            hostRevision: host?.getAttribute(
              'data-kg-flight-geospatial-revision',
            ) || '',
            geospatialEnabled: gympgrphState.geospatialModeEnabled === true,
            geospatialPreferenceEnabled: ['1', 'true'].includes(
              String(localStorage.getItem(
                gympgrph.LS_KEYS.geospatialOverlayEnabled,
              ) || '').toLowerCase(),
            ),
            viewMode: gympgrphState.geospatialViewMode,
            renderMode: graphState.canvasRenderMode,
            canvas3dMode: graphState.canvas3dMode,
            floatingPanelOpen: graphState.floatingPanelOpen,
            floatingPanelView: graphState.floatingPanelView,
            geoXrSurfaceActive: Boolean(document.querySelector(
              '[data-kg-geo-xr-surface="active"]',
            )),
            geoXrLayerCount: document.querySelectorAll(
              '[data-kg-geo-xr-layer]',
            ).length,
            hudVisible: isVisible(hud),
            flightHudCount: document.querySelectorAll(
              '[data-kg-flight-sim-hud="1"]',
            ).length,
            cityActive: cityPanel?.getAttribute('data-kg-city-sim-active')
              === '1',
            cityPanelVisible: isVisible(cityPanel),
            cityPhase: cityPanel?.getAttribute('data-kg-city-sim-phase') || '',
            cityStageActive: Boolean(cityStage),
            styleUrl: localStorage.getItem(
              gympgrph.LS_KEYS.geospatialStyleUrl,
            ) || '',
            styleFingerprint,
            projection: map?.getProjection?.()?.type || 'mercator',
            center: map?.getCenter?.()?.toArray?.() || null,
            zoom: map?.getZoom?.() ?? null,
            pitch: map?.getPitch?.() ?? null,
            mapLibreCanvasCount: allMapCanvases.length,
            visibleMapLibreCanvasCount: allMapCanvases.filter(isVisible).length,
            flightSourceFeatures: sourceFeatures.length,
            flightSourcePresent: Boolean(source),
            objectiveGuideFeatureCount: sourceFeatures.filter(
              feature => feature?.properties?.kgFlightOverlayKind
                === 'objective-guide',
            ).length,
            flightLayersReady: layerIds.every(id => Boolean(map?.getLayer?.(id))),
            flightLayerOrder,
            flightLayersTopmost:
              JSON.stringify(topLayerOrder) === JSON.stringify(layerIds),
            aircraftLayerType: aircraftLayer?.type || '',
            aircraftGeometryType: sourceFeatures.find(
              feature => feature?.properties?.kgFlightOverlayKind === 'aircraft',
            )?.geometry?.type || '',
            aircraftImagesReady: Object.values(aircraftImageIds || {})
              .every(id => map?.hasImage?.(id)),
            aircraftImagePixelWidth:
              aircraftImage?.data?.width || aircraftImage?.width || 0,
            environmentId: overlay?.environment?.id || '',
            environmentPresentationBounds:
              overlay?.environment?.presentationBounds || null,
            environmentLayersReady: Object.values(environmentLayerIds || {})
              .every(id => Boolean(map?.getLayer?.(id))),
            environmentSourceFeatures:
              environmentFeatures.length,
            environmentSourcePresent: Boolean(environmentSource),
            environmentSubjectIds: environmentFeatures
              .filter(feature => feature?.properties?.kgSurfaceKind === 'subject')
              .map(feature => feature?.properties?.kgSurfaceId || '').sort(),
            environmentSurfaceMeters,
            renderedEnvironmentKinds: Array.from(new Set(
              renderedEnvironment.map(
                feature => feature?.properties?.kgSurfaceKind || '',
              ).filter(Boolean),
            )).sort(),
            renderedEnvironmentSubjectIds: renderedEnvironment
              .filter(feature => feature?.properties?.kgSurfaceKind === 'subject')
              .map(feature => feature?.properties?.kgSurfaceId || '').sort(),
            renderedKinds,
            renderedFeatureCount: renderedFeatures.length,
            renderedEnvironmentFeatureCount: renderedEnvironment.length,
            routeInViewport,
            routeScreenSpan,
            aircraftInViewport,
            aircraftScreenPoint: aircraftProjected
              ? { x: aircraftProjected.x, y: aircraftProjected.y }
              : null,
            rendererCanvasCount: rendererCanvases.length,
            threeCanvasOwnerCount: document.querySelectorAll(
              '[data-kg-three-canvas-owner="1"]',
            ).length,
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
    layout_occlusion = read_geo_xr_layout_occlusion(page)
    view["layoutOcclusion"] = layout_occlusion
    view["mapPointerHit"] = layout_occlusion.get("mapPointerHit")
    return view


def _unmet_view_requirements(
    last: dict[str, Any],
    *,
    expected_provider_host: str,
    expected_view: str,
    expected_projection: str,
    expected_style_url: str,
    require_visual_layout: bool,
) -> list[str]:
    layout = last.get("layoutOcclusion") or {}
    pitch = float(last.get("pitch") or 0)
    map_pointer_hit = (
        layout.get("mapPointerHit")
        if require_visual_layout
        else last.get("mapPointerHit")
    )
    layout_checks = {
        "layout.viewport": layout.get("viewport") == {
            "width": 1100,
            "height": 962,
        },
        "layout.sourceFilesVisible": layout.get("sourceFilesVisible") is True,
        "layout.workspacePaneVisible": layout.get("workspacePaneVisible") is True,
        "layout.floatingPanelVisible": layout.get("floatingPanelVisible") is True,
        "layout.floatingPanelView": layout.get("floatingPanelView")
        == "flightSim",
        "layout.routeUnoccluded": layout.get("routeUnoccluded") is True,
        "layout.aircraftUnoccluded": layout.get("aircraftUnoccluded") is True,
        "layout.environmentUnoccludedKinds": {
            "stage-footprint",
            "structure",
            "subject",
        }.issubset(set(layout.get("environmentUnoccludedKinds") or [])),
        "layout.environmentExtrusionVisible": layout.get(
            "environmentExtrusionVisible",
        )
        is True,
        "layout.cameraPadding": bool(layout.get("cameraPadding")),
        "layout.geographyBoundaryStatus": layout.get(
            "geographyBoundaryStatus",
        )
        == "not-rendered",
    }
    checks = {
        "flightActive": last.get("flightActive") is True,
        "hudVisible": last.get("hudVisible") is True,
        "geospatialEnabled": last.get("geospatialEnabled") is True,
        "geospatialPreferenceEnabled": (
            last.get("geospatialPreferenceEnabled") is True
        ),
        "viewMode": last.get("viewMode") == expected_view,
        "styleUrl": last.get("styleUrl") == expected_style_url,
        "styleFingerprint": expected_provider_host
        in str(last.get("styleFingerprint") or ""),
        "projection": last.get("projection") == expected_projection,
        "mapLibreCanvasCount": last.get("mapLibreCanvasCount", 0) == 1,
        "visibleMapLibreCanvasCount": last.get("visibleMapLibreCanvasCount", 0)
        == 1,
        "threeCanvasOwnerCount": last.get("threeCanvasOwnerCount", 0) == 1,
        "flightLayersReady": last.get("flightLayersReady") is True,
        "flightLayersTopmost": last.get("flightLayersTopmost") is True,
        "aircraftLayerType": last.get("aircraftLayerType") == "symbol",
        "aircraftGeometryType": last.get("aircraftGeometryType") == "Polygon",
        "aircraftImagesReady": last.get("aircraftImagesReady") is True,
        "aircraftImagePixelWidth": (last.get("aircraftImagePixelWidth") or 0)
        >= 40,
        "environmentId": last.get("environmentId") == "singapore",
        "environmentPresentationBounds": last.get("environmentPresentationBounds")
        == [[103.605, 1.158], [104.09, 1.48]],
        "environmentLayersReady": last.get("environmentLayersReady") is True,
        "environmentSourceFeatures": (last.get("environmentSourceFeatures") or 0)
        >= 10,
        "environment.stageFootprintAuthoredMeters": _has_authored_environment_surface(
            last,
            surface_id="singapore:footprint",
            base_height_meters=0,
            height_meters=0.08,
            width_meters=32,
            depth_meters=24,
            require_viewport_bounds=True,
        ),
        "environment.skylineAuthoredMeters": _has_authored_environment_surface(
            last,
            surface_id="skyline-center",
            base_height_meters=0,
            height_meters=12,
            width_meters=4.4,
            depth_meters=4.4,
        ),
        "environment.helicopterAuthoredMeters": _has_authored_environment_surface(
            last,
            surface_id="helicopter",
            base_height_meters=2,
            height_meters=5.4,
            width_meters=7.4,
            depth_meters=9,
        ),
        "renderedEnvironmentKinds": {
            "stage-footprint",
            "structure",
            "subject",
        }.issubset(set(last.get("renderedEnvironmentKinds") or [])),
        "renderedEnvironmentSubjectIds": any(
            "vehicle-" in str(subject_id)
            for subject_id in last.get("renderedEnvironmentSubjectIds") or []
        ),
        "flightSourceFeatures": (last.get("flightSourceFeatures") or 0) >= 7,
        "objectiveGuideFeatureCount": last.get("objectiveGuideFeatureCount") == 1,
        "renderedKinds": set(last.get("renderedKinds") or [])
        == {"aircraft", "objective-guide", "route", "route-point"},
        "routeInViewport": last.get("routeInViewport") is True,
        "routeScreenSpan": max(
            float((last.get("routeScreenSpan") or {}).get("x") or 0),
            float((last.get("routeScreenSpan") or {}).get("y") or 0),
        )
        >= 80,
        "aircraftInViewport": last.get("aircraftInViewport") is True,
        "pitch": pitch >= 22 if expected_view.startswith("3d") else abs(pitch) < 0.01,
        "mapPointerHit": bool(map_pointer_hit),
    }
    if require_visual_layout:
        checks.update(layout_checks)
    return [name for name, passed in checks.items() if not passed]


def _wait_for_view(
    page: Page,
    *,
    expected_provider_host: str,
    expected_view: str,
    expected_projection: str,
    expected_style_url: str,
    require_visual_layout: bool = False,
) -> dict[str, Any]:
    deadline = time.monotonic() + 30
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        last = _read_view(page)
        unmet = _unmet_view_requirements(
            last,
            expected_provider_host=expected_provider_host,
            expected_view=expected_view,
            expected_projection=expected_projection,
            expected_style_url=expected_style_url,
            require_visual_layout=require_visual_layout,
        )
        if not unmet:
            return last
        page.wait_for_timeout(100)
    unmet = _unmet_view_requirements(
        last,
        expected_provider_host=expected_provider_host,
        expected_view=expected_view,
        expected_projection=expected_projection,
        expected_style_url=expected_style_url,
        require_visual_layout=require_visual_layout,
    )
    raise AssertionError(
        "timed out waiting for native MapLibre Geo+XR view "
        f"{expected_view}/{expected_projection}/{expected_style_url}; "
        f"unmet={unmet}: {last}"
    )

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
    standalone = wait_for_surface_contract(
        page, label="standalone Flight XR surface", read_view=_read_view,
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
    return wait_for_surface_contract(
        page, label="real-menu Geo+XR Flight ownership handoff",
        read_view=_read_view,
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
