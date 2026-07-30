import type { FeatureCollection } from 'geojson'

import {
  FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER,
  FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
} from '../../flightGeoEnvironmentMapLibre.js'
import {
  FLIGHT_GEO_OVERLAY_LAYER_ORDER,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
} from '../../flightGeoOverlayMapLibre.js'
import {
  readGeoJsonSourceData,
} from '../../maplibreLayers.js'

const EMPTY_FEATURE_COLLECTION: FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
}

const OWNED_SOURCE_IDS = Object.freeze([
  FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
])

function hideOwnedFlightLayers(map: any): void {
  for (const layerId of [
    ...FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER,
    ...FLIGHT_GEO_OVERLAY_LAYER_ORDER,
  ]) {
    try {
      if (!map?.getLayer?.(layerId)) continue
      map.setLayoutProperty?.(layerId, 'visibility', 'none')
    } catch {
      void 0
    }
  }
}

function readOwnedSource(
  map: any,
  sourceId: string,
): Readonly<{
  source: any | null
  state: 'absent' | 'pending' | 'present' | 'unreadable'
}> {
  let source: any | null
  try {
    source = map?.getSource?.(sourceId) ?? null
  } catch {
    return { source: null, state: 'unreadable' }
  }
  if (source) return { source, state: 'present' }
  try {
    if (typeof map?.getStyle !== 'function') {
      return { source: null, state: 'unreadable' }
    }
    const sources = map.getStyle?.()?.sources
    if (!sources || typeof sources !== 'object') {
      return { source: null, state: 'unreadable' }
    }
    return Object.prototype.hasOwnProperty.call(sources, sourceId)
      ? { source: null, state: 'pending' }
      : { source: null, state: 'absent' }
  } catch {
    return { source: null, state: 'unreadable' }
  }
}

function scheduleOwnedSourceClear(map: any, sourceId: string): boolean {
  const owned = readOwnedSource(map, sourceId)
  if (owned.state === 'absent') return true
  // During setStyle(), the style specification can advertise a source before
  // MapLibre exposes its live GeoJSONSource. Accept the clear request but keep
  // settlement false so the ownership loop retries after the next frame.
  if (owned.state === 'pending') return true
  if (owned.state !== 'present') return false
  const sourceData = readGeoJsonSourceData(owned.source)
  if (!sourceData) return false
  if (sourceData.features.length === 0) return true
  if (typeof owned.source.setData !== 'function') return false
  try {
    owned.source.setData(EMPTY_FEATURE_COLLECTION)
    return true
  } catch {
    return false
  }
}

function ownedSourceClearSettled(map: any, sourceId: string): boolean {
  const owned = readOwnedSource(map, sourceId)
  if (owned.state === 'absent') return true
  if (owned.state !== 'present') return false
  const sourceData = readGeoJsonSourceData(owned.source)
  if (!sourceData || sourceData.features.length !== 0) return false
  try {
    const loaded = owned.source.loaded
    return typeof loaded === 'function'
      && loaded.call(owned.source) === true
  } catch {
    return false
  }
}

/**
 * Hide and empty only the GeoJSON owned by Flight. Provider tile activity is
 * intentionally irrelevant to an exclusive Canvas handoff.
 */
export function prepareFlightGeoMapLibreForDisposal(map: any): boolean {
  if (!map) return true
  hideOwnedFlightLayers(map)
  let scheduled = true
  for (const sourceId of OWNED_SOURCE_IDS) {
    if (!scheduleOwnedSourceClear(map, sourceId)) scheduled = false
  }
  return scheduled
}

export function isFlightGeoMapLibreDisposalPrepared(map: any): boolean {
  if (!map) return true
  return OWNED_SOURCE_IDS.every(sourceId => (
    ownedSourceClearSettled(map, sourceId)
  ))
}
