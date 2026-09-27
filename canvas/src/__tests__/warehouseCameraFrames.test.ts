import assert from 'node:assert/strict'
import test from 'node:test'
import { sampleWarehouseCameraFrame, WAREHOUSE_CAMERA_IDS, WAREHOUSE_CAMERAS, WAREHOUSE_INFERENCE_MS } from '../features/python-learning/warehouseCameraFrames'
import { WAREHOUSE_INSPECTION, WAREHOUSE_INSPECTION_FPS, WAREHOUSE_INSPECTION_SCENARIO_ID } from '../features/python-learning/warehouseCoverageRoutes'
import { LearningSpatialSelection, learningSpatialDocumentKey, warehouseInspectionTransportKey } from '../features/python-learning/learningSpatialSelection'
import type { LearningRuntimeSnapshot } from '../features/python-learning/learningRuntime'

test('synthetic delivery keeps the displayed frame and detections on one capture identity', () => {
  for (const camera of WAREHOUSE_CAMERA_IDS) {
    const first = sampleWarehouseCameraFrame(camera, 10)
    assert.equal(first.latencyMs, WAREHOUSE_CAMERAS[camera].wifiMs + WAREHOUSE_INFERENCE_MS)
    assert.equal(first.frameId, `${WAREHOUSE_INSPECTION_SCENARIO_ID}:${camera}:${first.frameIndex}`)
    assert.ok(first.frameIndex <= first.wifiIndex && first.wifiIndex <= first.captureIndex)
    assert.equal(first.capturedSeconds, first.frameIndex / WAREHOUSE_INSPECTION_FPS)
    assert.ok(first.deliveredSeconds <= 10 && first.deliveredSeconds > 10 - 1 / WAREHOUSE_INSPECTION_FPS)
    // A cursor move within the same delivered-frame interval cannot move its bounds.
    const same = sampleWarehouseCameraFrame(camera, first.deliveredSeconds + 0.001)
    assert.equal(same.frameId, first.frameId)
    assert.deepEqual(same.detections, first.detections)
    for (const { box, confidence } of first.detections) {
      assert.ok(box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0)
      assert.ok(box.x + box.width <= 1 && box.y + box.height <= 1)
      assert.ok(confidence > 0 && confidence <= 1)
    }
  }
})

test('modeled Wi-Fi and inference latency withholds detections until the first frame arrives', () => {
  for (const camera of WAREHOUSE_CAMERA_IDS) {
    const latency = (WAREHOUSE_CAMERAS[camera].wifiMs + WAREHOUSE_INFERENCE_MS) / 1000
    const pending = sampleWarehouseCameraFrame(camera, latency - 0.001)
    assert.equal(pending.frameId, null); assert.deepEqual(pending.detections, [])
    const first = sampleWarehouseCameraFrame(camera, latency)
    assert.equal(first.frameIndex, 0); assert.equal(first.capturedSeconds, 0)
    assert.ok(first.detections.length > 0)
    assert.deepEqual(sampleWarehouseCameraFrame(camera, -10), sampleWarehouseCameraFrame(camera, 0))
  }
})

test('rewind is deterministic across camera changes and requires no network or inference', () => {
  const originalFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = (() => { requests++; throw new Error('Synthetic frames must remain local.') }) as typeof fetch
  try {
    const before = sampleWarehouseCameraFrame('drone001', 31.25)
    sampleWarehouseCameraFrame('drone001', 650)
    sampleWarehouseCameraFrame('drone002', 520)
    sampleWarehouseCameraFrame('cctv', 200)
    assert.deepEqual(sampleWarehouseCameraFrame('drone001', 31.25), before)
    assert.notEqual(sampleWarehouseCameraFrame('drone002', 31.25).frameId, before.frameId)
    assert.equal(requests, 0)
  } finally { globalThis.fetch = originalFetch }
})

