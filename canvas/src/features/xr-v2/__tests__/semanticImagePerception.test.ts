import test from 'node:test'
import assert from 'node:assert/strict'
import { indexedDB } from 'fake-indexeddb'
import { analyzeSemanticImage } from '../semanticImagePerception'
import { applySpaceAction, hashSpaceImage, newSpaceDocument, validateSpaceDocument } from '../semanticSpaceRuntime'
import { createSemanticSpaceStore, exportSemanticSpacePackage, importSemanticSpace } from '../semanticSpaceStore'
import * as THREE from 'three'
import { buildTwinScene, disposeTwinScene } from '../semanticTwinScene'
import { validateTwinSilhouette } from '../semanticTwinSilhouette'
import { parseSemanticSpaceInvocation } from '@/features/agent-ready/semanticSpaceWebMcpTools'

function fixture() {
  const width = 64, height = 32, data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (const [left, top, right, bottom, color] of [
    [4, 5, 18, 25, [220, 20, 20]], [40, 8, 57, 27, [20, 30, 220]],
  ] as const) for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    data.set([...color, 255], (y * width + x) * 4)
  }
  return { width, height, sourceWidth: width, sourceHeight: height, data }
}
const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Q4t0AAAAASUVORK5CYII='
async function action() {
  return { operation: 'confirm-image-regions' as const, requestId: 'request:regions', expectedRevision: 0,
    observation: { id: 'observation:test', capturedAtMs: 1, width: 1, height: 1, imageDataUrl,
      sha256: await hashSpaceImage(imageDataUrl), orientation: 'source-pixels' as const, scale: 'unknown' as const },
    proposals: analyzeSemanticImage(fixture()).proposals }
}

test('CPU pixel perception is deterministic, bounded, and preserves original normalized coordinates', () => {
  const pixels = fixture(), before = pixels.data.slice()
  const result = analyzeSemanticImage(pixels)
  assert.deepEqual(result, analyzeSemanticImage(pixels))
  assert.deepEqual(pixels.data, before)
  assert.equal(result.proposals.length, 2)
  assert.deepEqual(result.proposals[0].region, { x: 40 / 64, y: 8 / 32, width: 17 / 64, height: 19 / 32 })
  assert.equal(result.proposals[0].color, '#141edc')
  assert.throws(() => analyzeSemanticImage({ ...pixels, width: 193 }), /192/)
  assert.throws(() => analyzeSemanticImage({ ...pixels, data: new Uint8ClampedArray(pixels.data.length).fill(255) }), /foreground/)
})

test('reviewed pixel regions compile to editable CPU geometry and atomically round trip with evidence', async () => {
  const input = await action(), original = newSpaceDocument('space:test')
  const next = applySpaceAction(original, input)
  assert.equal(original.entities.length, 0)
  assert.equal(next.revision, 1)
  assert.equal(next.entities.length, 2)
  assert.equal(next.entities[0].proposalMethod, 'local-foreground-components-v1')
  assert.equal(next.twin?.room.unit, 'arbitrary')
  assert.deepEqual(next, applySpaceAction(original, input))
  assert.equal(applySpaceAction(next, input), next)
  for (const binding of next.twin!.objects) {
    assert.equal(binding.evidenceSha256, input.observation.sha256)
    assert.equal(binding.size[2], 0.4)
    assert.equal(binding.template, 'contour')
    const built = buildTwinScene([binding])
    try {
      assert.equal(built.error, null)
      const meshes: THREE.Mesh[] = []
      built.objects[0].source.traverse(item => { if ((item as THREE.Mesh).isMesh) meshes.push(item as THREE.Mesh) })
      assert.ok(meshes.length > 0)
      assert.ok(meshes.every(mesh => mesh.geometry.type === 'ExtrudeGeometry'))
    } finally { disposeTwinScene(built) }
  }
  const store = createSemanticSpaceStore({ indexedDB, databaseName: `perception-${crypto.randomUUID()}` })
  await store.save(next, null)
  assert.deepEqual(await store.read(), next)
  assert.deepEqual(await importSemanticSpace(await exportSemanticSpacePackage(next), store), next)
})

