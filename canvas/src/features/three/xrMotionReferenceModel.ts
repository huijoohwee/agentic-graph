import type { GraphData, GraphNode, JSONValue } from '@/lib/graph/types'
import { resolveCameraFramingPose, type CameraFramingPose } from '@/lib/camera/cameraFramingPose'
import {
  readStrybldrCameraSettings,
  serializeStrybldrCameraSettings,
  type StrybldrCameraSettings,
} from '@/features/strybldr/strybldrCamera'
import {
  buildXrAnimationActionPath,
  isXrAnimationPresetId,
  resolveXrAnimationPreset,
  xrAnimationPresetCompatible,
  type XrAnimationAssignment,
} from '@/features/three/xrAnimationCatalog'
import {
  XR_MOTION_REFERENCE_DEFAULT_STAGE_ID,
  XR_MOTION_REFERENCE_STAGE_PRESETS,
  isXrSceneLibraryAssetId,
  resolveXrMotionReferenceStage,
  resolveXrSceneLibraryAsset,
  type XrMotionReferenceStageId,
  type XrMotionReferenceVector,
} from '@/features/three/xrSceneLibrary'
import {
  defaultXrCameraEasing,
  defaultXrChoreographyGait,
  readXrChoreographyEasing,
  readXrChoreographyGait,
  type XrChoreographyEasing,
  type XrChoreographyGait,
} from './xrChoreographyEasing'
import { readXrCameraMoveId, type XrCameraMoveId } from './xrCameraMoveCatalog'
import {
  XR_MOTION_REFERENCE_CAMERA_BASELINE_METERS,
  sampleXrMotionReferenceCameraMoveId,
  sampleXrMotionReferenceCameraPose,
  sampleXrMotionReferenceCameraRig,
  sampleXrMotionReferenceCameraSettings,
  sampleXrMotionReferenceFacingY,
  sampleXrMotionReferenceMarks,
} from './xrMotionReferenceSampling'

export {
  XR_MOTION_REFERENCE_DEFAULT_STAGE_ID,
  XR_MOTION_REFERENCE_STAGE_PRESETS,
  XR_MOTION_REFERENCE_TERRAIN_PRESETS,
  resolveXrMotionReferenceStage,
} from '@/features/three/xrSceneLibrary'
export type {
  XrGreyBoxStructure,
  XrMotionReferenceStageId,
  XrMotionReferenceStagePreset,
  XrMotionReferenceVector,
} from '@/features/three/xrSceneLibrary'
export {
  XR_CHOREOGRAPHY_EASINGS,
  XR_CHOREOGRAPHY_GAITS,
} from './xrChoreographyEasing'
export type { XrChoreographyEasing, XrChoreographyGait } from './xrChoreographyEasing'
export {
  XR_MOTION_REFERENCE_CAMERA_BASELINE_METERS,
  sampleXrMotionReferenceCameraMoveId,
  sampleXrMotionReferenceCameraPose,
  sampleXrMotionReferenceCameraRig,
  sampleXrMotionReferenceCameraSettings,
  sampleXrMotionReferenceFacingY,
  sampleXrMotionReferenceMarks,
} from './xrMotionReferenceSampling'

export const XR_MOTION_REFERENCE_GRAPH_METADATA_KEY = 'kgXrMotionReference'
export const XR_MOTION_REFERENCE_SCHEMA = 'knowgrph-xr-motion-reference/v1'
export const XR_MOTION_REFERENCE_PACKAGE_SCHEMA = 'knowgrph-xr-motion-reference-package/v1'
export const XR_MOTION_REFERENCE_CAMERA_RIGS = ['dolly', 'steadicam', 'handheld', 'crane', 'drone', 'car-mount'] as const
export const XR_MOTION_REFERENCE_SELECTION_COLOR = '#facc15'

export type XrMotionReferenceTransition = 'linear' | 'hold'
export type XrMotionReferenceCameraRig = (typeof XR_MOTION_REFERENCE_CAMERA_RIGS)[number]

export type XrMotionReferenceMark = Readonly<{
  id: string
  timeSeconds: number
  position: XrMotionReferenceVector
  transition: XrChoreographyEasing
  gait: XrChoreographyGait
}>

