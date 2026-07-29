from __future__ import annotations

import time
from typing import Any

from playwright.sync_api import Page

from lib.game_flight_sim_smoke_source_selection import (
    prepare_source_files_selection_surface,
)


def read_geo_xr_layout_occlusion(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        async () => {
          const [graph, gympgrph] = await Promise.all([
            window.__kgFlightSimBrowserProof.importModule('graphStore'),
            window.__kgFlightSimBrowserProof.importModule('gympgrphStore'),
          ])
          const graphState = graph.useGraphStore.getState()
          const map = gympgrph.readActiveMapLibreMap?.() || null
          const overlay = gympgrph.readFlightGeoOverlay?.() || null
          const isVisible = element => {
            const rect = element?.getBoundingClientRect?.()
            const style = element ? getComputedStyle(element) : null
            return Boolean(rect?.width > 0 && rect?.height > 0)
              && style?.display !== 'none' && style?.visibility !== 'hidden'
              && Number(style?.opacity || '1') > 0
          }
          const rectOf = element => {
            if (!isVisible(element)) return null
            const rect = element.getBoundingClientRect()
            return {
              bottom: rect.bottom, left: rect.left, right: rect.right,
              top: rect.top, height: rect.height, width: rect.width,
            }
          }
          const overlaps = (left, right) => (
            left.left < right.right && left.right > right.left
            && left.top < right.bottom && left.bottom > right.top
          )
          const mapCanvas = Array.from(
            document.querySelectorAll('canvas.maplibregl-canvas'),
          ).find(isVisible) || null
          const mapRect = rectOf(mapCanvas)
          const workspacePane = document.querySelector(
            '[data-kg-workspace-visible-viewport-occluder="left"]',
          )
          const floatingPanel = Array.from(document.querySelectorAll(
            '[data-kg-floating-panel-root="true"]',
          )).find(panel => panel.querySelector('[aria-label="Floating panel"]')) || null
          const occluders = [
            ['source-files', workspacePane],
            ['floating-panel', floatingPanel],
          ].flatMap(([kind, element]) => {
            const rect = rectOf(element)
            return rect && mapRect && overlaps(rect, mapRect) ? [{ kind, rect }] : []
          })
          const toScreen = coordinate => {
            const point = mapRect ? map?.project?.(coordinate) : null
            if (!mapRect || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
              return null
            }
            return { x: mapRect.left + point.x, y: mapRect.top + point.y }
          }
          const exposed = point => Boolean(mapRect && point)
            && point.x >= mapRect.left + 2 && point.x <= mapRect.right - 2
            && point.y >= mapRect.top + 2 && point.y <= mapRect.bottom - 2
            && !occluders.some(({ rect }) => (
              point.x > rect.left && point.x < rect.right
              && point.y > rect.top && point.y < rect.bottom
            ))
          const routeSamples = []
          const route = Array.isArray(overlay?.route) ? overlay.route : []
          for (let index = 0; index < route.length; index += 1) {
            const current = route[index]?.coordinate
            const next = route[index + 1]?.coordinate
            if (current) routeSamples.push(toScreen(current))
            if (current && next) {
              for (let step = 1; step < 8; step += 1) {
                const ratio = step / 8
                routeSamples.push(toScreen([
                  current[0] + (next[0] - current[0]) * ratio,
                  current[1] + (next[1] - current[1]) * ratio,
                ]))
              }
            }
          }
          const pairsInGeometry = geometry => {
            const pairs = []
            const visit = value => {
              if (Array.isArray(value)
                && Number.isFinite(Number(value[0]))
                && Number.isFinite(Number(value[1]))) {
                pairs.push([Number(value[0]), Number(value[1])])
              } else if (Array.isArray(value)) {
                value.forEach(visit)
              }
            }
            visit(geometry?.coordinates)
            return pairs
          }
          const environmentSourceId = gympgrph.FLIGHT_GEO_ENVIRONMENT_SOURCE_ID
            || 'kg-flight-geo-environment'
          const environmentLayerIds = gympgrph.FLIGHT_GEO_ENVIRONMENT_LAYER_IDS || {}
          const environmentSource = map?.getSource?.(environmentSourceId) || null
          const environmentData = typeof environmentSource?.getData === 'function'
            ? await environmentSource.getData()
            : environmentSource?.serialize?.()?.data || null
          const mode3d = String(gympgrph.useGympgrphStore.getState().geospatialViewMode)
            .startsWith('3d')
          const activeEnvironmentLayer = mode3d
            ? environmentLayerIds.extrusion3d : environmentLayerIds.fill2d
          const environmentScreenProof = (environmentData?.features || []).map(feature => {
            const points = pairsInGeometry(feature.geometry).map(toScreen).filter(Boolean)
            const xs = points.map(point => point.x)
            const ys = points.map(point => point.y)
            return {
              heightMeters: Number(feature.properties?.kgHeightMeters || 0),
              id: String(feature.properties?.kgSurfaceId || ''),
              kind: String(feature.properties?.kgSurfaceKind || ''),
              screenHeight: ys.length ? Math.max(...ys) - Math.min(...ys) : 0,
              screenWidth: xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
              visible: points.some(exposed),
            }
          })
          const environmentUnoccludedKinds = Array.from(new Set(
            environmentScreenProof.filter(proof => (
              proof.visible && proof.screenWidth >= 8 && proof.screenHeight >= 8
            )).map(proof => proof.kind).filter(Boolean),
          )).sort()
          const activeEnvironmentLayerDefinition = map?.getLayer?.(
            activeEnvironmentLayer,
          ) || null
          const activeEnvironmentVisible = map?.getLayoutProperty?.(
            activeEnvironmentLayer, 'visibility',
          ) !== 'none'
          let mapPointerHit = null
          if (mapCanvas && mapRect) {
            for (const ratioX of [0.18, 0.36, 0.5, 0.64, 0.82]) {
              for (const ratioY of [0.28, 0.5, 0.72]) {
                const point = {
                  x: mapRect.left + mapRect.width * ratioX,
                  y: mapRect.top + mapRect.height * ratioY,
                }
                if (!exposed(point)) continue
                if (document.elementFromPoint(point.x, point.y) === mapCanvas) {
                  mapPointerHit = point
                  break
                }
              }
              if (mapPointerHit) break
            }
          }
          const host = document.querySelector(
            '[data-kg-flight-geospatial-overlay="active"]',
          )
          return {
            aircraftUnoccluded: exposed(toScreen(overlay?.aircraft?.coordinate)),
            cameraPadding: host?.getAttribute(
              'data-kg-flight-geospatial-camera-padding',
            ) || '',
            environmentExtrusionVisible: !mode3d || (
              activeEnvironmentLayerDefinition?.type === 'fill-extrusion'
              && activeEnvironmentVisible
              && environmentScreenProof.some(proof => (
                proof.kind === 'structure' && proof.heightMeters >= 20
              ))
            ),
            environmentUnoccludedKinds,
            floatingPanelView: graphState.floatingPanelView,
            floatingPanelVisible: isVisible(floatingPanel),
            geographyBoundaryStatus: document.querySelector(
              '[data-kg-flight-sim-geography-boundary]',
            )?.getAttribute('data-kg-flight-sim-geography-boundary') || '',
            mapPointerHit,
            occluders,
            routeUnoccluded: routeSamples.length > 1
              && routeSamples.every(point => point && exposed(point)),
            sourceFilesVisible: isVisible(document.querySelector(
              '[aria-label="Source Files content"]',
            )),
            viewport: { height: window.innerHeight, width: window.innerWidth },
            workspacePaneVisible: isVisible(workspacePane),
          }
        }
        """
    )


def prepare_reported_singapore_geo_handoff(page: Page) -> dict[str, Any]:
    prepare_source_files_selection_surface(page)
    media_trigger = page.locator(
        '[data-kg-floating-panel-view-trigger="media"]'
    ).first
    media_trigger.wait_for(state="visible", timeout=30_000)
    media_trigger.click(timeout=30_000)
    geo_button = page.get_by_role(
        "button", name="Select Singapore and open Geo", exact=True
    )
    geo_button.wait_for(state="visible", timeout=30_000)
    geo_button.click(timeout=30_000)
    deadline = time.monotonic() + 30
    observed: dict[str, Any] = {}
    while time.monotonic() < deadline:
        observed = page.evaluate(
            """
            async () => {
              const [graph, gympgrph, xr] = await Promise.all([
                window.__kgFlightSimBrowserProof.importModule('graphStore'),
                window.__kgFlightSimBrowserProof.importModule('gympgrphStore'),
                window.__kgFlightSimBrowserProof.importModule('xrMotionReferenceRuntime'),
              ])
              return {
                geospatialEnabled: gympgrph.useGympgrphStore.getState().geospatialModeEnabled,
                panelOpen: graph.useGraphStore.getState().floatingPanelOpen,
                panelView: graph.useGraphStore.getState().floatingPanelView,
                stageId: xr.readXrMotionReferenceRuntime().plan.stageId,
              }
            }
            """
        )
        if (
            observed.get("geospatialEnabled") is True
            and observed.get("panelOpen") is True
            and observed.get("panelView") == "geo"
            and observed.get("stageId") == "singapore"
        ):
            break
        page.wait_for_timeout(100)
    else:
        raise AssertionError(
            "Select Singapore and open Geo did not complete its source-authored "
            f"handoff: {observed}"
        )
    flight_trigger = page.locator(
        '[data-kg-floating-panel-view-trigger="flightSim"]'
    ).first
    flight_trigger.click(timeout=30_000)
    page.locator('[aria-label="Flight Sim"]').wait_for(
        state="visible", timeout=30_000
    )
    return observed
