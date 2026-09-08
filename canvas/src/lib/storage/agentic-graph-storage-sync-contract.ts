import { hashStringToHex } from 'grph-shared/hash/stringHash'
export { AGENTIC_OS_STORAGE_SYNC_LIMITS } from '@/lib/storage/agentic-graph-storage-sync-limits'
export {
  AGENTIC_OS_STORAGE_ROUTE_PATHS,
  buildAgenticGraphCollaborationSavePath,
  buildAgenticGraphStorageBlobPath,
  buildAgenticGraphStorageCanvasRoomPath,
  buildAgenticGraphStorageChatAuditPath,
  buildAgenticGraphStorageChatPoliciesPath,
  buildAgenticGraphStorageChatRelayPath,
  buildAgenticGraphStorageChatSessionPath,
  buildAgenticGraphStorageCursorId,
  buildAgenticGraphStorageDefaultDocPath,
  buildAgenticGraphStorageDocPath,
  buildAgenticGraphStorageExportPath,
  buildAgenticGraphStorageFileSyncRelayPath,
  buildAgenticGraphKnowledgeSourceHandoffPath,
  buildAgenticGraphKnowledgeSourceReadPath,
  buildAgenticGraphStorageGitRelayPath,
  buildAgenticGraphStorageRelayCapabilitiesPath,
  buildAgenticGraphStorageLlmsPath,
  buildAgenticGraphStorageMediaAssetListPath,
  buildAgenticGraphStorageMediaAssetPersistPath,
  buildAgenticGraphStorageMediaPath,
  buildAgenticGraphStorageOutboxId,
  buildAgenticGraphStorageSourceFilesIndexPath,
} from '@/lib/storage/agentic-graph-storage-route-paths'
export type {
  AgenticGraphStorageDurableObjectNamespaceLike,
  AgenticGraphStorageDurableObjectStubLike,
  AgenticGraphStorageKvNamespaceLike,
  AgenticGraphStorageR2BucketLike,
  AgenticGraphStorageR2ObjectLike,
  AgenticGraphStorageWorkerEnv,
} from '@/lib/storage/agentic-graph-storage-worker-env-contract'

export const AGENTIC_OS_STORAGE_API_VERSION = '2026-05-04'
export const AGENTIC_OS_KNOWLEDGE_SOURCE_API_VERSION = 'agentic-graph-knowledge-source/v1'

export const AGENTIC_OS_STORAGE_D1_BINDING_NAME = 'DB'
export const AGENTIC_OS_STORAGE_R2_BLOB_BINDING_NAME = 'AGENTIC_OS_STORAGE_BLOB_BUCKET'
export const AGENTIC_OS_STORAGE_R2_MEDIA_BINDING_NAME = AGENTIC_OS_STORAGE_R2_BLOB_BINDING_NAME
export { AGENTIC_OS_STORAGE_R2_MEDIA_OBJECT_PREFIX, buildAgenticGraphStorageMediaWorkspace, assertAgenticGraphStorageMediaWriteKey, AgenticGraphStorageMediaWorkspaceError } from '@/lib/storage/agentic-graph-storage-media-object-key'
export const AGENTIC_OS_STORAGE_MEDIA_ACCESS_KV_BINDING_NAME = 'AGENTIC_OS_MEDIA_ACCESS_KV'
export const AGENTIC_OS_STORAGE_CANVAS_ROOM_BINDING_NAME = 'AGENTIC_OS_CANVAS_ROOM'
export const AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID = 'kgws:canonical-docs'
export const CLOUDFLARE_PAY_PER_CRAWL_DOC_URL =
  'https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/what-is-pay-per-crawl/index.md'
