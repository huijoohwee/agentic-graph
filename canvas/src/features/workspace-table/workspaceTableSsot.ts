import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import type { GraphData } from '@/lib/graph/types'
import { isReadOnlyAgentGraphProjection } from '@/features/agent-graph/agentGraphProjectionPolicy'
export {
  openMarkdownWorkspaceEditorPane,
  openWorkspaceEditorPane,
  type WorkspaceEditorOpenStore,
} from '@/features/workspace-table/workspaceEditorPane'

type WorkspaceViewMode = 'canvas' | 'editor'

const WORKSPACE_GRAPH_MUTATION_TRANSITION_BLOCK_MS = 360

export type WorkspaceGraphMutationState = {
  workspaceViewMode: WorkspaceViewMode
  workspaceCanvasPaneOpen: boolean
  graphData?: GraphData | null
  markdownWorkspaceIndexingInFlight?: boolean
  workspaceGraphMutationBlockUntilMs?: number
  workspaceGraphMutationBlockKey?: string
  workspaceGraphMutationLayoutLockActive?: boolean
}

type WorkspaceGraphMutationKeyArgs = WorkspaceGraphMutationState & {
  transitionSemanticKey?: string | null
}

export function isWorkspaceEditorOverlayOpen(args: {
  workspaceViewMode: WorkspaceViewMode
  workspaceCanvasPaneOpen: boolean
}): boolean {
  return args.workspaceViewMode === 'editor'
}

export function isWorkspaceGraphMutationBlocked(args: WorkspaceGraphMutationState): boolean {
  if (isReadOnlyAgentGraphProjection(args.graphData)) return true
  if (args.workspaceGraphMutationLayoutLockActive === true) return true
  if (isWorkspaceEditorOverlayOpen(args) || args.markdownWorkspaceIndexingInFlight === true) return true
  const untilMs = Number(args.workspaceGraphMutationBlockUntilMs || 0)
  return Number.isFinite(untilMs) && untilMs > Date.now()
}

export function buildWorkspaceGraphMutationBlockKey(args: WorkspaceGraphMutationKeyArgs): string {
  const transitionSemanticKey = String(args.transitionSemanticKey || '').trim()
  return buildScopedGraphSemanticKey('workspace-graph-mutation-block', {
    graphSemanticKey: [
      args.workspaceViewMode === 'editor' ? 'editor' : 'canvas',
      args.workspaceCanvasPaneOpen === true ? 'pane:1' : 'pane:0',
      args.markdownWorkspaceIndexingInFlight === true ? 'indexing:1' : 'indexing:0',
      transitionSemanticKey ? `transition:${transitionSemanticKey}` : 'transition:',
    ].join('|'),
  })
}

export function buildWorkspaceGraphMutationTransitionState(
  args: WorkspaceGraphMutationKeyArgs & { nowMs?: number },
): Pick<WorkspaceGraphMutationState, 'workspaceGraphMutationBlockUntilMs' | 'workspaceGraphMutationBlockKey'> {
  const nowMs = Number.isFinite(args.nowMs) ? Math.max(0, Math.floor(args.nowMs as number)) : Date.now()
  return {
    workspaceGraphMutationBlockUntilMs: nowMs + WORKSPACE_GRAPH_MUTATION_TRANSITION_BLOCK_MS,
    workspaceGraphMutationBlockKey: buildWorkspaceGraphMutationBlockKey(args),
  }
}

type CloseWorkspaceViewArgs = {
  workspaceViewMode: WorkspaceViewMode
  workspaceCanvasPaneOpen: boolean
  setWorkspaceViewMode: (next: WorkspaceViewMode) => void
  setWorkspaceViewState?: (next: { mode: WorkspaceViewMode; paneOpen?: boolean }) => void
  setWorkspaceCanvasPaneOpen: (open: boolean) => void
}

export function closeWorkspaceView(args: CloseWorkspaceViewArgs) {
  if (args.setWorkspaceViewState) {
    args.setWorkspaceViewState({ mode: 'canvas', paneOpen: false })
    return
  }
  if (args.workspaceViewMode !== 'canvas') args.setWorkspaceViewMode('canvas')
  if (args.workspaceCanvasPaneOpen !== false) args.setWorkspaceCanvasPaneOpen(false)
}
