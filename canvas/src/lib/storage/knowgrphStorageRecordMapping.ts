import type { KgDocumentLocalRecord } from '@/lib/storage/knowgrphStorageDb'
import {
  hashKnowgrphStorageContent,
  type KgDocumentChunkRecord,
  type KgDocumentRecord,
} from '@/lib/storage/knowgrphStorageSyncContract'

export const toKnowgrphRemoteDocumentRecord = (
  localRecord: KgDocumentLocalRecord,
): KgDocumentRecord => ({
  id: localRecord.id,
  workspaceId: localRecord.workspaceId,
  canonicalPath: localRecord.canonicalPath,
  title: localRecord.title,
  docType: localRecord.docType,
  lang: localRecord.lang,
  graphId: localRecord.graphId,
  sourceKind: localRecord.sourceKind,
  contentMd: localRecord.contentMd,
  contentHash: hashKnowgrphStorageContent(localRecord.contentMd),
  parserVersion: localRecord.parserVersion,
  revision: localRecord.documentRevision,
  updatedAtMs: localRecord.updatedAtMs,
  deleted: localRecord.isDeleted,
})

export const toKnowgrphLocalDocumentRecord = (
  remoteRecord: KgDocumentRecord,
): KgDocumentLocalRecord => ({
  id: remoteRecord.id,
  workspaceId: remoteRecord.workspaceId,
  canonicalPath: remoteRecord.canonicalPath,
  title: remoteRecord.title,
  docType: remoteRecord.docType,
  lang: remoteRecord.lang,
  graphId: remoteRecord.graphId,
  sourceKind: remoteRecord.sourceKind,
  contentMd: remoteRecord.contentMd,
  contentHash: hashKnowgrphStorageContent(remoteRecord.contentMd),
  parserVersion: remoteRecord.parserVersion,
  documentRevision: remoteRecord.revision,
  updatedAtMs: remoteRecord.updatedAtMs,
  isDeleted: remoteRecord.deleted,
})

export const withKnowgrphDocumentContentHash = (
  record: KgDocumentRecord,
): KgDocumentRecord => ({
  ...record,
  contentHash: hashKnowgrphStorageContent(record.contentMd),
})

export const withKnowgrphChunkContentHash = (
  record: KgDocumentChunkRecord,
): KgDocumentChunkRecord => ({
  ...record,
  contentHash: hashKnowgrphStorageContent(record.markdown),
})
