import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { XrV2CaptureFallback } from '../captureContracts'
import {
  XR_V2_MAX_RAW_CAPTURE_BYTES,
  createXrV2CaptureFallbackPersister,
  prepareXrV2CaptureFallbackBundle,
  type XrV2AtomicCaptureFallbackCommit,
  type XrV2AtomicCaptureFallbackPersistence,
  type XrV2PrepareCaptureFallbackInput,
} from '../spatialCapturePostProcess'

const fallback: XrV2CaptureFallback = Object.freeze({
  triggeredAtFrameIndex: 8,
  observedDurationMs: 42,
  reason: 'budget-breach',
})

function input(
  overrides: Partial<XrV2PrepareCaptureFallbackInput> = {},
): XrV2PrepareCaptureFallbackInput {
  return {
    idempotencyKey: 'capture-1:fallback:v2',
    sessionId: 'capture-1',
    flatAssetId: 'asset.capture-1.flat',
    jobId: 'job.capture-1.depth',
    rawClipRef: 'asset://captures/capture-1/raw.webm',
    rawClipMimeType: 'video/webm',
    rawClipByteLength: 8_192,
    depthMetadataRef: 'asset://captures/capture-1/camera-metadata.json',
    queuedAtMs: 1_700_000_000_000,
    fallback,
    ...overrides,
  }
}

test('fallback bundle stores a flat asset and a queued job without playback or synthesis claims', () => {
  const bundle = prepareXrV2CaptureFallbackBundle(input())

  assert.equal(bundle.flatAsset.xrCapabilityTier, 'flat-fallback')
  assert.equal(bundle.flatAsset.synthesisMode, 'none')
  assert.equal(bundle.flatAsset.playbackEvidence, 'not-observed')
  assert.equal(bundle.flatAsset.depthSynthesisEvidence, 'not-observed')
  assert.equal(bundle.queuedJob.status, 'queued')
  assert.equal(bundle.queuedJob.maxAttempts, 1)
  assert.deepEqual(bundle.queuedJob.executor, {
    state: 'blocked',
    reason: 'no-admitted-depth-model',
    admittedModel: null,
  })
  assert.equal(bundle.queuedJob.depthSynthesisEvidence, 'not-observed')
  assert.equal(bundle.queuedJob.flatAssetId, bundle.flatAsset.assetId)
  assert.equal(Object.isFrozen(bundle), true)
  assert.equal(Object.isFrozen(bundle.flatAsset), true)
  assert.equal(Object.isFrozen(bundle.queuedJob.executor), true)
})

test('an admitted model only unblocks executor eligibility and does not claim synthesis', () => {
  const bundle = prepareXrV2CaptureFallbackBundle(input({
    admittedDepthModel: {
      modelId: 'fixture-depth-model',
      revision: 'fixture-revision-1',
      sha256: 'a'.repeat(64),
      sameOriginPath: '/test-fixtures/models/depth/model.onnx',
    },
  }))

  assert.equal(bundle.queuedJob.executor.state, 'awaiting-executor')
  assert.equal(bundle.queuedJob.depthSynthesisEvidence, 'not-observed')
  assert.equal(bundle.flatAsset.depthSynthesisEvidence, 'not-observed')
})

test('atomic persistence deduplicates in-flight work and delegates durable idempotency', async () => {
  const storedPayloads = new Map<string, string>()
  const commits: XrV2AtomicCaptureFallbackCommit[] = []
  let releaseFirst: (() => void) | null = null
  const firstGate = new Promise<void>(resolve => { releaseFirst = resolve })
  const persistence: XrV2AtomicCaptureFallbackPersistence = {
    async putFlatAssetAndQueuedJobAtomically(commit) {
      commits.push(commit)
      if (commits.length === 1) await firstGate
      const previous = storedPayloads.get(commit.idempotencyKey)
      if (previous && previous !== commit.canonicalPayload) {
        throw new Error('durable idempotency conflict')
      }
      storedPayloads.set(commit.idempotencyKey, commit.canonicalPayload)
      return {
        outcome: previous ? 'existing' : 'inserted',
        idempotencyKey: commit.idempotencyKey,
        canonicalPayload: commit.canonicalPayload,
      }
    },
  }
  const persister = createXrV2CaptureFallbackPersister({ persistence })

  const first = persister.persist(input())
  const duplicate = persister.persist(input())
  assert.strictEqual(duplicate, first)
  assert.equal(persister.readInFlightCount(), 1)
  assert.equal(commits.length, 0)
  await Promise.resolve()
  assert.equal(commits.length, 1)
  assert.equal(commits[0]?.flatAsset.assetId, 'asset.capture-1.flat')
  assert.equal(commits[0]?.queuedJob.flatAssetId, 'asset.capture-1.flat')

  releaseFirst?.()
  assert.equal((await first).outcome, 'inserted')
  assert.equal((await duplicate).outcome, 'inserted')
  await Promise.resolve()
  await Promise.resolve()

  const repeated = await persister.persist(input())
  assert.equal(repeated.outcome, 'existing')
  assert.equal(commits.length, 2)
  assert.equal(storedPayloads.size, 1)
})

test('persistence capacity and in-flight idempotency conflicts fail closed', async () => {
  let release: (() => void) | null = null
  const gate = new Promise<void>(resolve => { release = resolve })
  const persistence: XrV2AtomicCaptureFallbackPersistence = {
    async putFlatAssetAndQueuedJobAtomically(commit) {
      await gate
      return {
        outcome: 'inserted',
        idempotencyKey: commit.idempotencyKey,
        canonicalPayload: commit.canonicalPayload,
      }
    },
  }
  const persister = createXrV2CaptureFallbackPersister({
    persistence,
    maxInFlight: 1,
  })
  const pending = persister.persist(input())

  await assert.rejects(
    persister.persist(input({ rawClipRef: 'asset://captures/capture-1/other.webm' })),
    /different capture fallback payload/,
  )
  await assert.rejects(
    persister.persist(input({
      idempotencyKey: 'capture-2:fallback:v2',
      sessionId: 'capture-2',
      flatAssetId: 'asset.capture-2.flat',
      jobId: 'job.capture-2.depth',
      rawClipRef: 'asset://captures/capture-2/raw.webm',
      depthMetadataRef: 'asset://captures/capture-2/camera-metadata.json',
    })),
    /at capacity/,
  )

  release?.()
  await pending
})

test('fallback persistence rejects ephemeral references and unbounded records', () => {
  assert.throws(
    () => prepareXrV2CaptureFallbackBundle(input({
      rawClipRef: 'workspace://capture/raw.webm',
    })),
    /durable asset reference/,
  )
  assert.throws(
    () => prepareXrV2CaptureFallbackBundle(input({
      depthMetadataRef: 'memory://capture/metadata.json',
    })),
    /durable asset reference/,
  )
  assert.throws(
    () => prepareXrV2CaptureFallbackBundle(input({
      rawClipByteLength: XR_V2_MAX_RAW_CAPTURE_BYTES + 1,
    })),
    /outside the supported capture bound/,
  )
})
