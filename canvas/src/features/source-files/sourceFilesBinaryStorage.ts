import {
  buildAgenticGraphStorageBlobPath,
  type AgenticGraphStorageBlobUploadResponse,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
import { resolveAgenticGraphStorageApiUrl } from '@/lib/storage/agentic-graph-storage-client-sync'
import { buildAgenticGraphStorageSyncAuthHeaders } from '@/lib/storage/agentic-graph-storage-client-transport'
import {
  readPrimaryStorageCanonicalPathForWorkspacePath,
} from '@/features/source-files/sourceFilesStoragePaths'
import {
  readAgenticGraphStorageBaseUrl,
  readAgenticGraphStorageRuntimeSyncEnabled,
} from '@/features/source-files/source-files-agentic-graph-storage-settings'
import { readActiveAgenticGraphStorageWorkspaceId } from '@/features/source-files/sourceFileShareUrl'

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

export type UploadGeneratedWorkspaceBlobToAgenticGraphStorageResult = {
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

export const uploadGeneratedWorkspaceBlobToAgenticGraphStorage = async (args: {
  workspacePath: string | null | undefined
  blob: Blob
  workspaceId?: string | null
  baseUrl?: string | null
  uploadNow?: boolean
  sessionToken?: string | null
  fetchImpl?: typeof fetch
}): Promise<UploadGeneratedWorkspaceBlobToAgenticGraphStorageResult | null> => {
  const shouldUpload = typeof args.uploadNow === 'boolean'
    ? args.uploadNow
    : readAgenticGraphStorageRuntimeSyncEnabled()
  if (!shouldUpload) return null
  const workspaceId = normalizeString(args.workspaceId) || readActiveAgenticGraphStorageWorkspaceId()
  const canonicalPath = readPrimaryStorageCanonicalPathForWorkspacePath(normalizeString(args.workspacePath), { markdownOnly: false })
  if (!workspaceId || !canonicalPath) return null
  const fetchImpl = args.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
  if (!fetchImpl) return null
  const baseUrl = normalizeString(args.baseUrl) || readAgenticGraphStorageBaseUrl()
  const publicPath = buildAgenticGraphStorageBlobPath(workspaceId, canonicalPath)
  const contentType = normalizeString(args.blob.type) || 'application/octet-stream'
  const contentHash = await hashBlobSha256(args.blob)
  const response = await fetchImpl(resolveAgenticGraphStorageApiUrl(publicPath, baseUrl), {
    method: 'POST',
    headers: {
      ...buildAgenticGraphStorageSyncAuthHeaders(args.sessionToken),
      'content-type': contentType,
      'x-agentic-graph-content-kind': 'generated-binary-artifact',
      ...(contentHash ? { 'x-agentic-graph-content-hash': contentHash } : {}),
    },
    body: args.blob,
  })
  if (!response.ok) return null
  const body = await response.json().catch(() => null) as AgenticGraphStorageBlobUploadResponse | null
  if (!body || body.ok !== true) return null
  const resolvedPublicPath = normalizeString(body.publicPath) || publicPath
  return {
    workspaceId: body.workspaceId,
    canonicalPath: body.canonicalPath,
    objectKey: body.objectKey,
    publicPath: resolvedPublicPath,
    publicUrl: resolveAgenticGraphStorageApiUrl(resolvedPublicPath, baseUrl),
    contentType: body.contentType || contentType,
    contentHash: body.contentHash || contentHash,
    sizeBytes: body.sizeBytes == null ? args.blob.size : body.sizeBytes,
    etag: body.etag || null,
    uploadedAtMs: body.uploadedAtMs,
  }
}
