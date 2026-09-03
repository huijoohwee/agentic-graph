import { readEnvString } from '@/lib/config.env'
import {
  buildAgenticGraphStorageExportPath,
  AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID,
  type AgenticGraphStorageExportResponse,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
import {
  buildAgenticGraphStorageRequestUrl,
  readCachedWorkspaceDocsMirrorEntries,
  readFirstAgenticGraphStorageDocText,
} from './workspaceSeedProviderStorageCache'
import {
  WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES,
  WORKSPACE_DOCS_MIRROR_MAX_FILES,
} from './workspaceDocsMirrorNodeReader'
import { isWorkspaceRepoLocalRunReadyBootstrap } from './workspaceRunReadyDemos'
import { isWorkspaceSourceMirrorFileName } from './workspaceSourceMirrorFormats'
import type { WorkspaceDocsMirrorEntry } from './workspaceSeedProvider'

export const PUBLISHED_AGENTIC_DOCS_ROOT = 'agentic-canvas-os/docs'

type PublishedAgenticDocSource =
  | { authority: 'repo-local' }
  | { authority: 'canonical-storage'; text: string }

const normalizeCanonicalPath = (value: string): string => (
  String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
)

const isPublishedAgenticDocPath = (value: string): boolean => {
  const canonicalPath = normalizeCanonicalPath(value)
  return canonicalPath.startsWith(`${PUBLISHED_AGENTIC_DOCS_ROOT}/`)
}

const readStorageBaseUrl = (): string => (
  String(readEnvString('VITE_AGENTIC_OS_STORAGE_BASE_URL', '') || '').trim()
)

const readUtf8ByteLength = (value: string): number => new TextEncoder().encode(value).byteLength

const reconstructDocumentText = (
  documentId: string,
  contentMd: string,
  chunksByDocumentId: ReadonlyMap<string, Array<{ order: number; markdown: string; id: string }>>,
): string => {
  if (contentMd.trim()) return contentMd
  const chunks = (chunksByDocumentId.get(documentId) || []).slice()
    .sort((left, right) => (left.order - right.order) || left.id.localeCompare(right.id))
  return chunks.map(chunk => chunk.markdown).join('\n\n')
}

const readPublishedAgenticDocsMirrorUncached = async (
  baseUrl: string,
): Promise<WorkspaceDocsMirrorEntry[]> => {
  if (typeof fetch !== 'function') return []
  const exportPath = buildAgenticGraphStorageExportPath(AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID)
  const requestUrl = buildAgenticGraphStorageRequestUrl({ path: exportPath, baseUrl })
  if (!requestUrl) return []
  try {
    const response = await fetch(requestUrl, { method: 'GET' })
    if (!response.ok) return []
    const payload = (await response.json()) as Partial<AgenticGraphStorageExportResponse>
    if (
      payload.ok !== true
      || payload.workspaceId !== AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID
      || !Array.isArray(payload.documents)
    ) return []

    const canonicalDocuments = payload.documents.filter(document => {
      if (!document || document.deleted === true) return false
      const relPath = normalizeCanonicalPath(document.canonicalPath)
      return isPublishedAgenticDocPath(relPath) && isWorkspaceSourceMirrorFileName(relPath)
    })
    if (canonicalDocuments.length > WORKSPACE_DOCS_MIRROR_MAX_FILES) return []
    const chunkBackedDocumentIds = new Set(canonicalDocuments
      .filter(document => !String(document.contentMd || '').trim())
      .map(document => String(document.id || '').trim())
      .filter(Boolean))
    const chunksByDocumentId = new Map<string, Array<{ order: number; markdown: string; id: string }>>()
    const chunkBytesByDocumentId = new Map<string, number>()
    for (const [index, chunk] of (payload.documentChunks || []).entries()) {
      const documentId = String(chunk?.documentId || '').trim()
      const markdown = String(chunk?.markdown || '')
      if (!chunkBackedDocumentIds.has(documentId) || !markdown.trim()) continue
      const nextByteLength = (chunkBytesByDocumentId.get(documentId) || 0) + readUtf8ByteLength(markdown)
      if (nextByteLength > WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES) return []
      chunkBytesByDocumentId.set(documentId, nextByteLength)
      const rows = chunksByDocumentId.get(documentId) || []
      rows.push({
        order: Number.isFinite(Number(chunk.chunkOrder)) ? Math.floor(Number(chunk.chunkOrder)) : index,
        markdown,
        id: String(chunk.id || ''),
      })
      chunksByDocumentId.set(documentId, rows)
    }

    const entriesByPath = new Map<string, WorkspaceDocsMirrorEntry>()
    for (const document of canonicalDocuments) {
      const relPath = normalizeCanonicalPath(document.canonicalPath)
      const text = reconstructDocumentText(
        String(document.id || ''),
        String(document.contentMd || ''),
        chunksByDocumentId,
      )
      if (!text.trim() || readUtf8ByteLength(text) > WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES) return []
      const updatedAtMs = Number.isFinite(Number(document.updatedAtMs))
        ? Math.floor(Number(document.updatedAtMs))
        : 0
      const next: WorkspaceDocsMirrorEntry = {
        relPath,
        text,
        updatedAtMs,
        authority: 'agentic-canvas-os-storage',
      }
      const existing = entriesByPath.get(relPath)
      if (!existing || next.updatedAtMs >= existing.updatedAtMs) entriesByPath.set(relPath, next)
    }
    return [...entriesByPath.values()].sort((left, right) => left.relPath.localeCompare(right.relPath))
  } catch {
    return []
  }
}

export const readPublishedAgenticDocsMirrorEntries = async (): Promise<WorkspaceDocsMirrorEntry[]> => {
  const baseUrl = readStorageBaseUrl()
  if (!baseUrl) return []
  return readCachedWorkspaceDocsMirrorEntries({
    cacheKey: `published-agentic-docs|${baseUrl}|${AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID}`,
    load: () => readPublishedAgenticDocsMirrorUncached(baseUrl),
  })
}

export const readPublishedAgenticDocSource = async (
  canonicalPathRaw: string,
): Promise<PublishedAgenticDocSource> => {
  if (isWorkspaceRepoLocalRunReadyBootstrap()) return { authority: 'repo-local' }
  const canonicalPath = normalizeCanonicalPath(canonicalPathRaw)
  const baseUrl = readStorageBaseUrl()
  const storedText = baseUrl && isPublishedAgenticDocPath(canonicalPath)
    ? await readFirstAgenticGraphStorageDocText({
        baseUrl,
        workspaceId: AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID,
        canonicalPathCandidates: [canonicalPath],
      })
    : ''
  const text = readUtf8ByteLength(storedText) <= WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES
    ? storedText
    : ''
  return { authority: 'canonical-storage', text }
}
