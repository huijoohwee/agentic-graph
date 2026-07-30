import type {
  FlightGeoOverlayPresentation,
  FlightGeoOverlaySnapshot,
} from '../../flightGeoOverlay.js'
import {
  FLIGHT_GEO_OVERLAY_LAYER_ORDER,
  mapHasExactFlightGeoOverlay,
} from '../../flightGeoOverlayMapLibre.js'
import type {
  FlightGeoMapViewportPadding,
} from '../../flightGeoMapViewport.js'
import {
  FLIGHT_GEO_ENVIRONMENT_LAYER_IDS,
  FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER,
  mapHasExactFlightGeoEnvironment,
} from '../../flightGeoEnvironmentMapLibre.js'

export const FLIGHT_GEO_READY_RENDER_ATTEMPT_LIMIT = 8
export const FLIGHT_GEO_PREPARATION_RENDER_ATTEMPT_LIMIT = 180

export type PresentedFlightOverlay = {
  map: any | null
  readyFrameRequestId: number | null
  revision: string
}

export type SavedMapPadding = Readonly<{
  map: any | null
  padding: FlightGeoMapViewportPadding | null
}>

export type FlightOverlayPresentationGateOptions = Readonly<{
  active: () => boolean
  map: any
  onPresented?: (presentation: FlightGeoOverlayPresentation) => void
  presented: { current: PresentedFlightOverlay }
  readOverlay?: () => FlightGeoOverlaySnapshot
  readRoot: () => HTMLElement | null
  viewMode: string
  isCanvasElement?: (value: unknown) => value is HTMLCanvasElement
}>

export type FlightOverlayPresentationGate = Readonly<{
  cancel: () => void
  canReuseCommittedStoppedFrame: (
    overlay: FlightGeoOverlaySnapshot,
  ) => boolean
  clearCanvas: () => void
  dispose: () => void
  request: (overlay: FlightGeoOverlaySnapshot) => void
  resetPresented: () => void
}>

export function defaultIsCanvasElement(
  value: unknown,
): value is HTMLCanvasElement {
  return (
    typeof HTMLCanvasElement !== 'undefined'
    && value instanceof HTMLCanvasElement
  )
}

export function mapHasExactFlightOverlay(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
): boolean {
  return mapHasExactFlightGeoOverlay(map, overlay)
    && mapHasExactFlightGeoEnvironment(map, overlay)
}

export function mapHasExactFlightLayerState(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
  viewMode: string,
): boolean {
  if (typeof map?.getLayoutProperty !== 'function') return false
  const overlayLayers = FLIGHT_GEO_OVERLAY_LAYER_ORDER
  const expectedTopLayers = overlay.environment
    ? [...FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER, ...overlayLayers]
    : overlayLayers
  const styleLayers = map.getStyle?.()?.layers
  if (!Array.isArray(styleLayers)) return false
  const topLayerIds = styleLayers
    .slice(-expectedTopLayers.length)
    .map((layer: { id?: unknown }) => String(layer?.id || ''))
  if (!expectedTopLayers.every((
    layerId,
    index,
  ) => topLayerIds[index] === layerId)) {
    return false
  }
  const visible = (layerId: string, expected: 'none' | 'visible') => {
    if (!map.getLayer?.(layerId)) return false
    const current = map.getLayoutProperty(layerId, 'visibility')
    return expected === 'visible'
      ? current === undefined || current === null || current === 'visible'
      : current === 'none'
  }
  if (!overlayLayers.every(layerId => visible(layerId, 'visible'))) return false
  if (!overlay.environment) return true
  const mode3d = viewMode === '3d' || viewMode === '3d-modern'
  return visible(
    FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d,
    mode3d ? 'none' : 'visible',
  )
    && visible(
      FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d,
      mode3d ? 'visible' : 'none',
    )
    && visible(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.outline, 'visible')
}
