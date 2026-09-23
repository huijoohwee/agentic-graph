import { resolveXrSubjectConstructionBounds } from './xrSubjectAuthoring'
import type { XrMotionReferenceStagePreset, XrMotionReferenceSubject, XrMotionReferenceVector } from './xrMotionReferenceModel'
import { resolveXrSceneLibraryAsset } from './xrSceneLibrary'

const SUBJECT_GAP_METERS = 0.8
export const XR_SUBJECT_STAGE_EDGE_GAP_METERS = 0.6

export type XrSubjectFootprint = Readonly<{
  halfX: number
  halfY: number
  halfZ: number
  sizeMeters: XrMotionReferenceVector
}>

type PositionedSubjectFootprint = Pick<XrSubjectFootprint, 'halfX' | 'halfZ'> & Readonly<{
  position: XrMotionReferenceVector
}>

export function resolveXrSubjectFootprint(
  subject: XrMotionReferenceSubject,
  facingYRadians = 0,
): XrSubjectFootprint {
  const asset = resolveXrSceneLibraryAsset(subject.assetId)
  const radians = subject.rotationYDegrees * Math.PI / 180 + facingYRadians
  const cosine = Math.abs(Math.cos(radians))
  const sine = Math.abs(Math.sin(radians))
  const bounds = subject.construction ? resolveXrSubjectConstructionBounds(subject.construction) : null
  // Collision positions are bottom-origin: Y covers ground to the highest point, not ±height.
  const dimensions = bounds ? [
    2 * Math.max(Math.abs(bounds.max[0]), Math.abs(bounds.min[0])),
    Math.max(0, bounds.max[1]),
    2 * Math.max(Math.abs(bounds.max[2]), Math.abs(bounds.min[2])),
  ] : asset.dimensionsMeters
  const width = dimensions[0] * subject.scale
  const height = dimensions[1] * subject.scale
  const depth = dimensions[2] * subject.scale
  const sizeMeters: XrMotionReferenceVector = [
    cosine * width + sine * depth,
    height,
    sine * width + cosine * depth,
  ]
  return {
    halfX: sizeMeters[0] / 2,
    halfY: sizeMeters[1] / 2,
    halfZ: sizeMeters[2] / 2,
    sizeMeters,
  }
}

export function resolveXrSubjectPlanarRadius(subject: XrMotionReferenceSubject): number {
  const asset = resolveXrSceneLibraryAsset(subject.assetId)
  const bounds = subject.construction ? resolveXrSubjectConstructionBounds(subject.construction) : null
  return bounds ? Math.hypot(Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0])), Math.max(Math.abs(bounds.min[2]), Math.abs(bounds.max[2]))) * subject.scale
    : Math.hypot(asset.dimensionsMeters[0], asset.dimensionsMeters[2]) * subject.scale / 2
}

function positionedSubjectFootprint(subject: XrMotionReferenceSubject): PositionedSubjectFootprint {
  return { ...resolveXrSubjectFootprint(subject), position: subject.position }
}

function footprintsOverlap(
  candidate: PositionedSubjectFootprint,
  existing: PositionedSubjectFootprint,
): boolean {
  return Math.abs(candidate.position[0] - existing.position[0]) < candidate.halfX + existing.halfX + SUBJECT_GAP_METERS
    && Math.abs(candidate.position[2] - existing.position[2]) < candidate.halfZ + existing.halfZ + SUBJECT_GAP_METERS
}

export function resolveNextXrSubjectPlacement(
  stage: XrMotionReferenceStagePreset,
  assetId: string,
  subjects: readonly XrMotionReferenceSubject[],
): XrMotionReferenceVector {
  const asset = resolveXrSceneLibraryAsset(assetId)
  const halfX = asset.dimensionsMeters[0] / 2
  const halfZ = asset.dimensionsMeters[2] / 2
  const maxX = Math.max(0, stage.sizeMeters[0] / 2 - halfX - XR_SUBJECT_STAGE_EDGE_GAP_METERS)
  const maxZ = Math.max(0, stage.sizeMeters[1] / 2 - halfZ - XR_SUBJECT_STAGE_EDGE_GAP_METERS)
  const existing = subjects.map(positionedSubjectFootprint)
  const normalizedAnchors = [
    [-0.28, -0.15],
    [0.28, -0.15],
    [0, 0.28],
    [-0.28, 0.28],
    [0.28, 0.28],
    [0, -0.34],
    [-0.38, 0.04],
    [0.38, 0.04],
    [0, 0],
  ] as const
  const candidates: XrMotionReferenceVector[] = normalizedAnchors.map(([normalizedX, normalizedZ]) => [
    Math.max(-maxX, Math.min(maxX, normalizedX * stage.sizeMeters[0])),
    0,
    Math.max(-maxZ, Math.min(maxZ, normalizedZ * stage.sizeMeters[1])),
  ])
  const xStep = Math.max(1.4, halfX * 2 + SUBJECT_GAP_METERS)
  const zStep = Math.max(1.4, halfZ * 2 + SUBJECT_GAP_METERS)
  for (let z = -maxZ; z <= maxZ + 0.001; z += zStep) {
    for (let x = -maxX; x <= maxX + 0.001; x += xStep) candidates.push([x, 0, z])
  }
  const seen = new Set<string>()
  for (const candidatePosition of candidates) {
    const rounded = candidatePosition.map(value => Number(value.toFixed(3))) as [number, number, number]
    const key = `${rounded[0]}:${rounded[2]}`
    if (seen.has(key)) continue
    seen.add(key)
    const candidate = { halfX, halfZ, position: rounded }
    if (!existing.some(footprint => footprintsOverlap(candidate, footprint))) return rounded
  }
  return [0, 0, 0]
}

export function resolveNextXrSubjectId(
  assetId: string,
  subjects: readonly XrMotionReferenceSubject[],
): string {
  const prefix = `xr-subject:${assetId}:`
  const used = new Set(subjects.map(subject => subject.id))
  let ordinal = 1
  while (used.has(`${prefix}${ordinal}`)) ordinal += 1
  return `${prefix}${ordinal}`
}
