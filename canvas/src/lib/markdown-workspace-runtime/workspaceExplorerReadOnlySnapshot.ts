import {
  buildMaterializedWorkspaceForceIncludePaths,
  hydrateWorkspaceEntriesInlineText,
} from '@/features/source-files/sourceFilesRuntimeShared'
import {
  resolveWorkspaceSourceIndexSnapshot,
  type WorkspaceSourceIndex,
} from '@/features/workspace-fs/sourceIndex'
import type { WorkspaceEntry, WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import { pruneWorkspaceEntriesForInlineSnapshot } from './markdownWorkspaceRuntime.shared'

export type WorkspaceExplorerReadOnlySnapshot = Readonly<{
  entries: WorkspaceEntry[]
  sourcesByPath: WorkspaceSourceIndex
}>

/**
 * Reads the current workspace without mutating its seed or Source Files projection.
 *
 * Flight holds the seed-sync fence while its authored runtime is active. The Explorer
 * can still show the local snapshot during that interval; normal seed/materialization
 * work resumes through the caller's existing deferred refresh lifecycle.
 */
export async function readWorkspaceExplorerReadOnlySnapshot(args: {
  fs: WorkspaceFs
  activePath: WorkspacePath | null
  sourcesByPath?: WorkspaceSourceIndex | null
}): Promise<WorkspaceExplorerReadOnlySnapshot> {
  const entries = await args.fs.listEntries()
  const hydratedEntries = await hydrateWorkspaceEntriesInlineText({
    fs: args.fs,
    workspaceEntries: entries,
    forceIncludePaths: buildMaterializedWorkspaceForceIncludePaths({
      activePathOverride: args.activePath,
    }),
  })
  return {
    entries: pruneWorkspaceEntriesForInlineSnapshot(hydratedEntries),
    sourcesByPath: resolveWorkspaceSourceIndexSnapshot(args.sourcesByPath),
  }
}