export const CLOUDFLARE_PAY_PER_CRAWL_REQUEST_HEADERS = {
  exactPrice: 'crawler-exact-price',
  maxPrice: 'crawler-max-price',
} as const
export const CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS = {
  price: 'crawler-price',
  charged: 'crawler-charged',
  error: 'crawler-error',
} as const
export const AGENTIC_OS_STORAGE_CRAWLER_ACCESS_HEADERS = {
  source: 'x-agentic-graph-crawler-source',
  payPerCrawlPolicy: 'x-agentic-graph-pay-per-crawl-policy',
} as const
export const AGENTIC_OS_STORAGE_COLLECTION_NAMES = [
  'documents',
  'documentChunks',
  'graphSnapshots',
  'syncOutbox',
  'syncChildState',
  'syncDeferred',
  'syncCursor',
] as const
export const AGENTIC_OS_STORAGE_D1_TABLE_NAMES = [
  'workspaces',
  'documents',
  'document_chunks',
  'graph_snapshots',
  'sync_devices',
  'sync_events',
] as const
export type AgenticGraphStorageCollectionName = (typeof AGENTIC_OS_STORAGE_COLLECTION_NAMES)[number]
export type AgenticGraphStorageD1TableName = (typeof AGENTIC_OS_STORAGE_D1_TABLE_NAMES)[number]
export { AGENTIC_OS_STORAGE_SYNC_API_VERSION } from '@/lib/storage/agentic-graph-storage-sync-records'
import { AGENTIC_OS_STORAGE_SYNC_API_VERSION } from '@/lib/storage/agentic-graph-storage-sync-records'
export type {
  AgenticGraphStorageChildState,
  AgenticGraphStorageDeletedChildState,
  AgenticGraphStorageEntityKind,
  AgenticGraphStorageMutationOp,
  KgDocumentRecord,
  KgDocumentChunkRecord,
  KgGraphSnapshotRecord,
  AgenticGraphStorageOutboxRecord,
  AgenticGraphStorageCursorRecord,
  AgenticGraphStorageMutationRecord,
  AgenticGraphStorageMutation,
  AgenticGraphStoragePushRequest,
  AgenticGraphStorageMutationAck,
  AgenticGraphStoragePushResponse,
  AgenticGraphStoragePullRequest,
  AgenticGraphStoragePullChanges,
  AgenticGraphStoragePullResponse,
} from '@/lib/storage/agentic-graph-storage-sync-records'
import type { AgenticGraphStorageEntityKind, AgenticGraphStoragePullRequest, KgDocumentRecord, KgDocumentChunkRecord, KgGraphSnapshotRecord } from '@/lib/storage/agentic-graph-storage-sync-records'

export type AgenticGraphStorageErrorResponse = {
  ok: false
  apiVersion: typeof AGENTIC_OS_STORAGE_API_VERSION
  error: string
  code: 'bad_request' | 'conflict' | 'forbidden' | 'not_found' | 'server_error'
}

export type AgenticGraphStorageChatRole = 'viewer' | 'editor' | 'owner' | 'provider-admin'

export type AgenticGraphStorageChatProviderId = 'openai' | 'miromind' | 'agnes-ai' | 'byteplus-modelark' | 'qwen' | 'google-cloud'

export type AgenticGraphStorageChatAuthMode = 'serverManaged' | 'byok'

export type AgenticGraphStorageChatPolicyRecord = {
  workspaceId: string
  providerId: AgenticGraphStorageChatProviderId
  allowServerManaged: boolean
  allowByok: boolean
  monthlyRequestLimit: number | null
  monthlyTokenLimit: number | null
  monthlySpendLimitCents: number | null
  defaultModel: string | null
  updatedAtMs: number | null
}

export type AgenticGraphStorageChatSessionMembership = {
  workspaceId: string
  role: AgenticGraphStorageChatRole
  status: string
}

export type AgenticGraphCanvasRoomPeerRecord = {
  userId: string
  displayName: string
  role: AgenticGraphStorageChatRole
  joinedAt: number
  caretLine: number | null
}

export type AgenticGraphCanvasRoomStatusResponse = {
  ok: true
  apiVersion: typeof AGENTIC_OS_STORAGE_API_VERSION
  workspaceId: string
  roomId: string
  activePeerCount: number
  latestAssetKey: string | null
  peers: AgenticGraphCanvasRoomPeerRecord[]
}

export type AgenticGraphStorageChatSessionResponse = {
  ok: true
  apiVersion: typeof AGENTIC_OS_STORAGE_API_VERSION
  user: {
    id: string
    email: string
    displayName: string
    status: string
  }
  session: {
    id: string
    expiresAt: string
  }
  memberships: AgenticGraphStorageChatSessionMembership[]
}

