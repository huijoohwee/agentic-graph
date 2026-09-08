import { exportAgenticGraphStorageWorkspacePages } from '@/lib/storage/agentic-graph-storage-client-export'
import { AGENTIC_OS_STORAGE_SYNC_LIMITS, type KgDocumentRecord } from '@/lib/storage/agentic-graph-storage-sync-contract'
import { readCachedWorkspaceDocsMirrorEntries, readFirstAgenticGraphStorageDocText } from './workspaceSeedProviderStorageCache'
import { WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES, WORKSPACE_DOCS_MIRROR_MAX_FILES } from './workspaceDocsMirrorNodeReader'
import { isWorkspaceSourceMirrorFileName } from './workspaceSourceMirrorFormats'
import { reportWorkspaceMirrorTrace, nextWorkspaceMirrorTraceId } from './workspaceSeedProviderLocalIo'
import {
  normalizeRelPath, normalizeMirrorRelPath, normalizeSourceFileMirrorPath, resolveSelectedFolderRelativeMirrorPath,
  readWorkspaceInitializationDocsAbsRoot, isWorkspaceBackedSourcePath, CANONICAL_STORAGE_DOCS_ROOT,
  type WorkspaceDocsMirrorEntry,
} from './workspaceSeedProviderPaths'

type MirrorChunk = { id: string; order: number; markdown: string; binaryId: Uint8Array }
type MirrorProjection = Omit<WorkspaceDocsMirrorEntry, 'text'>
type MirrorDocument = { projection: MirrorProjection; contentMd: string }
const encoder = new TextEncoder()
const utf8Bytes = (text: string): number => encoder.encode(text).byteLength
const MAX_TRACKED_ROWS = WORKSPACE_DOCS_MIRROR_MAX_FILES * AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResultRows
const MAX_MIRROR_TEXT_BYTES = WORKSPACE_DOCS_MIRROR_MAX_FILES * (WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES + 2)
const failMirror = (reason: string): never => { throw new Error(`workspace storage mirror ${reason}`) }
const compareBinaryIds = (left: Uint8Array, right: Uint8Array): number => {
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    if (left[i] !== right[i]) return left[i]! - right[i]!
  }
  return left.length - right.length
}

// Match the document stream owner: only empty inline content is chunk-backed;
// each chunk, including empty chunks, contributes its position and separator.
const assembleDocumentText = (contentMd: string, chunks: MirrorChunk[]): string => {
  if (contentMd.length !== 0) return contentMd
  chunks.sort((left, right) => (left.order - right.order) || compareBinaryIds(left.binaryId, right.binaryId))
  return chunks.map(chunk => chunk.markdown).join('\n\n')
}

