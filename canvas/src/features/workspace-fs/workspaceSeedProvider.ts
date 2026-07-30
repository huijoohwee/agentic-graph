import { readEnvString } from '@/lib/config.env'
import { buildCodebaseFilePath, buildLocalFsFetchPath } from '@/lib/url'
import { readWorkspaceDocsMirrorRootPathSetting, readWorkspaceImportDefaultSourceUrlSetting } from '@/lib/workspace/workspaceStoreSyncSettings'
import { buildKnowgrphWorkspaceIdFromSourceFilesWorkspaceState } from '@/features/source-files/sourceFilesStorageSync'
import {
  buildKnowgrphStorageExportPath,
  type KnowgrphStorageExportResponse,
} from '@/lib/storage/knowgrphStorageSyncContract'
import { reportRuntimeTrace } from '@/lib/debug/runtimeTrace'
import { readCachedWorkspaceDocsMirrorEntries, readFirstKnowgrphStorageDocText, readWorkspaceDocsMirrorTextViaFetch as readTextViaFetch } from '@/features/workspace-fs/workspaceSeedProviderStorageCache'
import { importNodeFsPromises, importNodePath } from '@/features/workspace-fs/workspaceSeedNodeModules'
import { isWorkspaceDocsMirrorGitHubSourceUrl, readCanonicalPublishedNonAgenticDocsMirrorEntries } from '@/features/workspace-fs/workspaceGithubDocsMirror'
import { isWorkspaceSourceMirrorFileName, shouldEncodeWorkspaceSourceMirrorAsBase64 } from '@/features/workspace-fs/workspaceSourceMirrorFormats'
import { readWorkspaceMirrorRootEntries } from '@/features/workspace-fs/workspaceMirrorRootEntries'
import { resolveWorkspaceDocsMirrorLocalRootRequests } from '@/features/workspace-fs/workspaceDocsMirrorLocalRoots'
import { isWorkspaceRepoLocalRunReadyBootstrap } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { isKnowgrphWorkspaceSeedsPath } from 'grph-shared/collaboration/documentRepositoryAuthority'
import { readKnowgrphWorkspaceSeedsAbsRoot, resolveKnowgrphWorkspaceSeedMirrorAbsolutePath } from './workspaceSeedLocalMirrorAuthority'
import {
  overlayCanonicalLocalWorkspaceSeedEntries,
  type WorkspaceDocsMirrorAuthority,
} from './workspaceSeedInventoryAuthority'
import {
  readWorkspaceDocsMirrorEntriesViaNodeFs,
  WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES,
  WORKSPACE_DOCS_MIRROR_MAX_FILES,
} from './workspaceDocsMirrorNodeReader'
const KG_FS_WRITE_PATH = '/__kg_fs_write', KG_FS_LIST_PATH = '/__kg_fs_list'
const LOCAL_DOCS_MIRROR_CACHE_TTL_MS = 1000, CANONICAL_STORAGE_DOCS_ROOT = 'agentic-canvas-os/docs'
// #region debug-point A:workspace-mirror-bootstrap
const WORKSPACE_MIRROR_TRACE_SCOPE = 'workspace-mirror'
let workspaceMirrorTraceSequence = 0
const configuredDocsMirrorDatasetCache = new Map<string, {
  entries: WorkspaceDocsMirrorEntry[]
  expiresAtMs: number
}>()
const configuredDocsMirrorDatasetInFlight = new Map<string, Promise<WorkspaceDocsMirrorEntry[]>>()
const nextWorkspaceMirrorTraceId = (label: string): string => `${label}:${Date.now()}:${workspaceMirrorTraceSequence += 1}`
const reportWorkspaceMirrorTrace = (args: {
  hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E'
  traceId: string
  location: string
  msg: string
  data?: Record<string, unknown>
}): void => {
  reportRuntimeTrace({
    scope: WORKSPACE_MIRROR_TRACE_SCOPE,
    runId: 'runtime',
    hypothesisId: args.hypothesisId,
    traceId: args.traceId,
    location: args.location,
    msg: args.msg,
    data: args.data || {},
  })
}
// #endregion
const isHiddenDocumentWriteSkipActive = (): boolean => {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}
const cloneWorkspaceDocsMirrorEntries = (
  entries: ReadonlyArray<WorkspaceDocsMirrorEntry>,
): WorkspaceDocsMirrorEntry[] => {
  return (Array.isArray(entries) ? entries : []).map(entry => ({ ...entry }))
}
const readCachedConfiguredDocsMirrorEntries = async (args: {
  cacheKey: string
  load: () => Promise<WorkspaceDocsMirrorEntry[]>
}): Promise<WorkspaceDocsMirrorEntry[]> => {
  const cacheKey = normalizeAbsRoot(args.cacheKey)
  if (!cacheKey) return []
  const now = Date.now()
  const cached = configuredDocsMirrorDatasetCache.get(cacheKey)
  if (cached && cached.expiresAtMs > now) {
    configuredDocsMirrorDatasetCache.delete(cacheKey)
    configuredDocsMirrorDatasetCache.set(cacheKey, cached)
    return cloneWorkspaceDocsMirrorEntries(cached.entries)
  }
  if (cached) configuredDocsMirrorDatasetCache.delete(cacheKey)
  const inFlight = configuredDocsMirrorDatasetInFlight.get(cacheKey)
  if (inFlight) return cloneWorkspaceDocsMirrorEntries(await inFlight)
  const promise = args.load()
  configuredDocsMirrorDatasetInFlight.set(cacheKey, promise)
  try {
    const entries = await promise
    configuredDocsMirrorDatasetCache.set(cacheKey, {
      entries: cloneWorkspaceDocsMirrorEntries(entries),
      expiresAtMs: Date.now() + LOCAL_DOCS_MIRROR_CACHE_TTL_MS,
    })
    return cloneWorkspaceDocsMirrorEntries(entries)
  } finally {
    configuredDocsMirrorDatasetInFlight.delete(cacheKey)
  }
}
const normalizeRelPath = (value: string): string => {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}
const normalizeBasename = (value: string): string => {
  const normalized = normalizeRelPath(value)
  if (!normalized) return ''
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return ''
  return parts[parts.length - 1] || ''
}
const isWorkspaceBackedSourcePath = (value: unknown): boolean => {
  return String(value || '').trim().startsWith('workspace:')
}
const normalizeAbsRoot = (value: string): string => {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
}

const splitSafeMirrorSegments = (value: string): string[] => {
  const parts = normalizeRelPath(value).split('/').filter(Boolean)
  if (parts.some(part => part === '.' || part === '..')) return []
  return parts
}
const readWorkspaceInitializationDocsAbsRoot = (): string => {
  return normalizeAbsRoot(readWorkspaceDocsMirrorRootPathSetting())
}

const AGENTIC_CANVAS_OS_DOCS_REPOSITORY_FOLDER_NAME = 'docs'

const readAbsParentRoot = (absRoot: string): string => {
  const normalized = normalizeAbsRoot(absRoot)
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length <= 1) return ''
  return `/${parts.slice(0, -1).join('/')}`
}

const readWorkspaceInitializationAgenticOsDocsAbsRoot = (): string => {
  const explicit = normalizeAbsRoot(readEnvString('VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT', ''))
  if (explicit) return explicit
  const docsMirrorBaseRoot = readWorkspaceMirrorBaseAbsRoot()
  const repositoryParentRoot = readAbsParentRoot(docsMirrorBaseRoot)
  return repositoryParentRoot ? `${repositoryParentRoot}/agentic-canvas-os/${AGENTIC_CANVAS_OS_DOCS_REPOSITORY_FOLDER_NAME}` : ''
}

const readWorkspaceInitializationOutputDocsAbsRoot = (): string => {
  const docsRoot = readWorkspaceInitializationDocsAbsRoot()
  const parentRoot = readAbsParentRoot(docsRoot)
  return parentRoot ? `${parentRoot}/docs_` : ''
}

const readWorkspaceInitializationChatLogAbsRoot = (): string => {
  const explicit = normalizeAbsRoot(readEnvString('VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT', ''))
  if (explicit) return explicit
  const baseRoot = readWorkspaceMirrorBaseAbsRoot()
  return baseRoot ? `${baseRoot}/chat-log` : ''
}

const readWorkspaceMirrorBaseAbsRoot = (): string => {
  const docsRoot = readWorkspaceInitializationDocsAbsRoot()
  if (!docsRoot) return ''
  const parts = docsRoot.split('/').filter(Boolean)
  if (parts.length <= 1) return ''
  return `/${parts.slice(0, -1).join('/')}`
}

const readWorkspaceInitializationKnowgrphStorageBaseUrl = (): string => {
  return String(readEnvString('VITE_KNOWGRPH_STORAGE_BASE_URL', '') || '').trim()
}

