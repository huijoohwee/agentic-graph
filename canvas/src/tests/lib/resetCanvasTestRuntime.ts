import { resetBrowserLocalSurfaceSnapshotsForTests } from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import { resetCameraFramingRuntimeForTests } from '@/features/strybldr/cameraFramingRuntime'
import { setMediaCatalogMode } from '@/features/command-menu/mediaCatalogModeRuntime'
import { resetGraphStoreForTests, useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'
import { resetGlobalUserSelectLock } from '@/lib/canvas/interaction-user-select'
import { resetSpacePanHeldForTests } from '@/lib/canvas/space-pan'
import { resetJsdomHarnessAnimationFramesForTests, restoreActiveJsdomGlobalsForTests } from '@/tests/lib/jsdomHarness'

const clearDocumentSurface = (): void => {
  if (typeof document === 'undefined') return
  try {
    document.body?.replaceChildren()
  } catch {
    try {
      if (document.body) document.body.innerHTML = ''
    } catch {
      void 0
    }
  }
  try {
    document.body?.removeAttribute('style')
    document.body?.className && document.body.removeAttribute('class')
  } catch {
    void 0
  }
  try {
    document.documentElement?.removeAttribute('style')
    document.documentElement?.className && document.documentElement.removeAttribute('class')
  } catch {
    void 0
  }
  try {
    const selection = typeof window !== 'undefined' && typeof window.getSelection === 'function'
      ? window.getSelection()
      : null
    selection?.removeAllRanges?.()
  } catch {
    void 0
  }
}

const clearBrowserStorage = (): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage?.clear?.()
  } catch {
    void 0
  }
  try {
    window.sessionStorage?.clear?.()
  } catch {
    void 0
  }
}

export const resetCanvasTestRuntime = (): void => {
  resetJsdomHarnessAnimationFramesForTests()
  resetSpacePanHeldForTests()
  restoreActiveJsdomGlobalsForTests()
  resetGlobalUserSelectLock()
  resetBrowserLocalSurfaceSnapshotsForTests()
  resetCameraFramingRuntimeForTests()
  // Media mode lives outside the graph store and must not survive a failed case.
  setMediaCatalogMode('media')
  // Product reset preserves preferences. Release the renderer and request state
  // owned by the preceding fixture without replacing live runtime controllers.
  // A failed document activation must not redirect the next graph through its old source.
  const { canvas2dRenderer, canvasRenderMode, canvas3dMode, chatAuthMode, chatApiKey, chatMessagesJson, markdownDocumentName, markdownDocumentText, markdownDocumentSourceUrl, markdownDocumentApplyViewPreset } = useGraphStore.getInitialState()
  useGraphStore.setState({ canvas2dRenderer, canvasRenderMode, canvas3dMode, chatAuthMode, chatApiKey, chatMessagesJson, markdownDocumentName, markdownDocumentText, markdownDocumentSourceUrl, markdownDocumentApplyViewPreset, uiToasts: [], uiLogEntries: [] })
  useMarkdownExplorerStore.setState({
    ...useMarkdownExplorerStore.getInitialState(),
    activePath: null,
    requestedRevealLine: null,
    lastSetActivePath: null,
  }, true)
  resetGraphStoreForTests()
  clearDocumentSurface()
  clearBrowserStorage()
}

// Own wall-clock observation while leaving the native transition guard and timers intact.
export const createGraphMutationTransitionClock = () => {
  const originalNow = Date.now
  let nowMs = originalNow()
  const controlledNow = () => nowMs
  Date.now = controlledNow
  return {
    expectBlockedThenAdvance(mutate: () => void): void {
      const state = useGraphStore.getState()
      const untilMs = state.workspaceGraphMutationBlockUntilMs
      if (!Number.isFinite(untilMs) || untilMs <= nowMs || !isWorkspaceGraphMutationBlocked(state)) {
        throw new Error('expected the native active-document transition to protect mutations')
      }
      const before = JSON.stringify([state.graphData, state.sourceFiles, state.markdownDocumentText])
      mutate()
      const blocked = useGraphStore.getState()
      if (JSON.stringify([blocked.graphData, blocked.sourceFiles, blocked.markdownDocumentText]) !== before) {
        throw new Error('expected an edit during document transition to preserve graph and source bytes')
      }
      nowMs = untilMs + 1
      if (isWorkspaceGraphMutationBlocked(useGraphStore.getState())) {
        throw new Error('expected native graph mutation readiness after the transition deadline')
      }
    },
    restore(): void {
      if (Date.now === controlledNow) Date.now = originalNow
    },
  }
}