export const readPaginatedWorkspaceStorageMirror = async (args: {
  baseUrl: string
  workspaceId: string
  selectDocument: (document: KgDocumentRecord) => MirrorProjection | null
  fetchImpl?: typeof fetch
}): Promise<WorkspaceDocsMirrorEntry[]> => {
  const workspaceId = args.workspaceId.trim()
  const documents = new Map<string, MirrorDocument | null>()
  const chunks = new Map<string, MirrorChunk[]>()
  const chunkIds = new Set<string>()
  const bytesByDocument = new Map<string, number>()
  const selectedPaths = new Set<string>()
  let identityBytes = 0, retainedTextBytes = 0
  const countIdentity = (id: string): void => {
    identityBytes += utf8Bytes(id)
    if (identityBytes > AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResponseBytes) failMirror('identity capacity exceeded')
  }
  const assertTextCapacity = (): void => {
    if (retainedTextBytes > MAX_MIRROR_TEXT_BYTES) failMirror('text capacity exceeded')
  }
  for await (const page of exportAgenticGraphStorageWorkspacePages(args)) {
    if (page.workspaceId !== workspaceId || !Array.isArray(page.documents) || !Array.isArray(page.documentChunks)) {
      failMirror('returned an invalid workspace payload')
    }
    // Keyset pages interleave parents and chunks by update time. Keep only IDs
    // for excluded parents, and bounded pending chunks until their parent arrives.
    for (const document of page.documents) {
      if (!document || document.workspaceId !== workspaceId || typeof document.contentMd !== 'string'
        || typeof document.deleted !== 'boolean') {
        failMirror('returned an invalid document owner or content')
      }
      const id = String(document.id || '')
      if (!id.trim() || documents.has(id)) failMirror('returned a missing or repeated document identity')
      countIdentity(id)
      if (documents.size >= MAX_TRACKED_ROWS) failMirror('document identity capacity exceeded')
      const projection = document.deleted ? null : args.selectDocument(document)
      const heldBytes = bytesByDocument.get(id) || 0
      if (!projection || document.contentMd.length !== 0) {
        chunks.delete(id)
        bytesByDocument.delete(id)
        retainedTextBytes -= heldBytes
      }
      if (!projection) { documents.set(id, null); continue }
      countIdentity(projection.relPath)
      selectedPaths.add(projection.relPath)
      if (selectedPaths.size > WORKSPACE_DOCS_MIRROR_MAX_FILES) failMirror('file count capacity exceeded')
      const inlineBytes = utf8Bytes(document.contentMd)
      if (inlineBytes > WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES
        || (document.contentMd.length === 0 && Math.max(0, heldBytes - 2) > WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES)) {
        failMirror('file byte capacity exceeded')
      }
      retainedTextBytes += inlineBytes
      documents.set(id, { projection, contentMd: document.contentMd })
      assertTextCapacity()
    }
    for (const chunk of page.documentChunks) {
      if (!chunk || chunk.workspaceId !== workspaceId || typeof chunk.markdown !== 'string'
        || typeof chunk.documentId !== 'string'
        || chunk.contentReused === true || !Number.isSafeInteger(chunk.chunkOrder) || chunk.chunkOrder < 0) {
        failMirror('returned an invalid chunk owner or content')
      }
      const id = String(chunk.id || ''), documentId = String(chunk.documentId || '')
      if (!id.trim() || !documentId.trim() || chunkIds.has(id)) failMirror('returned a missing or repeated chunk identity')
      chunkIds.add(id)
      countIdentity(id)
      if (chunkIds.size > MAX_TRACKED_ROWS) failMirror('chunk count capacity exceeded')
      const parent = documents.get(documentId)
      if (documents.has(documentId) && (!parent || parent.contentMd.length !== 0)) continue
      if (!documents.has(documentId) && !chunks.has(documentId)) countIdentity(documentId)
      const rows = chunks.get(documentId) || []
      const bytes = utf8Bytes(chunk.markdown) + 2
      rows.push({ id, order: chunk.chunkOrder, markdown: chunk.markdown, binaryId: encoder.encode(id) })
      chunks.set(documentId, rows)
      const documentBytes = (bytesByDocument.get(documentId) || 0) + bytes
      bytesByDocument.set(documentId, documentBytes)
      retainedTextBytes += bytes
      if (documents.has(documentId) && documentBytes - 2 > WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES) failMirror('file byte capacity exceeded')
      assertTextCapacity()
    }
    // Graph snapshots are deliberately not accumulated by this text projection.
  }
  for (const id of chunks.keys()) {
    if (!documents.has(id)) failMirror('returned chunks without their document')
  }
  const byPath = new Map<string, WorkspaceDocsMirrorEntry>()
  for (const [id, document] of documents) {
    if (!document) continue
    const text = assembleDocumentText(document.contentMd, chunks.get(id) || [])
    if (utf8Bytes(text) > WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES) failMirror('file byte capacity exceeded')
    const next: WorkspaceDocsMirrorEntry = { ...document.projection, text }
    const existing = byPath.get(next.relPath)
    if (!existing || next.updatedAtMs >= existing.updatedAtMs) byPath.set(next.relPath, next)
    chunks.delete(id)
  }
  return [...byPath.values()].sort((left, right) => left.relPath.localeCompare(right.relPath))
}

