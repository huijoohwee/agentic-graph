import { SEMANTIC_TWIN_PROCEDURAL_TEMPLATES } from '../semanticTwinTemplates.mjs'
import { SEMANTIC_SPACE_CONTROL_SCHEMA } from '@/features/agent-ready/semanticSpaceAgentReadyContract.mjs'
import { analyzeImageToGlbReference } from '@/features/image-to-glb/imageToGlbReferenceAnalysis'
import { deriveContourRebuildPlan } from '@/features/image-to-glb/imageToGlbContourRebuild'
import test from 'node:test'
import assert from 'node:assert/strict'
import { indexedDB } from 'fake-indexeddb'
import { analyzeSemanticImage, mapFocusedProposals, describeChosenImageRegion } from '../semanticImagePerception'
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


test('focus remaps different photo aspects without losing source coordinates or silhouette pixels', () => {
  const result = analyzeSemanticImage(fixture()), before = JSON.stringify(result)
  for (const focus of [{ x: 0.25, y: 0.1, width: 0.5, height: 0.7 }, { x: 0.01, y: 0.7, width: 0.1, height: 0.2 }]) {
    const mapped = mapFocusedProposals(result, focus)
    mapped.proposals.forEach((item, index) => {
      assert.equal(item.region.x, focus.x + result.proposals[index].region.x * focus.width)
      assert.equal(item.region.y, focus.y + result.proposals[index].region.y * focus.height)
      assert.deepEqual(item.silhouette, result.proposals[index].silhouette)
      assert.ok(item.region.x + item.region.width <= 1 && item.region.y + item.region.height <= 1)
    })
  }
  assert.equal(JSON.stringify(result), before)
  assert.throws(() => mapFocusedProposals(result, { x: 0.8, y: 0, width: 0.5, height: 1 }), /inside/)
  const chosen = describeChosenImageRegion(fixture())
  assert.equal(chosen.background, 'user-region')
  assert.equal(chosen.proposals.length, 1)
  assert.equal(chosen.proposals[0].silhouette, undefined, 'an authored area must not claim an observed outline')
})

test('outdoor templates compile from arbitrary image crops, persist, and match structured/slash contracts', async () => {
  const input = await action()
  const buildSchema = SEMANTIC_SPACE_CONTROL_SCHEMA.oneOf.find(item => item.properties.operation?.const === 'build')!
  assert.deepEqual(buildSchema.properties.template.enum, SEMANTIC_TWIN_PROCEDURAL_TEMPLATES)
  for (const template of SEMANTIC_TWIN_PROCEDURAL_TEMPLATES) {
    const next = applySpaceAction(newSpaceDocument('space:outdoor'), { ...input,
      proposals: [{ ...input.proposals[0], template, label: `Reviewed ${template}` }] })
    assert.equal(next.twin!.objects[0].template, template)
    if (template === 'tree') {
      assert.equal(next.twin!.objects[0].recipe.parts.find(item => item.id === 'canopy')!.color, input.proposals[0].color)
      assert.equal(next.twin!.objects[0].recipe.parts.find(item => item.id === 'trunk')!.color, '#99764e')
    }
    if (template === 'cloud') assert.ok(next.twin!.objects[0].recipe.parts.every(item => item.color === input.proposals[0].color))
    assert.equal(validateSpaceDocument(JSON.parse(JSON.stringify(next))).twin!.objects[0].template, template)
    const built = buildTwinScene(next.twin!.objects)
    try {
      assert.equal(built.error, null, template)
      let triangles = 0, meshes = 0
      built.objects[0].source.traverse(item => { if ((item as THREE.Mesh).isMesh) {
        meshes++; const geometry = (item as THREE.Mesh).geometry
        triangles += (geometry.index?.count || geometry.getAttribute('position').count) / 3
      } })
      assert.ok(meshes >= 1 && triangles > 0 && triangles < 30_000)
      if (['building', 'tree', 'river', 'cloud', 'landscape'].includes(template)) assert.ok(meshes > 1)
      if (template === 'sea' || template === 'river') assert.equal(next.twin!.objects[0].size[1], 0.12)
    } finally { disposeTwinScene(built) }
    const invocation = parseSemanticSpaceInvocation(`/space.build @entity:test #procedural-asset template=${template} width=2 height=1 depth=1 x=0 z=0`)
    assert.equal(invocation.operation, 'build')
    assert.equal((invocation as { template: string }).template, template)
  }
})

test('fine contour sampling retains more outline detail under the existing source and triangle caps', () => {
  const width = 96, height = 96, data = new Uint8ClampedArray(width * height * 4)
  for (let y = 4; y < 92; y++) {
    const left = 20 + Math.round(7 * Math.sin(y / 4))
    for (let x = left; x < 75; x++) data.set([90, 140, 110, 255], (y * width + x) * 4)
  }
  const pixels = { width, height, sourceWidth: width, sourceHeight: height, data }
  const standard = deriveContourRebuildPlan(analyzeImageToGlbReference(pixels))
  const fine = deriveContourRebuildPlan(analyzeImageToGlbReference(pixels, { detail: 'fine' }), { detail: 'fine' })
  assert.ok(fine.quality.rawSpanCount > standard.quality.rawSpanCount)
  assert.ok(fine.quality.outlinePointCount > standard.quality.outlinePointCount)
  assert.ok(fine.quality.withinBudgets && fine.quality.retainedAreaRatio >= 0.9)
  assert.ok(fine.components.every(item => item.bevel! < 0.01))
})


test('chosen continuous surfaces preserve authored provenance and elevated placement through packages', async () => {
  const input = await action(), proposal = describeChosenImageRegion(fixture()).proposals[0]
  const next = applySpaceAction(newSpaceDocument('space:elevated'), { ...input, proposals: [{ ...proposal, template: 'cloud' }] })
  assert.equal(next.entities[0].proposalMethod, 'user-selected-region-v1')
  assert.equal(next.twin!.objects[0].position[1], 2)
  const built = buildTwinScene(next.twin!.objects)
  try { assert.equal(built.error, null); assert.equal(built.objects[0].wrapper.position.y, 2) } finally { disposeTwinScene(built) }
  const edited = applySpaceAction(next, { operation: 'edit-twin', requestId: 'request:elevation', expectedRevision: next.revision,
    entityId: next.entities[0].id, size: next.twin!.objects[0].size, position: [0, 3, 0] })
  assert.equal(validateSpaceDocument(JSON.parse(JSON.stringify(edited))).twin!.objects[0].position[1], 3)
  assert.throws(() => applySpaceAction(next, { operation: 'edit-twin', requestId: 'request:invalid-height', expectedRevision: next.revision,
    entityId: next.entities[0].id, size: next.twin!.objects[0].size, position: [0, -1, 0] }))
  const parsed = parseSemanticSpaceInvocation('/space.build @entity:test #procedural-asset template=sun width=1 height=1 depth=1 x=0 z=0 elevation=3')
  assert.ok(parsed.operation === 'build')
  assert.deepEqual(parsed.position, [0, 3, 0])
})
