import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import type { WorkspaceEntry, WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import {
  CUSTOM_TEST_VALIDATION_WORKSPACE_SEED_ACTIVE,
  DEFAULT_TEST_VALIDATION_WORKSPACE_SEED_REL_PATH,
  resolveWorkspaceStartupActivePath,
  TEST_VALIDATION_WORKSPACE_SEED_PATH,
  TEST_VALIDATION_WORKSPACE_SEED_REL_PATH,
} from '@/features/workspace-fs/workspaceFs'
import { readWorkspaceSourceRootEntriesSnapshot } from '@/features/source-files/sourceFilesRuntimeActive'
import { resolveMaterializedWorkspaceActivePath } from '@/features/source-files/sourceFilesRuntimeMaterialization'
import { resolveMarkdownWorkspaceCanonicalSelection } from '@/lib/markdown-workspace-runtime/markdownWorkspaceSelectionCanonicalPath'
import { buildWorkspaceEntriesIndex, hasWorkspaceFileEntry } from '@/lib/markdown-workspace-runtime/workspaceEntriesIndex'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { runWorkspaceFsChangedBatch } from '@/features/workspace-fs/workspaceFsEvents'

export function buildInitialWorkspaceStartupSnapshot(args: {
  currentActivePath: WorkspacePath | null
  desiredActivePath: WorkspacePath | null
  workspaceEntries: WorkspaceEntry[]
  lastSetActivePath?: unknown
  preferCustomValidationSeed?: boolean
  sourceFilesMaterialized?: boolean
}): {
  activePath: WorkspacePath | null
  workspaceEntries: WorkspaceEntry[]
} {
  if (args.lastSetActivePath && args.sourceFilesMaterialized !== false && !args.preferCustomValidationSeed) {
    if (!args.desiredActivePath || args.desiredActivePath === args.currentActivePath) {
      return {
        activePath: args.currentActivePath,
        workspaceEntries: [],
      }
    }
  }
  return {
    activePath: args.desiredActivePath,
    workspaceEntries: args.workspaceEntries,
  }
}

function hasMaterializedWorkspaceSourceFiles(): boolean {
  const list = useGraphStore.getState().sourceFiles
  return Array.isArray(list) && list.some(file => String(file?.source?.path || '').startsWith('workspace:'))
}

export function resolveWorkspaceStartupCanonicalPath(args: {
  activePath: WorkspacePath | null
  workspaceEntries: WorkspaceEntry[]
}): WorkspacePath | null {
  const activePath = args.activePath
  if (!activePath) return null
  const canonicalSelection = resolveMarkdownWorkspaceCanonicalSelection({
    activePath,
    selectionPath: null,
    entriesIndex: buildWorkspaceEntriesIndex(Array.isArray(args.workspaceEntries) ? args.workspaceEntries : []),
  })
  return canonicalSelection?.activePath || activePath
}

export function resolveExistingWorkspaceStartupCanonicalPath(args: {
  activePath: WorkspacePath | null
  workspaceEntries: WorkspaceEntry[]
}): WorkspacePath | null {
  const canonicalPath = resolveWorkspaceStartupCanonicalPath(args)
  if (!canonicalPath) return null
  return hasWorkspaceFileEntry(buildWorkspaceEntriesIndex(args.workspaceEntries), canonicalPath)
    ? canonicalPath
    : null
}

export function resolveWorkspaceStartupActivePathToApply(args: {
  currentActivePath: WorkspacePath | null
  latestActivePath: WorkspacePath | null
  snapshotActivePath: WorkspacePath | null
  preferCustomValidationSeed?: boolean
}): WorkspacePath | null {
  if (!args.snapshotActivePath) return null
  if (
    !args.preferCustomValidationSeed &&
    args.latestActivePath &&
    args.latestActivePath !== args.currentActivePath &&
    args.latestActivePath !== args.snapshotActivePath
  ) {
    return null
  }
  return args.snapshotActivePath === args.latestActivePath ? null : args.snapshotActivePath
}

export function shouldInitializeWorkspaceStartupDefaultStarter(args: {
  activePath: WorkspacePath | null
  hasDesiredActiveText: boolean
  preferCustomValidationSeed?: boolean
}): boolean {
  return !args.activePath && !args.hasDesiredActiveText && !args.preferCustomValidationSeed
}

export function resolveWorkspaceStartupDefaultStarterPath(workspaceEntries: WorkspaceEntry[]): WorkspacePath | null {
  return resolveWorkspaceStartupActivePath({
    workspaceFilePaths: workspaceEntries.filter(entry => entry.kind === 'file').map(entry => entry.path),
    activePath: null,
    preferDefaultStarter: true,
  })
}

export function createWorkspaceStartupSourceRootEntriesReader(args: {
  fs: WorkspaceFs
  startupWorkspaceEntries: WorkspaceEntry[]
}): (activePath: WorkspacePath | null) => Promise<WorkspaceEntry[]> {
  const snapshotByActivePath = new Map<WorkspacePath, Promise<WorkspaceEntry[]>>()
  return async activePathRaw => {
    const activePath = normalizeWorkspacePath(activePathRaw)
    if (!activePath || activePath === '/') return args.startupWorkspaceEntries
    const cached = snapshotByActivePath.get(activePath)
    if (cached) return cached
    const snapshot = readWorkspaceSourceRootEntriesSnapshot({
      fs: args.fs,
      activePath,
      workspaceEntries: args.startupWorkspaceEntries,
    })
    snapshotByActivePath.set(activePath, snapshot)
    return snapshot
  }
}

async function readLateWorkspaceStartupSelection(fs: WorkspaceFs): Promise<{
  activePath: WorkspacePath | null
  workspaceEntries: WorkspaceEntry[]
}> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const selection = useMarkdownExplorerStore.getState()
    const selectedPath = resolveMaterializedWorkspaceActivePath({ explorerActivePath: selection.activePath })
    if (!selectedPath) return { activePath: null, workspaceEntries: [] }
    const selectionChanged = () => {
      const latest = useMarkdownExplorerStore.getState()
      return latest.activePath !== selection.activePath || latest.lastSetActivePath !== selection.lastSetActivePath
    }
    const entries = await fs.listEntries()
    if (selectionChanged()) continue
    const activePath = resolveExistingWorkspaceStartupCanonicalPath({ activePath: selectedPath, workspaceEntries: entries })
    if (!activePath) throw new Error(`Selected workspace file is unavailable during startup: ${selectedPath}`)
    // A file created after the startup snapshot needs its own persisted-byte proof.
    // Inline entries can outlive a deletion, and a later selection owns the next attempt.
    const text = await fs.readFileText(activePath)
    if (selectionChanged()) continue
    if (text === null) throw new Error(`Selected workspace file is unavailable during startup: ${activePath}`)
    if (activePath !== selectedPath) {
      selection.setActivePath(activePath)
      // Re-observe after canonicalization, including synchronous selection subscribers.
      continue
    }
    return buildInitialWorkspaceStartupSnapshot({
      currentActivePath: activePath,
      desiredActivePath: activePath,
      workspaceEntries: entries.map(entry => entry.kind === 'file' && normalizeWorkspacePath(entry.path) === activePath
        ? { ...entry, text }
        : entry),
      lastSetActivePath: selection.lastSetActivePath,
      sourceFilesMaterialized: hasMaterializedWorkspaceSourceFiles(),
    })
  }
  throw new Error('Workspace selection changed repeatedly during startup.')
}

