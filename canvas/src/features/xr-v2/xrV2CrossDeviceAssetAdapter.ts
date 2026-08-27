import { uploadGeneratedWorkspaceBlobToAgenticGraphStorage } from '@/features/source-files/sourceFilesBinaryStorage'
import {
  buildAgenticGraphStorageBlobPath,
  buildAgenticGraphStorageDocPath,
  type KgDocumentRecord,
} from '@/lib/storage/agenticgraphStorageSyncContract'
import {
  exportAgenticGraphStorageWorkspace,
  resolveAgenticGraphStorageApiUrl,
} from '@/lib/storage/agenticgraphStorageClientSync'
import type { XrV2CaptureArtifactStore, XrV2StoredCaptureFrameBundle } from './xrV2CaptureArtifactStore'
import {
  decodeXrV2CrossDeviceFrameBundle,
  encodeXrV2CrossDeviceFrameBundle,
  sha256XrV2CrossDeviceBytes,
} from './xrV2CrossDeviceFrameBundleCodec'
import { publishXrV2ManifestThroughExistingStorage } from './xrV2CrossDeviceExistingStorage'
import {
  isXrV2PublishedSpatialAsset,
  type XrV2PublishedSpatialAsset,
} from './xrV2SpatialAssetMetadata'
import {
  XR_V2_CROSS_DEVICE_ASSET_MANIFEST_SCHEMA,
  XR_V2_CROSS_DEVICE_MAX_MANIFEST_BYTES,
  equivalentXrV2CrossDeviceAssetManifests,
  parseXrV2CrossDeviceAssetManifest,
  readXrV2CrossDeviceAssetConfig,
  resolveXrV2CrossDeviceAssetPaths,
  serializeXrV2CrossDeviceAssetManifest,
  sha256XrV2CrossDeviceText,
  type XrV2CrossDeviceAssetConfig,
  type XrV2CrossDeviceAssetManifest,
  type XrV2CrossDeviceAssetPart,
} from './xrV2CrossDeviceAssetManifest'

export * from './xrV2CrossDeviceAssetManifest'

export type XrV2CrossDeviceAssetErrorCode =
  | 'cancelled'
  | 'deadline-exceeded'
  | 'identity-conflict'
  | 'integrity-failed'
  | 'not-found'
  | 'catalog-bound-exceeded'
  | 'local-import-failed'

export class XrV2CrossDeviceAssetError extends Error {
  readonly code: XrV2CrossDeviceAssetErrorCode
  readonly causeValue: unknown

  constructor(code: XrV2CrossDeviceAssetErrorCode, message: string, causeValue?: unknown) {
    super(message)
    this.name = 'XrV2CrossDeviceAssetError'
    this.code = code
    this.causeValue = causeValue
  }
}

export type XrV2CrossDeviceDeferredReason =
  | 'offline'
  | 'transport-unavailable'
  | 'blob-upload-unconfirmed'
  | 'manifest-sync-deferred'

type Deferred = Readonly<{
  status: 'deferred'
  reason: XrV2CrossDeviceDeferredReason
  retryable: true
  manifestCanonicalPath: string | null
}>

export type XrV2CrossDevicePublishResult =
  | Readonly<{ status: 'published' | 'existing'; manifest: XrV2CrossDeviceAssetManifest }>
  | Deferred

export type XrV2CrossDeviceListResult =
  | Readonly<{ status: 'ready'; manifests: readonly XrV2CrossDeviceAssetManifest[] }>
  | (Deferred & Readonly<{ manifests: readonly [] }>)

export type XrV2CrossDeviceReadResult =
  | Readonly<{
      status: 'imported'
      manifest: XrV2CrossDeviceAssetManifest
      asset: XrV2PublishedSpatialAsset
      rawClip: Blob
      frameBundle: XrV2StoredCaptureFrameBundle | null
    }>
  | Deferred

type LifecycleInput = Readonly<{
  signal?: AbortSignal
  deadlineAtMs?: number
  timeoutMs?: number
}>

