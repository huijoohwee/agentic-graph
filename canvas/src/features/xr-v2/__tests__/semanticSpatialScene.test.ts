import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { indexedDB } from 'fake-indexeddb'
import { applySpaceAction, hashSpaceImage, newSpaceDocument } from '../semanticSpaceRuntime'
import { createSemanticSpaceStore } from '../semanticSpaceStore'
import { buildTwinScene, disposeTwinScene } from '../semanticTwinScene'
import type { ComposeTwinScene } from '../semanticSpatialScene'
import type { TwinTemplate } from '../semanticTwinRuntime'
import { SEMANTIC_SPACE_CONTROL_SCHEMA } from '@/features/agent-ready/semanticSpaceAgentReadyContract.mjs'

const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Q4t0AAAAASUVORK5CYII='
async function source(count = 20) {
  let doc = newSpaceDocument('space:spatial')
  for (let start = 0; start < count; start += 10) doc = applySpaceAction(doc, {
    operation: 'confirm-image-regions', expectedRevision: doc.revision, requestId: `request:batch-${start}`,
    observation: { id: `observation:${start}`, width: 960, height: 640, sha256: await hashSpaceImage(imageDataUrl),
      imageDataUrl, capturedAtMs: 1, orientation: 'source-pixels', scale: 'unknown' },
    proposals: Array.from({ length: Math.min(10, count - start) }, (_, offset) => ({ label: `Region ${start + offset}`,
      template: 'box', color: '#4f7181', coverage: 1, confidence: 0.5, source: 'user-region',
      region: { x: ((start + offset) % 5) * 0.18, y: Math.floor((start + offset) / 5) * 0.2, width: 0.08, height: 0.12 } })),
  })
  return doc
}
test('twenty detailed buildings are separate solid raycastable objects in one bounded scene', async () => {
  const doc = await source()
  const action: ComposeTwinScene = { operation: 'compose-twin-scene', requestId: 'request:scene', expectedRevision: doc.revision,
    evidenceSha256: doc.observations[0].sha256, assignments: doc.twin!.objects.map(item => ({ entityId: item.entityId, template: 'building' })) }
  const next = applySpaceAction(doc, action), built = buildTwinScene(next.twin!.objects)
  try {
    assert.equal(built.error, null); assert.equal(built.objects.length, 20)
    assert.deepEqual(next.entities, doc.entities); assert.deepEqual(next.observations, doc.observations)
    assert.deepEqual(next.twin!.objects.map(item => item.entityId), doc.twin!.objects.map(item => item.entityId))
    const materials = new Set<THREE.Material>(); let triangles = 0
    for (const item of built.objects) {
      assert.ok(item.binding.recipe.parts.some(part => part.id === 'roof'))
      assert.equal(item.binding.recipe.parts.filter(part => part.id.startsWith('windows-')).length, 4)
      let meshes = 0
      item.wrapper.updateMatrixWorld(true)
      item.source.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return
        meshes++; materials.add(object.material as THREE.Material)
        triangles += (object.geometry.index?.count || object.geometry.getAttribute('position').count) / 3
        assert.ok(object.geometry.getAttribute('color')); assert.equal(object.geometry.groups.length, 0)
      })
      assert.equal(meshes, 1)
      const box = new THREE.Box3().setFromObject(item.wrapper), center = box.getCenter(new THREE.Vector3())
      assert.ok(Math.abs(box.min.y) < 1e-5)
      const ray = new THREE.Raycaster(new THREE.Vector3(center.x, center.y, box.max.z + 1), new THREE.Vector3(0, 0, -1))
      assert.ok(ray.intersectObject(item.wrapper, true).length)
    }
    assert.equal(materials.size, 20); assert.ok(triangles < 30_000)
    assert.equal(applySpaceAction(next, action), next)
    assert.throws(() => applySpaceAction(next, { ...action, requestId: 'request:stale' }), /changed/)
    assert.throws(() => applySpaceAction(doc, { ...action, evidenceSha256: 'b'.repeat(64) }), /this image/)
    assert.throws(() => applySpaceAction(doc, { ...action, assignments: [action.assignments[0], action.assignments[0]] }), /distinct/)
  } finally { disposeTwinScene(built) }
})
test('mixed terrain, transport and furniture retain volumetric shapes, hidden state, and atomic backup', async () => {
  const doc = await source(8), shapes: TwinTemplate[] = ['landscape', 'sea', 'river', 'aircraft', 'ship', 'car', 'tree', 'chair']
  const hidden = applySpaceAction(doc, { operation: 'control-twin', requestId: 'request:hide', expectedRevision: doc.revision,
    entityId: doc.twin!.objects[6].entityId, controlId: 'visible', value: false })
  const next = applySpaceAction(hidden, { operation: 'compose-twin-scene', requestId: 'request:mix', expectedRevision: hidden.revision,
    evidenceSha256: hidden.observations[0].sha256, assignments: hidden.twin!.objects.map((item, i) => ({ entityId: item.entityId, template: shapes[i] })) })
  assert.equal(next.twin!.objects[6].recipe.values.visible, false)
  const built = buildTwinScene(next.twin!.objects)
  try { assert.equal(built.error, null); assert.equal(built.objects.length, 8) } finally { disposeTwinScene(built) }
  const databaseName = 'spatial-test-' + crypto.randomUUID(), storage = createSemanticSpaceStore({ indexedDB, databaseName })
  await storage.replace(hidden); await storage.save(next, hidden.revision, true)
  assert.deepEqual((await storage.read())?.twin, next.twin)
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open(databaseName); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
  const backup = await new Promise<any>((resolve, reject) => { const req = db.transaction('bundles').objectStore('bundles').get(`semantic-space:backup:${doc.id}`); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
  db.close(); assert.deepEqual(backup.document, hidden)
  assert.throws(() => applySpaceAction(next, { operation: 'compose-twin-scene', requestId: 'request:bad', expectedRevision: next.revision,
    evidenceSha256: doc.observations[0].sha256, assignments: [{ entityId: 'entity:missing', template: 'tree' }] }), /saved model/)
  assert.ok(SEMANTIC_SPACE_CONTROL_SCHEMA.oneOf.some((item: any) => item.properties?.operation?.const === 'compose-twin-scene'))
})