export type AgenticGraphStorageChatPoliciesResponse = {
  ok: true
  apiVersion: typeof AGENTIC_OS_STORAGE_API_VERSION
  workspaceId: string
  membership: {
    userId: string
    role: AgenticGraphStorageChatRole
    status: string
  }
  policies: AgenticGraphStorageChatPolicyRecord[]
}

export type AgenticGraphStorageChatAuditEntry = {
  id: string
  workspaceId: string
  userId: string
  membershipId: string
  providerId: string
  authMode: AgenticGraphStorageChatAuthMode
  requestId: string | null
  upstreamStatus: number | null
  relayStatus: string
  modelId: string | null
  requestBytes: number | null
  responseBytes: number | null
  latencyMs: number | null
  errorCode: string | null
  errorMessage: string | null
  createdAtMs: number | null
}

export type AgenticGraphStorageChatAuditResponse = {
  ok: true
  apiVersion: typeof AGENTIC_OS_STORAGE_API_VERSION
  workspaceId: string
  entries: AgenticGraphStorageChatAuditEntry[]
}

export type AgenticGraphStorageChatRelayMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }

export type AgenticGraphStorageChatRelayRequest = {
  apiVersion: typeof AGENTIC_OS_STORAGE_API_VERSION
  workspaceId: string
  providerId: AgenticGraphStorageChatProviderId
  authMode: AgenticGraphStorageChatAuthMode
  endpointUrl?: string | null
  model: string
  messages: AgenticGraphStorageChatRelayMessage[]
  requestSurface?: 'chat-completions' | 'responses'
  input?: unknown[] | null
  stream?: boolean
  byokApiKey?: string | null
  aiGatewayRoute?: string | null
  aiGatewayMetadata?: Record<string, string | number | boolean> | null
  aiGatewayCacheTtlSeconds?: number | null
  providerOptions?: Record<string, unknown> | null
}

export type AgenticGraphStorageChatRelayResponse = {
  ok: true
  apiVersion: typeof AGENTIC_OS_STORAGE_API_VERSION
  workspaceId: string
  providerId: AgenticGraphStorageChatProviderId
  authMode: AgenticGraphStorageChatAuthMode
  upstreamStatus: number
  relayStatus: 'allowed'
  body: unknown
}

export type AgenticGraphStorageExportResponse = {
  ok: true
  apiVersion: typeof AGENTIC_OS_STORAGE_API_VERSION
  workspaceId: string
  exportedAtMs: number
  nextPageCursor: string | null
  pageComplete: boolean
  documents: KgDocumentRecord[]
  documentChunks: KgDocumentChunkRecord[]
  graphSnapshots: KgGraphSnapshotRecord[]
}

export type AgenticGraphStorageBlobUploadResponse = {
  ok: true
  apiVersion: typeof AGENTIC_OS_STORAGE_API_VERSION
  workspaceId: string
  canonicalPath: string
  objectKey: string
  contentType: string
  contentHash: string | null
  sizeBytes: number | null
  etag: string | null
  uploadedAtMs: number
  publicPath: string
}

export type AgenticGraphMediaArtifactKind = 'text' | 'image' | 'audio' | 'video' | 'binary'

export type AgenticGraphMediaAssetPersistRequest = {
  apiVersion: typeof AGENTIC_OS_STORAGE_API_VERSION
  workspaceId: string
  objectKey: string
  runId: string
  stageId: string
  shotId: string
  kind: AgenticGraphMediaArtifactKind
  durableR2Url: string
  contentHash: string
  mediaType: string | null
  provenance: Record<string, unknown>
  layout?: Record<string, unknown> | null
  version: number
  presignedUrl?: string | null
  accessTtlSeconds?: number | null
  collaborationRoomId?: string | null
}

export type AgenticGraphMediaAssetPersistResponse = {
  ok: true
  apiVersion: typeof AGENTIC_OS_STORAGE_API_VERSION
  workspaceId: string
  artifactId: string
  objectKey: string
  publicPath: string
  durableR2Url: string
  contentHash: string
  storage: {
    r2: 'confirmed'
    d1: 'persisted' | 'reused'
    kv: 'cached' | 'binding_missing' | 'skipped'
    durableObject: 'broadcasted' | 'binding_missing' | 'skipped'
  }
  access: {
    cacheKey: string | null
    expiresAtMs: number | null
    url: string | null
  }
}

