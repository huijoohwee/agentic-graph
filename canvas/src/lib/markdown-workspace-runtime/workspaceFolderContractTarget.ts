import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import type { FolderModeContract } from './markdownWorkspaceRuntime.shared'
import {
  hasWorkspaceFileEntry,
  type WorkspaceEntriesIndex,
} from './workspaceEntriesIndex'

export function resolveWorkspaceFolderContractDocumentPath(
  folderPath: WorkspacePath,
  mode: FolderModeContract,
): WorkspacePath {
  const normalized = normalizeWorkspacePath(folderPath)
  const leaf = mode === 'user-journey' ? 'repo.user-journey.md' : 'repo.sitemap.md'
  return normalizeWorkspacePath(`${normalized.replace(/\/+$/, '')}/${leaf}`)
}

export function resolveWorkspaceFolderContractTargetPath(args: Readonly<{
  entriesIndex: WorkspaceEntriesIndex
  folderPath: WorkspacePath
  preferredMode: FolderModeContract
}>): WorkspacePath | null {
  const preferred = resolveWorkspaceFolderContractDocumentPath(
    args.folderPath,
    args.preferredMode,
  )
  if (hasWorkspaceFileEntry(args.entriesIndex, preferred)) return preferred

  const alternateMode: FolderModeContract = args.preferredMode === 'sitemap'
    ? 'user-journey'
    : 'sitemap'
  const alternate = resolveWorkspaceFolderContractDocumentPath(
    args.folderPath,
    alternateMode,
  )
  if (hasWorkspaceFileEntry(args.entriesIndex, alternate)) return alternate

  // Regular folder expansion is navigation, not authority to materialize an
  // arbitrary descendant over the currently active document.
  return null
}
