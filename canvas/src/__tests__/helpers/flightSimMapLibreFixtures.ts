import type { FlightGeoOverlaySnapshot } from '../../../../gympgrph/src/flightGeoOverlay'

export function flightOverlay(
  headingDegrees = 0,
): FlightGeoOverlaySnapshot {
  return {
    active: true,
    aircraft: {
      coordinate: [103.82, 1.35],
      altitudeMeters: 400,
      headingDegrees,
    },
    camera: {
      centerCoordinate: [103.82, 1.35],
      cockpitClearance: { forwardMeters: 2, verticalMeters: 1 },
      effectiveOwner: 'fixed-follow',
      source: 'fixed-follow',
      timeline: null,
      view: 'chase',
    },
    environment: null,
    night: false,
    objective: null,
    phase: 'ready',
    presentationOwner: 'flight',
    profileId: 'singapore',
    readyFrameRequestId: 1,
    revision: `ready:aircraft:${headingDegrees}`,
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