export type AgenticGraphMediaAssetListItem = {
  artifactId: string
  objectKey: string
  publicPath: string
  runId: string
  stageId: string
  shotId: string
  kind: AgenticGraphMediaArtifactKind
  contentHash: string
  mediaType: string | null
  provenance: Record<string, unknown>
  version: number
  createdAt: string
  updatedAt: string
}

export type AgenticGraphMediaAssetListResponse = {
  ok: true
  apiVersion: typeof AGENTIC_OS_STORAGE_API_VERSION
  workspaceId: string
  artifacts: AgenticGraphMediaAssetListItem[]
}

export type AgenticGraphMediaAssetRenameResponse = {
  ok: true
  apiVersion: typeof AGENTIC_OS_STORAGE_API_VERSION
  workspaceId: string
  artifact: AgenticGraphMediaAssetListItem
}

export type AgenticGraphMediaAssetDeleteResponse = {
  ok: true
  apiVersion: typeof AGENTIC_OS_STORAGE_API_VERSION
  workspaceId: string
  artifactId: string
  objectKey: string
  storage: {
    r2: 'deleted' | 'binding_missing' | 'skipped'
    d1: 'deleted' | 'missing'
  }
}
export type AgenticGraphCollaborationDocumentKind = 'markdown' | 'json'
export type AgenticGraphDocumentRepositoryTarget = 'agentic-graph-docs' | 'workspace-docs'
export type AgenticGraphCollaborationSaveRequest = {
  apiVersion: typeof AGENTIC_OS_STORAGE_API_VERSION
  operation: 'upsert' | 'delete'
  workspaceId: string
  documentKey: string
  documentKind: AgenticGraphCollaborationDocumentKind
  repositoryTarget: AgenticGraphDocumentRepositoryTarget
  gitRemoteId?: string
  serializedText: string
  yjsStateBase64: string
  activePeerCount: number
  pocketBaseRoomId: string | null
  savedByPeerId: string | null
  saveBoundary: 'explicit' | 'autosave'
}
export type AgenticGraphCollaborationSaveResponse = {
  ok: true
  apiVersion: typeof AGENTIC_OS_STORAGE_API_VERSION
  operation: 'upsert' | 'delete'
  workspaceId: string
  documentKey: string
  repositoryTarget: AgenticGraphDocumentRepositoryTarget
  githubPath: string
  commitSha: string | null
  contentSha: string | null
  committedAtMs: number
}
export type AgenticGraphKnowledgeSourceKind = 'base' | 'wiki' | 'doc'
export type AgenticGraphKnowledgeSourceIdentityMode = 'tenant-app' | 'user-oauth'
export type AgenticGraphKnowledgeSourceBaseSnapshot = {
  type: 'base'; baseTitle: string | null; tableName: string | null; viewName: string | null
  fields: Array<{ name: string; type: string | null; isPrimary: boolean }>
  records: Array<{ title: string | null; fields: Record<string, unknown> }>
}
export type AgenticGraphKnowledgeSourceDocumentSnapshot = {
  type: 'document'; name: string; title: string | null; text: string; contentType: 'text/plain'
}
export type AgenticGraphKnowledgeSourceSnapshot = AgenticGraphKnowledgeSourceBaseSnapshot | AgenticGraphKnowledgeSourceDocumentSnapshot
export type AgenticGraphKnowledgeSourceHandoffRequest = {
  apiVersion: typeof AGENTIC_OS_KNOWLEDGE_SOURCE_API_VERSION; workspaceId: string; sourceId: string
}
export type AgenticGraphKnowledgeSourceHandoffResponse = AgenticGraphKnowledgeSourceHandoffRequest & {
  ok: true; provider: 'lark'; kind: AgenticGraphKnowledgeSourceKind; token: string; expiresAtMs: number
}
export type AgenticGraphKnowledgeSourceReadRequest = AgenticGraphKnowledgeSourceHandoffRequest & { token: string }
export type AgenticGraphKnowledgeSourceErrorCode =
  | 'auth_required' | 'membership_forbidden' | 'identity_unresolved' | 'identity_not_available'
  | 'resources_unresolved' | 'source_not_allowlisted' | 'source_config_drift'
  | 'provider_auth_failed' | 'not_found' | 'rate_limited' | 'timeout' | 'limit_exceeded'
  | 'upstream_unavailable' | 'invalid_request' | 'invalid_response'
