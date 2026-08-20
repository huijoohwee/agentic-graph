import {
  buildKnowgrphStorageBlobPath,
  type KnowgrphStorageBlobUploadResponse,
} from '@/lib/storage/knowgrphStorageSyncContract'
import { resolveKnowgrphStorageApiUrl } from '@/lib/storage/knowgrphStorageClientSync'
import { buildKnowgrphStorageSyncAuthHeaders } from '@/lib/storage/knowgrphStorageClientTransport'
import {
  readPrimaryStorageCanonicalPathForWorkspacePath,
} from '@/features/source-files/sourceFilesStoragePaths'
import {
  readKnowgrphStorageBaseUrl,
  readKnowgrphStorageRuntimeSyncEnabled,
} from '@/features/source-files/sourceFilesKnowgrphStorageSettings'
import { readActiveKnowgrphStorageWorkspaceId } from '@/features/source-files/sourceFileShareUrl'

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

export type UploadGeneratedWorkspaceBlobToKnowgrphStorageResult = {
  workspaceId: string
  canonicalPath: string
  objectKey: string
  publicPath: string
  publicUrl: string
  contentType: string
  contentHash: string | null
  sizeBytes: number | null
  etag: string | null
  uploadedAtMs: number
}

export const uploadGeneratedWorkspaceBlobToKnowgrphStorage = async (args: {
  workspacePath: string | null | undefined
  blob: Blob
  workspaceId?: string | null
  baseUrl?: string | null
  uploadNow?: boolean
  sessionToken?: string | null
  fetchImpl?: typeof fetch
}): Promise<UploadGeneratedWorkspaceBlobToKnowgrphStorageResult | null> => {
  const shouldUpload = typeof args.uploadNow === 'boolean'
    ? args.uploadNow
    : readKnowgrphStorageRuntimeSyncEnabled()
  if (!shouldUpload) return null
  const workspaceId = normalizeString(args.workspaceId) || readActiveKnowgrphStorageWorkspaceId()
  const canonicalPath = readPrimaryStorageCanonicalPathForWorkspacePath(normalizeString(args.workspacePath), { markdownOnly: false })
  if (!workspaceId || !canonicalPath) return null
  const fetchImpl = args.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
  if (!fetchImpl) return null
  const baseUrl = normalizeString(args.baseUrl) || readKnowgrphStorageBaseUrl()
  const publicPath = buildKnowgrphStorageBlobPath(workspaceId, canonicalPath)
  const contentType = normalizeString(args.blob.type) || 'application/octet-stream'
  const contentHash = await hashBlobSha256(args.blob)
  const response = await fetchImpl(resolveKnowgrphStorageApiUrl(publicPath, baseUrl), {
    method: 'POST',
    headers: {
      ...buildKnowgrphStorageSyncAuthHeaders(args.sessionToken),
      'content-type': contentType,
      'x-knowgrph-content-kind': 'generated-binary-artifact',
      ...(contentHash ? { 'x-knowgrph-content-hash': contentHash } : {}),
    },
    body: args.blob,
  })
  if (!response.ok) return null
  const body = await response.json().catch(() => null) as KnowgrphStorageBlobUploadResponse | null
  if (!body || body.ok !== true) return null
  const resolvedPublicPath = normalizeString(body.publicPath) || publicPath
  return {
    workspaceId: body.workspaceId,
    canonicalPath: body.canonicalPath,
    objectKey: body.objectKey,
    publicPath: resolvedPublicPath,
    publicUrl: resolveKnowgrphStorageApiUrl(resolvedPublicPath, baseUrl),
    contentType: body.contentType || contentType,
    contentHash: body.contentHash || contentHash,
    sizeBytes: body.sizeBytes == null ? args.blob.size : body.sizeBytes,
    etag: body.etag || null,
    uploadedAtMs: body.uploadedAtMs,
  }
}
