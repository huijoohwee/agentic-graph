import type { SourceFile } from '@/hooks/store/types'
import type { KgDocumentChunkRecord, KgGraphSnapshotRecord, AgenticGraphStorageChildState } from '@/lib/storage/agentic-graph-storage-sync-contract'
import type { AgenticGraphStoragePullProjection } from '@/lib/storage/agentic-graph-storage-client-types'
import { normalizeSourceFileRecord } from '@/features/source-files/sourceFileParsedState'

export const readStorageProjectionTexts = (chunks: KgDocumentChunkRecord[], workspaceId: string,
  projection?: AgenticGraphStoragePullProjection): Map<string, string> => {
  const byDocument = new Map<string, KgDocumentChunkRecord[]>()
  for (const chunk of chunks) {
    if (chunk.workspaceId !== workspaceId) continue
    const rows = byDocument.get(chunk.documentId) ?? []
    rows.push(chunk); byDocument.set(chunk.documentId, rows)
  }
  const texts = new Map([...byDocument].map(([id, rows]) => [id, rows.sort((a, b) =>
    a.chunkOrder - b.chunkOrder || a.id.localeCompare(b.id)).map(row => row.markdown).join('\n\n')]))
  for (const document of projection?.documentTexts ?? []) texts.set(document.documentId, document.text)
  return texts
}

export const assertStorageTextProjectionCurrent = (existing: SourceFile | null, documentId: string,
  projection?: AgenticGraphStoragePullProjection): void => {
  const observed = projection?.documentTexts.find(document => document.documentId === documentId)
  if (!existing || !observed || existing.text === observed.previousText || existing.text === observed.text
    || (observed.previousText === null && !existing.text)) return
  throw new Error('Source text changed during storage sync; the remote projection remains saved for retry')
}

export const assertStorageGraphProjectionCurrent = (existing: SourceFile | null, documentId: string,
  next: KgGraphSnapshotRecord | null, projection?: AgenticGraphStoragePullProjection): void => {
  const observed = projection?.previousGraphs.find(graph => graph.documentId === documentId)
  if (!existing || !observed) return
  const matches = (record: KgGraphSnapshotRecord | null) => record
    ? existing.parsedGraphRevision === record.graphRevision && JSON.stringify(existing.parsedGraphData) === JSON.stringify(record.graphJson)
    : !existing.parsedGraphData
  if (matches(observed.record) || matches(next)) return
  throw new Error('Source graph changed during storage sync; the remote projection remains saved for retry')
}

export const removeStorageProjectedGraph = (existing: SourceFile, state: AgenticGraphStorageChildState): SourceFile => {
  if (state.entity !== 'graphSnapshot' || existing.parsedGraphRevision !== state.graphRevision) return existing
  return normalizeSourceFileRecord({ ...existing, status: 'idle', parsedParserId: undefined,
    parsedTextHash: undefined, parsedGraphRevision: undefined, parsedGraphData: undefined })
}
