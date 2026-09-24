import { indexedDB } from 'fake-indexeddb'
import { applySpaceAction, hashSpaceImage, newSpaceDocument, querySpaceEntities,
  validateSpaceDocument, verifySpaceEvidence, type SpaceEntity, type SpaceObservation } from '../semanticSpaceRuntime'
import { createSemanticSpaceStore, exportSemanticSpacePackage, importSemanticSpace } from '../semanticSpaceStore'
import { buildProceduralAsset, disposeProceduralAsset } from '@/features/image-to-glb/proceduralAssetBuilder'
import { parseSemanticSpaceInvocation, buildSemanticSpaceWebMcpToolBuilders } from '@/features/agent-ready/semanticSpaceWebMcpTools'
import { SEMANTIC_SPACE_TOOL_IDS } from '@/features/agent-ready/semanticSpaceAgentReadyContract.mjs'
import { buildPointCloudGeometry, projectRelativeDepthPointCloud } from '@/features/three/spatialCaptureGeometryRuntime'

const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Q4t0AAAAASUVORK5CYII='
const region = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }

export async function testSemanticSpaceRoundTripAndGuards() {
  const databaseName = `semantic-space-test-${crypto.randomUUID()}`
  const store = createSemanticSpaceStore({ indexedDB, databaseName })
  const observation: SpaceObservation = { id: 'observation:one', capturedAtMs: 1, width: 1, height: 1,
    imageDataUrl, sha256: await hashSpaceImage(imageDataUrl), orientation: 'source-pixels', scale: 'unknown' }
  let doc = newSpaceDocument('space:test')
  const capture = { operation: 'capture' as const, requestId: 'request:capture', expectedRevision: 0, observation }
  doc = applySpaceAction(doc, capture)
  doc = await store.save(doc, null)
  if (doc.revision !== 1 || (await store.read())?.observations[0].sha256 !== observation.sha256) {
    throw Error('atomic still save/readback failed')
  }
  const first: SpaceEntity = { id: 'entity:chair', observationId: observation.id, label: 'Desk chair',
    category: 'chair', region, confirmedAtMs: 2, provenance: 'user-confirmed' }
  const second: SpaceEntity = { ...first, id: 'entity:table', label: 'Work table', category: 'table', confirmedAtMs: 3 }
  for (const entity of [first, second]) {
    const prior = doc.revision
    doc = applySpaceAction(doc, { operation: 'confirm', requestId: `request:${entity.id}`,
      expectedRevision: prior, entity })
    doc = await store.save(doc, prior)
  }
  if (querySpaceEntities(doc, 'chair').map(item => item.id).join() !== first.id
    || querySpaceEntities(doc, 'missing').length !== 0) throw Error('confirmed-entity query failed')
  const prior = doc.revision
  doc = await store.save(applySpaceAction(doc, { operation: 'correct', requestId: 'request:correct',
    expectedRevision: prior, entityId: first.id, label: 'Visitor chair', category: 'chair' }), prior)
  if (doc.entities[0].id !== first.id || doc.entities[0].label !== 'Visitor chair') {
    throw Error('correction changed identity or missed durable state')
  }
  if (applySpaceAction(doc, { operation: 'correct', requestId: 'request:correct', expectedRevision: 0,
    entityId: first.id, label: 'Wrong', category: 'chair' }) !== doc) throw Error('request replay wrote twice')
  try {
    applySpaceAction(doc, { operation: 'select', requestId: 'request:stale', expectedRevision: 0, entityId: first.id })
    throw Error('stale action accepted')
  } catch (error) { if ((error as Error).message === 'stale action accepted') throw error }
  try {
    await store.save({ ...doc, revision: doc.revision + 1 }, 0)
    throw Error('stale durable write accepted')
  } catch (error) { if ((error as Error).message === 'stale durable write accepted') throw error }
  const packageText = JSON.stringify(doc)
  const imported = await verifySpaceEvidence(validateSpaceDocument(JSON.parse(packageText)))
  const reader = createSemanticSpaceStore({ indexedDB, databaseName })
  await reader.replace(imported)
  if (JSON.stringify(await reader.read()) !== packageText) throw Error('package import lost image, IDs or revision')
  for (const [entityId, template, size, position] of [
    [first.id, 'chair', [1, 1, 1], [-1, 0, 0]],
    [second.id, 'table', [2, 1, 1], [1, 0, 0]],
  ] as const) {
    const previous = doc.revision
    doc = applySpaceAction(doc, { operation: 'build', requestId: `request:build:${entityId}`,
      expectedRevision: previous, entityId, template, size, position })
    doc = await store.save(doc, previous)
  }
  if (doc.twin?.objects.length !== 2 || doc.twin.objects[0].entityId !== first.id
    || doc.twin.objects[1].entityId !== second.id
    || doc.twin.objects.some(binding => binding.evidenceSha256 !== observation.sha256)) {
    throw Error('two-object twin lost its stable evidence bindings')
  }
  for (const binding of doc.twin.objects) {
    const built = buildProceduralAsset(binding.recipe)
    try {
      if (built.evidence.triangles < 1 || built.evidence.providerCalls !== 0) {
        throw Error('native procedural CPU geometry failed')
      }
    } finally { disposeProceduralAsset(built.scene) }
  }
  const firstControl = doc.twin.objects[0].recipe.controls.find(control => control.type === 'color')
  if (!firstControl) throw Error('native material control missing')
  doc = applySpaceAction(doc, { operation: 'control-twin', requestId: 'request:colour',
    expectedRevision: doc.revision, entityId: first.id, controlId: firstControl.id, value: '#123456' })
  if (doc.twin?.objects[0].recipe.values[firstControl.id] !== '#123456') throw Error('control edit was not persisted')
  for (const [operation, change] of [
    ['move-twin', { position: [20, 0, 0] }],
    ['resize-twin', { size: [Number.NaN, 1, 1] }],
  ] as const) {
    try {
      applySpaceAction(doc, { operation, requestId: `request:invalid:${operation}`, expectedRevision: doc.revision,
        entityId: first.id, ...change } as Parameters<typeof applySpaceAction>[1])
      throw Error(`${operation} accepted invalid geometry`)
    } catch (error) { if ((error as Error).message === `${operation} accepted invalid geometry`) throw error }
  }
  const fullPackage = await exportSemanticSpacePackage(doc)
  const restoredStore = createSemanticSpaceStore({ indexedDB, databaseName: `${databaseName}-restore` })
  const restored = await importSemanticSpace(fullPackage, restoredStore)
  if (JSON.stringify(restored) !== JSON.stringify(doc)
    || JSON.stringify(await restoredStore.read()) !== JSON.stringify(doc)) {
    throw Error('editable twin failed package import and fresh-store reopen')
  }
  const damaged = JSON.parse(fullPackage)
  damaged.document.twin.objects[0].position[0] = 2
  try { await importSemanticSpace(JSON.stringify(damaged), restoredStore); throw Error('tampered package accepted') }
  catch (error) { if ((error as Error).message === 'tampered package accepted') throw error }
  try { await importSemanticSpace(JSON.stringify(doc), restoredStore); throw Error('raw twin package accepted') }
  catch (error) { if ((error as Error).message === 'raw twin package accepted') throw error }
  const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image')
  let decodeResult: 'ok' | 'bad-pixels' | 'wrong-size' = 'ok'
  class TestImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    naturalWidth = 1
    naturalHeight = 1
    set src(_value: string) {
      queueMicrotask(() => {
        if (decodeResult === 'bad-pixels') this.onerror?.()
        else {
          this.naturalWidth = decodeResult === 'wrong-size' ? 2 : 1
          this.onload?.()
        }
      })
    }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: TestImage })
  try {
    await verifySpaceEvidence(doc, true)
    for (const result of ['bad-pixels', 'wrong-size'] as const) {
      decodeResult = result
      try { await verifySpaceEvidence(doc, true); throw Error(`${result} accepted`) }
      catch (error) { if ((error as Error).message === `${result} accepted`) throw error }
    }
  } finally {
    if (previousImage) Object.defineProperty(globalThis, 'Image', previousImage)
    else Reflect.deleteProperty(globalThis, 'Image')
  }
  try {
    await verifySpaceEvidence({ ...doc, observations: [{ ...observation, imageDataUrl: imageDataUrl.replace('iVBOR', 'aVBOR') }] })
    throw Error('corrupt image accepted')
  } catch (error) { if ((error as Error).message === 'corrupt image accepted') throw error }
  try {
    validateSpaceDocument({ ...doc, entities: [{ ...first, observationId: 'unknown' }] })
    throw Error('broken evidence link accepted')
  } catch (error) { if ((error as Error).message === 'broken evidence link accepted') throw error }
}

