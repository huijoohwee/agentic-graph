import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { analyzeSemanticImage, mapFocusedProposals } from '../semanticImagePerception'
import { combineRegionSilhouettes } from '../semanticTwinSilhouette'
import { applySpaceAction, newSpaceDocument, hashSpaceImage } from '../semanticSpaceRuntime'
import { semanticObjectBindings, semanticObjectCameraKey, semanticObjectCameraFit, semanticPhotoCameraFit } from '../semanticObjectView'
import { buildTwinScene, disposeTwinScene } from '../semanticTwinScene'
import { exportSemanticSpacePackage, importSemanticSpace, createSemanticSpaceStore } from '../semanticSpaceStore'
import { indexedDB } from 'fake-indexeddb'

function shape() {
  const width = 48, height = 48, data = new Uint8ClampedArray(width * height * 4)
  for (let y = 4; y < 44; y++) for (let x = 4; x < 44; x++)
    if (y < 24 || x < 12 || x >= 36) data.set([100, 140, 180, 255], (y * width + x) * 4)
  return analyzeSemanticImage({ width, height, sourceWidth: width, sourceHeight: height, data })
}
const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Q4t0AAAAASUVORK5CYII='
test('photo and layout camera contexts refresh with the arriving fit but remain stable for selection', async () => {
  const doc = await original(), target = { spaceId: doc.id, evidenceSha256: doc.observations[0].sha256 }
  const photo = semanticPhotoCameraFit({ width: 48, height: 48 }), layout = semanticObjectCameraFit(doc.twin!.objects)
  assert.equal(semanticObjectCameraKey(target, null), '')
  assert.notEqual(semanticObjectCameraKey(target, photo), semanticObjectCameraKey(target, layout))
  assert.equal(semanticObjectCameraKey(target, photo), semanticObjectCameraKey({ ...target }, { ...photo }))
  assert.notEqual(semanticObjectCameraKey({ ...target, presentation: 'photo' }, photo),
    semanticObjectCameraKey({ ...target, presentation: 'layout' }, photo))
})
async function original() {
  const observation = { id: 'observation:shape', capturedAtMs: 1, width: 48, height: 48, imageDataUrl,
    sha256: await hashSpaceImage(imageDataUrl), orientation: 'source-pixels' as const, scale: 'unknown' as const }
  return applySpaceAction(newSpaceDocument('space:shape'), { operation: 'confirm-image-regions', requestId: 'request:boxes',
    expectedRevision: 0, observation, proposals: shape().proposals.map(item => ({ ...item, template: 'box' as const })) })
}

test('focused masks retain disconnected gaps and source coordinates instead of filling the crop', () => {
  const result = shape(), region = { x: .2, y: .3, width: .4, height: .5 }
  const silhouette = combineRegionSilhouettes(mapFocusedProposals(result, region).proposals, region, result.width, result.height)
  assert.ok(silhouette.runs.some(([x, y, length]) => y > 24 && x + length < 24))
  assert.ok(!silhouette.runs.some(([x, y, length]) => y > 24 && x <= 24 && x + length > 24))
  assert.throws(() => combineRegionSilhouettes([], region, 48, 48), /silhouette/)
  assert.throws(() => combineRegionSilhouettes(result.proposals, region, 300, 48), /crop/)
})

test('refinement preserves saved identities, transforms and evidence while creating selectable non-box meshes', async () => {
  const doc = await original(), binding = doc.twin!.objects[0]
  const silhouette = shape().proposals[0].silhouette!
  const action = { operation: 'build' as const, requestId: 'request:refine', expectedRevision: doc.revision,
    entityId: binding.entityId, template: 'contour' as const, size: binding.size, position: binding.position, silhouette }
  const refined = applySpaceAction(doc, action)
  assert.deepEqual(refined.entities, doc.entities)
  assert.deepEqual(refined.observations, doc.observations)
  assert.equal(refined.twin!.objects.length, doc.twin!.objects.length)
  const target = { spaceId: doc.id, evidenceSha256: binding.evidenceSha256 }
  const visible = semanticObjectBindings(refined, target)
  assert.equal(visible.length, 1)
  assert.equal(visible[0].template, 'contour')
  assert.deepEqual(visible[0].size, binding.size)
  assert.deepEqual(visible[0].position, binding.position)
  const built = buildTwinScene(visible)
  try {
    assert.equal(built.error, null)
    const source = built.objects[0].source; source.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(source), size = bounds.getSize(new THREE.Vector3())
    const ray = new THREE.Raycaster(new THREE.Vector3(0, size.y * .15, 10), new THREE.Vector3(0, 0, -1))
    assert.equal(ray.intersectObject(source, true).length, 0, 'actual hole must not act like a filled cuboid')
    ray.ray.origin.x = -size.x * .42
    assert.ok(ray.intersectObject(source, true).length)
  } finally { disposeTwinScene(built) }
  const store = createSemanticSpaceStore({ indexedDB, databaseName: 'contour-' + crypto.randomUUID() })
  await store.save(doc, null); await store.save(refined, doc.revision)
  assert.deepEqual(await importSemanticSpace(await exportSemanticSpacePackage(refined), store), refined)
  assert.throws(() => applySpaceAction(refined, { ...action, requestId: 'request:stale' }), /Space changed/)
  assert.throws(() => applySpaceAction(doc, { ...action, template: 'box' }), /silhouette/)
  assert.throws(() => applySpaceAction(doc, { ...action, silhouette: undefined }), /silhouette/)
  const hidden = applySpaceAction(doc, { operation: 'control-twin', requestId: 'request:hide',
    expectedRevision: doc.revision, entityId: binding.entityId, controlId: 'visible', value: false })
  const refinedHidden = applySpaceAction(hidden, { ...action, expectedRevision: hidden.revision })
  assert.equal(refinedHidden.twin!.objects[0].recipe.values.visible, false)
  assert.equal(hidden.twin!.objects[0].template, 'box', 'refinement must not mutate the saved input')
})