test('drone002 delayed frames switch from its dock to rack fixtures when deployed and rewind cleanly', () => {
  const latency = (WAREHOUSE_CAMERAS.drone002.wifiMs + WAREHOUSE_INFERENCE_MS) / 1000
  const docked = sampleWarehouseCameraFrame('drone002', latency)
  assert.equal(docked.view, 'dock')
  assert.ok(docked.detections.some(item => item.id === 'charging-pad'))
  const visit = WAREHOUSE_INSPECTION.visits.find(item => item.actorId === 'drone002')!
  const deployed = sampleWarehouseCameraFrame('drone002', visit.startSeconds + 0.25 + latency)
  assert.equal(deployed.view, 'rack')
  assert.ok(deployed.detections.some(item => item.label === 'Pallet load'))
  assert.ok(!deployed.detections.some(item => item.id === 'charging-pad'))
  assert.deepEqual(sampleWarehouseCameraFrame('drone002', latency), docked)
})

const snapshot = (patch: Partial<LearningRuntimeSnapshot> = {}): LearningRuntimeSnapshot => ({
  document: { workspaceId: 'warehouse', documentId: 'lesson.py', lessonId: 'drone', source: 'takeoff(2)' },
  state: 'idle', result: null, stale: false, error: null, hint: 0, ...patch,
})
test('inspection revokes the matching clock on source edit and never revives when source returns', () => {
  const owner = new LearningSpatialSelection(), initial = snapshot(), key = learningSpatialDocumentKey(initial.document)
  owner.bind(initial); owner.update(key, { inspection: true })
  assert.equal(owner.read(key).inspection, true)
  assert.equal(owner.bind(snapshot({ document: { ...initial.document!, source: 'takeoff(3)' } })), warehouseInspectionTransportKey(key))
  assert.equal(owner.read(key).inspection, false)
  owner.bind(initial)
  assert.equal(owner.read(key).inspection, false)
  owner.update(key, { inspection: true })
  assert.equal(owner.bind(snapshot({ document: { ...initial.document! } })), null, 'same source content preserves inspection')
})

test('inspection cannot remain active or re-enable during Python execution', () => {
  for (const state of ['validating', 'running'] as const) {
    const owner = new LearningSpatialSelection(), initial = snapshot(), key = learningSpatialDocumentKey(initial.document)
    owner.bind(initial); owner.update(key, { inspection: true })
    assert.equal(owner.bind(snapshot({ state })), warehouseInspectionTransportKey(key))
    owner.update(key, { inspection: true }); assert.equal(owner.read(key).inspection, false)
    owner.bind(snapshot({ state: 'completed' })); assert.equal(owner.read(key).inspection, false)
  }
})

test('switching documents revokes inspection even when switching back to the original source', () => {
  const owner = new LearningSpatialSelection(), initial = snapshot(), key = learningSpatialDocumentKey(initial.document)
  owner.bind(initial); owner.update(key, { inspection: true })
  assert.equal(owner.bind(snapshot({ document: { ...initial.document!, documentId: 'other.py' } })), warehouseInspectionTransportKey(key))
  owner.bind(initial); assert.equal(owner.read(key).inspection, false)
  owner.update('wrong-document', { inspection: true }); assert.equal(owner.read('wrong-document').inspection, false)
})

test('another authored timeline can take native transport ownership without reviving inspection', () => {
  const owner = new LearningSpatialSelection(), initial = snapshot(), key = learningSpatialDocumentKey(initial.document)
  owner.bind(initial); owner.update(key, { inspection: true })
  owner.releaseWhenTransportChanges(warehouseInspectionTransportKey(key))
  assert.equal(owner.read(key).inspection, true)
  owner.releaseWhenTransportChanges('authored-document#xr-motion')
  assert.equal(owner.read(key).inspection, false)
  owner.releaseWhenTransportChanges(warehouseInspectionTransportKey(key))
  assert.equal(owner.read(key).inspection, false)
})
