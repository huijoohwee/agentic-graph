import {
  projectLocalMetersToGeospatial,
  type FlightGeoEnvironmentProjection,
  type FlightGeoEnvironmentSurface,
  type GeospatialCoordinate,
} from '@/lib/gympgrph/api'
import type { FlightSimGeographicReference } from './flightSimGeospatialCoordinates'
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
 * bypass this local projection entirely. Authors must choose a stage compatible
 * with the reference; relocating local geometry never relocates those POIs.
 */
function projectEnvironmentLocalMetersToGeospatial(
  xMeters: number,
  zMeters: number,
  reference: FlightSimGeographicReference,
  localLayoutFrame?: FlightGeoEnvironmentProjection['localLayoutFrame'],
): GeospatialCoordinate {
  if (localLayoutFrame) {
    const [[minX, minZ], [maxX, maxZ]] = localLayoutFrame.sourceBoundsMeters
    const [southwest, northeast] = reference.presentationBounds
    const xFraction = maxX > minX ? (xMeters - minX) / (maxX - minX) : 0.5
    const zFraction = maxZ > minZ ? (zMeters - minZ) / (maxZ - minZ) : 0.5
    return Object.freeze([
      southwest[0] + xFraction * (northeast[0] - southwest[0]),
      northeast[1] - zFraction * (northeast[1] - southwest[1]),
    ]) as GeospatialCoordinate
  }
  return projectLocalMetersToGeospatial(xMeters, -zMeters, reference.anchor)
}

function projectLocalRectangle(input: Readonly<{
  centerX: number
  centerZ: number
  depthMeters: number
  rotationDegrees?: number
  widthMeters: number
}>, reference: FlightSimGeographicReference,
localLayoutFrame?: FlightGeoEnvironmentProjection['localLayoutFrame']): readonly GeospatialCoordinate[] {
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
    const rotatedX = offsetX * cosine + offsetZ * sine
    const rotatedZ = -offsetX * sine + offsetZ * cosine
    if (!localLayoutFrame) {
      return projectEnvironmentLocalMetersToGeospatial(
        input.centerX + rotatedX,
        input.centerZ + rotatedZ,
        reference,
      )
    }
    const center = projectEnvironmentLocalMetersToGeospatial(
      input.centerX,
      input.centerZ,
      reference,
      localLayoutFrame,
    )
    // Fit object positions to the region while retaining each footprint's metre size.
    return projectLocalMetersToGeospatial(rotatedX, -rotatedZ, center)
  })
  return Object.freeze([...ring, ring[0]])
}

function projectStructure(
  structure: XrGreyBoxStructure,
  reference: FlightSimGeographicReference,
  localLayoutFrame?: FlightGeoEnvironmentProjection['localLayoutFrame'],
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
      }, reference, localLayoutFrame),
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
  reference: FlightSimGeographicReference,
  localLayoutFrame?: FlightGeoEnvironmentProjection['localLayoutFrame'],
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
      }, reference, localLayoutFrame),
    ]),
  })
}

function deriveLocalLayoutFrame(
  stage: ReturnType<typeof resolveXrMotionReferenceStage>,
  plan: Pick<XrMotionReferencePlan, 'subjects'> & Partial<Pick<XrMotionReferencePlan, 'cast'>>,
): FlightGeoEnvironmentProjection['localLayoutFrame'] {
  const points: Array<readonly [number, number]> = []
  const subjectIds = new Set(plan.subjects.map(subject => subject.id))
  for (const subject of plan.subjects) {
    points.push([subject.position[0], subject.position[2]])
  }
  for (const track of plan.cast || []) {
    if (!subjectIds.has(track.actorId)) continue
    for (const mark of track.marks) points.push([mark.position[0], mark.position[2]])
  }
  for (const structure of stage.structures) {
    if (stage.regionalPoiProfile && structure.kind === 'poi') continue
    const halfWidth = Math.max(0, structure.size[0] / 2)
    const halfDepth = Math.max(0, structure.size[2] / 2)
    points.push(
      [structure.position[0] - halfWidth, structure.position[2] - halfDepth],
      [structure.position[0] + halfWidth, structure.position[2] + halfDepth],
    )
  }
  if (points.length === 0) {
    points.push(
      [-stage.sizeMeters[0] / 2, -stage.sizeMeters[1] / 2],
      [stage.sizeMeters[0] / 2, stage.sizeMeters[1] / 2],
    )
  }
  const xValues = points.map(point => point[0])
  const zValues = points.map(point => point[1])
  return Object.freeze({
    sourceBoundsMeters: Object.freeze([
      Object.freeze([Math.min(...xValues), Math.min(...zValues)] as const),
      Object.freeze([Math.max(...xValues), Math.max(...zValues)] as const),
    ] as const),
  })
}

export function projectXrEnvironmentToFlightGeo(
  plan: Pick<XrMotionReferencePlan, 'stageId' | 'subjects'>
    & Partial<Pick<XrMotionReferencePlan, 'cast'>>,
  reference: FlightSimGeographicReference,
  options: Readonly<{
    fitLocalContentToPresentationBounds?: boolean
    includeSubjectSurfaces?: boolean
  }> = {},
): FlightGeoEnvironmentProjection {
  const stage = resolveXrMotionReferenceStage(plan.stageId)
  const localLayoutFrame = options.fitLocalContentToPresentationBounds
    ? deriveLocalLayoutFrame(stage, plan)
    : undefined
  const stageFootprint = localLayoutFrame
    ? Object.freeze([
      reference.presentationBounds[0],
      Object.freeze([reference.presentationBounds[1][0], reference.presentationBounds[0][1]] as const),
      reference.presentationBounds[1],
      Object.freeze([reference.presentationBounds[0][0], reference.presentationBounds[1][1]] as const),
      reference.presentationBounds[0],
    ])
    : projectLocalRectangle({
      centerX: 0,
      centerZ: 0,
      depthMeters: stage.sizeMeters[1],
      widthMeters: stage.sizeMeters[0],
    }, reference)
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
    ...(localLayoutFrame ? [] : [footprintSurface]),
    ...localStructures.map(structure => projectStructure(structure, reference, localLayoutFrame)),
    ...regionalPoiSurfaces,
    ...(options.includeSubjectSurfaces === false
      ? []
      : plan.subjects.map(subject => projectSubject(subject, reference, localLayoutFrame))),
  ])
  return Object.freeze({
    anchor: reference.anchor,
    id: stage.id,
    label: stage.label,
    ...(localLayoutFrame ? { localLayoutFrame } : {}),
    presentationBounds: reference.presentationBounds,
    revision: [
      stage.id,
      JSON.stringify(reference),
      localLayoutFrame ? JSON.stringify(localLayoutFrame) : '',
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
