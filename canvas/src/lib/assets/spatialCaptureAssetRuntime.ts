import type { StandaloneSpatialCaptureManifest, SpatialCaptureStandaloneFormat } from '@/features/markdown-workspace/workspaceImport/spatialCaptureFileset'
import { resolveBinaryDownloadProxyUrl } from '@/lib/chatEndpoint'
import { buildLocalFsFetchPath, buildLocalFsRangeFetchPath } from '@/lib/url'
import { parsePlyPointCloud, type PlyPointCloud } from './plyPointCloud'
import { readFetchTargetRangePreviewBuffer, readFileRangePreviewBuffer, type SpatialCapturePreviewBufferLoad } from './spatialCapturePreviewRange'

type PendingSpatialCaptureAsset = {
  file: File
  originalName?: string
  format: SpatialCaptureStandaloneFormat
}

export type SpatialCapturePointCloudLoad = {
  fidelity: 'preview' | 'full'
  pointCloud: PlyPointCloud
  source: 'pending-local' | 'browser-cache' | 'local-source' | 'url'
  byteLength: number
  pointBudget: number
}

type SpatialCaptureFetchTarget = {
  path: string
  source: SpatialCapturePointCloudLoad['source']
}

type SpatialCaptureSourceBufferLoad = {
  buffer: ArrayBuffer
  byteLength: number
  source: SpatialCapturePointCloudLoad['source']
}

const pendingSpatialCaptureAssetsByPath = new Map<string, PendingSpatialCaptureAsset>()
const sourceBuffersByKey = new Map<string, Promise<SpatialCaptureSourceBufferLoad | null>>()
const pointCloudLoadsByKey = new Map<string, Promise<SpatialCapturePointCloudLoad | null>>()
const DEFAULT_SPATIAL_CAPTURE_POINT_BUDGET = 900_000
const HIGH_MEMORY_SPATIAL_CAPTURE_POINT_BUDGET = 1_600_000
const LOW_MEMORY_SPATIAL_CAPTURE_POINT_BUDGET = 420_000
const DEFAULT_SPATIAL_CAPTURE_PREVIEW_POINT_BUDGET = 220_000
const HIGH_MEMORY_SPATIAL_CAPTURE_PREVIEW_POINT_BUDGET = 360_000
const LOW_MEMORY_SPATIAL_CAPTURE_PREVIEW_POINT_BUDGET = 120_000
const DEFAULT_SPATIAL_CAPTURE_PARSE_POINT_LIMIT = 2_400_000
const HIGH_MEMORY_SPATIAL_CAPTURE_PARSE_POINT_LIMIT = 3_200_000
const LOW_MEMORY_SPATIAL_CAPTURE_PARSE_POINT_LIMIT = 2_100_000
const DEFAULT_SPATIAL_CAPTURE_LOAD_CACHE_ENTRIES = 2
const HIGH_MEMORY_SPATIAL_CAPTURE_LOAD_CACHE_ENTRIES = 3
const LOW_MEMORY_SPATIAL_CAPTURE_LOAD_CACHE_ENTRIES = 1
const SPATIAL_CAPTURE_BROWSER_CACHE_NAME = 'kg-spatial-capture-payload-v1'
const SPATIAL_CAPTURE_PARSE_WORKER_TIMEOUT_MS = 45_000
const SPATIAL_CAPTURE_SOURCE_ROOT_STORAGE_KEYS = [
  'kgSpatialCaptureSourceRoots',
  'kg:spatial-capture:source-roots',
]

type PlyParseWorkerResponse = {
  requestId: number
  ok: true
  pointCloud: PlyPointCloud
} | {
  requestId: number
  ok: false
  error: string
}

