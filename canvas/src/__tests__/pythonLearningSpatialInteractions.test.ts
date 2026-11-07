import test from 'node:test'
import assert from 'node:assert/strict'
import { canWalkTo, placementIssue, snapLearningPosition, spatialBlocks, WAREHOUSE_DOORS } from '../features/python-learning/learningSpatialEditing'
import { learningLesson } from '../features/python-learning/learningLessons'
import { LearningSpatialSelection, learningSpatialDocumentKey, DEFAULT_SPATIAL_VIEW } from '../features/python-learning/learningSpatialSelection'
import type { LearningRuntimeSnapshot } from '../features/python-learning/learningRuntime'
const lesson = learningLesson('drone')
const asset = { id: 'placed:1', templateId: 'crate', name: 'Pallet', position: [10, 0, 9] as const, size: [.8, 1, 1.2] as const, color: '#abc' }
test('placement protects the programmed cell, envelope, doors, existing and placed objects', () => {
  const blocks = spatialBlocks(lesson, [])
  assert.equal(placementIssue(asset, blocks), null)
  for (const position of [[0, 0, 0], [30, 0, 0], [NaN, 0, 2], [-15, 0, -5], [-25, 0, 3]] as const)
    assert.ok(placementIssue({ ...asset, position }, blocks))
  assert.match(placementIssue(asset, spatialBlocks(lesson, [asset]))!, /Overlaps Pallet/)
  for (const door of WAREHOUSE_DOORS) assert.match(placementIssue({ ...asset, position: [door.x, 0, door.z] }, blocks)!, /swing clearance/)
  assert.deepEqual(snapLearningPosition(10.11, 8.89), [10, 0, 9])
})
test('walking respects static geometry and opened versus closed doorway', () => {
  assert.equal(canWalkTo(0, 6, spatialBlocks(lesson, [])), true)
  assert.equal(canWalkTo(-15, -5, spatialBlocks(lesson, [])), false)
  assert.equal(canWalkTo(30, 0, []), false)
  assert.equal(canWalkTo(NaN, 0, []), false)
  assert.equal(canWalkTo(18, 12, spatialBlocks(lesson, [])), false)
  assert.equal(canWalkTo(18, 12, spatialBlocks(lesson, [], ['office'])), true)
  assert.equal(canWalkTo(17.2, 12.8, spatialBlocks(lesson, [], ['office'])), false)
})
test('source replacement clears layout edits and running revokes placement and walking', () => {
  const selection = new LearningSpatialSelection()
  const runtime = { state: 'idle', document: { workspaceId: 'ws', documentId: 'doc', lessonId: 'drone', source: 'pass' } } as LearningRuntimeSnapshot
  const key = learningSpatialDocumentKey(runtime.document)
  selection.bind(runtime); selection.update(key, { placed: [asset], doors: ['office'], walk: true, placement: 'obstacle:crate' })
  selection.bind({ ...runtime, state: 'running' })
  assert.equal(selection.read(key).walk, false); assert.equal(selection.read(key).placement, null)
  assert.equal(selection.read(key).placed.length, 1)
  selection.bind({ ...runtime, document: { ...runtime.document!, source: 'print(1)' } })
  assert.deepEqual(selection.read(key), DEFAULT_SPATIAL_VIEW)
})
