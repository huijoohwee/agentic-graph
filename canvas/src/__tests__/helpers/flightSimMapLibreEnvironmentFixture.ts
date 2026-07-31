import { SINGAPORE_MAJOR_POI_GEO_PROFILE } from 'grph-shared/geospatial/singaporeMajorPoiGeo'
import type { FlightGeoOverlaySnapshot } from '../../../../gympgrph/src/flightGeoOverlay'

export function environmentOverlay(): FlightGeoOverlaySnapshot {
  const regionalPoiSurface = SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.find(
    surface => surface.id === 'marina-bay-sands:skypark',
  )
  if (!regionalPoiSurface) throw new Error('Missing canonical SkyPark surface')
  return {
    active: true,
    aircraft: {
      coordinate: [103.851959, 1.29027],
      altitudeMeters: 120,
      headingDegrees: 0,
    },
    camera: {
      centerCoordinate: [103.851959, 1.29027],
      cockpitClearance: { forwardMeters: 2, verticalMeters: 1 },
      effectiveOwner: 'fixed-follow',
      source: 'fixed-follow',
      timeline: null,
      view: 'chase',
    },
    environment: {
      anchor: [103.851959, 1.29027],
      id: 'singapore',
      label: 'Singapore',
      presentationBounds: [[103.605, 1.158], [104.09, 1.48]],
      revision: 'singapore:environment:exact',
      stageFootprint: [
        [103.8518, 1.2901],
        [103.8521, 1.2901],
        [103.8521, 1.2904],
        [103.8518, 1.2904],
        [103.8518, 1.2901],
      ],
      surfaces: [
        {
          baseHeightMeters: 0,
          color: '#15803d',
          heightMeters: 0.2,
          id: 'stage',
          kind: 'stage-footprint',
          label: 'Singapore stage footprint',
          poiId: null,
          regionalPoiSourceFacts: null,
          rings: [
            [
              [103.8518, 1.2901],
              [103.8521, 1.2901],
              [103.8521, 1.2904],
              [103.8518, 1.2904],
              [103.8518, 1.2901],
            ],
            [
              [103.8519, 1.2902],
              [103.852, 1.2902],
              [103.852, 1.2903],
              [103.8519, 1.2903],
              [103.8519, 1.2902],
            ],
          ],
        },
        {
          baseHeightMeters: 0.5,
          color: '#f59e0b',
          heightMeters: 12.5,
          id: 'helicopter',
          kind: 'subject',
          label: 'Helicopter',
          poiId: null,
          regionalPoiSourceFacts: null,
          rings: [[
            [103.85194, 1.29025],
            [103.85198, 1.29025],
            [103.85198, 1.29029],
            [103.85194, 1.29029],
            [103.85194, 1.29025],
          ]],
        },
        {
          baseHeightMeters: regionalPoiSurface.baseHeightMeters,
          color: '#eef2e8',
          heightMeters: regionalPoiSurface.heightMeters,
          id: regionalPoiSurface.id,
          kind: 'poi',
          label: regionalPoiSurface.label,
          poiId: regionalPoiSurface.poiId,
          regionalPoiSourceFacts: {
            accuracy: regionalPoiSurface.accuracy,
            category: regionalPoiSurface.category,
            provenance: regionalPoiSurface.provenance,
          },
          rings: regionalPoiSurface.geometry.coordinates,
        },
      ],
    },
    night: false,
    objective: null,
    phase: 'ready',
    presentationOwner: 'flight',
    profileId: 'singapore',
    readyFrameRequestId: 1,
    revision: 'ready:singapore:environment:exact',
    route: [],
    runId: 1,
    tick: 0,
  }
}