const readWorkspaceDocsMirrorStorageFallbackEnabled = (): boolean => {
  const raw = String(readEnvString('VITE_WORKSPACE_DOCS_MIRROR_STORAGE_FALLBACK_ENABLED', '') || '')
    .trim()
    .toLowerCase()
  if (!raw) return !!readWorkspaceInitializationKnowgrphStorageBaseUrl()
  return !(raw === '0' || raw === 'false' || raw === 'off' || raw === 'no')
}

const encodeArrayBufferToBase64 = (buffer: ArrayBuffer | Uint8Array): string => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const chunkSize = 0x8000
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    chunks.push(String.fromCharCode(...chunk))
  }
  return btoa(chunks.join(''))
}

const readWorkspaceSourceMirrorFileText = async (file: File, name: string): Promise<string> => {
  if (shouldEncodeWorkspaceSourceMirrorAsBase64(name)) {
    return encodeArrayBufferToBase64(await file.arrayBuffer())
  }
  return String(await file.text())
}

const resolveWorkspaceDocsRootFromSourceFilesSelection = async (): Promise<{
  selectedFolderPath: string
  folderName: string | null
  accessMode: string | null
  localMarkdownFolderHandle: FileSystemDirectoryHandle | null
  localMarkdownFolderCacheId: string | null
  sourceFiles: Array<{
    name?: unknown
    text?: unknown
    updatedAtMs?: unknown
    source?: { kind?: unknown; path?: unknown; url?: unknown } | null
  }>
} | null> => {
  if (typeof window === 'undefined') return null
  try {
    const mod = (await import('@/hooks/useGraphStore')) as typeof import('@/hooks/useGraphStore')
    const state = mod.useGraphStore.getState()
    const selectedFolderPath = normalizeSelectedFolderMirrorPath(String(state.localMarkdownSelectedFolderPath || ''))
    return {
      selectedFolderPath,
      folderName: String(state.localMarkdownFolderName || '').trim() || null,
      accessMode: String(state.localMarkdownFolderAccessMode || '').trim() || null,
      localMarkdownFolderHandle: state.localMarkdownFolderHandle || null,
      localMarkdownFolderCacheId: String(state.localMarkdownFolderCacheId || '').trim() || null,
      sourceFiles: Array.isArray(state.sourceFiles) ? state.sourceFiles : [],
    }
  } catch {
    return null
  }
}

const readWorkspaceDocsMirrorEntriesFromKnowgrphStorageExport = async (args: { baseUrl: string; workspaceId: string; selectedFolderPath: string }): Promise<WorkspaceDocsMirrorEntry[]> => {
  const baseUrl = String(args.baseUrl || '').trim()
  const workspaceId = String(args.workspaceId || '').trim()
  const selectedFolderPath = normalizeMirrorRelPath(args.selectedFolderPath)
  if (!baseUrl || !workspaceId) return []
  return readCachedWorkspaceDocsMirrorEntries({ cacheKey: `${baseUrl}|${workspaceId}|${selectedFolderPath}`, load: () => readWorkspaceDocsMirrorEntriesFromKnowgrphStorageExportUncached({ baseUrl, workspaceId, selectedFolderPath }) })
}

const readWorkspaceDocsMirrorEntriesFromKnowgrphStorageExportUncached = async (args: {
  baseUrl: string
  workspaceId: string
  selectedFolderPath: string
}): Promise<WorkspaceDocsMirrorEntry[]> => {
  if (typeof fetch !== 'function') return []
  const baseUrl = String(args.baseUrl || '').trim()
  const workspaceId = String(args.workspaceId || '').trim()
  if (!baseUrl || !workspaceId) return []
  try {
    const docsAbsRoot = readWorkspaceInitializationDocsAbsRoot()
    const exportPath = buildKnowgrphStorageExportPath(workspaceId)
    const requestUrl = (() => {
      if (typeof window !== 'undefined') {
        const host = String(window.location?.hostname || '').trim().toLowerCase()
        const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
        if (isLocalhost && exportPath.startsWith('/api/storage/')) return exportPath
      }
      return new URL(exportPath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString()
    })()
    const response = await fetch(requestUrl, { method: 'GET' })
    if (!response.ok) return []
    const json = (await response.json()) as Partial<KnowgrphStorageExportResponse> & { ok?: boolean }
    if (!json || json.ok !== true || !Array.isArray(json.documents)) return []
    const chunkRows = Array.isArray(json.documentChunks) ? json.documentChunks : []
    const chunksByDocumentId = new Map<string, Array<{ order: number; markdown: string; id: string }>>()
    for (let i = 0; i < chunkRows.length; i += 1) {
      const chunk = chunkRows[i]
      if (!chunk) continue
      const documentId = String(chunk.documentId || '').trim()
      const markdown = String(chunk.markdown || '')
      if (!documentId || !markdown.trim()) continue
      const orderRaw = Number(chunk.chunkOrder)
      const order = Number.isFinite(orderRaw) ? Math.floor(orderRaw) : i
      const id = String(chunk.id || '').trim()
      const existing = chunksByDocumentId.get(documentId) || []
      existing.push({ order, markdown, id })
      chunksByDocumentId.set(documentId, existing)
    }
    const selectedFolderPath = normalizeMirrorRelPath(args.selectedFolderPath)
    const byRelPath = new Map<string, WorkspaceDocsMirrorEntry>()
    for (let i = 0; i < json.documents.length; i += 1) {
      const document = json.documents[i]
      if (!document || document.deleted === true) continue
      let text = String(document.contentMd || '')
      if (!text.trim()) {
        const documentId = String(document.id || '').trim()
        const chunks = (chunksByDocumentId.get(documentId) || []).slice()
          .sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id))
        if (chunks.length > 0) {
          text = chunks.map(chunk => chunk.markdown).join('\n\n')
        }
      }
      const canonicalPathRaw = String(document.canonicalPath || document.title || document.id || '').trim()
      const canonicalPath = normalizeSourceFileMirrorPath(
        docsAbsRoot && canonicalPathRaw.startsWith(`${docsAbsRoot}/`)
          ? canonicalPathRaw.slice(docsAbsRoot.length + 1)
          : canonicalPathRaw,
      )
      if (!canonicalPath) continue
      if (!isWorkspaceSourceMirrorFileName(canonicalPath)) continue
      const relPath = resolveSelectedFolderRelativeMirrorPath(canonicalPath, selectedFolderPath)
      if (!relPath || !isWorkspaceSourceMirrorFileName(relPath)) continue
      const updatedAtMs = Number.isFinite(Number(document.updatedAtMs))
        ? Math.floor(Number(document.updatedAtMs))
        : Date.now()
      const next: WorkspaceDocsMirrorEntry = { relPath, text, updatedAtMs }
      const existing = byRelPath.get(relPath)
      if (!existing || next.updatedAtMs >= existing.updatedAtMs) {
        byRelPath.set(relPath, next)
      }
    }
    return [...byRelPath.values()]
      .sort((a, b) => a.relPath.localeCompare(b.relPath))
      .slice(0, WORKSPACE_DOCS_MIRROR_MAX_FILES)
  } catch {
    return []
  }
}

