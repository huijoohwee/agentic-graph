import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { indexedDB } from 'fake-indexeddb'

import { createFakeAgenticGraphStorageWorkerEnv } from '@/__tests__/helpers/fake-agentic-graph-storage-d1'
import { createStorageWorkerFetch } from '@/__tests__/helpers/fake-agentic-graph-storage-worker-fetch'
import { __resetAgenticGraphStorageDbForTests } from '@/lib/storage/agentic-graph-storage-db'
import {
  __resetAgenticGraphStorageRouteAvailabilityForTests,
  syncAgenticGraphStorageNow,
} from '@/lib/storage/agentic-graph-storage-client-sync'
import { buildAgenticGraphStorageBlobPath } from '@/lib/storage/agentic-graph-storage-sync-contract'
import {
  XR_V2_CROSS_DEVICE_EXTERNAL_PROMOTION_BLOCKER,
  XrV2CrossDeviceAssetError,
  createXrV2CrossDeviceAssetAdapter,
  type XrV2CrossDeviceAssetAdapterDependencies,
} from '../xrV2CrossDeviceAssetAdapter'
import { sha256XrV2CrossDeviceBytes } from '../xrV2CrossDeviceFrameBundleCodec'
import { publishXrV2ManifestThroughExistingStorage } from '../xrV2CrossDeviceExistingStorage'
import { createXrV2MemoryArtifactStore } from '../xrV2MemoryArtifactStore'
import { createXrV2PublishedSpatialAsset } from '../xrV2SpatialAssetMetadata'
import {
  createXrV2IndexedDbArtifactStore,
  type XrV2StoredCaptureFrameBundle,
} from '../xrV2CaptureArtifactStore'

const WORKSPACE_ID = 'kgws:xr-cross-device-test'
const BASE_URL = 'https://storage.example.test'
const SOURCE_ID = '/docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md'

function frameBundle(): XrV2StoredCaptureFrameBundle {
  return Object.freeze({
    schema: 'agentic-graph-xr-v2-capture-frame-bundle/v1',
    sessionId: 'session-cross-device',
    snapshot: Object.freeze({
      schema: 'agentic-graph-xr-capture-snapshot/v2',
      contractVersion: '2.0.0',
      sessionId: 'session-cross-device',
      phase: 'completed',
      frameBudgetMs: 100,
      consecutiveBudgetBreachesRequired: 3,
      maxFrames: 180,
      rawFrameCount: 1,
      depthFrameCount: 1,
      synthesizedFrameCount: 1,
      consecutiveBudgetBreaches: 0,
      lastFrameIndex: 0,
      fallback: null,
    }),
    frames: Object.freeze([Object.freeze({
      frameIndex: 0,
      capturedAtMs: 1_700_000_000_000,
      frame: Object.freeze({
        width: 2,
        height: 1,
        data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]),
      }),
      estimate: Object.freeze({
        confidence: 0.9,
        depth: Object.freeze({ width: 2, height: 1, values: new Float32Array([0.2, 0.8]) }),
      }),
    })]),
    createdAtMs: 1_700_000_000_001,
  })
}

function asset() {
  return createXrV2PublishedSpatialAsset({
    assetId: 'asset-cross-device',
    sessionId: 'session-cross-device',
    rawClipRef: 'indexeddb://agentic-graph-xr-v2/raw-clip/session-cross-device',
    metadata: {
      xr_capability_tier: 'pseudo-ar-depth-parallax',
      synthesis_mode: 'live',
      depth_metadata_ref: 'indexeddb://agentic-graph-xr-v2/frame-bundle/session-cross-device',
      fallback_triggered: false,
    },
    createdAtMs: 1_700_000_000_002,
  })
}

type RemoteBlob = { bytes: Uint8Array; contentType: string }

