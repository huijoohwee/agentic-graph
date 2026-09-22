import * as THREE from 'three'
import { ProceduralAssetSession } from '@/features/image-to-glb/proceduralAssetSession'
import { parseProceduralAssetRecipe, updateProceduralAssetControl, type AssetPart, type ProceduralAssetRecipe } from '@/features/image-to-glb/proceduralAssetContract'
import type { XrMotionReferenceRuntimeSnapshot } from './xrMotionReferenceRuntimeSnapshot'

/** Editable projection with native control values applied. */
export function readXrSubjectPart(recipe: ProceduralAssetRecipe, partId: string): AssetPart {
  const source = parseProceduralAssetRecipe(recipe), part = source.parts.find(item => item.id === partId)
  if (!part) throw new Error('Procedural asset: missing subject part')
  for (const control of source.controls.filter(item => item.partId === partId)) {
    const axis = ['width', 'height', 'depth'].indexOf(control.target), value = source.values[control.id]
    if (axis >= 0) part.size[axis] = value as number
    else if (control.target === 'color') part.color = value as string
    else if (control.target === 'visible') part.visible = value as boolean
  }
  return part
}

export function editXrSubjectPart(recipe: ProceduralAssetRecipe, partId: string, patch: Partial<Omit<AssetPart, 'id'>>): ProceduralAssetRecipe {
  const source = parseProceduralAssetRecipe(recipe), index = source.parts.findIndex(item => item.id === partId)
  if (index < 0) throw new Error('Procedural asset: missing subject part')
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Reflect.ownKeys(patch).some(key =>
    !['parentId', 'primitive', 'position', 'rotation', 'size', 'pivot', 'color', 'visible'].includes(String(key)))) throw new Error('Procedural asset: unsupported part patch field')
  let next = parseProceduralAssetRecipe({ ...source, parts: source.parts.map((part, i) => i === index ? { ...part, ...patch } : part) })
  const edited = next.parts[index], original = source.parts[index]
  for (const control of source.controls.filter(item => item.partId === partId)) {
    const axis = ['width', 'height', 'depth'].indexOf(control.target)
    if (axis >= 0 && Object.hasOwn(patch, 'size')) {
      next = updateProceduralAssetControl(next, control.id, edited.size[axis])
      next.parts[index].size[axis] = original.size[axis]
    } else if (control.target === 'color' && Object.hasOwn(patch, 'color')) {
      next = updateProceduralAssetControl(next, control.id, edited.color)
      next.parts[index].color = original.color
    } else if (control.target === 'visible' && Object.hasOwn(patch, 'visible')) {
      next = updateProceduralAssetControl(next, control.id, edited.visible)
      next.parts[index].visible = original.visible
    }
  }
  return parseProceduralAssetRecipe(next)
}

export type XrSubjectDraftContext = Readonly<{
  documentName: string
  documentText: string
  sceneKey: string
  sourceSignature: string
  plan: XrMotionReferenceRuntimeSnapshot['plan']
  subjectId: string
  selectedSubjectId: string
  selectedPartId: string
  selectedPart: XrMotionReferenceRuntimeSnapshot['selectedSubjectPart']
}>

/** References existing authored state; transport revisions are deliberately excluded. */
export function captureXrSubjectDraftContext(
  document: Readonly<{ markdownDocumentName?: string | null; markdownDocumentText?: string | null }>,
  runtime: XrMotionReferenceRuntimeSnapshot,
  subjectId: string,
): XrSubjectDraftContext {
  return Object.freeze({ documentName: document.markdownDocumentName || '', documentText: document.markdownDocumentText || '',
    sceneKey: runtime.sceneKey, sourceSignature: runtime.sourceSignature, plan: runtime.plan,
    subjectId, selectedSubjectId: runtime.selectedShotTargetId, selectedPartId: runtime.selectedSubjectPart?.partId || '',
    selectedPart: runtime.selectedSubjectPart ?? null })
}

export function isXrSubjectDraftCurrent(draft: XrSubjectDraftContext, current: XrSubjectDraftContext): boolean {
  return Boolean(draft.documentName && draft.documentText && draft.sceneKey
    && draft.documentName === current.documentName && draft.documentText === current.documentText
    && draft.sceneKey === current.sceneKey && draft.sourceSignature === current.sourceSignature
    && draft.plan === current.plan && draft.subjectId === current.subjectId
    && draft.selectedPartId === current.selectedPartId && draft.selectedPart === current.selectedPart
    && draft.selectedSubjectId === draft.subjectId && current.selectedSubjectId === draft.subjectId
    && current.plan.subjects.some(subject => subject.id === draft.subjectId))
}

