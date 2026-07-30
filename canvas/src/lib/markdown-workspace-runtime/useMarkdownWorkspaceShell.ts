import React from 'react'
import { registerMarkdownWorkspaceActionBridge } from '@/features/markdown-explorer/workspaceActionBridge'
import type { WorkspaceFileActions } from '@/features/markdown-workspace/useWorkspaceFileActions/types'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import { buildMarkdownWorkspaceActionBridge } from './markdownWorkspaceRuntime.composition'

import { clearRuntimeTimeout, scheduleRuntimeTimeout } from './markdownWorkspaceRuntime.shared'

export function useMarkdownWorkspaceShell(args: {
  active: boolean
  refreshWorkspace: () => Promise<unknown>
  highlightedLineRange: unknown
  setHighlightedLineRange: (value: null) => void
  workspaceRootRef: React.MutableRefObject<HTMLElement | null>
  fileActions: WorkspaceFileActions
  createParentPath: WorkspacePath
  saveEnabled: boolean
  saveActiveFileNow: () => Promise<void> | void
  setStatusWithAutoClear: (label: string, ttlMs?: number) => void
}) {
  const {
    active,
    refreshWorkspace,
    highlightedLineRange,
    setHighlightedLineRange,
    workspaceRootRef,
    fileActions,
    createParentPath,
    saveEnabled,
    saveActiveFileNow,
    setStatusWithAutoClear,
  } = args

  React.useEffect(() => {
    if (active) void refreshWorkspace()
  }, [active, refreshWorkspace])

  React.useEffect(() => {
    if (!highlightedLineRange) return
    const id = scheduleRuntimeTimeout(() => setHighlightedLineRange(null), 1500)
    return () => clearRuntimeTimeout(id)
  }, [highlightedLineRange, setHighlightedLineRange])

  const toggleFullscreen = React.useCallback(() => {
    const el = workspaceRootRef.current
    if (!el) return
    try {
      const doc = document as Document & { fullscreenElement?: Element | null; exitFullscreen?: () => Promise<void> }
      if (doc.fullscreenElement) {
        void doc.exitFullscreen?.()
        return
      }
      const requestFullscreen = (el as HTMLElement & { requestFullscreen?: () => Promise<void> }).requestFullscreen
      void requestFullscreen?.call(el)
    } catch {
      void 0
    }
  }, [workspaceRootRef])

  const actionBridge = React.useMemo(
    () => buildMarkdownWorkspaceActionBridge({
      fileActions,
      createParentPath,
      saveEnabled,
      saveActiveFileNow,
    }),
    [createParentPath, fileActions, saveActiveFileNow, saveEnabled],
  )

  React.useEffect(() => {
    return registerMarkdownWorkspaceActionBridge('markdown-workspace-explorer', actionBridge)
  }, [actionBridge])

  return {
    setStatusWithAutoClear,
    toggleFullscreen,
  }
}
