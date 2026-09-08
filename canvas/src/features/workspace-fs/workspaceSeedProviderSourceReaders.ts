import { buildLocalFsFetchPath } from '@/lib/url'
import { readFirstAgenticGraphStorageDocText, readWorkspaceDocsMirrorTextViaFetch as readTextViaFetch } from './workspaceSeedProviderStorageCache'
import { isWorkspaceSourceMirrorFileName, shouldEncodeWorkspaceSourceMirrorAsBase64 } from './workspaceSourceMirrorFormats'
import { WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES, WORKSPACE_DOCS_MIRROR_MAX_FILES } from './workspaceDocsMirrorNodeReader'
import { encodeArrayBufferToBase64 } from './workspaceSeedProviderLocalIo'
import { readCanonicalPathCandidatesForSourcePath } from './workspaceSeedProviderStorage'
import {
  normalizeMirrorRelPath, normalizeSelectedFolderMirrorPath, normalizeSourceFileMirrorPath,
  resolveSelectedFolderRelativeMirrorPath, isWorkspaceBackedSourcePath,
  readWorkspaceInitializationDocsAbsRoot, normalizeAbsRoot, type WorkspaceDocsMirrorEntry,
} from './workspaceSeedProviderPaths'

export const readWorkspaceSourceMirrorFileText = async (file: File, name: string): Promise<string> => {
  if (shouldEncodeWorkspaceSourceMirrorAsBase64(name)) {
    return encodeArrayBufferToBase64(await file.arrayBuffer())
  }
  return String(await file.text())
}

export const resolveWorkspaceDocsRootFromSourceFilesSelection = async (): Promise<{
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

export const readWorkspaceDocsMirrorEntriesFromSourceFilesRecords = (args: {
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

export const hasIncompleteSourceFilesMirrorText = (args: {
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

export const readWorkspaceDocsMirrorEntriesFromSourceFilesRecordsHydrated = async (args: {
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
  const readFirstLocalFsMirrorText = async (sourcePathRaw: string): Promise<string | null> => {
    const fsCandidates = buildLocalFsHydrationCandidates(sourcePathRaw)
    for (let c = 0; c < fsCandidates.length; c += 1) {
      const localFsUrl = buildLocalFsFetchPath(fsCandidates[c]!)
      if (!localFsUrl) continue
      const hydrated = await readTextViaFetch(localFsUrl)
      if (hydrated !== null) return hydrated
    }
    return null
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
        const localText = await readFirstLocalFsMirrorText(sourcePathRaw)
        if (localText !== null) text = localText
        else if (storageFallbackConfigured) {
          const storedText = await readFirstAgenticGraphStorageDocText({
            baseUrl: fallbackBaseUrl,
            workspaceId: fallbackWorkspaceId,
            canonicalPathCandidates: readCanonicalPathCandidatesForSourcePath(sourcePathRaw),
          })
          if (storedText !== null) text = storedText
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

export const iterDirectoryEntries = (handle: FileSystemDirectoryHandle): AsyncIterable<[string, FileSystemHandle]> => {
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

export const readWorkspaceDocsMirrorEntriesFromLocalFolderHandle = async (args: {
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

export const readWorkspaceDocsMirrorEntriesFromLocalFolderCache = async (args: {
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
