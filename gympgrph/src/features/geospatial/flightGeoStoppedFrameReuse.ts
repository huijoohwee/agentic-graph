import type { FlightGeoOverlaySnapshot } from '../../flightGeoOverlay.js'
import {
  flightGeoEnvironmentMapLibreFeatureCollection,
  hasExactFlightGeoEnvironmentFeatureCollection,
  type FlightGeoEnvironmentFeatureCollection,
} from '../../flightGeoEnvironmentMapLibre.js'
import {
  flightGeoOverlayMapLibreFeatureCollection,
  hasExactFlightGeoOverlayFeatureCollection,
} from '../../flightGeoOverlayMapLibrePayload.js'

/**
 * A stopped Flight frame is eligible to satisfy the first Ready request only
 * when its painted GeoJSON is exactly the Ready payload. Lifecycle fields
 * intentionally stay outside this proof: they do not change any pixels.
 */
export type FlightGeoStoppedFrameProof = Readonly<{
  canvas: HTMLCanvasElement
  cameraSignature: string | null
  environmentPayload: FlightGeoEnvironmentFeatureCollection
  map: any
  overlayPayload: ReturnType<typeof flightGeoOverlayMapLibreFeatureCollection>
  profileId: string
  viewMode: string
}>

export function createFlightGeoStoppedFrameProof(
  map: any,
  canvas: HTMLCanvasElement,
  overlay: FlightGeoOverlaySnapshot,
  cameraSignature: string | null,
  viewMode: string,
): FlightGeoStoppedFrameProof | null {
  if (overlay.phase !== 'stopped') return null
  return Object.freeze({
    canvas,
    cameraSignature,
    environmentPayload: flightGeoEnvironmentMapLibreFeatureCollection(overlay),
    map,
    overlayPayload: flightGeoOverlayMapLibreFeatureCollection(overlay),
    profileId: overlay.profileId,
    viewMode,
  })
}

export function hasEquivalentStoppedFrameVisuals(
  proof: FlightGeoStoppedFrameProof | null,
  map: any,
  canvas: HTMLCanvasElement,
  overlay: FlightGeoOverlaySnapshot,
  cameraSignature: string | null,
  viewMode: string,
): boolean {
  if (
    !proof
    || proof.map !== map
    || proof.canvas !== canvas
    || proof.profileId !== overlay.profileId
    || proof.cameraSignature !== cameraSignature
    || proof.viewMode !== viewMode
  ) return false
  return hasExactFlightGeoOverlayFeatureCollection(
    proof.overlayPayload,
    flightGeoOverlayMapLibreFeatureCollection(overlay),
  ) && hasExactFlightGeoEnvironmentFeatureCollection(
    proof.environmentPayload,
    flightGeoEnvironmentMapLibreFeatureCollection(overlay),
  )
}
