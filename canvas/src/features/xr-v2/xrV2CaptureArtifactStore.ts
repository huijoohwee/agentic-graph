import type {
  XrV2CaptureSnapshot,
  XrV2DepthEstimate,
} from './captureContracts'
import type {
  XrV2AtomicCaptureFallbackCommit,
  XrV2AtomicCaptureFallbackCommitResult,
  XrV2AtomicCaptureFallbackPersistence,
  XrV2FlatCaptureAssetRecord,
  XrV2PostProcessQueueRecord,
} from './spatialCapturePostProcess'
import type { XrV2NormalizedDepthMap, XrV2RgbaFrame } from './stereoSynthesis'
import {
  isXrV2PublishedSpatialAsset,
  type XrV2PublishedSpatialAsset,
} from './xrV2SpatialAssetMetadata'

export const XR_V2_CAPTURE_DATABASE_NAME = 'knowgrph-xr-v2' as const
export const XR_V2_CAPTURE_DATABASE_VERSION = 2
export const XR_V2_MAX_PERSISTED_CAPTURE_FRAMES = 180
export const XR_V2_MAX_CAPTURE_BLOB_BYTES = 256 * 1024 * 1024
export const XR_V2_CAPTURE_STORAGE_TIMEOUT_MS = 4_000

export type XrV2StoredCaptureFrame = Readonly<{
  frameIndex: number
  capturedAtMs: number
  frame: XrV2RgbaFrame
  estimate: XrV2DepthEstimate<XrV2NormalizedDepthMap> | null
}>

export type XrV2StoredCaptureFrameBundle = Readonly<{
  schema: 'knowgrph-xr-v2-capture-frame-bundle/v1'
  sessionId: string
  snapshot: XrV2CaptureSnapshot
  frames: readonly XrV2StoredCaptureFrame[]
  createdAtMs: number
}>

export type XrV2PostProcessOutput = Readonly<{
  containerRef: string
  mimeType: 'video/webm'
  byteLength: number
  trackCount: number
  completedAtMs: number
  browserPlaybackEvidence: 'not-observed'
}>

export type XrV2StoredPostProcessJob = Readonly<{
  job: XrV2PostProcessQueueRecord
  status: 'queued' | 'running' | 'completed' | 'failed'
  attempts: number
  output: XrV2PostProcessOutput | null
  error: string | null
  updatedAtMs: number
}>

type StoredBlobRecord = Readonly<{
  ref: string
  kind: 'raw-clip' | 'stereo-container'
  sessionId: string
  blob: Blob
  createdAtMs: number
}>

type StoredBundleRecord = Readonly<{
  ref: string
  bundle: XrV2StoredCaptureFrameBundle
}>

type StoredCommitRecord = Readonly<{
  idempotencyKey: string
  canonicalPayload: string
}>

export type XrV2CaptureArtifactStore = XrV2AtomicCaptureFallbackPersistence & Readonly<{
  putRawClip(sessionId: string, blob: Blob): Promise<string>
  putStereoContainer(sessionId: string, blob: Blob): Promise<string>
  readBlob(ref: string): Promise<Blob | null>
  putFrameBundle(bundle: XrV2StoredCaptureFrameBundle): Promise<string>
  readFrameBundle(ref: string): Promise<XrV2StoredCaptureFrameBundle | null>
  putPublishedSpatialAsset(asset: XrV2PublishedSpatialAsset): Promise<void>
  readPublishedSpatialAsset(assetId: string): Promise<XrV2PublishedSpatialAsset | null>
  listPublishedSpatialAssets(): Promise<readonly XrV2PublishedSpatialAsset[]>
  readFlatAsset(assetId: string): Promise<XrV2FlatCaptureAssetRecord | null>
  listFlatAssets(): Promise<readonly XrV2FlatCaptureAssetRecord[]>
  readPostProcessJob(jobId: string): Promise<XrV2StoredPostProcessJob | null>
  claimNextQueuedPostProcessJob(nowMs?: number): Promise<XrV2StoredPostProcessJob | null>
  completePostProcessJob(jobId: string, output: XrV2PostProcessOutput): Promise<void>
  failPostProcessJob(jobId: string, error: string, nowMs?: number): Promise<void>
  deleteCapturePersistence(input: XrV2CapturePersistenceKeys): Promise<void>
  close(): void
}>

