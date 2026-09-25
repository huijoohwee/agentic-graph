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
import { copyImageModelsToSpace, replaceableImageRegionIds } from '../semanticImageTwinCompiler'
import { positionTwinBeside } from '../semanticTwinRuntime'
import { semanticObjectCameraFit } from '../semanticObjectView'
import { readModelAssetCameraPose } from '@/features/three/modelAssetCameraPose'

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


test('whole-image relief covers landscape, portrait and uniform photos and makes a closed editable solid', async () => {
  const { describeImageRelief } = await import('../semanticImagePerception')
  const { buildSolidRasterRelief } = await import('@/features/image-to-threejs/imageRasterReliefGeometry')
  const { validateRasterRelief } = await import('@/features/image-to-threejs/imageRasterReliefField')
  for (const [width, height] of [[192, 108], [48, 192], [80, 80]]) {
    const pixels = { width, height, sourceWidth: width, sourceHeight: height, data: new Uint8ClampedArray(width * height * 4).fill(255) }
    const uniform = describeImageRelief(pixels)
    assert.equal(uniform.proposals.length, 1)
    assert.deepEqual(uniform.proposals[0].region, { x: 0, y: 0, width: 1, height: 1 })
    assert.ok(uniform.proposals[0].relief!.samples.every(n => n === 255))
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const value = Math.round(x / (width - 1) * 255)
      pixels.data.set([value, value, value, 255], (y * width + x) * 4)
    }
    const proposals = describeImageRelief(pixels).proposals, field = proposals[0].relief!
    assert.deepEqual(proposals, describeImageRelief(pixels).proposals)
    assert.ok(field.width <= 65 && field.height <= 65)
    const solid = buildSolidRasterRelief(field, 4, 4 * height / width)
    try {
      const positions = solid.getAttribute('position'), indices = solid.index!
      assert.ok(Array.from(positions.array).every(Number.isFinite))
      assert.ok(positions.getZ(field.width - 1) > positions.getZ(0), 'brightness changes actual vertex depth')
      const edges = new Map<string, number>(), direction = new Map<string, number>()
      for (let i = 0; i < indices.count; i += 3) for (let e = 0; e < 3; e++) {
        const a = indices.getX(i + e), b = indices.getX(i + (e + 1) % 3), key = [Math.min(a,b), Math.max(a,b)].join(':')
        edges.set(key, (edges.get(key) || 0) + 1); direction.set(key, (direction.get(key) || 0) + (a < b ? 1 : -1))
      }
      assert.ok([...edges.values()].every(n => n === 2), 'front, sides and back must form a closed manifold')
      assert.ok([...direction.values()].every(n => n === 0), 'shared edges must have opposite winding')
      assert.ok(indices.count / 3 < 17_000)
    } finally { solid.dispose() }
    const input = await action(), doc = applySpaceAction(newSpaceDocument('space:relief'), { ...input, proposals })
    const built = buildTwinScene(doc.twin!.objects)
    try { assert.equal(built.error, null) } finally { disposeTwinScene(built) }
    const store = createSemanticSpaceStore({ indexedDB, databaseName: `relief-${crypto.randomUUID()}` })
    assert.deepEqual(await importSemanticSpace(await exportSemanticSpacePackage(doc), store), doc)
    assert.throws(() => validateRasterRelief({ ...field, samples: [NaN] }), /Invalid/)
    assert.throws(() => validateRasterRelief({ ...field, width: 66 }), /Invalid/)
  }
  assert.deepEqual(parseSemanticSpaceInvocation('/space.analyze @observation:test #relief'),
    { operation: 'analyze', observationId: 'observation:test', relief: true })
})

