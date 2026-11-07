import test from 'node:test'
import assert from 'node:assert/strict'
import { readXrMotionReferencePlan, serializeXrMotionReferencePlan } from '../features/three/xrMotionReferenceModel'
import { canonicalSpatialJson, enforceSpatialBudget, inverseSpatialEdits, parseSpatialEdits, previewSpatialEdits, readSpatialReceipts, spatialDigest, SPATIAL_REVIEW_SCHEMA, type SpatialReceipt } from '../features/three/spatialWorkspaceModel'
const plan = () => readXrMotionReferencePlan({ stageId: 'neutral-volume', castSource: 'subjects-only', subjects: [
  { id: 'crate-a', assetId: 'prop-crate', label: '<script>not executable</script>', position: [-3, 0, 0] },
  { id: 'crate-b', assetId: 'prop-crate', position: [3, 0, 0] },
] })

test('detached previews are deterministic, immutable, order-independent and preserve source', async () => {
  const source = plan(), before = canonicalSpatialJson(source)
  const edits = [{ subjectId: 'crate-b', scale: 1.2 }, { subjectId: 'crate-a', position: [-2, 0, 0] }]
  const first = previewSpatialEdits(source, edits), second = previewSpatialEdits(source, [...edits].reverse())
  assert.equal(canonicalSpatialJson(first), canonicalSpatialJson(second))
  assert.equal(canonicalSpatialJson(source), before)
  assert.equal(await spatialDigest(first), await spatialDigest(second))
  assert.ok(Object.isFrozen(first.diff[0].after.position))
  assert.equal(first.diff[0].label, '<script>not executable</script>')
})
test('bounded input rejects invalid, duplicate, excess, and silently rounded transforms', () => {
  for (const edits of [[], new Array(9).fill({ subjectId: 'crate-a', scale: 1.2 }), [{ subjectId: 'crate-a', scale: NaN }], [{ subjectId: 'crate-a', position: [0, -1, 0] }], [{ subjectId: 'crate-a', position: [Infinity, 0, 0] }], [{ subjectId: 'crate-a', position: [1, 0] }], [{ subjectId: 'crate-a', scale: 5 }], [{ subjectId: 'crate-a', scale: 2 }, { subjectId: 'crate-a', scale: 3 }], [{ subjectId: 'crate-a', color: '#000000' }]]) assert.throws(() => parseSpatialEdits(edits))
  assert.throws(() => previewSpatialEdits(plan(), [{ subjectId: 'crate-a', scale: 1.00001 }]), /precision/)
  assert.throws(() => previewSpatialEdits(plan(), [{ subjectId: 'missing', scale: 2 }]), /Unknown/)
  assert.throws(() => enforceSpatialBudget('x'.repeat(128 * 1024)), /128 KiB/)
})
test('native detached geometry reports overlap and stage limits without a safety claim', () => {
  const preview = previewSpatialEdits(plan(), [{ subjectId: 'crate-a', position: [3, 0, 0] }])
  assert.equal(preview.before.overlaps.length, 0)
  assert.ok(preview.after.overlaps.some(pair => pair.includes('crate-a') && pair.includes('crate-b')))
  assert.equal(preview.after.safetyAssessment, false)
  assert.equal(preview.after.correspondence, 'unknown')
  assert.ok(previewSpatialEdits(plan(), [{ subjectId: 'crate-a', position: [50, 0, 50] }]).after.outsideStage.includes('subject:crate-a'))
})
test('inverse edits preserve unrelated changes and reject affected-field conflicts', () => {
  const preview = previewSpatialEdits(plan(), [{ subjectId: 'crate-a', position: [-2, 0, 0] }])
  const receipt = { diff: preview.diff } as SpatialReceipt
  const unrelated = readXrMotionReferencePlan({ ...preview.plan, subjects: preview.plan.subjects.map(subject => ({ ...subject, label: 'renamed', ...(subject.id === 'crate-b' ? { scale: 2 } : {}) })) })
  const undone = previewSpatialEdits(unrelated, inverseSpatialEdits(unrelated, receipt)).plan
  assert.equal(undone.subjects[1].scale, 2)
  assert.equal(undone.subjects[0].label, 'renamed')
  assert.deepEqual(undone.subjects[0].position, [-3, 0, 0])
  const conflict = previewSpatialEdits(preview.plan, [{ subjectId: 'crate-a', scale: 2 }]).plan
  assert.throws(() => inverseSpatialEdits(conflict, receipt), /changed after/)
})
test('authored track offsets roundtrip and reject overflowing marks', () => {
  const source = readXrMotionReferencePlan({ ...plan(), cast: [{ actorId: 'crate-a', marks: [{ timeSeconds: 0, position: [-3, 0, 0] }, { timeSeconds: 1, position: [-1, 0, 0] }] }] })
  const preview = previewSpatialEdits(source, [{ subjectId: 'crate-a', position: [-2, 0, 0] }])
  assert.deepEqual(preview.plan.cast[0].marks.map(mark => mark.position), [[-2, 0, 0], [0, 0, 0]])
  assert.deepEqual(serializeXrMotionReferencePlan(readXrMotionReferencePlan(preview.metadata)), preview.metadata)
  assert.throws(() => previewSpatialEdits(source, [{ subjectId: 'crate-a', position: [50, 0, 0] }]), /clamp/)
})
test('receipt ledger refuses unknown schemas and malformed imported data', () => {
  assert.deepEqual(readSpatialReceipts(undefined), [])
  assert.deepEqual(readSpatialReceipts({ schema: SPATIAL_REVIEW_SCHEMA, receipts: [] }), [])
  for (const value of [{ schema: 'other', receipts: [] }, { schema: SPATIAL_REVIEW_SCHEMA, receipts: [{}] }, { schema: SPATIAL_REVIEW_SCHEMA, receipts: new Array(33).fill({}) }]) assert.throws(() => readSpatialReceipts(value))
})
test('scene edits retain graph-owned cast tracks as well as subject tracks', () => {
  const nodes = [{ id: 'graph-actor', label: 'Graph actor', type: 'Node', properties: {} }]
  const source = readXrMotionReferencePlan({ ...plan(), castSource: 'graph+subjects', cast: [{ actorId: 'graph-actor', marks: [{ timeSeconds: 0, position: [1, 0, 2] }] }] }, nodes)
  const changed = previewSpatialEdits(source, [{ subjectId: 'crate-a', scale: 1.2 }], nodes)
  assert.deepEqual(changed.plan.cast, source.cast)
})
