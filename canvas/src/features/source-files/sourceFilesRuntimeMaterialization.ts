import { useGraphStore } from '@/hooks/useGraphStore'
import { isMarkdownLikeFileName } from 'grph-shared/markdown/mermaidInput'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { applyActiveMarkdownDocumentPayload } from '@/features/markdown/activeMarkdownDocument'
import { matchesMarkdownDocumentPath } from 'grph-shared/markdown/documentPath'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import type { WorkspaceEntry, WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import type { SourceFile } from '@/hooks/store/types'
import {
  resolveWorkspaceSourceIndexSnapshot,
  type WorkspaceSourceIndex,
} from '@/features/workspace-fs/sourceIndex'
import { mergeWorkspaceEntriesIntoSourceFiles, resolveWorkspaceSourcePathKey } from '@/features/workspace-fs/syncToSourceFiles'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { normalizeWorkspacePath, workspaceDocumentKey } from '@/features/workspace-fs/path'
import { resolveWorkspaceSourceRootPaths } from '@/features/workspace-fs/workspaceSourceRoots'
import {
  isInitializationWorkspacePath,
} from '@/features/workspace-fs/workspaceFs'
import { readWorkspaceSourceFilesDocsOnlySetting } from '@/lib/workspace/workspaceStoreSyncSettings'
import { hashStringToHexSharedContentCached } from '@/lib/hash/textHashCache'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import {
  readActiveWorkspaceSourceFileFallbackText,
  readWorkspaceActiveDocumentResolvedText,
  resolveActiveWorkspaceEntriesSnapshot,
} from '@/features/source-files/sourceFilesRuntimeActive'

function ensureActiveWorkspaceSourceFileEnabled(args: {
  sourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  activeSourcePath: string
}): ReturnType<typeof useGraphStore.getState>['sourceFiles'] {
  const list = Array.isArray(args.sourceFiles) ? args.sourceFiles : []
  if (list.length === 0) return list
  let changed = false
  const next = list.map(file => {
    if (!file) return file
    const sourcePath = String(file.source?.path || '')
    if (!sourcePath.startsWith('workspace:') || sourcePath !== args.activeSourcePath) return file
    if (file.enabled === true) return file
    changed = true
    return { ...file, enabled: true }
  })
  return changed ? next : list
}

function canSkipActiveWorkspaceSourceFilesRematerialization(args: {
  sourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  activeSourcePath: string
}): boolean {
  const list = Array.isArray(args.sourceFiles) ? args.sourceFiles : []
  if (!args.activeSourcePath || list.length === 0) return false
  for (let i = 0; i < list.length; i += 1) {
    const file = list[i]
    if (!file) continue
    if (String(file.source?.path || '') !== args.activeSourcePath) continue
    return file.enabled === true && String(file.text || '').trim().length > 0
  }
  return false
}

export function shouldProactivelyReapplyActiveWorkspaceMarkdownDocument(args: {
  activePath: WorkspacePath | null
  markdownDocumentName: string | null | undefined
  markdownDocumentText: string | null | undefined
  markdownDocumentApplyViewPreset?: boolean
}): boolean {
  const activePath = normalizeWorkspacePath(args.activePath)
  if (!activePath || !isMarkdownLikeFileName(activePath)) return false
  return true
}

const readActiveWorkspaceEntryInlineText = (args: {
  activePath: WorkspacePath
  activeWorkspaceEntriesSnapshot?: WorkspaceEntry[]
}): string => {
  const activePath = normalizeWorkspacePath(args.activePath)
  if (!activePath) return ''
  const entries = Array.isArray(args.activeWorkspaceEntriesSnapshot) ? args.activeWorkspaceEntriesSnapshot : []
  const activeEntry = entries.find(entry => entry?.kind === 'file' && normalizeWorkspacePath(entry.path) === activePath) || null
  return typeof activeEntry?.text === 'string' ? activeEntry.text : ''
}

export function shouldCommitResolvedActiveMarkdownText(args: {
  activePath: WorkspacePath | null
  resolvedText: string
  activeWorkspaceEntriesSnapshot?: WorkspaceEntry[]
}): boolean {
  if (String(args.resolvedText || '').trim()) return true
  const activePath = normalizeWorkspacePath(args.activePath)
  if (!activePath) return false
  const entries = Array.isArray(args.activeWorkspaceEntriesSnapshot) ? args.activeWorkspaceEntriesSnapshot : []
  return entries.some(entry => entry?.kind === 'file' && normalizeWorkspacePath(entry.path) === activePath)
}

export async function reapplyActiveWorkspaceMarkdownDocument(args?: {
  activePathOverride?: WorkspacePath | null
  fs?: Awaited<ReturnType<typeof getWorkspaceFs>>
  activeWorkspaceEntriesSnapshot?: WorkspaceEntry[]
}): Promise<boolean> {
  const activePath = resolveMaterializedWorkspaceActivePath({
    activePathOverride: args?.activePathOverride ?? null,
    explorerActivePath: useMarkdownExplorerStore.getState().activePath,
  })
  const store = useGraphStore.getState()
  if (!shouldProactivelyReapplyActiveWorkspaceMarkdownDocument({
    activePath,
    markdownDocumentName: store.markdownDocumentName,
    markdownDocumentText: store.markdownDocumentText,
    markdownDocumentApplyViewPreset: store.markdownDocumentApplyViewPreset,
  })) {
    return false
  }
  if (!activePath) return false
  const activeDocumentKey = workspaceDocumentKey(activePath)
  if (!activeDocumentKey) return false
  const currentText = readActiveWorkspaceEntryInlineText({
    activePath,
    activeWorkspaceEntriesSnapshot: args?.activeWorkspaceEntriesSnapshot,
  })
  const nextText = await readWorkspaceActiveDocumentResolvedText({
    activePath,
    currentText,
    fs: args?.fs,
  })
  if (!shouldCommitResolvedActiveMarkdownText({
    activePath,
    resolvedText: nextText,
    activeWorkspaceEntriesSnapshot: args?.activeWorkspaceEntriesSnapshot,
  })) {
    return false
  }
  const latestActivePath = resolveMaterializedWorkspaceActivePath({
    explorerActivePath: useMarkdownExplorerStore.getState().activePath,
  })
  if (normalizeWorkspacePath(latestActivePath) !== activePath) return false
  if (
    matchesMarkdownDocumentPath(activePath, store.markdownDocumentName) &&
    String(store.markdownDocumentText || '') === nextText &&
    store.markdownDocumentApplyViewPreset !== false
  ) {
    return false
  }
  return !!(await applyActiveMarkdownDocumentPayload({
    setActiveMarkdownDocument: store.setActiveMarkdownDocument,
    name: activeDocumentKey,
    text: nextText,
    autoEnableFrontmatter: true,
    applyViewPreset: true,
    applyToGraph: true,
    forceApplyToGraph: true,
    normalizeWebpageFrontmatterToMarkdown: false,
  }))
}

export function resolveMaterializedWorkspaceActivePath(args?: {
  activePathOverride?: WorkspacePath | null
  explorerActivePath?: WorkspacePath | null
}): WorkspacePath | null {
  const raw = args?.activePathOverride ?? args?.explorerActivePath ?? null
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  const withoutWorkspacePrefix = trimmed.startsWith('workspace:') ? trimmed.slice('workspace:'.length) : trimmed
  const normalized = normalizeWorkspacePath(withoutWorkspacePrefix)
  return normalized === '/' ? null : normalized
}

export function buildMaterializedWorkspaceActivePathKey(args?: {
  activePathOverride?: WorkspacePath | null
  explorerActivePath?: WorkspacePath | null
  workspaceEntriesSnapshot?: WorkspaceEntry[]
  markdownDocumentName?: string | null
  markdownDocumentText?: string | null
  markdownDocumentApplyViewPreset?: boolean | null
}): string {
  const activePath = String(resolveMaterializedWorkspaceActivePath(args) || '')
  if (!activePath) return ''
  const entries = Array.isArray(args?.workspaceEntriesSnapshot) ? args.workspaceEntriesSnapshot : []
  const activeEntry = entries.find(entry => entry?.kind === 'file' && normalizeWorkspacePath(entry.path) === activePath) || null
  const activeEntryText = typeof activeEntry?.text === 'string' ? activeEntry.text : ''
  const markdownText = String(args?.markdownDocumentText || '')
  const graphSemanticKey = [
    activePath,
    typeof activeEntry?.updatedAtMs === 'number' ? activeEntry.updatedAtMs : 0,
    activeEntryText.length,
    activeEntryText ? hashStringToHexSharedContentCached(activeEntryText, 'materialized-workspace-active-entry') : '',
    String(args?.markdownDocumentName || '').trim(),
    markdownText.length,
    markdownText ? hashStringToHexSharedContentCached(markdownText, 'materialized-workspace-markdown-document') : '',
    args?.markdownDocumentApplyViewPreset === false ? 'preset:false' : 'preset:true',
  ].join('|')
  return buildScopedGraphSemanticKey('materialized-workspace-active-path', { graphSemanticKey })
}

export function buildMaterializedWorkspaceForceIncludePaths(args?: {
  activePathOverride?: WorkspacePath | null
  explorerActivePath?: WorkspacePath | null
}): WorkspacePath[] {
  const activePath = resolveMaterializedWorkspaceActivePath(args)
  return activePath ? [activePath] : []
}

export function buildActiveWorkspaceRuntimeSourceFilesSnapshot(args: {
  activePath: WorkspacePath
  existingSourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  workspaceEntries: WorkspaceEntry[]
  sourcesByPath?: WorkspaceSourceIndex | null
  workspaceDocsOnly?: boolean
  workspaceSourceRootPaths?: WorkspacePath[]
}): {
  activeSourcePath: string
  mergedSourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  runtimeSourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  canSkipActiveRematerialization: boolean
} {
  const activePath = normalizeWorkspacePath(args.activePath)
  const activeSourcePath = resolveWorkspaceSourcePathKey(activePath)
  const mergedSourceFiles = mergeWorkspaceEntriesIntoSourceFiles({
    existing: Array.isArray(args.existingSourceFiles) ? args.existingSourceFiles : [],
    workspaceEntries: Array.isArray(args.workspaceEntries) ? args.workspaceEntries : [],
    sourcesByPath: resolveWorkspaceSourceIndexSnapshot(args.sourcesByPath || undefined),
    forceIncludePaths: buildMaterializedWorkspaceForceIncludePaths({
      activePathOverride: activePath,
    }),
    preserveExistingWorkspaceEntries: true,
    workspaceDocsOnly: args.workspaceDocsOnly,
    workspaceSourceRootPaths: args.workspaceSourceRootPaths,
  })
  const runtimeSourceFiles = ensureActiveWorkspaceSourceFileEnabled({
    sourceFiles: mergedSourceFiles,
    activeSourcePath,
  })
  return {
    activeSourcePath,
    mergedSourceFiles,
    runtimeSourceFiles,
    canSkipActiveRematerialization: canSkipActiveWorkspaceSourceFilesRematerialization({
      sourceFiles: runtimeSourceFiles,
      activeSourcePath,
    }),
  }
}

async function resolveNonGraphActiveWorkspaceSourceFiles(args: {
  activePath: WorkspacePath
  activeSourcePath: string
  sourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  activeWorkspaceEntriesSnapshot?: WorkspaceEntry[]
  fs?: Awaited<ReturnType<typeof getWorkspaceFs>>
  refreshActiveText?: boolean
}): Promise<ReturnType<typeof useGraphStore.getState>['sourceFiles'] | null> {
  const materializedSourceFiles = Array.isArray(args.sourceFiles) ? args.sourceFiles : []
  if (materializedSourceFiles.length === 0) return null
  const activeIndex = materializedSourceFiles.findIndex(file => String(file?.source?.path || '') === args.activeSourcePath)
  if (activeIndex < 0) return null
  let nextSourceFiles = materializedSourceFiles
  const activeFile = materializedSourceFiles[activeIndex] || null
  const activeText = String(activeFile?.text || '')
  const activeSnapshotEntry = (Array.isArray(args.activeWorkspaceEntriesSnapshot) ? args.activeWorkspaceEntriesSnapshot : [])
    .find(entry => entry?.kind === 'file' && normalizeWorkspacePath(entry.path) === args.activePath) || null
  const activeSnapshotText = typeof activeSnapshotEntry?.text === 'string' ? activeSnapshotEntry.text : null
  if (activeSnapshotText !== null && activeSnapshotText !== activeText) {
    nextSourceFiles = materializedSourceFiles.slice()
    nextSourceFiles[activeIndex] = {
      ...activeFile,
      text: activeSnapshotText,
    }
  } else if (args.refreshActiveText || !activeText.trim()) {
    const fallbackText = await readActiveWorkspaceSourceFileFallbackText({
      activePath: args.activePath,
      activeFile,
      activeWorkspaceEntriesSnapshot: args.activeWorkspaceEntriesSnapshot,
      fs: args.fs,
      ignoreActiveFileText: args.refreshActiveText === true,
    })
    if (fallbackText.trim() && fallbackText !== activeText) {
      nextSourceFiles = materializedSourceFiles.slice()
      nextSourceFiles[activeIndex] = {
        ...activeFile,
        text: fallbackText,
      }
    }
  }
  return ensureActiveWorkspaceSourceFileEnabled({
    sourceFiles: nextSourceFiles,
    activeSourcePath: args.activeSourcePath,
  })
}

function hasGraphOwningActivePathDrifted(
  activePath: WorkspacePath,
  explorerActivePathAtStart: WorkspacePath | null,
): boolean {
  const currentExplorerActivePath = resolveMaterializedWorkspaceActivePath({
    explorerActivePath: useMarkdownExplorerStore.getState().activePath,
  })
  // An explicit bootstrap override may legitimately start without an Explorer
  // selection. Once Explorer owns a different path, the older preset is stale.
  const activePathStartedStale = (
    explorerActivePathAtStart !== null
    && explorerActivePathAtStart !== activePath
  )
  return activePathStartedStale || (
    explorerActivePathAtStart === null
      ? currentExplorerActivePath !== null && currentExplorerActivePath !== activePath
      : currentExplorerActivePath !== activePath
  )
}

type GraphOwningActiveWorkspaceSourceFilesArgs = {
  activePath: WorkspacePath
  fs: WorkspaceFs
  existingSourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  workspaceEntries: WorkspaceEntry[]
  sourcesByPath?: WorkspaceSourceIndex | null
  premergedSourceFiles?: SourceFile[] | null
}

function mergeGraphOwningActiveWorkspaceSourceFiles(
  args: GraphOwningActiveWorkspaceSourceFilesArgs,
): void {
  const store = useGraphStore.getState()
  const mergedSourceFiles = args.premergedSourceFiles || mergeWorkspaceEntriesIntoSourceFiles({
    existing: args.existingSourceFiles,
    workspaceEntries: args.workspaceEntries,
    sourcesByPath: resolveWorkspaceSourceIndexSnapshot(args.sourcesByPath || undefined),
    forceIncludePaths: buildMaterializedWorkspaceForceIncludePaths({
      activePathOverride: args.activePath,
    }),
    preserveExistingWorkspaceEntries: true,
    workspaceDocsOnly: readWorkspaceSourceFilesDocsOnlySetting(),
    workspaceSourceRootPaths: resolveWorkspaceSourceRootPaths({
      chatLocalStorageRootPath: store.chatLocalStorageRootPath,
    }),
  })
  if (mergedSourceFiles !== args.existingSourceFiles) {
    store.setSourceFiles(mergedSourceFiles)
  }
}

async function materializeGraphOwningActiveWorkspaceSourceFiles(args: GraphOwningActiveWorkspaceSourceFilesArgs): Promise<void> {
  const explorerActivePathAtStart = resolveMaterializedWorkspaceActivePath({
    explorerActivePath: useMarkdownExplorerStore.getState().activePath,
  })
  mergeGraphOwningActiveWorkspaceSourceFiles(args)
  // Identity precedes presets so run-ready Exit retains the neutral surface.
  await reapplyActiveWorkspaceMarkdownDocument({
    activePathOverride: args.activePath,
    fs: args.fs,
    activeWorkspaceEntriesSnapshot: args.workspaceEntries,
  })
  if (hasGraphOwningActivePathDrifted(args.activePath, explorerActivePathAtStart)) return
  const mergedSourceFiles = useGraphStore.getState().sourceFiles

  const preserveFrontmatterDrivenLanding = isInitializationWorkspacePath(args.activePath)
  await applyWorkspaceImportToCanvas({
    fs: args.fs,
    createdPaths: [args.activePath],
    opts: {
      workspaceEntries: args.workspaceEntries,
      sourcesByPath: resolveWorkspaceSourceIndexSnapshot(args.sourcesByPath || undefined),
      premergedSourceFiles: mergedSourceFiles,
      applyToGraph: true,
      skipComposedGraphApply: preserveFrontmatterDrivenLanding,
    },
  })
}

export async function materializeActiveWorkspaceEntryIntoSourceFiles(args?: {
  activePathOverride?: WorkspacePath | null
  fs?: Awaited<ReturnType<typeof getWorkspaceFs>>
  workspaceEntries?: WorkspaceEntry[]
  activeWorkspaceEntriesSnapshot?: WorkspaceEntry[]
  sourceFilesSnapshot?: SourceFile[]
  sourcesByPath?: WorkspaceSourceIndex
  premergedSourceFiles?: SourceFile[]
  applyToGraph?: boolean
  refreshActiveText?: boolean
}): Promise<void> {
  const activePath = resolveMaterializedWorkspaceActivePath({
    activePathOverride: args?.activePathOverride ?? null,
    explorerActivePath: useMarkdownExplorerStore.getState().activePath,
  })
  if (!activePath) return
  const shouldApplyToGraph = args?.applyToGraph === true
  const store = useGraphStore.getState()
  const activeSourcePath = resolveWorkspaceSourcePathKey(activePath)
  const existing = Array.isArray(args?.sourceFilesSnapshot) ? args.sourceFilesSnapshot : (Array.isArray(store.sourceFiles) ? store.sourceFiles : [])
  const premergedSourceFiles = Array.isArray(args?.premergedSourceFiles) ? args.premergedSourceFiles : null
  const materializedSourceFiles = premergedSourceFiles || existing
  if (!shouldApplyToGraph && materializedSourceFiles.length > 0) {
    const next = await resolveNonGraphActiveWorkspaceSourceFiles({
      activePath,
      activeSourcePath,
      sourceFiles: materializedSourceFiles,
      activeWorkspaceEntriesSnapshot: args?.activeWorkspaceEntriesSnapshot,
      fs: args?.fs,
      refreshActiveText: args?.refreshActiveText === true,
    })
    if (next) {
      if (next !== existing) {
        store.setSourceFiles(ensureActiveWorkspaceSourceFileEnabled({
          sourceFiles: next,
          activeSourcePath,
        }))
      }
      await reapplyActiveWorkspaceMarkdownDocument({
        activePathOverride: activePath,
        fs: args?.fs,
        activeWorkspaceEntriesSnapshot: args?.activeWorkspaceEntriesSnapshot,
      })
      return
    }
  }
  const fs = args?.fs || (await getWorkspaceFs())
  const workspaceEntries = await resolveActiveWorkspaceEntriesSnapshot({
    activePath,
    fs,
    workspaceEntries: args?.workspaceEntries,
    activeWorkspaceEntriesSnapshot: args?.activeWorkspaceEntriesSnapshot,
  })
  if (!shouldApplyToGraph) {
    const runtimeSnapshot = buildActiveWorkspaceRuntimeSourceFilesSnapshot({
      activePath,
      existingSourceFiles: existing,
      workspaceEntries,
      sourcesByPath: resolveWorkspaceSourceIndexSnapshot(args?.sourcesByPath),
      workspaceDocsOnly: readWorkspaceSourceFilesDocsOnlySetting(),
      workspaceSourceRootPaths: resolveWorkspaceSourceRootPaths({
        chatLocalStorageRootPath: store.chatLocalStorageRootPath,
      }),
    })
    if (runtimeSnapshot.runtimeSourceFiles !== existing) {
      store.setSourceFiles(runtimeSnapshot.runtimeSourceFiles)
    }
    await reapplyActiveWorkspaceMarkdownDocument({
      activePathOverride: activePath,
      fs,
      activeWorkspaceEntriesSnapshot: workspaceEntries,
    })
    return
  }
  await materializeGraphOwningActiveWorkspaceSourceFiles({
    activePath,
    fs,
    existingSourceFiles: existing,
    workspaceEntries,
    sourcesByPath: resolveWorkspaceSourceIndexSnapshot(args?.sourcesByPath),
    premergedSourceFiles,
  })
}
