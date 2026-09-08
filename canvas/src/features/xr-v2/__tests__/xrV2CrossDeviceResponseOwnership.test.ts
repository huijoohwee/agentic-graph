import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createXrV2CrossDeviceAssetAdapter, XrV2CrossDeviceAssetError,
  readXrV2CrossDeviceAssetConfig, resolveXrV2CrossDeviceAssetPaths,
  serializeXrV2CrossDeviceAssetManifest, parseXrV2CrossDeviceAssetManifest,
  sha256XrV2CrossDeviceText, XR_V2_CROSS_DEVICE_ASSET_MANIFEST_SCHEMA,
  type XrV2CrossDeviceAssetManifest,
} from '../xrV2CrossDeviceAssetAdapter'
import { createXrV2PublishedSpatialAsset } from '../xrV2SpatialAssetMetadata'
import { createXrV2MemoryArtifactStore } from '../xrV2MemoryArtifactStore'
import { sha256XrV2CrossDeviceBytes } from '../xrV2CrossDeviceFrameBundleCodec'
import { buildAgenticGraphStorageBlobPath } from '@/lib/storage/agentic-graph-storage-sync-contract'

const workspaceId = 'workspace:xr-response-ownership'
const sourceId = '/workspace/xr-response-ownership.md'
const assetId = 'response-ownership-asset'
const config = { workspaceId, baseUrl: 'https://storage.example.test', operationTimeoutMs: 100 }
const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve))

async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('XR response ownership fixture exceeded 500ms')), 500)
    })])
  } finally { if (timer !== undefined) clearTimeout(timer) }
}

function heldResponse(status: number, contentType?: string) {
  const stats = { cancels: 0, pulls: 0 }
  let finishCancel!: () => void, producer!: ReadableStreamDefaultController<Uint8Array>
  const cancellation = new Promise<void>(resolve => { finishCancel = resolve })
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) { producer = controller },
    pull() { stats.pulls += 1 },
    cancel() { stats.cancels += 1; return cancellation },
  }, { highWaterMark: 0 }), { status, headers: contentType ? { 'content-type': contentType } : undefined })
  return { response, stats, async cleanup() {
    finishCancel()
    if (!stats.cancels) producer.close()
    await nextTurn()
    assert.equal(response.body!.locked, false, 'An owned reader must be released before fixture cleanup')
    await bounded(response.body!.cancel())
  } }
}

async function withResponse(probe: ReturnType<typeof heldResponse>, run: () => Promise<void>, operation: Promise<unknown>): Promise<void> {
  const errors: unknown[] = []
  try { await run() } catch (error) { errors.push(error) }
  try { await probe.cleanup() } catch (error) { errors.push(error) }
  try { await bounded(operation.then(() => undefined, () => undefined)) } catch (error) { errors.push(error) }
  if (errors.length === 1) throw errors[0]
  if (errors.length) throw new AggregateError(errors,
    `XR response ownership fixture failed: ${errors.map(error => String(error)).join('; ')}`)
}

function assertDisposed(probe: ReturnType<typeof heldResponse>) {
  assert.equal(probe.stats.cancels, 1, 'Unused response bodies must be canceled once without awaiting the producer')
  assert.equal(probe.stats.pulls, 0, 'Rejected or expired response bytes must not be read')
  assert.equal(probe.response.body!.locked, false)
}

