import { hashStringToHex } from 'grph-shared/hash/stringHash'
export {
  KNOWGRPH_STORAGE_ROUTE_PATHS,
  buildKnowgrphCollaborationSavePath,
  buildKnowgrphStorageBlobPath,
  buildKnowgrphStorageCanvasRoomPath,
  buildKnowgrphStorageChatAuditPath,
  buildKnowgrphStorageChatPoliciesPath,
  buildKnowgrphStorageChatRelayPath,
  buildKnowgrphStorageChatSessionPath,
  buildKnowgrphStorageCursorId,
  buildKnowgrphStorageDefaultDocPath,
  buildKnowgrphStorageDocPath,
  buildKnowgrphStorageExportPath,
  buildKnowgrphStorageFileSyncRelayPath,
  buildKnowgrphStorageGitRelayPath,
  buildKnowgrphStorageRelayCapabilitiesPath,
  buildKnowgrphStorageLlmsPath,
  buildKnowgrphStorageMediaAssetListPath,
  buildKnowgrphStorageMediaAssetPersistPath,
  buildKnowgrphStorageMediaPath,
  buildKnowgrphStorageOutboxId,
  buildKnowgrphStorageSourceFilesIndexPath,
} from '@/lib/storage/knowgrphStorageRoutePaths'
export type {
  KnowgrphStorageDurableObjectNamespaceLike,
  KnowgrphStorageDurableObjectStubLike,
  KnowgrphStorageKvNamespaceLike,
  KnowgrphStorageR2BucketLike,
  KnowgrphStorageR2ObjectLike,
  KnowgrphStorageWorkerEnv,
} from '@/lib/storage/knowgrphStorageWorkerEnvContract'

export const KNOWGRPH_STORAGE_API_VERSION = '2026-05-04'

export const KNOWGRPH_STORAGE_D1_BINDING_NAME = 'DB'
export const KNOWGRPH_STORAGE_R2_BLOB_BINDING_NAME = 'KNOWGRPH_STORAGE_BLOB_BUCKET'
export const KNOWGRPH_STORAGE_R2_MEDIA_BINDING_NAME = KNOWGRPH_STORAGE_R2_BLOB_BINDING_NAME
export const KNOWGRPH_STORAGE_R2_MEDIA_OBJECT_PREFIX = 'airvio'
export const KNOWGRPH_STORAGE_MEDIA_ACCESS_KV_BINDING_NAME = 'KNOWGRPH_MEDIA_ACCESS_KV'
export const KNOWGRPH_STORAGE_CANVAS_ROOM_BINDING_NAME = 'KNOWGRPH_CANVAS_ROOM'
export const KNOWGRPH_STORAGE_DEFAULT_WORKSPACE_ID = 'kgws:canonical-docs'
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
export const KNOWGRPH_STORAGE_CRAWLER_ACCESS_HEADERS = {
  source: 'x-knowgrph-crawler-source',
  payPerCrawlPolicy: 'x-knowgrph-pay-per-crawl-policy',
} as const

export const KNOWGRPH_STORAGE_COLLECTION_NAMES = [
  'documents',
  'documentChunks',
  'graphSnapshots',
  'syncOutbox',
  'syncCursor',
] as const

export const KNOWGRPH_STORAGE_D1_TABLE_NAMES = [
  'workspaces',
  'documents',
  'document_chunks',
  'graph_snapshots',
  'sync_devices',
  'sync_events',
] as const

export type KnowgrphStorageCollectionName = (typeof KNOWGRPH_STORAGE_COLLECTION_NAMES)[number]
export type KnowgrphStorageD1TableName = (typeof KNOWGRPH_STORAGE_D1_TABLE_NAMES)[number]

export type KnowgrphStorageEntityKind = 'document' | 'documentChunk' | 'graphSnapshot'
export type KnowgrphStorageMutationOp = 'upsert' | 'delete'

export type KgDocumentRecord = {
  id: string
  workspaceId: string
  canonicalPath: string
  title: string | null
  docType: string | null
  lang: string | null
  graphId: string | null
  sourceKind: 'markdown'
  contentMd: string
  contentHash: string
  parserVersion: string
  revision: number
  updatedAtMs: number
  deleted: boolean
}

export type KgDocumentChunkRecord = {
  id: string
  documentId: string
  workspaceId: string
  chunkKey: string
  chunkOrder: number
  heading: string | null
  markdown: string
  tokenEstimate: number
  contentHash: string
  updatedAtMs: number
  contentReused?: boolean
}

export type KgGraphSnapshotRecord = {
  id: string
  documentId: string
  workspaceId: string
  graphRevision: number
  graphHash: string
  graphJson: Record<string, unknown>
  layoutJson: Record<string, unknown> | null
  derivedFromDocumentRevision: number
  updatedAtMs: number
}

export type KnowgrphStorageOutboxRecord = {
  id: string
  workspaceId: string
  deviceId: string
  entity: KnowgrphStorageEntityKind
  op: KnowgrphStorageMutationOp
  recordId: string
  baseRevision: number | null
  payload: Record<string, unknown>
  payloadHash: string
  attemptCount: number
  lastAckStatus: 'applied' | 'conflict' | 'rejected' | 'deferred' | ''
  lastAckMessage: string | null
  createdAtMs: number
  updatedAtMs: number
}

