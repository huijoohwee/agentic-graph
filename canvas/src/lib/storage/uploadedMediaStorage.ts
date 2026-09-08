import { readActiveAgenticGraphStorageWorkspaceId } from '@/features/source-files/sourceFileShareUrl'
import {
  readAgenticGraphStorageBaseUrl,
  readAgenticGraphStorageRuntimeSyncEnabled,
} from '@/features/source-files/source-files-agentic-graph-storage-settings'
import { resolveAgenticGraphStorageApiUrl } from '@/lib/storage/agentic-graph-storage-client-sync'
import {
  AGENTIC_OS_STORAGE_API_VERSION,
  buildAgenticGraphStorageMediaWorkspace,
  AGENTIC_OS_STORAGE_ROUTE_PATHS,
  buildAgenticGraphStorageMediaAssetListPath,
  buildAgenticGraphStorageMediaAssetPersistPath,
  buildAgenticGraphStorageMediaPath,
  type AgenticGraphMediaAssetDeleteResponse,
  type AgenticGraphMediaAssetListItem,
  type AgenticGraphMediaAssetListResponse,
  type AgenticGraphMediaAssetRenameResponse,
  type AgenticGraphMediaArtifactKind,
  type AgenticGraphMediaAssetPersistRequest,
  type AgenticGraphMediaAssetPersistResponse,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
import {
  buildApiOriginKey,
  buildAgenticGraphStorageSyncAuthHeaders,
  getClientFetch,
  fetchWithTimeout,
  cancelStorageStream,
  parseStorageResponseJson,
} from '@/lib/storage/agentic-graph-storage-client-transport'
import { buildRuntimeStorageMediaAccessUrl } from '@/lib/storage/runtimeMediaUrl'

const normalizeString = (value: unknown): string => String(value || '').trim()

const readUploadedMediaClientFetch = (fetchImpl?: typeof fetch): typeof fetch | null => {
  const candidate = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
  return candidate ? getClientFetch(candidate) : null
}

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')

const hashBlobSha256 = async (blob: Blob): Promise<string | null> => {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
    return `sha256:${bytesToHex(new Uint8Array(digest))}`
  } catch {
    return null
  }
}

export const buildUploadedMediaAccessUrl = (args: {
  publicUrl: string
  runId: string
  ttlMs?: number | null
}): string => {
  const publicUrl = normalizeString(args.publicUrl)
  const runId = normalizeString(args.runId)
  if (!publicUrl || !runId) return publicUrl
  return buildRuntimeStorageMediaAccessUrl({ publicUrl, runId, ttlMs: args.ttlMs }) || publicUrl
}

const normalizeSlug = (value: string, fallback: string): string => {
  const normalized = normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

const readFileExtension = (file: File): string => {
  const fromName = normalizeString(file.name).match(/\.([a-z0-9]{1,12})$/i)?.[1]
  if (fromName) return fromName.toLowerCase()
  if (/^image\/png$/i.test(file.type)) return 'png'
  if (/^image\/jpe?g$/i.test(file.type)) return 'jpg'
  if (/^image\/webp$/i.test(file.type)) return 'webp'
  if (/^audio\/mpeg$/i.test(file.type)) return 'mp3'
  if (/^audio\/wav$/i.test(file.type)) return 'wav'
  if (/^video\/mp4$/i.test(file.type)) return 'mp4'
  if (/^video\/webm$/i.test(file.type)) return 'webm'
  return 'bin'
}

export const readUploadedMediaKind = (file: File): Extract<AgenticGraphMediaArtifactKind, 'image' | 'audio' | 'video'> | null => {
  const type = normalizeString(file.type).toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('video/')) return 'video'
  return null
}

export type UploadedMediaStorageResult = {
  workspaceId: string
  runId: string
  stageId: string
  shotId: string
  objectKey: string
  publicPath: string
  publicUrl: string
  accessUrl: string
  contentHash: string
  contentType: string
  provenance: Record<string, unknown>
  response: AgenticGraphMediaAssetPersistResponse
}

const artifactIdFromStorage = (storage: UploadedMediaStorageResult): string =>
  storage.response.artifactId || `${storage.runId}:${storage.stageId}:${storage.shotId}`