type PendingPlyParseRequest = {
  resolve: (pointCloud: PlyPointCloud) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

let plyParseWorker: Worker | null = null
let plyParseWorkerUnavailable = false
let nextPlyParseWorkerRequestId = 1
const pendingPlyParseRequests = new Map<number, PendingPlyParseRequest>()

function normalizePendingPath(path: unknown): string {
  const raw = String(path || '').trim().replace(/\\/g, '/')
  if (!raw) return ''
  return raw.startsWith('/') ? raw : `/${raw}`
}

function normalizePayloadCacheIdentity(value: unknown): string {
  return String(value || '').trim().replace(/\\/g, '/')
}

function buildBrowserPayloadCachePath(identity: unknown, format: SpatialCaptureStandaloneFormat): string {
  const normalized = normalizePayloadCacheIdentity(identity)
  if (!normalized) return ''
  const key = [format, normalized].join('|')
  return `/__agentic_os_spatial_capture_payload/${encodeURIComponent(key)}`
}

function resolveBrowserPayloadCacheIdentities(args: {
  path?: unknown
  originalName?: unknown
  manifest?: StandaloneSpatialCaptureManifest
}): string[] {
  const values = [
    args.path,
    args.originalName,
    args.manifest?.pendingLocalPath,
    args.manifest?.sourceIdentity,
    args.manifest?.sourceName,
    args.manifest?.renderCacheKey,
  ]
  const seen = new Set<string>()
  const identities: string[] = []
  for (const value of values) {
    const identity = normalizePayloadCacheIdentity(value)
    if (!identity || seen.has(identity)) continue
    seen.add(identity)
    identities.push(identity)
    const pendingPath = normalizePendingPath(identity)
    if (pendingPath && !seen.has(pendingPath)) {
      seen.add(pendingPath)
      identities.push(pendingPath)
    }
  }
  return identities
}

async function persistBrowserPayloadCache(path: unknown, item: PendingSpatialCaptureAsset): Promise<void> {
  if (typeof caches === 'undefined' || typeof Response === 'undefined') return
  const cache = await caches.open(SPATIAL_CAPTURE_BROWSER_CACHE_NAME)
  const headers = {
    'content-type': item.format === 'ply' ? 'model/ply' : 'application/octet-stream',
    'x-kg-source-name': String(item.originalName || ''),
  }
  for (const identity of resolveBrowserPayloadCacheIdentities({ path, originalName: item.originalName })) {
    const cachePath = buildBrowserPayloadCachePath(identity, item.format)
    if (!cachePath) continue
    await cache.put(cachePath, new Response(item.file.slice(0, item.file.size, item.file.type), { headers }))
  }
}

async function readBrowserPayloadCache(manifest: StandaloneSpatialCaptureManifest): Promise<ArrayBuffer | null> {
  if (typeof caches === 'undefined') return null
  const cache = await caches.open(SPATIAL_CAPTURE_BROWSER_CACHE_NAME)
  for (const identity of resolveBrowserPayloadCacheIdentities({ manifest })) {
    const response = await cache.match(buildBrowserPayloadCachePath(identity, manifest.format))
    if (!response || !response.ok) continue
    return response.arrayBuffer()
  }
  return null
}

function deleteBrowserPayloadCache(path: unknown, format: SpatialCaptureStandaloneFormat): void {
  if (typeof caches === 'undefined') return
  void caches.open(SPATIAL_CAPTURE_BROWSER_CACHE_NAME)
    .then(cache => cache.delete(buildBrowserPayloadCachePath(path, format)))
    .catch(() => void 0)
}

function readStorageText(storage: Storage | null | undefined, key: string): string {
  try {
    return String(storage?.getItem(key) || '').trim()
  } catch {
    return ''
  }
}

function parseSourceRootList(raw: string): string[] {
  const text = String(raw || '').trim()
  if (!text) return []
  const parsed = (() => {
    try {
      const value = JSON.parse(text)
      return Array.isArray(value) ? value : [value]
    } catch {
      return text.split(/[\n,]/)
    }
  })()
  const seen = new Set<string>()
  const roots: string[] = []
  for (const value of parsed) {
    const root = String(value || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')
    if (!root || seen.has(root) || !buildLocalFsFetchPath(root)) continue
    seen.add(root)
    roots.push(root)
  }
  return roots
}

function readOperatorSpatialCaptureSourceRoots(): string[] {
  if (typeof window === 'undefined') return []
  const roots: string[] = []
  const seen = new Set<string>()
  for (const key of SPATIAL_CAPTURE_SOURCE_ROOT_STORAGE_KEYS) {
    for (const root of [
      ...parseSourceRootList(readStorageText(window.localStorage, key)),
      ...parseSourceRootList(readStorageText(window.sessionStorage, key)),
    ]) {
      if (seen.has(root)) continue
      seen.add(root)
      roots.push(root)
    }
  }
  return roots
}

function normalizeRelativeSpatialCaptureSource(value: unknown): string {
  const raw = String(value || '').trim().replace(/\\/g, '/').replace(/^file:\/\//i, '').split(/[?#]/)[0] || ''
  if (!raw || raw.startsWith('/') || raw.startsWith('/@fs/') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return ''
  const parts = raw.split('/').filter(Boolean)
  const out: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') return ''
    out.push(part)
  }
  return out.join('/')
}

function resolveOperatorSourceRootFetchTargets(manifest: StandaloneSpatialCaptureManifest): SpatialCaptureFetchTarget[] {
  if (manifest.sourceKind !== 'local') return []
  const candidates = [
    normalizeRelativeSpatialCaptureSource(manifest.sourceIdentity),
    normalizeRelativeSpatialCaptureSource(manifest.sourceName),
  ].filter(Boolean)
  if (!candidates.length) return []
  const seen = new Set<string>()
  const targets: SpatialCaptureFetchTarget[] = []
  for (const root of readOperatorSpatialCaptureSourceRoots()) {
    for (const candidate of candidates) {
      const fetchPath = buildLocalFsRangeFetchPath(`${root}/${candidate}`) || buildLocalFsFetchPath(`${root}/${candidate}`)
      if (!fetchPath || seen.has(fetchPath)) continue
      seen.add(fetchPath)
      targets.push({ path: fetchPath, source: 'local-source' })
    }
  }
  return targets
}

export function setPendingSpatialCaptureAsset(path: unknown, file: File, originalName: string | undefined, format: SpatialCaptureStandaloneFormat): void {
  const key = normalizePendingPath(path)
  if (!key) return
  const item = { file, originalName, format }
  pendingSpatialCaptureAssetsByPath.set(key, item)
  void persistBrowserPayloadCache(key, item).catch(() => void 0)
}

export function clearPendingSpatialCaptureAsset(path: unknown): void {
  const key = normalizePendingPath(path)
  if (!key) return
  const pending = pendingSpatialCaptureAssetsByPath.get(key)
  pendingSpatialCaptureAssetsByPath.delete(key)
  if (pending) deleteBrowserPayloadCache(key, pending.format)
}

export function hasPendingSpatialCaptureAsset(path: unknown): boolean {
  const key = normalizePendingPath(path)
  return !!key && pendingSpatialCaptureAssetsByPath.has(key)
}

function resolveSpatialCaptureFetchTargets(manifest: StandaloneSpatialCaptureManifest): SpatialCaptureFetchTarget[] {
  const source = String(manifest.sourceIdentity || '').trim()
  if (!source) return resolveOperatorSourceRootFetchTargets(manifest)
  if (manifest.sourceKind === 'local') {
    const withoutFileProtocol = source.replace(/^file:\/\//i, '')
    const directLocalPath = buildLocalFsRangeFetchPath(withoutFileProtocol) || buildLocalFsRangeFetchPath(source) || buildLocalFsFetchPath(withoutFileProtocol) || buildLocalFsFetchPath(source)
    return directLocalPath
      ? [{ path: directLocalPath, source: 'local-source' }]
      : resolveOperatorSourceRootFetchTargets(manifest)
  }
  if (manifest.sourceKind !== 'url') return []
  if (source.startsWith('/@fs/') || source.startsWith('/__codebase_file') || source.startsWith('/__binary_download_proxy')) {
    return [{ path: source, source: 'url' }]
  }
  const withoutFileProtocol = source.replace(/^file:\/\//i, '')
  const localPath = buildLocalFsRangeFetchPath(withoutFileProtocol) || buildLocalFsRangeFetchPath(source) || buildLocalFsFetchPath(withoutFileProtocol) || buildLocalFsFetchPath(source)
  if (localPath) return [{ path: localPath, source: 'local-source' }]
  if (/^https?:\/\//i.test(source)) return [{ path: resolveBinaryDownloadProxyUrl(source), source: 'url' }]
  if (source.startsWith('/')) return [{ path: source, source: 'url' }]
  return []
}

function buildManifestCacheKey(manifest: StandaloneSpatialCaptureManifest, ...segments: Array<number | string | undefined>): string {
  return [
    manifest.format,
    manifest.renderCacheKey,
    manifest.pendingLocalPath,
    manifest.sourceKind,
    manifest.sourceIdentity,
    ...segments,
  ].join('|')
}

function buildLoadCacheKey(manifest: StandaloneSpatialCaptureManifest, maxPoints: number, pointBudget: number): string { return buildManifestCacheKey(manifest, maxPoints, pointBudget) }
function buildSourceBufferCacheKey(manifest: StandaloneSpatialCaptureManifest): string { return buildManifestCacheKey(manifest) }

function readDeviceMemoryGb(): number {
  const nav = typeof navigator !== 'undefined' ? navigator as Navigator & { deviceMemory?: unknown } : null
  const raw = Number(nav?.deviceMemory)
  return Number.isFinite(raw) ? raw : 0
}

function readHardwareConcurrency(): number {
  const nav = typeof navigator !== 'undefined' ? navigator as Navigator & { hardwareConcurrency?: unknown } : null
  const raw = Number(nav?.hardwareConcurrency)
  return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0
}

export function resolveSpatialCapturePointBudget(): number {
  return resolveAdaptiveSpatialCaptureBudget(LOW_MEMORY_SPATIAL_CAPTURE_POINT_BUDGET, DEFAULT_SPATIAL_CAPTURE_POINT_BUDGET, HIGH_MEMORY_SPATIAL_CAPTURE_POINT_BUDGET)
}
export function resolveSpatialCapturePreviewPointBudget(): number {
  return resolveAdaptiveSpatialCaptureBudget(LOW_MEMORY_SPATIAL_CAPTURE_PREVIEW_POINT_BUDGET, DEFAULT_SPATIAL_CAPTURE_PREVIEW_POINT_BUDGET, HIGH_MEMORY_SPATIAL_CAPTURE_PREVIEW_POINT_BUDGET)
}
export function resolveSpatialCaptureParsePointLimit(): number {
  return resolveAdaptiveSpatialCaptureBudget(LOW_MEMORY_SPATIAL_CAPTURE_PARSE_POINT_LIMIT, DEFAULT_SPATIAL_CAPTURE_PARSE_POINT_LIMIT, HIGH_MEMORY_SPATIAL_CAPTURE_PARSE_POINT_LIMIT)
}

function resolveAdaptiveSpatialCaptureBudget(low: number, fallback: number, high: number): number {
  const memoryGb = readDeviceMemoryGb()
  const cores = readHardwareConcurrency()
  if (cores > 0 && cores <= 4) return low
  if (memoryGb > 0 && memoryGb <= 4) return low
  if (memoryGb >= 12 && cores >= 8) return high
  return fallback
}

function resolveSpatialCaptureLoadCacheEntries(): number {
  const memoryGb = readDeviceMemoryGb()
  if (memoryGb > 0 && memoryGb <= 4) return LOW_MEMORY_SPATIAL_CAPTURE_LOAD_CACHE_ENTRIES
  if (memoryGb >= 12) return HIGH_MEMORY_SPATIAL_CAPTURE_LOAD_CACHE_ENTRIES
  return DEFAULT_SPATIAL_CAPTURE_LOAD_CACHE_ENTRIES
}

function readCachedSpatialCaptureLoad(cacheKey: string): Promise<SpatialCapturePointCloudLoad | null> | null {
  const cached = pointCloudLoadsByKey.get(cacheKey)
  if (!cached) return null
  pointCloudLoadsByKey.delete(cacheKey)
  pointCloudLoadsByKey.set(cacheKey, cached)
  return cached
}

function pruneCache<T>(cache: Map<string, T>, activeCacheKey: string): void {
  const maxEntries = Math.max(1, resolveSpatialCaptureLoadCacheEntries())
  while (cache.size > maxEntries) {
    const nextKey = cache.keys().next().value
    if (!nextKey || nextKey === activeCacheKey) break
    cache.delete(nextKey)
  }
}

function pruneSpatialCaptureLoadCache(activeCacheKey: string): void { pruneCache(pointCloudLoadsByKey, activeCacheKey) }
function pruneSpatialCaptureSourceBufferCache(activeCacheKey: string): void { pruneCache(sourceBuffersByKey, activeCacheKey) }

async function yieldBeforeHeavyPointCloudParse(): Promise<void> {
  await new Promise<void>(resolve => {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: 80 })
      return
    }
    setTimeout(resolve, 0)
  })
}

function rejectPendingPlyParseWorkerRequests(error: Error): void {
  for (const [requestId, pending] of pendingPlyParseRequests) {
    clearTimeout(pending.timeoutId)
    pendingPlyParseRequests.delete(requestId)
    pending.reject(error)
  }
}

function handlePlyParseWorkerMessage(event: MessageEvent<PlyParseWorkerResponse>): void {
  const message = event.data
  if (!message || typeof message.requestId !== 'number') return
  const pending = pendingPlyParseRequests.get(message.requestId)
  if (!pending) return
  clearTimeout(pending.timeoutId)
  pendingPlyParseRequests.delete(message.requestId)
  if (message.ok === true) {
    pending.resolve(message.pointCloud)
    return
  }
  pending.reject(new Error(message.error || 'PLY parse worker failed'))
}

function handlePlyParseWorkerError(): void {
  plyParseWorkerUnavailable = true
  plyParseWorker?.terminate()
  plyParseWorker = null
  rejectPendingPlyParseWorkerRequests(new Error('PLY parse worker failed'))
}

function resolvePlyParseWorker(): Worker | null {
  if (plyParseWorkerUnavailable || typeof Worker === 'undefined') return null
  if (plyParseWorker) return plyParseWorker
  try {
    plyParseWorker = new Worker(new URL('./plyPointCloudWorker.ts', import.meta.url), {
      name: 'kg-ply-point-cloud-parser',
      type: 'module',
    })
    plyParseWorker.addEventListener('message', handlePlyParseWorkerMessage)
    plyParseWorker.addEventListener('error', handlePlyParseWorkerError)
    return plyParseWorker
  } catch {
    plyParseWorkerUnavailable = true
    return null
  }
}

function parsePlyPointCloudInWorker(buffer: ArrayBuffer, maxPoints: number): Promise<PlyPointCloud> | null {
  const worker = resolvePlyParseWorker()
  if (!worker) return null
  const requestId = nextPlyParseWorkerRequestId
  nextPlyParseWorkerRequestId += 1
  return new Promise<PlyPointCloud>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingPlyParseRequests.delete(requestId)
      reject(new Error('PLY parse worker timed out'))
    }, SPATIAL_CAPTURE_PARSE_WORKER_TIMEOUT_MS)
    pendingPlyParseRequests.set(requestId, { resolve, reject, timeoutId })
    try {
      worker.postMessage({ requestId, buffer, maxPoints }, [buffer])
    } catch (error) {
      clearTimeout(timeoutId)
      pendingPlyParseRequests.delete(requestId)
      reject(error instanceof Error ? error : new Error('PLY parse worker post failed'))
    }
  })
}

