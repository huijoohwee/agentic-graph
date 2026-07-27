import { hashStringToIndex } from 'grph-shared/hash/stringHash'
import { LS_KEYS } from './lib/config.js'
import { applyDevCrossOriginProxy, applyMediaProxySrc, coerceFetchUrl, MEDIA_PROXY_ENDPOINT } from './lib/url.js'
import { parseGeoJsonFromText, coerceGeoJsonToFeatureCollection } from './geojson.js'
import { addGeospatialDatasetUrl, loadDatasetFeatureCollection } from './datasets.js'
import { useGympgrphStore } from './store.js'
import { computeBoundsFromCollections } from './geo.js'
import { ensureDatasetLayer, setGeoJsonSourceData } from './maplibreLayers.js'
import { coerceFeatureCollectionIds, isPointOnlyFeatureCollection, pickPoiSelection } from './selection.js'
import { colorForDataset } from './colors.js'
import {
  readActiveMapLibreMap,
  useMapLibreBasemap,
} from './features/geospatial/useMapLibreBasemap.js'
import { GeospatialOverlayHost as GeospatialOverlayHostComponent } from './GeospatialHost.js'
import { GeospatialPanelHost } from './GeospatialPanelHost.js'
import { requestGeospatialCurrentLocation, requestGeospatialFitToData, requestGeospatialFitToSelection } from './geospatialFit.js'
import { setGeospatialModeEnabled as setGeospatialModeEnabledViaHostBridge } from './hostBridge.js'
import {
  clearEnhancedLayerConfigOverride,
  onEnhancedLayerPersistenceChanged,
  readEnhancedLayerConfig,
  readEnhancedLayerEditorState,
  setEnhancedLayerVisibility,
  setEnhancedTagVisibility,
  writeEnhancedLayerConfig,
} from './enhancedLayerPersistence.js'
export type {
  EnhancedLayerEditorState,
  EnhancedLayerPersistenceChange,
} from './enhancedLayerPersistence.js'
export type {
  FlightGeoCoordinate,
  FlightGeoOverlayPresentation,
  FlightGeoOverlaySnapshot,
  FlightGeoRoutePoint,
} from './flightGeoOverlay.js'
export {
  clearFlightGeoOverlay,
  flightGeoOverlayFeatureCollection,
  readFlightGeoOverlay,
  setFlightGeoOverlay,
  subscribeFlightGeoOverlay,
} from './flightGeoOverlay.js'
export {
  applyFlightGeoOverlayCameraToMap,
  applyFlightGeoOverlayToMap,
  clearFlightGeoOverlayFromMap,
  FLIGHT_GEO_OVERLAY_LAYER_IDS,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
} from './flightGeoOverlayMapLibre.js'

export { LS_KEYS }
export { useGympgrphStore }
export { hashStringToIndex }

export { applyDevCrossOriginProxy, applyMediaProxySrc, coerceFetchUrl, MEDIA_PROXY_ENDPOINT }

export { parseGeoJsonFromText, coerceGeoJsonToFeatureCollection }
export { addGeospatialDatasetUrl, loadDatasetFeatureCollection }

export { computeBoundsFromCollections }
export { ensureDatasetLayer, setGeoJsonSourceData }
export { coerceFeatureCollectionIds, isPointOnlyFeatureCollection, pickPoiSelection }
export { colorForDataset }
export { useMapLibreBasemap }
export { readActiveMapLibreMap }

export const GeospatialOverlayHost = GeospatialOverlayHostComponent

export { GeospatialPanelHost }

export function isGeospatialModeEnabled(): boolean {
  return useGympgrphStore.getState().geospatialModeEnabled
}

export function toggleGeospatialModeEnabled(): void {
  const enabled = isGeospatialModeEnabled()
  setGeospatialModeEnabled(!enabled)
}

export function setGeospatialModeEnabled(enabled: boolean): void {
  setGeospatialModeEnabledViaHostBridge(enabled)
}

export function setGeospatialAutoFitEnabled(enabled: boolean): void {
  useGympgrphStore.getState().setGeospatialAutoFitEnabled(enabled)
}

export function requestGeospatialTraversalRun(_args?: { edgeIds?: string[] | null }): void {
  void 0
}

export { requestGeospatialCurrentLocation, requestGeospatialFitToData, requestGeospatialFitToSelection }

export {
  clearEnhancedLayerConfigOverride,
  onEnhancedLayerPersistenceChanged,
  readEnhancedLayerConfig,
  readEnhancedLayerEditorState,
  setEnhancedLayerVisibility,
  setEnhancedTagVisibility,
  writeEnhancedLayerConfig,
}

export function requestGeospatialFitToBounds(bounds: readonly [number, number, number, number]): void {
  useGympgrphStore.getState().requestGeospatialFitToBounds(bounds)
}