/** References the native document/companions; derived bounds never become a second recipe. */
export type XrSubjectConstruction = Readonly<{
  proceduralAssetDocument: string
  proceduralAssetManifestPath: string
  proceduralAssetWorkspaceParent: string
  proceduralAssetSourcePath: string
  playback?: Readonly<{ clipId: string | null; loop: boolean }>
}>
// Float32 mesh bounds can differ from the authored ground plane by sub-micrometer rounding.
export const XR_SUBJECT_GROUND_EPSILON_METERS = 1e-6
const constructionBounds = new Map<string, Readonly<{ min: readonly number[]; max: readonly number[]; parts: readonly string[]; clips: readonly { id: string; duration: number }[] }>>()

export function readXrSubjectPartIds(construction: XrSubjectConstruction): readonly string[] {
  return resolveXrSubjectConstructionBounds(construction).parts
}

export function readXrSubjectPlayback(construction: XrSubjectConstruction): { clipId: string | null; loop: boolean; clips: readonly { id: string; duration: number }[] } {
  const { clips } = resolveXrSubjectConstructionBounds(construction)
  const value: unknown = construction.playback
  if (value === undefined) return { clipId: clips[0]?.id ?? null, loop: true, clips }
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Reflect.ownKeys(value).some(key => key !== 'clipId' && key !== 'loop')) throw new Error('Invalid subject playback settings')
  const playback = value as Record<string, unknown>
  if (!Object.hasOwn(playback, 'clipId') || !Object.hasOwn(playback, 'loop') || typeof playback.loop !== 'boolean'
    || !(playback.clipId === null || typeof playback.clipId === 'string')) throw new Error('Invalid subject playback settings')
  if (playback.clipId !== null && !clips.some(clip => clip.id === playback.clipId)) throw new Error('Selected subject clip is missing from the construction')
  return { clipId: playback.clipId as string | null, loop: playback.loop, clips }
}

export class XrSubjectConstructionError extends Error {
  readonly code = 'invalid-subject-construction'
  constructor(cause: unknown) { super(cause instanceof Error ? cause.message : 'Invalid subject construction'); this.name = 'XrSubjectConstructionError' }
}

export function readXrSubjectConstruction(value: unknown): XrSubjectConstruction | undefined {
  if (value === undefined) return undefined
  try { return admitXrSubjectConstruction(value) } catch (cause) { throw new XrSubjectConstructionError(cause) }
}

function admitXrSubjectConstruction(value: unknown): XrSubjectConstruction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid subject construction')
  const record = value as Record<string, unknown>
  const result = {} as { -readonly [K in keyof XrSubjectConstruction]: XrSubjectConstruction[K] }
  for (const key of ['proceduralAssetDocument', 'proceduralAssetManifestPath', 'proceduralAssetWorkspaceParent', 'proceduralAssetSourcePath'] as const) {
    const field = record[key]
    if (typeof field !== 'string' || !field.trim()) throw new Error(`Missing subject construction ${key}`)
    result[key] = field
    if (key !== 'proceduralAssetDocument' && (result[key].length > 4096 || /[\\\u0000-\u001f]/.test(result[key]) || result[key].split('/').some(part => part === '.' || part === '..'))) throw new Error('Invalid subject workspace path')
  }
  resolveXrSubjectConstructionBounds(result)
  if (record.playback !== undefined) {
    const { clipId, loop } = readXrSubjectPlayback({ ...result, playback: record.playback as XrSubjectConstruction['playback'] })
    result.playback = Object.freeze({ clipId, loop })
  }
  return Object.freeze(result)
}

export function resolveXrSubjectConstructionBounds(construction: XrSubjectConstruction) {
  const document = construction.proceduralAssetDocument
  const cached = constructionBounds.get(document)
  if (cached) return cached
  const session = ProceduralAssetSession.restore(document)
  try {
    const box = new THREE.Box3().setFromObject(session.current.scene)
    if (box.isEmpty() || ![...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)) throw new Error('Subject construction has no finite bounds')
    if (box.min.y < -XR_SUBJECT_GROUND_EPSILON_METERS) throw new Error('Subject construction extends below its ground origin; move its parts above Y = 0 before applying')
    const clips = Object.freeze(session.snapshot.lastValid.clips.map(clip => Object.freeze({ id: clip.id, duration: clip.duration })))
    const parts = Object.freeze(session.snapshot.lastValid.parts.map(part => part.id))
    const bounds = Object.freeze({ min: Object.freeze(box.min.toArray()), max: Object.freeze(box.max.toArray()), parts, clips })
    // Repeated metadata normalization reuses admission; this cache owns no GPU resources.
    if (constructionBounds.size >= 8) constructionBounds.delete(constructionBounds.keys().next().value!)
    constructionBounds.set(document, bounds)
    return bounds
  } finally { session.dispose() }
}