async function validManifest(): Promise<XrV2CrossDeviceAssetManifest> {
  const runtime = readXrV2CrossDeviceAssetConfig(config)
  const paths = await resolveXrV2CrossDeviceAssetPaths(runtime, sourceId, assetId)
  const bytes = new TextEncoder().encode('raw')
  const manifest: XrV2CrossDeviceAssetManifest = {
    schema: XR_V2_CROSS_DEVICE_ASSET_MANIFEST_SCHEMA,
    workspace_id: workspaceId, source_id: sourceId,
    source_hash: await sha256XrV2CrossDeviceText(sourceId), canonical_path: paths.manifestCanonicalPath,
    asset: createXrV2PublishedSpatialAsset({ assetId, sessionId: 'response-ownership-session',
      rawClipRef: 'indexeddb://agentic-graph-xr-v2/raw-clip/response-ownership-session',
      metadata: { xr_capability_tier: 'pseudo-ar-depth-parallax', synthesis_mode: 'live',
        depth_metadata_ref: null, fallback_triggered: false }, createdAtMs: 1_700_000_000_000 }),
    raw_kind: 'raw-clip', raw_part: { canonical_path: paths.rawCanonicalPath,
      public_path: buildAgenticGraphStorageBlobPath(workspaceId, paths.rawCanonicalPath),
      content_type: 'video/webm', content_hash: await sha256XrV2CrossDeviceBytes(bytes), size_bytes: bytes.byteLength },
    frame_bundle_part: null, published_at_ms: 1_700_000_000_001,
  }
  return parseXrV2CrossDeviceAssetManifest(serializeXrV2CrossDeviceAssetManifest(manifest), runtime, paths.manifestCanonicalPath)
}

const sameXrError = (code: string) => (error: unknown) => error instanceof XrV2CrossDeviceAssetError && error.code === code

test('XR response ownership disposes rejected default manifest bodies and preserves outcomes', { timeout: 2_000 }, async () => {
  for (const status of [404, 500]) {
    const probe = heldResponse(status)
    const localStore = createXrV2MemoryArtifactStore()
    const adapter = createXrV2CrossDeviceAssetAdapter({ config,
      dependencies: { isOnline: () => true, fetchImpl: async () => probe.response } })
    const operation = adapter.read({ sourceId, assetId, localStore })
    await withResponse(probe, async () => {
      await assert.rejects(bounded(operation), status === 404 ? sameXrError('not-found')
        : error => error instanceof Error && error.message === 'XR manifest read failed with HTTP 500')
      assertDisposed(probe)
      assert.deepEqual(await localStore.listPublishedSpatialAssets(), [])
    }, operation)
  }
})

test('XR response ownership disposes rejected part bodies and preserves integrity checks', { timeout: 2_000 }, async () => {
  const manifest = await validManifest()
  for (const status of [404, 500, 200]) {
    const probe = heldResponse(status, status === 200 ? 'text/plain' : 'video/webm')
    const localStore = createXrV2MemoryArtifactStore()
    const adapter = createXrV2CrossDeviceAssetAdapter({ config,
      dependencies: { isOnline: () => true, fetchImpl: async () => probe.response } })
    const operation = adapter.read({ sourceId, assetId, manifest, localStore })
    await withResponse(probe, async () => {
      await assert.rejects(bounded(operation), status === 200 ? sameXrError('integrity-failed')
        : error => error instanceof Error && error.message === `XR part read failed with HTTP ${status}`)
      assertDisposed(probe)
      assert.deepEqual(await localStore.listPublishedSpatialAssets(), [])
    }, operation)
  }
})

test('XR response ownership cancels ignored late headers before the default catalog reads bytes', { timeout: 2_000 }, async () => {
  for (const end of ['cancelled', 'deadline-exceeded'] as const) {
    const probe = heldResponse(200, 'application/json'), cancel = new AbortController()
    let releaseHeaders!: (response: Response) => void, entered!: () => void
    let requestSignal: AbortSignal | null | undefined
    const started = new Promise<void>(resolve => { entered = resolve })
    const headers = new Promise<Response>(resolve => { releaseHeaders = resolve })
    const adapter = createXrV2CrossDeviceAssetAdapter({ config,
      dependencies: { isOnline: () => true, fetchImpl: (_input, init) => {
        requestSignal = init?.signal; entered(); return headers
      } } })
    const operation = adapter.list({ signal: cancel.signal })
    const observed = operation.then(() => { throw new Error('Catalog completed before its held headers') })
    await withResponse(probe, async () => {
      try {
        await bounded(Promise.race([started, observed]))
        if (end === 'cancelled') cancel.abort(new DOMException('cancel ignored headers', 'AbortError'))
        await assert.rejects(bounded(operation), sameXrError(end))
        assert.equal(requestSignal?.aborted, true)
        releaseHeaders(probe.response)
        await nextTurn()
        assertDisposed(probe)
      } finally {
        cancel.abort(); releaseHeaders(probe.response)
        await nextTurn()
      }
    }, operation)
  }
})