const buildUploadedMediaStorageFromArtifact = (args: {
  workspaceId: string
  artifact: AgenticGraphMediaAssetListItem
  accessUrl?: string | null
}): UploadedMediaStorageResult | null => {
  const artifact = args.artifact
  const kind = artifact.kind === 'image' || artifact.kind === 'audio' || artifact.kind === 'video' ? artifact.kind : null
  if (!kind || !artifact.objectKey || !artifact.runId || !artifact.contentHash) return null
  const baseUrl = readAgenticGraphStorageBaseUrl()
  const publicPath = artifact.publicPath || buildAgenticGraphStorageMediaPath(artifact.objectKey)
  const publicUrl = resolveAgenticGraphStorageApiUrl(publicPath, baseUrl)
  const accessUrl = normalizeString(args.accessUrl) || publicUrl
  return {
    workspaceId: args.workspaceId,
    runId: artifact.runId,
    stageId: artifact.stageId,
    shotId: artifact.shotId,
    objectKey: artifact.objectKey,
    publicPath,
    publicUrl,
    accessUrl,
    contentHash: artifact.contentHash,
    contentType: normalizeString(artifact.mediaType) || 'application/octet-stream',
    provenance: artifact.provenance,
    response: {
      ok: true,
      apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
      workspaceId: args.workspaceId,
      artifactId: artifact.artifactId,
      objectKey: artifact.objectKey,
      publicPath,
      durableR2Url: publicPath,
      contentHash: artifact.contentHash,
      storage: {
        r2: 'confirmed',
        d1: 'persisted',
        kv: 'skipped',
        durableObject: 'skipped',
      },
      access: {
        cacheKey: null,
        expiresAtMs: null,
        url: accessUrl,
      },
    },
  }
}

const requestMediaCapability = async (args: {
  fetchImpl: typeof fetch
  baseUrl: string
  workspaceId: string
  objectKey: string
  operation: 'read' | 'write'
  ttlSeconds?: number | null
  requestTimeoutMs?: number
}): Promise<{ token: string; urlPath: string } | null> => {
  const response = await fetchWithTimeout({
    fetchImpl: args.fetchImpl, input: resolveAgenticGraphStorageApiUrl(AGENTIC_OS_STORAGE_ROUTE_PATHS.mediaCapability, args.baseUrl), timeoutMs: args.requestTimeoutMs,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...buildAgenticGraphStorageSyncAuthHeaders(null) },
      body: JSON.stringify({
        workspaceId: args.workspaceId,
        objectKey: args.objectKey,
        operation: args.operation,
        ttlSeconds: args.ttlSeconds ?? 15 * 60,
      }),
    },
  })
  const body = await parseStorageResponseJson<{ ok?: boolean; token?: string; urlPath?: string }>(response, {
    requestLabel: 'agentic-graph media capability', apiOrigin: buildApiOriginKey(args.baseUrl),
  })
  return response.ok && body.ok === true && normalizeString(body.token) && normalizeString(body.urlPath)
    ? { token: normalizeString(body.token), urlPath: normalizeString(body.urlPath) }
    : null
}

export const listUploadedMediaFromAgenticGraphStorage = async (args: {
  workspaceId?: string | null
  fetchImpl?: typeof fetch
  requestTimeoutMs?: number
  limit?: number | null
} = {}): Promise<UploadedMediaStorageResult[]> => {
  if (!readAgenticGraphStorageRuntimeSyncEnabled()) return []
  const workspaceId = normalizeString(args.workspaceId) || readActiveAgenticGraphStorageWorkspaceId()
  if (!workspaceId) return []
  const fetchImpl = readUploadedMediaClientFetch(args.fetchImpl)
  if (!fetchImpl) return []
  const baseUrl = readAgenticGraphStorageBaseUrl()
  const response = await fetchWithTimeout({
    fetchImpl, input: resolveAgenticGraphStorageApiUrl(buildAgenticGraphStorageMediaAssetListPath(workspaceId, args.limit ?? 50), baseUrl), timeoutMs: args.requestTimeoutMs,
    init: {
      method: 'GET',
      headers: { accept: 'application/json', ...buildAgenticGraphStorageSyncAuthHeaders(null) },
    },
  })
  if (!response.ok) {
    cancelStorageStream(response.body, 'media asset response rejected')
    return []
  }
  const body = await parseStorageResponseJson<AgenticGraphMediaAssetListResponse | null>(response, {
    requestLabel: 'agentic-graph media asset list', apiOrigin: buildApiOriginKey(baseUrl),
  }).catch(() => null)
  if (!body || body.ok !== true || !Array.isArray(body.artifacts)) return []
  const results: UploadedMediaStorageResult[] = []
  for (const artifact of body.artifacts) {
    const capability = await requestMediaCapability({
      fetchImpl, baseUrl, workspaceId, objectKey: artifact.objectKey, operation: 'read', requestTimeoutMs: args.requestTimeoutMs,
    })
    const storage = capability ? buildUploadedMediaStorageFromArtifact({
      workspaceId,
      artifact,
      accessUrl: resolveAgenticGraphStorageApiUrl(capability.urlPath, baseUrl),
    }) : null
    if (storage) results.push(storage)
  }
  return results
}

