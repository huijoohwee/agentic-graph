import type { SourceFile } from '@/hooks/store/types'
import { hashStringToHex } from '@/lib/hash/stringHash'
import { hashSignatureParts } from '@/lib/hash/signature'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { readEnvString } from '@/lib/config.env'
import { toCloneSafeObject } from '@/lib/storage/cloneSafe'
import {
  commitAgenticGraphStorageMutationUnit,
  getAgenticGraphStorageDb,
  type KgDocumentLocalRecord,
  type AgenticGraphStorageDb,
  type AgenticGraphStorageMutationUnit,
} from '@/lib/storage/agenticgraphStorageDb'
import { toAgenticGraphRemoteDocumentRecord } from '@/lib/storage/agenticgraphStorageRecordMapping'
import { createAgenticGraphStorageOutboxRecord } from '@/lib/storage/agenticgraphStorageOutboxRecord'
import {
  hashAgenticGraphStorageContent,
  type KgGraphSnapshotRecord,
} from '@/lib/storage/agenticgraphStorageSyncContract'
import { AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID } from '@/lib/storage/agenticgraphStorageSyncContract'
import type { SourceFilesWorkspaceState } from '@/features/source-files/sourceFilesWorkspaceState'
import { isWorkspaceBackedSourceFile } from '@/features/source-files/sourceFilesSignatures'
import type { GraphData } from '@/lib/graph/types'

const AGENTICGRAPH_SOURCE_FILE_DOCUMENT_ID_PREFIX = 'sf:'
const AGENTICGRAPH_SOURCE_FILE_GRAPH_SNAPSHOT_ID_PREFIX = 'sf-graph:'
const sourceFileGraphDataHashCache = new WeakMap<object, string>()

const normalizeString = (value: unknown): string => String(value || '').trim()
const readAgenticGraphStorageWorkspaceIdOverride = (): string =>
  normalizeString(readEnvString('VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID', ''))

const normalizeSourceFileCanonicalPath = (file: SourceFile): string => {
  const sourcePath = normalizeString(file.source?.path)
  if (sourcePath) return sourcePath
  const sourceUrl = normalizeString(file.source?.url)
  if (sourceUrl) return sourceUrl
  return normalizeString(file.name) || file.id
}

const buildSourceFileDocumentId = (fileId: string): string =>
  `${AGENTICGRAPH_SOURCE_FILE_DOCUMENT_ID_PREFIX}${normalizeString(fileId)}`

export const buildSourceFileGraphSnapshotId = (fileId: string): string =>
  `${AGENTICGRAPH_SOURCE_FILE_GRAPH_SNAPSHOT_ID_PREFIX}${normalizeString(fileId)}`

export const isAgenticGraphSourceFileDocumentId = (value: unknown): boolean =>
  normalizeString(value).startsWith(AGENTICGRAPH_SOURCE_FILE_DOCUMENT_ID_PREFIX)

export const readAgenticGraphSourceFileIdFromDocumentId = (value: unknown): string => {
  const documentId = normalizeString(value)
  return isAgenticGraphSourceFileDocumentId(documentId)
    ? documentId.slice(AGENTICGRAPH_SOURCE_FILE_DOCUMENT_ID_PREFIX.length)
    : ''
}

const buildSourceFileDocumentHash = (file: SourceFile): string => {
  return hashAgenticGraphStorageContent(file.text)
}

const readSourceFileGraphDataSemanticHash = (value: unknown): string => {
  if (!value || typeof value !== 'object') return hashStringToHex('{}')
  const objectValue = value as object
  const cached = sourceFileGraphDataHashCache.get(objectValue)
  if (cached) return cached
  const semanticHash = hashStringToHex(JSON.stringify(value))
  const next = buildScopedGraphSemanticKey('source-file-storage-graph', {
    graphData: value as GraphData,
    graphSemanticKey: semanticHash,
  }) || semanticHash
  sourceFileGraphDataHashCache.set(objectValue, next)
  return next
}

const buildSourceFileGraphHash = (file: SourceFile): string =>
  hashSignatureParts([
    'source-file-graph',
    normalizeString(file.id),
    normalizeString(file.parsedParserId),
    readSourceFileGraphDataSemanticHash(file.parsedGraphData),
  ])

const buildSourceFileStorageSyncToken = (file: SourceFile): string => {
  const id = normalizeString(file.id)
  const documentHash = buildSourceFileDocumentHash(file)
  const hasGraphData = !!(file.parsedGraphData && typeof file.parsedGraphData === 'object')
  const graphHash = hasGraphData ? buildSourceFileGraphHash(file) : 'nog'
  return `${id}:${documentHash}:${graphHash}`
}

