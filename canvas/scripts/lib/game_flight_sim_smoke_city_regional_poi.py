from __future__ import annotations

import math
import time
from typing import Any

from playwright.sync_api import Page


def read_city_regional_poi_contract(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        async () => {
          const gympgrph = await window.__kgFlightSimBrowserProof.importModule(
            'gympgrphStore',
          )
          const map = gympgrph.readActiveMapLibreMap?.() || null
          const city = gympgrph.readCityGeoOverlay?.() || null
          const profile = city?.profile?.regionalPoiProfile || null
          const sourceId = gympgrph.REGIONAL_POI_SOURCE_ID
          const layerIds = Object.values(
            gympgrph.REGIONAL_POI_LAYER_IDS || {},
          )
          const source = map?.getSource?.(sourceId) || null
          const readSourceData = async () => {
            try {
              return typeof source?.getData === 'function'
                ? await source.getData()
                : source?.serialize?.()?.data || null
            } catch {
              return null
            }
          }
          const data = await readSourceData()
          const features = Array.isArray(data?.features) ? data.features : []
          const expectedFeatureCollection = profile
            ? gympgrph.regionalPoiFeatureCollection?.(profile) || null
            : null
          const expectedFeatures = Array.isArray(
            expectedFeatureCollection?.features,
          ) ? expectedFeatureCollection.features : []
          const surfaceFeatures = features.filter(feature => (
            feature?.properties?.kgRegionalPoiFeatureKind === 'surface'
          ))
          const locatorFeatures = features.filter(feature => (
            feature?.properties?.kgRegionalPoiFeatureKind === 'locator'
          ))
          const viewMode = String(
            gympgrph.useGympgrphStore.getState().geospatialViewMode,
          ).startsWith('3d') ? '3d' : '2d'
          const activeLayer = viewMode === '3d'
            ? gympgrph.REGIONAL_POI_LAYER_IDS?.extrusion
            : gympgrph.REGIONAL_POI_LAYER_IDS?.fill
          const expectedPois = Array.isArray(profile?.pois)
            ? profile.pois.map(poi => String(poi.id)).sort()
            : []
          const cityParcelIds = Array.isArray(city?.parcels)
            ? city.parcels.map(parcel => String(parcel.id)).sort()
            : []
          const cityPresentationStateEntries = city
            ? gympgrph.cityGeoPresentationStateEntries?.(city) || []
            : []
          const sourcePois = Array.from(new Set(features.map(
            feature => String(feature?.properties?.kgRegionalPoiId || ''),
          ).filter(Boolean))).sort()
          const locatorPois = locatorFeatures.map(feature => String(
            feature?.properties?.kgRegionalPoiId || '',
          )).filter(Boolean).sort()
          const exactFeatures = Boolean(profile)
            && JSON.stringify(features) === JSON.stringify(expectedFeatures)
          const canvas = map?.getCanvas?.() || null
          const isVisible = element => {
            const rect = element?.getBoundingClientRect?.()
            const style = element ? getComputedStyle(element) : null
            return Boolean(rect?.width > 0 && rect?.height > 0)
              && style?.display !== 'none'
              && style?.visibility !== 'hidden'
              && Number(style?.opacity || '1') > 0
          }
          const canvasRect = isVisible(canvas)
            ? canvas.getBoundingClientRect()
            : null
          const width = Number(canvas?.clientWidth || 0)
          const height = Number(canvas?.clientHeight || 0)
          const framingPadding = gympgrph.readGeoMapViewportPadding?.(map)
            || { bottom: 0, left: 0, right: 0, top: 0 }
          const mapPadding = map?.getPadding?.()
            || { bottom: 0, left: 0, right: 0, top: 0 }
          const effectivePadding = {
            bottom: Math.max(
              Number(framingPadding.bottom) || 0,
              Number(mapPadding.bottom) || 0,
            ),
            left: Math.max(
              Number(framingPadding.left) || 0,
              Number(mapPadding.left) || 0,
            ),
            right: Math.max(
              Number(framingPadding.right) || 0,
              Number(mapPadding.right) || 0,
            ),
            top: Math.max(
              Number(framingPadding.top) || 0,
              Number(mapPadding.top) || 0,
            ),
          }
          const visibleAperture = {
            bottom: height - framingPadding.bottom,
            left: framingPadding.left,
            right: width - framingPadding.right,
            top: framingPadding.top,
          }
          const contentAperture = {
            bottom: height - effectivePadding.bottom,
            left: effectivePadding.left,
            right: width - effectivePadding.right,
            top: effectivePadding.top,
          }
          const pairsInGeometry = geometry => {
            const rings = []
            const visit = value => {
              if (!Array.isArray(value)) return
              if (value.length >= 3 && value.every(pair => (
                Array.isArray(pair)
                && Number.isFinite(Number(pair[0]))
                && Number.isFinite(Number(pair[1]))
              ))) {
                rings.push(value.map(pair => [
                  Number(pair[0]),
                  Number(pair[1]),
                ]))
                return
              }
              value.forEach(visit)
            }
            visit(geometry?.coordinates)
            return rings
          }
          const sampleRing = ring => {
            const first = ring[0]
            const last = ring[ring.length - 1]
            const closed = first?.[0] === last?.[0]
              && first?.[1] === last?.[1]
            const vertices = closed ? ring.slice(0, -1) : ring
            if (vertices.length < 3) return vertices
            const center = vertices.reduce(
              (sum, point) => [
                sum[0] + point[0],
                sum[1] + point[1],
              ],
              [0, 0],
            ).map(value => value / vertices.length)
            const edgeMidpoints = vertices.map((point, index) => {
              const next = vertices[(index + 1) % vertices.length]
              return [
                (point[0] + next[0]) / 2,
                (point[1] + next[1]) / 2,
              ]
            })
            return [center, ...edgeMidpoints, ...vertices]
          }
          const project = coordinate => {
            const point = map?.project?.(coordinate)
            return Number.isFinite(point?.x) && Number.isFinite(point?.y)
              ? { x: Number(point.x), y: Number(point.y) }
              : null
          }
          const insideAperture = point => Boolean(point)
            && point.x >= contentAperture.left + 2
            && point.x <= contentAperture.right - 2
            && point.y >= contentAperture.top + 2
            && point.y <= contentAperture.bottom - 2
          const hitMapCanvas = point => Boolean(canvasRect && point)
            && document.elementFromPoint(
              canvasRect.left + point.x,
              canvasRect.top + point.y,
            ) === canvas
          const renderedPoiAt = (point, poiId) => {
            if (!insideAperture(point) || !hitMapCanvas(point)) return false
            try {
              return map?.queryRenderedFeatures?.(
                [point.x, point.y],
                { layers: [activeLayer] },
              ).some(feature => (
                String(
                  feature?.properties?.kgRegionalPoiId || '',
                ) === poiId
              )) || false
            } catch {
              return false
            }
          }
          const renderedLocatorAt = (point, poiId) => {
            if (!insideAperture(point) || !hitMapCanvas(point)) return false
            try {
              return map?.queryRenderedFeatures?.(
                [point.x, point.y],
                { layers: [gympgrph.REGIONAL_POI_LAYER_IDS?.locator] },
              ).some(feature => (
                String(feature?.properties?.kgRegionalPoiId || '') === poiId
              )) || false
            } catch {
              return false
            }
          }
          const renderedLabelPois = (() => {
            try {
              return Array.from(new Set(map?.queryRenderedFeatures?.(
                [
                  [contentAperture.left, contentAperture.top],
                  [contentAperture.right, contentAperture.bottom],
                ],
                { layers: [gympgrph.REGIONAL_POI_LAYER_IDS?.label] },
              ).map(feature => String(
                feature?.properties?.kgRegionalPoiId || '',
              )).filter(Boolean) || [])).sort()
            } catch {
              return []
            }
          })()
          const projectedSurfacePoints = surfaceFeatures.flatMap(feature => (
            pairsInGeometry(feature?.geometry).flat().map(project).filter(Boolean)
          ))
          const projectedSurfaceXs = projectedSurfacePoints.map(point => point.x)
          const projectedSurfaceYs = projectedSurfacePoints.map(point => point.y)
          const regionalBoundsApertureCoverage = projectedSurfaceXs.length
            && projectedSurfaceYs.length
            ? Math.max(
                (Math.max(...projectedSurfaceXs) - Math.min(...projectedSurfaceXs))
                  / Math.max(
                    1,
                    visibleAperture.right - visibleAperture.left,
                  ),
                (Math.max(...projectedSurfaceYs) - Math.min(...projectedSurfaceYs))
                  / Math.max(
                    1,
                    visibleAperture.bottom - visibleAperture.top,
                  ),
              )
            : 0
          const poiVisualProof = expectedPois.map(poiId => {
            const poiFeatures = surfaceFeatures.filter(feature => (
              String(
                feature?.properties?.kgRegionalPoiId || '',
              ) === poiId
            ))
            const rings = poiFeatures.flatMap(feature => (
              pairsInGeometry(feature?.geometry)
            ))
            const projectedBoundsPoints = rings.flat().map(project).filter(Boolean)
            const xs = projectedBoundsPoints.map(point => point.x)
            const ys = projectedBoundsPoints.map(point => point.y)
            const bounds = xs.length && ys.length
              ? {
                  bottom: Math.max(...ys),
                  left: Math.min(...xs),
                  right: Math.max(...xs),
                  top: Math.min(...ys),
                }
              : null
            const boundsInsideAperture = Boolean(bounds)
              && bounds.left >= contentAperture.left
              && bounds.right <= contentAperture.right
              && bounds.top >= contentAperture.top
              && bounds.bottom <= contentAperture.bottom
            const anchor = rings.flatMap(sampleRing)
              .map(project)
              .find(point => renderedPoiAt(point, poiId)) || null
            const locatorFeature = locatorFeatures.find(feature => (
              String(feature?.properties?.kgRegionalPoiId || '') === poiId
            )) || null
            const locatorAnchor = locatorFeature?.geometry?.type === 'Point'
              ? project(locatorFeature.geometry.coordinates)
              : null
            return {
              anchor,
              bounds,
              boundsInsideAperture,
              labelRendered: renderedLabelPois.includes(poiId),
              locatorAnchor,
              locatorInsideAperture: insideAperture(locatorAnchor),
              locatorRenderedAtAnchor: renderedLocatorAt(locatorAnchor, poiId),
              poiId,
              renderedIdentityAtAnchor: Boolean(anchor),
              surfaceCount: poiFeatures.length,
            }
          })
          const visiblePoiAnchors = poiVisualProof.filter(proof => (
            proof.boundsInsideAperture
            && proof.renderedIdentityAtAnchor
          )).map(proof => proof.poiId).sort()
          const container = map?.getContainer?.() || null
          return {
            aperture: contentAperture,
            exactFeatures,
            exactPresentation: Boolean(profile)
              && gympgrph.mapHasExactRegionalPoiProfile?.(
                map,
                profile,
                { viewMode },
              ) === true,
            exactCityPresentation: Boolean(city)
              && gympgrph.mapHasExactCityGeoPresentation?.(map, city) === true,
            expectedPois,
            cityParcelIds,
            cityPresentationStateCount: cityPresentationStateEntries.length,
            featureCount: features.length,
            layerCount: layerIds.filter(
              layerId => Boolean(map?.getLayer?.(layerId)),
            ).length,
            locatorCount: locatorFeatures.length,
            locatorPois,
            poiVisualProof,
            profileFeatureCount: Number(profile?.surfaces?.length || 0),
            profileId: String(profile?.id || ''),
            profileRevision: String(profile?.revision || ''),
            regionalBoundsApertureCoverage,
            sourcePois,
            datasetFeatureCount: Number(
              container?.dataset?.kgCityGeospatialPoiFeatureCount || 0,
            ),
            datasetProfileId: String(
              container?.dataset?.kgCityGeospatialPoiProfileId || '',
            ),
            datasetProfileRevision: String(
              container?.dataset?.kgCityGeospatialPoiRevision || '',
            ),
            visiblePoiAnchors,
          }
        }
        """,
    )


def _has_valid_regional_bounds_aperture_coverage(value: Any) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and 0.45 <= value <= 1
    )


def require_city_regional_poi_contract(page: Page) -> dict[str, Any]:
    deadline = time.monotonic() + 30
    observed: dict[str, Any] = {}
    while time.monotonic() < deadline:
        observed = read_city_regional_poi_contract(page)
        expected_pois = observed.get("expectedPois")
        if (
            observed.get("profileId")
            and isinstance(expected_pois, list)
            and expected_pois
            and observed.get("featureCount")
            == observed.get("profileFeatureCount") + observed.get("locatorCount")
            and observed.get("datasetFeatureCount")
            == observed.get("featureCount")
            and observed.get("datasetProfileId") == observed.get("profileId")
            and observed.get("datasetProfileRevision")
            == observed.get("profileRevision")
            and observed.get("sourcePois") == expected_pois
            and observed.get("cityParcelIds") == expected_pois
            and observed.get("cityPresentationStateCount")
            == observed.get("profileFeatureCount")
            and observed.get("layerCount") == 5
            and observed.get("locatorCount") == len(expected_pois)
            and observed.get("locatorPois") == expected_pois
            and observed.get("exactFeatures") is True
            and observed.get("exactPresentation") is True
            and observed.get("exactCityPresentation") is True
            and _has_valid_regional_bounds_aperture_coverage(
                observed.get("regionalBoundsApertureCoverage")
            )
            and observed.get("visiblePoiAnchors") == expected_pois
            and len(observed.get("poiVisualProof") or []) == len(expected_pois)
            and all(
                proof.get("boundsInsideAperture") is True
                and proof.get("renderedIdentityAtAnchor") is True
                and proof.get("locatorInsideAperture") is True
                and proof.get("locatorRenderedAtAnchor") is True
                and proof.get("labelRendered") is True
                for proof in observed.get("poiVisualProof") or []
            )
        ):
            return observed
        page.wait_for_timeout(100)
    raise AssertionError(
        f"City regional POI contract was not visible and exact: {observed}"
    )


def read_city_regional_poi_teardown_contract(
    page: Page,
) -> dict[str, Any]:
    return page.evaluate(
        """
        async () => {
          const gympgrph = await window.__kgFlightSimBrowserProof.importModule(
            'gympgrphStore',
          )
          const map = gympgrph.readActiveMapLibreMap?.() || null
          const sourceId = gympgrph.REGIONAL_POI_SOURCE_ID
          const layerIds = Object.values(
            gympgrph.REGIONAL_POI_LAYER_IDS || {},
          )
          const container = map?.getContainer?.() || null
          const evidenceKeys = [
            'kgCityGeospatialPoiFeatureCount',
            'kgCityGeospatialPoiProfileId',
            'kgCityGeospatialPoiRevision',
          ]
          const presentEvidenceKeys = evidenceKeys.filter(key => (
            Object.prototype.hasOwnProperty.call(
              container?.dataset || {},
              key,
            )
          ))
          return {
            expectedLayerCount: layerIds.length,
            presentEvidenceKeys,
            presentLayerIds: layerIds.filter(
              layerId => Boolean(map?.getLayer?.(layerId)),
            ),
            sourcePresent: Boolean(map?.getSource?.(sourceId)),
          }
        }
        """,
    )


def require_city_regional_poi_teardown_contract(
    page: Page,
) -> dict[str, Any]:
    deadline = time.monotonic() + 30
    observed: dict[str, Any] = {}
    while time.monotonic() < deadline:
        observed = read_city_regional_poi_teardown_contract(page)
        if (
            observed.get("expectedLayerCount") == 5
            and observed.get("sourcePresent") is False
            and observed.get("presentLayerIds") == []
            and observed.get("presentEvidenceKeys") == []
        ):
            return observed
        page.wait_for_timeout(100)
    raise AssertionError(
        "City regional POI source, layers, or evidence survived teardown: "
        f"{observed}"
    )
