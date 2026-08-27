import { writeWorkspaceTextArtifactAtPath } from '@/features/chat/chatHistoryWorkspace.output'
import { hashStringToHex } from '@/lib/hash/stringHash'
import {
  getAgenticGraphStorageDb,
  putAgenticGraphStorageDocument,
  type KgDocumentLocalRecord,
} from '@/lib/storage/agenticgraphStorageDb'
import {
  queueAgenticGraphStorageMutation,
  syncAgenticGraphStorageNow,
} from '@/lib/storage/agenticgraphStorageClientSync'
import { toAgenticGraphRemoteDocumentRecord } from '@/lib/storage/agenticgraphStorageRecordMapping'
import { hashAgenticGraphStorageContent } from '@/lib/storage/agenticgraphStorageSyncContract'

export type XrV2ExistingStorageManifestPublishReceipt = Readonly<{
  status: 'published' | 'deferred' | 'conflict' | 'rejected'
}>

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
}>): Promise<XrV2ExistingStorageManifestPublishReceipt> {
  const written = await writeWorkspaceTextArtifactAtPath({
    absolutePath: input.workspacePath,
    text: input.text,
  })
  if (written !== input.workspacePath) return Object.freeze({ status: 'rejected' })

  const storage = await getAgenticGraphStorageDb()
  const sourceFileId = `share:${hashStringToHex(`${input.workspaceId}:${input.canonicalPath}`)}`
  const documentId = `sf:${sourceFileId}`
  const existingDoc = await storage.collections.documents.findOne(documentId).exec()
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
  await putAgenticGraphStorageDocument(storage, record)
  await queueAgenticGraphStorageMutation({
    workspaceId: input.workspaceId,
    entity: 'document',
    op: 'upsert',
    recordId: record.id,
    baseRevision: existing?.documentRevision ?? null,
    record: toAgenticGraphRemoteDocumentRecord(record),
    dbState: storage,
  })
  const result = await syncAgenticGraphStorageNow({
    workspaceId: input.workspaceId,
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
    dbState: storage,
    runAfterInFlight: true,
  })
  if (result.conflictCount) return Object.freeze({ status: 'conflict' })
  if (result.rejectedCount) return Object.freeze({ status: 'rejected' })
  if (result.transportStatus === 'offline-queued' || result.deferredCount) {
    return Object.freeze({ status: 'deferred' })
  }
  return Object.freeze({ status: 'published' })
}