export type AgenticGraphKnowledgeSourceErrorResponse = {
  ok: false; apiVersion: typeof AGENTIC_OS_KNOWLEDGE_SOURCE_API_VERSION
  code: AgenticGraphKnowledgeSourceErrorCode; retryable: boolean; operationId: string
}
export type AgenticGraphKnowledgeSourceSnapshotEnvelope = {
  ok: true; apiVersion: typeof AGENTIC_OS_KNOWLEDGE_SOURCE_API_VERSION
  schema: 'agentic-graph-knowledge-source-snapshot/v1'; complete: true; provider: 'lark'
  kind: AgenticGraphKnowledgeSourceKind; sourceId: string; identityMode: AgenticGraphKnowledgeSourceIdentityMode
  allowlistRevision: string; allowlistDigest: string; providerRevision: string | null; fetchedAt: string
  counts: { pages: number; fields: number; records: number; documents: number; bytes: number }
  contentDigest: string; envelopeDigest: string; snapshot: AgenticGraphKnowledgeSourceSnapshot; warnings: string[]
}
const canonicalizeKnowledgeSourceValue = (value: unknown): unknown => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map(canonicalizeKnowledgeSourceValue)
  if (!value || typeof value !== 'object') return null
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, entry]) => [key, canonicalizeKnowledgeSourceValue(entry)]))
}
export const stringifyCanonicalKnowledgeSourceJson = (value: unknown): string =>
  JSON.stringify(canonicalizeKnowledgeSourceValue(value))
export const digestKnowledgeSourceValue = async (value: unknown): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stringifyCanonicalKnowledgeSourceJson(value)))
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`
}
export const verifyKnowledgeSourceSnapshotEnvelopeDigests = async (envelope: AgenticGraphKnowledgeSourceSnapshotEnvelope): Promise<boolean> => {
  if (await digestKnowledgeSourceValue(envelope.snapshot) !== envelope.contentDigest) return false
  const { envelopeDigest: _claimedEnvelopeDigest, ...unsignedEnvelope } = envelope
  return await digestKnowledgeSourceValue(unsignedEnvelope) === envelope.envelopeDigest
}
export const isAgenticGraphStorageEntityKind = (value: unknown): value is AgenticGraphStorageEntityKind =>
  value === 'document' || value === 'documentChunk' || value === 'graphSnapshot'

export const buildAgenticGraphStoragePullRequest = (args: {
  workspaceId: string
  deviceId: string
  since?: string | null
  pageCursor?: string | null
  knownChunks?: AgenticGraphStoragePullRequest['knownChunks']
}): AgenticGraphStoragePullRequest => ({
  apiVersion: AGENTIC_OS_STORAGE_SYNC_API_VERSION,
  workspaceId: String(args.workspaceId || '').trim(),
  deviceId: String(args.deviceId || '').trim(),
  since: typeof args.since === 'string' && args.since.trim() ? args.since.trim() : null,
  pageCursor: typeof args.pageCursor === 'string' && args.pageCursor.trim() ? args.pageCursor.trim() : null,
  knownChunks: Array.isArray(args.knownChunks)
    ? args.knownChunks.map(chunk => ({
        id: String(chunk.id || '').trim(),
        documentId: String(chunk.documentId || '').trim(),
        chunkKey: String(chunk.chunkKey || '').trim(),
        contentHash: String(chunk.contentHash || '').trim(),
      })).filter(chunk => chunk.id && chunk.documentId && chunk.chunkKey && chunk.contentHash)
    : [],
})

export const hashAgenticGraphStorageContent = (content: unknown): string =>
  hashStringToHex(String(content ?? ''))

export const isAgenticGraphStorageCanonicalPath = (value: unknown): value is string => {
  const path = String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
  return !!path && path.length <= 1_024 && !path.split('/').includes('..')
}