const readCanonicalPathCandidatesForSourcePath = (sourcePathRaw: string): string[] => {
  const sourcePath = String(sourcePathRaw || '').trim().replace(/\\/g, '/')
  if (!sourcePath) return []
  const withoutWorkspace = sourcePath.startsWith('workspace:') ? sourcePath.slice('workspace:'.length) : sourcePath
  const normalizeCanonicalPath = (value: string): string => {
    let next = normalizeMirrorRelPath(value)
    if (!next) return ''
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

const readWorkspaceDocsMirrorEntriesFromKnowgrphStorageDocsBySourceFiles = async (args: {
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
      const text = await readFirstKnowgrphStorageDocText({
        baseUrl: args.baseUrl,
        workspaceId,
        canonicalPathCandidates: canonicalCandidates,
      })
      return { relPath, text, updatedAtMs }
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

const readWorkspaceDocsMirrorEntriesFromKnowgrphStorageDbCache = async (args: {
  workspaceId: string
  selectedFolderPath: string
}): Promise<WorkspaceDocsMirrorEntry[]> => {
  const workspaceId = String(args.workspaceId || '').trim()
  if (!workspaceId) return []
  try {
    const mod = (await import('@/lib/storage/knowgrphStorageDb')) as typeof import('@/lib/storage/knowgrphStorageDb')
    const dbState = await mod.getKnowgrphStorageDb()
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
    const chunksByDocumentId = new Map<string, Array<{ order: number; markdown: string }>>()
    for (let i = 0; i < chunks.length; i += 1) {
      const row = chunks[i]
      if (!row) continue
      const documentId = String(row.get('documentId') || '').trim()
      const markdown = String(row.get('markdown') || '')
      if (!documentId || !markdown.trim()) continue
      const chunkOrderRaw = Number(row.get('chunkOrder'))
      const chunkOrder = Number.isFinite(chunkOrderRaw) ? Math.floor(chunkOrderRaw) : i
      const existing = chunksByDocumentId.get(documentId) || []
      existing.push({ order: chunkOrder, markdown })
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
      if (!text.trim()) {
        const documentId = String(row.get('id') || '').trim()
        const docChunks = (chunksByDocumentId.get(documentId) || []).slice().sort((a, b) => a.order - b.order)
        if (docChunks.length > 0) {
          text = docChunks.map(chunk => chunk.markdown).join('\n\n')
        }
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

const normalizeSourceFileMirrorPath = (value: unknown): string => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const withoutWorkspacePrefix = raw.startsWith('workspace:') ? raw.slice('workspace:'.length) : raw
  const collapsePrefix = (path: string, prefix: string): string => {
    const normalizedPath = normalizeMirrorRelPath(path)
    const normalizedPrefix = normalizeMirrorRelPath(prefix)
    if (!normalizedPath || !normalizedPrefix) return normalizedPath
    const doubled = `${normalizedPrefix}/${normalizedPrefix}/`
    if (normalizedPath.startsWith(doubled)) {
      return `${normalizedPrefix}/${normalizedPath.slice(doubled.length)}`
    }
    return normalizedPath
  }
  let normalized = normalizeMirrorRelPath(withoutWorkspacePrefix)
  if (!normalized) return ''
  const docsRootMarker = `${CANONICAL_STORAGE_DOCS_ROOT}/`
  const docsRootIndex = normalized.toLowerCase().indexOf(docsRootMarker)
  if (docsRootIndex > 0) {
    normalized = normalized.slice(docsRootIndex)
  }
  if (normalized.toLowerCase().startsWith(`docs/${docsRootMarker}`)) {
    normalized = `${CANONICAL_STORAGE_DOCS_ROOT}/${normalized.slice(`docs/${docsRootMarker}`.length)}`
  }
  normalized = collapsePrefix(normalized, 'docs')
  normalized = collapsePrefix(normalized, CANONICAL_STORAGE_DOCS_ROOT)
  return normalizeMirrorRelPath(normalized)
}

const WORKSPACE_DOCS_MIRROR_ROOT_SEGMENT = 'docs'

const stripWorkspaceDocsMirrorRootPrefix = (path: string): string => {
  const normalized = normalizeMirrorRelPath(path)
  if (!normalized) return ''
  const lowered = normalized.toLowerCase()
  const docsRootMarker = `${CANONICAL_STORAGE_DOCS_ROOT}/`
  if (lowered.startsWith(docsRootMarker)) {
    return normalizeMirrorRelPath(normalized.slice(docsRootMarker.length))
  }
  if (lowered.startsWith(`docs/${docsRootMarker}`)) {
    return normalizeMirrorRelPath(normalized.slice(`docs/${docsRootMarker}`.length))
  }
  const docsRootIndex = lowered.indexOf(`/${docsRootMarker}`)
  if (docsRootIndex >= 0) {
    return normalizeMirrorRelPath(normalized.slice(docsRootIndex + docsRootMarker.length + 1))
  }
  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((part, index) => index > 0 && String(part || '').toLowerCase() === WORKSPACE_DOCS_MIRROR_ROOT_SEGMENT)) return ''
  let start = 0; while (start < parts.length && String(parts[start] || '').toLowerCase() === WORKSPACE_DOCS_MIRROR_ROOT_SEGMENT) {
    start += 1
  }
  if (start === 0) return normalized
  return normalizeMirrorRelPath(parts.slice(start).join('/'))
}

const resolveSelectedFolderRelativeMirrorPath = (fullPath: string, selectedFolderPath: string): string => {
  const normalizedFullPath = normalizeSourceFileMirrorPath(fullPath)
  const normalizedSelectedFolderPath = normalizeSelectedFolderMirrorPath(selectedFolderPath)
  if (!normalizedFullPath) return ''
  if (!normalizedSelectedFolderPath) {
    const trimmed = stripWorkspaceDocsMirrorRootPrefix(normalizedFullPath)
    return trimmed
  }
  if (normalizedFullPath === normalizedSelectedFolderPath) return ''
  const prefix = `${normalizedSelectedFolderPath}/`
  if (normalizedFullPath.startsWith(prefix)) {
    return stripWorkspaceDocsMirrorRootPrefix(normalizedFullPath.slice(prefix.length))
  }
  const nestedPrefix = `${normalizedSelectedFolderPath}/`
  const nestedIndex = normalizedFullPath.indexOf(nestedPrefix)
  if (nestedIndex >= 0) {
    return stripWorkspaceDocsMirrorRootPrefix(normalizedFullPath.slice(nestedIndex + nestedPrefix.length))
  }
  const selectedParts = normalizedSelectedFolderPath.split('/').filter(Boolean)
  const selectedLeaf = selectedParts.length > 0 ? String(selectedParts[selectedParts.length - 1] || '').toLowerCase() : ''
  if (selectedLeaf) {
    const fullLower = normalizedFullPath.toLowerCase()
    if (fullLower === selectedLeaf) return ''
    if (fullLower.startsWith(`${selectedLeaf}/`)) {
      return stripWorkspaceDocsMirrorRootPrefix(normalizedFullPath.slice(selectedLeaf.length + 1))
    }
  }
  if (!normalizedFullPath.includes('/')) {
    return stripWorkspaceDocsMirrorRootPrefix(normalizedFullPath)
  }
  if (normalizedFullPath.endsWith(`/${normalizedSelectedFolderPath}`)) return ''
  return ''
}

const readWorkspaceDocsMirrorEntriesFromSourceFilesRecords = (args: {
  sourceFiles: Array<{
    name?: unknown
    text?: unknown
    updatedAtMs?: unknown
    source?: { kind?: unknown; path?: unknown; url?: unknown } | null
  }>
  selectedFolderPath: string
}): WorkspaceDocsMirrorEntry[] => {
  const sourceFiles = Array.isArray(args.sourceFiles) ? args.sourceFiles : []
  if (sourceFiles.length === 0) return []
  const selectedFolderPath = normalizeMirrorRelPath(args.selectedFolderPath)
  const byRelPath = new Map<string, WorkspaceDocsMirrorEntry>()
  for (let i = 0; i < sourceFiles.length; i += 1) {
    const sourceFile = sourceFiles[i]
    if (!sourceFile) continue
    const sourceKind = String(sourceFile.source?.kind || '').trim().toLowerCase()
    if (sourceKind && sourceKind !== 'local') continue
    if (isWorkspaceBackedSourcePath(sourceFile.source?.path || sourceFile.name || '')) continue
    const text = String(sourceFile.text ?? '')
    const pathCandidate = normalizeSourceFileMirrorPath(sourceFile.source?.path || sourceFile.name || '')
    if (!pathCandidate) continue
    if (!isWorkspaceSourceMirrorFileName(pathCandidate)) continue
    const relPath = resolveSelectedFolderRelativeMirrorPath(pathCandidate, selectedFolderPath)
    if (!relPath || !isWorkspaceSourceMirrorFileName(relPath)) continue
    const updatedAtMsRaw = Number(sourceFile.updatedAtMs)
    const updatedAtMs = Number.isFinite(updatedAtMsRaw) ? Math.floor(updatedAtMsRaw) : Date.now()
    const next: WorkspaceDocsMirrorEntry = { relPath, text, updatedAtMs }
    const existing = byRelPath.get(relPath)
    if (!existing || next.updatedAtMs >= existing.updatedAtMs) {
      byRelPath.set(relPath, next)
    }
    if (byRelPath.size >= WORKSPACE_DOCS_MIRROR_MAX_FILES) break
  }
  return [...byRelPath.values()]
    .sort((a, b) => a.relPath.localeCompare(b.relPath))
    .slice(0, WORKSPACE_DOCS_MIRROR_MAX_FILES)
}

const hasIncompleteSourceFilesMirrorText = (args: {
  sourceFiles: Array<{
    name?: unknown
    text?: unknown
    source?: { kind?: unknown; path?: unknown } | null
  }>
  selectedFolderPath: string
}): boolean => {
  const sourceFiles = Array.isArray(args.sourceFiles) ? args.sourceFiles : []
  if (sourceFiles.length === 0) return false
  const selectedFolderPath = normalizeMirrorRelPath(args.selectedFolderPath)
  for (let i = 0; i < sourceFiles.length; i += 1) {
    const sourceFile = sourceFiles[i]
    if (!sourceFile) continue
    const sourceKind = String(sourceFile.source?.kind || '').trim().toLowerCase()
    if (sourceKind && sourceKind !== 'local') continue
    if (isWorkspaceBackedSourcePath(sourceFile.source?.path || sourceFile.name || '')) continue
    const pathCandidate = normalizeSourceFileMirrorPath(sourceFile.source?.path || sourceFile.name || '')
    if (!pathCandidate) continue
    if (!isWorkspaceSourceMirrorFileName(pathCandidate)) continue
    const relPath = resolveSelectedFolderRelativeMirrorPath(pathCandidate, selectedFolderPath)
    if (!relPath || !isWorkspaceSourceMirrorFileName(relPath)) continue
    const text = String(sourceFile.text || '')
    if (!text.trim()) return true
  }
  return false
}

const readWorkspaceDocsMirrorEntriesFromSourceFilesRecordsHydrated = async (args: {
  sourceFiles: Array<{
    name?: unknown
    text?: unknown
    updatedAtMs?: unknown
    source?: { kind?: unknown; path?: unknown; url?: unknown } | null
  }>
  selectedFolderPath: string
  storageDocFallback?: {
    baseUrl: string
    workspaceId: string
  } | null
}): Promise<WorkspaceDocsMirrorEntry[]> => {
  const sourceFiles = Array.isArray(args.sourceFiles) ? args.sourceFiles : []
  if (sourceFiles.length === 0) return []
  const docsAbsRoot = readWorkspaceInitializationDocsAbsRoot()
  const selectedFolderPath = normalizeMirrorRelPath(args.selectedFolderPath)
  const selectedFolderAbsRoot = normalizeAbsRoot(args.selectedFolderPath)
  const fallbackWorkspaceId = String(args.storageDocFallback?.workspaceId || '').trim(), fallbackBaseUrl = String(args.storageDocFallback?.baseUrl || '').trim()
  const storageFallbackConfigured = !!(fallbackWorkspaceId && fallbackBaseUrl)
  const buildLocalFsHydrationCandidates = (value: string): string[] => {
    const raw = String(value || '').trim()
    if (!raw) return []
    const withoutWorkspacePrefix = raw.startsWith('workspace:') ? raw.slice('workspace:'.length) : raw
    const normalized = normalizeMirrorRelPath(withoutWorkspacePrefix)
    const out = new Set<string>()
    const push = (candidate: string) => {
      const next = normalizeAbsRoot(candidate)
      if (!next) return
      out.add(next)
    }
    if (withoutWorkspacePrefix.startsWith('/')) {
      push(withoutWorkspacePrefix)
      return [...out]
    }
    if (docsAbsRoot) {
      push(`${docsAbsRoot}/${normalized}`)
      if (normalized.startsWith('docs/')) push(`${docsAbsRoot}/${normalized.slice('docs/'.length)}`)
    }
    if (selectedFolderAbsRoot && selectedFolderAbsRoot.startsWith('/')) {
      push(`${selectedFolderAbsRoot}/${normalized}`)
      if (normalized.startsWith('docs/')) push(`${selectedFolderAbsRoot}/${normalized.slice('docs/'.length)}`)
    }
    return [...out]
  }
  const readFirstLocalFsMirrorText = async (sourcePathRaw: string): Promise<string> => {
    const fsCandidates = buildLocalFsHydrationCandidates(sourcePathRaw)
    for (let c = 0; c < fsCandidates.length; c += 1) {
      const localFsUrl = buildLocalFsFetchPath(fsCandidates[c]!)
      if (!localFsUrl) continue
      const hydrated = await readTextViaFetch(localFsUrl)
      if (hydrated?.trim()) return hydrated
    }
    return ''
  }
  const candidates: Array<Promise<WorkspaceDocsMirrorEntry | null>> = []
  for (let i = 0; i < sourceFiles.length && candidates.length < WORKSPACE_DOCS_MIRROR_MAX_FILES; i += 1) {
    const sourceFile = sourceFiles[i]
    if (!sourceFile) continue
    const sourceKind = String(sourceFile.source?.kind || '').trim().toLowerCase()
    if (sourceKind && sourceKind !== 'local') continue
    const sourcePathRaw = String(sourceFile.source?.path || sourceFile.name || '').trim()
    if (isWorkspaceBackedSourcePath(sourcePathRaw)) continue
    const pathCandidate = normalizeSourceFileMirrorPath(sourcePathRaw)
    if (!pathCandidate) continue
    if (!isWorkspaceSourceMirrorFileName(pathCandidate)) continue
    const relPath = resolveSelectedFolderRelativeMirrorPath(pathCandidate, selectedFolderPath)
    if (!relPath || !isWorkspaceSourceMirrorFileName(relPath)) continue

    let text = String(sourceFile.text || '')
    const updatedAtMsRaw = Number(sourceFile.updatedAtMs)
    const updatedAtMs = Number.isFinite(updatedAtMsRaw) ? Math.floor(updatedAtMsRaw) : Date.now()
    candidates.push((async () => {
      if (!text.trim()) {
        text = await readFirstLocalFsMirrorText(sourcePathRaw)
        if (!text.trim() && storageFallbackConfigured) {
          text = await readFirstKnowgrphStorageDocText({
            baseUrl: fallbackBaseUrl,
            workspaceId: fallbackWorkspaceId,
            canonicalPathCandidates: readCanonicalPathCandidatesForSourcePath(sourcePathRaw),
          })
        }
      }
      return { relPath, text, updatedAtMs }
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
    .slice(0, WORKSPACE_DOCS_MIRROR_MAX_FILES)
}

const iterDirectoryEntries = (handle: FileSystemDirectoryHandle): AsyncIterable<[string, FileSystemHandle]> => {
  const h = handle as unknown as { entries?: () => AsyncIterable<[string, FileSystemHandle]> }
  if (typeof h.entries === 'function') return h.entries()
  const v = handle as unknown as { values?: () => AsyncIterable<FileSystemHandle> }
  if (typeof v.values === 'function') {
    const values = v.values()
    return (async function* () {
      for await (const entry of values) {
        const name = String((entry as unknown as { name?: unknown }).name || '')
        yield [name, entry]
      }
    })()
  }
  return (async function* () {})()
}

const readWorkspaceDocsMirrorEntriesFromLocalFolderHandle = async (args: {
  rootHandle: FileSystemDirectoryHandle
  selectedFolderPath: string
}): Promise<WorkspaceDocsMirrorEntry[]> => {
  let root = args.rootHandle
  const selectedFolderPath = normalizeMirrorRelPath(args.selectedFolderPath)
  const selectedFolderPathCandidates = selectedFolderPath ? (selectedFolderPath.toLowerCase().startsWith('docs/') ? [selectedFolderPath] : [selectedFolderPath, `docs/${selectedFolderPath}`]) : []
  for (let c = 0; c < selectedFolderPathCandidates.length; c += 1) {
    let candidateRoot = args.rootHandle
    try {
      const parts = selectedFolderPathCandidates[c]!.split('/').filter(Boolean)
      for (let i = 0; i < parts.length; i += 1) candidateRoot = await candidateRoot.getDirectoryHandle(parts[i]!)
      root = candidateRoot
      break
    } catch {
      if (c === selectedFolderPathCandidates.length - 1) return []
    }
  }
  const out: WorkspaceDocsMirrorEntry[] = []
  const stack: Array<{ handle: FileSystemDirectoryHandle; relBase: string }> = [{ handle: root, relBase: '' }]
  while (stack.length > 0 && out.length < WORKSPACE_DOCS_MIRROR_MAX_FILES) {
    const next = stack.pop()
    if (!next) break
    const { handle, relBase } = next
    for await (const [entryName, entry] of iterDirectoryEntries(handle)) {
      if (out.length >= WORKSPACE_DOCS_MIRROR_MAX_FILES) break
      const name = String(entryName || '').trim()
      if (!name || name.startsWith('.')) continue
      if (entry.kind === 'directory') {
        const rel = relBase ? `${relBase}/${name}` : name
        stack.push({ handle: entry as FileSystemDirectoryHandle, relBase: rel })
        continue
      }
      if (entry.kind !== 'file') continue
      if (!isWorkspaceSourceMirrorFileName(name)) continue
      try {
        const file = await (entry as FileSystemFileHandle).getFile()
        if (!file || !Number.isFinite(file.size) || file.size > WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES) continue
        const text = await readWorkspaceSourceMirrorFileText(file, name)
        const relPath = normalizeMirrorRelPath(relBase ? `${relBase}/${name}` : name)
        if (!relPath) continue
        out.push({
          relPath,
          text,
          updatedAtMs: Number.isFinite(file.lastModified) ? Math.floor(file.lastModified) : Date.now(),
        })
      } catch {
        void 0
      }
    }
  }
  return out
}

const readWorkspaceDocsMirrorEntriesFromLocalFolderCache = async (args: {
  folderCacheId: string
  selectedFolderPath: string
}): Promise<WorkspaceDocsMirrorEntry[]> => {
  const folderCacheId = String(args.folderCacheId || '').trim()
  if (!folderCacheId) return []
  try {
    const cache = (await import('@/features/source-files/markdownFsCache')) as typeof import('@/features/source-files/markdownFsCache')
    const selectedFolderPath = normalizeMirrorRelPath(args.selectedFolderPath)
    const prefix = selectedFolderPath ? `${selectedFolderPath}/` : ''
    const paths = await cache.listCachedMarkdownPaths(folderCacheId)
    const candidates = paths
      .map(path => normalizeMirrorRelPath(path))
      .filter(Boolean)
      .filter(path => (!prefix ? true : path === selectedFolderPath || path.startsWith(prefix)))
      .filter(path => isWorkspaceSourceMirrorFileName(path))
      .slice(0, WORKSPACE_DOCS_MIRROR_MAX_FILES)
    const out: WorkspaceDocsMirrorEntry[] = []
    for (let i = 0; i < candidates.length; i += 1) {
      const fullPath = candidates[i]!
      const text = await cache.readCachedMarkdownText(folderCacheId, fullPath)
      if (typeof text !== 'string') continue
      const relPath = selectedFolderPath
        ? normalizeMirrorRelPath(fullPath.slice(selectedFolderPath.length).replace(/^\/+/, ''))
        : fullPath
      if (!relPath) continue
      out.push({
        relPath,
        text,
        updatedAtMs: Date.now(),
      })
    }
    return out
  } catch {
    return []
  }
}

const buildWorkspaceSeedAbsolutePathCandidates = (args: {
  basename: string
  relPathCandidates: ReadonlyArray<string>
}): string[] => {
  const root = readWorkspaceInitializationDocsAbsRoot()
  if (!root) return []
  const basename = normalizeBasename(args.basename)
  const relPathCandidates = Array.from(
    new Set((args.relPathCandidates || []).map(path => normalizeRelPath(path)).filter(Boolean)),
  )
  const out = new Set<string>()
  for (let i = 0; i < relPathCandidates.length; i += 1) {
    const relPath = relPathCandidates[i]!
    if (isKnowgrphWorkspaceSeedsPath(relPath)) {
      const seedsRoot = readKnowgrphWorkspaceSeedsAbsRoot()
      const seedRelPath = normalizeRelPath(relPath).replace(/^docs\/workspace-seeds\/?/, '')
      if (seedsRoot && seedRelPath) out.add(`${seedsRoot}/${seedRelPath}`)
      continue
    }
    out.add(`${root}/${relPath}`)
    if (relPath.startsWith('docs/')) {
      out.add(`${root}/${relPath.slice('docs/'.length)}`)
    }
  }
  if (basename) out.add(`${root}/${basename}`)
  return [...out]
}

const readTextViaNodeFs = async (absolutePath: string): Promise<string | null> => {
  if (typeof window !== 'undefined') return null
  try {
    const fs = await importNodeFsPromises()
    const text = String(await fs.readFile(absolutePath, 'utf8')).trim()
    return text || null
  } catch {
    return null
  }
}

const isLikelyHtmlDocumentText = (text: string): boolean => {
  const head = String(text || '').trim().slice(0, 512).toLowerCase()
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.includes('<html ')
}

const readSeedTextViaFetch = async (url: string): Promise<string | null> => {
  const text = await readTextViaFetch(url)
  if (!text || isLikelyHtmlDocumentText(text)) return null
  return text
}

const buildPublishedSeedRelPath = (relPath: string): string => {
  const normalized = normalizeRelPath(relPath)
  if (!normalized || !normalized.startsWith('docs/')) return ''
  return `/${normalized}`
}

const writeTextViaLocalFsProxy = async (absolutePath: string, text: string, workspacePath?: string): Promise<boolean> => {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return false
  if (isHiddenDocumentWriteSkipActive()) return false
  const traceId = nextWorkspaceMirrorTraceId('write-text')
  try {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      // #region debug-point D:fs-write-timeout
      reportWorkspaceMirrorTrace({
        hypothesisId: 'D',
        traceId,
        location: 'workspaceSeedProvider.ts:writeTextViaLocalFsProxy.timeout',
        msg: '__kg_fs_write text request timeout fired abort controller',
        data: { absolutePath, textLength: String(text ?? '').length },
      })
      // #endregion
      try {
        controller.abort()
      } catch {
        void 0
      }
    }, 5000)
    try {
      // #region debug-point A:fs-write-start
      reportWorkspaceMirrorTrace({
        hypothesisId: 'A',
        traceId,
        location: 'workspaceSeedProvider.ts:writeTextViaLocalFsProxy.fetch',
        msg: '__kg_fs_write text request started',
        data: { absolutePath, textLength: String(text ?? '').length },
      })
      // #endregion
      const response = await fetch(KG_FS_WRITE_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: absolutePath,
          text: String(text ?? ''),
          ...(workspacePath ? { workspacePath } : {}),
        }),
        signal: controller.signal,
      })
      // #region debug-point B:fs-write-response
      reportWorkspaceMirrorTrace({
        hypothesisId: 'B',
        traceId,
        location: 'workspaceSeedProvider.ts:writeTextViaLocalFsProxy.response',
        msg: '__kg_fs_write text request settled',
        data: { absolutePath, ok: response.ok, status: response.status },
      })
      // #endregion
      return response.ok
    } finally {
      window.clearTimeout(timeoutId)
    }
  } catch (error) {
    // #region debug-point C:fs-write-catch
    reportWorkspaceMirrorTrace({
      hypothesisId: 'C',
      traceId,
      location: 'workspaceSeedProvider.ts:writeTextViaLocalFsProxy.catch',
      msg: '__kg_fs_write text request threw',
      data: {
        absolutePath,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error ?? ''),
        aborted: error instanceof DOMException ? error.name === 'AbortError' : false,
      },
    })
    // #endregion
    return false
  }
}

const writeBytesViaLocalFsProxy = async (absolutePath: string, bytes: ArrayBuffer | Uint8Array): Promise<boolean> => {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return false
  if (isHiddenDocumentWriteSkipActive()) return false
  const traceId = nextWorkspaceMirrorTraceId('write-bytes')
  try {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      // #region debug-point D:fs-bytes-timeout
      reportWorkspaceMirrorTrace({
        hypothesisId: 'D',
        traceId,
        location: 'workspaceSeedProvider.ts:writeBytesViaLocalFsProxy.timeout',
        msg: '__kg_fs_write bytes request timeout fired abort controller',
        data: { absolutePath, byteLength: bytes instanceof Uint8Array ? bytes.byteLength : bytes.byteLength || 0 },
      })
      // #endregion
      try {
        controller.abort()
      } catch {
        void 0
      }
    }, 5000)
    try {
      // #region debug-point A:fs-bytes-start
      reportWorkspaceMirrorTrace({
        hypothesisId: 'A',
        traceId,
        location: 'workspaceSeedProvider.ts:writeBytesViaLocalFsProxy.fetch',
        msg: '__kg_fs_write bytes request started',
        data: { absolutePath, byteLength: bytes instanceof Uint8Array ? bytes.byteLength : bytes.byteLength || 0 },
      })
      // #endregion
      const response = await fetch(KG_FS_WRITE_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: absolutePath,
          base64: encodeArrayBufferToBase64(bytes),
          encoding: 'base64',
        }),
        signal: controller.signal,
      })
      // #region debug-point B:fs-bytes-response
      reportWorkspaceMirrorTrace({
        hypothesisId: 'B',
        traceId,
        location: 'workspaceSeedProvider.ts:writeBytesViaLocalFsProxy.response',
        msg: '__kg_fs_write bytes request settled',
        data: { absolutePath, ok: response.ok, status: response.status },
      })
      // #endregion
      return response.ok
    } finally {
      window.clearTimeout(timeoutId)
    }
  } catch (error) {
    // #region debug-point C:fs-bytes-catch
    reportWorkspaceMirrorTrace({
      hypothesisId: 'C',
      traceId,
      location: 'workspaceSeedProvider.ts:writeBytesViaLocalFsProxy.catch',
      msg: '__kg_fs_write bytes request threw',
      data: {
        absolutePath,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error ?? ''),
        aborted: error instanceof DOMException ? error.name === 'AbortError' : false,
      },
    })
    // #endregion
    return false
  }
}

