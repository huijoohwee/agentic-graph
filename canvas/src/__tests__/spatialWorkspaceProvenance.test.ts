import test from 'node:test'
import assert from 'node:assert/strict'
import { indexedDB } from 'fake-indexeddb'
import yaml from 'js-yaml'
import { spatialWorkspaceProvenance } from '../features/three/spatialWorkspaceProvenance'
import { newSpaceDocument, hashSpaceImage, validateSpaceDocument } from '../features/xr-v2/semanticSpaceRuntime'
import { createSemanticSpaceStore, exportSemanticSpacePackage, importSemanticSpace } from '../features/xr-v2/semanticSpaceStore'
import { readSpatialReceipts, previewSpatialEdits, SPATIAL_REVIEW_SCHEMA, type SpatialReceipt } from '../features/three/spatialWorkspaceModel'
import { readXrMotionReferencePlan } from '../features/three/xrMotionReferenceModel'
const pixels = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Q4t0AAAAASUVORK5CYII='

test('existing evidence package preserves imported pixels, authored facts and unknown physical correspondence', async () => {
  const observation = { id: 'image-1', capturedAtMs: 1, width: 1, height: 1, imageDataUrl: pixels,
    sha256: await hashSpaceImage(pixels), orientation: 'source-pixels' as const, scale: 'unknown' as const }
  const source = { ...newSpaceDocument('room'), observations: [observation], entities: [{ id: 'crate',
    observationId: 'image-1', label: '<img src=x onerror=alert(1)>', category: 'object', confirmedAtMs: 2,
    region: { x: 0, y: 0, width: 1, height: 1 }, provenance: 'user-confirmed' as const }] }
  const target = createSemanticSpaceStore({ indexedDB, databaseName: 'spatial-provenance-roundtrip' })
  const restored = await importSemanticSpace(await exportSemanticSpacePackage(source), target)
  assert.deepEqual(restored, source)
  const metadata = { kgSemanticObjectView: { spaceId: source.id, evidenceSha256: observation.sha256 } }
  const projection = spatialWorkspaceProvenance(yaml.load(yaml.dump(metadata)) as Record<string, unknown>, restored)
  assert.equal(projection.kind, 'authored'); assert.equal(projection.units, 'metres')
  assert.equal(projection.simulation.kind, 'simulated'); assert.equal(projection.simulation.correspondence, 'unknown')
  assert.equal(projection.observation?.kind, 'imported-observation'); assert.equal(projection.observation?.units, 'source-pixels')
  assert.equal(projection.observation?.scale, 'unknown'); assert.equal(projection.observation?.correspondence, 'unknown')
  assert.equal('imageDataUrl' in projection.observation!, false, 'inspection does not duplicate or expose pixel payloads')
  const absent = spatialWorkspaceProvenance(metadata, null)
  assert.equal(absent.observation?.availability, 'unavailable'); assert.equal(absent.observation?.units, 'unknown')
  assert.equal(spatialWorkspaceProvenance({}).observation, null)
  assert.throws(() => validateSpaceDocument({ ...source, observations: [{ ...observation, scale: undefined }] }))
  assert.throws(() => validateSpaceDocument({ ...source, observations: [{ ...observation, scale: 'metres' }] }))
})

test('import rejects hostile URLs, corrupt identity and oversized data without a remote fetch', async () => {
  const target = createSemanticSpaceStore({ indexedDB, databaseName: 'spatial-provenance-rejection' })
  const source = { ...newSpaceDocument('room'), observations: [{ id: 'image', capturedAtMs: 0,
    width: 1, height: 1, imageDataUrl: 'https://example.invalid/executable.svg', sha256: 'a'.repeat(64),
    orientation: 'source-pixels', scale: 'unknown' }] }
  await assert.rejects(importSemanticSpace(JSON.stringify(source), target), /malformed/)
  await assert.rejects(importSemanticSpace('x'.repeat(32 * 1024 * 1024 + 1), target), /32 MiB/)
  const wrapped = JSON.parse(await exportSemanticSpacePackage(newSpaceDocument('room')))
  wrapped.document.id = 'tampered'
  await assert.rejects(importSemanticSpace(JSON.stringify(wrapped), target), /integrity/)
  assert.equal(await target.read(), null)
})

test('receipt roundtrip validates provenance, identity and inverse marks before exposing imported undo', () => {
  const plan = readXrMotionReferencePlan({ stageId: 'neutral-volume', subjects: [{ id: 'crate', assetId: 'prop-crate', position: [-3, 0, 0] }] })
  const receipt: SpatialReceipt = { id: 'receipt', proposalDigest: 'a'.repeat(64), sourceToken: 'b'.repeat(64), sceneDigest: 'c'.repeat(64),
    documentName: '/scene.md', session: 'browser-session', actor: 'local-operator', approver: 'local-operator', timestamp: 1,
    kind: 'apply', diff: previewSpatialEdits(plan, [{ subjectId: 'crate', position: [-2, 0, 0] }]).diff,
    provenance: { kind: 'authored', units: 'metres', correspondence: 'unknown' } }
  const ledger = { schema: SPATIAL_REVIEW_SCHEMA, receipts: [receipt] }
  assert.deepEqual(readSpatialReceipts(yaml.load(yaml.dump(ledger))), [receipt])
  for (const patch of [{ provenance: undefined }, { provenance: { kind: 'observed', units: 'metres', correspondence: 'verified' } },
    { sourceToken: 'unknown' }, { actor: 'remote-admin' }, { timestamp: -1 }, { undoOf: 'unearned' }]) {
    assert.throws(() => readSpatialReceipts({ ...ledger, receipts: [{ ...receipt, ...patch }] }))
  }
  const invalid = structuredClone(receipt)
  invalid.diff[0].after.marks = [{ time: 31, position: [0, 0, 0] }]
  assert.throws(() => readSpatialReceipts({ ...ledger, receipts: [invalid] }), /track time/)
})