export const buildAgenticGraphWorkspaceIdFromSourceFilesWorkspaceState = (
  _workspaceState: SourceFilesWorkspaceState,
): string => {
  const workspaceIdOverride = readAgenticGraphStorageWorkspaceIdOverride()
  if (workspaceIdOverride) return workspaceIdOverride
  return AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID
}

const buildDocumentLocalRecordForSourceFile = (
  workspaceId: string,
  file: SourceFile,
  existing: KgDocumentLocalRecord | null,
): KgDocumentLocalRecord => {
  const contentHash = buildSourceFileDocumentHash(file)
  const nowMs = Date.now()
  const didSemanticChange =
    !existing
    || existing.canonicalPath !== normalizeSourceFileCanonicalPath(file)
    || existing.title !== normalizeString(file.name)
    || existing.contentHash !== contentHash
    || existing.isDeleted
  return {
    id: buildSourceFileDocumentId(file.id),
    workspaceId,
    canonicalPath: normalizeSourceFileCanonicalPath(file),
    title: normalizeString(file.name) || null,
    docType: 'markdown',
    lang: null,
    graphId: buildSourceFileGraphSnapshotId(file.id),
    sourceKind: 'markdown',
    contentMd: String(file.text || ''),
    contentHash,
    parserVersion: normalizeString(file.parsedParserId) || 'source-files',
    documentRevision: didSemanticChange ? Math.max(1, Number(existing?.documentRevision || 0) + 1) : Math.max(1, Number(existing?.documentRevision || 1)),
    updatedAtMs: nowMs,
    isDeleted: false,
  }
}

const buildGraphSnapshotRecordForSourceFile = (
  workspaceId: string,
  file: SourceFile,
  documentRevision: number,
): KgGraphSnapshotRecord => ({
  id: buildSourceFileGraphSnapshotId(file.id),
  documentId: buildSourceFileDocumentId(file.id),
  workspaceId,
  graphRevision: Math.max(1, Number(file.parsedGraphRevision || documentRevision || 1)),
  graphHash: buildSourceFileGraphHash(file),
  graphJson: toCloneSafeObject(file.parsedGraphData, {}),
  layoutJson: null,
  derivedFromDocumentRevision: Math.max(1, documentRevision),
  updatedAtMs: Date.now(),
})

const shouldSyncSourceFile = (file: SourceFile | null | undefined): file is SourceFile => {
  if (!file) return false
  const id = normalizeString(file.id)
  if (!id) return false
  if (isWorkspaceBackedSourceFile(file)) return false
  const text = String(file.text || '')
  const canonicalPath = normalizeSourceFileCanonicalPath(file)
  return !!canonicalPath || !!text.trim()
}

export const buildSourceFilesStorageSyncSignature = (sourceFiles: SourceFile[]): string => {
  const nextFiles = Array.isArray(sourceFiles) ? sourceFiles : []
  const tokens: string[] = []
  for (let i = 0; i < nextFiles.length; i += 1) {
    const file = nextFiles[i]
    if (!shouldSyncSourceFile(file)) continue
    tokens.push(buildSourceFileStorageSyncToken(file))
  }
  if (tokens.length === 0) return '[]'
  tokens.sort()
  return tokens.join('|')
}