const readExistingMirrorText = async (absolutePath: string): Promise<string | null> => {
  const absoluteViaFetch = buildLocalFsFetchPath(absolutePath)
  if (absoluteViaFetch) {
    const text = await readTextViaFetch(absoluteViaFetch)
    if (text) return text
  }
  return readTextViaNodeFs(absolutePath)
}

const normalizeMirrorTextForNoopComparison = (value: string): string =>
  String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '')

const shouldSkipEquivalentMirrorWrite = async (args: {
  absolutePath: string
  text: string
}): Promise<boolean> => {
  const existing = await readExistingMirrorText(args.absolutePath)
  if (existing == null) return false
  const next = String(args.text ?? '')
  if (existing === next) return true
  return normalizeMirrorTextForNoopComparison(existing) === normalizeMirrorTextForNoopComparison(next)
}

const shouldBlockBlankMirrorOverwrite = async (args: {
  absolutePath: string
  text: string
  allowBlankText?: boolean
}): Promise<boolean> => {
  if (args.allowBlankText === true) return false
  if (String(args.text || '').trim()) return false
  const existing = await readExistingMirrorText(args.absolutePath)
  return !!String(existing || '').trim()
}

const shouldBlockDuplicateMirrorDocumentOverwrite = async (args: {
  workspacePath: string
  text: string
  allowCrossDocumentOverwrite?: boolean
}): Promise<boolean> => {
  if (args.allowCrossDocumentOverwrite === true) return false
  const nextText = String(args.text || '').trim()
  if (!nextText) return false
  const targetRelPath = normalizeMirrorRelPath(String(args.workspacePath || '').replace(/^\/?docs\/?/, ''))
  if (!targetRelPath) return false
  try {
    const entries = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i]
      if (!entry) continue
      const relPath = normalizeMirrorRelPath(String(entry.relPath || ''))
      if (!relPath || relPath === targetRelPath) continue
      if (String(entry.text || '').trim() === nextText) return true
    }
  } catch {
    return false
  }
  return false
}

