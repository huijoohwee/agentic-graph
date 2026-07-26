import { continueStoryboardWidgetMultiConnectSession } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetMultiConnectSession'

export function testStoryboardMultiConnectSessionKeepsSourceArmedAfterEdge() {
  const calls: string[] = []
  const continued = continueStoryboardWidgetMultiConnectSession({
    edgeId: ' edge-a ',
    sourceNodeId: ' source-a ',
    sourcePortKey: ' output ',
    setSelectionSource: source => { calls.push(`selection:${source}`) },
    selectEdge: edgeId => { calls.push(`edge:${edgeId}`) },
    selectNode: nodeId => { calls.push(`node:${nodeId}`) },
    setPendingEdgeSourceId: nodeId => { calls.push(`source:${nodeId}`) },
    setPendingEdgeSourcePortKey: portKey => { calls.push(`port:${portKey}`) },
    setToolMode: mode => { calls.push(`mode:${mode}`) },
  })
  const expected = [
    'selection:canvas',
    'edge:edge-a',
    'node:null',
    'source:source-a',
    'port:output',
    'mode:addEdge',
  ]
  if (!continued || calls.join('|') !== expected.join('|')) {
    throw new Error(`expected authored edge selection with a persistent multi-connect source, got ${JSON.stringify(calls)}`)
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
