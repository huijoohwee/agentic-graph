import Dexie, { type Table } from 'dexie'

type StoredRecord = Record<string, unknown>

export type IndexedCollectionRecord = {
  key: string
  collection: string
  id: string
  value: StoredRecord
}

export type IndexedDocumentRevisionRecord = {
  key: string
  workspaceId: string
  documentId: string
  documentRevision: number
  contentMd: string
  contentHash: string
  updatedAtMs: number
}

export type IndexedCollaborationUpdateRecord = {
  updateId: string
  workspaceId: string
  documentKey: string
  roomId: string
  provider: 'pocketbase' | 'durable-object'
  clientSeq: number
  updateBase64: string
  attemptCount: number
  acknowledgedAtMs: number | null
  createdAtMs: number
  updatedAtMs: number
}

export type IndexedDocumentRevisionWrite = {
  record: Omit<IndexedDocumentRevisionRecord, 'key'>
  keep?: number
}

export class IndexedCollectionDexie extends Dexie {
  records!: Table<IndexedCollectionRecord, string>
  documentRevisions!: Table<IndexedDocumentRevisionRecord, string>
  collaborationUpdates!: Table<IndexedCollaborationUpdateRecord, string>

  constructor(databaseName: string) {
    super(databaseName)
    this.version(1).stores({
      records: '&key, collection, id, [collection+id]',
      documentRevisions: '&key, [workspaceId+documentId], documentRevision, updatedAtMs',
      collaborationUpdates: '&updateId, [workspaceId+documentKey], roomId, acknowledgedAtMs, createdAtMs',
    })
  }
}