const ensureFolderViaLocalFsProxy = async (absolutePath: string, workspacePath?: string): Promise<boolean> => {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return false
  if (isHiddenDocumentWriteSkipActive()) return false
  const traceId = nextWorkspaceMirrorTraceId('mkdir')
  try {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      // #region debug-point D:fs-mkdir-timeout
      reportWorkspaceMirrorTrace({
        hypothesisId: 'D',
        traceId,
        location: 'workspaceSeedProvider.ts:ensureFolderViaLocalFsProxy.timeout',
        msg: '__kg_fs_write mkdir request timeout fired abort controller',
        data: { absolutePath },
      })
      // #endregion
      try {
        controller.abort()
      } catch {
        void 0
      }
    }, 5000)
    try {
      // #region debug-point A:fs-mkdir-start
      reportWorkspaceMirrorTrace({
        hypothesisId: 'A',
        traceId,
        location: 'workspaceSeedProvider.ts:ensureFolderViaLocalFsProxy.fetch',
        msg: '__kg_fs_write mkdir request started',
        data: { absolutePath },
      })
      // #endregion
      const response = await fetch(KG_FS_WRITE_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: absolutePath,
          mkdirOnly: true,
          ...(workspacePath ? { workspacePath } : {}),
        }),
        signal: controller.signal,
      })
      // #region debug-point B:fs-mkdir-response
      reportWorkspaceMirrorTrace({
        hypothesisId: 'B',
        traceId,
        location: 'workspaceSeedProvider.ts:ensureFolderViaLocalFsProxy.response',
        msg: '__kg_fs_write mkdir request settled',
        data: { absolutePath, ok: response.ok, status: response.status },
      })
      // #endregion
      return response.ok
    } finally {
      window.clearTimeout(timeoutId)
    }
  } catch (error) {
    // #region debug-point C:fs-mkdir-catch
    reportWorkspaceMirrorTrace({
      hypothesisId: 'C',
      traceId,
      location: 'workspaceSeedProvider.ts:ensureFolderViaLocalFsProxy.catch',
      msg: '__kg_fs_write mkdir request threw',
      data: {
        absolutePath,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error ?? ''),
        aborted: error instanceof DOMException ? error.name === 'AbortError' : false,
      },
    })
    // #endregion
    return false
  }
}