export type XrV2CrossDeviceLocalStore = Pick<XrV2CaptureArtifactStore,
  | 'readBlob' | 'readFrameBundle' | 'readPublishedSpatialAsset'
  | 'importSavedAssetAtomically'>

export type XrV2CrossDevicePublishInput = LifecycleInput & Readonly<{
  sourceId: string
  asset: XrV2PublishedSpatialAsset
  rawClip?: Blob
  frameBundle?: XrV2StoredCaptureFrameBundle | null
  localStore?: XrV2CrossDeviceLocalStore
  rawKind?: 'raw-clip' | 'stereo-container'
  publishedAtMs?: number
}>

export type XrV2CrossDeviceListInput = LifecycleInput & Readonly<{ sourceId?: string }>

export type XrV2CrossDeviceReadInput = LifecycleInput & Readonly<{
  sourceId: string
  assetId: string
  localStore: XrV2CrossDeviceLocalStore
  manifest?: XrV2CrossDeviceAssetManifest
}>

type UploadReceipt = Awaited<ReturnType<typeof uploadGeneratedWorkspaceBlobToAgenticGraphStorage>>
type ManifestPublishReceipt = Readonly<{ status: 'published' | 'deferred' | 'conflict' | 'rejected' }>
type ManifestDocument = Pick<KgDocumentRecord, 'canonicalPath' | 'contentMd' | 'deleted'>

export type XrV2CrossDeviceAssetAdapterDependencies = Readonly<{
  fetchImpl?: typeof fetch
  isOnline?: () => boolean
  now?: () => number
  uploadBlob?: (input: Readonly<{
    workspacePath: string
    blob: Blob
    workspaceId: string
    baseUrl: string
    fetchImpl: typeof fetch
  }>) => Promise<UploadReceipt>
  publishManifest?: (input: Readonly<{
    workspacePath: string
    canonicalPath: string
    text: string
    workspaceId: string
    baseUrl: string
    fetchImpl: typeof fetch
  }>) => Promise<ManifestPublishReceipt>
  readManifestText?: (input: Readonly<{
    canonicalPath: string
    workspaceId: string
    baseUrl: string
    fetchImpl: typeof fetch
    signal: AbortSignal
  }>) => Promise<string | null>
  listManifestDocuments?: (input: Readonly<{
    workspaceId: string
    baseUrl: string
    fetchImpl: typeof fetch
    signal: AbortSignal
  }>) => Promise<readonly ManifestDocument[]>
}>

export type XrV2CrossDeviceAssetAdapter = Readonly<{
  config: XrV2CrossDeviceAssetConfig
  publish(input: XrV2CrossDevicePublishInput): Promise<XrV2CrossDevicePublishResult>
  list(input?: XrV2CrossDeviceListInput): Promise<XrV2CrossDeviceListResult>
  read(input: XrV2CrossDeviceReadInput): Promise<XrV2CrossDeviceReadResult>
}>

type Lifecycle = Readonly<{ signal: AbortSignal; dispose(): void; kind(): 'active' | 'cancelled' | 'deadline' }>

function lifecycle(config: XrV2CrossDeviceAssetConfig, input: LifecycleInput): Lifecycle {
  const controller = new AbortController()
  let state: 'active' | 'cancelled' | 'deadline' = 'active'
  const timeoutMs = input.timeoutMs ?? config.operationTimeoutMs
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs! < 100 || timeoutMs! > 60_000) {
    throw new Error('cross-device operation timeout is outside the admitted bound')
  }
  const remaining = input.deadlineAtMs == null ? timeoutMs! : Math.min(timeoutMs!, input.deadlineAtMs - Date.now())
  if (!Number.isFinite(remaining) || remaining <= 0) {
    throw new XrV2CrossDeviceAssetError('deadline-exceeded', 'XR cross-device operation deadline elapsed')
  }
  const cancel = () => { state = 'cancelled'; controller.abort(input.signal?.reason) }
  if (input.signal?.aborted) cancel()
  else input.signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => {
    if (state !== 'active') return
    state = 'deadline'
    controller.abort(new DOMException('XR cross-device operation deadline elapsed', 'TimeoutError'))
  }, remaining)
  return Object.freeze({
    signal: controller.signal,
    kind: () => state,
    dispose: () => { clearTimeout(timer); input.signal?.removeEventListener('abort', cancel) },
  })
}