export async function testSemanticSpaceWebMcpAndInvocation() {
  const foundToken = parseSemanticSpaceInvocation('/space.find #chair')
  const selectedToken = parseSemanticSpaceInvocation('/space.select @entity:chair')
  if (foundToken.operation !== 'query' || foundToken.text !== 'chair'
    || selectedToken.operation !== 'select' || selectedToken.entityId !== 'entity:chair') {
    throw Error('space / @ # invocation did not resolve exact tokens')
  }
  const buildToken = parseSemanticSpaceInvocation('/space.build @entity:chair #procedural-asset template=chair width=1 height=1 depth=1 x=-1 z=0')
  if (buildToken.operation !== 'build' || buildToken.entityId !== 'entity:chair'
    || buildToken.template !== 'chair' || buildToken.position[0] !== -1) {
    throw Error('procedural / @ # invocation did not preserve typed geometry')
  }
  try { parseSemanticSpaceInvocation('/space.select @entity:chair extra=unsafe'); throw Error('unsupported token accepted') }
  catch (error) { if ((error as Error).message === 'unsupported token accepted') throw error }
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: indexedDB })
  const store = createSemanticSpaceStore({ indexedDB })
  const observation: SpaceObservation = { id: 'observation:webmcp', capturedAtMs: 1, width: 1, height: 1,
    imageDataUrl, sha256: await hashSpaceImage(imageDataUrl), orientation: 'source-pixels', scale: 'unknown' }
  const original = await store.read()
  const base = original || newSpaceDocument('space:webmcp')
  const saved = await store.save(applySpaceAction(base, { operation: 'capture', requestId: 'request:webmcp-capture',
    expectedRevision: base.revision, observation }), original?.revision ?? null)
  const contracts = [
    { name: SEMANTIC_SPACE_TOOL_IDS.inspectLocalSemanticSpace, webName: 'agentic-graph.inspect_local_semantic_space',
      title: 'Inspect', description: 'Inspect space', inputSchema: {} },
    { name: SEMANTIC_SPACE_TOOL_IDS.controlLocalSemanticSpace, webName: 'agentic-graph.control_local_semantic_space',
      title: 'Control', description: 'Control space', inputSchema: {} },
  ]
  const tools = buildSemanticSpaceWebMcpToolBuilders(name => contracts.find(entry => entry.name === name)!)
  const inspect = tools[SEMANTIC_SPACE_TOOL_IDS.inspectLocalSemanticSpace]()
  const control = tools[SEMANTIC_SPACE_TOOL_IDS.controlLocalSemanticSpace]()
  const initial = await inspect.execute() as { observations: Array<Record<string, unknown>>; revision: number }
  if (initial.revision !== saved.revision || 'imageDataUrl' in initial.observations[0]) {
    throw Error('inspection leaked pixels or stale revision')
  }
  const confirmed = await control.execute({ operation: 'confirm', requestId: 'request:webmcp-confirm',
    expectedRevision: saved.revision, observationId: observation.id, label: 'Chair', category: 'chair', region }) as {
      ok: boolean; revision: number; entities: Array<{ id: string }> }
  if (!confirmed.ok || confirmed.entities[0].id !== 'entity:request:webmcp-confirm') throw Error('WebMCP confirmation failed')
  const found = await control.execute({ invocation: '/space.find #chair' }) as { entities: Array<{ id: string }> }
  if (found.entities[0].id !== confirmed.entities[0].id) throw Error('invocation query disagreed with structured action')
  const built = await control.execute({ invocation: `/space.build @${found.entities[0].id} #procedural-asset template=chair width=1 height=1 depth=1 x=-1 z=0` }) as {
    ok: boolean; revision: number; twin: { objects: Array<{ entityId: string; template: string; position: number[] }> } }
  if (!built.ok || built.twin.objects[0].entityId !== found.entities[0].id
    || built.twin.objects[0].template !== 'chair' || built.twin.objects[0].position[0] !== -1) {
    throw Error('WebMCP build did not use the native space action and geometry owner')
  }
  const edited = await control.execute({ operation: 'edit-twin', requestId: 'request:webmcp-edit',
    expectedRevision: built.revision, entityId: found.entities[0].id,
    size: [1.2, 1.1, 1], position: [0, 0, 0] }) as {
      ok: boolean; twin: { objects: Array<{ size: number[]; position: number[] }> } }
  if (!edited.ok || edited.twin.objects[0].size[0] !== 1.2 || edited.twin.objects[0].position[0] !== 0) {
    throw Error('WebMCP edit disagreed with the same local action path')
  }
  const invalid = await control.execute({ operation: 'edit-twin', requestId: 'request:webmcp-invalid',
    expectedRevision: built.revision + 1, entityId: found.entities[0].id,
    size: [Number.NaN, 1, 1], position: [0, 0, 0] }) as { ok: boolean; code: string }
  if (invalid.ok || invalid.code !== 'invalid-input') throw Error('WebMCP accepted invalid geometry')
  const stale = await control.execute({ operation: 'correct', requestId: 'request:webmcp-stale',
    expectedRevision: saved.revision, entityId: found.entities[0].id, label: 'Wrong', category: 'chair' }) as { ok: boolean; code: string }
  if (stale.ok || stale.code !== 'stale-revision') throw Error('stale agent mutation changed evidence')
}

