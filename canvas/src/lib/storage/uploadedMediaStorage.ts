import { readActiveKnowgrphStorageWorkspaceId } from '@/features/source-files/sourceFileShareUrl'
import {
  readKnowgrphStorageBaseUrl,
  readKnowgrphStorageRuntimeSyncEnabled,
} from '@/features/source-files/sourceFilesKnowgrphStorageSettings'
import { resolveKnowgrphStorageApiUrl } from '@/lib/storage/knowgrphStorageClientSync'
import {
  KNOWGRPH_STORAGE_API_VERSION,
  KNOWGRPH_STORAGE_R2_MEDIA_OBJECT_PREFIX,
  buildKnowgrphStorageMediaAssetListPath,
  buildKnowgrphStorageMediaAssetPersistPath,
  buildKnowgrphStorageMediaPath,
  type KnowgrphMediaAssetDeleteResponse,
  type KnowgrphMediaAssetListItem,
  type KnowgrphMediaAssetListResponse,
  type KnowgrphMediaAssetRenameResponse,
  type KnowgrphMediaArtifactKind,
  type KnowgrphMediaAssetPersistRequest,
  type KnowgrphMediaAssetPersistResponse,
} from '@/lib/storage/knowgrphStorageSyncContract'
import { buildRuntimeStorageMediaAccessUrl } from '@/lib/storage/runtimeMediaUrl'

const normalizeString = (value: unknown): string => String(value || '').trim()

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