export type XrV2CapturePersistenceKeys = Readonly<{
  rawClipRef: string
  depthMetadataRef: string
  spatialAssetId: string
  fallback?: Readonly<{ flatAssetId: string; jobId: string; idempotencyKey: string }> | null
}>

const PORTABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/
const REFERENCE = /^indexeddb:\/\/knowgrph-xr-v2\/(raw-clip|stereo-container|frame-bundle)\/([A-Za-z0-9._:-]{1,160})$/

function identifier(label: string, value: string): string {
  const normalized = String(value || '').trim()
  if (!PORTABLE_ID.test(normalized)) throw new Error(`${label} must be a bounded portable identifier`)
  return normalized
}

function timestamp(value = Date.now()): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('timestamp must be a non-negative safe integer')
  return value
}

function blobReference(kind: StoredBlobRecord['kind'], sessionId: string): string {
  return `indexeddb://knowgrph-xr-v2/${kind}/${identifier('sessionId', sessionId)}`
}

function bundleReference(sessionId: string): string {
  return `indexeddb://knowgrph-xr-v2/frame-bundle/${identifier('sessionId', sessionId)}`
}

function assertBlob(blob: Blob, kind: string): void {
  if (!(blob instanceof Blob) || blob.size < 1 || blob.size > XR_V2_MAX_CAPTURE_BLOB_BYTES) {
    throw new Error(`${kind} blob is outside the admitted persistence bound`)
  }
}

function copyFrame(frame: XrV2RgbaFrame): XrV2RgbaFrame {
  if (!Number.isSafeInteger(frame.width) || frame.width < 1 || frame.width > 1_024
    || !Number.isSafeInteger(frame.height) || frame.height < 1 || frame.height > 1_024
    || !(frame.data instanceof Uint8ClampedArray)
    || frame.data.length !== frame.width * frame.height * 4) {
    throw new Error('capture frame is not a bounded RGBA frame')
  }
  return Object.freeze({
    width: frame.width,
    height: frame.height,
    data: frame.data.slice(),
  })
}
function copyEstimate(
  estimate: XrV2DepthEstimate<XrV2NormalizedDepthMap>,
): XrV2DepthEstimate<XrV2NormalizedDepthMap> {
  const { depth } = estimate
  if (!Number.isFinite(estimate.confidence) || estimate.confidence < 0 || estimate.confidence > 1
    || !Number.isSafeInteger(depth.width) || depth.width < 1
    || !Number.isSafeInteger(depth.height) || depth.height < 1
    || !(depth.values instanceof Float32Array)
    || depth.values.length !== depth.width * depth.height) {
    throw new Error('capture depth estimate is malformed')
  }
  return Object.freeze({
    confidence: estimate.confidence,
    depth: Object.freeze({
      width: depth.width,
      height: depth.height,
      values: depth.values.slice(),
    }),
  })
}

function cloneBundle(bundle: XrV2StoredCaptureFrameBundle): XrV2StoredCaptureFrameBundle {
  const sessionId = identifier('sessionId', bundle.sessionId)
  if (bundle.schema !== 'knowgrph-xr-v2-capture-frame-bundle/v1'
    || !Array.isArray(bundle.frames)
    || bundle.frames.length < 1
    || bundle.frames.length > XR_V2_MAX_PERSISTED_CAPTURE_FRAMES) {
    throw new Error('capture frame bundle is outside the admitted bound')
  }
  const seen = new Set<number>()
  const frames = bundle.frames.map(source => {
    if (!Number.isSafeInteger(source.frameIndex) || source.frameIndex < 0 || seen.has(source.frameIndex)
      || !Number.isFinite(source.capturedAtMs) || source.capturedAtMs < 0) {
      throw new Error('capture frame bundle contains an invalid or duplicate frame')
    }
    seen.add(source.frameIndex)
    return Object.freeze({
      frameIndex: source.frameIndex,
      capturedAtMs: source.capturedAtMs,
      frame: copyFrame(source.frame),
      estimate: source.estimate ? copyEstimate(source.estimate) : null,
    })
  })
  frames.sort((left, right) => left.frameIndex - right.frameIndex)
  return Object.freeze({
    schema: bundle.schema,
    sessionId,
    snapshot: structuredClone(bundle.snapshot),
    frames: Object.freeze(frames),
    createdAtMs: timestamp(bundle.createdAtMs),
  })
}