function remoteStorage() {
  const blobs = new Map<string, RemoteBlob>()
  const manifests = new Map<string, string>()
  const events: string[] = []
  const dependencies: XrV2CrossDeviceAssetAdapterDependencies = {
    now: () => 1_700_000_000_003,
    isOnline: () => true,
    readManifestText: async ({ canonicalPath }) => manifests.get(canonicalPath) ?? null,
    listManifestDocuments: async () => [...manifests].map(([canonicalPath, contentMd]) => ({
      canonicalPath,
      contentMd,
      deleted: false,
    })),
    uploadBlob: async input => {
      const bytes = new Uint8Array(await input.blob.arrayBuffer())
      const canonicalPath = input.workspacePath.replace(/^\/+/, '')
      const publicPath = buildAgenticGraphStorageBlobPath(input.workspaceId, canonicalPath)
      const contentHash = await sha256XrV2CrossDeviceBytes(bytes)
      events.push(`blob:${canonicalPath}`)
      blobs.set(publicPath, { bytes: bytes.slice(), contentType: input.blob.type || 'application/octet-stream' })
      return {
        workspaceId: input.workspaceId,
        canonicalPath,
        objectKey: `workspaces/${encodeURIComponent(input.workspaceId)}/${canonicalPath}`,
        publicPath,
        publicUrl: `${BASE_URL}${publicPath}`,
        contentType: input.blob.type || 'application/octet-stream',
        contentHash,
        sizeBytes: bytes.byteLength,
        etag: 'test-etag',
        uploadedAtMs: 1_700_000_000_003,
      }
    },
    publishManifest: async input => {
      events.push(`manifest:${input.canonicalPath}`)
      manifests.set(input.canonicalPath, input.text)
      return Object.freeze({ status: 'published' as const })
    },
    fetchImpl: async input => {
      const url = new URL(input instanceof Request ? input.url : String(input), BASE_URL)
      const stored = blobs.get(url.pathname)
      if (!stored) return new Response('missing', { status: 404 })
      events.push(`read:${url.pathname}`)
      return new Response(stored.bytes.slice(), {
        status: 200,
        headers: {
          'content-type': stored.contentType,
          'content-length': String(stored.bytes.byteLength),
        },
      })
    },
  }
  return { blobs, manifests, events, dependencies }
}

beforeEach(async () => {
  await __resetAgenticGraphStorageDbForTests()
  __resetAgenticGraphStorageRouteAvailabilityForTests()
})

afterEach(async () => {
  await __resetAgenticGraphStorageDbForTests()
  __resetAgenticGraphStorageRouteAvailabilityForTests()
})