export type XrMotionReferenceCastTrack = Readonly<{
  actorId: string
  label: string
  color: string
  animation: XrAnimationAssignment | null
  marks: readonly XrMotionReferenceMark[]
}>

export type XrMotionReferenceCameraMark = Readonly<{
  id: string
  timeSeconds: number
  anchorId: string
  moveId: XrCameraMoveId
  rig: XrMotionReferenceCameraRig
  easing: XrChoreographyEasing
  settings: Readonly<StrybldrCameraSettings>
  pose: CameraFramingPose
}>

export type XrMotionReferenceSubject = Readonly<{
  id: string
  assetId: string
  category: 'people' | 'animals' | 'vehicles' | 'furniture' | 'props'
  label: string
  color: string
  position: XrMotionReferenceVector
  rotationYDegrees: number
  scale: number
}>

export type XrMotionReferencePlan = Readonly<{
  schema: typeof XR_MOTION_REFERENCE_SCHEMA
  stageId: XrMotionReferenceStageId
  durationSeconds: number
  fps: number
  subjects: readonly XrMotionReferenceSubject[]
  cast: readonly XrMotionReferenceCastTrack[]
  camera: readonly XrMotionReferenceCameraMark[]
}>

export type XrMotionReferencePackageFile = Readonly<{
  path: string
  mimeType: string
  text: string
}>

export type XrMotionReferencePackage = Readonly<{
  schema: typeof XR_MOTION_REFERENCE_PACKAGE_SCHEMA
  packageId: string
  title: string
  referenceBoundary: Readonly<{
    implementation: 'native-knowgrph'
    inspirationCitation: 'documentation-only'
    copyPolicy: 'no-external-code-assets-or-schemas'
    dependencyPolicy: 'no-external-runtime'
    runtimeDependency: false
  }>
  source: Readonly<{
    documentName: string
    graphFingerprint: string
    motionFingerprint: string
    graphType: string
    nodeCount: number
    edgeCount: number
  }>
  stage: Readonly<{
    id: XrMotionReferenceStageId
    label: string
    sizeMeters: readonly [number, number]
  }>
  timeline: Readonly<{
    durationSeconds: number
    fps: number
    frameCount: number
  }>
  files: readonly XrMotionReferencePackageFile[]
}>

export const XR_MOTION_REFERENCE_MAX_CAST_TRACKS = 12
export const XR_MOTION_REFERENCE_MAX_SUBJECTS = 48
export const XR_MOTION_REFERENCE_MAX_CAST_MARKS = 32
export const XR_MOTION_REFERENCE_MAX_CAMERA_MARKS = 32
export const XR_MOTION_REFERENCE_MAX_COORDINATE_METERS = 50
const MIN_DURATION_SECONDS = 1
const MAX_DURATION_SECONDS = 30
const MIN_FPS = 6
const MAX_FPS = 30

const CAST_COLORS = [
  '#38bdf8', '#f97316', '#a78bfa', '#22c55e', '#f43f5e', '#eab308',
  '#14b8a6', '#ec4899', '#60a5fa', '#84cc16', '#fb7185', '#c084fc',
] as const

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function round(value: number, places = 4): number {
  const scale = 10 ** places
  return Math.round(value * scale) / scale
}

function normalizeDuration(value: unknown): number {
  return round(clamp(finiteNumber(value, 6), MIN_DURATION_SECONDS, MAX_DURATION_SECONDS), 2)
}

function normalizeFps(value: unknown): number {
  return Math.round(clamp(finiteNumber(value, 12), MIN_FPS, MAX_FPS))
}

function normalizeTime(value: unknown, durationSeconds: number): number {
  return round(clamp(finiteNumber(value, 0), 0, durationSeconds), 3)
}

function normalizeVector(value: unknown, fallback: XrMotionReferenceVector = [0, 0, 0]): XrMotionReferenceVector {
  if (!Array.isArray(value) || value.length < 3) return Object.freeze([...fallback]) as unknown as XrMotionReferenceVector
  return Object.freeze([
    round(clamp(finiteNumber(value[0], fallback[0]), -XR_MOTION_REFERENCE_MAX_COORDINATE_METERS, XR_MOTION_REFERENCE_MAX_COORDINATE_METERS)),
    round(clamp(finiteNumber(value[1], fallback[1]), 0, XR_MOTION_REFERENCE_MAX_COORDINATE_METERS)),
    round(clamp(finiteNumber(value[2], fallback[2]), -XR_MOTION_REFERENCE_MAX_COORDINATE_METERS, XR_MOTION_REFERENCE_MAX_COORDINATE_METERS)),
  ]) as unknown as XrMotionReferenceVector
}