function clonePublishedAsset(asset: XrV2PublishedSpatialAsset): XrV2PublishedSpatialAsset {
  const copy = structuredClone(asset)
  if (!isXrV2PublishedSpatialAsset(copy)) throw new Error('published spatial asset is malformed')
  return Object.freeze({ ...copy, metadata: Object.freeze({ ...copy.metadata }) })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('IndexedDB request timed out')), XR_V2_CAPTURE_STORAGE_TIMEOUT_MS)
    request.onsuccess = () => { clearTimeout(timeout); resolve(request.result) }
    request.onerror = () => { clearTimeout(timeout); reject(request.error || new Error('IndexedDB request failed')) }
  })
}

function transactionDone(transaction: IDBTransaction, timeoutMs = XR_V2_CAPTURE_STORAGE_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { transaction.abort() } catch { /* already settled */ }
      reject(new Error('IndexedDB transaction timed out'))
    }, timeoutMs)
    transaction.oncomplete = () => { clearTimeout(timeout); resolve() }
    transaction.onerror = () => { clearTimeout(timeout); reject(transaction.error || new Error('IndexedDB transaction failed')) }
    transaction.onabort = () => { clearTimeout(timeout); reject(transaction.error || new Error('IndexedDB transaction aborted')) }
  })
}

function openDatabase(factory: IDBFactory, databaseName: string, timeoutMs = XR_V2_CAPTURE_STORAGE_TIMEOUT_MS): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(databaseName, XR_V2_CAPTURE_DATABASE_VERSION)
    let settled = false
    const finish = (action: () => void) => {
      if (settled) return false
      settled = true
      clearTimeout(timeout)
      action()
      return true
    }
    const timeout = setTimeout(() => finish(() => reject(new Error('XR v2 IndexedDB open timed out'))), timeoutMs)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('blobs')) database.createObjectStore('blobs', { keyPath: 'ref' })
      if (!database.objectStoreNames.contains('bundles')) database.createObjectStore('bundles', { keyPath: 'ref' })
      if (!database.objectStoreNames.contains('assets')) database.createObjectStore('assets', { keyPath: 'assetId' })
      if (!database.objectStoreNames.contains('commits')) database.createObjectStore('commits', { keyPath: 'idempotencyKey' })
      if (!database.objectStoreNames.contains('spatial-assets')) database.createObjectStore('spatial-assets', { keyPath: 'asset_id' })
      if (!database.objectStoreNames.contains('jobs')) {
        const jobs = database.createObjectStore('jobs', { keyPath: 'job.jobId' })
        jobs.createIndex('status', 'status', { unique: false })
      }
    }
    request.onsuccess = () => {
      if (!finish(() => resolve(request.result))) request.result.close()
    }
    request.onerror = () => finish(() => reject(request.error || new Error('XR v2 IndexedDB open failed')))
    request.onblocked = () => finish(() => reject(new Error('XR v2 IndexedDB upgrade is blocked')))
  })
}

