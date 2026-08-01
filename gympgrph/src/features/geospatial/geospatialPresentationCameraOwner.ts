import { readCityGeoOverlay } from '../../cityGeoOverlay.js'
import { readFlightGeoOverlay } from '../../flightGeoOverlay.js'

export type GeospatialPresentationCameraOwner = 'city' | 'flight' | null

export type GeospatialPresentationCameraFacts = Readonly<{
  cityOverlayActive: boolean
  flightOverlayActive: boolean
  flightOverlayOwner: GeospatialPresentationCameraOwner
  pendingOwner?: GeospatialPresentationCameraOwner
}>

/**
 * Resolves the one presentation allowed to write the shared MapLibre camera.
 * Published overlays are synchronous runtime facts; the React prop is only a
 * pre-publication fallback for the commit that activates a presentation.
 */
export function resolveGeospatialPresentationCameraOwner(
  facts: GeospatialPresentationCameraFacts,
): GeospatialPresentationCameraOwner {
  if (facts.flightOverlayActive && facts.flightOverlayOwner !== null) {
    return facts.flightOverlayOwner
  }
  if (facts.cityOverlayActive) return 'city'
  return facts.pendingOwner ?? null
}

export function readGeospatialPresentationCameraOwner(
  pendingOwner: GeospatialPresentationCameraOwner = null,
): GeospatialPresentationCameraOwner {
  const flightOverlay = readFlightGeoOverlay()
  return resolveGeospatialPresentationCameraOwner({
    cityOverlayActive: readCityGeoOverlay().active,
    flightOverlayActive: flightOverlay.active,
    flightOverlayOwner: flightOverlay.presentationOwner,
    pendingOwner,
  })
}

export function hasGeospatialPresentationCameraClaim(
  pendingOwner: GeospatialPresentationCameraOwner | undefined,
): boolean {
  return pendingOwner !== undefined
    && readGeospatialPresentationCameraOwner(pendingOwner) !== null
}
