import {
  SINGAPORE_FLIGHT_GEO_REFERENCE,
  projectSingaporeLocalMeters,
  type FlightGeoEnvironmentProjection,
  type FlightGeoEnvironmentSurface,
  type GeospatialCoordinate,
} from '@/lib/gympgrph/api'
import type {
  XrMotionReferencePlan,
  XrMotionReferenceSubject,
} from '@/features/three/xrMotionReferenceModel'
import type {
  RegionalPoiProfile,
  RegionalPoiSurface,
} from 'grph-shared/geospatial/regionalPoiGeo'
import {
  resolveRegionalPoiPresentationStyle,
  type RegionalPoiPresentationPolicy,
} from '@/features/geospatial/regionalPoiPresentationStyle'
import {
  resolveXrMotionReferenceStage,
  resolveXrSceneLibraryAsset,
  type XrGreyBoxStructure,
} from '@/features/three/xrSceneLibrary'

const TONE_COLORS: Readonly<Record<XrGreyBoxStructure['tone'], string>> =
  Object.freeze({
    accent: '#22d3ee',
    dark: '#334155',
    light: '#cbd5e1',
    mid: '#64748b',
  })

/**
 * XR environment stages, structures, and subjects use local metres. Regional
 * POI surfaces already carry geographic rings and real-metre heights, so they
 * bypass this local projection entirely.
 */
function projectEnvironmentLocalMetersToGeospatial(
  xMeters: number,
  zMeters: number,
): GeospatialCoordinate {
  return projectSingaporeLocalMeters(xMeters, -zMeters)
}

function projectLocalRectangle(input: Readonly<{
  centerX: number
  centerZ: number
  depthMeters: number
  rotationDegrees?: number
  widthMeters: number
}>): readonly GeospatialCoordinate[] {
  const rotationRadians = (input.rotationDegrees || 0) * Math.PI / 180
  const cosine = Math.cos(rotationRadians)
  const sine = Math.sin(rotationRadians)
  const halfWidth = input.widthMeters / 2
  const halfDepth = input.depthMeters / 2
  const corners = [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ] as const
  const ring = corners.map(([offsetX, offsetZ]) => {
    const x = input.centerX + offsetX * cosine + offsetZ * sine
    const z = input.centerZ - offsetX * sine + offsetZ * cosine
    return projectEnvironmentLocalMetersToGeospatial(x, z)
  })
  return Object.freeze([...ring, ring[0]])
}

function projectStructure(
  structure: XrGreyBoxStructure,
): FlightGeoEnvironmentSurface {
  const baseHeightMeters = Math.max(
    0,
    structure.position[1] - structure.size[1] / 2,
  )
  const heightMeters = Math.max(
    baseHeightMeters + 0.08,
    structure.position[1] + structure.size[1] / 2,
  )
  return Object.freeze({
    baseHeightMeters,
    color: structure.color && /^#[0-9a-f]{6}$/i.test(structure.color)
      ? structure.color
      : TONE_COLORS[structure.tone],
    heightMeters,
    id: structure.id,
    kind: structure.kind === 'poi' ? 'poi' : 'structure',
    label: structure.label || structure.id,
    poiId: structure.poiId || null,
    regionalPoiSourceFacts: null,
    rings: Object.freeze([
      projectLocalRectangle({
        centerX: structure.position[0],
        centerZ: structure.position[2],
        depthMeters: structure.size[2],
        widthMeters: structure.size[0],
      }),
    ]),
  })
}

function projectRegionalPoiSurface(
  surface: RegionalPoiSurface,
  profile: Pick<RegionalPoiProfile, 'id' | 'revision'>,
  policy: RegionalPoiPresentationPolicy,
): FlightGeoEnvironmentSurface {
  const style = resolveRegionalPoiPresentationStyle({
    category: surface.category,
    policy,
    profile,
  })
  return Object.freeze({
    baseHeightMeters: surface.baseHeightMeters,
    color: style.color,
    heightMeters: surface.heightMeters,
    id: surface.id,
    kind: 'poi',
    label: surface.label,
    poiId: surface.poiId,
    regionalPoiSourceFacts: Object.freeze({
      accuracy: surface.accuracy,
      category: surface.category,
      provenance: surface.provenance,
    }),
    rings: Object.freeze(surface.geometry.coordinates.map(ring => (
      Object.freeze(ring.map(coordinate => (
        Object.freeze([...coordinate]) as GeospatialCoordinate
      )))
    ))),
  })
}