async function runLifecycle<T>(
  config: XrV2CrossDeviceAssetConfig,
  input: LifecycleInput,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const active = lifecycle(config, input)
  try {
    if (active.kind() === 'cancelled') throw new XrV2CrossDeviceAssetError('cancelled', 'XR cross-device operation was cancelled')
    return await operation(active.signal)
  } catch (error) {
    if (active.kind() === 'deadline') {
      throw new XrV2CrossDeviceAssetError('deadline-exceeded', 'XR cross-device operation deadline elapsed', error)
    }
    if (active.kind() === 'cancelled' || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new XrV2CrossDeviceAssetError('cancelled', 'XR cross-device operation was cancelled', error)
    }
    throw error
  } finally {
    active.dispose()
  }
}

function deferred(reason: XrV2CrossDeviceDeferredReason, path: string | null): Deferred {
  return Object.freeze({ status: 'deferred', reason, retryable: true, manifestCanonicalPath: path })
}

function transportFailure(error: unknown): boolean {
  if (error instanceof XrV2CrossDeviceAssetError) return false
  const message = String(error instanceof Error ? error.message : error).toLowerCase()
  return error instanceof TypeError || /network|offline|fetch|transport|route unavailable|retry exhausted/.test(message)
}

async function responseBytes(
  response: Response,
  maximum: number,
  signal: AbortSignal,
  expectedSize?: number,
): Promise<Uint8Array> {
  const contentLength = response.headers.get('content-length')
  const declared = contentLength === null ? null : Number(contentLength)
  if (declared !== null && Number.isFinite(declared) && declared >= 0
    && (declared > maximum || (expectedSize != null && declared !== expectedSize))) {
    throw new XrV2CrossDeviceAssetError('integrity-failed', 'Remote XR part Content-Length does not match its manifest')
  }
  const reader = response.body?.getReader()
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > maximum) throw new XrV2CrossDeviceAssetError('integrity-failed', 'Remote XR response exceeds its byte bound')
    return bytes
  }
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      const next = await reader.read()
      if (next.done) break
      const chunk = next.value
      total += chunk.byteLength
      if (total > maximum) {
        await reader.cancel('byte bound exceeded')
        throw new XrV2CrossDeviceAssetError('integrity-failed', 'Remote XR response exceeds its byte bound')
      }
      chunks.push(chunk)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

function lifecycleFetch(fetchImpl: typeof fetch, signal: AbortSignal): typeof fetch {
  return (input, init) => fetchImpl(input, { ...init, signal })
}

async function defaultReadManifest(input: Parameters<NonNullable<XrV2CrossDeviceAssetAdapterDependencies['readManifestText']>>[0]): Promise<string | null> {
  const path = buildAgenticGraphStorageDocPath(input.workspaceId, input.canonicalPath)
  const response = await input.fetchImpl(resolveAgenticGraphStorageApiUrl(path, input.baseUrl), { method: 'GET', signal: input.signal })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`XR manifest read failed with HTTP ${response.status}`)
  const bytes = await responseBytes(response, XR_V2_CROSS_DEVICE_MAX_MANIFEST_BYTES, input.signal)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch {
    throw new XrV2CrossDeviceAssetError('integrity-failed', 'XR asset manifest is not valid UTF-8')
  }
}

async function defaultListDocuments(input: Parameters<NonNullable<XrV2CrossDeviceAssetAdapterDependencies['listManifestDocuments']>>[0]): Promise<readonly ManifestDocument[]> {
  const result = await exportAgenticGraphStorageWorkspace({
    workspaceId: input.workspaceId,
    baseUrl: input.baseUrl,
    fetchImpl: lifecycleFetch(input.fetchImpl, input.signal),
  })
  return result.documents
}

