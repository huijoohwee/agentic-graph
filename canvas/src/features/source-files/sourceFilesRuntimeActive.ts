import { useGraphStore } from '@/hooks/useGraphStore'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import type { WorkspaceEntry, WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import type { SourceFile } from '@/hooks/store/types'
import { normalizeWorkspacePath, workspaceBasename, workspaceExtLower } from '@/features/workspace-fs/path'
import { buildLocalFsFetchPath } from '@/lib/url'
import { readEnvString } from '@/lib/config.env'
import { buildAgenticGraphWorkspaceIdFromSourceFilesWorkspaceState } from '@/features/source-files/sourceFilesStorageSync'
import { loadPersistedSourceFilesWorkspace } from '@/features/source-files/sourceFilesDb'
import { readFirstAgenticGraphStorageDocText } from '@/features/workspace-fs/workspaceSeedProviderStorageCache'
import { readWorkspaceInitializationDocsMirrorEntries } from '@/features/workspace-fs/workspaceSeedProvider'
import { isWorkspaceSourceMirrorFileName } from '@/features/workspace-fs/workspaceSourceMirrorFormats'
import {
  isWorkspaceCanonicalDocsMirrorPath,
  resolveWorkspaceSourceRootPaths,
} from '@/features/workspace-fs/workspaceSourceRoots'
import { readWorkspaceDocsMirrorRootPathSetting } from '@/lib/workspace/workspaceStoreSyncSettings'
import { frontmatterFlowTextHasRepeatedCanonicalStringResidue } from '@/features/parsers/markdownFrontmatterFlowRepair'
import { readStorageCanonicalPathCandidatesForWorkspacePath } from '@/features/source-files/sourceFilesStoragePaths'
import { buildModelAssetWorkspaceFallbackMarkdown } from '@/features/markdown-workspace/workspaceImport/glbAsset'
import {
  readCachedWorkspaceActiveEntrySnapshot,
  rememberWorkspaceActiveEntrySnapshot,
} from '@/features/source-files/workspaceActiveEntryCache'
import { normalizeRuntimeStorageMediaAccessUrlsInText } from '@/lib/storage/runtimeMediaUrl'
import { isWorkspaceRepoLocalRunReadyBootstrap } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { shouldRejectMarkdownDocumentPayload } from '@/lib/markdown/markdownDocumentPayloadGuards'

const normalizeString = (value: unknown): string => String(value || '').trim()

export const isAcceptableWorkspaceDocsRootFallbackPayload = (value: unknown): value is string => {
  const text = typeof value === 'string' ? value : ''
  return !!text.trim() && !shouldRejectMarkdownDocumentPayload(text)
}

const resolveCanonicalDocsMirrorRepairText = async (args: {
  activePath: WorkspacePath
  currentText: string
  storageFallbackByPath?: Map<string, string>
  modelAssetFormat: 'glb' | 'gltf' | null
}): Promise<string | null> => {
  const canonicalDocsMirrorText = resolveWorkspaceActiveDocumentText(
    args.activePath,
    args.modelAssetFormat,
    await readWorkspaceDocsMirrorFallbackText(args.activePath, args.storageFallbackByPath),
  )
  if (
    canonicalDocsMirrorText.trim()
    // Startup repair only yields to canonical docs mirror for parser-backed
    // repeated-residue corruption, not for ordinary user edits.
    && frontmatterFlowTextHasRepeatedCanonicalStringResidue({
      documentName: workspaceBasename(args.activePath) || 'workspace-flow.md',
      currentText: args.currentText,
      canonicalText: canonicalDocsMirrorText,
    })
  ) {
    return canonicalDocsMirrorText
  }
  return null
}

const isWorkspaceModelAssetPath = (path: WorkspacePath): 'glb' | 'gltf' | null => {
  const ext = workspaceExtLower(path)
  return ext === 'glb' || ext === 'gltf' ? ext : null
}

const hasWorkspaceModelAssetCanvasManifest = (text: string): boolean => {
  const sample = String(text || '').slice(0, 4096)
  return !!(
    sample.includes('kgAssetFormat') ||
    sample.includes('kgAssetType') ||
    sample.includes('kgCanvasSurfaceMode') ||
    sample.includes('kgCanvas3dMode')
  )
}

const buildWorkspaceModelAssetFallbackText = (activePath: WorkspacePath, format: 'glb' | 'gltf'): string =>
  buildModelAssetWorkspaceFallbackMarkdown({
    name: workspaceBasename(activePath),
    format,
    sourceKind: 'workspace',
  })

const resolveWorkspaceActiveDocumentText = (
  activePath: WorkspacePath,
  modelAssetFormat: 'glb' | 'gltf' | null,
  textRaw: string,
): string => {
  const text = normalizeRuntimeStorageMediaAccessUrlsInText({ text: textRaw })
  if (!text.trim()) return ''
  if (!modelAssetFormat || hasWorkspaceModelAssetCanvasManifest(text)) return text
  return buildWorkspaceModelAssetFallbackText(activePath, modelAssetFormat)
}

const normalizeDocsMirrorRelPath = (value: string): string => {
  let next = String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
  const lowered = next.toLowerCase()
  if (lowered.startsWith('docs/huijoohwee/docs/')) {
    next = next.slice('docs/huijoohwee/docs/'.length)
  } else if (lowered.startsWith('huijoohwee/docs/')) {
    next = next.slice('huijoohwee/docs/'.length)
  } else if (lowered.startsWith('docs/')) {
    next = next.slice('docs/'.length)
  }
  return next
}

const buildWorkspaceDocsMirrorRelPathCandidates = (activePathRaw: WorkspacePath): string[] => {
  const activePath = normalizeWorkspacePath(activePathRaw)
  if (!activePath || activePath === '/') return []
  const out = new Set<string>()
  const push = (value: string) => {
    const next = normalizeDocsMirrorRelPath(value)
    if (!next || !isWorkspaceSourceMirrorFileName(next)) return
    out.add(next)
  }
  push(activePath)
  const sourceRoots = resolveWorkspaceSourceRootPaths({
    chatLocalStorageRootPath: useGraphStore.getState().chatLocalStorageRootPath,
  })
  for (let i = 0; i < sourceRoots.length; i += 1) {
    const root = normalizeWorkspacePath(sourceRoots[i] || '')
    if (!root || root === '/') continue
    if (activePath === root) continue
    if (activePath.startsWith(`${root}/`)) push(activePath.slice(root.length + 1))
  }
  return [...out]
}

const readWorkspaceDocsRootFileFallbackText = async (
  candidates: ReadonlyArray<string>,
): Promise<string> => {
  if (typeof fetch !== 'function') return ''
  const docsRoot = String(readWorkspaceDocsMirrorRootPathSetting() || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
  if (!docsRoot) return ''
  for (let i = 0; i < candidates.length; i += 1) {
    const relPath = normalizeDocsMirrorRelPath(candidates[i] || '')
    if (!relPath || !isWorkspaceSourceMirrorFileName(relPath)) continue
    const localFsUrl = buildLocalFsFetchPath(`${docsRoot}/${relPath}`)
    if (!localFsUrl) continue
    try {
      const response = await fetch(localFsUrl)
      if (!response.ok) continue
      const text = await response.text()
      if (isAcceptableWorkspaceDocsRootFallbackPayload(text)) return text
    } catch {
      void 0
    }
  }
  return ''
}

const readWorkspaceDocsMirrorFallbackText = async (
  activePath: WorkspacePath,
  _fallbackByActivePath?: Map<string, string>,
): Promise<string> => {
  if (isWorkspaceRepoLocalRunReadyBootstrap()) return ''
  const normalizedPath = normalizeWorkspacePath(String(activePath || '').trim())
  if (!normalizedPath) return ''
  const candidates = buildWorkspaceDocsMirrorRelPathCandidates(normalizedPath)
  if (candidates.length === 0) {
    return ''
  }
  try {
    const entries = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
    const byRelPath = new Map<string, string>()
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i]
      if (!entry) continue
      const relPath = normalizeDocsMirrorRelPath(String(entry.relPath || ''))
      if (!relPath || byRelPath.has(relPath)) continue
      byRelPath.set(relPath, String(entry.text || ''))
    }
    let blankMirrorMatch: string | null = null
    for (let i = 0; i < candidates.length; i += 1) {
      const text = byRelPath.get(candidates[i] || '')
      if (typeof text === 'string') {
        if (text.trim()) {
          return text
        }
        if (blankMirrorMatch === null) blankMirrorMatch = text
      }
    }
    const directRootText = await readWorkspaceDocsRootFileFallbackText(candidates)
    if (directRootText.trim()) {
      return directRootText
    }
    if (blankMirrorMatch !== null) {
      return blankMirrorMatch
    }
  } catch {
    void 0
  }
  return ''
}

