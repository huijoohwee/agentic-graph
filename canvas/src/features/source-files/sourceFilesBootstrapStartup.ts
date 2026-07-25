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

type BootstrapWorkspaceMaterializationArgs = {
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
  const fs = args.fs || await getWorkspaceFs()
  const startup = args.startupState || await resolveInitialWorkspaceStartupState({ fs })
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
      }).mergedSourceFiles
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
  for (let attempt = 0; attempt < BOOTSTRAP_MATERIALIZATION_MAX_ATTEMPTS; attempt += 1) {
    const context = await prepareBootstrapWorkspaceMaterialization({
      ...args,
      startupState: attempt === 0 ? args.startupState : undefined,
    })
    if (hasBootstrapActivePathDrifted(context.startupActivePath)) continue
    const workspaceEntries = readReusableWorkspaceEntriesSnapshot(context.hydratedEntries)
    await materializeActiveWorkspaceEntryIntoSourceFiles({
      activePathOverride: context.startupActivePath,
      fs: context.workspaceFs,
      activeWorkspaceEntriesSnapshot: workspaceEntries,
      sourcesByPath: context.startupSourcesByPath,
      premergedSourceFiles: context.mergedSourceFiles,
      applyToGraph: true,
    })
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