export async function preflightXrV2IndexedDbArtifactStore(options: Readonly<{
  indexedDB?: IDBFactory
  databaseName?: string
  timeoutMs?: number
}> = {}): Promise<true> {
  const factory = options.indexedDB || globalThis.indexedDB
  if (!factory) throw new Error('IndexedDB is unavailable; XR capture cannot persist durably')
  const timeoutMs = options.timeoutMs ?? XR_V2_CAPTURE_STORAGE_TIMEOUT_MS
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10_000) {
    throw new Error('XR v2 IndexedDB preflight timeout is outside the supported bound')
  }
  const database = await openDatabase(factory, options.databaseName || XR_V2_CAPTURE_DATABASE_NAME, timeoutMs)
  try {
    const transaction = database.transaction('commits', 'readwrite')
    const store = transaction.objectStore('commits')
    const key = `preflight:${Date.now()}:${Math.random().toString(36).slice(2)}`
    store.put({ idempotencyKey: key, canonicalPayload: 'preflight' } satisfies StoredCommitRecord)
    store.delete(key)
    await transactionDone(transaction, timeoutMs)
    return true
  } finally {
    database.close()
  }
}

export function createXrV2IndexedDbArtifactStore(options: Readonly<{
  indexedDB?: IDBFactory
  databaseName?: string
}> = {}): XrV2CaptureArtifactStore {
  const factory = options.indexedDB || globalThis.indexedDB
  if (!factory) throw new Error('IndexedDB is unavailable; XR capture cannot persist durably')
  const databaseName = String(options.databaseName || XR_V2_CAPTURE_DATABASE_NAME).trim()
  if (!databaseName || databaseName.length > 128) throw new Error('Invalid XR capture database name')
  let database: IDBDatabase | null = null
  let opening: Promise<IDBDatabase> | null = null
  const db = async () => {
    if (database) return database
    if (!opening) opening = openDatabase(factory, databaseName).then(value => (database = value))
    return opening
  }

  const putBlob = async (kind: StoredBlobRecord['kind'], sessionId: string, blob: Blob) => {
    assertBlob(blob, kind)
    const ref = blobReference(kind, sessionId)
    const transaction = (await db()).transaction('blobs', 'readwrite')
    transaction.objectStore('blobs').put({
      ref,
      kind,
      sessionId: identifier('sessionId', sessionId),
      blob,
      createdAtMs: Date.now(),
    } satisfies StoredBlobRecord)
    await transactionDone(transaction)
    return ref
  }

  const updateJob = async (
    jobId: string,
    updater: (current: XrV2StoredPostProcessJob) => XrV2StoredPostProcessJob,
  ): Promise<void> => {
    const transaction = (await db()).transaction('jobs', 'readwrite')
    const store = transaction.objectStore('jobs')
    const current = await requestResult(store.get(identifier('jobId', jobId))) as XrV2StoredPostProcessJob | undefined
    if (!current) {
      transaction.abort()
      throw new Error('XR v2 post-process job was not found')
    }
    store.put(updater(current))
    await transactionDone(transaction)
  }

  return Object.freeze({
    putRawClip: (sessionId, blob) => putBlob('raw-clip', sessionId, blob),
    putStereoContainer: (sessionId, blob) => putBlob('stereo-container', sessionId, blob),
    readBlob: async ref => {
      if (!REFERENCE.test(ref)) return null
      const transaction = (await db()).transaction('blobs', 'readonly')
      const record = await requestResult(transaction.objectStore('blobs').get(ref)) as StoredBlobRecord | undefined
      return record?.blob || null
    },
    putFrameBundle: async input => {
      const bundle = cloneBundle(input)
      const ref = bundleReference(bundle.sessionId)
      const transaction = (await db()).transaction('bundles', 'readwrite')
      transaction.objectStore('bundles').put({ ref, bundle } satisfies StoredBundleRecord)
      await transactionDone(transaction)
      return ref
    },
    readFrameBundle: async ref => {
      if (!REFERENCE.test(ref) || !ref.includes('/frame-bundle/')) return null
      const transaction = (await db()).transaction('bundles', 'readonly')
      const record = await requestResult(transaction.objectStore('bundles').get(ref)) as StoredBundleRecord | undefined
      return record ? cloneBundle(record.bundle) : null
    },
    putPublishedSpatialAsset: async input => {
      const asset = clonePublishedAsset(input)
      const transaction = (await db()).transaction('spatial-assets', 'readwrite')
      transaction.objectStore('spatial-assets').put(asset)
      await transactionDone(transaction)
    },
    readPublishedSpatialAsset: async assetId => {
      const transaction = (await db()).transaction('spatial-assets', 'readonly')
      const record = await requestResult(transaction.objectStore('spatial-assets').get(identifier('assetId', assetId)))
      return record ? clonePublishedAsset(record as XrV2PublishedSpatialAsset) : null
    },
    listPublishedSpatialAssets: async () => {
      const transaction = (await db()).transaction('spatial-assets', 'readonly')
      const records = await requestResult(transaction.objectStore('spatial-assets').getAll()) as unknown[]
      return Object.freeze(records.filter(isXrV2PublishedSpatialAsset)
        .map(clonePublishedAsset)
        .sort((left, right) => right.created_at_ms - left.created_at_ms
          || left.asset_id.localeCompare(right.asset_id)))
    },
    putFlatAssetAndQueuedJobAtomically: async commit => {
      const databaseValue = await db()
      const spatialAsset = clonePublishedAsset(commit.spatialAsset)
      return new Promise<XrV2AtomicCaptureFallbackCommitResult>((resolve, reject) => {
        const transaction = databaseValue.transaction(['commits', 'assets', 'jobs', 'spatial-assets'], 'readwrite')
        const timeout = setTimeout(() => {
          try { transaction.abort() } catch { /* already settled */ }
          reject(new Error('XR capture atomic commit timed out'))
        }, XR_V2_CAPTURE_STORAGE_TIMEOUT_MS)
        const commits = transaction.objectStore('commits')
        let result: XrV2AtomicCaptureFallbackCommitResult | null = null
        const lookup = commits.get(commit.idempotencyKey)
        lookup.onerror = () => transaction.abort()
        lookup.onsuccess = () => {
          const existing = lookup.result as StoredCommitRecord | undefined
          if (existing) {
            if (existing.canonicalPayload !== commit.canonicalPayload) {
              transaction.abort()
              reject(new Error('XR capture idempotency key payload does not match persisted commit'))
              return
            }
            result = {
              outcome: 'existing',
              idempotencyKey: commit.idempotencyKey,
              canonicalPayload: commit.canonicalPayload,
            }
            return
          }
          commits.put({
            idempotencyKey: commit.idempotencyKey,
            canonicalPayload: commit.canonicalPayload,
          } satisfies StoredCommitRecord)
          transaction.objectStore('assets').put(commit.flatAsset)
          transaction.objectStore('spatial-assets').put(spatialAsset)
          transaction.objectStore('jobs').put({
            job: commit.queuedJob,
            status: 'queued',
            attempts: 0,
            output: null,
            error: null,
            updatedAtMs: commit.queuedJob.queuedAtMs,
          } satisfies XrV2StoredPostProcessJob)
          result = {
            outcome: 'inserted',
            idempotencyKey: commit.idempotencyKey,
            canonicalPayload: commit.canonicalPayload,
          }
        }
        transaction.oncomplete = () => {
          clearTimeout(timeout)
          result ? resolve(Object.freeze(result))
            : reject(new Error('XR capture atomic commit completed without evidence'))
        }
        transaction.onerror = () => { clearTimeout(timeout); reject(transaction.error || new Error('XR capture atomic commit failed')) }
        transaction.onabort = () => { clearTimeout(timeout); reject(transaction.error || new Error('XR capture atomic commit aborted')) }
      })
    },
    readFlatAsset: async assetId => {
      const transaction = (await db()).transaction('assets', 'readonly')
      return (await requestResult(transaction.objectStore('assets').get(identifier('assetId', assetId)))
        || null) as XrV2FlatCaptureAssetRecord | null
    },
    listFlatAssets: async () => {
      const transaction = (await db()).transaction('assets', 'readonly')
      const assets = await requestResult(transaction.objectStore('assets').getAll()) as XrV2FlatCaptureAssetRecord[]
      return Object.freeze(assets.sort((left, right) => right.createdAtMs - left.createdAtMs))
    },
    readPostProcessJob: async jobId => {
      const transaction = (await db()).transaction('jobs', 'readonly')
      return (await requestResult(transaction.objectStore('jobs').get(identifier('jobId', jobId)))
        || null) as XrV2StoredPostProcessJob | null
    },
    claimNextQueuedPostProcessJob: async (nowMs = Date.now()) => {
      timestamp(nowMs)
      const databaseValue = await db()
      return new Promise<XrV2StoredPostProcessJob | null>((resolve, reject) => {
        const transaction = databaseValue.transaction('jobs', 'readwrite')
        const timeout = setTimeout(() => {
          try { transaction.abort() } catch { /* already settled */ }
          reject(new Error('XR job claim timed out'))
        }, XR_V2_CAPTURE_STORAGE_TIMEOUT_MS)
        const request = transaction.objectStore('jobs').index('status').openCursor(IDBKeyRange.only('queued'))
        let claimed: XrV2StoredPostProcessJob | null = null
        request.onerror = () => transaction.abort()
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) return
          const current = cursor.value as XrV2StoredPostProcessJob
          claimed = Object.freeze({
            ...current,
            status: 'running',
            attempts: current.attempts + 1,
            error: null,
            updatedAtMs: nowMs,
          })
          cursor.update(claimed)
        }
        transaction.oncomplete = () => { clearTimeout(timeout); resolve(claimed) }
        transaction.onerror = () => { clearTimeout(timeout); reject(transaction.error || new Error('XR job claim failed')) }
        transaction.onabort = () => { clearTimeout(timeout); reject(transaction.error || new Error('XR job claim aborted')) }
      })
    },
    completePostProcessJob: (jobId, output) => updateJob(jobId, current => {
      if (current.status !== 'running') throw new Error('Only a running XR job can complete')
      return Object.freeze({ ...current, status: 'completed', output, error: null, updatedAtMs: output.completedAtMs })
    }),
    failPostProcessJob: (jobId, error, nowMs = Date.now()) => updateJob(jobId, current => Object.freeze({
      ...current,
      status: 'failed',
      output: null,
      error: String(error || 'XR post-process failed').slice(0, 1_024),
      updatedAtMs: timestamp(nowMs),
    })),
    deleteCapturePersistence: async input => {
      const names = ['blobs', 'bundles', 'spatial-assets', 'assets', 'jobs', 'commits']
      const transaction = (await db()).transaction(names, 'readwrite')
      transaction.objectStore('blobs').delete(input.rawClipRef)
      transaction.objectStore('bundles').delete(input.depthMetadataRef)
      transaction.objectStore('spatial-assets').delete(input.spatialAssetId)
      if (input.fallback) {
        transaction.objectStore('assets').delete(input.fallback.flatAssetId)
        transaction.objectStore('jobs').delete(input.fallback.jobId)
        transaction.objectStore('commits').delete(input.fallback.idempotencyKey)
      }
      await transactionDone(transaction)
    },
    close: () => {
      database?.close()
      database = null
      opening = null
    },
  })
}