const readWorkspaceStorageDocFallbackText = async (
  activePath: WorkspacePath,
  fallbackByActivePath?: Map<string, string>,
): Promise<string> => {
  if (typeof fetch !== 'function') return ''
  const normalizedPath = normalizeWorkspacePath(String(activePath || '').trim())
  if (!normalizedPath) return ''
  const cached = fallbackByActivePath?.get(normalizedPath)
  if (typeof cached === 'string') return cached
  const baseUrl = normalizeString(readEnvString('VITE_AGENTIC_OS_STORAGE_BASE_URL', ''))
  if (!baseUrl) return ''
  const canonicalCandidates = readStorageCanonicalPathCandidatesForWorkspacePath(normalizedPath)
  if (canonicalCandidates.length === 0) {
    fallbackByActivePath?.set(normalizedPath, '')
    return ''
  }
  try {
    const workspaceIdCandidates = new Set<string>()
    const workspaceIdOverride = normalizeString(readEnvString('VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID', ''))
    if (workspaceIdOverride) workspaceIdCandidates.add(workspaceIdOverride)
    const runtimeWorkspaceId = normalizeString(buildAgenticGraphWorkspaceIdFromSourceFilesWorkspaceState({
      folderName: useGraphStore.getState().localMarkdownFolderName,
      accessMode: useGraphStore.getState().localMarkdownFolderAccessMode,
      folderCacheId: useGraphStore.getState().localMarkdownFolderCacheId,
      selectedFolderPath: useGraphStore.getState().localMarkdownSelectedFolderPath,
    }))
    if (runtimeWorkspaceId) workspaceIdCandidates.add(runtimeWorkspaceId)
    let persistedWorkspaceId = ''
    try {
      const workspaceState = await loadPersistedSourceFilesWorkspace()
      persistedWorkspaceId = normalizeString(buildAgenticGraphWorkspaceIdFromSourceFilesWorkspaceState(workspaceState))
    } catch {
      persistedWorkspaceId = ''
    }
    if (persistedWorkspaceId) workspaceIdCandidates.add(persistedWorkspaceId)
    if (workspaceIdCandidates.size === 0) return ''
    const workspaceIds = [...workspaceIdCandidates]
    for (let w = 0; w < workspaceIds.length; w += 1) {
      const workspaceId = workspaceIds[w]
      if (!workspaceId) continue
      const text = await readFirstAgenticGraphStorageDocText({
        baseUrl,
        workspaceId,
        canonicalPathCandidates: canonicalCandidates,
      })
      if (text.trim()) {
        fallbackByActivePath?.set(normalizedPath, text)
        return text
      }
    }
  } catch {
    return ''
  }
  fallbackByActivePath?.set(normalizedPath, '')
  return ''
}