test('individual object marks atomically replace automatic merged groups with independent selectable meshes', async () => {
  const input = await action()
  const coarse = applySpaceAction(newSpaceDocument('space:individual'), { ...input,
    proposals: [{ ...input.proposals[0], template: 'box', region: { x: 0, y: .1, width: 1, height: .8 } },
      { ...input.proposals[1], template: 'box', source: 'user-region' }] })
  const before = JSON.stringify(coarse), parent = coarse.entities[0].id, authored = coarse.entities[1].id
  assert.deepEqual(replaceableImageRegionIds(coarse, input.observation.sha256), [parent])
  assert.deepEqual(replaceableImageRegionIds(coarse, 'f'.repeat(64)), [])
  const split = { ...input, requestId: 'request:individual', expectedRevision: coarse.revision,
    observation: { ...input.observation, id: 'observation:individual' }, replaceEntityIds: [parent],
    proposals: Array.from({ length: 4 }, (_, index) => ({ ...describeChosenImageRegion(fixture()).proposals[0],
      label: `Marked building ${index + 1}`, template: 'box' as const,
      region: { x: .05 + index * .22, y: .3, width: .08, height: .3 } })) }
  const next = applySpaceAction(coarse, split)
  assert.equal(next.twin!.objects.length, 5)
  assert.ok(!next.twin!.objects.some(item => item.entityId === parent), 'the monolithic model is removed from the active scene')
  assert.ok(next.entities.some(item => item.id === parent), 'original region evidence remains available')
  assert.deepEqual(next.twin!.objects.find(item => item.entityId === authored), coarse.twin!.objects[1])
  assert.ok(next.entities.slice(-4).every(item => item.proposalMethod === 'user-selected-region-v1'))
  const children = next.twin!.objects.filter(item => item.observationId === split.observation.id)
  const built = buildTwinScene(children)
  try {
    assert.equal(built.error, null); assert.equal(built.objects.length, 4)
    for (const object of built.objects) {
      object.wrapper.updateMatrixWorld(true)
      const [x, y, z] = object.binding.position
      const ray = new THREE.Raycaster(new THREE.Vector3(x, y + object.binding.size[1] / 2, z + 5), new THREE.Vector3(0, 0, -1))
      const hits = built.objects.filter(candidate => ray.intersectObject(candidate.wrapper, true).length > 0)
      assert.equal(hits.length, 1); assert.equal(hits[0].binding.entityId, object.binding.entityId)
    }
  } finally { disposeTwinScene(built) }
  assert.deepEqual(validateSpaceDocument(JSON.parse(JSON.stringify(next))), next)
  assert.equal(applySpaceAction(next, split), next, 'the same reviewed batch is idempotent')
  for (const replaceEntityIds of [[authored], ['entity:unknown'], [parent, parent]]) {
    assert.throws(() => applySpaceAction(coarse, { ...split, replaceEntityIds }), /matching automatic/)
  }
  assert.throws(() => applySpaceAction(coarse, { ...split,
    observation: { ...split.observation, sha256: 'f'.repeat(64) } }), /matching automatic/)
  assert.throws(() => applySpaceAction(coarse, { ...split,
    proposals: [{ ...split.proposals[0], region: { x: .9, y: 0, width: .5, height: .2 } }] }))
  assert.equal(JSON.stringify(coarse), before, 'invalid or successful replacement never mutates the input')
})

test('contiguous marked blocks keep crop proportions, touch without fusion, and retain independent ray hits', async () => {
  const input = await action(), original = newSpaceDocument('space:row')
  const row = { ...input, layout: 'contiguous-row' as const, proposals: Array.from({ length: 4 }, (_, index) => ({
    ...describeChosenImageRegion(fixture()).proposals[0], template: 'box' as const,
    region: { x: index * .2, y: .2, width: .06 + index * .02, height: .4 },
  })) }
  const next = applySpaceAction(original, row), bindings = next.twin!.objects
  const fit = semanticObjectCameraFit(bindings)!
  assert.ok(Math.abs(Math.max(...fit.scaledSize) - 100) < 1e-6, 'small contiguous blocks fill the model view')
  const pose = readModelAssetCameraPose(fit)
  assert.deepEqual(pose.target, fit.cameraTarget)
  const enlarged = semanticObjectCameraFit(bindings.map(binding => ({ ...binding,
    size: binding.size.map(value => value * 2) as [number, number, number],
    position: binding.position.map(value => value * 2) as [number, number, number] })))!
  assert.deepEqual(enlarged.scaledSize, fit.scaledSize, 'camera framing is independent of arbitrary authoring units')
  assert.deepEqual(enlarged.cameraTarget, fit.cameraTarget)
  const built = buildTwinScene(bindings)
  try {
    assert.equal(built.error, null)
    for (const [index, item] of built.objects.entries()) {
      const binding = item.binding
      assert.equal(binding.size[2], binding.size[0], 'authored footprint scales with width, not a fixed slab depth')
      assert.equal(binding.position[2] + binding.size[2] / 2, 0, 'front faces align')
      if (index) {
        const previous = bindings[index - 1]
        assert.ok(Math.abs(previous.position[0] + previous.size[0] / 2 - binding.position[0] + binding.size[0] / 2) < 1e-6)
      }
      built.objects.forEach(candidate => candidate.wrapper.updateMatrixWorld(true))
      const ray = new THREE.Raycaster(new THREE.Vector3(binding.position[0], binding.size[1] / 2, 5), new THREE.Vector3(0, 0, -1))
      assert.deepEqual(built.objects.filter(candidate => ray.intersectObject(candidate.wrapper, true).length)
        .map(candidate => candidate.binding.entityId), [binding.entityId])
      assert.equal(binding.evidenceSha256, input.observation.sha256)
    }
  } finally { disposeTwinScene(built) }
  const store = createSemanticSpaceStore({ indexedDB, databaseName: `row-${crypto.randomUUID()}` })
  assert.deepEqual(await importSemanticSpace(await exportSemanticSpacePackage(next), store), next)
  assert.throws(() => applySpaceAction(original, { ...row, layout: 'fused' as never }), /layout/)
  assert.throws(() => applySpaceAction(original, { ...row,
    proposals: row.proposals.map(item => ({ ...item, region: { x: 0, y: 0, width: .8, height: .8 } })) }), /row exceeds/)
  assert.equal(original.entities.length, 0)
})

