import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { indexedDB } from 'fake-indexeddb'
import { createProceduralAssetFromText } from '@/features/image-to-glb/proceduralAssetTextRecipe'
import { buildProceduralAsset, disposeProceduralAsset } from '@/features/image-to-glb/proceduralAssetBuilder'
import { withGlbExporterFileReader } from '@/tests/lib/glbExporterFileReaderHarness'
import { exportWithGltfExporter } from '@/features/image-to-glb/proceduralAssetExportPrimitives'
import { inspectGlbBytes } from '@/lib/assets/gltfFormat'
import { SEMANTIC_SPACE_CONTROL_SCHEMA } from '@/features/agent-ready/semanticSpaceAgentReadyContract.mjs'
import { parseSemanticSpaceInvocation } from '@/features/agent-ready/semanticSpaceWebMcpTools'
import { describeChosenImageRegion } from '../semanticImagePerception'
import { applySpaceAction, hashSpaceImage, newSpaceDocument } from '../semanticSpaceRuntime'
import { createSemanticSpaceStore, exportSemanticSpacePackage, importSemanticSpace } from '../semanticSpaceStore'
import { buildTwinScene, disposeTwinScene } from '../semanticTwinScene'
import { projectTwinOnPhoto } from '../semanticTwinPhotoProjection'
import { photoDimensions } from '@/features/immersive-media/immersivePhotoProjection'
import type { TwinTemplate } from '../semanticTwinRuntime'

const shapes = ['landscape', 'sea', 'river', 'aircraft', 'ship', 'car'] as const
const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Q4t0AAAAASUVORK5CYII='
async function input(templates: readonly TwinTemplate[] = shapes) {
  const observation = { id: 'observation:surfaces', capturedAtMs: 1, width: 120, height: 80, imageDataUrl,
    sha256: await hashSpaceImage(imageDataUrl), orientation: 'source-pixels' as const, scale: 'unknown' as const }
  // Uniform synthetic pixels deliberately have no foreground contrast or identifiable objects.
  const pixels = { width: 16, height: 16, sourceWidth: 16, sourceHeight: 16, data: new Uint8ClampedArray(16 * 16 * 4).fill(40) }
  const chosen = describeChosenImageRegion(pixels).proposals[0]
  return { operation: 'confirm-image-regions' as const, requestId: 'request:surfaces', expectedRevision: 0, observation,
    proposals: templates.map((template, index) => ({ ...chosen, template, label: 'Authored ' + template,
      region: { x: (index % 3) / 3, y: Math.floor(index / 3) / 2, width: 0.2, height: 0.25 } })) }
}

test('terrain and transport use deterministic shared recipes, real parts and bounded GLB output', async () => {
  for (const shape of shapes) {
    const recipe = createProceduralAssetFromText(shape + ' blue')
    assert.deepEqual(recipe, createProceduralAssetFromText(shape + ' blue'))
    const built = buildProceduralAsset(recipe)
    try {
      assert.equal(built.evidence.providerCalls, 0)
      assert.ok(built.evidence.triangles > 12 && built.evidence.triangles < 6000)
      const bounds = new THREE.Box3().setFromObject(built.scene)
      assert.ok(bounds.getSize(new THREE.Vector3()).toArray().every(value => value > 0 && Number.isFinite(value)))
      if (shape === 'aircraft') assert.ok(built.scene.getObjectByName('Part-wings'))
      if (shape === 'ship') assert.ok(built.scene.getObjectByName('Part-hull'))
      if (shape === 'car') assert.equal(recipe.parts.filter(part => part.id.startsWith('wheel-')).length, 4)
      const bytes = await withGlbExporterFileReader(() => exportWithGltfExporter(built.scene, true))
      assert.ok(bytes instanceof ArrayBuffer && bytes.byteLength < 1_000_000)
      assert.equal(inspectGlbBytes(bytes as ArrayBuffer).validContainer, true)
    } finally { disposeProceduralAsset(built.scene) }
  }
})

