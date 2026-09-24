import test from 'node:test'
import assert from 'node:assert/strict'
import { indexedDB } from 'fake-indexeddb'
import { analyzeSemanticImage } from '../semanticImagePerception'
import { applySpaceAction, hashSpaceImage, newSpaceDocument, validateSpaceDocument } from '../semanticSpaceRuntime'
import { createSemanticSpaceStore, exportSemanticSpacePackage, importSemanticSpace } from '../semanticSpaceStore'
import { buildProceduralAsset, disposeProceduralAsset } from '@/features/image-to-glb/proceduralAssetBuilder'
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
    const built = buildProceduralAsset(binding.recipe)
    try { assert.equal(built.evidence.providerCalls, 0); assert.equal(built.evidence.triangles, 12) }
    finally { disposeProceduralAsset(built.scene) }
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
