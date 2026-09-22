import * as THREE from 'three'
import { ProceduralAssetSession } from '@/features/image-to-glb/proceduralAssetSession'
import type { XrMotionReferenceRuntimeSnapshot } from './xrMotionReferenceRuntimeSnapshot'

export type XrSubjectDraftContext = Readonly<{
  documentName: string
  documentText: string
  sceneKey: string
  sourceSignature: string
  plan: XrMotionReferenceRuntimeSnapshot['plan']
  subjectId: string
  selectedSubjectId: string
}>

/** References existing authored state; transport revisions are deliberately excluded. */
export function captureXrSubjectDraftContext(
  document: Readonly<{ markdownDocumentName?: string | null; markdownDocumentText?: string | null }>,
  runtime: XrMotionReferenceRuntimeSnapshot,
  subjectId: string,
): XrSubjectDraftContext {
  return Object.freeze({ documentName: document.markdownDocumentName || '', documentText: document.markdownDocumentText || '',
    sceneKey: runtime.sceneKey, sourceSignature: runtime.sourceSignature, plan: runtime.plan,
    subjectId, selectedSubjectId: runtime.selectedShotTargetId })
}

export function isXrSubjectDraftCurrent(draft: XrSubjectDraftContext, current: XrSubjectDraftContext): boolean {
  return Boolean(draft.documentName && draft.documentText && draft.sceneKey
    && draft.documentName === current.documentName && draft.documentText === current.documentText
    && draft.sceneKey === current.sceneKey && draft.sourceSignature === current.sourceSignature
    && draft.plan === current.plan && draft.subjectId === current.subjectId
    && draft.selectedSubjectId === draft.subjectId && current.selectedSubjectId === draft.subjectId
    && current.plan.subjects.some(subject => subject.id === draft.subjectId))
}

/** References the native document/companions; derived bounds never become a second recipe. */
export type XrSubjectConstruction = Readonly<{
  proceduralAssetDocument: string
  proceduralAssetManifestPath: string
  proceduralAssetWorkspaceParent: string
  proceduralAssetSourcePath: string
}>
// Float32 mesh bounds can differ from the authored ground plane by sub-micrometer rounding.
export const XR_SUBJECT_GROUND_EPSILON_METERS = 1e-6
const constructionBounds = new Map<string, Readonly<{ min: readonly number[]; max: readonly number[] }>>()

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
  const result = {} as Record<keyof XrSubjectConstruction, string>
  for (const key of ['proceduralAssetDocument', 'proceduralAssetManifestPath', 'proceduralAssetWorkspaceParent', 'proceduralAssetSourcePath'] as const) {
    const field = record[key]
    if (typeof field !== 'string' || !field.trim()) throw new Error(`Missing subject construction ${key}`)
    result[key] = field
    if (key !== 'proceduralAssetDocument' && (result[key].length > 4096 || /[\\\u0000-\u001f]/.test(result[key]) || result[key].split('/').some(part => part === '.' || part === '..'))) throw new Error('Invalid subject workspace path')
  }
  resolveXrSubjectConstructionBounds(result)
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
    const bounds = Object.freeze({ min: Object.freeze(box.min.toArray()), max: Object.freeze(box.max.toArray()) })
    // Repeated metadata normalization reuses admission; this cache owns no GPU resources.
    if (constructionBounds.size >= 8) constructionBounds.delete(constructionBounds.keys().next().value!)
    constructionBounds.set(document, bounds)
    return bounds
  } finally { session.dispose() }
}