test('all six reviewed kinds retain independent selections, evidence and packages without replacing earlier models', async () => {
  const original = newSpaceDocument('space:surfaces')
  const priorInput = await input(['box'])
  const prior = applySpaceAction(original, { ...priorInput, requestId: 'request:prior',
    observation: { ...priorInput.observation, id: 'observation:prior' } })
  const nextInput = await input()
  const next = applySpaceAction(prior, { ...nextInput, expectedRevision: prior.revision })
  assert.deepEqual(next.twin!.objects[0], prior.twin!.objects[0])
  assert.equal(next.twin!.objects.length, 7)
  assert.equal(next.twin!.objects.reduce((sum, item) => sum + item.recipe.parts.length, 0), 23)
  assert.equal(new Set(next.twin!.objects.map(item => item.entityId)).size, 7)
  assert.ok(next.entities.every(item => item.proposalMethod === 'user-selected-region-v1'))
  const built = buildTwinScene(next.twin!.objects.slice(1))
  try {
    assert.equal(built.error, null)
    for (const item of built.objects) {
      item.wrapper.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(item.wrapper), center = bounds.getCenter(new THREE.Vector3())
      const ray = new THREE.Raycaster(new THREE.Vector3(center.x, bounds.max.y + 1, center.z), new THREE.Vector3(0, -1, 0))
      assert.ok(ray.intersectObject(item.wrapper, true).length, item.binding.template + ' must be selectable geometry')
      assert.equal(item.binding.evidenceSha256, nextInput.observation.sha256)
    }
  } finally { disposeTwinScene(built) }
  assert.equal(next.twin!.objects.find(item => item.template === 'aircraft')!.position[1], 2)
  for (const item of next.twin!.objects.filter(item => ['sea', 'river'].includes(item.template))) assert.equal(item.size[1], 0.12)
  const store = createSemanticSpaceStore({ indexedDB, databaseName: 'transport-' + crypto.randomUUID() })
  await store.save(prior, null)
  await store.save(next, prior.revision)
  assert.deepEqual(await importSemanticSpace(await exportSemanticSpacePackage(next), store), next)
  const before = JSON.stringify(next)
  assert.throws(() => applySpaceAction(next, { ...nextInput, requestId: 'request:overflow', expectedRevision: next.revision,
    observation: { ...nextInput.observation, id: 'observation:overflow' }, proposals: nextInput.proposals.slice(3) }), /budget/)
  assert.equal(JSON.stringify(next), before)
})

test('transport shapes share the headless schema and slash invocation with the UI registry', () => {
  const schema = JSON.stringify(SEMANTIC_SPACE_CONTROL_SCHEMA)
  for (const template of shapes) {
    assert.ok(schema.includes('"' + template + '"'))
    assert.deepEqual(parseSemanticSpaceInvocation(`/space.build @entity:test #procedural-asset template=${template} width=1 height=1 depth=1 x=0 z=0`),
      { operation: 'build', entityId: 'entity:test', template, size: [1, 1, 1], position: [0, 0, 0] })
  }
})

test('terrain photo projection uses its footprint and cannot cover foreground object faces', async () => {
  const action = await input(['landscape', 'sea', 'river'])
  const doc = applySpaceAction(newSpaceDocument('space:footprint'), action)
  const photo = { width: action.observation.width, height: action.observation.height,
    evidenceSha256: action.observation.sha256, sourceUrl: imageDataUrl }
  const dimensions = photoDimensions(photo)
  const built = buildTwinScene(doc.twin!.objects)
  try {
    assert.equal(built.error, null)
    for (const item of built.objects) {
      const before = JSON.stringify(item.binding), region = doc.entities.find(entity => entity.id === item.binding.entityId)!.region
      item.wrapper.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(item.wrapper), extent = bounds.getSize(new THREE.Vector3())
      const expected: THREE.Vector3[] = []
      item.source.traverse(object => {
        if (!(object as THREE.Mesh).isMesh) return
        const mesh = object as THREE.Mesh, position = mesh.geometry.getAttribute('position')
        for (let i = 0; i < position.count; i++) {
          const point = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
          expected.push(new THREE.Vector3(
            (region.x + (point.x - bounds.min.x) / extent.x * region.width - 0.5) * dimensions.width,
            (0.5 - region.y - (point.z - bounds.min.z) / extent.z * region.height) * dimensions.height, 0))
        }
      })
      projectTwinOnPhoto(item, doc, photo, true)
      let index = 0
      item.source.traverse(object => {
        if (!(object as THREE.Mesh).isMesh) return
        const position = (object as THREE.Mesh).geometry.getAttribute('position')
        for (let i = 0; i < position.count; i++, index++) {
          assert.ok(Math.abs(position.getX(i) - expected[index].x) < 1e-5)
          assert.ok(Math.abs(position.getY(i) - expected[index].y) < 1e-5)
          assert.ok(position.getZ(i) > 0 && position.getZ(i) < 0.002)
        }
      })
      assert.equal(JSON.stringify(item.binding), before, 'authored layout/export must stay unchanged')
    }
  } finally { disposeTwinScene(built) }
})