export type KnowgrphStorageCursorRecord = {
  id: string
  workspaceId: string
  deviceId: string
  lastPullCursor: string | null
  lastPushCursor: string | null
  serverClockMs: number | null
  updatedAtMs: number
}

export type KnowgrphStorageMutationRecord =
  | KgDocumentRecord
  | KgDocumentChunkRecord
  | KgGraphSnapshotRecord

export type KnowgrphStorageMutation =
  | {
      mutationId: string
      workspaceId: string
      entity: 'document'
      op: KnowgrphStorageMutationOp
      recordId: string
      baseRevision: number | null
      record: KgDocumentRecord
    }
  | {
      mutationId: string
      workspaceId: string
      entity: 'documentChunk'
      op: KnowgrphStorageMutationOp
      recordId: string
      baseRevision: number | null
      record: KgDocumentChunkRecord
    }
  | {
      mutationId: string
      workspaceId: string
      entity: 'graphSnapshot'
      op: KnowgrphStorageMutationOp
      recordId: string
      baseRevision: number | null
      record: KgGraphSnapshotRecord
    }

export type KnowgrphStoragePushRequest = {
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
  workspaceId: string
  deviceId: string
  mutations: KnowgrphStorageMutation[]
}

export type KnowgrphStorageMutationAck = {
  mutationId: string
  recordId: string
  entity: KnowgrphStorageEntityKind
  status: 'applied' | 'conflict' | 'rejected'
  serverRevision: number | null
  message: string | null
}

export type KnowgrphStoragePushResponse = {
  ok: true
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
  workspaceId: string
  ackCursor: string
  serverTimeMs: number
  acknowledgements: KnowgrphStorageMutationAck[]
}

export type KnowgrphStorageErrorResponse = {
  ok: false
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
  error: string
  code: 'bad_request' | 'conflict' | 'forbidden' | 'not_found' | 'server_error'
}

export type KnowgrphStorageChatRole = 'viewer' | 'editor' | 'owner' | 'provider-admin'

export type KnowgrphStorageChatProviderId = 'openai' | 'miromind' | 'agnes-ai' | 'byteplus-modelark' | 'qwen' | 'google-cloud'

export type KnowgrphStorageChatAuthMode = 'serverManaged' | 'byok'

export type KnowgrphStorageChatPolicyRecord = {
  workspaceId: string
  providerId: KnowgrphStorageChatProviderId
  allowServerManaged: boolean
  allowByok: boolean
  monthlyRequestLimit: number | null
  monthlyTokenLimit: number | null
  monthlySpendLimitCents: number | null
  defaultModel: string | null
  updatedAtMs: number | null
}

export type KnowgrphStorageChatSessionMembership = {
  workspaceId: string
  role: KnowgrphStorageChatRole
  status: string
}

export type KnowgrphCanvasRoomPeerRecord = {
  userId: string
  displayName: string
  role: KnowgrphStorageChatRole
  joinedAt: number
  caretLine: number | null
}

export type KnowgrphCanvasRoomStatusResponse = {
  ok: true
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
  workspaceId: string
  roomId: string
  activePeerCount: number
  latestAssetKey: string | null
  peers: KnowgrphCanvasRoomPeerRecord[]
}

export type KnowgrphStorageChatSessionResponse = {
  ok: true
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
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
  memberships: KnowgrphStorageChatSessionMembership[]
}

export type KnowgrphStorageChatPoliciesResponse = {
  ok: true
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
  workspaceId: string
  membership: {
    userId: string
    role: KnowgrphStorageChatRole
    status: string
  }
  policies: KnowgrphStorageChatPolicyRecord[]
}

export type KnowgrphStorageChatAuditEntry = {
  id: string
  workspaceId: string
  userId: string
  membershipId: string
  providerId: string
  authMode: KnowgrphStorageChatAuthMode
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

export type KnowgrphStorageChatAuditResponse = {
  ok: true
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
  workspaceId: string
  entries: KnowgrphStorageChatAuditEntry[]
}

export type KnowgrphStorageChatRelayMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }

export type KnowgrphStorageChatRelayRequest = {
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
  workspaceId: string
  providerId: KnowgrphStorageChatProviderId
  authMode: KnowgrphStorageChatAuthMode
  endpointUrl?: string | null
  model: string
  messages: KnowgrphStorageChatRelayMessage[]
  requestSurface?: 'chat-completions' | 'responses'
  input?: unknown[] | null
  stream?: boolean
  byokApiKey?: string | null
  aiGatewayRoute?: string | null
  aiGatewayMetadata?: Record<string, string | number | boolean> | null
  aiGatewayCacheTtlSeconds?: number | null
  providerOptions?: Record<string, unknown> | null
}

export type KnowgrphStorageChatRelayResponse = {
  ok: true
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
  workspaceId: string
  providerId: KnowgrphStorageChatProviderId
  authMode: KnowgrphStorageChatAuthMode
  upstreamStatus: number
  relayStatus: 'allowed'
  body: unknown
}