export const renameUploadedMediaInAgenticGraphStorage = async (args: {
  storage: UploadedMediaStorageResult
  name: string
  fetchImpl?: typeof fetch
  requestTimeoutMs?: number
}): Promise<UploadedMediaStorageResult | null> => {
  const nextName = normalizeString(args.name)
  if (!nextName) return null
  const fetchImpl = readUploadedMediaClientFetch(args.fetchImpl)
  if (!fetchImpl) return null
  const baseUrl = readAgenticGraphStorageBaseUrl()
  const response = await fetchWithTimeout({
    fetchImpl, input: resolveAgenticGraphStorageApiUrl(buildAgenticGraphStorageMediaAssetPersistPath(), baseUrl), timeoutMs: args.requestTimeoutMs,
    init: {
      method: 'PATCH',
      headers: {
        accept: 'application/json',
        ...buildAgenticGraphStorageSyncAuthHeaders(null),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        workspaceId: args.storage.workspaceId,
        artifactId: artifactIdFromStorage(args.storage),
        name: nextName,
      }),
    },
  })
  if (!response.ok) {
    cancelStorageStream(response.body, 'media asset response rejected')
    return null
  }
  const body = await parseStorageResponseJson<AgenticGraphMediaAssetRenameResponse | null>(response, {
    requestLabel: 'agentic-graph media asset rename', apiOrigin: buildApiOriginKey(baseUrl),
  }).catch(() => null)
  if (!body || body.ok !== true || !body.artifact) return null
  const workspaceId = body.workspaceId || args.storage.workspaceId
  const capability = await requestMediaCapability({
    fetchImpl, baseUrl, workspaceId, objectKey: body.artifact.objectKey, operation: 'read', requestTimeoutMs: args.requestTimeoutMs,
  })
  return capability ? buildUploadedMediaStorageFromArtifact({
    workspaceId, artifact: body.artifact, accessUrl: resolveAgenticGraphStorageApiUrl(capability.urlPath, baseUrl),
  }) : null
}

export const deleteUploadedMediaFromAgenticGraphStorage = async (args: {
  storage: UploadedMediaStorageResult
  fetchImpl?: typeof fetch
  requestTimeoutMs?: number
}): Promise<AgenticGraphMediaAssetDeleteResponse | null> => {
  const fetchImpl = readUploadedMediaClientFetch(args.fetchImpl)
  if (!fetchImpl) return null
  const baseUrl = readAgenticGraphStorageBaseUrl()
  const path = `${buildAgenticGraphStorageMediaAssetPersistPath()}?workspaceId=${encodeURIComponent(args.storage.workspaceId)}&artifactId=${encodeURIComponent(artifactIdFromStorage(args.storage))}`
  const response = await fetchWithTimeout({
    fetchImpl, input: resolveAgenticGraphStorageApiUrl(path, baseUrl), timeoutMs: args.requestTimeoutMs,
    init: {
      method: 'DELETE',
      headers: {
        accept: 'application/json',
        ...buildAgenticGraphStorageSyncAuthHeaders(null),
      },
    },
  })
  if (!response.ok) {
    cancelStorageStream(response.body, 'media asset response rejected')
    return null
  }
  const body = await parseStorageResponseJson<AgenticGraphMediaAssetDeleteResponse | null>(response, {
    requestLabel: 'agentic-graph media asset delete', apiOrigin: buildApiOriginKey(baseUrl),
  }).catch(() => null)
  return body && body.ok === true ? body : null
}