async function parseSpatialCapturePointCloud(buffer: ArrayBuffer, maxPoints: number): Promise<PlyPointCloud> {
  const workerParsed = parsePlyPointCloudInWorker(buffer, maxPoints)
  if (workerParsed) return workerParsed
  return parsePlyPointCloud(buffer, maxPoints)
}

function patchPreviewSourcePointCount(pointCloud: PlyPointCloud, sourcePointCount: number): PlyPointCloud {
  return {
    ...pointCloud,
    sourcePointCount: Math.max(pointCloud.sourcePointCount, Math.floor(sourcePointCount)),
  }
}

function buildSpatialCapturePointCloudLoad(args: {
  byteLength: number
  fidelity: SpatialCapturePointCloudLoad['fidelity']
  pointBudget: number
  pointCloud: PlyPointCloud
  source: SpatialCapturePointCloudLoad['source']
}): SpatialCapturePointCloudLoad {
  return {
    fidelity: args.fidelity,
    pointCloud: args.pointCloud,
    source: args.source,
    byteLength: args.byteLength,
    pointBudget: Math.min(args.pointCloud.pointCount, Math.max(1, Math.floor(args.pointBudget))),
  }
}

async function readSpatialCapturePreviewBuffer(manifest: StandaloneSpatialCaptureManifest, maxPoints: number): Promise<SpatialCapturePreviewBufferLoad | null> {
  const pendingPath = normalizePendingPath(manifest.pendingLocalPath)
  const pending = pendingPath ? pendingSpatialCaptureAssetsByPath.get(pendingPath) : null
  if (pending && pending.format === 'ply') return readFileRangePreviewBuffer(pending.file, 'pending-local', maxPoints)
  for (const target of resolveSpatialCaptureFetchTargets(manifest)) {
    try {
      const preview = await readFetchTargetRangePreviewBuffer(target, maxPoints)
      if (preview) {
        if (preview.sourcePointCount <= 0) {
          sourceBuffersByKey.set(buildSourceBufferCacheKey(manifest), Promise.resolve({
            buffer: preview.buffer,
            byteLength: preview.byteLength,
            source: preview.source,
          }))
        }
        return preview
      }
    } catch {
      void 0
    }
  }
  return null
}