export const reportWorkspaceStorageMirrorFailure = (error: unknown): void => {
  reportWorkspaceMirrorTrace({ hypothesisId: 'E', traceId: nextWorkspaceMirrorTraceId('storage'),
    location: 'workspaceSeedProviderStorage:read', msg: 'Optional workspace storage mirror read failed',
    data: { error: error instanceof Error ? error.message : String(error) } })
}

export const readWorkspaceDocsMirrorEntriesFromAgenticGraphStorageExport = async (args: {
  baseUrl: string; workspaceId: string; selectedFolderPath: string
}): Promise<WorkspaceDocsMirrorEntry[]> => {
  const baseUrl = String(args.baseUrl || '').trim(), workspaceId = String(args.workspaceId || '').trim()
  const selectedFolderPath = normalizeMirrorRelPath(args.selectedFolderPath)
  if (!baseUrl || !workspaceId) return []
  const docsAbsRoot = readWorkspaceInitializationDocsAbsRoot()
  try {
    return await readCachedWorkspaceDocsMirrorEntries({
      cacheKey: `${baseUrl}|${workspaceId}|${selectedFolderPath}`,
      load: () => readPaginatedWorkspaceStorageMirror({ baseUrl, workspaceId, selectDocument: document => {
        const canonicalPathRaw = String(document.canonicalPath || document.title || document.id || '').trim()
        const canonicalPath = normalizeSourceFileMirrorPath(
          docsAbsRoot && canonicalPathRaw.startsWith(`${docsAbsRoot}/`)
            ? canonicalPathRaw.slice(docsAbsRoot.length + 1)
            : canonicalPathRaw,
        )
        if (!isWorkspaceSourceMirrorFileName(canonicalPath)) return null
        const relPath = resolveSelectedFolderRelativeMirrorPath(canonicalPath, selectedFolderPath)
        if (!relPath || !isWorkspaceSourceMirrorFileName(relPath)) return null
        return { relPath, updatedAtMs: Number.isFinite(Number(document.updatedAtMs)) ? Math.floor(Number(document.updatedAtMs)) : Date.now() }
      } }),
    })
  } catch (error) {
    // Optional bootstrap fallback stays available; rejection occurs inside the
    // cache loader, so failure can never become a successful empty snapshot.
    reportWorkspaceStorageMirrorFailure(error)
    return []
  }
}

export const readCanonicalPathCandidatesForSourcePath = (sourcePathRaw: string): string[] => {
  const sourcePath = String(sourcePathRaw || '').trim().replace(/\\/g, '/')
  if (!sourcePath) return []
  const withoutWorkspace = sourcePath.startsWith('workspace:') ? sourcePath.slice('workspace:'.length) : sourcePath
  const normalizeCanonicalPath = (value: string): string => {
    let next = normalizeMirrorRelPath(value)
    if (!next) return ''
    const docsAbsRoot = normalizeRelPath(readWorkspaceInitializationDocsAbsRoot())
    if (docsAbsRoot && next.startsWith(`${docsAbsRoot}/`)) {
      next = `docs/${next.slice(docsAbsRoot.length + 1)}`
    }
    const collapsePrefix = (path: string, prefix: string): string => {
      const normalizedPath = normalizeMirrorRelPath(path)
      const normalizedPrefix = normalizeMirrorRelPath(prefix)
      const doubled = `${normalizedPrefix}/${normalizedPrefix}/`
      if (normalizedPath.startsWith(doubled)) {
        return `${normalizedPrefix}/${normalizedPath.slice(doubled.length)}`
      }
      return normalizedPath
    }
    const docsRootMarker = `${CANONICAL_STORAGE_DOCS_ROOT}/`
    const docsRootIndex = next.toLowerCase().indexOf(docsRootMarker)
    if (docsRootIndex > 0) {
      next = next.slice(docsRootIndex)
    }
    if (next.toLowerCase().startsWith(`docs/${docsRootMarker}`)) {
      next = `${CANONICAL_STORAGE_DOCS_ROOT}/${next.slice(`docs/${docsRootMarker}`.length)}`
    }
    next = collapsePrefix(next, 'docs')
    next = collapsePrefix(next, CANONICAL_STORAGE_DOCS_ROOT)
    return normalizeMirrorRelPath(next)
  }
  const normalized = normalizeCanonicalPath(withoutWorkspace)
  if (!normalized) return []
  const candidates = new Set<string>()
  const push = (value: string) => {
    const next = normalizeCanonicalPath(value)
    if (!next || !isWorkspaceSourceMirrorFileName(next)) return
    if (next.toLowerCase().includes(`/${CANONICAL_STORAGE_DOCS_ROOT}/${CANONICAL_STORAGE_DOCS_ROOT}/`)) return
    if (next.toLowerCase().startsWith(`docs/${CANONICAL_STORAGE_DOCS_ROOT}/`)) return
    candidates.add(next)
  }
  if (normalized.startsWith('docs/')) {
    // Prefer canonical storage owner path first to avoid noisy/failed docs/* probes.
    push(`agentic-canvas-os/${normalized}`)
    push(normalized)
  } else if (normalized.startsWith(`${CANONICAL_STORAGE_DOCS_ROOT}/`)) {
    push(normalized)
    push(normalized.slice('agentic-canvas-os/'.length))
  } else {
    push(normalized)
  }
  return [...candidates]
}