function normalizeStageId(value: unknown): XrMotionReferenceStageId {
  const id = String(value || '').trim()
  return XR_MOTION_REFERENCE_STAGE_PRESETS.some(preset => preset.id === id)
    ? id as XrMotionReferenceStageId
    : XR_MOTION_REFERENCE_DEFAULT_STAGE_ID
}

function normalizeAnimationAssignment(
  value: unknown,
  durationSeconds: number,
  subject: XrMotionReferenceSubject | null,
): XrAnimationAssignment | null {
  const record = asRecord(value)
  if (!isXrAnimationPresetId(record.presetId)) return null
  const preset = resolveXrAnimationPreset(record.presetId)
  if (!xrAnimationPresetCompatible({
    preset,
    assetId: subject?.assetId,
    category: subject?.category,
    graphActor: !subject,
  })) return null
  const timing = {
    startTimeSeconds: normalizeTime(record.startTimeSeconds, durationSeconds),
    loop: typeof record.loop === 'boolean' ? record.loop : preset.loop,
  }
  return preset.kind === 'action-path'
    ? Object.freeze({ ...timing, kind: preset.kind, presetId: preset.id })
    : Object.freeze({ ...timing, kind: preset.kind, presetId: preset.id })
}

function normalizeCameraRig(value: unknown): XrMotionReferenceCameraRig {
  const normalized = String(value || '').trim().toLowerCase()
  return XR_MOTION_REFERENCE_CAMERA_RIGS.includes(normalized as XrMotionReferenceCameraRig)
    ? normalized as XrMotionReferenceCameraRig
    : 'dolly'
}

function defaultActorPosition(index: number): XrMotionReferenceVector {
  const column = index % 4
  const row = Math.floor(index / 4)
  return [round((column - 1.5) * 2.4), 0, round((row - 0.5) * 2.8)]
}

function stableMarkId(prefix: string, timeSeconds: number): string {
  return `${prefix}:${Math.round(timeSeconds * 1000)}`
}

function boundedSourceWithLatest(value: unknown, max: number): unknown[] {
  const source = Array.isArray(value) ? value : []
  return source.length > max ? [...source.slice(0, max), source[source.length - 1]] : source
}

function normalizeMarks(
  value: unknown,
  actorId: string,
  durationSeconds: number,
  fallbackPosition: XrMotionReferenceVector,
  defaultGait: XrChoreographyGait = 'walk',
): readonly XrMotionReferenceMark[] {
  const source = boundedSourceWithLatest(value, XR_MOTION_REFERENCE_MAX_CAST_MARKS)
  const marks = source.map((item, index) => {
    const record = asRecord(item)
    const timeSeconds = normalizeTime(record.timeSeconds, durationSeconds)
    return Object.freeze({
      id: stableMarkId(`cast:${actorId}`, timeSeconds),
      timeSeconds,
      position: normalizeVector(record.position, fallbackPosition),
      transition: readXrChoreographyEasing(record.easing ?? record.transition),
      gait: readXrChoreographyGait(record.gait, defaultGait),
      index,
    })
  })
  if (marks.length === 0) {
    marks.push(Object.freeze({
      id: stableMarkId(`cast:${actorId}`, 0),
      timeSeconds: 0,
      position: fallbackPosition,
      transition: 'linear' as const,
      gait: defaultGait,
      index: 0,
    }))
  }
  const byTime = new Map<number, (typeof marks)[number]>()
  marks.forEach(mark => byTime.set(mark.timeSeconds, mark))
  return Object.freeze([...byTime.values()]
    .sort((left, right) => left.timeSeconds - right.timeSeconds || left.index - right.index)
    .slice(0, XR_MOTION_REFERENCE_MAX_CAST_MARKS)
    .map(({ index: _index, ...mark }) => Object.freeze(mark)))
}