async function readSpatialCaptureSourceBuffer(manifest: StandaloneSpatialCaptureManifest): Promise<SpatialCaptureSourceBufferLoad | null> {
  const pendingPath = normalizePendingPath(manifest.pendingLocalPath)
  const pending = pendingPath ? pendingSpatialCaptureAssetsByPath.get(pendingPath) : null
  if (pending && pending.format === 'ply') {
    const buffer = await pending.file.arrayBuffer()
    return { buffer, byteLength: buffer.byteLength, source: 'pending-local' }
  }
  const cachedBuffer = await readBrowserPayloadCache(manifest)
  if (cachedBuffer) return { buffer: cachedBuffer, byteLength: cachedBuffer.byteLength, source: 'browser-cache' }
  const fetchTargets = resolveSpatialCaptureFetchTargets(manifest)
  if (!fetchTargets.length) return null
  let lastError: unknown = null
  for (const target of fetchTargets) {
    try {
      const response = await fetch(target.path, { headers: { Accept: 'model/ply,application/octet-stream,*/*' } })
      if (!response.ok) {
        lastError = new Error(`PLY source fetch failed (${response.status})`)
        continue
      }
      const buffer = await response.arrayBuffer()
      return { buffer, byteLength: buffer.byteLength, source: target.source }
    } catch (error) {
      lastError = error
    }
  }
  if (lastError instanceof Error) throw lastError
  throw new Error('PLY source fetch failed')
}

