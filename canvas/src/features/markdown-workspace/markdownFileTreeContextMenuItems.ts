import { buildCanvasEmbedIframeMarkup } from '@/features/canvas/canvasEmbedIframeMarkup'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import { isInitializationWorkspacePath } from '@/features/workspace-fs/workspaceFs'
import { WORKSPACE_ROOT_PATH } from '@/features/workspace-fs/path'

export type MarkdownFileTreeContextMenuItem = {
  key: 'shareUrl' | 'shareCanvasEmbed' | 'reveal' | 'copyPath' | 'copyRelativePath' | 'newFile' | 'clear' | 'rename' | 'delete'
  label: string
  tone?: 'default' | 'danger'
  onSelect: () => void | Promise<void>
}

type BuildMarkdownFileTreeContextMenuItemsArgs = {
  entry: WorkspaceEntry
  copyToClipboard: (text: string) => Promise<boolean>
  buildShareUrl?: (entry: WorkspaceEntry) => string | null | Promise<string | null>
  buildCanvasEmbedUrl?: (entry: WorkspaceEntry) => string | null | Promise<string | null>
  onCanvasEmbedStart?: (entry: WorkspaceEntry) => void
  onCanvasEmbedReady?: (entry: WorkspaceEntry, url: string) => void
  onShareCodeReady?: (detail: { sourceName: string; title: string; language: string; code: string }) => void
  promptShareUrl?: (url: string) => void
  onShareUrlError?: (message: string) => void
  onCreateNewFile?: (parentPath: WorkspacePath) => void
  onRevealInFinder?: (path: WorkspacePath) => void
  onClearFile?: (path: WorkspacePath) => void
  onRenameEntry?: (path: WorkspacePath, nextName: string) => void
  onDeleteEntry?: (path: WorkspacePath) => void
  closeContextMenu: () => void
  promptRename?: (currentName: string) => string | null
  confirmDelete?: (entryPath: string) => boolean
}

export function buildMarkdownFileTreeContextMenuItems(
  args: BuildMarkdownFileTreeContextMenuItemsArgs,
): MarkdownFileTreeContextMenuItem[] {
  const promptRename = args.promptRename || (currentName => window.prompt('Rename', currentName))
  const confirmDelete = args.confirmDelete || (entryPath => window.confirm(`Delete ${entryPath}?`))
  const entryPath = args.entry.path
  const isInitializationEntry = isInitializationWorkspacePath(entryPath)

  const items: MarkdownFileTreeContextMenuItem[] = [
    {
      key: 'shareUrl',
      label: 'Share URL',
      onSelect: () => {
        void resolveAndShareUrl({
          buildUrl: () => args.buildShareUrl?.(args.entry) || null,
          copyToClipboard: args.copyToClipboard,
          promptShareUrl: args.promptShareUrl,
          onShareUrlError: args.onShareUrlError,
          unavailableMessage: 'Share URL is unavailable because the file could not be published.',
          onResolved: url => args.onShareCodeReady?.({
            sourceName: args.entry.name || args.entry.path,
            title: 'Share URL',
            language: 'plaintext',
            code: url,
          }),
          allowNativeShare: false,
        })
        args.closeContextMenu()
      },
    },
    {
      key: 'reveal',
      label: 'Reveal in Finder',
      onSelect: () => {
        args.onRevealInFinder?.(entryPath)
        args.closeContextMenu()
      },
    },
    {
      key: 'copyPath',
      label: 'Copy Path',
      onSelect: () => {
        void args.copyToClipboard(entryPath)
        args.onShareCodeReady?.({
          sourceName: args.entry.name || args.entry.path,
          title: 'Copy Path',
          language: 'plaintext',
          code: entryPath,
        })
        args.closeContextMenu()
      },
    },
    {
      key: 'copyRelativePath',
      label: 'Copy Relative Path',
      onSelect: () => {
        const relative = String(entryPath || '').replace(/^\/+/, '')
        void args.copyToClipboard(relative)
        args.onShareCodeReady?.({
          sourceName: args.entry.name || args.entry.path,
          title: 'Copy Relative Path',
          language: 'plaintext',
          code: relative,
        })
        args.closeContextMenu()
      },
    },
  ]

  if (args.entry.kind === 'file') {
    items.splice(1, 0, {
      key: 'shareCanvasEmbed',
      label: 'Share canvas embed',
      onSelect: () => {
        args.onCanvasEmbedStart?.(args.entry)
        void resolveAndShareUrl({
          buildUrl: () => args.buildCanvasEmbedUrl?.(args.entry) || null,
          copyToClipboard: args.copyToClipboard,
          promptShareUrl: args.promptShareUrl,
          onShareUrlError: args.onShareUrlError,
          unavailableMessage: 'Canvas embed URL is unavailable because the file could not be published.',
          onResolved: url => args.onCanvasEmbedReady?.(args.entry, url),
          buildShareText: buildCanvasEmbedIframeMarkup,
          allowNativeShare: false,
          promptTitle: 'Copy canvas iframe embed',
        })
        args.closeContextMenu()
      },
    })
  }

  if (args.onCreateNewFile) {
    items.push({
      key: 'newFile',
      label: 'New file',
      onSelect: () => {
        const parentPath = args.entry.kind === 'folder'
          ? args.entry.path
          : args.entry.parentPath || WORKSPACE_ROOT_PATH
        args.onCreateNewFile?.(parentPath)
        args.closeContextMenu()
      },
    })
  }

  if (args.entry.kind === 'file' && args.onClearFile) {
    items.push({
      key: 'clear',
      label: 'Clear',
      onSelect: () => {
        args.onClearFile?.(entryPath)
        args.closeContextMenu()
      },
    })
  }

  if (!isInitializationEntry) {
    items.push({
      key: 'rename',
      label: 'Rename',
      onSelect: () => {
        const current = String(args.entry.name || '').trim()
        const next = promptRename(current)
        if (!next || String(next).trim() === current) {
          args.closeContextMenu()
          return
        }
        args.onRenameEntry?.(entryPath, String(next).trim())
        args.closeContextMenu()
      },
    })
    items.push({
      key: 'delete',
      label: 'Delete',
      tone: 'danger',
      onSelect: () => {
        if (!confirmDelete(entryPath)) {
          args.closeContextMenu()
          return
        }
        args.onDeleteEntry?.(entryPath)
        args.closeContextMenu()
      },
    })
  }

  return items
}