export function createXrV2MemoryArtifactStore(): XrV2CaptureArtifactStore {
  const blobs = new Map<string, Blob>()
  const bundles = new Map<string, XrV2StoredCaptureFrameBundle>()
  const spatialAssets = new Map<string, XrV2PublishedSpatialAsset>()
  const assets = new Map<string, XrV2FlatCaptureAssetRecord>()
  const commits = new Map<string, string>()
  const jobs = new Map<string, XrV2StoredPostProcessJob>()
  const putBlob = async (kind: StoredBlobRecord['kind'], id: string, blob: Blob) => {
    assertBlob(blob, kind)
    const ref = blobReference(kind, id)
    blobs.set(ref, blob)
    return ref
  }
  return Object.freeze({
    putRawClip: (sessionId, blob) => putBlob('raw-clip', sessionId, blob),
    putStereoContainer: (sessionId, blob) => putBlob('stereo-container', sessionId, blob),
    readBlob: async ref => blobs.get(ref) || null,
    putFrameBundle: async input => {
      const bundle = cloneBundle(input)
      const ref = bundleReference(bundle.sessionId)
      bundles.set(ref, bundle); return ref
    },
    readFrameBundle: async ref => bundles.has(ref) ? cloneBundle(bundles.get(ref)!) : null,
    putPublishedSpatialAsset: async input => {
      const asset = clonePublishedAsset(input)
      spatialAssets.set(asset.asset_id, asset)
    },
    readPublishedSpatialAsset: async id => spatialAssets.has(id)
      ? clonePublishedAsset(spatialAssets.get(id)!) : null,
    listPublishedSpatialAssets: async () => Object.freeze([...spatialAssets.values()]
      .map(clonePublishedAsset)
      .sort((left, right) => right.created_at_ms - left.created_at_ms
        || left.asset_id.localeCompare(right.asset_id))),
    putFlatAssetAndQueuedJobAtomically: async commit => {
      const previous = commits.get(commit.idempotencyKey)
      if (previous && previous !== commit.canonicalPayload) throw new Error('XR capture idempotency payload mismatch')
      if (previous) return Object.freeze({
        outcome: 'existing' as const,
        idempotencyKey: commit.idempotencyKey,
        canonicalPayload: commit.canonicalPayload,
      })
      const spatialAsset = clonePublishedAsset(commit.spatialAsset)
      commits.set(commit.idempotencyKey, commit.canonicalPayload)
      assets.set(commit.flatAsset.assetId, commit.flatAsset)
      spatialAssets.set(spatialAsset.asset_id, spatialAsset)
      jobs.set(commit.queuedJob.jobId, Object.freeze({
        job: commit.queuedJob,
        status: 'queued', attempts: 0, output: null, error: null,
        updatedAtMs: commit.queuedJob.queuedAtMs,
      }))
      return Object.freeze({
        outcome: 'inserted' as const,
        idempotencyKey: commit.idempotencyKey,
        canonicalPayload: commit.canonicalPayload,
      })
    },
    readFlatAsset: async assetId => assets.get(assetId) || null,
    listFlatAssets: async () => Object.freeze([...assets.values()].sort((a, b) => b.createdAtMs - a.createdAtMs)),
    readPostProcessJob: async jobId => jobs.get(jobId) || null,
    claimNextQueuedPostProcessJob: async (nowMs = Date.now()) => {
      const current = [...jobs.values()].find(job => job.status === 'queued')
      if (!current) return null
      const claimed = Object.freeze({
        ...current,
        status: 'running' as const,
        attempts: current.attempts + 1, updatedAtMs: timestamp(nowMs),
      })
      jobs.set(current.job.jobId, claimed)
      return claimed
    },
    completePostProcessJob: async (jobId, output) => {
      const current = jobs.get(jobId)
      if (!current || current.status !== 'running') throw new Error('Only a running XR job can complete')
      jobs.set(jobId, Object.freeze({ ...current, status: 'completed', output, error: null, updatedAtMs: output.completedAtMs }))
    },
    failPostProcessJob: async (jobId, error, nowMs = Date.now()) => {
      const current = jobs.get(jobId)
      if (!current) throw new Error('XR v2 post-process job was not found')
      jobs.set(jobId, Object.freeze({
        ...current, status: 'failed', output: null,
        error: String(error || 'XR post-process failed').slice(0, 1_024),
        updatedAtMs: timestamp(nowMs),
      }))
    },
    deleteCapturePersistence: async input => {
      blobs.delete(input.rawClipRef)
      bundles.delete(input.depthMetadataRef)
      spatialAssets.delete(input.spatialAssetId)
      if (!input.fallback) return
      assets.delete(input.fallback.flatAssetId); jobs.delete(input.fallback.jobId)
      commits.delete(input.fallback.idempotencyKey)
    },
    close: () => undefined,
  })
}

export { createXrV2CaptureArtifactSink, type XrV2CaptureArtifactSinkController } from './xrV2CaptureArtifactSink'
