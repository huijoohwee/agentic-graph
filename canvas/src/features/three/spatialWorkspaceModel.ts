import { canonicalSpatialJson, enforceSpatialBudget, freezeSpatial, refuse, spatialValuesEqual, SPATIAL_REVIEW_MAX_RECEIPTS } from 'grph-shared/spatial-review'
export { canonicalSpatialJson, enforceSpatialBudget, freezeSpatial, refuse, spatialDigest, SpatialReviewError, SPATIAL_REVIEW_MAX_BYTES } from 'grph-shared/spatial-review'
import type { GraphNode } from '@/lib/graph/types'
import { SpatialPhysicsEngine } from '../physics/spatialPhysicsEngine'
import { readXrMotionReferencePlan, serializeXrMotionReferencePlan, type XrMotionReferencePlan, type XrMotionReferenceVector } from './xrMotionReferenceModel'
import { buildXrMotionReferenceSubjectTransformEdit } from './xrMotionReferenceSubjectEdits'
import { resolveXrSubjectFootprint } from './xrMotionReferenceSubjectPlacement'
import { resolveXrCanonicalSceneSpatialSource } from './xrCanonicalSceneSpatialSource'

export const SPATIAL_REVIEW_KEY = 'kgSpatialWorkspaceReview'
export const SPATIAL_REVIEW_SCHEMA = 'agentic-graph.spatial-review/v1'
export type SpatialEdit = Readonly<{ subjectId: string; position?: XrMotionReferenceVector; scale?: number }>
export type SpatialValues = { position: XrMotionReferenceVector; scale: number; marks: readonly { time: number; position: XrMotionReferenceVector }[] }
export type SpatialDiff = { subjectId: string; label: string; context: string; before: SpatialValues; after: SpatialValues }
export type SpatialReceipt = {
  id: string; proposalDigest: string; sourceToken: string; sceneDigest: string; documentName: string
  session: string; actor: 'local-operator' | 'browser-agent'; approver: 'local-operator'
  timestamp: number; kind: 'apply' | 'undo'; undoOf?: string; diff: SpatialDiff[]
  provenance: { kind: 'authored'; units: 'metres'; correspondence: 'unknown' }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse('invalid-input', 'Expected a spatial review object.')
  return value as Record<string, unknown>
}
function vector(value: unknown): XrMotionReferenceVector {
  if (!Array.isArray(value) || value.length !== 3 || value.some((n, i) => typeof n !== 'number' || !Number.isFinite(n) || n < (i === 1 ? 0 : -50) || n > 50)) refuse('invalid-input', 'Position must contain three finite coordinates within the authored 50 metre bounds, with nonnegative height.')
  return [...value] as [number, number, number]
}
export function parseSpatialEdits(value: unknown): SpatialEdit[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) refuse('budget-exceeded', 'Review one to eight edits at a time.')
  const seen = new Set<string>()
  return value.map(raw => {
    const edit = record(raw)
    if (Object.keys(edit).some(key => !['subjectId', 'position', 'scale'].includes(key))) refuse('unsupported-operation', 'Only position and scale edits are supported.')
    if (typeof edit.subjectId !== 'string' || !edit.subjectId || edit.subjectId.length > 96 || seen.has(edit.subjectId)) refuse('invalid-input', 'Each edit needs a unique existing subject ID.')
    seen.add(edit.subjectId)
    if (edit.position === undefined && edit.scale === undefined) refuse('invalid-input', 'An edit needs a position or scale.')
    if (edit.scale !== undefined && (typeof edit.scale !== 'number' || !Number.isFinite(edit.scale) || edit.scale < 0.25 || edit.scale > 4)) refuse('invalid-input', 'Scale must be between 0.25 and 4.')
    return { subjectId: edit.subjectId, ...(edit.position !== undefined ? { position: vector(edit.position) } : {}), ...(edit.scale !== undefined ? { scale: edit.scale as number } : {}) }
  }).sort((a, b) => a.subjectId < b.subjectId ? -1 : 1)
}
export function spatialValues(plan: XrMotionReferencePlan, id: string): SpatialValues {
  const subject = plan.subjects.find(item => item.id === id)
  if (!subject) refuse('conflict', 'A reviewed object is no longer present.')
  return { position: [...subject.position], scale: subject.scale, marks: (plan.cast.find(track => track.actorId === id)?.marks || []).map(mark => ({ time: mark.timeSeconds, position: [...mark.position] })) }
}
export function spatialContext(plan: XrMotionReferencePlan, id: string): string {
  const subject = plan.subjects.find(item => item.id === id)
  return canonicalSpatialJson({ stage: plan.stageId, asset: subject?.assetId, rotation: subject?.rotationYDegrees, construction: subject?.construction || null, animation: plan.cast.find(track => track.actorId === id)?.animation || null })
}
export function spatialFindings(plan: XrMotionReferencePlan) {
  const source = resolveXrCanonicalSceneSpatialSource({ projection: 'authored', stageId: plan.stageId })
  const subjects = plan.subjects.map(subject => {
    if (subject.construction) refuse('unsupported-geometry', 'Construction geometry needs its own reviewed projection; this slice supports catalog bounds.')
    const size = resolveXrSubjectFootprint(subject).sizeMeters
    return { id: `subject:${subject.id}`, position: [subject.position[0], subject.position[1] + size[1] / 2, subject.position[2]] as XrMotionReferenceVector, halfSize: size.map(n => n / 2) as unknown as XrMotionReferenceVector }
  })
  const obstacles = source.staticColliders.map(collider => ({ id: `stage:${collider.id}`, position: collider.center, halfSize: collider.sizeMeters.map(n => n / 2) as unknown as XrMotionReferenceVector }))
  const all = [...subjects, ...obstacles]
  const original = new SpatialPhysicsEngine({ fixedStepSeconds: 1 / 60, maxSubSteps: 1, gravity: [0, 0, 0],
    bodies: all.map(body => ({ id: body.id, motion: 'static', position: body.position })),
    colliders: all.map(body => ({ id: body.id, bodyId: body.id, shape: { kind: 'cuboid', halfSize: body.halfSize } })),
  })
  const detached = SpatialPhysicsEngine.fromSnapshot(original.captureSnapshot())
  const overlaps = new Set<string>()
  for (const subject of subjects) for (const hit of detached.queryOverlap({ position: subject.position, shape: { kind: 'cuboid', halfSize: subject.halfSize }, filter: { excludeColliderIds: [subject.id] } })) overlaps.add([subject.id, hit].sort().join(' ↔ '))
  const outsideStage = subjects.filter(body => Math.abs(body.position[0]) + body.halfSize[0] > source.stage.sizeMeters[0] / 2 || Math.abs(body.position[2]) + body.halfSize[2] > source.stage.sizeMeters[1] / 2).map(body => body.id).sort()
  return { basis: 'conservative authored axis-aligned bounds', units: 'metres', correspondence: 'unknown', safetyAssessment: false, overlaps: [...overlaps].sort(), outsideStage }
}
export function previewSpatialEdits(plan: XrMotionReferencePlan, input: unknown, nodes: readonly GraphNode[] = []) {
  const edits = parseSpatialEdits(input)
  let candidate = plan
  for (const edit of edits) {
    const patch = buildXrMotionReferenceSubjectTransformEdit(candidate, edit)
    if (!patch) refuse('invalid-input', `Unknown subject: ${edit.subjectId}`)
    const next = readXrMotionReferencePlan(patch.value, nodes)
    const actual = spatialValues(next, edit.subjectId)
    if ((edit.position && canonicalSpatialJson(actual.position) !== canonicalSpatialJson(edit.position)) || (edit.scale !== undefined && actual.scale !== edit.scale)) refuse('invalid-input', 'The edit exceeds stored precision. Use at most four coordinate and three scale decimal places.')
    const rawMarks = (patch.value.cast as Array<{ actorId: string; marks: Array<{ timeSeconds: number; position: XrMotionReferenceVector }> }>).find(track => track.actorId === edit.subjectId)?.marks || []
    if (canonicalSpatialJson(actual.marks) !== canonicalSpatialJson(rawMarks.map(mark => ({ time: mark.timeSeconds, position: mark.position })))) refuse('unsupported-operation', 'This edit would clamp or regenerate authored choreography.')
    candidate = next
  }
  const diff = edits.map(edit => ({ subjectId: edit.subjectId, label: plan.subjects.find(subject => subject.id === edit.subjectId)!.label, context: spatialContext(plan, edit.subjectId), before: spatialValues(plan, edit.subjectId), after: spatialValues(candidate, edit.subjectId) }))
  if (diff.every(row => spatialValuesEqual(row.before, row.after))) refuse('invalid-input', 'The proposed values do not change the scene.')
  const result = { edits, plan: candidate, metadata: serializeXrMotionReferencePlan(candidate), diff, before: spatialFindings(plan), after: spatialFindings(candidate) }
  enforceSpatialBudget(result)
  return freezeSpatial(result)
}
export function readSpatialReceipts(value: unknown): SpatialReceipt[] {
  if (value === undefined) return []
  enforceSpatialBudget(value)
  const ledger = record(value)
  if (ledger.schema !== SPATIAL_REVIEW_SCHEMA || !Array.isArray(ledger.receipts) || ledger.receipts.length > SPATIAL_REVIEW_MAX_RECEIPTS) refuse('invalid-input', 'Unsupported or oversized spatial receipt ledger.')
  const receipts = ledger.receipts as SpatialReceipt[]
  const ids = new Set<string>()
  for (const receipt of receipts) {
    if (!receipt || typeof receipt.id !== 'string' || receipt.id.length > 96 || ids.has(receipt.id) || !Array.isArray(receipt.diff) || receipt.diff.length < 1 || receipt.diff.length > 8
      || !['apply', 'undo'].includes(receipt.kind) || typeof receipt.documentName !== 'string' || typeof receipt.session !== 'string'
      || !/^[a-f0-9]{64}$/.test(receipt.proposalDigest) || !/^[a-f0-9]{64}$/.test(receipt.sceneDigest)
      || !Number.isSafeInteger(receipt.timestamp) || receipt.timestamp < 0 || receipt.approver !== 'local-operator'
      || !/^[a-f0-9]{64}$/.test(receipt.sourceToken) || !['local-operator', 'browser-agent'].includes(receipt.actor)
      || !receipt.id || !receipt.session || receipt.session.length > 128 || !receipt.documentName || receipt.documentName.length > 1024
      || receipt.provenance?.kind !== 'authored' || receipt.provenance?.units !== 'metres' || receipt.provenance?.correspondence !== 'unknown'
      || (receipt.kind === 'undo' ? typeof receipt.undoOf !== 'string' || !receipt.undoOf || receipt.undoOf.length > 96 : receipt.undoOf !== undefined)) refuse('invalid-input', 'Malformed spatial receipt; preserve the source and repair its ledger.')
    ids.add(receipt.id)
    parseSpatialEdits(receipt.diff.map(row => ({ subjectId: row.subjectId, position: row.before?.position, scale: row.before?.scale })))
    parseSpatialEdits(receipt.diff.map(row => ({ subjectId: row.subjectId, position: row.after?.position, scale: row.after?.scale })))
    if (receipt.diff.some(row => typeof row.label !== 'string' || row.label.length > 256 || typeof row.context !== 'string' || row.context.length > 4096 || !Array.isArray(row.before?.marks) || !Array.isArray(row.after?.marks))) refuse('invalid-input', 'Malformed inverse change values.')
    for (const row of receipt.diff) for (const values of [row.before, row.after]) {
      if (values.marks.length > 32) refuse('invalid-input', 'Too many authored track marks.')
      for (const mark of values.marks) {
        if (!mark || !Number.isFinite(mark.time) || mark.time < 0 || mark.time > 30) refuse('invalid-input', 'Malformed authored track time.')
        vector(mark.position)
      }
    }
  }
  return receipts
}
export function inverseSpatialEdits(plan: XrMotionReferencePlan, receipt: SpatialReceipt): SpatialEdit[] {
  for (const row of receipt.diff) {
    if (spatialContext(plan, row.subjectId) !== row.context || canonicalSpatialJson(spatialValues(plan, row.subjectId)) !== canonicalSpatialJson(row.after)) refuse('conflict', 'A reviewed object changed after application. Inspect it and create a fresh proposal.')
  }
  return receipt.diff.map(row => ({ subjectId: row.subjectId, position: row.before.position, scale: row.before.scale }))
}