function rawKind(input: XrV2CrossDevicePublishInput): 'raw-clip' | 'stereo-container' {
  if (input.rawKind) return input.rawKind
  return input.asset.raw_clip_ref.startsWith('indexeddb://agenticgraph-xr-v2/stereo-container/')
    ? 'stereo-container'
    : 'raw-clip'
}

function part(canonicalPath: string, contentType: string, hash: `sha256:${string}`, size: number, config: XrV2CrossDeviceAssetConfig): XrV2CrossDeviceAssetPart {
  return Object.freeze({
    canonical_path: canonicalPath,
    public_path: buildAgenticGraphStorageBlobPath(config.workspaceId, canonicalPath),
    content_type: contentType,
    content_hash: hash,
    size_bytes: size,
  })
}

async function localPublishParts(input: XrV2CrossDevicePublishInput): Promise<Readonly<{
  raw: Blob
  bundle: XrV2StoredCaptureFrameBundle | null
}>> {
  const raw = input.rawClip || await input.localStore?.readBlob(input.asset.raw_clip_ref)
  if (!(raw instanceof Blob)) throw new XrV2CrossDeviceAssetError('local-import-failed', 'Local XR raw clip is unavailable')
  const hasBundleInput = Object.prototype.hasOwnProperty.call(input, 'frameBundle')
  const bundle = hasBundleInput
    ? input.frameBundle || null
    : input.asset.metadata.depth_metadata_ref
      ? await input.localStore?.readFrameBundle(input.asset.metadata.depth_metadata_ref) || null
      : null
  if (input.asset.metadata.depth_metadata_ref && !bundle) {
    throw new XrV2CrossDeviceAssetError('local-import-failed', 'Local XR frame bundle is unavailable')
  }
  if (bundle && bundle.sessionId !== input.asset.session_id) {
    throw new XrV2CrossDeviceAssetError('identity-conflict', 'XR frame bundle session does not match the asset')
  }
  return Object.freeze({ raw, bundle })
}

function validateUpload(receipt: UploadReceipt, expected: XrV2CrossDeviceAssetPart, config: XrV2CrossDeviceAssetConfig): void {
  if (!receipt || receipt.workspaceId !== config.workspaceId || receipt.canonicalPath !== expected.canonical_path
    || receipt.publicPath !== expected.public_path || receipt.contentHash !== expected.content_hash
    || receipt.sizeBytes !== expected.size_bytes) {
    throw new XrV2CrossDeviceAssetError('integrity-failed', 'Existing blob adapter did not confirm exact XR part path, size, and SHA-256')
  }
}

function compatibleLocalAsset(existing: XrV2PublishedSpatialAsset, remote: XrV2PublishedSpatialAsset): boolean {
  return existing.asset_id === remote.asset_id && existing.session_id === remote.session_id
    && existing.created_at_ms === remote.created_at_ms
    && existing.metadata.xr_capability_tier === remote.metadata.xr_capability_tier
    && existing.metadata.synthesis_mode === remote.metadata.synthesis_mode
    && existing.metadata.fallback_triggered === remote.metadata.fallback_triggered
}