export const syncSourceFilesToAgenticGraphStorage = async (args: {
  workspaceId: string
  sourceFiles: SourceFile[]
  previousSourceFiles?: SourceFile[] | null
  dbState?: AgenticGraphStorageDb | null
  forceDocumentUpsert?: boolean
  /**
   * Source Files bootstrap supplies an authoritative inventory and therefore
   * reconciles missing local records by default. Targeted user actions must
   * opt out so a one-file upload cannot tombstone unrelated documents.
   */
  reconcileMissingDocuments?: boolean
}): Promise<{ queuedMutationCount: number }> => {
  const workspaceId = normalizeString(args.workspaceId)
  if (!workspaceId) return { queuedMutationCount: 0 }
  const dbState = args.dbState || (await getAgenticGraphStorageDb())
  const { collections } = dbState
  const rows = await collections.documents.find({ selector: { workspaceId } }).exec()
  const existingById = new Map<string, KgDocumentLocalRecord>()
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!
    const id = normalizeString(row.get('id'))
    if (!id.startsWith(AGENTICGRAPH_SOURCE_FILE_DOCUMENT_ID_PREFIX)) continue
    existingById.set(id, row.toJSON() as KgDocumentLocalRecord)
  }
  const graphSnapshotRows = await collections.graphSnapshots.find({ selector: { workspaceId } }).exec()
  const existingGraphSnapshotById = new Map<string, {
    row: (typeof graphSnapshotRows)[number]
    record: KgGraphSnapshotRecord
  }>()
  for (let i = 0; i < graphSnapshotRows.length; i += 1) {
    const row = graphSnapshotRows[i]!
    const id = normalizeString(row.get('id'))
    if (!id.startsWith(AGENTICGRAPH_SOURCE_FILE_GRAPH_SNAPSHOT_ID_PREFIX)) continue
    existingGraphSnapshotById.set(id, {
      row,
      record: row.toJSON() as KgGraphSnapshotRecord,
    })
  }
  let queuedMutationCount = 0
  const keepDocumentIds = new Set<string>()
  const nextFiles = Array.isArray(args.sourceFiles) ? args.sourceFiles : []
  for (let i = 0; i < nextFiles.length; i += 1) {
    const file = nextFiles[i]
    if (!shouldSyncSourceFile(file)) continue
    const documentId = buildSourceFileDocumentId(file.id)
    keepDocumentIds.add(documentId)
    const existing = existingById.get(documentId) || null
    const builtLocalRecord = buildDocumentLocalRecordForSourceFile(workspaceId, file, existing)
    const nextLocalRecord = args.forceDocumentUpsert === true && existing
      ? {
          ...builtLocalRecord,
          documentRevision: Math.max(
            Number(builtLocalRecord.documentRevision || 0),
            Number(existing.documentRevision || 0) + 1,
          ),
          updatedAtMs: Date.now(),
        }
      : builtLocalRecord
    const didDocumentChange = args.forceDocumentUpsert === true
      || !existing
      || existing.canonicalPath !== nextLocalRecord.canonicalPath
      || existing.title !== nextLocalRecord.title
      || existing.contentHash !== nextLocalRecord.contentHash
      || existing.documentRevision !== nextLocalRecord.documentRevision
      || existing.isDeleted !== nextLocalRecord.isDeleted
    const mutations: Array<AgenticGraphStorageMutationUnit['mutations'][number]> = []
    const revisionDocuments: KgDocumentLocalRecord[] = []
    let nextQueuedMutationCount = 0
    if (didDocumentChange) {
      const outboxRecord = createAgenticGraphStorageOutboxRecord({
        workspaceId,
        entity: 'document',
        op: 'upsert',
        recordId: nextLocalRecord.id,
        baseRevision: existing ? existing.documentRevision : null,
        record: toAgenticGraphRemoteDocumentRecord(nextLocalRecord),
        dbState,
      })
      mutations.push(
        { kind: 'upsert', collectionName: 'documents', record: nextLocalRecord },
        { kind: 'upsert', collectionName: 'syncOutbox', record: outboxRecord },
      )
      revisionDocuments.push(nextLocalRecord)
      nextQueuedMutationCount += 1
    }
    const hasGraphData = !!(file.parsedGraphData && typeof file.parsedGraphData === 'object')
    const graphSnapshotId = buildSourceFileGraphSnapshotId(file.id)
    const existingGraphSnapshotEntry = existingGraphSnapshotById.get(graphSnapshotId) || null
    const existingGraphSnapshotDoc = existingGraphSnapshotEntry?.row || null
    const existingGraphSnapshot = existingGraphSnapshotEntry?.record || null
    if (hasGraphData) {
      const nextGraphSnapshot = buildGraphSnapshotRecordForSourceFile(workspaceId, file, nextLocalRecord.documentRevision)
      const didGraphChange =
        !existingGraphSnapshot
        || normalizeString(existingGraphSnapshot.graphHash) !== nextGraphSnapshot.graphHash
        || Number(existingGraphSnapshot.derivedFromDocumentRevision || 0) !== nextGraphSnapshot.derivedFromDocumentRevision
      if (didGraphChange) {
        const outboxRecord = createAgenticGraphStorageOutboxRecord({
          workspaceId,
          entity: 'graphSnapshot',
          op: 'upsert',
          recordId: nextGraphSnapshot.id,
          baseRevision: existingGraphSnapshot ? Number(existingGraphSnapshot.graphRevision || 0) : null,
          record: nextGraphSnapshot,
          dbState,
        })
        mutations.push(
          { kind: 'upsert', collectionName: 'graphSnapshots', record: nextGraphSnapshot },
          { kind: 'upsert', collectionName: 'syncOutbox', record: outboxRecord },
        )
        nextQueuedMutationCount += 1
      }
    } else if (existingGraphSnapshotDoc) {
      const deletedSnapshot = {
        ...(existingGraphSnapshot as KgGraphSnapshotRecord),
        updatedAtMs: Date.now(),
      }
      const outboxRecord = createAgenticGraphStorageOutboxRecord({
        workspaceId,
        entity: 'graphSnapshot',
        op: 'delete',
        recordId: graphSnapshotId,
        baseRevision: Number(existingGraphSnapshot?.graphRevision || 0) || null,
        record: deletedSnapshot,
        dbState,
      })
      mutations.push(
        { kind: 'remove', collectionName: 'graphSnapshots', id: graphSnapshotId },
        { kind: 'upsert', collectionName: 'syncOutbox', record: outboxRecord },
      )
      nextQueuedMutationCount += 1
    }
    if (mutations.length > 0) {
      await commitAgenticGraphStorageMutationUnit(dbState, { mutations, revisionDocuments })
      queuedMutationCount += nextQueuedMutationCount
      if (!hasGraphData && existingGraphSnapshotDoc) {
        existingGraphSnapshotById.delete(graphSnapshotId)
      }
    }
  }
  const previousSourceFiles = Array.isArray(args.previousSourceFiles) ? args.previousSourceFiles : []
  const ownedDocumentIds = new Set<string>()
  for (const file of previousSourceFiles) {
    if (shouldSyncSourceFile(file)) ownedDocumentIds.add(buildSourceFileDocumentId(file.id))
  }
  if (args.reconcileMissingDocuments !== false) {
    // Only a prior Source Files snapshot can establish deletion ownership.
    // A targeted snapshot or a fresh/empty bootstrap must never infer that
    // every existing `sf:` record is owned by its current input.
    for (const documentId of ownedDocumentIds) {
      const existing = existingById.get(documentId)
      if (!existing) continue
      if (keepDocumentIds.has(documentId)) continue
      if (existing.isDeleted) continue
      const deletedRecord: KgDocumentLocalRecord = {
        ...existing,
        documentRevision: Math.max(1, Number(existing.documentRevision || 0) + 1),
        updatedAtMs: Date.now(),
        isDeleted: true,
      }
      const mutations: Array<AgenticGraphStorageMutationUnit['mutations'][number]> = []
      const documentOutboxRecord = createAgenticGraphStorageOutboxRecord({
        workspaceId,
        entity: 'document',
        op: 'delete',
        recordId: deletedRecord.id,
        baseRevision: existing.documentRevision,
        record: toAgenticGraphRemoteDocumentRecord(deletedRecord),
        dbState,
      })
      mutations.push(
        { kind: 'upsert', collectionName: 'documents', record: deletedRecord },
        { kind: 'upsert', collectionName: 'syncOutbox', record: documentOutboxRecord },
      )
      let nextQueuedMutationCount = 1
      const graphSnapshotId = normalizeString(existing.graphId)
        || buildSourceFileGraphSnapshotId(readAgenticGraphSourceFileIdFromDocumentId(documentId))
      const existingGraphSnapshotEntry = existingGraphSnapshotById.get(graphSnapshotId) || null
      if (existingGraphSnapshotEntry) {
        const deletedSnapshot = {
          ...existingGraphSnapshotEntry.record,
          updatedAtMs: Date.now(),
        }
        const graphOutboxRecord = createAgenticGraphStorageOutboxRecord({
          workspaceId,
          entity: 'graphSnapshot',
          op: 'delete',
          recordId: graphSnapshotId,
          baseRevision: Number(deletedSnapshot.graphRevision || 0) || null,
          record: deletedSnapshot,
          dbState,
        })
        mutations.push(
          { kind: 'remove', collectionName: 'graphSnapshots', id: graphSnapshotId },
          { kind: 'upsert', collectionName: 'syncOutbox', record: graphOutboxRecord },
        )
        nextQueuedMutationCount += 1
      }
      await commitAgenticGraphStorageMutationUnit(dbState, {
        mutations,
        revisionDocuments: [deletedRecord],
      })
      queuedMutationCount += nextQueuedMutationCount
      if (existingGraphSnapshotEntry) existingGraphSnapshotById.delete(graphSnapshotId)
    }
  }
  return { queuedMutationCount }
}