export const readWorkspaceDocsMirrorEntriesFromAgenticGraphStorageDocsBySourceFiles = async (args: {
  baseUrl: string
  workspaceId: string
  selectedFolderPath: string
  sourceFiles: Array<{
    name?: unknown
    text?: unknown
    updatedAtMs?: unknown
    source?: { kind?: unknown; path?: unknown; url?: unknown } | null
  }>
}): Promise<WorkspaceDocsMirrorEntry[]> => {
  if (typeof fetch !== 'function') return []
  const workspaceId = String(args.workspaceId || '').trim()
  if (!workspaceId) return []
  const sourceFiles = Array.isArray(args.sourceFiles) ? args.sourceFiles : []
  if (sourceFiles.length === 0) return []
  const selectedFolderPath = normalizeMirrorRelPath(args.selectedFolderPath)
  const maxFiles = Math.min(WORKSPACE_DOCS_MIRROR_MAX_FILES, 16)
  const candidates: Array<Promise<WorkspaceDocsMirrorEntry | null>> = []
  for (let i = 0; i < sourceFiles.length && candidates.length < maxFiles; i += 1) {
    const sourceFile = sourceFiles[i]
    if (!sourceFile) continue
    const sourceKind = String(sourceFile.source?.kind || '').trim().toLowerCase()
    if (sourceKind && sourceKind !== 'local') continue
    const sourcePathRaw = String(sourceFile.source?.path || sourceFile.name || '').trim()
    if (isWorkspaceBackedSourcePath(sourcePathRaw)) continue
    const pathCandidate = normalizeSourceFileMirrorPath(sourcePathRaw)
    if (!pathCandidate || !isWorkspaceSourceMirrorFileName(pathCandidate)) continue
    const canonicalCandidates = readCanonicalPathCandidatesForSourcePath(sourcePathRaw)
    const relPath = (() => {
      const fromSourcePath = resolveSelectedFolderRelativeMirrorPath(pathCandidate, selectedFolderPath)
      if (fromSourcePath && isWorkspaceSourceMirrorFileName(fromSourcePath)) return fromSourcePath
      const fallbackCanonical = canonicalCandidates.length > 0 ? String(canonicalCandidates[0] || '') : ''
      const fromCanonical = resolveSelectedFolderRelativeMirrorPath(fallbackCanonical, selectedFolderPath)
      if (fromCanonical && isWorkspaceSourceMirrorFileName(fromCanonical)) return fromCanonical
      return ''
    })()
    if (!relPath) continue
    const updatedAtMsRaw = Number(sourceFile.updatedAtMs)
    const updatedAtMs = Number.isFinite(updatedAtMsRaw) ? Math.floor(updatedAtMsRaw) : Date.now()
    candidates.push((async () => {
      const text = await readFirstAgenticGraphStorageDocText({
        baseUrl: args.baseUrl,
        workspaceId,
        canonicalPathCandidates: canonicalCandidates,
      })
      return text === null ? null : { relPath, text, updatedAtMs }
    })())
  }
  const byRelPath = new Map<string, WorkspaceDocsMirrorEntry>()
  const resolved = await Promise.all(candidates)
  for (let i = 0; i < resolved.length; i += 1) {
    const next = resolved[i]
    if (!next) continue
    const existing = byRelPath.get(next.relPath)
    if (!existing || next.updatedAtMs >= existing.updatedAtMs) {
      byRelPath.set(next.relPath, next)
    }
  }
  return [...byRelPath.values()]
    .sort((a, b) => a.relPath.localeCompare(b.relPath))
}