async function loadSpatialCaptureSourceBuffer(manifest: StandaloneSpatialCaptureManifest): Promise<SpatialCaptureSourceBufferLoad | null> {
  const cacheKey = buildSourceBufferCacheKey(manifest)
  const cached = sourceBuffersByKey.get(cacheKey)
  if (cached) return cached
  const task = readSpatialCaptureSourceBuffer(manifest)
  task.catch(() => {
    if (sourceBuffersByKey.get(cacheKey) === task) sourceBuffersByKey.delete(cacheKey)
  })
  sourceBuffersByKey.set(cacheKey, task)
  pruneSpatialCaptureSourceBufferCache(cacheKey)
  return task
}

export async function loadSpatialCapturePointCloudPreview(
  manifest: StandaloneSpatialCaptureManifest,
  maxPoints = resolveSpatialCapturePreviewPointBudget(),
): Promise<SpatialCapturePointCloudLoad | null> {
  if (manifest.format !== 'ply') return null
  const pointBudget = resolveSpatialCapturePointBudget()
  const cacheKey = buildLoadCacheKey(manifest, maxPoints, pointBudget)
  const cached = readCachedSpatialCaptureLoad(cacheKey)
  if (cached) return cached
  const task = (async () => {
    const previewBuffer = await readSpatialCapturePreviewBuffer(manifest, maxPoints)
    if (previewBuffer) {
      await yieldBeforeHeavyPointCloudParse()
      return buildSpatialCapturePointCloudLoad({
        byteLength: previewBuffer.byteLength,
        fidelity: 'preview',
        pointCloud: patchPreviewSourcePointCount(parsePlyPointCloud(previewBuffer.buffer, maxPoints), previewBuffer.sourcePointCount),
        pointBudget,
        source: previewBuffer.source,
      })
    }
    const sourceBuffer = await loadSpatialCaptureSourceBuffer(manifest)
    if (!sourceBuffer) return null
    await yieldBeforeHeavyPointCloudParse()
    return buildSpatialCapturePointCloudLoad({
      byteLength: sourceBuffer.byteLength,
      fidelity: 'preview',
      pointCloud: parsePlyPointCloud(sourceBuffer.buffer, maxPoints),
      pointBudget,
      source: sourceBuffer.source,
    })
  })()
  task.catch(() => {
    if (pointCloudLoadsByKey.get(cacheKey) === task) pointCloudLoadsByKey.delete(cacheKey)
  })
  pointCloudLoadsByKey.set(cacheKey, task)
  pruneSpatialCaptureLoadCache(cacheKey)
  return task
}