function projectSubject(
  subject: XrMotionReferenceSubject,
): FlightGeoEnvironmentSurface {
  const asset = resolveXrSceneLibraryAsset(subject.assetId)
  const scale = Number.isFinite(subject.scale) && subject.scale > 0
    ? subject.scale
    : 1
  const widthMeters = asset.dimensionsMeters[0] * scale
  const heightMeters = asset.dimensionsMeters[1] * scale
  const depthMeters = asset.dimensionsMeters[2] * scale
  const baseHeightMeters = Math.max(0, subject.position[1])
  return Object.freeze({
    baseHeightMeters,
    color: /^#[0-9a-f]{6}$/i.test(subject.color)
      ? subject.color
      : asset.defaultColor,
    heightMeters: baseHeightMeters + heightMeters,
    id: subject.id,
    kind: 'subject',
    label: subject.label,
    poiId: null,
    regionalPoiSourceFacts: null,
    rings: Object.freeze([
      projectLocalRectangle({
        centerX: subject.position[0],
        centerZ: subject.position[2],
        depthMeters,
        rotationDegrees: subject.rotationYDegrees,
        widthMeters,
      }),
    ]),
  })
}

export function projectXrEnvironmentToFlightGeo(
  plan: Pick<XrMotionReferencePlan, 'stageId' | 'subjects'>,
): FlightGeoEnvironmentProjection {
  const stage = resolveXrMotionReferenceStage(plan.stageId)
  const stageFootprint = projectLocalRectangle({
    centerX: 0,
    centerZ: 0,
    depthMeters: stage.sizeMeters[1],
    widthMeters: stage.sizeMeters[0],
  })
  const footprintSurface: FlightGeoEnvironmentSurface = Object.freeze({
    baseHeightMeters: 0,
    color: '#0f766e',
    heightMeters: 0.08,
    id: `${stage.id}:footprint`,
    kind: 'stage-footprint',
    label: `${stage.label} stage footprint`,
    poiId: null,
    regionalPoiSourceFacts: null,
    rings: Object.freeze([stageFootprint]),
  })
  const profile = stage.regionalPoiProfile
  const policy = stage.regionalPoiPresentationPolicy
  if (Boolean(profile) !== Boolean(policy)) {
    throw new TypeError(
      `XR stage ${stage.id} must provide its regional POI profile and presentation policy together`,
    )
  }
  const regionalPoiSurfaces = profile && policy
    ? profile.surfaces.map(surface => (
        projectRegionalPoiSurface(surface, profile, policy)
      ))
    : []
  const localStructures = stage.structures.filter(structure => (
    !profile || structure.kind !== 'poi'
  ))
  const surfaces = Object.freeze([
    footprintSurface,
    ...localStructures.map(projectStructure),
    ...regionalPoiSurfaces,
    ...plan.subjects.map(projectSubject),
  ])
  return Object.freeze({
    anchor: projectSingaporeLocalMeters(0, 0),
    id: stage.id,
    label: stage.label,
    presentationBounds: SINGAPORE_FLIGHT_GEO_REFERENCE.presentationBounds,
    revision: [
      stage.id,
      profile?.id || '',
      profile?.revision || '',
      ...surfaces.map(surface => [
        surface.id,
        surface.kind,
        surface.baseHeightMeters,
        surface.heightMeters,
        surface.color,
        surface.label,
        surface.poiId || '',
        surface.regionalPoiSourceFacts
          ? JSON.stringify(surface.regionalPoiSourceFacts)
          : '',
        ...surface.rings.flatMap(ring => ring.flat()),
      ].join(':')),
    ].join('|'),
    stageFootprint,
    surfaces,
  })
}
