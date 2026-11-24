import { create } from 'zustand'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import { LS_KEYS } from '@/lib/config'
import { lsJson, lsSetJson } from '@/lib/persistence'
import { normalizeMarkdownWorkspaceSelectionPath } from '@/lib/markdown-workspace-runtime/markdownWorkspaceSelectionPath'
import { isInitializationWorkspacePath } from '@/features/workspace-fs/workspaceFs'
import {
  readLocalDocDeepLinkPathFromCurrentLocation,
  setLocalDocDeepLinkPath,
} from '@/features/canvas/canvasDocDeepLink'

export type MarkdownExplorerInitialPathSource = 'deep-link' | 'persisted'

export function resolveInitialMarkdownExplorerActivePath(
  value: unknown,
  source: MarkdownExplorerInitialPathSource = 'persisted',
): WorkspacePath | null {
  const v = typeof value === 'string' ? value : null
  if (!v) return null
  try {
    const normalized = normalizeMarkdownWorkspaceSelectionPath(v as WorkspacePath)
    return source === 'persisted' && isInitializationWorkspacePath(normalized) ? null : normalized
  } catch {
    return null
  }
}

type MarkdownExplorerState = {
  activePath: WorkspacePath | null
  requestedRevealLine: number | null
  lastSetActivePath: { path: WorkspacePath; atMs: number } | null
  setActivePath: (path: WorkspacePath | null) => void
  requestRevealLine: (line: number | null) => void
}

function readInitialMarkdownExplorerActivePath(): WorkspacePath | null {
  const deepLinkPath = resolveInitialMarkdownExplorerActivePath(
    readLocalDocDeepLinkPathFromCurrentLocation(),
    'deep-link',
  )
  if (deepLinkPath) return deepLinkPath
  return lsJson(
    LS_KEYS.markdownExplorerActivePath,
    null as WorkspacePath | null,
    resolveInitialMarkdownExplorerActivePath,
  )
}

export const useMarkdownExplorerStore = create<MarkdownExplorerState>(set => ({
  activePath: readInitialMarkdownExplorerActivePath(),
  requestedRevealLine: null,
  lastSetActivePath: null,
  setActivePath: (path: WorkspacePath | null) => {
    const normalized = normalizeMarkdownWorkspaceSelectionPath(path)
    set(prev => {
      if (prev.activePath === normalized) return prev
      setLocalDocDeepLinkPath(normalized)
      lsSetJson(LS_KEYS.markdownExplorerActivePath, normalized)
      return {
        activePath: normalized,
        lastSetActivePath: normalized ? { path: normalized, atMs: Date.now() } : null,
      }
    })
  },
  requestRevealLine: (line: number | null) =>
    set({ requestedRevealLine: typeof line === 'number' && Number.isFinite(line) ? Math.max(1, Math.floor(line)) : null }),
}))
