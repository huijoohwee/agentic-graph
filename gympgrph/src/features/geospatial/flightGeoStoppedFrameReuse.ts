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
  canvasDimensions: readonly [
    bitmapWidth: number,
    bitmapHeight: number,
    cssWidth: number,
    cssHeight: number,
  ]
  cameraSignature: string | null
  environmentPayload: FlightGeoEnvironmentFeatureCollection
  map: any
  overlayPayload: ReturnType<typeof flightGeoOverlayMapLibreFeatureCollection>
  profileId: string
  styleSignature: string
  viewMode: string
}>

function readMapStyleSignature(map: any): string | null {
  try {
    const style = map?.getStyle?.()
    if (!style || typeof style !== 'object') return null
    const signature = JSON.stringify(style)
    return typeof signature === 'string' ? signature : null
  } catch {
    return null
  }
}

function readCanvasDimensions(
  canvas: HTMLCanvasElement,
): FlightGeoStoppedFrameProof['canvasDimensions'] | null {
  try {
    const rect = canvas.getBoundingClientRect()
    const dimensions = [
      Number(canvas.width),
      Number(canvas.height),
      Number(rect.width),
      Number(rect.height),
    ] as const
    return dimensions.every(value => Number.isFinite(value) && value > 0)
      ? dimensions
      : null
  } catch {
    return null
  }
}

export function createFlightGeoStoppedFrameProof(
  map: any,
  canvas: HTMLCanvasElement,
  overlay: FlightGeoOverlaySnapshot,
  cameraSignature: string | null,
  viewMode: string,
): FlightGeoStoppedFrameProof | null {
  if (overlay.phase !== 'stopped') return null
  const canvasDimensions = readCanvasDimensions(canvas)
  const styleSignature = readMapStyleSignature(map)
  if (!canvasDimensions || styleSignature === null) return null
  return Object.freeze({
    canvas,
    canvasDimensions,
    cameraSignature,
    environmentPayload: flightGeoEnvironmentMapLibreFeatureCollection(overlay),
    map,
    overlayPayload: flightGeoOverlayMapLibreFeatureCollection(overlay),
    profileId: overlay.profileId,
    styleSignature,
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
  const canvasDimensions = readCanvasDimensions(canvas)
  const styleSignature = readMapStyleSignature(map)
  if (
    !proof
    || proof.map !== map
    || proof.canvas !== canvas
    || !canvasDimensions
    || styleSignature === null
    || proof.canvasDimensions.some((
      dimension,
      index,
    ) => !Object.is(dimension, canvasDimensions[index]))
    || proof.profileId !== overlay.profileId
    || proof.cameraSignature !== cameraSignature
    || proof.styleSignature !== styleSignature
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