export const readWorkspaceDocsMirrorEntriesFromAgenticGraphStorageDbCache = async (args: {
  workspaceId: string
  selectedFolderPath: string
}): Promise<WorkspaceDocsMirrorEntry[]> => {
  const workspaceId = String(args.workspaceId || '').trim()
  if (!workspaceId) return []
  try {
    const mod = (await import('@/lib/storage/agentic-graph-storage-db')) as typeof import('@/lib/storage/agentic-graph-storage-db')
    const dbState = await mod.getAgenticGraphStorageDb()
    const documents = await dbState.collections.documents.find({
      selector: {
        workspaceId,
        isDeleted: false,
      },
    }).exec()
    if (!documents || documents.length === 0) return []
    const chunks = await dbState.collections.documentChunks.find({
      selector: { workspaceId },
    }).exec()
    const chunksByDocumentId = new Map<string, MirrorChunk[]>()
    for (let i = 0; i < chunks.length; i += 1) {
      const row = chunks[i]
      if (!row) continue
      const documentId = String(row.get('documentId') || '')
      const markdown = String(row.get('markdown') || '')
      if (!documentId) continue
      const chunkOrderRaw = Number(row.get('chunkOrder'))
      const chunkOrder = Number.isFinite(chunkOrderRaw) ? Math.floor(chunkOrderRaw) : i
      const existing = chunksByDocumentId.get(documentId) || []
      const id = String(row.get('id') || '')
      existing.push({ id, order: chunkOrder, markdown, binaryId: encoder.encode(id) })
      chunksByDocumentId.set(documentId, existing)
    }
    const selectedFolderPath = normalizeMirrorRelPath(args.selectedFolderPath)
    const byRelPath = new Map<string, WorkspaceDocsMirrorEntry>()
    for (let i = 0; i < documents.length; i += 1) {
      const row = documents[i]
      if (!row) continue
      const canonicalPath = normalizeSourceFileMirrorPath(String(row.get('canonicalPath') || ''))
      if (!canonicalPath || !isWorkspaceSourceMirrorFileName(canonicalPath)) continue
      const relPath = resolveSelectedFolderRelativeMirrorPath(canonicalPath, selectedFolderPath)
      if (!relPath || !isWorkspaceSourceMirrorFileName(relPath)) continue
      let text = String(row.get('contentMd') || '')
      if (text.length === 0) {
        const documentId = String(row.get('id') || '')
        text = assembleDocumentText(text, chunksByDocumentId.get(documentId) || [])
      }
      const updatedAtMsRaw = Number(row.get('updatedAtMs'))
      const updatedAtMs = Number.isFinite(updatedAtMsRaw) ? Math.floor(updatedAtMsRaw) : Date.now()
      const next: WorkspaceDocsMirrorEntry = { relPath, text, updatedAtMs }
      const existing = byRelPath.get(relPath)
      if (!existing || next.updatedAtMs >= existing.updatedAtMs) {
        byRelPath.set(relPath, next)
      }
      if (byRelPath.size >= WORKSPACE_DOCS_MIRROR_MAX_FILES) break
    }
    return [...byRelPath.values()].sort((a, b) => a.relPath.localeCompare(b.relPath))
  } catch {
    return []
  }
}
