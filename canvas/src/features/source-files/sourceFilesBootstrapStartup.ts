import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { __canvasStartupDebug } from '@/features/canvas/canvasStartupDebug'
import { hydratePendingUrlSourceFiles, refreshPersistedSourceFilesForCurrentParseIdentity } from '@/features/source-files/sourceFilesIngestIntegration'
import {
  buildActiveWorkspaceRuntimeSourceFilesSnapshot,
  buildMaterializedWorkspaceActivePathKey,
  buildMaterializedWorkspaceForceIncludePaths,
  hydrateWorkspaceEntriesInlineText,
  materializeActiveWorkspaceEntryIntoSourceFiles,
  readReusableWorkspaceEntriesSnapshot,
  resolveMaterializedWorkspaceActivePath,
} from '@/features/source-files/sourceFilesRuntimeShared'
import { resolveInitialWorkspaceStartupState } from '@/features/source-files/sourceFilesRuntimeStartup'
import { buildSourceFilesCompositionSignature } from '@/features/source-files/sourceFilesSignatures'
import { resolveWorkspaceSourceIndexSnapshot } from '@/features/workspace-fs/sourceIndex'
import { applyGraphOwnerComposedGraphFromSourceFiles } from '@/features/source-files/applyComposedGraphFromSourceFiles'
import type { SourceFilesWorkspaceState } from '@/features/source-files/sourceFilesWorkspaceState'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { resolveWorkspaceSourceRootPaths } from '@/features/workspace-fs/workspaceSourceRoots'
import { readWorkspaceSourceFilesDocsOnlySetting } from '@/lib/workspace/workspaceStoreSyncSettings'
import { matchesMarkdownDocumentPath } from 'grph-shared/markdown/documentPath'
import { resolveWorkspaceSourcePathKey } from '@/features/workspace-fs/syncToSourceFiles'

type BootstrapWorkspaceMaterializationArgs = {
  signal?: AbortSignal
  startupState?: Awaited<ReturnType<typeof resolveInitialWorkspaceStartupState>>
  fs?: Awaited<ReturnType<typeof getWorkspaceFs>>
  existingSourceFiles?: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  sourcesByPath?: ReturnType<typeof resolveWorkspaceSourceIndexSnapshot> | null
}

type BootstrapWorkspaceMaterializationContext = {
  startupActivePath: ReturnType<typeof resolveMaterializedWorkspaceActivePath>
  hydratedEntries: Awaited<ReturnType<typeof hydrateWorkspaceEntriesInlineText>>
  mergedSourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  startupSourcesByPath: ReturnType<typeof resolveWorkspaceSourceIndexSnapshot>
  workspaceFs: Awaited<ReturnType<typeof getWorkspaceFs>>
}

const BOOTSTRAP_MATERIALIZATION_MAX_ATTEMPTS = 3

export function restoreBootstrapPersistedSourceFiles(args: {
  persistedSourceFiles: unknown[]
}): ReturnType<typeof useGraphStore.getState>['sourceFiles'] {
  const store = useGraphStore.getState()
  const current = Array.isArray(store.sourceFiles) ? store.sourceFiles : []
  if (current.length > 0) return current
  const persisted = Array.isArray(args.persistedSourceFiles) ? args.persistedSourceFiles : []
  if (persisted.length > 0) {
    store.setSourceFiles(persisted as never)
  }
  return persisted as ReturnType<typeof useGraphStore.getState>['sourceFiles']
}

export async function runBootstrapSourceFileHydration(): Promise<void> {
  __canvasStartupDebug.sourceBootstrapHydrateRuns += 1
  await refreshPersistedSourceFilesForCurrentParseIdentity()
  await hydratePendingUrlSourceFiles()
  __canvasStartupDebug.sourceBootstrapLastHydrateFinishedAtMs = Date.now()
}

function readBootstrapExistingSourceFiles(
  sourceFiles?: BootstrapWorkspaceMaterializationArgs['existingSourceFiles'],
): ReturnType<typeof useGraphStore.getState>['sourceFiles'] {
  return Array.isArray(sourceFiles) ? sourceFiles : (Array.isArray(useGraphStore.getState().sourceFiles) ? useGraphStore.getState().sourceFiles : [])
}