export function createXrV2CrossDeviceAssetAdapter(options: Readonly<{
  config?: Partial<Pick<XrV2CrossDeviceAssetConfig,
    'workspaceId' | 'baseUrl' | 'manifestRoot' | 'maxPartBytes' | 'maxCatalogAssets' | 'operationTimeoutMs'>>
  dependencies?: XrV2CrossDeviceAssetAdapterDependencies
}> = {}): XrV2CrossDeviceAssetAdapter {
  const config = readXrV2CrossDeviceAssetConfig(options.config)
  const dependencies = options.dependencies || {}
  const fetchImpl = dependencies.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
  const online = dependencies.isOnline || (() => typeof navigator === 'undefined' || navigator.onLine !== false)
  const now = dependencies.now || (() => Date.now())
  const needFetch = () => {
    if (!fetchImpl) throw new Error('Fetch is unavailable for XR cross-device storage')
    return fetchImpl
  }

  const publish = async (input: XrV2CrossDevicePublishInput): Promise<XrV2CrossDevicePublishResult> => {
    if (!isXrV2PublishedSpatialAsset(input.asset)) throw new Error('XR published asset is malformed')
    const paths = await resolveXrV2CrossDeviceAssetPaths(config, input.sourceId, input.asset.asset_id)
    if (!online()) return deferred('offline', paths.manifestCanonicalPath)
    try {
      return await runLifecycle(config, input, async signal => {
        const scopedFetch = lifecycleFetch(needFetch(), signal)
        const local = await localPublishParts(input)
        if (local.raw.size < 1 || local.raw.size > config.maxPartBytes) {
          throw new XrV2CrossDeviceAssetError('integrity-failed', 'Local XR raw clip is outside the admitted byte bound')
        }
        const rawBytes = new Uint8Array(await local.raw.arrayBuffer())
        const rawHash = await sha256XrV2CrossDeviceBytes(rawBytes, signal)
        const encoded = local.bundle ? await encodeXrV2CrossDeviceFrameBundle(local.bundle, signal) : null
        if (encoded && encoded.bytes.byteLength > config.maxPartBytes) {
          throw new XrV2CrossDeviceAssetError('integrity-failed', 'Local XR frame bundle is outside the admitted byte bound')
        }
        const rawPart = part(paths.rawCanonicalPath, local.raw.type || 'application/octet-stream', rawHash, rawBytes.byteLength, config)
        const framePart = encoded
          ? part(paths.frameBundleCanonicalPath, 'application/vnd.agenticgraph.xr-v2-frame-bundle', encoded.contentHash, encoded.bytes.byteLength, config)
          : null
        const publishedAtMs = input.publishedAtMs ?? now()
        if (!Number.isSafeInteger(publishedAtMs) || publishedAtMs < 0) {
          throw new XrV2CrossDeviceAssetError('integrity-failed', 'XR manifest timestamp is outside the admitted bound')
        }
        const manifest: XrV2CrossDeviceAssetManifest = Object.freeze({
          schema: XR_V2_CROSS_DEVICE_ASSET_MANIFEST_SCHEMA,
          workspace_id: config.workspaceId,
          source_id: String(input.sourceId).trim(),
          source_hash: await sha256XrV2CrossDeviceText(String(input.sourceId).trim()),
          canonical_path: paths.manifestCanonicalPath,
          asset: Object.freeze(structuredClone(input.asset)),
          raw_kind: rawKind(input),
          raw_part: rawPart,
          frame_bundle_part: framePart,
          published_at_ms: publishedAtMs,
        })
        const readManifest = dependencies.readManifestText || defaultReadManifest
        const existingText = await readManifest({
          canonicalPath: paths.manifestCanonicalPath,
          workspaceId: config.workspaceId,
          baseUrl: config.baseUrl,
          fetchImpl: scopedFetch,
          signal,
        })
        if (existingText !== null) {
          const existing = await parseXrV2CrossDeviceAssetManifest(existingText, config, paths.manifestCanonicalPath)
          if (!equivalentXrV2CrossDeviceAssetManifests(existing, manifest)) {
            throw new XrV2CrossDeviceAssetError('identity-conflict', 'Deterministic XR manifest path already contains different content')
          }
          return Object.freeze({ status: 'existing', manifest: existing })
        }
        const upload = dependencies.uploadBlob || (args => uploadGeneratedWorkspaceBlobToAgenticGraphStorage({ ...args, uploadNow: true }))
        const rawReceipt = await upload({
          workspacePath: paths.rawWorkspacePath, blob: local.raw, workspaceId: config.workspaceId,
          baseUrl: config.baseUrl, fetchImpl: scopedFetch,
        })
        if (!rawReceipt) return deferred('blob-upload-unconfirmed', paths.manifestCanonicalPath)
        validateUpload(rawReceipt, rawPart, config)
        if (encoded && framePart) {
          const bundleBlob = new Blob([encoded.bytes], { type: framePart.content_type })
          const receipt = await upload({
            workspacePath: paths.frameBundleWorkspacePath, blob: bundleBlob, workspaceId: config.workspaceId,
            baseUrl: config.baseUrl, fetchImpl: scopedFetch,
          })
          if (!receipt) return deferred('blob-upload-unconfirmed', paths.manifestCanonicalPath)
          validateUpload(receipt, framePart, config)
        }
        const publishManifest = dependencies.publishManifest || publishXrV2ManifestThroughExistingStorage
        const receipt = await publishManifest({
          workspacePath: paths.manifestWorkspacePath,
          canonicalPath: paths.manifestCanonicalPath,
          text: serializeXrV2CrossDeviceAssetManifest(manifest),
          workspaceId: config.workspaceId,
          baseUrl: config.baseUrl,
          fetchImpl: scopedFetch,
        })
        if (receipt.status === 'conflict') {
          throw new XrV2CrossDeviceAssetError('identity-conflict', 'XR manifest sync reported a document conflict')
        }
        if (receipt.status === 'rejected') {
          throw new XrV2CrossDeviceAssetError('integrity-failed', 'XR manifest sync rejected the document')
        }
        return receipt.status === 'deferred'
          ? deferred('manifest-sync-deferred', paths.manifestCanonicalPath)
          : Object.freeze({ status: 'published', manifest })
      })
    } catch (error) {
      if (transportFailure(error)) return deferred('transport-unavailable', paths.manifestCanonicalPath)
      throw error
    }
  }

  const list = async (input: XrV2CrossDeviceListInput = {}): Promise<XrV2CrossDeviceListResult> => {
    if (!online()) return Object.freeze({
      ...deferred('offline', null),
      manifests: Object.freeze([]) as readonly [],
    })
    try {
      return await runLifecycle(config, input, async signal => {
        const documents = await (dependencies.listManifestDocuments || defaultListDocuments)({
          workspaceId: config.workspaceId,
          baseUrl: config.baseUrl,
          fetchImpl: needFetch(),
          signal,
        })
        const candidates = documents.filter(document => !document.deleted
          && document.canonicalPath.startsWith(`${config.manifestRoot}/`))
        if (candidates.length > config.maxCatalogAssets * 4) {
          throw new XrV2CrossDeviceAssetError('catalog-bound-exceeded', 'XR manifest catalog exceeds the admitted scan bound')
        }
        const manifests: XrV2CrossDeviceAssetManifest[] = []
        for (const document of candidates) {
          const manifest = await parseXrV2CrossDeviceAssetManifest(document.contentMd, config, document.canonicalPath)
          if (!input.sourceId || manifest.source_id === String(input.sourceId).trim()) manifests.push(manifest)
        }
        manifests.sort((left, right) => right.published_at_ms - left.published_at_ms
          || left.asset.asset_id.localeCompare(right.asset.asset_id))
        return Object.freeze({ status: 'ready', manifests: Object.freeze(manifests.slice(0, config.maxCatalogAssets)) })
      })
    } catch (error) {
      if (transportFailure(error)) return Object.freeze({
        ...deferred('transport-unavailable', null),
        manifests: Object.freeze([]) as readonly [],
      })
      throw error
    }
  }

  const read = async (input: XrV2CrossDeviceReadInput): Promise<XrV2CrossDeviceReadResult> => {
    const paths = await resolveXrV2CrossDeviceAssetPaths(config, input.sourceId, input.assetId)
    if (!online()) return deferred('offline', paths.manifestCanonicalPath)
    try {
      return await runLifecycle(config, input, async signal => {
        const scopedFetch = lifecycleFetch(needFetch(), signal)
        const manifest = input.manifest || await (async () => {
          const text = await (dependencies.readManifestText || defaultReadManifest)({
            canonicalPath: paths.manifestCanonicalPath,
            workspaceId: config.workspaceId,
            baseUrl: config.baseUrl,
            fetchImpl: scopedFetch,
            signal,
          })
          if (text === null) throw new XrV2CrossDeviceAssetError('not-found', 'XR cross-device asset manifest was not found')
          return parseXrV2CrossDeviceAssetManifest(text, config, paths.manifestCanonicalPath)
        })()
        if (manifest.source_id !== String(input.sourceId).trim() || manifest.asset.asset_id !== input.assetId
          || manifest.canonical_path !== paths.manifestCanonicalPath) {
          throw new XrV2CrossDeviceAssetError('identity-conflict', 'Requested XR identity does not match its manifest')
        }
        const fetchPart = async (remote: XrV2CrossDeviceAssetPart): Promise<Uint8Array> => {
          if (remote.public_path !== buildAgenticGraphStorageBlobPath(config.workspaceId, remote.canonical_path)) {
            throw new XrV2CrossDeviceAssetError('integrity-failed', 'XR part public path is not canonical')
          }
          const response = await scopedFetch(resolveAgenticGraphStorageApiUrl(remote.public_path, config.baseUrl), { method: 'GET' })
          if (!response.ok) throw new Error(`XR part read failed with HTTP ${response.status}`)
          const responseType = String(response.headers.get('content-type') || '').split(';')[0].trim()
          if (responseType && responseType !== remote.content_type) {
            throw new XrV2CrossDeviceAssetError('integrity-failed', 'XR part content type does not match its manifest')
          }
          const bytes = await responseBytes(response, config.maxPartBytes, signal, remote.size_bytes)
          if (bytes.byteLength !== remote.size_bytes
            || await sha256XrV2CrossDeviceBytes(bytes, signal) !== remote.content_hash) {
            throw new XrV2CrossDeviceAssetError('integrity-failed', 'XR part bytes do not match manifest size and SHA-256')
          }
          return bytes
        }
        const rawBytes = await fetchPart(manifest.raw_part)
        const rawClip = new Blob([rawBytes], { type: manifest.raw_part.content_type })
        const frameBytes = manifest.frame_bundle_part ? await fetchPart(manifest.frame_bundle_part) : null
        const frameBundle = frameBytes && manifest.frame_bundle_part
          ? await decodeXrV2CrossDeviceFrameBundle(frameBytes, manifest.frame_bundle_part.content_hash, signal)
          : null
        if (frameBundle && frameBundle.sessionId !== manifest.asset.session_id) {
          throw new XrV2CrossDeviceAssetError('identity-conflict', 'Downloaded XR frame bundle belongs to another session')
        }
        const existing = await input.localStore.readPublishedSpatialAsset(manifest.asset.asset_id)
        if (existing && !compatibleLocalAsset(existing, manifest.asset)) {
          throw new XrV2CrossDeviceAssetError('identity-conflict', 'Local XR asset id already belongs to different content')
        }
        const asset = await input.localStore.importSavedAssetAtomically({
          rawKind: manifest.raw_kind,
          rawClip,
          frameBundle,
          asset: manifest.asset,
        })
        const stored = await input.localStore.readPublishedSpatialAsset(asset.asset_id)
        if (!stored || !compatibleLocalAsset(stored, asset)) {
          throw new XrV2CrossDeviceAssetError('local-import-failed', 'Local XR IndexedDB import did not round-trip')
        }
        return Object.freeze({ status: 'imported', manifest, asset, rawClip, frameBundle })
      })
    } catch (error) {
      if (transportFailure(error)) return deferred('transport-unavailable', paths.manifestCanonicalPath)
      throw error
    }
  }

  return Object.freeze({ config, publish, list, read })
}

type AdapterOptions = Parameters<typeof createXrV2CrossDeviceAssetAdapter>[0]

export function publishXrV2CrossDeviceAsset(input: XrV2CrossDevicePublishInput, options?: AdapterOptions) {
  return createXrV2CrossDeviceAssetAdapter(options).publish(input)
}

export function listXrV2CrossDeviceAssets(input: XrV2CrossDeviceListInput = {}, options?: AdapterOptions) {
  return createXrV2CrossDeviceAssetAdapter(options).list(input)
}

export function readXrV2CrossDeviceAsset(input: XrV2CrossDeviceReadInput, options?: AdapterOptions) {
  return createXrV2CrossDeviceAssetAdapter(options).read(input)
}