const resolveWorkspaceDocsMirrorAbsolutePath = (workspacePath: string): string | null => {
  const parts = splitSafeMirrorSegments(String(workspacePath || '').trim())
  if (parts.length === 0) return null
  const canonicalSeedPath = resolveKnowgrphWorkspaceSeedMirrorAbsolutePath(workspacePath)
  if (canonicalSeedPath) return canonicalSeedPath
  const rootSegment = String(parts[0] || '').trim()
  if (!rootSegment) return null
  const docsRoot = readWorkspaceInitializationDocsAbsRoot()
  const chatLogRoot = readWorkspaceInitializationChatLogAbsRoot()
  const baseRoot = readWorkspaceMirrorBaseAbsRoot()
  const loweredRootSegment = rootSegment.toLowerCase()
  const root = loweredRootSegment === 'docs'
    ? docsRoot
    : loweredRootSegment === 'chat-log'
      ? chatLogRoot
      : baseRoot
        ? `${baseRoot}/${rootSegment}`
        : ''
  if (!root) return null
  const relPath = normalizeMirrorRelPath(parts.slice(1).join('/'))
  if (!relPath) return root
  return `${root}/${relPath}`
}

export async function readWorkspaceInitializationSeedText(args: {
  basename: string
  relPathCandidates: ReadonlyArray<string>
}): Promise<string | null> {
  const basename = normalizeBasename(args.basename)
  if (!basename) return null

  const absolutePathCandidates = buildWorkspaceSeedAbsolutePathCandidates({
    basename,
    relPathCandidates: args.relPathCandidates,
  })
  for (let i = 0; i < absolutePathCandidates.length; i += 1) {
    const absolutePath = absolutePathCandidates[i]!
    const absoluteViaFetch = buildLocalFsFetchPath(absolutePath)
    if (absoluteViaFetch) {
      const text = await readSeedTextViaFetch(absoluteViaFetch)
      if (text) return text
    }
    const text = await readTextViaNodeFs(absolutePath)
    if (text) return text
  }

  const relCandidates = Array.from(
    new Set((args.relPathCandidates || []).map(path => normalizeRelPath(path)).filter(Boolean)),
  )
  for (let i = 0; i < relCandidates.length; i += 1) {
    const publishedPath = buildPublishedSeedRelPath(relCandidates[i]!)
    if (publishedPath) {
      const text = await readSeedTextViaFetch(publishedPath)
      if (text) return text
    }
    const text = await readSeedTextViaFetch(buildCodebaseFilePath(relCandidates[i]!))
    if (text) return text
  }
  return null
}

const normalizeMirrorRelPath = (value: string): string => {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

const normalizeSelectedFolderMirrorPath = (value: string): string => {
  const normalized = normalizeMirrorRelPath(value)
  if (!normalized) return ''
  const asFolder = (() => {
    const markdownLikeExt = /\.(md|markdown|mdx|mmd)$/i
    if (!markdownLikeExt.test(normalized)) return normalized
    const parts = normalized.split('/').filter(Boolean)
    if (parts.length <= 1) return ''
    return normalizeMirrorRelPath(parts.slice(0, -1).join('/'))
  })()
  const lower = asFolder.toLowerCase()
  const docsRootPrefix = `${CANONICAL_STORAGE_DOCS_ROOT}/`
  const docsRootIndex = lower.indexOf(docsRootPrefix)
  if (docsRootIndex >= 0) {
    return normalizeMirrorRelPath(asFolder.slice(docsRootIndex + docsRootPrefix.length))
  }
  if (lower === 'docs' || lower.endsWith('/docs')) return ''
  if (lower.startsWith('docs/')) return normalizeMirrorRelPath(asFolder.slice('docs/'.length))
  const parts = asFolder.split('/').filter(Boolean)
  let docsIndex = -1
  for (let i = 0; i < parts.length; i += 1) {
    if (String(parts[i] || '').toLowerCase() === 'docs') docsIndex = i
  }
  if (docsIndex >= 0) {
    return normalizeMirrorRelPath(parts.slice(docsIndex + 1).join('/'))
  }
  return asFolder
}

export type WorkspaceDocsMirrorEntry = {
  relPath: string
  text: string
  updatedAtMs: number
  authority?: WorkspaceDocsMirrorAuthority
}

const readWorkspaceDocsMirrorDatasetScore = (entries: ReadonlyArray<WorkspaceDocsMirrorEntry>): number => {
  const list = Array.isArray(entries) ? entries : []
  if (list.length === 0) return 0
  let totalChars = 0
  for (let i = 0; i < list.length; i += 1) {
    totalChars += String(list[i]?.text || '').trim().length
  }
  return (list.length * 1_000_000) + totalChars
}

const chooseBestWorkspaceDocsMirrorDataset = (
  datasets: ReadonlyArray<ReadonlyArray<WorkspaceDocsMirrorEntry>>,
): WorkspaceDocsMirrorEntry[] => {
  let best: WorkspaceDocsMirrorEntry[] = []
  let bestScore = 0
  for (let i = 0; i < datasets.length; i += 1) {
    const candidate = Array.isArray(datasets[i]) ? datasets[i] as WorkspaceDocsMirrorEntry[] : []
    const score = readWorkspaceDocsMirrorDatasetScore(candidate)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best
}

export const readCanonicalLocalWorkspaceSeedMirrorEntries = async (): Promise<WorkspaceDocsMirrorEntry[]> => {
  const absRoot = readKnowgrphWorkspaceSeedsAbsRoot()
  if (!absRoot) return []
  const entries = await readWorkspaceMirrorRootEntries({
    absRoot,
    workspaceRootName: 'workspace-seeds',
    readViaProxy: readWorkspaceDocsMirrorEntriesViaProxy,
    readViaNodeFs: readWorkspaceDocsMirrorEntriesViaNodeFs,
  })
  return entries.map(entry => ({
    ...entry,
    authority: 'knowgrph-workspace-seeds-local',
  }))
}

const readWorkspaceDocsMirrorEntriesViaProxy = async (
  docsAbsRoot: string,
): Promise<WorkspaceDocsMirrorEntry[]> => {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return []
  return readCachedConfiguredDocsMirrorEntries({
    cacheKey: docsAbsRoot,
    load: async () => {
      const traceId = nextWorkspaceMirrorTraceId('proxy')
      const startedAtMs = Date.now()
      // #region debug-point B:workspace-mirror-proxy-start
      reportWorkspaceMirrorTrace({
        hypothesisId: 'B',
        traceId,
        location: 'workspaceSeedProvider.ts:readWorkspaceDocsMirrorEntriesViaProxy:start',
        msg: 'workspace docs mirror proxy request started',
        data: {
          docsAbsRoot,
          maxFiles: WORKSPACE_DOCS_MIRROR_MAX_FILES,
        },
      })
      // #endregion
      try {
        const response = await fetch(KG_FS_LIST_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            path: docsAbsRoot,
            maxFiles: WORKSPACE_DOCS_MIRROR_MAX_FILES,
          }),
        })
        if (!response.ok) {
          // #region debug-point C:workspace-mirror-proxy-non-ok
          reportWorkspaceMirrorTrace({
            hypothesisId: 'C',
            traceId,
            location: 'workspaceSeedProvider.ts:readWorkspaceDocsMirrorEntriesViaProxy:non-ok',
            msg: 'workspace docs mirror proxy request returned non-ok status',
            data: {
              docsAbsRoot,
              status: response.status,
              durationMs: Date.now() - startedAtMs,
            },
          })
          // #endregion
          return []
        }
        const json = (await response.json()) as {
          ok?: boolean
          files?: Array<{ relPath?: unknown; text?: unknown; updatedAtMs?: unknown }>
        }
        if (json.ok !== true || !Array.isArray(json.files)) {
          // #region debug-point C:workspace-mirror-proxy-invalid-json
          reportWorkspaceMirrorTrace({
            hypothesisId: 'C',
            traceId,
            location: 'workspaceSeedProvider.ts:readWorkspaceDocsMirrorEntriesViaProxy:invalid-json',
            msg: 'workspace docs mirror proxy request returned an invalid payload',
            data: {
              docsAbsRoot,
              ok: json.ok === true,
              hasFilesArray: Array.isArray(json.files),
              durationMs: Date.now() - startedAtMs,
            },
          })
          // #endregion
          return []
        }
        const out: WorkspaceDocsMirrorEntry[] = []
        for (let i = 0; i < json.files.length; i += 1) {
          const item = json.files[i]
          const relPath = normalizeMirrorRelPath(String(item?.relPath || ''))
          if (!relPath) continue
          const text = typeof item?.text === 'string' ? item.text : ''
          out.push({
            relPath,
            text,
            updatedAtMs: Number.isFinite(Number(item?.updatedAtMs)) ? Math.floor(Number(item?.updatedAtMs)) : Date.now(),
          })
        }
        // #region debug-point D:workspace-mirror-proxy-success
        reportWorkspaceMirrorTrace({
          hypothesisId: 'D',
          traceId,
          location: 'workspaceSeedProvider.ts:readWorkspaceDocsMirrorEntriesViaProxy:success',
          msg: 'workspace docs mirror proxy request completed',
          data: {
            docsAbsRoot,
            fileCount: out.length,
            durationMs: Date.now() - startedAtMs,
          },
        })
        // #endregion
        return out
      } catch (error: unknown) {
        // #region debug-point E:workspace-mirror-proxy-error
        reportWorkspaceMirrorTrace({
          hypothesisId: 'E',
          traceId,
          location: 'workspaceSeedProvider.ts:readWorkspaceDocsMirrorEntriesViaProxy:error',
          msg: 'workspace docs mirror proxy request threw',
          data: {
            docsAbsRoot,
            durationMs: Date.now() - startedAtMs,
            errorName: error instanceof Error ? error.name : typeof error,
            errorMessage: error instanceof Error ? error.message : String(error || ''),
          },
        })
        // #endregion
        return []
      }
    },
  })
}

