import {
  resolveXrMotionReferenceStage,
  sampleXrMotionReferenceMarks,
  type XrMotionReferenceVector,
} from './xrMotionReferenceModel'
import { resolveXrSceneLibraryAsset } from './xrSceneLibrary'
import type { XrMotionReferenceRuntimeSnapshot } from './xrMotionReferenceRuntimeSnapshot'

export const XR_STUDIO_SCENE_SCHEMA = 'agentic-graph-xr-studio-scene/v1'
const MAX_STRUCTURES = 64
const MAX_RESULTS = 64
const MAX_RADIUS_METERS = 50

export type XrStudioEntity = Readonly<{
  id: string
  kind: 'subject' | 'structure'
  category: string
  label: string
  position: XrMotionReferenceVector
  sizeMeters: XrMotionReferenceVector
}>

export type XrStudioScene = Readonly<{
  schema: typeof XR_STUDIO_SCENE_SCHEMA
  source: 'authored-plan'
  revision: number
  stageId: string
  timeSeconds: number
  complete: boolean
  entities: readonly XrStudioEntity[]
}>

const finiteVector = (value: unknown): value is XrMotionReferenceVector =>
  Array.isArray(value) && value.length === 3 && value.every(item => typeof item === 'number' && Number.isFinite(item))

const planarDistance = (left: XrMotionReferenceVector, right: XrMotionReferenceVector): number =>
  Math.hypot(left[0] - right[0], left[2] - right[2])

/** The scene is a bounded projection of authored XR data, never a measured physical reconstruction. */
export function projectXrStudioScene(runtime: XrMotionReferenceRuntimeSnapshot): XrStudioScene {
  const plan = runtime.plan
  const stage = resolveXrMotionReferenceStage(plan.stageId)
  const timeSeconds = Math.max(0, Math.min(plan.durationSeconds, runtime.playheadSeconds))
  const tracks = new Map(plan.cast.map(track => [track.actorId, track]))
  const subjects: XrStudioEntity[] = plan.subjects.map(subject => {
    const track = tracks.get(subject.id)
    const asset = resolveXrSceneLibraryAsset(subject.assetId)
    return Object.freeze({
      id: subject.id,
      kind: 'subject' as const,
      category: subject.category,
      label: subject.label,
      position: track?.marks.length ? sampleXrMotionReferenceMarks(track.marks, timeSeconds) : subject.position,
      sizeMeters: Object.freeze([
        asset.dimensionsMeters[0] * subject.scale,
        asset.dimensionsMeters[1] * subject.scale,
        asset.dimensionsMeters[2] * subject.scale,
      ]) as XrMotionReferenceVector,
    })
  })
  const structures: XrStudioEntity[] = stage.structures.slice(0, MAX_STRUCTURES).map(structure => Object.freeze({
    id: `stage:${structure.id}`,
    kind: 'structure' as const,
    category: structure.kind || 'structure',
    label: structure.label || structure.id,
    position: structure.position,
    sizeMeters: structure.size,
  }))
  return Object.freeze({
    schema: XR_STUDIO_SCENE_SCHEMA,
    source: 'authored-plan',
    revision: runtime.revision,
    stageId: stage.id,
    timeSeconds,
    complete: stage.structures.length <= MAX_STRUCTURES && subjects.length + structures.length <= MAX_RESULTS,
    entities: Object.freeze([...subjects, ...structures].sort((a, b) => a.id.localeCompare(b.id))),
  })
}

export type XrStudioSceneQuery = Readonly<
  | { kind: 'category'; category: string }
  | { kind: 'nearest'; subjectId: string }
  | { kind: 'within'; center: XrMotionReferenceVector; radiusMeters: number }
>

export type XrStudioSceneQueryResult = Readonly<{
  ok: boolean
  reason?: 'invalid-query' | 'missing-subject' | 'partial-scene'
  sceneRevision: number
  timeSeconds: number
  matches: readonly XrStudioEntity[]
}>

export function queryXrStudioScene(scene: XrStudioScene, query: XrStudioSceneQuery): XrStudioSceneQueryResult {
  const base = { sceneRevision: scene.revision, timeSeconds: scene.timeSeconds }
  if (!scene.complete) return Object.freeze({ ...base, ok: false, reason: 'partial-scene', matches: [] })
  let matches: XrStudioEntity[]
  if (query.kind === 'category') {
    const category = String(query.category || '').trim().toLowerCase()
    if (!category || category.length > 40) return Object.freeze({ ...base, ok: false, reason: 'invalid-query', matches: [] })
    matches = scene.entities.filter(entity => entity.category === category)
  } else if (query.kind === 'nearest') {
    const source = scene.entities.find(entity => entity.kind === 'subject' && entity.id === query.subjectId)
    if (!source) return Object.freeze({ ...base, ok: false, reason: 'missing-subject', matches: [] })
    matches = scene.entities.filter(entity => entity.id !== source.id)
      .sort((a, b) => planarDistance(a.position, source.position) - planarDistance(b.position, source.position) || a.id.localeCompare(b.id))
      .slice(0, 1)
  } else if (query.kind === 'within') {
    if (!finiteVector(query.center) || !Number.isFinite(query.radiusMeters)
      || query.radiusMeters < 0 || query.radiusMeters > MAX_RADIUS_METERS) {
      return Object.freeze({ ...base, ok: false, reason: 'invalid-query', matches: [] })
    }
    matches = scene.entities.filter(entity => planarDistance(entity.position, query.center) <= query.radiusMeters)
  } else {
    return Object.freeze({ ...base, ok: false, reason: 'invalid-query', matches: [] })
  }
  return Object.freeze({ ...base, ok: true, matches: Object.freeze(matches.slice(0, MAX_RESULTS)) })
}
