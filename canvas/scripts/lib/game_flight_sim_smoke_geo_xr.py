from __future__ import annotations
from typing import Any
from playwright.sync_api import Page
from lib.game_flight_sim_smoke_city_semantic_media import (
    read_city_semantic_media_contract,
)
from lib.game_flight_sim_smoke_geo_view_cases import (
    GEO_XR_VIEW_CASES,
    GeoXrViewCase,
    select_geo_xr_view,
    wait_for_surface_contract,
)
from lib.game_flight_sim_smoke_geo_xr_layout import (
    read_geo_xr_layout_occlusion,
)
from lib.game_flight_sim_smoke_geo_xr_requirements import (
    unmet_view_requirements,
    wait_for_view,
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
          const motion = await window.__kgFlightSimBrowserProof.importModule(
            'xrMotionReferenceRuntime',
          )
          const sceneLibrary = await window.__kgFlightSimBrowserProof.importModule(
            'xrSceneLibrary',
          )
          const graphState = graph.useGraphStore.getState()
          const gympgrphState = gympgrph.useGympgrphStore.getState()
          const flightSnapshot = flight.readFlightSimSnapshot()
          const motionRuntime = motion.readXrMotionReferenceRuntime()
          const blob = await graphState.captureThreeGltfSnapshot()
          const gltf = blob ? JSON.parse(await blob.text()) : null
          const nodes = Array.isArray(gltf?.nodes) ? gltf.nodes : []
          const flightR3fVisualNames = nodes
            .map(node => String(node?.name || ''))
            .filter(name => (
              name.startsWith('kg_flight_sim_')
              || name.startsWith('kg_flight-sim_')
            ))
            .sort()
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
          const cityOverlay = gympgrph.readCityGeoOverlay?.() || null
          const sourceId = gympgrph.FLIGHT_GEO_OVERLAY_SOURCE_ID
            || 'kg-flight-sim:geo-overlay'
          const citySourceId = gympgrph.CITY_GEO_OVERLAY_SOURCE_ID
            || 'kg-city-sim:geo-overlay'
          const cityLayerIds = Object.values(
            gympgrph.CITY_GEO_OVERLAY_LAYER_IDS || {},
          )
          const environmentSourceId = gympgrph.FLIGHT_GEO_ENVIRONMENT_SOURCE_ID
            || 'kg-flight-geo-environment'
          const environmentLayerIds = gympgrph.FLIGHT_GEO_ENVIRONMENT_LAYER_IDS
          const aircraftImageIds = gympgrph.FLIGHT_GEO_AIRCRAFT_IMAGE_IDS
          const environmentSource = map?.getSource?.(environmentSourceId) || null
          const citySource = map?.getSource?.(citySourceId) || null
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
          const citySourceData = await readSourceData(citySource)
          const sourceFeatures = Array.isArray(sourceData?.features)
            ? sourceData.features
            : []
          const environmentFeatures = Array.isArray(environmentData?.features)
            ? environmentData.features
            : []
          const citySourceFeatures = Array.isArray(citySourceData?.features)
            ? citySourceData.features
            : []
          const mapStyle = map?.getStyle?.() || null
          const styleLayerIds = Array.isArray(mapStyle?.layers)
            ? mapStyle.layers.map(layer => String(layer?.id || ''))
            : []
          const flightLayerOrder = styleLayerIds.filter(
            id => layerIds.includes(id),
          )
          const topLayerOrder = styleLayerIds.slice(-layerIds.length)
          const cityGeoXrLayerOrder =
            gympgrph.readCityGeoXrLayerOrder?.(styleLayerIds) || []
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
          const sourceKinds = Array.from(new Set(
            sourceFeatures.map(
              feature => feature?.properties?.kgFlightOverlayKind || '',
            ).filter(Boolean),
          )).sort()
          const mapCanvas = visibleMapCanvases[0] || null
          const mapWidth = Number(mapCanvas?.clientWidth || 0)
          const mapHeight = Number(mapCanvas?.clientHeight || 0)
          const authoredEnvironmentSubjects = Array.isArray(
            motionRuntime?.plan?.subjects,
          ) ? motionRuntime.plan.subjects.map(subject => {
            const asset = sceneLibrary.resolveXrSceneLibraryAsset(subject.assetId)
            const scale = Number.isFinite(subject.scale) && subject.scale > 0
              ? subject.scale
              : 1
            const baseHeightMeters = Math.max(0, Number(subject.position?.[1]) || 0)
            return {
              baseHeightMeters,
              depthMeters: asset.dimensionsMeters[2] * scale,
              heightMeters: baseHeightMeters + asset.dimensionsMeters[1] * scale,
              id: subject.id,
              widthMeters: asset.dimensionsMeters[0] * scale,
            }
          }) : []
          const measureEdgeMeters = (from, to) => {
            if (!Array.isArray(from) || !Array.isArray(to)) return null
            const longitudeA = Number(from[0])
            const latitudeA = Number(from[1])
            const longitudeB = Number(to[0])
            const latitudeB = Number(to[1])
            if (![longitudeA, latitudeA, longitudeB, latitudeB].every(Number.isFinite)) {
              return null
            }
            const latitude = (latitudeA + latitudeB) / 2
            return Math.hypot(
              (longitudeB - longitudeA) * 111_320 * Math.cos(latitude * Math.PI / 180),
              (latitudeB - latitudeA) * 111_320,
            )
          }
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
              : null
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
              edgeDepthMeters: measureEdgeMeters(coordinates[1], coordinates[2]),
              edgeWidthMeters: measureEdgeMeters(coordinates[0], coordinates[1]),
              heightMeters: Number(feature?.properties?.kgHeightMeters),
              id: String(feature?.properties?.kgSurfaceId || ''),
              kind: String(feature?.properties?.kgSurfaceKind || ''),
              label: String(feature?.properties?.kgSurfaceLabel || ''),
              poiId: String(feature?.properties?.kgPoiId || ''),
              depthMeters: latitudes.length > 0
                ? (Math.max(...latitudes) - Math.min(...latitudes)) * 111_320
                : null,
              widthMeters: longitudes.length > 0
                ? (Math.max(...longitudes) - Math.min(...longitudes))
                  * metersPerLongitudeDegree
                : null,
              viewportBounded,
            }
          })
          const close = (actual, expected, tolerance = 0.02) => (
            Number.isFinite(actual)
            && Number.isFinite(expected)
            && Math.abs(actual - expected) <= tolerance
          )
          const environmentSurfaces = Array.isArray(overlay?.environment?.surfaces)
            ? overlay.environment.surfaces
            : []
          const environmentSourceExactlyMatchesOverlay = Boolean(
            !overlay?.environment
              ? environmentFeatures.length === 0
              : environmentSurfaces.length === environmentFeatures.length
                && environmentSurfaces.every((surface, index) => {
              const feature = environmentFeatures[index]
              const ring = Array.isArray(feature?.geometry?.coordinates?.[0])
                ? feature.geometry.coordinates[0]
                : []
              return (
                feature?.id === `${overlay.environment.id}:${surface.id}`
                && feature?.properties?.kgBaseHeightMeters === surface.baseHeightMeters
                && feature?.properties?.kgHeightMeters === surface.heightMeters
                && feature?.properties?.kgSurfaceId === surface.id
                && feature?.properties?.kgSurfaceKind === surface.kind
                && feature?.properties?.kgSurfaceLabel === surface.label
                && feature?.properties?.kgPoiId === (surface.poiId || '')
                && Array.isArray(ring)
                && ring.length === surface.ring.length
                && ring.every((coordinate, coordinateIndex) => (
                  Array.isArray(coordinate)
                  && coordinate[0] === surface.ring[coordinateIndex]?.[0]
                  && coordinate[1] === surface.ring[coordinateIndex]?.[1]
                ))
              )
                })
          )
          const cityParcelEdgeMeters = citySourceFeatures.map(feature => {
            const ring = feature?.geometry?.coordinates?.[0]
            return {
              depthMeters: measureEdgeMeters(ring?.[1], ring?.[2]),
              id: String(feature?.properties?.parcelId || ''),
              widthMeters: measureEdgeMeters(ring?.[0], ring?.[1]),
            }
          })
          const cityExpectedParcelCount =
            Number(cityOverlay?.rows) * Number(cityOverlay?.columns)
          const cityExpectedParcelWidthMeters =
            Number(cityOverlay?.profile?.parcelWidthMeters)
          const cityExpectedParcelDepthMeters =
            Number(cityOverlay?.profile?.parcelDepthMeters)
          const cityParcelsUseAuthoredMeters =
            Number.isSafeInteger(cityExpectedParcelCount)
            && cityExpectedParcelCount > 0
            && Number.isFinite(cityExpectedParcelWidthMeters)
            && cityExpectedParcelWidthMeters > 0
            && Number.isFinite(cityExpectedParcelDepthMeters)
            && cityExpectedParcelDepthMeters > 0
            && citySourceFeatures.length === cityExpectedParcelCount
            && cityParcelEdgeMeters.length === cityExpectedParcelCount
            && cityParcelEdgeMeters.every(parcel => (
              parcel.id
              && close(
                parcel.widthMeters,
                cityExpectedParcelWidthMeters,
              )
              && close(
                parcel.depthMeters,
                cityExpectedParcelDepthMeters,
              )
            ))
          const environmentLayerCount = Object.values(
            environmentLayerIds || {},
          ).filter(layerId => Boolean(map?.getLayer?.(layerId))).length
          const selectedEnvironmentSubjectsExact = authoredEnvironmentSubjects.length
            === environmentSurfaces.filter(surface => surface.kind === 'subject').length
            && authoredEnvironmentSubjects.every(expected => {
              const actual = environmentSurfaceMeters.find(
                surface => surface.id === expected.id,
              )
              return Boolean(
                actual
                && actual.kind === 'subject'
                && close(actual.baseHeightMeters, expected.baseHeightMeters, 0.01)
                && close(actual.heightMeters, expected.heightMeters, 0.01)
                && close(actual.edgeWidthMeters, expected.widthMeters)
                && close(actual.edgeDepthMeters, expected.depthMeters)
              )
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
          const cityError = cityPanel?.querySelector(
            '[data-kg-city-sim-error="1"]',
          )
          const citySemanticSurface = document.querySelector(
            '[data-kg-city-sim-semantic-media="active"]',
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
            cityError: cityError?.textContent?.trim() || '',
            citySemanticSurfaceActive: Boolean(citySemanticSurface),
            cityMapLibreOwnerCount: document.querySelectorAll(
              '[data-kg-city-maplibre-owner="1"]',
            ).length,
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
            environmentLayerCount,
            environmentSourceFeatures:
              environmentFeatures.length,
            environmentSourcePresent: Boolean(environmentSource),
            environmentSourceExactlyMatchesOverlay,
            cityExpectedParcelCount,
            cityExpectedParcelDepthMeters,
            cityExpectedParcelWidthMeters,
            citySourceFeatures: citySourceFeatures.length,
            citySourcePresent: Boolean(citySource),
            cityLayersReady: cityLayerIds.length > 0
              && cityLayerIds.every(id => Boolean(map?.getLayer?.(id))),
            cityParcelEdgeMeters,
            cityParcelsUseAuthoredMeters,
            environmentPoiIds: Array.from(new Set(environmentFeatures
              .filter(feature => feature?.properties?.kgSurfaceKind === 'poi')
                .map(feature => feature?.properties?.kgPoiId || '')
                .filter(Boolean))).sort(),
            authoredEnvironmentSubjects,
            environmentSubjectIds: environmentFeatures
              .filter(feature => feature?.properties?.kgSurfaceKind === 'subject')
              .map(feature => feature?.properties?.kgSurfaceId || '').sort(),
            environmentSurfaceMeters,
            selectedEnvironmentSubjectsExact,
            renderedEnvironmentKinds: Array.from(new Set(
              renderedEnvironment.map(
                feature => feature?.properties?.kgSurfaceKind || '',
              ).filter(Boolean),
            )).sort(),
            renderedEnvironmentPoiIds: Array.from(new Set(renderedEnvironment
              .filter(feature => feature?.properties?.kgSurfaceKind === 'poi')
                .map(feature => feature?.properties?.kgPoiId || '')
                .filter(Boolean))).sort(),
            cityGeoXrLayerOrder,
            cityGeoXrLayerOrderExact:
              gympgrph.hasExactCityGeoXrLayerOrder?.(styleLayerIds) === true,
            renderedEnvironmentSubjectIds: renderedEnvironment
              .filter(feature => feature?.properties?.kgSurfaceKind === 'subject')
              .map(feature => feature?.properties?.kgSurfaceId || '').sort(),
            renderedKinds,
            sourceKinds,
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
            flightR3fVisualCount: flightR3fVisualNames.length,
            flightR3fVisualNames,
            visualProjection:
              rendererCanvas?.dataset.kgFlightSimVisualProjection || '',
            rendererPointerTransparent:
              Boolean(rendererPointerRoot)
              && getComputedStyle(rendererPointerRoot).pointerEvents === 'none',
            rendererSurfaceVisible: isVisible(rendererPointerRoot),
            exclusivePlainGeoOverlayCount: document.querySelectorAll(
              '[data-kg-flight-sim-geo-overlay="1"]',
            ).length,
            overlayRevision: overlay?.revision || '',
            overlayPhase: overlay?.phase || '',
            overlayRoutePointCount: Array.isArray(overlay?.route)
              ? overlay.route.length
              : 0,
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
    view.update(read_city_semantic_media_contract(page))
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
    return unmet_view_requirements(
        last,
        expected_provider_host=expected_provider_host,
        expected_view=expected_view,
        expected_projection=expected_projection,
        expected_style_url=expected_style_url,
        require_visual_layout=require_visual_layout,
    )


def _wait_for_view(
    page: Page,
    *,
    expected_provider_host: str,
    expected_view: str,
    expected_projection: str,
    expected_style_url: str,
    require_visual_layout: bool = False,
) -> dict[str, Any]:
    return wait_for_view(
        page,
        read_view=_read_view,
        expected_provider_host=expected_provider_host,
        expected_view=expected_view,
        expected_projection=expected_projection,
        expected_style_url=expected_style_url,
        require_visual_layout=require_visual_layout,
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
            "flightR3fVisualCount": 4,
            "flightR3fVisualNames": [
                "kg_flight_sim_aircraft",
                "kg_flight_sim_aircraft_model_orientation",
                "kg_flight_sim_geospatial_actor_lighting",
                "kg_flight_sim_mission",
            ],
            "visualProjection": "r3f",
            "rendererPointerTransparent": True, "flightActive": True,
            "exclusivePlainGeoOverlayCount": 0, "flightRuntimeError": "",
        }, require_revision_sync=True,
    )