test('invalid, stale, metric and over-budget proposals cannot partially mutate a space', async () => {
  const input = await action(), doc = newSpaceDocument('space:guards')
  for (const proposals of [[], Array(13).fill(input.proposals[0]),
    [{ ...input.proposals[0], region: { ...input.proposals[0].region, x: NaN } }],
    [{ ...input.proposals[0], region: { x: 0.9, y: 0, width: 0.5, height: 0.2 } }],
    [{ ...input.proposals[0], color: 'external:url' }]]) {
    assert.throws(() => applySpaceAction(doc, { ...input, proposals }))
    assert.equal(doc.entities.length, 0)
  }
  assert.throws(() => applySpaceAction(doc, { ...input, expectedRevision: 1 }), /changed/)
  const metric = applySpaceAction(doc, { operation: 'set-room', requestId: 'request:metric', expectedRevision: 0,
    room: { width: 8, depth: 8, unit: 'authored-metres' } })
  assert.throws(() => applySpaceAction(metric, { ...input, expectedRevision: 1 }), /arbitrary units/)
  const next = applySpaceAction(doc, input)
  assert.throws(() => validateSpaceDocument({ ...next, entities: [{ ...next.entities[0], proposalMethod: 'neural-depth' }] }))
  assert.deepEqual(parseSemanticSpaceInvocation('/space.analyze @observation:test #regions'),
    { operation: 'analyze', observationId: 'observation:test' })
})

test('new region volumes retain the pixel crop aspect instead of independently clamping both axes', async () => {
  const input = await action()
  const next = applySpaceAction(newSpaceDocument('space:aspect'), { ...input,
    observation: { ...input.observation, width: 1024, height: 576 } })
  next.twin!.objects.forEach((binding, index) => {
    const region = input.proposals[index].region
    assert.ok(Math.abs(binding.size[0] / binding.size[1] - region.width * 1024 / (region.height * 576)) < 1e-6)
  })
})


test('visible silhouette makes actual contour meshes with leg gaps; chosen chair uses the existing part builder', async () => {
  const width = 64, height = 64, data = new Uint8ClampedArray(width * height * 4)
  for (let y = 5; y < 59; y++) for (let x = 8; x < 56; x++) {
    if (y < 32 || x < 16 || x >= 48) data.set([100, 140, 180, 255], (y * width + x) * 4)
  }
  const proposals = analyzeSemanticImage({ width, height, sourceWidth: width, sourceHeight: height, data }).proposals
  assert.equal(proposals.length, 1)
  const input = await action(), doc = applySpaceAction(newSpaceDocument('space:shape'), { ...input, proposals })
  const built = buildTwinScene(doc.twin!.objects)
  try {
    assert.equal(built.error, null)
    const source = built.objects[0].source
    source.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(source), size = bounds.getSize(new THREE.Vector3())
    const ray = new THREE.Raycaster(new THREE.Vector3(0, size.y * 0.2, 10), new THREE.Vector3(0, 0, -1))
    assert.equal(ray.intersectObject(source, true).length, 0, 'leg gap must remain empty geometry')
    ray.ray.origin.x = -size.x * 0.42
    assert.ok(ray.intersectObject(source, true).length > 0, 'a leg must contain real triangles')
  } finally { disposeTwinScene(built) }
  const chair = applySpaceAction(newSpaceDocument('space:chair'), { ...input,
    proposals: [{ ...proposals[0], label: 'Reviewed chair', template: 'chair' }] })
  assert.equal(chair.entities[0].category, 'chair')
  assert.equal(chair.twin!.objects[0].recipe.parts.length, 6)
  assert.equal(chair.twin!.objects[0].silhouette, undefined)
  for (const shape of [{ width: 193, height: 3, runs: [[0, 0, 1]] },
    { width: 8, height: 8, runs: [[0, 0, 5], [3, 0, 1]] },
    { width: 8, height: 8, runs: [[7, 0, 2]] }]) assert.throws(() => validateTwinSilhouette(shape))
})