export type KnowgrphStoragePullRequest = {
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
  workspaceId: string
  deviceId: string
  since: string | null
  knownChunks: Array<{
    id: string
    documentId: string
    chunkKey: string
    contentHash: string
  }>
}

export type KnowgrphStoragePullChanges = {
  documents: KgDocumentRecord[]
  documentChunks: KgDocumentChunkRecord[]
  graphSnapshots: KgGraphSnapshotRecord[]
}

export type KnowgrphStoragePullResponse = {
  ok: true
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
  workspaceId: string
  nextCursor: string
  serverTimeMs: number
  changes: KnowgrphStoragePullChanges
}

export type KnowgrphStorageExportResponse = {
  ok: true
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
  workspaceId: string
  exportedAtMs: number
  documents: KgDocumentRecord[]
  documentChunks: KgDocumentChunkRecord[]
  graphSnapshots: KgGraphSnapshotRecord[]
}

export type KnowgrphStorageBlobUploadResponse = {
  ok: true
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
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

export type KnowgrphMediaArtifactKind = 'text' | 'image' | 'audio' | 'video' | 'binary'

export type KnowgrphMediaAssetPersistRequest = {
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
  workspaceId: string
  objectKey: string
  runId: string
  stageId: string
  shotId: string
  kind: KnowgrphMediaArtifactKind
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

export type KnowgrphMediaAssetPersistResponse = {
  ok: true
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
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

export type KnowgrphMediaAssetListItem = {
  artifactId: string
  objectKey: string
  publicPath: string
  runId: string
  stageId: string
  shotId: string
  kind: KnowgrphMediaArtifactKind
  contentHash: string
  mediaType: string | null
  provenance: Record<string, unknown>
  version: number
  createdAt: string
  updatedAt: string
}

export type KnowgrphMediaAssetListResponse = {
  ok: true
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
  workspaceId: string
  artifacts: KnowgrphMediaAssetListItem[]
}

export type KnowgrphMediaAssetRenameResponse = {
  ok: true
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
  workspaceId: string
  artifact: KnowgrphMediaAssetListItem
}

export type KnowgrphMediaAssetDeleteResponse = {
  ok: true
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
  workspaceId: string
  artifactId: string
  objectKey: string
  storage: {
    r2: 'deleted' | 'binding_missing' | 'skipped'
    d1: 'deleted' | 'missing'
  }
}
export type KnowgrphCollaborationDocumentKind = 'markdown' | 'json'
export type KnowgrphDocumentRepositoryTarget = 'knowgrph-docs' | 'workspace-docs'
export type KnowgrphCollaborationSaveRequest = {
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
  operation: 'upsert' | 'delete'
  workspaceId: string
  documentKey: string
  documentKind: KnowgrphCollaborationDocumentKind
  repositoryTarget: KnowgrphDocumentRepositoryTarget
  gitRemoteId?: string
  serializedText: string
  yjsStateBase64: string
  activePeerCount: number
  pocketBaseRoomId: string | null
  savedByPeerId: string | null
  saveBoundary: 'explicit' | 'autosave'
}
export type KnowgrphCollaborationSaveResponse = {
  ok: true
  apiVersion: typeof KNOWGRPH_STORAGE_API_VERSION
  operation: 'upsert' | 'delete'
  workspaceId: string
  documentKey: string
  repositoryTarget: KnowgrphDocumentRepositoryTarget
  githubPath: string
  commitSha: string | null
  contentSha: string | null
  committedAtMs: number
}
export const isKnowgrphStorageEntityKind = (value: unknown): value is KnowgrphStorageEntityKind =>
  value === 'document' || value === 'documentChunk' || value === 'graphSnapshot'

export const buildKnowgrphStoragePullRequest = (args: {
  workspaceId: string
  deviceId: string
  since?: string | null
  knownChunks?: KnowgrphStoragePullRequest['knownChunks']
}): KnowgrphStoragePullRequest => ({
  apiVersion: KNOWGRPH_STORAGE_API_VERSION,
  workspaceId: String(args.workspaceId || '').trim(),
  deviceId: String(args.deviceId || '').trim(),
  since: typeof args.since === 'string' && args.since.trim() ? args.since.trim() : null,
  knownChunks: Array.isArray(args.knownChunks)
    ? args.knownChunks.map(chunk => ({
        id: String(chunk.id || '').trim(),
        documentId: String(chunk.documentId || '').trim(),
        chunkKey: String(chunk.chunkKey || '').trim(),
        contentHash: String(chunk.contentHash || '').trim(),
      })).filter(chunk => chunk.id && chunk.documentId && chunk.chunkKey && chunk.contentHash)
    : [],
})

export const hashKnowgrphStorageContent = (content: unknown): string =>
  hashStringToHex(String(content ?? ''))

export const isKnowgrphStorageCanonicalPath = (value: unknown): value is string => {
  const path = String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
  return !!path && path.length <= 1_024 && !path.split('/').includes('..')
}