function readBootstrapSourceIndexSnapshot(
  snapshot?: BootstrapWorkspaceMaterializationArgs['sourcesByPath'],
): ReturnType<typeof resolveWorkspaceSourceIndexSnapshot> {
  return snapshot || resolveWorkspaceSourceIndexSnapshot(undefined)
}

function hasBootstrapActivePathDrifted(startupActivePath: ReturnType<typeof resolveMaterializedWorkspaceActivePath>): boolean {
  const currentActivePath = resolveMaterializedWorkspaceActivePath({
    explorerActivePath: useMarkdownExplorerStore.getState().activePath,
  })
  return currentActivePath !== startupActivePath
}

export async function prepareBootstrapWorkspaceMaterialization(
  args: BootstrapWorkspaceMaterializationArgs = {},
): Promise<BootstrapWorkspaceMaterializationContext> {
  args.signal?.throwIfAborted()
  const fs = args.fs || await getWorkspaceFs()
  args.signal?.throwIfAborted()
  const startup = args.startupState || await resolveInitialWorkspaceStartupState({ fs })
  args.signal?.throwIfAborted()
  const startupActivePath = resolveMaterializedWorkspaceActivePath({
    activePathOverride: startup.activePath,
  })
  const hydratedEntries = await hydrateWorkspaceEntriesInlineText({
    fs,
    workspaceEntries: startup.workspaceEntries,
    forceIncludePaths: buildMaterializedWorkspaceForceIncludePaths({
      activePathOverride: startupActivePath,
    }),
  })
  args.signal?.throwIfAborted()
  const startupSourcesByPath = readBootstrapSourceIndexSnapshot(args.sourcesByPath)
  const existingSourceFiles = readBootstrapExistingSourceFiles(args.existingSourceFiles)
  const mergedSourceFiles = startupActivePath
    ? buildActiveWorkspaceRuntimeSourceFilesSnapshot({
        activePath: startupActivePath,
        existingSourceFiles,
        workspaceEntries: hydratedEntries,
        sourcesByPath: startupSourcesByPath || undefined,
        workspaceDocsOnly: readWorkspaceSourceFilesDocsOnlySetting(),
        workspaceSourceRootPaths: resolveWorkspaceSourceRootPaths({
          chatLocalStorageRootPath: useGraphStore.getState().chatLocalStorageRootPath,
        }),
      }).runtimeSourceFiles
    : existingSourceFiles
  return {
    startupActivePath,
    hydratedEntries,
    mergedSourceFiles,
    startupSourcesByPath,
    workspaceFs: fs,
  }
}

