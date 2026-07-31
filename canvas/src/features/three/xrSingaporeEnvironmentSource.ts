export type XrSingaporePoiSurfacePresentation =
  | 'observation-wheel'
  | 'skypark'
  | 'supertree'
  | 'tower'

export type XrSingaporePoiSurface = Readonly<{
  collidable: false
  color: string
  id: string
  kind: 'poi'
  label: string
  poiId: XrSingaporeMajorPoiId
  position: readonly [number, number, number]
  presentation: XrSingaporePoiSurfacePresentation
  size: readonly [number, number, number]
  tone: 'light' | 'mid' | 'dark' | 'accent'
}>

export type XrSingaporeMajorPoiId =
  | 'gardens-by-the-bay'
  | 'marina-bay-sands'
  | 'singapore-flyer'

export type XrSingaporeMajorPoi = Readonly<{
  id: XrSingaporeMajorPoiId
  label: string
  surfaces: readonly XrSingaporePoiSurface[]
}>

function surface(
  input: Omit<XrSingaporePoiSurface, 'collidable' | 'kind'>,
): XrSingaporePoiSurface {
  return Object.freeze({
    ...input,
    collidable: false,
    kind: 'poi',
    position: Object.freeze([...input.position]) as readonly [
      number,
      number,
      number,
    ],
    size: Object.freeze([...input.size]) as readonly [
      number,
      number,
      number,
    ],
  })
}

const MARINA_BAY_SANDS = Object.freeze({
  id: 'marina-bay-sands',
  label: 'Marina Bay Sands',
  surfaces: Object.freeze([
    surface({
      color: '#c8d5dd',
      id: 'marina-bay-sands:tower-west',
      label: 'Marina Bay Sands west tower',
      poiId: 'marina-bay-sands',
      position: [-2.25, 1.6, -9.45],
      presentation: 'tower',
      size: [1.42, 3.2, 1.38],
      tone: 'light',
    }),
    surface({
      color: '#d8e2e8',
      id: 'marina-bay-sands:tower-center',
      label: 'Marina Bay Sands center tower',
      poiId: 'marina-bay-sands',
      position: [0, 1.8, -9.55],
      presentation: 'tower',
      size: [1.42, 3.6, 1.38],
      tone: 'light',
    }),
    surface({
      color: '#c8d5dd',
      id: 'marina-bay-sands:tower-east',
      label: 'Marina Bay Sands east tower',
      poiId: 'marina-bay-sands',
      position: [2.25, 1.675, -9.4],
      presentation: 'tower',
      size: [1.42, 3.35, 1.38],
      tone: 'light',
    }),
    surface({
      color: '#eef2e8',
      id: 'marina-bay-sands:skypark',
      label: 'Marina Bay Sands SkyPark',
      poiId: 'marina-bay-sands',
      position: [0, 3.78, -9.46],
      presentation: 'skypark',
      size: [7.2, 0.42, 1.34],
      tone: 'light',
    }),
  ]),
}) satisfies XrSingaporeMajorPoi

const SINGAPORE_FLYER = Object.freeze({
  id: 'singapore-flyer',
  label: 'Singapore Flyer',
  surfaces: Object.freeze([
    surface({
      color: '#eef7f7',
      id: 'singapore-flyer:wheel',
      label: 'Singapore Flyer observation wheel',
      poiId: 'singapore-flyer',
      position: [-8.5, 3.55, -8.75],
      presentation: 'observation-wheel',
      size: [5.1, 5.1, 0.42],
      tone: 'light',
    }),
  ]),
}) satisfies XrSingaporeMajorPoi

const GARDENS_BY_THE_BAY = Object.freeze({
  id: 'gardens-by-the-bay',
  label: 'Gardens by the Bay',
  surfaces: Object.freeze([
    surface({
      color: '#4ea86b',
      id: 'gardens-by-the-bay:supertree-west',
      label: 'Gardens by the Bay west Supertree',
      poiId: 'gardens-by-the-bay',
      position: [6.9, 1.734, -7.35],
      presentation: 'supertree',
      size: [2.754, 3.468, 2.754],
      tone: 'accent',
    }),
    surface({
      color: '#69b578',
      id: 'gardens-by-the-bay:supertree-center',
      label: 'Gardens by the Bay center Supertree',
      poiId: 'gardens-by-the-bay',
      position: [8.8, 1.394, -6.55],
      presentation: 'supertree',
      size: [2.214, 2.788, 2.214],
      tone: 'accent',
    }),
    surface({
      color: '#4ea86b',
      id: 'gardens-by-the-bay:supertree-east',
      label: 'Gardens by the Bay east Supertree',
      poiId: 'gardens-by-the-bay',
      position: [10.2, 1.768, -7.75],
      presentation: 'supertree',
      size: [2.808, 3.536, 2.808],
      tone: 'accent',
    }),
    surface({
      color: '#69b578',
      id: 'gardens-by-the-bay:supertree-north',
      label: 'Gardens by the Bay north Supertree',
      poiId: 'gardens-by-the-bay',
      position: [10.8, 1.156, -5.15],
      presentation: 'supertree',
      size: [1.836, 2.312, 1.836],
      tone: 'accent',
    }),
  ]),
}) satisfies XrSingaporeMajorPoi

export const XR_SINGAPORE_MAJOR_POIS: readonly XrSingaporeMajorPoi[] =
  Object.freeze([
    MARINA_BAY_SANDS,
    SINGAPORE_FLYER,
    GARDENS_BY_THE_BAY,
  ])

export const XR_SINGAPORE_MAJOR_POI_SURFACES: readonly XrSingaporePoiSurface[] =
  Object.freeze(XR_SINGAPORE_MAJOR_POIS.flatMap(poi => poi.surfaces))

export function resolveXrSingaporeMajorPoi(
  poiId: XrSingaporeMajorPoiId,
): XrSingaporeMajorPoi {
  const poi = XR_SINGAPORE_MAJOR_POIS.find(candidate => candidate.id === poiId)
  if (!poi) throw new Error(`Unknown Singapore major POI: ${poiId}`)
  return poi
}