export async function loadSpatialCapturePointCloud(
  manifest: StandaloneSpatialCaptureManifest,
  maxPoints = resolveSpatialCaptureParsePointLimit(),
): Promise<SpatialCapturePointCloudLoad | null> {
  if (manifest.format !== 'ply') return null
  const pointBudget = resolveSpatialCapturePointBudget()
  const cacheKey = buildLoadCacheKey(manifest, maxPoints, pointBudget)
  const cached = readCachedSpatialCaptureLoad(cacheKey)
  if (cached) return cached
  const task = (async () => {
    const sourceBufferCacheKey = buildSourceBufferCacheKey(manifest)
    const sourceBuffer = await loadSpatialCaptureSourceBuffer(manifest)
    if (!sourceBuffer) return null
    sourceBuffersByKey.delete(sourceBufferCacheKey)
    await yieldBeforeHeavyPointCloudParse()
    return buildSpatialCapturePointCloudLoad({
      byteLength: sourceBuffer.byteLength,
      fidelity: 'full',
      pointCloud: await parseSpatialCapturePointCloud(sourceBuffer.buffer, maxPoints),
      pointBudget,
      source: sourceBuffer.source,
    })
  })()
  task.catch(() => {
    if (pointCloudLoadsByKey.get(cacheKey) === task) pointCloudLoadsByKey.delete(cacheKey)
  })
  pointCloudLoadsByKey.set(cacheKey, task)
  pruneSpatialCaptureLoadCache(cacheKey)
  return task
}

export function resetSpatialCaptureAssetRuntimeForTests(): void {
  pendingSpatialCaptureAssetsByPath.clear()
  sourceBuffersByKey.clear()
  pointCloudLoadsByKey.clear()
  plyParseWorker?.terminate()
  plyParseWorker = null
  plyParseWorkerUnavailable = false
  rejectPendingPlyParseWorkerRequests(new Error('Spatial capture runtime reset'))
}