test('neighbor placement supports contact and gaps without modifying other objects or accepting stale writes', async () => {
  const input = await action(), next = applySpaceAction(newSpaceDocument('space:join'), { ...input,
    proposals: input.proposals.map(item => ({ ...item, template: 'box' as const })) })
  const [first, second] = next.twin!.objects, room = next.twin!.room
  const anchor = { size: [1, 2, 2] as const, position: [0, 1, 0] as const }
  assert.deepEqual(positionTwinBeside([1, 1, 1], anchor, 'left', 0, room), [-1, 1, .5])
  assert.deepEqual(positionTwinBeside([1, 1, 1], anchor, 'right', .25, room), [1.25, 1, .5])
  assert.deepEqual(positionTwinBeside([1, 1, 1], anchor, 'front', 0, room), [0, 1, 1.5])
  assert.deepEqual(positionTwinBeside([1, 1, 1], anchor, 'back', 0, room), [0, 1, -1.5])
  for (const gap of [-.1, NaN, Infinity, 3]) assert.throws(() => positionTwinBeside([1, 1, 1], anchor, 'right', gap, room))
  assert.throws(() => positionTwinBeside([1, 1, 1], { ...anchor, position: [3.5, 0, 0] }, 'right', 0, room), /beyond/)
  const position = positionTwinBeside(first.size, second, 'right', 0, room)
  const edit = { operation: 'edit-twin' as const, requestId: 'request:join', expectedRevision: next.revision,
    entityId: first.entityId, size: first.size, position }
  const joined = applySpaceAction(next, edit)
  assert.deepEqual(joined.twin!.objects[1], second)
  assert.deepEqual(joined.entities, next.entities)
  assert.deepEqual(joined.twin!.objects[0].position, position)
  assert.throws(() => applySpaceAction(joined, { ...edit, requestId: 'request:stale-join' }), /changed/)
  assert.deepEqual(validateSpaceDocument(JSON.parse(JSON.stringify(joined))), joined)
})


test('detail pass separates touching contrasts, leaves uniform objects intact, and never mutates pixels', async () => {
  const width = 96, height = 48, data = new Uint8ClampedArray(width * height * 4).fill(255)
  const colors = [[30, 20, 80], [180, 30, 30], [20, 140, 30], [30, 50, 190], [150, 100, 30], [80, 30, 130]]
  for (let y = 8; y < 40; y++) for (let x = 6; x < 90; x++) data.set([...colors[Math.floor((x - 6) / 14)], 255], (y * width + x) * 4)
  const pixels = { width, height, sourceWidth: width, sourceHeight: height, data }, before = data.slice()
  assert.equal(analyzeSemanticImage(pixels).proposals.length, 1)
  const detailed = analyzeSemanticImage(pixels, { detail: true })
  assert.equal(detailed.proposals.length, 6)
  assert.deepEqual(detailed, analyzeSemanticImage(pixels, { detail: true }))
  assert.deepEqual(data, before)
  assert.equal(detailed.proposals.reduce((sum, item) => sum + item.coverage, 0), 84 * 32 / (width * height))
  const input = await action(), next = applySpaceAction(newSpaceDocument('space:details'), { ...input,
    proposals: detailed.proposals.map(item => ({ ...item, template: 'box' })) })
  const built = buildTwinScene(next.twin!.objects)
  try {
    assert.equal(built.error, null)
    assert.equal(built.objects.length, 6)
    for (const object of built.objects) {
      object.wrapper.updateWorldMatrix(true, true)
      const bounds = new THREE.Box3().setFromObject(object.wrapper), center = bounds.getCenter(new THREE.Vector3())
      const ray = new THREE.Raycaster(new THREE.Vector3(center.x, center.y, bounds.max.z + 1), new THREE.Vector3(0, 0, -1))
      assert.ok(ray.intersectObject(object.wrapper, true).length > 0)
    }
  } finally { disposeTwinScene(built) }
  // Color-free subdivisions would invent extra objects; refinement needs actual contrast.
  for (let y = 8; y < 40; y++) for (let x = 6; x < 90; x++) data.set([30, 20, 80, 255], (y * width + x) * 4)
  assert.equal(analyzeSemanticImage(pixels, { detail: true }).proposals.length, 1)
})

