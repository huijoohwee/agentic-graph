import type { KgDocumentLocalRecord } from '@/lib/storage/agenticgraphStorageDb'
import {
  hashAgenticGraphStorageContent,
  type KgDocumentChunkRecord,
  type KgDocumentRecord,
} from '@/lib/storage/agenticgraphStorageSyncContract'

export const toAgenticGraphRemoteDocumentRecord = (
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
  contentHash: hashAgenticGraphStorageContent(localRecord.contentMd),
  parserVersion: localRecord.parserVersion,
  revision: localRecord.documentRevision,
  updatedAtMs: localRecord.updatedAtMs,
  deleted: localRecord.isDeleted,
})

export const toAgenticGraphLocalDocumentRecord = (
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
  contentHash: hashAgenticGraphStorageContent(remoteRecord.contentMd),
  parserVersion: remoteRecord.parserVersion,
  documentRevision: remoteRecord.revision,
  updatedAtMs: remoteRecord.updatedAtMs,
  isDeleted: remoteRecord.deleted,
})

export const withAgenticGraphDocumentContentHash = (
  record: KgDocumentRecord,
): KgDocumentRecord => ({
  ...record,
  contentHash: hashAgenticGraphStorageContent(record.contentMd),
})

export const withAgenticGraphChunkContentHash = (
  record: KgDocumentChunkRecord,
): KgDocumentChunkRecord => ({
  ...record,
  contentHash: hashAgenticGraphStorageContent(record.markdown),
})
