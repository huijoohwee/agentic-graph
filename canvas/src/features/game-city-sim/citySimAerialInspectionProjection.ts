import type {
  FlightSimGeospatialCoordinate,
  FlightSimGeospatialOverlay,
  FlightSimGeospatialRoutePoint,
} from '@/features/game-flight-sim/flightSimGeospatialProjection'
import type { CitySimSnapshot } from './citySimRuntimeState'

const INACTIVE_COORDINATE = Object.freeze([0, 0] as const)

function routePoint(
  coordinate: FlightSimGeospatialCoordinate,
  index: number,
  lastIndex: number,
  profileId: string,
  altitudeMeters: number,
): FlightSimGeospatialRoutePoint {
  return Object.freeze({
    altitudeMeters,
    coordinate,
    id: `${profileId}:route:${index + 1}`,
    kind: index === 0 ? 'spawn' : index === lastIndex ? 'landing' : 'waypoint',
    state: index === 0 ? 'active' : 'pending',
  })
}

export function projectCitySimAerialInspectionToGeospatialOverlay(
  city: CitySimSnapshot,
): FlightSimGeospatialOverlay {
  const geographicProfile = city.geographicProfile
  if (!city.active || !geographicProfile) {
    return Object.freeze({
      active: false,
      aircraft: Object.freeze({
        altitudeMeters: 0,
        coordinate: INACTIVE_COORDINATE,
        headingDegrees: 0,
      }),
      camera: Object.freeze({
        centerCoordinate: INACTIVE_COORDINATE,
        cockpitClearance: Object.freeze({
          forwardMeters: 0,
          verticalMeters: 0,
        }),
        effectiveOwner: 'free-orbit',
        source: 'free-orbit',
        timeline: null,
        view: 'survey',
      }),
      environment: null,
      night: false,
      objective: null,
      phase: 'stopped',
      presentationOwner: null,
      profileId: '',
      readyFrameRequestId: null,
      revision: 'city-inspection:inactive',
      route: Object.freeze([]),
      runId: 0,
      tick: 0,
    })
  }
  const inspection = geographicProfile.aerialInspection
  const profileId = `city-inspection:${geographicProfile.id}`
  const lastRouteIndex = inspection.routeCoordinates.length - 1
  const route = Object.freeze(
    inspection.routeCoordinates.map((coordinate, index) => routePoint(
      coordinate,
      index,
      lastRouteIndex,
      profileId,
      inspection.aircraft.altitudeMeters,
    )),
  )
  return Object.freeze({
    active: true,
    aircraft: inspection.aircraft,
    camera: Object.freeze({
      centerCoordinate: geographicProfile.anchor,
      cockpitClearance: Object.freeze({
        forwardMeters: 0,
        verticalMeters: 0,
      }),
      effectiveOwner: 'free-orbit',
      source: 'free-orbit',
      timeline: null,
      view: 'survey',
    }),
    environment: null,
    night: false,
    objective: null,
    phase: 'stopped',
    presentationOwner: 'city',
    profileId,
    readyFrameRequestId: null,
    revision: [
      profileId,
      inspection.aircraft.coordinate.join(','),
      inspection.aircraft.headingDegrees,
      inspection.aircraft.altitudeMeters,
      inspection.routeCoordinates.map(coordinate => coordinate.join(',')).join(';'),
    ].join(':'),
    route,
    runId: 0,
    tick: 0,
  })
}