export const uploadMediaFileToAgenticGraphStorage = async (args: {
  file: File
  collaborationRoomId?: string | null
  accessTtlSeconds?: number | null
  fetchImpl?: typeof fetch
  requestTimeoutMs?: number
  uploadNow?: boolean
}): Promise<UploadedMediaStorageResult | null> => {
  const kind = readUploadedMediaKind(args.file)
  if (!kind) return null
  const shouldUpload = typeof args.uploadNow === 'boolean'
    ? args.uploadNow
    : readAgenticGraphStorageRuntimeSyncEnabled()
  if (!shouldUpload) return null
  const fetchImpl = readUploadedMediaClientFetch(args.fetchImpl)
  if (!fetchImpl) return null
  const workspaceId = readActiveAgenticGraphStorageWorkspaceId()
  const contentHash = await hashBlobSha256(args.file)
  if (!workspaceId || !contentHash) return null

  const hashSlug = normalizeSlug(contentHash.replace(/^sha256:/, '').slice(0, 16), 'media')
  const nameSlug = normalizeSlug(args.file.name.replace(/\.[^.]+$/u, ''), kind)
  const workspace = await buildAgenticGraphStorageMediaWorkspace(workspaceId)
  const runId = `${workspace.key}-upload-${hashSlug}`
  const stageId = kind
  const shotId = `${nameSlug}-${hashSlug}`
  const objectKey = `${workspace.prefix}/runs/${runId}/${stageId}/${shotId}.${readFileExtension(args.file)}`
  const publicPath = buildAgenticGraphStorageMediaPath(objectKey)
  const baseUrl = readAgenticGraphStorageBaseUrl()
  const publicUrl = resolveAgenticGraphStorageApiUrl(publicPath, baseUrl)
  const contentType = normalizeString(args.file.type) || 'application/octet-stream'
  const writeCapability = await requestMediaCapability({
    fetchImpl, baseUrl, workspaceId, objectKey, operation: 'write', ttlSeconds: args.accessTtlSeconds,
    requestTimeoutMs: args.requestTimeoutMs,
  })
  if (!writeCapability) return null

  const writeResponse = await fetchWithTimeout({
    fetchImpl, input: resolveAgenticGraphStorageApiUrl(publicPath, baseUrl), timeoutMs: args.requestTimeoutMs,
    init: {
      method: 'PUT',
      headers: {
        'x-agentic-graph-media-capability': writeCapability.token,
        'content-type': contentType,
        'x-agentic-graph-content-hash': contentHash,
      },
      body: args.file,
    },
  })
  cancelStorageStream(writeResponse.body, 'media upload response status consumed')
  if (!writeResponse.ok) return null

  const persistRequest: AgenticGraphMediaAssetPersistRequest = {
    apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
    workspaceId,
    objectKey,
    runId,
    stageId,
    shotId,
    kind,
    durableR2Url: publicPath,
    contentHash,
    mediaType: contentType,
    provenance: {
      source: 'floatingPanel.media.upload',
      fileName: args.file.name,
      sizeBytes: args.file.size,
      uploadedAtMs: Date.now(),
    },
    layout: null,
    version: 1,
    presignedUrl: null,
    accessTtlSeconds: args.accessTtlSeconds ?? 15 * 60,
    collaborationRoomId: normalizeString(args.collaborationRoomId) || null,
  }
  const persistResponse = await fetchWithTimeout({
    fetchImpl, input: resolveAgenticGraphStorageApiUrl(buildAgenticGraphStorageMediaAssetPersistPath(), baseUrl), timeoutMs: args.requestTimeoutMs,
    init: {
      method: 'POST',
      headers: {
        ...buildAgenticGraphStorageSyncAuthHeaders(null),
        'content-type': 'application/json',
      },
      body: JSON.stringify(persistRequest),
    },
  })
  if (!persistResponse.ok) {
    cancelStorageStream(persistResponse.body, 'media persist response rejected')
    return null
  }
  const response = await parseStorageResponseJson<AgenticGraphMediaAssetPersistResponse | null>(persistResponse, {
    requestLabel: 'agentic-graph media asset persist', apiOrigin: buildApiOriginKey(baseUrl),
  }).catch(() => null)
  if (!response || response.ok !== true) return null
  const accessUrl = normalizeString(response.access?.url)
  if (!accessUrl) return null
  return {
    workspaceId,
    runId,
    stageId,
    shotId,
    objectKey,
    publicPath,
    publicUrl,
    accessUrl,
    contentHash,
    contentType,
    provenance: persistRequest.provenance,
    response,
  }
}
