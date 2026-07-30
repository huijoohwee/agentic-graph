import type { FlightGeoOverlaySnapshot } from '../../flightGeoOverlay.js'
import {
  canInspectFlightGeoOverlayCamera,
  createFlightGeoOverlayMapLibreCamera,
  flightGeoOverlayMapLibreCameraSignature,
  mapHasExactFlightGeoOverlayCamera,
} from '../../flightGeoOverlayMapLibre.js'
import {
  readFlightGeoMapViewportPadding,
  type FlightGeoMapViewportPadding,
} from '../../flightGeoMapViewport.js'

export type FlightGeoOverlayPresentationCamera = Readonly<{
  exact: boolean
  signature: string | null
}>

export function readFlightGeoOverlayPresentationCamera(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
  viewMode: string,
): FlightGeoOverlayPresentationCamera {
  const expected = createFlightGeoOverlayMapLibreCamera(
    overlay,
    viewMode,
    readFlightGeoMapViewportPadding(map),
  )
  return Object.freeze({
    exact: (
      !expected
      || (
        canInspectFlightGeoOverlayCamera(map)
        && mapHasExactFlightGeoOverlayCamera(map, expected)
      )
    ),
    signature: flightGeoOverlayMapLibreCameraSignature(expected),
  })
}

export function readSavedFlightGeoMapPadding(
  map: any,
): FlightGeoMapViewportPadding | null {
  const padding = map?.getPadding?.()
  if (!padding || typeof padding !== 'object') return null
  const bottom = Number(padding.bottom)
  const left = Number(padding.left)
  const right = Number(padding.right)
  const top = Number(padding.top)
  if (![bottom, left, right, top].every(Number.isFinite)) return null
  return Object.freeze({ bottom, left, right, top })
}
