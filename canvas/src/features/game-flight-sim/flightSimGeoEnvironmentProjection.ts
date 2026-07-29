import {
  SINGAPORE_FLIGHT_GEO_REFERENCE,
  type GeospatialCoordinate,
  type GeospatialPresentationBounds,
} from '@/lib/gympgrph/api'
import type { SpatialVector } from '@/features/physics/spatialPhysicsTypes'
import type { FlightSimSpatialProfile } from './flightSimModel'
import {
  projectFlightSimMissionPositionToGeospatial,
} from './flightSimGeospatialCoordinates'
import type {
  XrMotionReferencePlan,
  XrMotionReferenceSubject,
} from '@/features/three/xrMotionReferenceModel'
import {
  resolveXrMotionReferenceStage,
  resolveXrSceneLibraryAsset,
  type XrGreyBoxStructure,
} from '@/features/three/xrSceneLibrary'

export type FlightSimGeoEnvironmentSurface = Readonly<{
  baseHeightMeters: number
  color: string
  heightMeters: number
  id: string
  kind: 'stage-footprint' | 'structure' | 'subject'
  ring: readonly GeospatialCoordinate[]
}>

export type FlightSimGeoEnvironmentProjection = Readonly<{
  anchor: GeospatialCoordinate
  id: string
  label: string
  presentationBounds: GeospatialPresentationBounds
  revision: string
  stageFootprint: readonly GeospatialCoordinate[]
  surfaces: readonly FlightSimGeoEnvironmentSurface[]
}>

const TONE_COLORS: Readonly<Record<XrGreyBoxStructure['tone'], string>> =
  Object.freeze({
    accent: '#22d3ee',
    dark: '#334155',
    light: '#cbd5e1',
    mid: '#64748b',
  })

function projectLocalRectangle(input: Readonly<{
  centerX: number
  centerZ: number
  depthMeters: number
  rotationDegrees?: number
  widthMeters: number
}>, profile: Pick<FlightSimSpatialProfile, 'spawn'>): readonly GeospatialCoordinate[] {
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
    return projectFlightSimMissionPositionToGeospatial(
      Object.freeze([
        x,
        0,
        z,
      ]) as SpatialVector,
      profile.spawn.position,
    )
  })
  return Object.freeze([...ring, ring[0]])
}

function projectStructure(
  structure: XrGreyBoxStructure,
  profile: Pick<FlightSimSpatialProfile, 'spawn'>,
): FlightSimGeoEnvironmentSurface {
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
    color: TONE_COLORS[structure.tone],
    heightMeters,
    id: structure.id,
    kind: 'structure',
    ring: projectLocalRectangle({
      centerX: structure.position[0],
      centerZ: structure.position[2],
      depthMeters: structure.size[2],
      widthMeters: structure.size[0],
    }, profile),
  })
}

function projectSubject(
  subject: XrMotionReferenceSubject,
  profile: Pick<FlightSimSpatialProfile, 'spawn'>,
): FlightSimGeoEnvironmentSurface {
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
    ring: projectLocalRectangle({
      centerX: subject.position[0],
      centerZ: subject.position[2],
      depthMeters,
      rotationDegrees: subject.rotationYDegrees,
      widthMeters,
    }, profile),
  })
}

export function projectXrEnvironmentToFlightGeo(
  plan: Pick<XrMotionReferencePlan, 'stageId' | 'subjects'>,
  profile: Pick<FlightSimSpatialProfile, 'spawn'>,
): FlightSimGeoEnvironmentProjection {
  const stage = resolveXrMotionReferenceStage(plan.stageId)
  const stageFootprint = projectLocalRectangle({
    centerX: 0,
    centerZ: 0,
    depthMeters: stage.sizeMeters[1],
    widthMeters: stage.sizeMeters[0],
  }, profile)
  const footprintSurface: FlightSimGeoEnvironmentSurface = Object.freeze({
    baseHeightMeters: 0,
    color: '#0f766e',
    heightMeters: 0.08,
    id: `${stage.id}:footprint`,
    kind: 'stage-footprint',
    ring: stageFootprint,
  })
  const surfaces = Object.freeze([
    footprintSurface,
    ...stage.structures.map(structure => projectStructure(structure, profile)),
    ...plan.subjects.map(subject => projectSubject(subject, profile)),
  ])
  return Object.freeze({
    anchor: projectFlightSimMissionPositionToGeospatial(
      profile.spawn.position,
      profile.spawn.position,
    ),
    id: stage.id,
    label: stage.label,
    presentationBounds: SINGAPORE_FLIGHT_GEO_REFERENCE.presentationBounds,
    revision: [
      stage.id,
      ...surfaces.map(surface => [
        surface.id,
        surface.kind,
        surface.baseHeightMeters,
        surface.heightMeters,
        surface.color,
        ...surface.ring.flat(),
      ].join(':')),
    ].join('|'),
    stageFootprint,
    surfaces,
  })
}