export async function resolveInitialWorkspaceStartupState(args?: { fs?: WorkspaceFs }): Promise<{
  activePath: WorkspacePath | null
  workspaceEntries: WorkspaceEntry[]
}> {
  const explorer = useMarkdownExplorerStore.getState()
  const preferCustomValidationSeed =
    CUSTOM_TEST_VALIDATION_WORKSPACE_SEED_ACTIVE &&
    TEST_VALIDATION_WORKSPACE_SEED_REL_PATH !== DEFAULT_TEST_VALIDATION_WORKSPACE_SEED_REL_PATH
  const fs = args?.fs || await getWorkspaceFs()
  await fs.ensureSeed()
  // Source bootstrap must own installation before readiness; opening Explorer is read-only.
  const { ensureLearningLessonFiles } = await import('@/features/python-learning/learningLessonFiles')
  await runWorkspaceFsChangedBatch(() => ensureLearningLessonFiles(fs))
  const startupWorkspaceEntries = await fs.listEntries()
  const readStartupSourceRootEntries = createWorkspaceStartupSourceRootEntriesReader({
    fs,
    startupWorkspaceEntries,
  })
  const currentActivePath = resolveExistingWorkspaceStartupCanonicalPath({
    activePath: resolveMaterializedWorkspaceActivePath({ explorerActivePath: explorer.activePath }),
    workspaceEntries: startupWorkspaceEntries,
  })
  let desiredActivePath = preferCustomValidationSeed
    ? TEST_VALIDATION_WORKSPACE_SEED_PATH
    : currentActivePath
  desiredActivePath = resolveWorkspaceStartupCanonicalPath({
    activePath: desiredActivePath,
    workspaceEntries: startupWorkspaceEntries,
  })
  let workspaceEntries = desiredActivePath
    ? await readStartupSourceRootEntries(desiredActivePath)
    : startupWorkspaceEntries
  const hasDesiredActiveText = workspaceEntries.some(entry => entry?.kind === 'file' && entry.path === desiredActivePath && String(entry.text || '').trim())
  if (shouldInitializeWorkspaceStartupDefaultStarter({
    activePath: currentActivePath,
    hasDesiredActiveText,
    preferCustomValidationSeed,
  })) {
    desiredActivePath = resolveWorkspaceStartupCanonicalPath({
      activePath: resolveWorkspaceStartupDefaultStarterPath(startupWorkspaceEntries),
      workspaceEntries: startupWorkspaceEntries,
    })
    workspaceEntries = desiredActivePath
      ? await readStartupSourceRootEntries(desiredActivePath)
      : startupWorkspaceEntries
  }
  const latestExplorer = useMarkdownExplorerStore.getState()
  const latestSelectedPath = resolveMaterializedWorkspaceActivePath({ explorerActivePath: latestExplorer.activePath })
  const latestActivePath = resolveExistingWorkspaceStartupCanonicalPath({
    activePath: latestSelectedPath,
    workspaceEntries: startupWorkspaceEntries,
  })
  if (!preferCustomValidationSeed && !latestActivePath && (
    latestSelectedPath !== resolveMaterializedWorkspaceActivePath({ explorerActivePath: explorer.activePath })
    || latestExplorer.lastSetActivePath !== explorer.lastSetActivePath
  )) {
    return readLateWorkspaceStartupSelection(fs)
  }
  if (!preferCustomValidationSeed && latestActivePath && latestActivePath !== currentActivePath) {
    const latestWorkspaceEntries = latestActivePath === desiredActivePath
      ? workspaceEntries
      : await readStartupSourceRootEntries(latestActivePath)
    return buildInitialWorkspaceStartupSnapshot({
      currentActivePath: latestActivePath,
      desiredActivePath: latestActivePath,
      workspaceEntries: latestWorkspaceEntries,
      lastSetActivePath: latestExplorer.lastSetActivePath,
      preferCustomValidationSeed,
      sourceFilesMaterialized: hasMaterializedWorkspaceSourceFiles(),
    })
  }
  const snapshot = buildInitialWorkspaceStartupSnapshot({
    currentActivePath,
    desiredActivePath,
    workspaceEntries,
    lastSetActivePath: explorer.lastSetActivePath,
    preferCustomValidationSeed,
    sourceFilesMaterialized: hasMaterializedWorkspaceSourceFiles(),
  })
  const activePathToApply = resolveWorkspaceStartupActivePathToApply({
    currentActivePath,
    latestActivePath,
    snapshotActivePath: snapshot.activePath,
    preferCustomValidationSeed,
  })
  if (activePathToApply) {
    useMarkdownExplorerStore.getState().setActivePath(activePathToApply)
  }
  return snapshot
}