export function readReusableWorkspaceEntriesSnapshot(
  workspaceEntries: WorkspaceEntry[] | null | undefined,
): WorkspaceEntry[] | undefined {
  return Array.isArray(workspaceEntries) && workspaceEntries.length > 0 ? workspaceEntries : undefined
}

export async function readWorkspaceActiveDocumentResolvedText(args: {
  activePath: WorkspacePath
  currentText?: string
  fs?: WorkspaceFs | Awaited<ReturnType<typeof getWorkspaceFs>>
  storageFallbackByPath?: Map<string, string>
  preferCanonicalPathText?: boolean
}): Promise<string> {
  const activePath = normalizeWorkspacePath(args.activePath)
  const modelAssetFormat = isWorkspaceModelAssetPath(activePath)
  const preferCanonicalDocsMirrorText = args.preferCanonicalPathText === true
    && isWorkspaceCanonicalDocsMirrorPath(activePath)
  if (preferCanonicalDocsMirrorText) {
    const canonicalText = resolveWorkspaceActiveDocumentText(
      activePath,
      modelAssetFormat,
      await readWorkspaceDocsMirrorFallbackText(activePath, args.storageFallbackByPath),
    )
    if (canonicalText.trim()) return canonicalText
  }
  const currentText = String(args.currentText || '')
  const resolvedCurrentText = resolveWorkspaceActiveDocumentText(activePath, modelAssetFormat, currentText)
  if (resolvedCurrentText.trim()) {
    const canonicalDocsMirrorRepairText = await resolveCanonicalDocsMirrorRepairText({
      activePath,
      currentText: resolvedCurrentText,
      storageFallbackByPath: args.storageFallbackByPath,
      modelAssetFormat,
    })
    if (canonicalDocsMirrorRepairText) return canonicalDocsMirrorRepairText
    return resolvedCurrentText
  }
  let fsText = ''
  try {
    const fs = args.fs || (await getWorkspaceFs())
    fsText = String((await fs.readFileText(activePath)) || '')
  } catch {
    fsText = ''
  }
  const resolvedFsText = resolveWorkspaceActiveDocumentText(activePath, modelAssetFormat, fsText)
  if (resolvedFsText.trim()) return resolvedFsText
  if (!preferCanonicalDocsMirrorText) {
    const docsMirrorText = resolveWorkspaceActiveDocumentText(
      activePath,
      modelAssetFormat,
      await readWorkspaceDocsMirrorFallbackText(activePath, args.storageFallbackByPath),
    )
    if (docsMirrorText.trim()) return docsMirrorText
  }
  const storageText = resolveWorkspaceActiveDocumentText(
    activePath,
    modelAssetFormat,
    await readWorkspaceStorageDocFallbackText(activePath, args.storageFallbackByPath),
  )
  if (storageText.trim()) return storageText
  if (modelAssetFormat) {
    return buildWorkspaceModelAssetFallbackText(activePath, modelAssetFormat)
  }
  return ''
}

