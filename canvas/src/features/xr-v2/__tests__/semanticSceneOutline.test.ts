import test from 'node:test'
import assert from 'node:assert/strict'
import { indexedDB } from 'fake-indexeddb'
import { applySpaceAction, hashSpaceImage, newSpaceDocument } from '../semanticSpaceRuntime'
import { createSemanticSpaceStore } from '../semanticSpaceStore'
import { projectSemanticSceneOutline, sceneOutlineVisibilityAction } from '../semanticSceneOutlineProjection'
import { buildTwinScene, disposeTwinScene } from '../semanticTwinScene'

const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Q4t0AAAAASUVORK5CYII='
async function fixture() {
  return applySpaceAction(newSpaceDocument('space:outline'), {
    operation: 'confirm-image-regions', expectedRevision: 0, requestId: 'request:fixture',
    observation: { id: 'observation:outline', width: 640, height: 480, sha256: await hashSpaceImage(imageDataUrl),
      imageDataUrl, capturedAtMs: 1, orientation: 'source-pixels', scale: 'unknown' },
    proposals: ['North tower', 'South tower', 'Water'].map((label, index) => ({ label,
      template: index === 2 ? 'sea' : 'building', color: '#4f7181', coverage: 1, confidence: 0.5, source: 'user-region',
      region: { x: index * 0.25, y: 0.25, width: 0.2, height: 0.4 } })),
  })
}
test('outline filters the displayed evidence, preserves identity and finds combined label/shape terms', async () => {
  const doc = await fixture(), hash = doc.observations[0].sha256, before = JSON.stringify(doc)
  const all = projectSemanticSceneOutline(doc, hash)
  assert.equal(all.total, 3); assert.equal(all.visible, 3)
  assert.deepEqual(all.rows.map(row => row.id), doc.twin!.objects.map(model => model.entityId))
  assert.equal(projectSemanticSceneOutline(doc, hash, ' NORTH building ').rows[0].label, 'North tower')
  assert.equal(projectSemanticSceneOutline(doc, hash, all.rows[1].id).rows[0].label, 'South tower')
  assert.equal(projectSemanticSceneOutline(doc, '0'.repeat(64)).total, 0)
  assert.equal(projectSemanticSceneOutline(doc, hash, 'missing').rows.length, 0)
  assert.equal(JSON.stringify(doc), before)
})
test('selection and visibility reflect shared actions without deleting or changing geometry identity', async () => {
  const doc = await fixture(), hash = doc.observations[0].sha256, id = doc.twin!.objects[0].entityId
  const hidden = applySpaceAction(doc, sceneOutlineVisibilityAction(doc, doc, hash, id, false, 'request:hide'))
  const selected = applySpaceAction(hidden, { operation: 'select', expectedRevision: hidden.revision,
    requestId: 'request:select', entityId: id })
  const outline = projectSemanticSceneOutline(selected, hash, '', 'hidden')
  assert.equal(outline.total, 3); assert.equal(outline.visible, 2)
  assert.equal(outline.rows.length, 1); assert.equal(outline.rows[0].selected, true)
  assert.equal(projectSemanticSceneOutline(selected, hash, '', 'visible').rows.length, 2)
  assert.deepEqual(selected.entities, doc.entities)
  assert.deepEqual(selected.twin!.objects[0].position, doc.twin!.objects[0].position)
  assert.deepEqual(selected.twin!.objects[0].size, doc.twin!.objects[0].size)
  const shown = applySpaceAction(selected, sceneOutlineVisibilityAction(selected, selected, hash, id, true, 'request:show'))
  assert.equal(projectSemanticSceneOutline(shown, hash).visible, 3)
  const built = buildTwinScene(shown.twin!.objects)
  try { assert.equal(built.error, null); assert.equal(built.objects.length, 3) }
  finally { disposeTwinScene(built) }
})
test('visibility rejects stale selection revisions and replacement spaces with colliding IDs', async () => {
  const doc = await fixture(), hash = doc.observations[0].sha256, id = doc.twin!.objects[0].entityId
  const newer = applySpaceAction(doc, { operation: 'select', expectedRevision: doc.revision, requestId: 'request:other', entityId: id })
  assert.throws(() => sceneOutlineVisibilityAction(doc, newer, hash, id, false, 'request:hide'), /Scene changed/)
  assert.throws(() => sceneOutlineVisibilityAction(doc, { ...doc, id: 'space:replacement' }, hash, id, false, 'request:hide'), /Scene changed/)
  assert.throws(() => sceneOutlineVisibilityAction(doc, null, hash, id, false, 'request:hide'), /Scene changed/)
  assert.throws(() => sceneOutlineVisibilityAction(doc, doc, '0'.repeat(64), id, false, 'request:hide'), /displayed scene/)
  assert.throws(() => sceneOutlineVisibilityAction(doc, doc, hash, 'entity:missing', false, 'request:hide'), /displayed scene/)
})
test('hidden objects survive local readback and concurrent writes still fail at the storage owner', async () => {
  const doc = await fixture(), hash = doc.observations[0].sha256, id = doc.twin!.objects[0].entityId
  const store = createSemanticSpaceStore({ indexedDB, databaseName: `outline-${crypto.randomUUID()}` })
  await store.replace(doc)
  const action = sceneOutlineVisibilityAction(doc, await store.read(), hash, id, false, 'request:hide')
  const next = applySpaceAction(doc, action)
  await store.save(next, doc.revision)
  const persisted = await store.read()
  assert.equal(projectSemanticSceneOutline(persisted!, hash, '', 'hidden').rows[0].id, id)
  assert.equal(persisted!.twin!.objects.length, doc.twin!.objects.length)
  assert.equal(applySpaceAction(persisted!, action), persisted)
  await assert.rejects(store.save(next, doc.revision), /Space changed/)
})