function normalizeCameraMarks(
  value: unknown,
  durationSeconds: number,
  cast: readonly XrMotionReferenceCastTrack[],
  subjects: readonly XrMotionReferenceSubject[],
): readonly XrMotionReferenceCameraMark[] {
  const source = boundedSourceWithLatest(value, XR_MOTION_REFERENCE_MAX_CAMERA_MARKS)
  const marks = source.map((item, index) => {
    const record = asRecord(item)
    const timeSeconds = normalizeTime(record.timeSeconds, durationSeconds)
    const anchorId = String(record.anchorId || '').trim()
    const anchorTrack = cast.find(track => track.actorId === anchorId)
    const anchorSubject = subjects.find(subject => subject.id === anchorId)
    const target = anchorTrack
      ? sampleXrMotionReferenceMarks(anchorTrack.marks, timeSeconds)
      : anchorSubject?.position || [0, 0, 0] as const
    const settings = Object.freeze(readStrybldrCameraSettings(record.settings))
    const rig = normalizeCameraRig(record.rig)
    return {
      id: stableMarkId('camera', timeSeconds),
      timeSeconds,
      anchorId,
      moveId: readXrCameraMoveId(record.moveId),
      rig,
      easing: readXrChoreographyEasing(record.easing || defaultXrCameraEasing(rig)),
      settings,
      pose: resolveCameraFramingPose({ settings, target, baseDistance: XR_MOTION_REFERENCE_CAMERA_BASELINE_METERS }),
      index,
    }
  })
  const byTime = new Map<number, (typeof marks)[number]>()
  marks.forEach(mark => byTime.set(mark.timeSeconds, mark))
  return Object.freeze([...byTime.values()]
    .sort((left, right) => left.timeSeconds - right.timeSeconds || left.index - right.index)
    .slice(0, XR_MOTION_REFERENCE_MAX_CAMERA_MARKS)
    .map(({ index: _index, ...mark }) => Object.freeze(mark)))
}

function resolveCast(
  nodes: readonly GraphNode[],
  value: unknown,
  durationSeconds: number,
  subjects: readonly XrMotionReferenceSubject[],
): readonly XrMotionReferenceCastTrack[] {
  const savedRecords = (Array.isArray(value) ? value : [])
    .map(item => asRecord(item))
    .filter(item => String(item.actorId || '').trim())
  const savedById = new Map(savedRecords.map(item => [String(item.actorId || '').trim(), item] as const))
  const graphActors = nodes.map(node => ({
    actorId: String(node.id || '').trim(),
    label: String(node.label || '').trim(),
  }))
  const graphActorIds = new Set(graphActors.map(actor => actor.actorId))
  const savedActors = savedRecords
    .map(saved => ({ actorId: String(saved.actorId || '').trim(), label: String(saved.label || '').trim() }))
    .filter(actor => actor.actorId && !graphActorIds.has(actor.actorId) && subjects.some(subject => subject.id === actor.actorId))
  return Object.freeze([...graphActors, ...savedActors].slice(0, XR_MOTION_REFERENCE_MAX_CAST_TRACKS).map((actor, index) => {
    const actorId = actor.actorId || `actor-${index + 1}`
    const saved = savedById.get(actorId) || {}
    const fallbackPosition = defaultActorPosition(index)
    const subject = subjects.find(candidate => candidate.id === actorId) || null
    return Object.freeze({
      actorId,
      label: String(actor.label || saved.label || actorId).trim().slice(0, 80) || actorId,
      color: CAST_COLORS[index % CAST_COLORS.length],
      animation: normalizeAnimationAssignment(saved.animation, durationSeconds, subject),
      marks: normalizeMarks(saved.marks, actorId, durationSeconds, fallbackPosition, defaultXrChoreographyGait(subject?.category)),
    })
  }))
}

