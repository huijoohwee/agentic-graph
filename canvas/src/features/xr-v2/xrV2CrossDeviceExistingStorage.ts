import { writeWorkspaceTextArtifactAtPath } from '@/features/chat/chatHistoryWorkspace.output'
import { hashStringToHex } from '@/lib/hash/stringHash'
import {
  getAgenticGraphStorageDb,
  compareAndCommitAgenticGraphStorageMutationUnit,
  type AgenticGraphStorageDb,
  type KgDocumentLocalRecord,
} from '@/lib/storage/agentic-graph-storage-db'
import {
  syncAgenticGraphStorageNow,
} from '@/lib/storage/agentic-graph-storage-client-sync'
import { toAgenticGraphRemoteDocumentRecord } from '@/lib/storage/agentic-graph-storage-record-mapping'
import { hashAgenticGraphStorageContent } from '@/lib/storage/agentic-graph-storage-sync-contract'
import { createAgenticGraphStorageOutboxRecord } from '@/lib/storage/agentic-graph-storage-outbox-record'
import { ensureAgenticGraphStorageNumericRepair } from '@/lib/storage/agentic-graph-storage-client-support'

export type XrV2ExistingStorageManifestPublishReceipt = Readonly<{
  status: 'published' | 'deferred' | 'conflict' | 'rejected'
}>

export type XrV2PreparedExistingStorage = Readonly<{ storage: AgenticGraphStorageDb } | { error: unknown }>

// Open and repair the existing store while parts upload. A settled failure stays
// owned even when an upload fails before this preparation is joined.
export async function prepareXrV2ExistingStorage(signal?: AbortSignal): Promise<XrV2PreparedExistingStorage> {
  try {
    signal?.throwIfAborted()
    const storage = await getAgenticGraphStorageDb()
    signal?.throwIfAborted()
    await ensureAgenticGraphStorageNumericRepair(storage)
    return { storage }
  } catch (error) { return { error } }
}

/**
 * Queues one existing document mutation without running the Source Files inventory
 * reconciler. The inventory reconciler interprets omitted files as deletions, so it
 * is unsafe for a manifest-only upsert.
 */
export async function publishXrV2ManifestThroughExistingStorage(input: Readonly<{
  workspacePath: string
  canonicalPath: string
  text: string
  workspaceId: string
  baseUrl: string
  fetchImpl: typeof fetch
  preparedStorage?: Promise<XrV2PreparedExistingStorage>
  signal?: AbortSignal
}>): Promise<XrV2ExistingStorageManifestPublishReceipt> {
  input.signal?.throwIfAborted()
  const sourceFileId = `share:${hashStringToHex(`${input.workspaceId}:${input.canonicalPath}`)}`
  const documentId = `sf:${sourceFileId}`
  // Preparing the document store is independent of the workspace-file write.
  // Await both before queuing the manifest or allowing any transport effects.
  const [written, { storage, existingDoc }] = await Promise.all([
    writeWorkspaceTextArtifactAtPath({ absolutePath: input.workspacePath, text: input.text }),
    (input.preparedStorage || prepareXrV2ExistingStorage(input.signal)).then(async prepared => {
      if ('error' in prepared) throw prepared.error
      input.signal?.throwIfAborted()
      const { storage } = prepared
      return { storage, existingDoc: await storage.collections.documents.findOne(documentId).exec() }
    }),
  ])
  if (written !== input.workspacePath) return Object.freeze({ status: 'rejected' })
  const existing = existingDoc?.toJSON() as KgDocumentLocalRecord | undefined
  const nowMs = Date.now()
  const record: KgDocumentLocalRecord = {
    id: documentId,
    workspaceId: input.workspaceId,
    canonicalPath: input.canonicalPath,
    title: input.workspacePath.split('/').filter(Boolean).pop() || 'xr-asset.md',
    docType: 'markdown',
    lang: null,
    graphId: `sf-graph:${sourceFileId}`,
    sourceKind: 'markdown',
    contentMd: input.text,
    contentHash: hashAgenticGraphStorageContent(input.text),
    parserVersion: 'source-files',
    documentRevision: Math.max(1, Number(existing?.documentRevision || 0) + 1),
    updatedAtMs: nowMs,
    isDeleted: false,
  }
  const outboxRecord = createAgenticGraphStorageOutboxRecord({
    workspaceId: input.workspaceId,
    entity: 'document',
    op: 'upsert',
    recordId: record.id,
    baseRevision: existing?.documentRevision ?? null,
    record: toAgenticGraphRemoteDocumentRecord(record),
    dbState: storage,
  })
  input.signal?.throwIfAborted()
  const committed = await compareAndCommitAgenticGraphStorageMutationUnit(storage, {
    mutations: [
      { kind: 'upsert', collectionName: 'documents', record },
      { kind: 'upsert', collectionName: 'syncOutbox', record: outboxRecord },
    ],
    revisionDocuments: [record],
    conditions: [{ collectionName: 'documents', selector: { id: documentId }, records: existing ? [existing] : [] }],
  })
  if (!committed) return Object.freeze({ status: 'conflict' })
  // Cancellation may leave a durable queued pair, but never starts late transport.
  input.signal?.throwIfAborted()
  const result = await syncAgenticGraphStorageNow({
    workspaceId: input.workspaceId,
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
    dbState: storage,
    runAfterInFlight: true,
    signal: input.signal,
  })
  if (result.conflictCount) return Object.freeze({ status: 'conflict' })
  if (result.rejectedCount) return Object.freeze({ status: 'rejected' })
  if (result.transportStatus === 'offline-queued' || result.deferredCount) {
    return Object.freeze({ status: 'deferred' })
  }
  return Object.freeze({ status: 'published' })
}
