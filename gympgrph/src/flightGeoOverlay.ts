import type { Feature, FeatureCollection, LineString, Point } from 'geojson'

export type FlightGeoCoordinate = readonly [longitude: number, latitude: number]

export type FlightGeoRoutePoint = Readonly<{
  id: string
  coordinate: FlightGeoCoordinate
  altitudeMeters: number
  kind: 'spawn' | 'waypoint' | 'landing'
  state: 'active' | 'pending' | 'visited'
}>

export type FlightGeoOverlaySnapshot = Readonly<{
  active: boolean
  aircraft: Readonly<{
    coordinate: FlightGeoCoordinate
    altitudeMeters: number
    headingDegrees: number
  }>
  camera: Readonly<{
    centerCoordinate: FlightGeoCoordinate
    cockpitClearance: Readonly<{
      forwardMeters: number
      verticalMeters: number
    }>
    effectiveOwner: 'fixed-follow' | 'free-orbit' | 'timeline-playback'
    source: 'fixed-follow' | 'free-orbit'
    timeline: Readonly<{
      bearingDegrees: number
      centerCoordinate: FlightGeoCoordinate
      pitchDegrees: number
      playheadSeconds: number
      zoom: number
    }> | null
    view: 'chase' | 'cockpit' | 'survey'
  }>
  night: boolean
  phase: 'stopped' | 'ready' | 'flying' | 'completed' | 'crashed'
  profileId: string
  readyFrameRequestId: number | null
  revision: string
  route: readonly FlightGeoRoutePoint[]
  runId: number
  tick: number
}>

export type FlightGeoOverlayPresentation = Readonly<{
  phase: FlightGeoOverlaySnapshot['phase']
  profileId: string
  readyFrameRequestId: number | null
  revision: string
  runId: number
  tick: number
}>

type Listener = () => void

const EMPTY_FLIGHT_GEO_OVERLAY: FlightGeoOverlaySnapshot = Object.freeze({
  active: false,
  aircraft: Object.freeze({
    coordinate: Object.freeze([0, 0] as const),
    altitudeMeters: 0,
    headingDegrees: 0,
  }),
  camera: Object.freeze({
    centerCoordinate: Object.freeze([0, 0] as const),
    cockpitClearance: Object.freeze({
      forwardMeters: 0,
      verticalMeters: 0,
    }),
    effectiveOwner: 'fixed-follow',
    source: 'fixed-follow',
    timeline: null,
    view: 'chase',
  }),
  night: false,
  phase: 'stopped',
  profileId: '',
  readyFrameRequestId: null,
  revision: 'inactive',
  route: Object.freeze([]),
  runId: 0,
  tick: 0,
})

let snapshot = EMPTY_FLIGHT_GEO_OVERLAY
const listeners = new Set<Listener>()

function publish(): void {
  for (const listener of listeners) listener()
}

export function readFlightGeoOverlay(): FlightGeoOverlaySnapshot {
  return snapshot
}

export function subscribeFlightGeoOverlay(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setFlightGeoOverlay(next: FlightGeoOverlaySnapshot): void {
  snapshot = next
  publish()
}

export function clearFlightGeoOverlay(): void {
  if (snapshot === EMPTY_FLIGHT_GEO_OVERLAY) return
  snapshot = EMPTY_FLIGHT_GEO_OVERLAY
  publish()
}

export function flightGeoOverlayFeatureCollection(
  overlay: FlightGeoOverlaySnapshot,
): FeatureCollection {
  if (!overlay.active || overlay.route.length < 2) {
    return { type: 'FeatureCollection', features: [] }
  }
  const route: Feature<LineString> = {
    type: 'Feature',
    id: `${overlay.profileId}:route`,
    geometry: {
      type: 'LineString',
      coordinates: overlay.route.map(point => [...point.coordinate]),
    },
    properties: {
      kgFlightOverlayKind: 'route',
      kgFlightNight: overlay.night,
      kgFlightOverlayRevision: overlay.revision,
    },
  }
  const routePoints: Feature<Point>[] = overlay.route.map(point => ({
    type: 'Feature',
    id: point.id,
    geometry: { type: 'Point', coordinates: [...point.coordinate] },
    properties: {
      kgFlightOverlayKind: 'route-point',
      kgFlightRouteKind: point.kind,
      kgFlightRouteState: point.state,
      kgFlightNight: overlay.night,
      kgFlightOverlayRevision: overlay.revision,
      altitudeMeters: point.altitudeMeters,
    },
  }))
  const aircraft: Feature<Point> = {
    type: 'Feature',
    id: `${overlay.profileId}:aircraft`,
    geometry: {
      type: 'Point',
      coordinates: [...overlay.aircraft.coordinate],
    },
    properties: {
      kgFlightOverlayKind: 'aircraft',
      kgFlightNight: overlay.night,
      kgFlightOverlayRevision: overlay.revision,
      altitudeMeters: overlay.aircraft.altitudeMeters,
      headingDegrees: overlay.aircraft.headingDegrees,
    },
  }
  return {
    type: 'FeatureCollection',
    features: [route, ...routePoints, aircraft],
  }
}
