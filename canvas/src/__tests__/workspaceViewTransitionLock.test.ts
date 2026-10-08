import { useGraphStore } from '@/hooks/useGraphStore'

export function testWorkspaceCloseCompletesDuringLayoutLock() {
  const previous = useGraphStore.getState()
  const restore = {
    workspaceViewMode: previous.workspaceViewMode,
    workspaceCanvasPaneOpen: previous.workspaceCanvasPaneOpen,
    workspaceGraphMutationLayoutLockActive: previous.workspaceGraphMutationLayoutLockActive,
    workspaceGraphMutationBlockUntilMs: previous.workspaceGraphMutationBlockUntilMs,
    workspaceGraphMutationBlockKey: previous.workspaceGraphMutationBlockKey,
    markdownWorkspaceIndexingInFlight: previous.markdownWorkspaceIndexingInFlight,
  }
  try {
    useGraphStore.setState({
      workspaceViewMode: 'editor',
      workspaceCanvasPaneOpen: true,
      workspaceGraphMutationLayoutLockActive: true,
      workspaceGraphMutationBlockUntilMs: 0,
      workspaceGraphMutationBlockKey: '',
      markdownWorkspaceIndexingInFlight: false,
    } as never)

    useGraphStore.getState().setWorkspaceViewState({ mode: 'canvas', paneOpen: false })
    const closed = useGraphStore.getState()
    if (closed.workspaceViewMode !== 'canvas' || closed.workspaceCanvasPaneOpen !== false) {
      throw new Error('expected an explicit Workspace close to complete during a layout lock')
    }
    if (!closed.workspaceGraphMutationBlockKey || closed.workspaceGraphMutationBlockUntilMs <= Date.now()) {
      throw new Error('expected the close to stamp its graph-mutation transition guard')
    }

    closed.setWorkspaceViewState({ mode: 'editor', paneOpen: true })
    const blockedOpen = useGraphStore.getState()
    if (blockedOpen.workspaceViewMode !== 'canvas' || blockedOpen.workspaceCanvasPaneOpen !== false) {
      throw new Error('expected the layout lock to continue blocking Workspace open transitions')
    }
  } finally {
    useGraphStore.setState(restore as never)
  }
}
