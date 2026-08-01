import { continueStoryboardWidgetMultiConnectSession } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetMultiConnectSession'
import { resolveStoryboardWidgetMultiSourceIds } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetMultiSourceEdgeSession'
import { createSelectionSlice } from '@/hooks/store/selectionSlice'
import type { GraphData } from '@/lib/graph/types'

export function testStoryboardMultiConnectSessionKeepsSourceArmedAfterEdge() {
  const calls: string[] = []
  const continued = continueStoryboardWidgetMultiConnectSession({
    edgeId: ' edge-a ',
    sourceNodeId: ' source-a ',
    sourceNodeIds: ['source-a', 'source-b'],
    sourcePortKey: ' output ',
    setSelectionSource: source => { calls.push(`selection:${source}`) },
    selectEdge: edgeId => { calls.push(`edge:${edgeId}`) },
    selectNode: nodeId => { calls.push(`node:${nodeId}`) },
    setPendingEdgeSourceId: nodeId => { calls.push(`source:${nodeId}`) },
    setPendingEdgeSourceIds: nodeIds => { calls.push(`sources:${nodeIds.join(',')}`) },
    setPendingEdgeSourcePortKey: portKey => { calls.push(`port:${portKey}`) },
    setToolMode: mode => { calls.push(`mode:${mode}`) },
  })
  const expected = [
    'selection:canvas',
    'edge:edge-a',
    'node:null',
    'source:source-a',
    'sources:source-a,source-b',
    'port:output',
    'mode:addEdge',
  ]
  if (!continued || calls.join('|') !== expected.join('|')) {
    throw new Error(`expected authored edge selection with a persistent multi-connect source, got ${JSON.stringify(calls)}`)
  }
}

export function testStoryboardMultiSourceSelectionArmsOneDeterministicCohort() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'source-a', type: 'Node', label: 'A', properties: {} },
      { id: 'source-b', type: 'Node', label: 'B', properties: {} },
      { id: 'source-c', type: 'Node', label: 'C', properties: {} },
      { id: 'target', type: 'Node', label: 'Target', properties: {} },
    ],
    edges: [],
  }
  const sourceNodeIds = resolveStoryboardWidgetMultiSourceIds({
    graphData,
    selectedNodeIds: ['source-a', 'source-b', 'source-c', 'source-b'],
    primarySourceNodeId: 'source-b',
    targetNodeId: 'target',
  })
  if (sourceNodeIds.join(',') !== 'source-b,source-a,source-c') {
    throw new Error(`expected primary-first deduplicated source cohort, got ${JSON.stringify(sourceNodeIds)}`)
  }
}

export function testStoryboardMultiSourceSelectionExcludesTargetAndUnselectedPrimaryResetsCohort() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'source-a', type: 'Node', label: 'A', properties: {} },
      { id: 'source-b', type: 'Node', label: 'B', properties: {} },
      { id: 'target', type: 'Node', label: 'Target', properties: {} },
    ],
    edges: [],
  }
  const withoutTarget = resolveStoryboardWidgetMultiSourceIds({
    graphData,
    selectedNodeIds: ['source-a', 'target'],
    primarySourceNodeId: 'source-a',
    targetNodeId: 'target',
  })
  const reset = resolveStoryboardWidgetMultiSourceIds({
    graphData,
    selectedNodeIds: ['source-a', 'target'],
    primarySourceNodeId: 'source-b',
    targetNodeId: 'target',
  })
  if (withoutTarget.join(',') !== 'source-a' || reset.join(',') !== 'source-b') {
    throw new Error(`expected target exclusion and source reset, got ${JSON.stringify({ withoutTarget, reset })}`)
  }
}

export function testStoryboardModifierSelectionForcesCohortWithoutChangingDocumentMode() {
  let state: Record<string, unknown> = {}
  const actions = createSelectionSlice(
    ((patch: Record<string, unknown>) => { state = { ...state, ...patch } }) as never,
    (() => state) as never,
  )
  state = {
    ...actions,
    schema: { behavior: { selectMode: 'single' } },
    selectedNodeId: 'source-a',
    selectedNodeIds: ['source-a'],
    selectedEdgeId: null,
    selectedEdgeIds: [],
    selectedGroupId: null,
    selectedGroupIds: [],
  }
  actions.selectNodesExpanded({
    nodeIds: ['source-a', 'source-b'],
    activeNodeId: 'source-b',
    forceMulti: true,
  })
  const selectedNodeIds = state.selectedNodeIds as string[]
  const selectMode = (state.schema as { behavior: { selectMode: string } }).behavior.selectMode
  if (selectedNodeIds.join(',') !== 'source-a,source-b' || state.selectedNodeId !== 'source-b' || selectMode !== 'single') {
    throw new Error(`expected modifier selection to preserve a two-source cohort without mutating document mode, got ${JSON.stringify(state)}`)
  }
}

export function testStoryboardMultiConnectSessionRejectsMissingEndpoint() {
  let mutationCount = 0
  const continued = continueStoryboardWidgetMultiConnectSession({
    edgeId: 'edge-a',
    sourceNodeId: '',
    sourcePortKey: null,
    setSelectionSource: () => { mutationCount += 1 },
    selectEdge: () => { mutationCount += 1 },
    selectNode: () => { mutationCount += 1 },
    setPendingEdgeSourceId: () => { mutationCount += 1 },
    setPendingEdgeSourcePortKey: () => { mutationCount += 1 },
    setToolMode: () => { mutationCount += 1 },
  })
  if (continued || mutationCount !== 0) {
    throw new Error(`expected invalid multi-connect continuation to stay inert, got ${mutationCount} mutations`)
  }
}