function normalizeSubjects(value: unknown): readonly XrMotionReferenceSubject[] {
  const byId = new Map<string, XrMotionReferenceSubject>()
  const source = Array.isArray(value) ? value.slice(0, XR_MOTION_REFERENCE_MAX_SUBJECTS) : []
  source.forEach((item, index) => {
    const record = asRecord(item)
    if (!isXrSceneLibraryAssetId(record.assetId)) return
    const asset = resolveXrSceneLibraryAsset(String(record.assetId || ''))
    const id = String(record.id || '').trim().slice(0, 96) || `xr-subject:${asset.id}:${index + 1}`
    const rawColor = String(record.color || '').trim()
    byId.set(id, Object.freeze({
      id,
      assetId: asset.id,
      category: asset.category,
      label: String(record.label || asset.label).trim().slice(0, 80) || asset.label,
      color: /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor.toLowerCase() : asset.defaultColor,
      position: normalizeVector(record.position),
      rotationYDegrees: round(clamp(finiteNumber(record.rotationYDegrees, 0), -180, 180), 2),
      scale: round(clamp(finiteNumber(record.scale, 1), 0.25, 4), 3),
    }))
  })
  return Object.freeze([...byId.values()])
}

export function readXrMotionReferencePlan(value: unknown, nodes: readonly GraphNode[] = []): XrMotionReferencePlan {
  const record = asRecord(value)
  const stageId = normalizeStageId(record.stageId)
  const durationSeconds = normalizeDuration(record.durationSeconds)
  const subjects = normalizeSubjects(record.subjects)
  const sourceCast = resolveCast(nodes, record.cast, durationSeconds, subjects)
  const stage = resolveXrMotionReferenceStage(stageId)
  const cast = Object.freeze(sourceCast.map(track => {
    if (track.animation?.kind !== 'action-path') return track
    const generatedMarks = buildXrAnimationActionPath({
      presetId: track.animation.presetId,
      durationSeconds,
      origin: track.marks[0]?.position || [0, 0, 0],
      stageSizeMeters: stage.sizeMeters,
    })
    const materializedMarksMatch = track.marks.length === generatedMarks.length
      && track.marks.every((mark, index) => mark.timeSeconds === generatedMarks[index]?.timeSeconds)
    const marks = materializedMarksMatch
      ? track.marks
      : normalizeMarks(generatedMarks, track.actorId, durationSeconds, generatedMarks[0]?.position || [0, 0, 0])
    return Object.freeze({
      ...track,
      marks,
    })
  }))
  return Object.freeze({
    schema: XR_MOTION_REFERENCE_SCHEMA,
    stageId,
    durationSeconds,
    fps: normalizeFps(record.fps),
    subjects,
    cast,
    camera: normalizeCameraMarks(record.camera, durationSeconds, cast, subjects),
  })
}

export function xrMotionReferenceSceneKey(documentName: string, graphData: GraphData | null): string {
  const metadata = graphData?.metadata && typeof graphData.metadata === 'object' && !Array.isArray(graphData.metadata)
    ? graphData.metadata as Record<string, unknown>
    : {}
  const sourceIdentity = ['documentId', 'graphId', 'canonicalPath', 'documentPath', 'sourcePath', 'source']
    .map(key => String(metadata[key] || '').trim())
    .find(Boolean) || 'local'
  return `${String(documentName || 'Untitled')}|${graphData?.type || 'Graph'}|${sourceIdentity}`
}

export function serializeXrMotionReferencePlan(plan: XrMotionReferencePlan): JSONValue {
  return {
    schema: XR_MOTION_REFERENCE_SCHEMA,
    stageId: plan.stageId,
    durationSeconds: plan.durationSeconds,
    fps: plan.fps,
    subjects: plan.subjects.map(subject => ({
      id: subject.id,
      assetId: subject.assetId,
      label: subject.label,
      color: subject.color,
      position: [...subject.position],
      rotationYDegrees: subject.rotationYDegrees,
      scale: subject.scale,
    })),
    cast: plan.cast.map(track => ({
      actorId: track.actorId,
      label: track.label,
      animation: track.animation ? {
        kind: track.animation.kind,
        presetId: track.animation.presetId,
        startTimeSeconds: track.animation.startTimeSeconds,
        loop: track.animation.loop,
      } : null,
      marks: track.marks.map(mark => ({
        timeSeconds: mark.timeSeconds,
        position: [...mark.position],
        transition: mark.transition,
        gait: mark.gait,
      })),
    })),
    camera: plan.camera.map(mark => ({
      timeSeconds: mark.timeSeconds,
      anchorId: mark.anchorId,
      moveId: mark.moveId,
      rig: mark.rig,
      easing: mark.easing,
      settings: serializeStrybldrCameraSettings(mark.settings),
    })),
  } as JSONValue
}
