import React from 'react'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import { ancestorPathsForWorkspacePath, normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { MARKDOWN_EXPLORER_OPEN_SOURCE_FILES_EVENT } from '@/features/markdown/ui/useMarkdownExplorerSectionCollapseState'
import { isWebsiteImportExplorerUpdate } from '@/features/workspace-fs/websiteImportRefreshGuard'

export function useMarkdownWorkspaceOpenSourceFilesEvent(args: {
  setExplorerOpen: (value: boolean) => void
  setSourceFilesCollapsed: (value: boolean) => void
  setExpandedPaths: (updater: (previous: Set<WorkspacePath>) => Set<WorkspacePath>) => void
  refresh: (options?: { silent?: boolean }) => Promise<unknown> | unknown
}) {
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const handleOpenSourceFiles = (event: Event) => {
      args.setExplorerOpen(true)
      args.setSourceFilesCollapsed(false)
      const rawPath = (event as CustomEvent<{ path?: unknown }>).detail?.path
      const path = typeof rawPath === 'string' && rawPath.trim() ? normalizeWorkspacePath(rawPath) as WorkspacePath : null
      if (!path) return
      args.setExpandedPaths(previous => {
        const next = new Set(previous)
        for (const ancestor of ancestorPathsForWorkspacePath(path)) next.add(ancestor)
        return next
      })
      if (!isWebsiteImportExplorerUpdate(path)) void args.refresh({ silent: true })
    }
    window.addEventListener(MARKDOWN_EXPLORER_OPEN_SOURCE_FILES_EVENT, handleOpenSourceFiles)
    return () => window.removeEventListener(MARKDOWN_EXPLORER_OPEN_SOURCE_FILES_EVENT, handleOpenSourceFiles)
  }, [args.refresh, args.setExpandedPaths, args.setExplorerOpen, args.setSourceFilesCollapsed])
}
