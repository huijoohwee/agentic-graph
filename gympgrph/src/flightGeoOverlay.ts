import type { Feature, FeatureCollection, LineString, Point } from 'geojson'

export type FlightGeoCoordinate = readonly [longitude: number, latitude: number]

export type FlightGeoRoutePoint = Readonly<{
  id: string
  coordinate: FlightGeoCoordinate
  altitudeMeters: number
  kind: 'spawn' | 'waypoint' | 'landing'
  state: 'active' | 'pending' | 'visited'
}>

export type FlightGeoEnvironmentSurface = Readonly<{
  baseHeightMeters: number
  color: string
  heightMeters: number
  id: string
  kind: 'stage-footprint' | 'structure' | 'subject'
  ring: readonly FlightGeoCoordinate[]
}>

export type FlightGeoEnvironmentProjection = Readonly<{
  anchor: FlightGeoCoordinate
  id: string
  label: string
  presentationBounds: readonly [
    southwest: FlightGeoCoordinate,
    northeast: FlightGeoCoordinate,
  ]
  revision: string
  stageFootprint: readonly FlightGeoCoordinate[]
  surfaces: readonly FlightGeoEnvironmentSurface[]
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
  environment: FlightGeoEnvironmentProjection | null
  night: boolean
  objective: Readonly<{
    bearingDegrees: number
    coordinate: FlightGeoCoordinate
    distanceMeters: number
    headingErrorDegrees: number
    id: string
    kind: 'waypoint' | 'landing'
    label: string
  }> | null
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
  environment: null,
  night: false,
  objective: null,
  phase: 'stopped',
  profileId: '',
  readyFrameRequestId: null,
  revision: 'inactive',
  route: Object.freeze([]),
  runId: 0,
  tick: 0,
})

let snapshot = EMPTY_FLIGHT_GEO_OVERLAY
let readyFramePresented = false
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
  if (!snapshot.active && next.active) readyFramePresented = false
  if (!next.active) readyFramePresented = false
  snapshot = next
  publish()
}

export function clearFlightGeoOverlay(): void {
  readyFramePresented = false
  if (snapshot === EMPTY_FLIGHT_GEO_OVERLAY) return
  snapshot = EMPTY_FLIGHT_GEO_OVERLAY
  publish()
}

export function readFlightGeoOverlayReadyFramePresented(): boolean {
  return snapshot.active && readyFramePresented
}

export function markFlightGeoOverlayReadyFramePresented(
  expectedRevision: string,
  expectedReadyFrameRequestId: number,
): boolean {
  if (
    !snapshot.active
    || snapshot.phase !== 'ready'
    || snapshot.tick !== 0
    || snapshot.readyFrameRequestId !== expectedReadyFrameRequestId
    || snapshot.revision !== expectedRevision
  ) {
    return false
  }
  readyFramePresented = true
  return true
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
  const objectiveGuide: Feature<LineString> | null = overlay.objective
    ? {
        type: 'Feature',
        id: `${overlay.profileId}:objective-guide`,
        geometry: {
          type: 'LineString',
          coordinates: [
            [...overlay.aircraft.coordinate],
            [...overlay.objective.coordinate],
          ],
        },
        properties: {
          kgFlightOverlayKind: 'objective-guide',
          kgFlightObjectiveBearingDegrees:
            overlay.objective.bearingDegrees,
          kgFlightObjectiveDistanceMeters:
            overlay.objective.distanceMeters,
          kgFlightObjectiveHeadingErrorDegrees:
            overlay.objective.headingErrorDegrees,
          kgFlightObjectiveId: overlay.objective.id,
          kgFlightObjectiveKind: overlay.objective.kind,
          kgFlightObjectiveLabel: overlay.objective.label,
          kgFlightNight: overlay.night,
          kgFlightOverlayRevision: overlay.revision,
        },
      }
    : null
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
    features: [
      route,
      ...(objectiveGuide ? [objectiveGuide] : []),
      ...routePoints,
      aircraft,
    ],
  }
}