export async function materializeBootstrapWorkspaceSourceFiles(
  args: BootstrapWorkspaceMaterializationArgs = {},
): Promise<{
  activePathKey: string
  sourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  sourcesByPath: ReturnType<typeof resolveWorkspaceSourceIndexSnapshot>
  workspaceEntries: ReturnType<typeof readReusableWorkspaceEntriesSnapshot>
  workspaceFs: Awaited<ReturnType<typeof getWorkspaceFs>>
}> {
  let supersededError: unknown
  for (let attempt = 0; attempt < BOOTSTRAP_MATERIALIZATION_MAX_ATTEMPTS; attempt += 1) {
    args.signal?.throwIfAborted()
    const context = await prepareBootstrapWorkspaceMaterialization({
      ...args,
      startupState: attempt === 0 ? args.startupState : undefined,
      existingSourceFiles: attempt === 0 ? args.existingSourceFiles : undefined,
      sourcesByPath: attempt === 0 ? args.sourcesByPath : undefined,
    })
    args.signal?.throwIfAborted()
    if (hasBootstrapActivePathDrifted(context.startupActivePath)) continue
    if (supersededError && context.startupActivePath) {
      // A new selection may already contain an unsaved edit. Retry only from
      // consistent persisted bytes, never by replacing that newer document.
      const before = useGraphStore.getState(), activePath = context.startupActivePath
      const text = await context.workspaceFs.readFileText(activePath)
      args.signal?.throwIfAborted()
      if (hasBootstrapActivePathDrifted(activePath)) continue
      const current = useGraphStore.getState(), sourcePath = resolveWorkspaceSourcePathKey(activePath)
      const activeSource = current.sourceFiles.find(file => file.source?.path === sourcePath)
      const preparedSource = context.mergedSourceFiles.find(file => file.source?.path === sourcePath)
      if (text === null || current.sourceFiles !== before.sourceFiles
        || current.markdownDocumentName !== before.markdownDocumentName || current.markdownDocumentText !== before.markdownDocumentText
        || (current.markdownDocumentName?.trim() && matchesMarkdownDocumentPath(activePath, current.markdownDocumentName) && current.markdownDocumentText !== text)
        || (activeSource && activeSource.text !== text) || (preparedSource && preparedSource.text !== text)) throw supersededError
    }
    const workspaceEntries = readReusableWorkspaceEntriesSnapshot(context.hydratedEntries)
    try {
      args.signal?.throwIfAborted()
      await materializeActiveWorkspaceEntryIntoSourceFiles({
        activePathOverride: context.startupActivePath,
        fs: context.workspaceFs,
        activeWorkspaceEntriesSnapshot: workspaceEntries,
        sourcesByPath: context.startupSourcesByPath,
        premergedSourceFiles: context.mergedSourceFiles,
        applyToGraph: true,
      })
      args.signal?.throwIfAborted()
    } catch (error) {
      args.signal?.throwIfAborted()
      if ((error as { code?: string })?.code !== 'SOURCE_FILES_MATERIALIZATION_STALE') throw error
      // Same-path graph-import authority can be superseded while the parser or
      // another startup owner settles. The next pass rereads persisted bytes
      // and rejects unsaved divergence before it can apply the document.
      supersededError = error
      continue
    }
    args.signal?.throwIfAborted()
    if (hasBootstrapActivePathDrifted(context.startupActivePath)) continue
    const store = useGraphStore.getState()
    return {
      activePathKey: buildMaterializedWorkspaceActivePathKey({
        activePathOverride: context.startupActivePath,
        workspaceEntriesSnapshot: workspaceEntries,
        markdownDocumentName: store.markdownDocumentName,
        markdownDocumentText: store.markdownDocumentText,
        markdownDocumentApplyViewPreset: store.markdownDocumentApplyViewPreset,
      }),
      sourceFiles: store.sourceFiles,
      sourcesByPath: context.startupSourcesByPath,
      workspaceEntries,
      workspaceFs: context.workspaceFs,
    }
  }
  args.signal?.throwIfAborted()
  throw new Error('Canvas source selection changed repeatedly during startup')
}

export function applyBootstrapComposedGraphSync(args?: {
  sourceFiles?: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  precomputedSignature?: string
}): string {
  const sourceFiles = Array.isArray(args?.sourceFiles) ? args?.sourceFiles : useGraphStore.getState().sourceFiles
  const compositionSignature = String(args?.precomputedSignature || '').trim()
    || buildSourceFilesCompositionSignature(sourceFiles, {
      includeWorkspaceBacked: true,
      intent: 'explicit-graph-owner',
    })
  applyGraphOwnerComposedGraphFromSourceFiles()
  return compositionSignature
}

export function restoreBootstrapWorkspaceState(
  persistedWorkspace: SourceFilesWorkspaceState,
): void {
  const store = useGraphStore.getState()
  const hasLiveFolderAccess = !!store.localMarkdownFolderHandle || !!store.localMarkdownFolderCacheId
  if (!hasLiveFolderAccess) {
    if (!store.localMarkdownFolderCacheId && persistedWorkspace.folderCacheId) {
      store.setLocalMarkdownFolderCacheId(persistedWorkspace.folderCacheId, persistedWorkspace.folderName)
    }
    if (!store.localMarkdownFolderName && persistedWorkspace.folderName) {
      store.setLocalMarkdownFolderCachedMetadata({
        name: persistedWorkspace.folderName,
        accessMode: persistedWorkspace.accessMode,
      })
    }
  }
  if (!store.localMarkdownSelectedFolderPath && persistedWorkspace.selectedFolderPath) {
    store.setLocalMarkdownSelectedFolderPath(persistedWorkspace.selectedFolderPath)
  }
}
