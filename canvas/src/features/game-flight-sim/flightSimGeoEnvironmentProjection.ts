import {
  SINGAPORE_FLIGHT_GEO_REFERENCE,
  projectSingaporeLocalMeters,
  projectSingaporeLocalRectangle,
  type GeospatialCoordinate,
  type GeospatialPresentationBounds,
} from 'grph-shared/geospatial/singaporeFlightGeo'
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
    return projectSingaporeLocalMeters(x, -z)
  })
  return Object.freeze([...ring, ring[0]])
}

function projectStructure(
  structure: XrGreyBoxStructure,
): FlightSimGeoEnvironmentSurface {
  const baseHeightMeters = Math.max(
    0,
    structure.position[1] - structure.size[1] / 2,
  )
  return Object.freeze({
    baseHeightMeters,
    color: TONE_COLORS[structure.tone],
    heightMeters: Math.max(
      baseHeightMeters + 0.08,
      structure.position[1] + structure.size[1] / 2,
    ),
    id: structure.id,
    kind: 'structure',
    ring: projectLocalRectangle({
      centerX: structure.position[0],
      centerZ: structure.position[2],
      depthMeters: structure.size[2],
      widthMeters: structure.size[0],
    }),
  })
}

function projectSubject(
  subject: XrMotionReferenceSubject,
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
    }),
  })
}

export function projectXrEnvironmentToFlightGeo(
  plan: Pick<XrMotionReferencePlan, 'stageId' | 'subjects'>,
): FlightSimGeoEnvironmentProjection {
  const stage = resolveXrMotionReferenceStage(plan.stageId)
  const stageFootprint = projectSingaporeLocalRectangle(
    stage.sizeMeters[0],
    stage.sizeMeters[1],
  )
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
    ...stage.structures.map(projectStructure),
    ...plan.subjects.map(projectSubject),
  ])
  return Object.freeze({
    anchor: SINGAPORE_FLIGHT_GEO_REFERENCE.anchor,
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
