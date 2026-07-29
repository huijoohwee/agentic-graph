export {
  LS_KEYS,
  useGympgrphStore,
  addGeospatialDatasetUrl,
  loadDatasetFeatureCollection,
  parseGeoJsonFromText,
  coerceGeoJsonToFeatureCollection,
  ensureDatasetLayer,
  FLIGHT_GEO_ENVIRONMENT_LAYER_IDS,
  FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
  FLIGHT_GEO_AIRCRAFT_IMAGE_IDS,
  FLIGHT_GEO_OVERLAY_LAYER_IDS,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
  SINGAPORE_FLIGHT_GEO_REFERENCE,
  projectSingaporeLocalMeters,
  projectSingaporeLocalRectangle,
  readActiveMapLibreMap,
  readFlightGeoOverlay,
  setGeospatialModeEnabled,
} from 'gympgrph'
export type {
  GeospatialCoordinate,
  GeospatialPresentationBounds,
} from 'gympgrph'
export { hashStringToIndex } from 'grph-shared/hash/stringHash'

import { useGympgrphStore } from 'gympgrph'

export function isGeospatialModeEnabled(): boolean {
  return Boolean(useGympgrphStore.getState().geospatialModeEnabled)
}

export function readGeospatialCursorLngLat(): { lng: number; lat: number } | null {
  const state = useGympgrphStore.getState() as { geospatialCursorLngLat?: unknown }
  const raw = state.geospatialCursorLngLat
  if (!raw || typeof raw !== 'object') return null
  const next = raw as { lng?: unknown; lat?: unknown }
  const lng = Number(next.lng)
  const lat = Number(next.lat)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return { lng, lat }
}
