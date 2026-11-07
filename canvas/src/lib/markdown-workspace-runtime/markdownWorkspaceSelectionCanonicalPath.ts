import { resolvePreviousWorkspacePath } from '@/features/workspace-fs/websiteCollections'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import { hasWorkspaceFileEntry, type WorkspaceEntriesIndex } from './workspaceEntriesIndex'

export function resolveMarkdownWorkspaceDocsMirrorCanonicalPath(
  path: WorkspacePath,
  entriesIndex: WorkspaceEntriesIndex,
): WorkspacePath | null {
  const normalized = String(path || '').trim()
  if (!normalized || normalized.startsWith('/docs/')) return null
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length !== 1) return null
  const basename = String(parts[0] || '').trim()
  if (!basename || !/\.md$/i.test(basename)) return null
  const docsPath = `/docs/${basename}` as WorkspacePath
  return hasWorkspaceFileEntry(entriesIndex, docsPath) ? docsPath : null
}

export function resolveMarkdownWorkspaceCanonicalSelection(args: {
  activePath: WorkspacePath | null
  selectionPath: WorkspacePath | null
  entriesIndex: WorkspaceEntriesIndex
}): { activePath: WorkspacePath; selectionPath: WorkspacePath | null } | null {
  const path = String(args.activePath || '').trim()
  if (!path) return null

  const canonicalPath = !hasWorkspaceFileEntry(args.entriesIndex, path)
    ? resolvePreviousWorkspacePath(path, args.entriesIndex.byPath.values())
      || resolveMarkdownWorkspaceDocsMirrorCanonicalPath(path as WorkspacePath, args.entriesIndex)
    : resolveMarkdownWorkspaceDocsMirrorCanonicalPath(path as WorkspacePath, args.entriesIndex)
  if (!canonicalPath || canonicalPath === path) return null
  if (!hasWorkspaceFileEntry(args.entriesIndex, canonicalPath)) return null

  return {
    activePath: canonicalPath,
    selectionPath: args.selectionPath === path ? canonicalPath : null,
  }
}
