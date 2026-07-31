import type { FlightGeoOverlaySnapshot } from './flightGeoOverlay.js'
import {
  readGeoMapViewportPadding,
  type GeoMapViewportPadding,
} from './geoMapViewport.js'

const FLIGHT_GEO_CAMERA_PRESETS = Object.freeze({
  chase: Object.freeze({ pitch: 48, zoom: 15.5 }),
  cockpit: Object.freeze({ pitch: 68, zoom: 17 }),
  survey: Object.freeze({ pitch: 22, zoom: 14.25 }),
})

const CAMERA_COMPARISON_EPSILON = 1e-8
const CAMERA_SIGNATURE_DECIMAL_PLACES = Math.round(
  -Math.log10(CAMERA_COMPARISON_EPSILON),
)

export type FlightGeoOverlayCameraApplicationOptions = Readonly<{
  stageStopped?: boolean
}>

export type FlightGeoMapCamera = Readonly<{
  bearing: number
  center: readonly [number, number]
  padding: GeoMapViewportPadding
  pitch: number
  zoom: number
}>

function valuesMatch(left: number, right: number): boolean {
  return Number.isFinite(left)
    && Number.isFinite(right)
    && Math.abs(left - right) <= CAMERA_COMPARISON_EPSILON
}

function anglesMatch(left: number, right: number): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false
  const difference = ((left - right + 540) % 360) - 180
  return Math.abs(difference) <= CAMERA_COMPARISON_EPSILON
}

function cameraSignatureValue(value: number): number {
  // MapLibre may round-trip an already-committed transform through a tiny
  // floating-point delta. Canonicalize at the same precision accepted by the
  // exact camera predicate so a visually unchanged stopped frame can be
  // reused, while larger transforms still require a fresh render.
  const canonical = Number(value.toFixed(CAMERA_SIGNATURE_DECIMAL_PLACES))
  return Object.is(canonical, -0) ? 0 : canonical
}

function cameraAngleSignatureValue(value: number): number {
  const normalized = ((value % 360) + 360) % 360
  // Keep the reuse proof congruent with anglesMatch: bearings within the
  // existing exact-camera tolerance across the 0/360 seam are unchanged.
  if (anglesMatch(normalized, 0)) return 0
  return cameraSignatureValue(normalized)
}

function readCoordinate(value: unknown): readonly [number, number] | null {
  if (Array.isArray(value) && value.length >= 2) {
    const longitude = Number(value[0])
    const latitude = Number(value[1])
    return Number.isFinite(longitude) && Number.isFinite(latitude)
      ? [longitude, latitude]
      : null
  }
  if (!value || typeof value !== 'object') return null
  const candidate = value as { lat?: unknown; lng?: unknown }
  const longitude = Number(candidate.lng)
  const latitude = Number(candidate.lat)
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : null
}

function readPadding(value: unknown): GeoMapViewportPadding | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<GeoMapViewportPadding>
  const bottom = Number(candidate.bottom)
  const left = Number(candidate.left)
  const right = Number(candidate.right)
  const top = Number(candidate.top)
  return [bottom, left, right, top].every(Number.isFinite)
    ? { bottom, left, right, top }
    : null
}

export function createFlightGeoOverlayMapLibreCamera(
  overlay: FlightGeoOverlaySnapshot,
  viewMode: string,
  padding: GeoMapViewportPadding,
): FlightGeoMapCamera | null {
  const mode3d = viewMode === '3d' || viewMode === '3d-modern'
  if (
    overlay.camera.effectiveOwner === 'timeline-playback'
    && overlay.camera.timeline
  ) {
    return Object.freeze({
      bearing: mode3d ? overlay.camera.timeline.bearingDegrees : 0,
      center: [...overlay.camera.timeline.centerCoordinate] as [number, number],
      padding,
      pitch: mode3d
        ? Math.max(22, overlay.camera.timeline.pitchDegrees)
        : 0,
      zoom: overlay.camera.timeline.zoom,
    })
  }
  if (overlay.camera.source !== 'fixed-follow') return null
  const preset = FLIGHT_GEO_CAMERA_PRESETS[overlay.camera.view]
  return Object.freeze({
    bearing: mode3d && overlay.camera.view !== 'survey'
      ? overlay.aircraft.headingDegrees
      : 0,
    center: [...overlay.camera.centerCoordinate] as [number, number],
    padding,
    pitch: mode3d ? preset.pitch : 0,
    zoom: preset.zoom,
  })
}

export function flightGeoOverlayMapLibreCameraSignature(
  camera: FlightGeoMapCamera | null,
): string | null {
  if (!camera) return null
  return JSON.stringify([
    cameraSignatureValue(camera.center[0]),
    cameraSignatureValue(camera.center[1]),
    cameraAngleSignatureValue(camera.bearing),
    cameraSignatureValue(camera.pitch),
    cameraSignatureValue(camera.zoom),
    cameraSignatureValue(camera.padding.top),
    cameraSignatureValue(camera.padding.right),
    cameraSignatureValue(camera.padding.bottom),
    cameraSignatureValue(camera.padding.left),
  ])
}

export function canInspectFlightGeoOverlayCamera(map: any): boolean {
  return (
    typeof map?.getBearing === 'function'
    && typeof map?.getCenter === 'function'
    && typeof map?.getPadding === 'function'
    && typeof map?.getPitch === 'function'
    && typeof map?.getZoom === 'function'
  )
}

export function mapHasExactFlightGeoOverlayCamera(
  map: any,
  expected: FlightGeoMapCamera,
): boolean {
  try {
    if (!canInspectFlightGeoOverlayCamera(map)) return false
    const center = readCoordinate(map.getCenter())
    const padding = readPadding(map.getPadding())
    if (!center || !padding) return false
    return valuesMatch(center[0], expected.center[0])
      && valuesMatch(center[1], expected.center[1])
      && anglesMatch(Number(map.getBearing()), expected.bearing)
      && valuesMatch(Number(map.getPitch()), expected.pitch)
      && valuesMatch(Number(map.getZoom()), expected.zoom)
      && valuesMatch(padding.bottom, expected.padding.bottom)
      && valuesMatch(padding.left, expected.padding.left)
      && valuesMatch(padding.right, expected.padding.right)
      && valuesMatch(padding.top, expected.padding.top)
  } catch {
    return false
  }
}

/**
 * The stopped Flight surface stages the same deterministic tick-zero camera
 * that Ready will use. This lets the ready deadline reuse a settled painter
 * instead of making its first render pay for an avoidable camera transform.
 */
export function applyFlightGeoOverlayCameraToMap(
  map: any,
  overlay: FlightGeoOverlaySnapshot,
  viewMode: string = '3d',
  padding: GeoMapViewportPadding = readGeoMapViewportPadding(map),
  options: FlightGeoOverlayCameraApplicationOptions = {},
): boolean {
  if (typeof map?.jumpTo !== 'function') return false
  if (overlay.phase === 'stopped' && !options.stageStopped) return false
  try {
    const expected = createFlightGeoOverlayMapLibreCamera(
      overlay,
      viewMode,
      padding,
    )
    if (!expected) return false
    if (mapHasExactFlightGeoOverlayCamera(map, expected)) return true
    map.jumpTo(expected)
    return true
  } catch {
    return false
  }
}
