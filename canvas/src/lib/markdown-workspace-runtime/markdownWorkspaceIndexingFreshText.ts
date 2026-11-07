import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import { isMarkdownPath } from '@/features/markdown-workspace/markdownWorkspaceUtils'

type MarkdownWorkspaceIndexingLoadedText = { path: WorkspacePath; text: string } | null

export function resolveMarkdownWorkspaceIndexingFreshText(args: {
  path: WorkspacePath
  nextText: string
  scheduledLastLoaded: MarkdownWorkspaceIndexingLoadedText
  liveLoaded: MarkdownWorkspaceIndexingLoadedText
  liveMarkdownDocumentName?: string | null
  liveMarkdownDocumentText?: string | null
}): string {
  const path = normalizeWorkspacePath(args.path)
  let nextText = String(args.nextText || '')
  const liveLoaded = args.liveLoaded
  if (
    liveLoaded &&
    liveLoaded !== args.scheduledLastLoaded &&
    normalizeWorkspacePath(liveLoaded.path) === path &&
    String(liveLoaded.text || '') !== nextText
  ) {
    nextText = String(liveLoaded.text || '')
  }

  const liveName = normalizeWorkspacePath(String(args.liveMarkdownDocumentName || '').trim())
  const liveText = String(args.liveMarkdownDocumentText || '')
  // Other source formats own their FS bytes; the Markdown display can be a restored snapshot.
  if (isMarkdownPath(path) && liveName === path && liveText && liveText !== nextText) {
    nextText = liveText
  }
  return nextText
}