const readRuntimeUrlBase = (): string => {
  const origin = typeof window !== 'undefined' ? String(window.location?.origin || '').trim() : ''
  return origin || 'https://example.invalid'
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

export const readUploadedMediaKind = (file: File): Extract<KnowgrphMediaArtifactKind, 'image' | 'audio' | 'video'> | null => {
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
  response: KnowgrphMediaAssetPersistResponse
}

const readMediaAssetAuthToken = (storage: Pick<UploadedMediaStorageResult, 'accessUrl' | 'publicUrl' | 'runId'>): string => {
  const fallbackBase = readRuntimeUrlBase()
  const fromAccessUrl = (() => {
    try {
      return new URL(storage.accessUrl, fallbackBase).searchParams.get('kg_media_token') || ''
    } catch {
      return ''
    }
  })()
  if (fromAccessUrl) return fromAccessUrl
  const accessUrl = buildUploadedMediaAccessUrl({ publicUrl: storage.publicUrl, runId: storage.runId })
  try {
    return new URL(accessUrl, fallbackBase).searchParams.get('kg_media_token') || ''
  } catch {
    return ''
  }
}

const artifactIdFromStorage = (storage: UploadedMediaStorageResult): string =>
  storage.response.artifactId || `${storage.runId}:${storage.stageId}:${storage.shotId}`

const buildUploadedMediaStorageFromArtifact = (args: {
  workspaceId: string
  artifact: KnowgrphMediaAssetListItem
}): UploadedMediaStorageResult | null => {
  const artifact = args.artifact
  const kind = artifact.kind === 'image' || artifact.kind === 'audio' || artifact.kind === 'video' ? artifact.kind : null
  if (!kind || !artifact.objectKey || !artifact.runId || !artifact.contentHash) return null
  const baseUrl = readKnowgrphStorageBaseUrl()
  const publicPath = artifact.publicPath || buildKnowgrphStorageMediaPath(artifact.objectKey)
  const publicUrl = resolveKnowgrphStorageApiUrl(publicPath, baseUrl)
  const accessUrl = buildUploadedMediaAccessUrl({ publicUrl, runId: artifact.runId })
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
      apiVersion: KNOWGRPH_STORAGE_API_VERSION,
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

export const listUploadedMediaFromKnowgrphStorage = async (args: {
  workspaceId?: string | null
  fetchImpl?: typeof fetch
  limit?: number | null
} = {}): Promise<UploadedMediaStorageResult[]> => {
  if (!readKnowgrphStorageRuntimeSyncEnabled()) return []
  const workspaceId = normalizeString(args.workspaceId) || readActiveKnowgrphStorageWorkspaceId()
  if (!workspaceId) return []
  const fetchImpl = args.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
  if (!fetchImpl) return []
  const baseUrl = readKnowgrphStorageBaseUrl()
  const response = await fetchImpl(resolveKnowgrphStorageApiUrl(buildKnowgrphStorageMediaAssetListPath(workspaceId, args.limit ?? 50), baseUrl), {
    method: 'GET',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) return []
  const body = await response.json().catch(() => null) as KnowgrphMediaAssetListResponse | null
  if (!body || body.ok !== true || !Array.isArray(body.artifacts)) return []
  return body.artifacts.flatMap(artifact => {
    const storage = buildUploadedMediaStorageFromArtifact({ workspaceId, artifact })
    return storage ? [storage] : []
  })
}

export const renameUploadedMediaInKnowgrphStorage = async (args: {
  storage: UploadedMediaStorageResult
  name: string
  fetchImpl?: typeof fetch
}): Promise<UploadedMediaStorageResult | null> => {
  const nextName = normalizeString(args.name)
  if (!nextName) return null
  const fetchImpl = args.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
  if (!fetchImpl) return null
  const authToken = readMediaAssetAuthToken(args.storage)
  if (!authToken) return null
  const baseUrl = readKnowgrphStorageBaseUrl()
  const response = await fetchImpl(resolveKnowgrphStorageApiUrl(buildKnowgrphStorageMediaAssetPersistPath(), baseUrl), {
    method: 'PATCH',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${authToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      workspaceId: args.storage.workspaceId,
      artifactId: artifactIdFromStorage(args.storage),
      name: nextName,
    }),
  })
  if (!response.ok) return null
  const body = await response.json().catch(() => null) as KnowgrphMediaAssetRenameResponse | null
  if (!body || body.ok !== true || !body.artifact) return null
  return buildUploadedMediaStorageFromArtifact({ workspaceId: body.workspaceId || args.storage.workspaceId, artifact: body.artifact })
}

export const deleteUploadedMediaFromKnowgrphStorage = async (args: {
  storage: UploadedMediaStorageResult
  fetchImpl?: typeof fetch
}): Promise<KnowgrphMediaAssetDeleteResponse | null> => {
  const fetchImpl = args.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
  if (!fetchImpl) return null
  const authToken = readMediaAssetAuthToken(args.storage)
  if (!authToken) return null
  const baseUrl = readKnowgrphStorageBaseUrl()
  const path = `${buildKnowgrphStorageMediaAssetPersistPath()}?workspaceId=${encodeURIComponent(args.storage.workspaceId)}&artifactId=${encodeURIComponent(artifactIdFromStorage(args.storage))}`
  const response = await fetchImpl(resolveKnowgrphStorageApiUrl(path, baseUrl), {
    method: 'DELETE',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${authToken}`,
    },
  })
  if (!response.ok) return null
  const body = await response.json().catch(() => null) as KnowgrphMediaAssetDeleteResponse | null
  return body && body.ok === true ? body : null
}

export const uploadMediaFileToKnowgrphStorage = async (args: {
  file: File
  collaborationRoomId?: string | null
  accessTtlSeconds?: number | null
  fetchImpl?: typeof fetch
  uploadNow?: boolean
}): Promise<UploadedMediaStorageResult | null> => {
  const kind = readUploadedMediaKind(args.file)
  if (!kind) return null
  const shouldUpload = typeof args.uploadNow === 'boolean'
    ? args.uploadNow
    : readKnowgrphStorageRuntimeSyncEnabled()
  if (!shouldUpload) return null
  const fetchImpl = args.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
  if (!fetchImpl) return null
  const workspaceId = readActiveKnowgrphStorageWorkspaceId()
  const contentHash = await hashBlobSha256(args.file)
  if (!workspaceId || !contentHash) return null

  const hashSlug = normalizeSlug(contentHash.replace(/^sha256:/, '').slice(0, 16), 'media')
  const nameSlug = normalizeSlug(args.file.name.replace(/\.[^.]+$/u, ''), kind)
  const runId = `upload-${hashSlug}`
  const stageId = kind
  const shotId = `${nameSlug}-${hashSlug}`
  const objectKey = `${KNOWGRPH_STORAGE_R2_MEDIA_OBJECT_PREFIX}/runs/${runId}/${stageId}/${shotId}.${readFileExtension(args.file)}`
  const publicPath = buildKnowgrphStorageMediaPath(objectKey)
  const baseUrl = readKnowgrphStorageBaseUrl()
  const publicUrl = resolveKnowgrphStorageApiUrl(publicPath, baseUrl)
  const contentType = normalizeString(args.file.type) || 'application/octet-stream'
  const accessUrl = buildUploadedMediaAccessUrl({ publicUrl, runId })
  const authToken = new URL(accessUrl, readRuntimeUrlBase()).searchParams.get('kg_media_token') || ''
  if (!authToken) return null

  const writeResponse = await fetchImpl(resolveKnowgrphStorageApiUrl(publicPath, baseUrl), {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${authToken}`,
      'content-type': contentType,
      'x-knowgrph-content-hash': contentHash,
    },
    body: args.file,
  })
  if (!writeResponse.ok) return null

  const persistRequest: KnowgrphMediaAssetPersistRequest = {
    apiVersion: KNOWGRPH_STORAGE_API_VERSION,
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
    presignedUrl: accessUrl,
    accessTtlSeconds: args.accessTtlSeconds ?? 15 * 60,
    collaborationRoomId: normalizeString(args.collaborationRoomId) || null,
  }
  const persistResponse = await fetchImpl(resolveKnowgrphStorageApiUrl(buildKnowgrphStorageMediaAssetPersistPath(), baseUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${authToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(persistRequest),
  })
  if (!persistResponse.ok) return null
  const response = await persistResponse.json().catch(() => null) as KnowgrphMediaAssetPersistResponse | null
  if (!response || response.ok !== true) return null
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