test('existing-storage adapter publishes parts before a deterministic Markdown manifest and imports atomically', async () => {
  const remote = remoteStorage()
  const adapter = createXrV2CrossDeviceAssetAdapter({
    config: { workspaceId: WORKSPACE_ID, baseUrl: BASE_URL },
    dependencies: remote.dependencies,
  })
  assert.equal(adapter.config.readiness, 'demo-only-external-promotion-blocked')
  assert.equal(adapter.config.operationTimeoutMs, 60_000)
  assert.equal(adapter.config.promotionBlocker, XR_V2_CROSS_DEVICE_EXTERNAL_PROMOTION_BLOCKER)
  assert.equal(adapter.config.promotionBlocker.productionReady, false)
  assert.throws(() => createXrV2CrossDeviceAssetAdapter({
    config: {
      workspaceId: WORKSPACE_ID,
      baseUrl: BASE_URL,
      maxPartBytes: 100 * 1024 * 1024 + 1,
    },
    dependencies: remote.dependencies,
  }), /maxPartBytes/)

  const rawClip = new Blob([Uint8Array.from([9, 8, 7, 6])], { type: 'video/webm' })
  const published = await adapter.publish({
    sourceId: SOURCE_ID,
    asset: asset(),
    rawClip,
    frameBundle: frameBundle(),
  })
  assert.equal(published.status, 'published')
  assert.deepEqual(remote.events.map(event => event.split(':')[0]), ['blob', 'blob', 'manifest'])
  assert.equal(remote.manifests.size, 1)

  const listed = await adapter.list({ sourceId: SOURCE_ID })
  assert.equal(listed.status, 'ready')
  if (listed.status !== 'ready' || published.status !== 'published') return
  assert.equal(listed.manifests.length, 1)
  assert.equal(listed.manifests[0]?.canonical_path, published.manifest.canonical_path)

  const local = createXrV2MemoryArtifactStore()
  const imported = await adapter.read({
    sourceId: SOURCE_ID,
    assetId: asset().asset_id,
    localStore: local,
  })
  assert.equal(imported.status, 'imported')
  if (imported.status !== 'imported') return
  assert.match(imported.asset.raw_clip_ref, /^indexeddb:\/\/agentic-graph-xr-v2\/raw-clip\//)
  assert.match(imported.asset.metadata.depth_metadata_ref || '', /^indexeddb:\/\/agentic-graph-xr-v2\/frame-bundle\//)
  assert.ok(imported.frameBundle?.frames[0]?.frame.data instanceof Uint8ClampedArray)
  assert.ok(imported.frameBundle?.frames[0]?.estimate?.depth.values instanceof Float32Array)
  assert.equal((await local.listPublishedSpatialAssets()).length, 1)

  const eventCount = remote.events.length
  const repeated = await adapter.publish({ sourceId: SOURCE_ID, asset: asset(), rawClip, frameBundle: frameBundle() })
  assert.equal(repeated.status, 'existing')
  assert.equal(remote.events.length, eventCount)
})

test('partial blob failure never publishes a discoverable manifest', async () => {
  const remote = remoteStorage()
  let uploadCount = 0
  const baseUpload = remote.dependencies.uploadBlob!
  const adapter = createXrV2CrossDeviceAssetAdapter({
    config: { workspaceId: WORKSPACE_ID, baseUrl: BASE_URL },
    dependencies: {
      ...remote.dependencies,
      uploadBlob: async input => (++uploadCount === 2 ? null : baseUpload(input)),
    },
  })
  const result = await adapter.publish({
    sourceId: SOURCE_ID,
    asset: asset(),
    rawClip: new Blob([Uint8Array.from([1, 2, 3])], { type: 'video/webm' }),
    frameBundle: frameBundle(),
  })
  assert.equal(result.status, 'deferred')
  if (result.status !== 'deferred') assert.fail('publish must defer when a blob receipt is missing')
  assert.deepEqual(result, {
    status: 'deferred',
    reason: 'blob-upload-unconfirmed',
    retryable: true,
    manifestCanonicalPath: result.manifestCanonicalPath,
  })
  assert.equal(remote.manifests.size, 0)
  assert.equal(remote.events.some(event => event.startsWith('manifest:')), false)
})

test('real IndexedDB rehydrates raw, bundle, and catalog in one admitted import', async () => {
  const databaseName = `agentic-graph-xr-v2-cross-device-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const store = createXrV2IndexedDbArtifactStore({ indexedDB, databaseName })
  try {
    const imported = await store.importSavedAssetAtomically({
      rawKind: 'raw-clip',
      rawClip: new Blob([Uint8Array.from([7, 7, 7])], { type: 'video/webm' }),
      frameBundle: frameBundle(),
      asset: asset(),
    })
    assert.equal((await store.readBlob(imported.raw_clip_ref))?.size, 3)
    assert.equal((await store.readFrameBundle(imported.metadata.depth_metadata_ref!))?.sessionId, imported.session_id)
    assert.deepEqual(await store.listPublishedSpatialAssets(), [imported])

    const mismatched = { ...frameBundle(), sessionId: 'another-session' } as XrV2StoredCaptureFrameBundle
    const conflicting = createXrV2PublishedSpatialAsset({
      assetId: 'atomic-failure-asset',
      sessionId: 'atomic-failure-session',
      rawClipRef: 'indexeddb://agentic-graph-xr-v2/raw-clip/atomic-failure-session',
      metadata: {
        xr_capability_tier: 'pseudo-ar-depth-parallax',
        synthesis_mode: 'live',
        depth_metadata_ref: 'indexeddb://agentic-graph-xr-v2/frame-bundle/atomic-failure-session',
        fallback_triggered: false,
      },
      createdAtMs: 1_700_000_000_004,
    })
    await assert.rejects(store.importSavedAssetAtomically({
      rawKind: 'raw-clip',
      rawClip: new Blob([Uint8Array.from([1])]),
      frameBundle: mismatched,
      asset: conflicting,
    }), /do not match/)
    assert.equal(await store.readPublishedSpatialAsset(conflicting.asset_id), null)
    assert.equal(await store.readBlob(conflicting.raw_clip_ref), null)
  } finally {
    store.close()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
})

test('tamper and identity conflicts fail closed before the atomic local catalog commit', async () => {
  const remote = remoteStorage()
  const adapter = createXrV2CrossDeviceAssetAdapter({
    config: { workspaceId: WORKSPACE_ID, baseUrl: BASE_URL },
    dependencies: remote.dependencies,
  })
  const rawClip = new Blob([Uint8Array.from([4, 3, 2, 1])], { type: 'video/webm' })
  const published = await adapter.publish({ sourceId: SOURCE_ID, asset: asset(), rawClip, frameBundle: frameBundle() })
  assert.equal(published.status, 'published')
  if (published.status !== 'published' || !published.manifest.frame_bundle_part) return
  const part = remote.blobs.get(published.manifest.frame_bundle_part.public_path)!
  remote.blobs.set(published.manifest.frame_bundle_part.public_path, {
    ...part,
    bytes: Uint8Array.from([0xde, 0xad]),
  })
  const local = createXrV2MemoryArtifactStore()
  await assert.rejects(
    adapter.read({ sourceId: SOURCE_ID, assetId: asset().asset_id, localStore: local }),
    error => error instanceof XrV2CrossDeviceAssetError && error.code === 'integrity-failed',
  )
  assert.deepEqual(await local.listPublishedSpatialAssets(), [])

  await assert.rejects(
    adapter.publish({
      sourceId: SOURCE_ID,
      asset: asset(),
      rawClip: new Blob([Uint8Array.from([0, 0, 0])], { type: 'video/webm' }),
      frameBundle: frameBundle(),
    }),
    error => error instanceof XrV2CrossDeviceAssetError && error.code === 'identity-conflict',
  )
})

test('offline, cancellation, and elapsed deadlines are explicit and perform no storage I/O', async () => {
  let called = 0
  const adapter = createXrV2CrossDeviceAssetAdapter({
    config: { workspaceId: WORKSPACE_ID, baseUrl: BASE_URL },
    dependencies: {
      isOnline: () => false,
      fetchImpl: async () => { called += 1; throw new Error('unexpected network') },
    },
  })
  const offline = await adapter.publish({
    sourceId: SOURCE_ID,
    asset: asset(),
    rawClip: new Blob([Uint8Array.from([1])]),
    frameBundle: frameBundle(),
  })
  assert.equal(offline.status, 'deferred')
  if (offline.status === 'deferred') assert.equal(offline.reason, 'offline')
  assert.equal(called, 0)

  const remote = remoteStorage()
  const online = createXrV2CrossDeviceAssetAdapter({
    config: { workspaceId: WORKSPACE_ID, baseUrl: BASE_URL },
    dependencies: remote.dependencies,
  })
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    online.publish({ sourceId: SOURCE_ID, asset: asset(), rawClip: new Blob([Uint8Array.from([1])]), signal: controller.signal }),
    error => error instanceof XrV2CrossDeviceAssetError && error.code === 'cancelled',
  )
  await assert.rejects(
    online.list({ deadlineAtMs: 1 }),
    error => error instanceof XrV2CrossDeviceAssetError && error.code === 'deadline-exceeded',
  )
})

test('targeted manifest upsert preserves unrelated existing Source Files documents', async () => {
  const env = createFakeAgenticGraphStorageWorkerEnv()
  env.DB.documents.set('sf:sentinel', {
    id: 'sf:sentinel',
    workspace_id: WORKSPACE_ID,
    canonical_path: 'docs/sentinel.md',
    title: 'Sentinel',
    doc_type: 'markdown',
    lang: null,
    graph_id: null,
    source_kind: 'markdown',
    content_md: '# Sentinel',
    content_hash: 'sentinel-hash',
    parser_version: 'source-files',
    revision: 1,
    deleted: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  })
  const workerFetch = createStorageWorkerFetch(env)
  const receipt = await publishXrV2ManifestThroughExistingStorage({
    workspacePath: '/xr-assets/sentinel-preservation.md',
    canonicalPath: 'xr-assets/sentinel-preservation.md',
    text: '# XR manifest\n',
    workspaceId: WORKSPACE_ID,
    baseUrl: BASE_URL,
    fetchImpl: workerFetch as typeof fetch,
  })
  assert.equal(receipt.status, 'published')
  const sentinel = env.DB.documents.get('sf:sentinel')
  assert.equal(sentinel?.deleted, 0)
  assert.equal(sentinel?.content_md, '# Sentinel')
  assert.equal([...env.DB.documents.values()].filter(row => row.workspace_id === WORKSPACE_ID).length, 2)
})

test('targeted manifest upsert flushes after an already-running workspace sync', async () => {
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const workerFetch = createStorageWorkerFetch(env)
  let releaseFirstRequest: () => void = () => undefined
  const firstRequestReleased = new Promise<void>(resolve => { releaseFirstRequest = resolve })
  let observeFirstRequest: () => void = () => undefined
  const firstRequestObserved = new Promise<void>(resolve => { observeFirstRequest = resolve })
  let requestCount = 0
  const delayedFetch: typeof fetch = async (input, init) => {
    requestCount += 1
    if (requestCount === 1) {
      observeFirstRequest()
      await firstRequestReleased
    }
    return workerFetch(input, init)
  }
  const initialSync = syncAgenticGraphStorageNow({
    workspaceId: WORKSPACE_ID,
    baseUrl: BASE_URL,
    fetchImpl: delayedFetch,
  })
  await firstRequestObserved
  const publish = publishXrV2ManifestThroughExistingStorage({
    workspacePath: '/xr-assets/after-in-flight.md',
    canonicalPath: 'xr-assets/after-in-flight.md',
    text: '# XR manifest after in-flight sync\n',
    workspaceId: WORKSPACE_ID,
    baseUrl: BASE_URL,
    fetchImpl: workerFetch as typeof fetch,
  })
  releaseFirstRequest()
  await initialSync
  assert.equal((await publish).status, 'published')
  assert.equal(
    [...env.DB.documents.values()].some(row => row.canonical_path === 'xr-assets/after-in-flight.md'),
    true,
  )
})


function xrHeldDependency() {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

function rawOnlyXrAsset() {
  const original = asset()
  return createXrV2PublishedSpatialAsset({
    assetId: original.asset_id, sessionId: original.session_id, rawClipRef: original.raw_clip_ref,
    metadata: { ...original.metadata, depth_metadata_ref: null }, createdAtMs: original.created_at_ms,
  })
}

async function expectXrAbortWhileDependencyHeld(operation: Promise<unknown>, code: 'cancelled' | 'deadline-exceeded') {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await assert.rejects(Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('XR operation did not settle before its held-dependency rescue')), 500)
    })]), error => error instanceof XrV2CrossDeviceAssetError && error.code === code)
  } finally { if (timer !== undefined) clearTimeout(timer) }
}

const xrNextTurn = () => new Promise<void>(resolve => setImmediate(resolve))

test('XR lifecycle composes request and operation signals through response body ownership', { timeout: 2_000 }, async () => {
  for (const owner of ['request', 'operation'] as const) {
    const remote = remoteStorage(), request = new AbortController(), operation = new AbortController()
    const reason = new DOMException(`cancel ${owner} after headers`, 'AbortError')
    const observed: { signal?: AbortSignal; response?: Response; detach?: () => void } = {}
    const adapter = createXrV2CrossDeviceAssetAdapter({
      config: { workspaceId: WORKSPACE_ID, baseUrl: BASE_URL },
      dependencies: { ...remote.dependencies,
        fetchImpl: async (_input, init) => {
          const signal = init?.signal
          assert.ok(signal, 'The scoped fetch must supply a signal')
          observed.signal = signal
          const body = new ReadableStream<Uint8Array>({ start(controller) {
            const aborted = () => controller.error(signal.reason)
            signal.addEventListener('abort', aborted, { once: true })
            observed.detach = () => signal.removeEventListener('abort', aborted)
          } })
          return observed.response = new Response(body)
        },
        uploadBlob: async input => {
          const response = await input.fetchImpl(`${BASE_URL}/signal-probe`, { method: 'POST', signal: request.signal })
          assert.equal(observed.signal?.aborted, false)
          ;(owner === 'request' ? request : operation).abort(reason)
          assert.equal(observed.signal?.aborted, true, `${owner} abort must survive the scoped fetch after headers`)
          assert.equal(observed.signal?.reason, reason)
          await assert.rejects(response.text(), error => error === reason)
          throw reason
        },
      },
    })
    try {
      await assert.rejects(adapter.publish({ sourceId: SOURCE_ID, asset: rawOnlyXrAsset(),
        rawClip: new Blob(['raw'], { type: 'video/webm' }), frameBundle: null, signal: operation.signal }),
      error => error instanceof XrV2CrossDeviceAssetError && error.code === 'cancelled')
      assert.equal(remote.manifests.size, 0)
    } finally {
      observed.detach?.()
      request.abort(reason); operation.abort(reason)
      await observed.response?.body?.cancel().catch(() => undefined)
    }
  }
})

test('XR lifecycle rejects expiry while ignored upload is held and prevents a late manifest', { timeout: 2_000 }, async () => {
  const remote = remoteStorage(), entered = xrHeldDependency(), release = xrHeldDependency()
  const adapter = createXrV2CrossDeviceAssetAdapter({
    config: { workspaceId: WORKSPACE_ID, baseUrl: BASE_URL, operationTimeoutMs: 100 },
    dependencies: { ...remote.dependencies, uploadBlob: async input => {
      const receipt = await remote.dependencies.uploadBlob!(input)
      entered.release()
      await release.promise
      return receipt
    } },
  })
  const operation = adapter.publish({ sourceId: SOURCE_ID, asset: rawOnlyXrAsset(),
    rawClip: new Blob(['raw'], { type: 'video/webm' }), frameBundle: null })
  const observed = operation.then(() => { throw new Error('XR operation completed before the held upload') })
  try {
    await Promise.race([entered.promise, observed])
    await expectXrAbortWhileDependencyHeld(operation, 'deadline-exceeded')
    assert.equal(remote.manifests.size, 0)
  } finally {
    release.release()
    await operation.catch(() => undefined)
    await xrNextTurn()
  }
  assert.equal(remote.events.filter(event => event.startsWith('blob:')).length, 1, 'An already uploaded part is retained')
  assert.equal(remote.manifests.size, 0, 'Late upload completion must not start discoverable manifest publication')
})

test('XR lifecycle rejects cancellation while ignored local lookup is held and prevents a late atomic import', { timeout: 2_000 }, async () => {
  const remote = remoteStorage(), entered = xrHeldDependency(), release = xrHeldDependency(), cancel = new AbortController()
  const adapter = createXrV2CrossDeviceAssetAdapter({
    config: { workspaceId: WORKSPACE_ID, baseUrl: BASE_URL }, dependencies: remote.dependencies,
  })
  const published = await adapter.publish({ sourceId: SOURCE_ID, asset: rawOnlyXrAsset(),
    rawClip: new Blob(['raw'], { type: 'video/webm' }), frameBundle: null })
  assert.equal(published.status, 'published')
  if (published.status !== 'published') assert.fail('A verified published fixture is required')
  const local = createXrV2MemoryArtifactStore()
  let imports = 0, lateImport: Promise<ReturnType<typeof rawOnlyXrAsset>> | undefined
  const operation = adapter.read({ sourceId: SOURCE_ID, assetId: published.manifest.asset.asset_id,
    manifest: published.manifest, signal: cancel.signal, localStore: { ...local,
      readPublishedSpatialAsset: async () => { entered.release(); await release.promise; return null },
      importSavedAssetAtomically: input => { imports += 1; return lateImport = local.importSavedAssetAtomically(input) },
    } })
  const observed = operation.then(() => { throw new Error('XR operation completed before the held local lookup') })
  try {
    await Promise.race([entered.promise, observed])
    cancel.abort(new DOMException('cancel pending local lookup', 'AbortError'))
    await expectXrAbortWhileDependencyHeld(operation, 'cancelled')
  } finally {
    cancel.abort(); release.release()
    await operation.catch(() => undefined)
    await xrNextTurn()
    await lateImport
  }
  assert.equal(imports, 0, 'A cancelled late lookup must not start atomic local persistence')
  assert.deepEqual(await local.listPublishedSpatialAssets(), [])
})


test('XR lifecycle cancels a pending real response reader without awaiting producer cancellation', { timeout: 2_000 }, async () => {
  const remote = remoteStorage(), entered = xrHeldDependency(), cancelled = xrHeldDependency()
  const cancel = new AbortController(), local = createXrV2MemoryArtifactStore()
  const publisher = createXrV2CrossDeviceAssetAdapter({
    config: { workspaceId: WORKSPACE_ID, baseUrl: BASE_URL }, dependencies: remote.dependencies,
  })
  const published = await publisher.publish({ sourceId: SOURCE_ID, asset: rawOnlyXrAsset(),
    rawClip: new Blob(['raw'], { type: 'video/webm' }), frameBundle: null })
  if (published.status !== 'published') assert.fail('A verified published fixture is required')
  let producer!: ReadableStreamDefaultController<Uint8Array>, cancelCalls = 0, imports = 0
  const body = new ReadableStream<Uint8Array>({
    start(controller) { producer = controller },
    pull() { entered.release() },
    cancel() { cancelCalls += 1; return cancelled.promise },
  }, { highWaterMark: 0 })
  const adapter = createXrV2CrossDeviceAssetAdapter({
    config: { workspaceId: WORKSPACE_ID, baseUrl: BASE_URL },
    dependencies: { ...remote.dependencies, fetchImpl: async () => new Response(body) },
  })
  const operation = adapter.read({ sourceId: SOURCE_ID, assetId: published.manifest.asset.asset_id,
    manifest: published.manifest, signal: cancel.signal, localStore: { ...local,
      importSavedAssetAtomically: input => { imports += 1; return local.importSavedAssetAtomically(input) },
    } })
  const observed = operation.then(() => { throw new Error('XR operation completed before its pending body read') })
  try {
    await Promise.race([entered.promise, observed])
    assert.equal(body.locked, true, 'The native body reader must own the stream before cancellation')
    cancel.abort(new DOMException('cancel stalled XR body', 'AbortError'))
    await expectXrAbortWhileDependencyHeld(operation, 'cancelled')
    await xrNextTurn()
    assert.equal(cancelCalls, 1, 'The native reader cancels its producer exactly once')
    assert.equal(body.locked, false, 'Producer cancellation must not retain the native reader lock')
    assert.equal(imports, 0)
    assert.deepEqual(await local.listPublishedSpatialAssets(), [])
  } finally {
    cancel.abort(); cancelled.release()
    try { producer.close() } catch { /* Cancellation already closed the owned stream. */ }
    await operation.catch(() => undefined)
    await xrNextTurn()
  }
})