const readWorkspaceDocsMirrorEntriesFromDefaultSourceUrl = async (
  url: string,
): Promise<WorkspaceDocsMirrorEntry[]> => {
  try {
    const { fetchWorkspaceUrlContent } = await import(
      '@/features/markdown-workspace/workspaceImport/urlContent'
    ) as typeof import('@/features/markdown-workspace/workspaceImport/urlContent')
    const content = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    const text = String(content.text || '').trim()
    if (!text) return []
    const name = String(content.name || '').trim()
    const relPath = name.endsWith('.md') ? name : `${name || 'imported'}.md`
    return [{ relPath, text, updatedAtMs: Date.now() }]
  } catch {
    return []
  }
}

export async function readWorkspaceInitializationDocsMirrorEntries(args?: {
  preferCompleteDataset?: boolean
}): Promise<WorkspaceDocsMirrorEntry[]> {
  const preferCompleteDataset = args?.preferCompleteDataset === true, traceId = nextWorkspaceMirrorTraceId('bootstrap')
  const completeDatasetCandidates: WorkspaceDocsMirrorEntry[][] = [], defaultSourceUrl = readWorkspaceImportDefaultSourceUrlSetting()
  const defaultSourceUrlIsGitHub = isWorkspaceDocsMirrorGitHubSourceUrl(defaultSourceUrl), repoLocalRunReady = isWorkspaceRepoLocalRunReadyBootstrap()
  // #region debug-point A:workspace-mirror-bootstrap-entry
  reportWorkspaceMirrorTrace({
    hypothesisId: 'A',
    traceId,
    location: 'workspaceSeedProvider.ts:readWorkspaceInitializationDocsMirrorEntries:entry',
    msg: 'workspace docs mirror bootstrap entered',
    data: {
      preferCompleteDataset,
      defaultSourceUrlIsGitHub,
      hasDefaultSourceUrl: !!defaultSourceUrl,
      docsAbsRoot: readWorkspaceInitializationDocsAbsRoot(),
    },
  })
  // #endregion
  if (!repoLocalRunReady) {
    const [publishedEntries, publishedAgenticEntries, localSeedEntries] = await Promise.all([
      readCanonicalPublishedNonAgenticDocsMirrorEntries({
        maxFiles: WORKSPACE_DOCS_MIRROR_MAX_FILES,
        maxFileBytes: WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES,
      }),
      import('@/features/workspace-fs/workspacePublishedAgenticDocsSource').then(module => module.readPublishedAgenticDocsMirrorEntries()),
      readCanonicalLocalWorkspaceSeedMirrorEntries(),
    ])
    const canonicalEntries = [...publishedEntries, ...publishedAgenticEntries]
    if (canonicalEntries.length > 0) {
      return overlayCanonicalLocalWorkspaceSeedEntries(canonicalEntries, localSeedEntries)
    }
  }
  const sourceFilesSelection = await resolveWorkspaceDocsRootFromSourceFilesSelection()
  const knowgrphStorageBaseUrl = readWorkspaceDocsMirrorStorageFallbackEnabled() ? readWorkspaceInitializationKnowgrphStorageBaseUrl() : ''
  const knowgrphStorageWorkspaceId = knowgrphStorageBaseUrl && sourceFilesSelection ? buildKnowgrphWorkspaceIdFromSourceFilesWorkspaceState({ folderName: sourceFilesSelection.folderName, accessMode: sourceFilesSelection.accessMode as 'fs-access' | 'opfs' | 'file-input' | null, folderCacheId: sourceFilesSelection.localMarkdownFolderCacheId, selectedFolderPath: sourceFilesSelection.selectedFolderPath || null }) : ''
  const localRootRequests = resolveWorkspaceDocsMirrorLocalRootRequests({ docsAbsRoot: readWorkspaceInitializationDocsAbsRoot(), outputDocsAbsRoot: readWorkspaceInitializationOutputDocsAbsRoot(), agenticDocsAbsRoot: readWorkspaceInitializationAgenticOsDocsAbsRoot(), knowgrphWorkspaceSeedsAbsRoot: readKnowgrphWorkspaceSeedsAbsRoot() })
  const rootMirrorEntries = (await Promise.all(localRootRequests.map(async request => {
    const entries = await readWorkspaceMirrorRootEntries({
      ...request,
      readViaProxy: readWorkspaceDocsMirrorEntriesViaProxy,
      readViaNodeFs: readWorkspaceDocsMirrorEntriesViaNodeFs,
    })
    if (request.workspaceRootName !== 'workspace-seeds') return entries
    return entries.map(entry => ({
      ...entry,
      authority: 'knowgrph-workspace-seeds-local' as const,
    }))
  }))).flat()
  if (rootMirrorEntries.length > 0) {
    if (!preferCompleteDataset) return rootMirrorEntries
    completeDatasetCandidates.push(rootMirrorEntries)
  }
  if (knowgrphStorageBaseUrl && sourceFilesSelection) {
    if (knowgrphStorageWorkspaceId) {
      const storageDatasets: WorkspaceDocsMirrorEntry[][] = []
      const viaKnowgrphStorageDb = await readWorkspaceDocsMirrorEntriesFromKnowgrphStorageDbCache({
        workspaceId: knowgrphStorageWorkspaceId,
        selectedFolderPath: sourceFilesSelection.selectedFolderPath,
      })
      if (viaKnowgrphStorageDb.length > 0) storageDatasets.push(viaKnowgrphStorageDb)
      if (sourceFilesSelection.sourceFiles.length > 0) {
        const viaKnowgrphDocView = await readWorkspaceDocsMirrorEntriesFromKnowgrphStorageDocsBySourceFiles({
          baseUrl: knowgrphStorageBaseUrl,
          workspaceId: knowgrphStorageWorkspaceId,
          selectedFolderPath: sourceFilesSelection.selectedFolderPath,
          sourceFiles: sourceFilesSelection.sourceFiles,
        })
        if (viaKnowgrphDocView.length > 0) {
          if (!preferCompleteDataset) return viaKnowgrphDocView
          storageDatasets.push(viaKnowgrphDocView)
        }
      }
      const viaKnowgrphStorage = await readWorkspaceDocsMirrorEntriesFromKnowgrphStorageExport({
        baseUrl: knowgrphStorageBaseUrl,
        workspaceId: knowgrphStorageWorkspaceId,
        selectedFolderPath: sourceFilesSelection.selectedFolderPath,
      })
      if (viaKnowgrphStorage.length > 0) storageDatasets.push(viaKnowgrphStorage)
      const bestStorageDataset = chooseBestWorkspaceDocsMirrorDataset(storageDatasets)
      if (bestStorageDataset.length > 0) {
        if (!preferCompleteDataset) return bestStorageDataset
        completeDatasetCandidates.push(bestStorageDataset)
      }
    }
  }
  if (sourceFilesSelection?.sourceFiles?.length) {
    const sourceFilesIncomplete = hasIncompleteSourceFilesMirrorText({
      sourceFiles: sourceFilesSelection.sourceFiles,
      selectedFolderPath: sourceFilesSelection.selectedFolderPath,
    })
    if (sourceFilesIncomplete) {
      const viaSourceFilesHydrated = await readWorkspaceDocsMirrorEntriesFromSourceFilesRecordsHydrated({
        sourceFiles: sourceFilesSelection.sourceFiles,
        selectedFolderPath: sourceFilesSelection.selectedFolderPath,
        storageDocFallback: knowgrphStorageWorkspaceId && knowgrphStorageBaseUrl ? { workspaceId: knowgrphStorageWorkspaceId, baseUrl: knowgrphStorageBaseUrl } : null,
      })
      if (viaSourceFilesHydrated.length > 0) {
        if (!preferCompleteDataset) return viaSourceFilesHydrated
        completeDatasetCandidates.push(viaSourceFilesHydrated)
      }
    } else {
      const viaSourceFiles = readWorkspaceDocsMirrorEntriesFromSourceFilesRecords({
        sourceFiles: sourceFilesSelection.sourceFiles,
        selectedFolderPath: sourceFilesSelection.selectedFolderPath,
      })
      if (viaSourceFiles.length > 0) {
        if (!preferCompleteDataset) return viaSourceFiles
        completeDatasetCandidates.push(viaSourceFiles)
      }
    }
  }
  if (sourceFilesSelection?.localMarkdownFolderHandle) {
    const viaHandle = await readWorkspaceDocsMirrorEntriesFromLocalFolderHandle({
      rootHandle: sourceFilesSelection.localMarkdownFolderHandle,
      selectedFolderPath: sourceFilesSelection.selectedFolderPath,
    })
    if (viaHandle.length > 0) {
      if (!preferCompleteDataset) return viaHandle
      completeDatasetCandidates.push(viaHandle)
    }
  }
  if (sourceFilesSelection?.localMarkdownFolderCacheId) {
    const viaCache = await readWorkspaceDocsMirrorEntriesFromLocalFolderCache({
      folderCacheId: sourceFilesSelection.localMarkdownFolderCacheId,
      selectedFolderPath: sourceFilesSelection.selectedFolderPath,
    })
    if (viaCache.length > 0) {
      if (!preferCompleteDataset) return viaCache
      completeDatasetCandidates.push(viaCache)
    }
  }
  if (!knowgrphStorageBaseUrl) {
    if (defaultSourceUrl && !defaultSourceUrlIsGitHub) {
      const viaUrl = await readWorkspaceDocsMirrorEntriesFromDefaultSourceUrl(defaultSourceUrl)
      if (viaUrl.length > 0) {
        if (!preferCompleteDataset) return viaUrl
        completeDatasetCandidates.push(viaUrl)
      }
    }
  }
  return preferCompleteDataset
    ? chooseBestWorkspaceDocsMirrorDataset(completeDatasetCandidates)
    : []
}