async function resolveAndShareUrl(args: {
  buildUrl: () => string | null | Promise<string | null>
  copyToClipboard: (text: string) => Promise<boolean>
  promptShareUrl?: (url: string) => void
  onShareUrlError?: (message: string) => void
  unavailableMessage: string
  onResolved?: (url: string) => void
  buildShareText?: (url: string) => string | null
  allowNativeShare?: boolean
  promptTitle?: string
}): Promise<void> {
  try {
    const url = await Promise.resolve(args.buildUrl() || null)
    if (!url) {
      notifyShareUrlError(args.onShareUrlError, args.unavailableMessage)
      return
    }
    const shareText = args.buildShareText ? args.buildShareText(url) : url
    if (!shareText) {
      notifyShareUrlError(args.onShareUrlError, args.unavailableMessage)
      return
    }
    await shareOrCopyUrl(url, args.copyToClipboard, args.promptShareUrl, {
      shareText,
      allowNativeShare: args.allowNativeShare,
      promptTitle: args.promptTitle,
    })
    args.onResolved?.(url)
  } catch (error) {
    notifyShareUrlError(args.onShareUrlError, args.unavailableMessage, error)
  }
}

function notifyShareUrlError(
  onShareUrlError: ((message: string) => void) | undefined,
  fallbackMessage: string,
  error?: unknown,
): void {
  const errorMessage = error instanceof Error ? String(error.message || '').trim() : ''
  const message = errorMessage || fallbackMessage
  if (typeof onShareUrlError === 'function') {
    onShareUrlError(message)
    return
  }
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(message)
  }
}

async function shareOrCopyUrl(
  url: string,
  copyToClipboard: (text: string) => Promise<boolean>,
  promptShareUrl?: (url: string) => void,
  options: {
    shareText?: string
    allowNativeShare?: boolean
    promptTitle?: string
  } = {},
): Promise<void> {
  if (options.allowNativeShare !== false && typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: 'AgenticGraph Document', url })
      return
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
    }
  }
  const shareText = options.shareText || url
  const copied = await copyToClipboard(shareText)
  if (copied) return
  if (typeof promptShareUrl === 'function') {
    promptShareUrl(shareText)
    return
  }
  if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
    window.prompt(options.promptTitle || 'Share URL', shareText)
  }
}