export const readWorkspaceActiveEntrySnapshot = async (args: {
  fs: WorkspaceFs
  activePath: WorkspacePath
  workspaceEntries?: WorkspaceEntry[]
}): Promise<WorkspaceEntry[]> => {
  const activePath = normalizeWorkspacePath(args.activePath)
  const provided = Array.isArray(args.workspaceEntries) ? args.workspaceEntries : []
  const existingEntry = provided.find(entry => entry?.kind === 'file' && normalizeWorkspacePath(entry.path) === activePath) || null
  if (existingEntry && typeof existingEntry.text === 'string' && existingEntry.text.trim()) {
    const modelAssetFormat = isWorkspaceModelAssetPath(activePath)
    const canonicalDocsMirrorRepairText = await resolveCanonicalDocsMirrorRepairText({
      activePath,
      currentText: existingEntry.text,
      modelAssetFormat,
    })
    if (canonicalDocsMirrorRepairText && canonicalDocsMirrorRepairText !== String(existingEntry.text || '')) {
      try {
        await args.fs.writeFileText(activePath, canonicalDocsMirrorRepairText)
      } catch {
        void 0
      }
    }
    const resolvedText = await readWorkspaceActiveDocumentResolvedText({
      activePath,
      currentText: existingEntry.text,
      fs: args.fs,
    })
    const snapshot = [{
      ...existingEntry,
      text: resolvedText,
    }]
    return rememberWorkspaceActiveEntrySnapshot({ activePath, entries: snapshot }) || snapshot
  }
  const cached = readCachedWorkspaceActiveEntrySnapshot({
    activePath,
    minUpdatedAtMs: typeof existingEntry?.updatedAtMs === 'number' ? existingEntry.updatedAtMs : undefined,
  })
  if (cached) return cached
  let text = existingEntry && typeof existingEntry.text === 'string' ? existingEntry.text : ''
  if (!text.trim()) {
    text = await readWorkspaceActiveDocumentResolvedText({
      activePath,
      currentText: text,
      fs: args.fs,
    })
  }
  const pathParts = activePath.replace(/^\/+/, '').split('/').filter(Boolean)
  const name = pathParts[pathParts.length - 1] || ''
  const parentPath = pathParts.length > 1
    ? normalizeWorkspacePath(pathParts.slice(0, -1).join('/'))
    : '/'
  const snapshot: WorkspaceEntry[] = [{
    ...(existingEntry || {}),
    path: activePath,
    parentPath,
    kind: 'file',
    name: String(existingEntry?.name || name),
    text,
    updatedAtMs: typeof existingEntry?.updatedAtMs === 'number' ? existingEntry.updatedAtMs : Date.now(),
  }]
  return rememberWorkspaceActiveEntrySnapshot({ activePath, entries: snapshot }) || snapshot
}

export const readWorkspaceSourceRootEntriesSnapshot = async (args: {
  fs: WorkspaceFs
  activePath: WorkspacePath
  workspaceEntries?: WorkspaceEntry[]
}): Promise<WorkspaceEntry[]> => {
  const activePath = normalizeWorkspacePath(args.activePath)
  const provided = Array.isArray(args.workspaceEntries) ? args.workspaceEntries : []
  const allEntries = provided.length > 1 ? provided : await args.fs.listEntries()
  if (!activePath) return allEntries
  const activeEntries = await readWorkspaceActiveEntrySnapshot({
    fs: args.fs,
    activePath,
    workspaceEntries: allEntries,
  })
  const activeEntry = activeEntries.find(entry => entry?.kind === 'file' && normalizeWorkspacePath(entry.path) === activePath) || null
  if (!activeEntry) return allEntries
  let foundActive = false
  let changed = false
  const next = allEntries.map(entry => {
    if (!entry || entry.kind !== 'file' || normalizeWorkspacePath(entry.path) !== activePath) return entry
    foundActive = true
    if (entry === activeEntry) return entry
    changed = true
    return activeEntry
  })
  if (!foundActive) {
    return [...allEntries, activeEntry].sort((a, b) => String(a.path || '').localeCompare(String(b.path || '')))
  }
  return changed ? next : allEntries
}