export async function upsertWorkspaceInitializationSeedText(args: {
  basename: string
  text: string
}): Promise<boolean> {
  const absolutePath = buildWorkspaceSeedAbsolutePathCandidates({
    basename: args.basename,
    relPathCandidates: [],
  })[0] || null
  if (!absolutePath) return false
  if (typeof window !== 'undefined') {
    return writeTextViaLocalFsProxy(absolutePath, args.text)
  }
  try {
    const fs = await importNodeFsPromises()
    const path = await importNodePath()
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, String(args.text ?? ''), 'utf8')
    return true
  } catch {
    return false
  }
}

export async function ensureWorkspaceDocsMirrorFolder(args: {
  workspacePath: string
}): Promise<boolean> {
  const absolutePath = resolveWorkspaceDocsMirrorAbsolutePath(args.workspacePath)
  if (!absolutePath) return false
  if (typeof window !== 'undefined') {
    return ensureFolderViaLocalFsProxy(absolutePath, args.workspacePath)
  }
  try {
    const fs = await importNodeFsPromises()
    await fs.mkdir(absolutePath, { recursive: true })
    return true
  } catch {
    return false
  }
}

export async function ensureWorkspaceChatMirrorFolder(args: {
  workspacePath: string
}): Promise<boolean> {
  const absolutePath = resolveWorkspaceDocsMirrorAbsolutePath(args.workspacePath)
  if (!absolutePath) return false
  if (typeof window !== 'undefined') {
    return ensureFolderViaLocalFsProxy(absolutePath)
  }
  try {
    const fs = await importNodeFsPromises()
    await fs.mkdir(absolutePath, { recursive: true })
    return true
  } catch {
    return false
  }
}

export async function upsertWorkspaceDocsMirrorText(args: {
  workspacePath: string
  text: string
  allowBlankText?: boolean
  allowCrossDocumentOverwrite?: boolean
}): Promise<boolean> {
  const absolutePath = resolveWorkspaceDocsMirrorAbsolutePath(args.workspacePath)
  if (!absolutePath) return false
  const nextText = String(args.text ?? '')
  if (await shouldBlockBlankMirrorOverwrite({
    absolutePath,
    text: nextText,
    allowBlankText: args.allowBlankText,
  })) {
    return false
  }
  if (await shouldSkipEquivalentMirrorWrite({
    absolutePath,
    text: nextText,
  })) {
    return false
  }
  if (await shouldBlockDuplicateMirrorDocumentOverwrite({
    workspacePath: args.workspacePath,
    text: nextText,
    allowCrossDocumentOverwrite: args.allowCrossDocumentOverwrite,
  })) {
    return false
  }
  if (typeof window !== 'undefined') {
    return writeTextViaLocalFsProxy(absolutePath, nextText, args.workspacePath)
  }
  try {
    const fs = await importNodeFsPromises()
    const path = await importNodePath()
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, nextText, 'utf8')
    return true
  } catch {
    return false
  }
}

export async function upsertWorkspaceChatMirrorText(args: {
  workspacePath: string
  text: string
}): Promise<boolean> {
  const absolutePath = resolveWorkspaceDocsMirrorAbsolutePath(args.workspacePath)
  if (!absolutePath) return false
  if (typeof window !== 'undefined') {
    return writeTextViaLocalFsProxy(absolutePath, args.text)
  }
  try {
    const fs = await importNodeFsPromises()
    const path = await importNodePath()
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, String(args.text ?? ''), 'utf8')
    return true
  } catch {
    return false
  }
}

export async function upsertWorkspaceChatMirrorBytes(args: {
  workspacePath: string
  bytes: ArrayBuffer | Uint8Array
}): Promise<boolean> {
  const absolutePath = resolveWorkspaceDocsMirrorAbsolutePath(args.workspacePath)
  if (!absolutePath) return false
  const bytes = args.bytes instanceof Uint8Array ? args.bytes : new Uint8Array(args.bytes)
  if (typeof window !== 'undefined') {
    return writeBytesViaLocalFsProxy(absolutePath, bytes)
  }
  try {
    const fs = await importNodeFsPromises()
    const path = await importNodePath()
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, bytes)
    return true
  } catch {
    return false
  }
}

export async function deleteWorkspaceInitializationSeedText(args: {
  basename: string
}): Promise<boolean> {
  const absolutePath = buildWorkspaceSeedAbsolutePathCandidates({
    basename: args.basename,
    relPathCandidates: [],
  })[0] || null
  if (!absolutePath || typeof window !== 'undefined') return false
  try {
    const fs = await importNodeFsPromises()
    await fs.unlink(absolutePath)
    return true
  } catch {
    return false
  }
}
