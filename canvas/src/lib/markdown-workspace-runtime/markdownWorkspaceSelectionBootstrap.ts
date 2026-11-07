import { resolvePreviousWorkspacePath } from '@/features/workspace-fs/websiteCollections'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import {
  CUSTOM_TEST_VALIDATION_WORKSPACE_SEED_ACTIVE,
  DEFAULT_TEST_VALIDATION_WORKSPACE_SEED_REL_PATH,
  resolveWorkspaceStartupActivePath,
  TEST_VALIDATION_WORKSPACE_SEED_REL_PATH,
} from '@/features/workspace-fs/workspaceFs'
import { hasWorkspaceEntry, type WorkspaceEntriesIndex } from './workspaceEntriesIndex'
import { resolveMarkdownWorkspaceDocsMirrorCanonicalPath } from './markdownWorkspaceSelectionCanonicalPath'
import { normalizeMarkdownWorkspaceSelectionPath } from './markdownWorkspaceSelectionPath'

export type MarkdownWorkspaceActivePathRequest = { path: WorkspacePath; atMs: number } | null

export function resolveMarkdownWorkspaceBootstrapActivePath(args: {
  entriesIndex: WorkspaceEntriesIndex
  activePath: WorkspacePath | null
  lastSetActivePath: MarkdownWorkspaceActivePathRequest
  lastRequestedActivePath: MarkdownWorkspaceActivePathRequest
  nowMs?: number
}): WorkspacePath | null {
  if (!args.entriesIndex.byPath.size) return null
  const canonicalize = (path: WorkspacePath | null | undefined): WorkspacePath | null => {
    const normalized = normalizeMarkdownWorkspaceSelectionPath(path || null)
    if (!normalized) return null
    return resolveMarkdownWorkspaceDocsMirrorCanonicalPath(normalized, args.entriesIndex)
      || (!hasWorkspaceEntry(args.entriesIndex, normalized) && resolvePreviousWorkspacePath(normalized, args.entriesIndex.byPath.values())) || normalized
  }
  const activePath = canonicalize(args.activePath)
  const rawActivePath = normalizeMarkdownWorkspaceSelectionPath(args.activePath)

  if (rawActivePath && activePath !== rawActivePath && activePath && hasWorkspaceEntry(args.entriesIndex, activePath)) return activePath

  const preferCustomValidationSeed =
    CUSTOM_TEST_VALIDATION_WORKSPACE_SEED_ACTIVE &&
    TEST_VALIDATION_WORKSPACE_SEED_REL_PATH !== DEFAULT_TEST_VALIDATION_WORKSPACE_SEED_REL_PATH

  // A remounted Explorer may have only a partial inventory. Its default starter
  // cannot replace a non-empty document selection owned by the existing session.
  if ((!rawActivePath && !args.lastSetActivePath) || preferCustomValidationSeed) {
    const startupPath = resolveWorkspaceStartupActivePath({
      workspaceFilePaths: args.entriesIndex.filePaths,
      activePath: args.activePath,
      preferDefaultStarter: true,
      forceValidationSeedIfPresent: preferCustomValidationSeed,
    })
    const canonicalStartupPath = canonicalize(startupPath)
    if (canonicalStartupPath && canonicalStartupPath !== activePath) return canonicalStartupPath
  }

  if (rawActivePath && activePath && rawActivePath !== activePath && hasWorkspaceEntry(args.entriesIndex, activePath)) {
    return activePath
  }
  if (rawActivePath && hasWorkspaceEntry(args.entriesIndex, rawActivePath)) return null
  if (activePath && hasWorkspaceEntry(args.entriesIndex, activePath)) return null

  const nowMs = typeof args.nowMs === 'number' ? args.nowMs : Date.now()
  const isRecentlyRequested = (request: MarkdownWorkspaceActivePathRequest) =>
    !!(activePath && canonicalize(request?.path) === activePath && nowMs - request.atMs < 2000)

  if (isRecentlyRequested(args.lastRequestedActivePath) || isRecentlyRequested(args.lastSetActivePath)) {
    return null
  }
  if (rawActivePath || activePath) return null

  return canonicalize(args.entriesIndex.firstFilePath) || args.entriesIndex.firstFilePath
}