export function testSemanticSpaceRelativeDepthProjection() {
  const rgba = new Uint8ClampedArray(3 * 3 * 4)
  for (let pixel = 0; pixel < 9; pixel += 1) rgba.set([255, 0, 0, 255], pixel * 4)
  const depth = new Float32Array(9).fill(0.5)
  const result = projectRelativeDepthPointCloud({ width: 3, height: 3, rgba, depth })
  const center = result.pointCloud.positions.slice(4 * 3, 5 * 3)
  if (result.units !== 'relative' || result.scale !== 'unknown' || result.pointCloud.pointCount !== 9
    || Math.abs(center[0]) > 1e-6 || Math.abs(center[1]) > 1e-6 || Math.abs(center[2] + 0.7) > 1e-6
    || result.pointCloud.colors?.[12] !== 1) throw Error('projection center, color or scale provenance failed')
  const geometry = buildPointCloudGeometry({ pointCloud: result.pointCloud, fidelity: 'full',
    source: 'local-source', byteLength: 9 * 6 * 4, pointBudget: 9 })
  if (geometry.getAttribute('position').count !== 9 || geometry.getAttribute('pointColor').count !== 9) {
    throw Error('relative points did not enter the native Three.js geometry owner')
  }
  geometry.dispose()
  const polarity = projectRelativeDepthPointCloud({ width: 3, height: 3, rgba,
    depth: new Float32Array(9).fill(1), nearWhite: true, pointBudget: 2 })
  if (polarity.pointCloud.pointCount > 2 || Math.abs(polarity.pointCloud.positions[2] + 0.2) > 1e-6) {
    throw Error('point cap or near-white polarity failed')
  }
  depth[0] = Number.NaN
  if (projectRelativeDepthPointCloud({ width: 3, height: 3, rgba, depth }).pointCloud.pointCount !== 8) {
    throw Error('invalid depth did not remove its pixel')
  }
}
