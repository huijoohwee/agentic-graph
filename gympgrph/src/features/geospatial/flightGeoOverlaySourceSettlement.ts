import type {
  FlightGeoOverlaySnapshot,
} from '../../flightGeoOverlay.js'
import {
  FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
} from '../../flightGeoEnvironmentMapLibre.js'
import {
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
} from '../../flightGeoOverlayMapLibre.js'

type FlightGeoOwnedSourceId =
  | typeof FLIGHT_GEO_OVERLAY_SOURCE_ID
  | typeof FLIGHT_GEO_ENVIRONMENT_SOURCE_ID

const unsettledFlightGeoSourcesByMap =
  new WeakMap<object, Set<FlightGeoOwnedSourceId>>()

function readFlightGeoOwnedSourceId(
  event: unknown,
): FlightGeoOwnedSourceId | null {
  if (!event || typeof event !== 'object') return null
  const sourceId = (event as { sourceId?: unknown }).sourceId
  if (
    sourceId !== FLIGHT_GEO_OVERLAY_SOURCE_ID
    && sourceId !== FLIGHT_GEO_ENVIRONMENT_SOURCE_ID
  ) return null
  return sourceId
}

export function isFlightGeoPresentationSourceDataEvent(
  event: unknown,
): boolean {
  return readFlightGeoOwnedSourceId(event) !== null
}

function flightGeoSourceSettlementState(
  map: any,
): Set<FlightGeoOwnedSourceId> | null {
  if (!map || (typeof map !== 'object' && typeof map !== 'function')) {
    return null
  }
  let unsettled = unsettledFlightGeoSourcesByMap.get(map)
  if (!unsettled) {
    unsettled = new Set()
    unsettledFlightGeoSourcesByMap.set(map, unsettled)
  }
  return unsettled
}

function markFlightGeoSourceUnsettled(
  map: any,
  sourceId: FlightGeoOwnedSourceId,
): void {
  flightGeoSourceSettlementState(map)?.add(sourceId)
}

function markFlightGeoSourceSettled(
  map: any,
  sourceId: FlightGeoOwnedSourceId,
): void {
  flightGeoSourceSettlementState(map)?.delete(sourceId)
}

function flightGeoSourceAwaitsSuccessfulData(
  map: any,
  sourceId: FlightGeoOwnedSourceId,
): boolean {
  return flightGeoSourceSettlementState(map)?.has(sourceId) === true
}

function mapLibreSourceIsLoaded(
  source: unknown,
  loadedMethodRequired: boolean,
): boolean {
  if (!source || typeof source !== 'object') return false
  const loaded = (source as { loaded?: () => unknown }).loaded
  if (typeof loaded !== 'function') return !loadedMethodRequired
  try {
    return loaded.call(source) === true
  } catch {
    return false
  }
}

export function markFlightGeoSourceEventUnsettled(
  map: any,
  event: unknown,
): boolean {
  const sourceId = readFlightGeoOwnedSourceId(event)
  if (!sourceId || !event || typeof event !== 'object') return false
  const sourceEvent = event as { coord?: unknown; tile?: unknown }
  // GeoJSON tile visibility/loading is painter work, not a new source-payload
  // generation. Its completion has no sourceDataType, so admitting it here
  // would permanently poison an otherwise settled worker result.
  if (sourceEvent.tile !== undefined || sourceEvent.coord !== undefined) {
    return false
  }
  markFlightGeoSourceUnsettled(map, sourceId)
  return true
}

export function markFlightGeoSourceDataEventSettled(
  map: any,
  event: unknown,
): boolean {
  const sourceId = readFlightGeoOwnedSourceId(event)
  if (!sourceId || !event || typeof event !== 'object') return false
  const sourceDataType = (event as { sourceDataType?: unknown }).sourceDataType
  if (sourceDataType !== 'metadata' && sourceDataType !== 'content') {
    return false
  }
  if (!mapLibreSourceIsLoaded(map?.getSource?.(sourceId), false)) return false
  markFlightGeoSourceSettled(map, sourceId)
  return true
}

export function mapHasLoadedFlightGeoSources(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
): boolean {
  try {
    const overlaySource = map?.getSource?.(FLIGHT_GEO_OVERLAY_SOURCE_ID)
    if (!mapLibreSourceIsLoaded(overlaySource, true)) {
      markFlightGeoSourceUnsettled(map, FLIGHT_GEO_OVERLAY_SOURCE_ID)
      return false
    }
    if (flightGeoSourceAwaitsSuccessfulData(
      map,
      FLIGHT_GEO_OVERLAY_SOURCE_ID,
    )) return false
    const environmentSource = map?.getSource?.(
      FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
    )
    if (!environmentSource) {
      if (overlay.environment) {
        markFlightGeoSourceUnsettled(
          map,
          FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
        )
        return false
      }
      return true
    }
    if (!mapLibreSourceIsLoaded(environmentSource, false)) {
      markFlightGeoSourceUnsettled(map, FLIGHT_GEO_ENVIRONMENT_SOURCE_ID)
      return false
    }
    return !flightGeoSourceAwaitsSuccessfulData(
      map,
      FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
    )
  } catch {
    return false
  }
}
