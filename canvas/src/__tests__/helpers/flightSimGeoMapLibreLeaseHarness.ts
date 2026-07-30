import type {
  FlightGeoOverlaySnapshot,
} from '../../../../gympgrph/src/flightGeoOverlay.js'

export const flushMicrotasks = () => new Promise<void>(resolve => setImmediate(resolve))
export const applyProviderStyleImmediately = (apply: () => void) => {
  apply(); return () => void 0
}

export function readyFlightOverlay(
  revision: string,
  readyFrameRequestId: number | null,
): FlightGeoOverlaySnapshot {
  return {
    active: true,
    aircraft: {
      coordinate: [103.82, 1.35],
      altitudeMeters: 400,
      headingDegrees: 0,
    },
    camera: {
      centerCoordinate: [103.82, 1.35],
      cockpitClearance: {
        forwardMeters: 2,
        verticalMeters: 1,
      },
      effectiveOwner: 'fixed-follow',
      source: 'fixed-follow',
      timeline: null,
      view: 'chase',
    },
    environment: null,
    night: false,
    objective: {
      bearingDegrees: 45,
      coordinate: [103.83, 1.36],
      distanceMeters: 120,
      headingErrorDegrees: 45,
      id: 'landing',
      kind: 'landing',
      label: 'LAND',
    },
    phase: 'ready',
    profileId: 'singapore',
    readyFrameRequestId,
    revision,
    route: [
      {
        id: 'spawn',
        coordinate: [103.82, 1.35],
        altitudeMeters: 400,
        kind: 'spawn',
        state: 'visited',
      },
      {
        id: 'landing',
        coordinate: [103.83, 1.36],
        altitudeMeters: 0,
        kind: 'landing',
        state: 'active',
      },
    ],
    runId: 1,
    tick: 0,
  }
}

