import type { Feature, FeatureCollection, Polygon } from 'geojson'
import type {
  FlightGeoEnvironmentProjection,
  FlightGeoOverlaySnapshot,
} from './flightGeoOverlay.js'
import {
  isMapLibreStyleReady,
  readGeoJsonSourceData,
  setGeoJsonSourceData,
} from './maplibreLayers.js'

export const FLIGHT_GEO_ENVIRONMENT_SOURCE_ID =
  'kg-flight-geo-environment'

export const FLIGHT_GEO_ENVIRONMENT_LAYER_IDS = Object.freeze({
  fill2d: `${FLIGHT_GEO_ENVIRONMENT_SOURCE_ID}:fill-2d`,
  extrusion3d: `${FLIGHT_GEO_ENVIRONMENT_SOURCE_ID}:extrusion-3d`,
  outline: `${FLIGHT_GEO_ENVIRONMENT_SOURCE_ID}:outline`,
})

type EnvironmentFeatureProperties = Readonly<{
  kgBaseHeightMeters: number
  kgColor: string
  kgEnvironmentId: string
  kgEnvironmentRevision: string
  kgHeightMeters: number
  kgSurfaceId: string
  kgSurfaceKind: string
}>

function environmentFeatureCollection(
  environment: FlightGeoEnvironmentProjection,
): FeatureCollection<Polygon, EnvironmentFeatureProperties> {
  const features = environment.surfaces.map<
    Feature<Polygon, EnvironmentFeatureProperties>
  >(surface => ({
    type: 'Feature',
    id: `${environment.id}:${surface.id}`,
    geometry: {
      type: 'Polygon',
      coordinates: [surface.ring.map(coordinate => [...coordinate])],
    },
    properties: {
      kgBaseHeightMeters: surface.baseHeightMeters,
      kgColor: surface.color,
      kgEnvironmentId: environment.id,
      kgEnvironmentRevision: environment.revision,
      kgHeightMeters: surface.heightMeters,
      kgSurfaceId: surface.id,
      kgSurfaceKind: surface.kind,
    },
  }))
  return { type: 'FeatureCollection', features }
}

function is3dViewMode(viewMode: string): boolean {
  return viewMode === '3d' || viewMode === '3d-modern'
}

function ensureEnvironmentSource(map: any): boolean {
  if (map.getSource?.(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID)) return true
  map.addSource?.(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  return Boolean(map.getSource?.(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID))
}

function addEnvironmentLayerOnce(
  map: any,
  layer: Record<string, unknown>,
): boolean {
  const layerId = String(layer.id || '')
  if (!layerId || typeof map.addLayer !== 'function') return false
  if (map.getLayer?.(layerId)) return true
  map.addLayer(layer)
  return Boolean(map.getLayer?.(layerId))
}

function ensureEnvironmentLayers(map: any): boolean {
  const fill2d = addEnvironmentLayerOnce(map, {
      id: FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d,
      type: 'fill',
      source: FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
      paint: {
        'fill-color': ['get', 'kgColor'],
        'fill-opacity': [
          'case',
          ['==', ['get', 'kgSurfaceKind'], 'stage-footprint'],
          0.2,
          0.7,
        ],
      },
    })
  const extrusion3d = addEnvironmentLayerOnce(map, {
      id: FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d,
      type: 'fill-extrusion',
      source: FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
      paint: {
        'fill-extrusion-base': ['get', 'kgBaseHeightMeters'],
        'fill-extrusion-color': ['get', 'kgColor'],
        'fill-extrusion-height': ['get', 'kgHeightMeters'],
        'fill-extrusion-opacity': 0.86,
      },
    })
  const outline = addEnvironmentLayerOnce(map, {
      id: FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.outline,
      type: 'line',
      source: FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
      paint: {
        'line-color': '#06b6d4',
        'line-opacity': 0.9,
        'line-width': 2,
      },
    })
  return fill2d && extrusion3d && outline
}

function applyModeVisibility(map: any, viewMode: string): void {
  const mode3d = is3dViewMode(viewMode)
  map.setLayoutProperty?.(
    FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d,
    'visibility',
    mode3d ? 'none' : 'visible',
  )
  map.setLayoutProperty?.(
    FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d,
    'visibility',
    mode3d ? 'visible' : 'none',
  )
}

export function applyFlightGeoEnvironmentToMap(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
  viewMode: string,
): boolean {
  if (!map || !isMapLibreStyleReady(map)) return false
  if (!overlay.environment) {
    clearFlightGeoEnvironmentFromMap(map)
    return true
  }
  try {
    if (!ensureEnvironmentSource(map)) {
      throw new Error('MapLibre did not register the XR environment source.')
    }
    if (!ensureEnvironmentLayers(map)) {
      throw new Error('MapLibre did not register every XR environment layer.')
    }
    applyModeVisibility(map, viewMode)
    setGeoJsonSourceData(
      map,
      FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
      environmentFeatureCollection(overlay.environment),
    )
    return mapHasExactFlightGeoEnvironment(map, overlay)
  } catch (error) {
    console.error(
      `[kg-flight] Could not project XR environment "${overlay.environment.id}" into MapLibre mode "${viewMode}".`,
      error,
    )
    return false
  }
}

export function clearFlightGeoEnvironmentFromMap(map: any): void {
  setGeoJsonSourceData(
    map,
    FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
    { type: 'FeatureCollection', features: [] },
  )
}

export function mapHasExactFlightGeoEnvironment(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
): boolean {
  if (!overlay.environment) return true
  try {
    const sourceData = readGeoJsonSourceData(
      map.getSource?.(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID),
    )
    if (
      sourceData?.features?.length !== overlay.environment.surfaces.length
    ) {
      return false
    }
    return Object.values(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS)
      .every(layerId => Boolean(map.getLayer?.(layerId)))
      && sourceData.features.every(feature => {
      const properties = feature?.properties as Record<string, unknown> | null
      return (
        properties?.kgEnvironmentId === overlay.environment?.id
        && properties?.kgEnvironmentRevision === overlay.environment?.revision
      )
      })
  } catch {
    return false
  }
}