test('detail proposals stay within worker, region and focus budgets on varied image aspects', () => {
  for (const [width, height] of [[192, 96], [96, 192], [192, 192]]) {
    const data = new Uint8ClampedArray(width * height * 4).fill(255)
    for (let y = 5; y < height - 5; y++) for (let x = 5; x < width - 5; x++) {
      data.set([20 + Math.round(x / width * 150), 20 + Math.round(y / height * 100), 30, 255], (y * width + x) * 4)
    }
    const result = analyzeSemanticImage({ width, height, sourceWidth: width, sourceHeight: height, data }, { detail: true })
    assert.ok(result.proposals.length > 1 && result.proposals.length <= 12)
    const focus = { x: 0.25, y: 0.2, width: 0.5, height: 0.4 }
    for (const proposal of mapFocusedProposals(result, focus).proposals) {
      assert.ok(proposal.region.x >= focus.x && proposal.region.y >= focus.y)
      assert.ok(proposal.region.x + proposal.region.width <= focus.x + focus.width + 1e-9)
      assert.ok(proposal.region.y + proposal.region.height <= focus.y + focus.height + 1e-9)
      if (proposal.silhouette) validateTwinSilhouette(proposal.silhouette)
    }
  }
})

test('image-only space copies preserve models and evidence while keeping the full previous space recoverable', async () => {
  const input = await action()
  let original = applySpaceAction(newSpaceDocument('space:multi-image'), { ...input,
    proposals: input.proposals.map(item => ({ ...item, template: 'box' })) })
  const secondImage = 'data:image/png;base64,' + btoa(atob(imageDataUrl.split(',')[1]) + String.fromCharCode(0))
  original = applySpaceAction(original, { ...input, requestId: 'request:other-image', expectedRevision: original.revision,
    observation: { ...input.observation, id: 'observation:other-image', imageDataUrl: secondImage, sha256: await hashSpaceImage(secondImage) },
    proposals: [{ ...input.proposals[0], template: 'building' }] })
  const before = JSON.stringify(original), copy = copyImageModelsToSpace(original, input.observation.sha256, 'space:image-copy')
  assert.equal(validateSpaceDocument(copy), copy)
  assert.equal(copy.twin!.objects.length, 2)
  assert.equal(copy.entities.length, 2)
  assert.deepEqual(copy.observations, original.observations)
  for (const [i, model] of copy.twin!.objects.entries()) {
    assert.notEqual(model.entityId, original.twin!.objects[i].entityId)
    assert.deepEqual({ ...model, entityId: original.twin!.objects[i].entityId }, original.twin!.objects[i])
  }
  assert.equal(JSON.stringify(original), before)
  assert.throws(() => copyImageModelsToSpace(original, input.observation.sha256, original.id), /new valid/)
  assert.throws(() => copyImageModelsToSpace(original, 'f'.repeat(64), 'space:empty'), /Build/)
  const databaseName = `copy-${crypto.randomUUID()}`, store = createSemanticSpaceStore({ indexedDB, databaseName })
  await importSemanticSpace(await exportSemanticSpacePackage(original), store)
  assert.deepEqual(await importSemanticSpace(await exportSemanticSpacePackage(copy), store), copy)
  assert.deepEqual(await store.read(), copy)
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
  })
  try {
    const backup = await new Promise<{ document: typeof original }>((resolve, reject) => {
      const request = db.transaction('bundles', 'readonly').objectStore('bundles').get(`semantic-space:backup:${original.id}`)
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    assert.deepEqual(backup.document, original)
  } finally { db.close() }
})
