import type { GraphData } from '@/lib/graph/types'
import {
  buildWorkspaceGraphMutationBlockKey,
  buildWorkspaceGraphMutationTransitionState,
  isWorkspaceGraphMutationBlocked,
  isWorkspaceCameraInitializationBlocked,
} from '@/features/workspace-table/workspaceTableSsot'

export function testWorkspaceGraphMutationTransitionUsesSemanticKeyAndExpiry() {
  const key = buildWorkspaceGraphMutationBlockKey({
    workspaceViewMode: 'canvas',
    workspaceCanvasPaneOpen: false,
    markdownWorkspaceIndexingInFlight: false,
  })
  if (!key) throw new Error('expected workspace graph mutation transition identity to use a semantic key')

  const transition = buildWorkspaceGraphMutationTransitionState({
    workspaceViewMode: 'canvas',
    workspaceCanvasPaneOpen: false,
    markdownWorkspaceIndexingInFlight: false,
    nowMs: 1000,
  })
  if (transition.workspaceGraphMutationBlockKey !== key) {
    throw new Error('expected transition state to reuse the shared semantic workspace graph mutation key')
  }
  const sourceSwitchTransition = buildWorkspaceGraphMutationTransitionState({
    workspaceViewMode: 'canvas',
    workspaceCanvasPaneOpen: false,
    markdownWorkspaceIndexingInFlight: false,
    transitionSemanticKey: 'source:/docs/a.md',
    nowMs: 1000,
  })
  if (sourceSwitchTransition.workspaceGraphMutationBlockKey === key) {
    throw new Error('expected Source Files document switches to key workspace graph mutation guards by source identity')
  }
  if (!isWorkspaceGraphMutationBlocked({
    workspaceViewMode: 'canvas',
    workspaceCanvasPaneOpen: false,
    markdownWorkspaceIndexingInFlight: false,
    workspaceGraphMutationBlockUntilMs: Date.now() + 1000,
    workspaceGraphMutationBlockKey: key,
  })) {
    throw new Error('expected active workspace graph mutation transition to block graph layout writes')
  }
  if (isWorkspaceGraphMutationBlocked({
    workspaceViewMode: 'canvas',
    workspaceCanvasPaneOpen: false,
    markdownWorkspaceIndexingInFlight: false,
    workspaceGraphMutationBlockUntilMs: 1,
    workspaceGraphMutationBlockKey: key,
  })) {
    throw new Error('expected expired workspace graph mutation transition to release graph layout writes')
  }
  const editor = { workspaceViewMode: 'editor' as const, workspaceCanvasPaneOpen: true }
  if (!isWorkspaceGraphMutationBlocked(editor) || isWorkspaceCameraInitializationBlocked(editor)) {
    throw new Error('editor ownership must block graph writes while allowing first-camera reads')
  }
  for (const guard of [
    { markdownWorkspaceIndexingInFlight: true }, { workspaceGraphMutationLayoutLockActive: true },
    { workspaceGraphMutationBlockUntilMs: Date.now() + 1000 },
    { graphData: { type: 'Graph', nodes: [], edges: [], metadata: { kind: 'agent-graph', agentGraphProjection: { owner: 'agent-graph-runtime', readOnly: true, graphId: 'camera-guard-fixture', snapshotDigest: 'camera-guard-snapshot' } } } as GraphData },
  ]) {
    if (!isWorkspaceCameraInitializationBlocked({ ...editor, ...guard })) throw new Error('camera reads must retain indexing, layout, transition, and projection guards')
  }

}