export function readProvidedActiveWorkspaceEntriesSnapshot(args: {
  activePath: WorkspacePath
  activeWorkspaceEntriesSnapshot?: WorkspaceEntry[]
}): WorkspaceEntry[] | null {
  const activePath = normalizeWorkspacePath(args.activePath)
  const provided = Array.isArray(args.activeWorkspaceEntriesSnapshot) ? args.activeWorkspaceEntriesSnapshot : []
  if (provided.length === 0) return null
  const activeEntry = provided.find(entry => entry?.kind === 'file' && normalizeWorkspacePath(entry.path) === activePath) || null
  if (!activeEntry || typeof activeEntry.text !== 'string' || !activeEntry.text.trim()) return null
  const snapshot = [activeEntry]
  return rememberWorkspaceActiveEntrySnapshot({ activePath, entries: snapshot }) || snapshot
}

export async function resolveActiveWorkspaceEntriesSnapshot(args: {
  activePath: WorkspacePath
  fs: WorkspaceFs
  workspaceEntries?: WorkspaceEntry[]
  activeWorkspaceEntriesSnapshot?: WorkspaceEntry[]
}): Promise<WorkspaceEntry[]> {
  const providedSnapshot = readProvidedActiveWorkspaceEntriesSnapshot({
    activePath: args.activePath,
    activeWorkspaceEntriesSnapshot: args.activeWorkspaceEntriesSnapshot,
  })
  if (providedSnapshot) return providedSnapshot
  return readWorkspaceActiveEntrySnapshot({
    fs: args.fs,
    activePath: args.activePath,
    workspaceEntries: args.workspaceEntries,
  })
}

export async function readActiveWorkspaceSourceFileFallbackText(args: {
  activePath: WorkspacePath
  activeFile?: SourceFile | null
  activeWorkspaceEntriesSnapshot?: WorkspaceEntry[]
  fs?: Awaited<ReturnType<typeof getWorkspaceFs>>
  ignoreActiveFileText?: boolean
}): Promise<string> {
  const activeText = String(args.activeFile?.text || '')
  if (!args.ignoreActiveFileText && activeText.trim()) return activeText
  const providedSnapshot = readProvidedActiveWorkspaceEntriesSnapshot({
    activePath: args.activePath,
    activeWorkspaceEntriesSnapshot: args.activeWorkspaceEntriesSnapshot,
  })
  const providedText = String(providedSnapshot?.[0]?.text || '')
  return readWorkspaceActiveDocumentResolvedText({
    activePath: args.activePath,
    currentText: providedText,
    fs: args.fs,
  })
}

export async function hydrateWorkspaceEntriesInlineText(args: {
  fs: WorkspaceFs
  workspaceEntries: WorkspaceEntry[]
  forceIncludePaths?: WorkspacePath[]
}): Promise<WorkspaceEntry[]> {
  const entries = Array.isArray(args.workspaceEntries) ? args.workspaceEntries : []
  if (entries.length === 0) return entries
  const forceIncludePathSet = new Set(
    (Array.isArray(args.forceIncludePaths) ? args.forceIncludePaths : [])
      .map(path => normalizeWorkspacePath(String(path || '').trim()))
      .filter(Boolean),
  )
  let changed = false
  const storageFallbackByPath = new Map<string, string>()
  const next = await Promise.all(
    entries.map(async entry => {
      if (!entry || entry.kind !== 'file') return entry
      if (typeof entry.text === 'string' && entry.text.trim().length > 0) return entry
      const entryPath = normalizeWorkspacePath(entry.path)
      if (forceIncludePathSet.size > 0 && !forceIncludePathSet.has(entryPath)) return entry
      const fallbackText = await readWorkspaceActiveDocumentResolvedText({
        activePath: entryPath,
        currentText: typeof entry.text === 'string' ? entry.text : '',
        fs: args.fs,
        storageFallbackByPath,
      })
      if (!fallbackText.trim()) return entry
      changed = true
      return {
        ...entry,
        text: fallbackText,
      }
    }),
  )
  return changed ? next : entries
}
