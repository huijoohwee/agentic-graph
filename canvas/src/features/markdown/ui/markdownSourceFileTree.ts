import { buildSourceFileTree, type SourceFileListItemLike } from 'agentic-design-system/source-explorer'
import { isLegacyWorkspaceSourcePath } from '@/features/workspace-fs/workspaceLegacySourceRoots'

export {
  SOURCE_FOLDER_ROOT_PATH as MARKDOWN_SOURCE_FOLDER_ROOT_PATH,
  expandSourceFolderAncestors as expandMarkdownSourceFolderAncestors,
  flattenVisibleSourceFileTree as flattenVisibleMarkdownSourceFileTree,
  listPersistedSourceFolderPaths as listPersistedMarkdownSourceFolderPaths,
  normalizeSourceFolderPath as normalizeMarkdownSourceFolderPath,
  resolveSourceParentFolderPath as resolveMarkdownSourceParentFolderPath,
  toggleSourceFolderPath as toggleMarkdownSourceFolderPath,
  type SourceFileListItemLike as MarkdownSourceFileListItemLike,
  type SourceFileTreeNode as MarkdownSourceFileTreeNode,
  type VisibleSourceFileTreeNode as VisibleMarkdownSourceFileTreeNode,
} from 'agentic-design-system/source-explorer'

// Generated run records are addressable in Graph but excluded from authored documents.
export function isLegacyGeneratedMarkdownSourcePath(name: string): boolean {
  const normalized = String(name || '').trim().replaceAll('\\', '/')
  return isLegacyWorkspaceSourcePath(normalized) || /^chat-log$/i.test(normalized.split('/').filter(Boolean)[0] || '')
}

export function buildMarkdownSourceFileTree(files: ReadonlyArray<SourceFileListItemLike> | undefined) {
  return buildSourceFileTree(files?.filter(file => !isLegacyGeneratedMarkdownSourcePath(file?.name)))
}
