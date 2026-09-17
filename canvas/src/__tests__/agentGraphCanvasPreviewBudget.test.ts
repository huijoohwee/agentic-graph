import assert from 'node:assert/strict'

import type { WorkspaceAgentGraphImportProgress } from '@/features/markdown-explorer/workspaceActionBridge'
import {
  createAgentGraphCanvasPreviewSession,
  AGENT_GRAPH_CANVAS_MAX_BYTES,
} from '@/features/agent-graph/agentGraphCanvasProjection'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const GRAPH_ID = `kg:graph:${'a'.repeat(32)}`
const PARSER_REGISTRY_DIGEST = 'b'.repeat(64)
const LARGE_RECORD_CONTENT = 'payload'.repeat(2_000)
const RECORDS_PER_PROGRESS_FRAME = 100

function progressFrame(
  sourceIndex: number,
  idPrefix: string,
): WorkspaceAgentGraphImportProgress {
  return {
    schema: 'agentic-graph-agent-graph-import-progress/v1',
    kind: 'source-parsed',
    graphId: GRAPH_ID,
    parserRegistryDigest: PARSER_REGISTRY_DIGEST,
    sourcePath: `src/source-${sourceIndex}.ts`,
    sourceIndex,
    sourceTotal: 2,
    truncated: false,
    graphData: {
      context: 'agentic-graph-agent-graph-projection',
      type: 'Graph',
      nodes: Array.from({ length: RECORDS_PER_PROGRESS_FRAME }, (_, index) => ({
        id: `${idPrefix}${String(index).padStart(3, '0')}`,
        label: `Source ${sourceIndex} symbol ${index}`,
        type: 'Symbol',
        properties: { content: LARGE_RECORD_CONTENT },
      })),
      edges: [],
    },
  }
}

function projectionBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

export function testAgentGraphCanvasPreviewFitsAggregateProgressWithinDecoratedByteBudget() {
  const { restore } = initJsdomHarness()
  try {
    useGraphStore.getState().resetAll()
    useGraphStore.getState().setCanvasRenderMode('2d')
    const first = progressFrame(1, 'node:z:')
    const second = progressFrame(2, 'node:a:')
    const session = createAgentGraphCanvasPreviewSession()

    session.apply(first)
    const preview = session.apply(second)
    const ids = preview.nodes.map(node => node.id)
    const expectedIds = [
      ...first.graphData.nodes,
      ...second.graphData.nodes,
    ].map(node => node.id).sort().slice(0, ids.length)
    const metadata = preview.metadata?.agentGraphPreview as Record<string, unknown> | undefined

    assert.ok(ids.length > 0 && ids.length < RECORDS_PER_PROGRESS_FRAME * 2)
    assert.deepEqual(ids, expectedIds, 'the byte fitter must retain a stable canonical-id prefix')
    assert.ok(projectionBytes(preview) <= AGENT_GRAPH_CANVAS_MAX_BYTES)
    assert.equal(metadata?.owner, 'agent-graph-runtime-preview')
    assert.equal(metadata?.complete, false)
    assert.equal(metadata?.truncated, true)
    assert.deepEqual(useGraphStore.getState().graphData.nodes.map(node => node.id), ids)

    let publications = 0
    const unsubscribe = useGraphStore.subscribe((next, previous) => {
      if (next.graphData !== previous.graphData) publications += 1
    })
    const burst = createAgentGraphCanvasPreviewSession()
    for (let index = 1; index <= 1000; index += 1) burst.apply({
      ...progressFrame(index, 'burst:'), sourceTotal: 1000,
      graphData: { type: 'Graph', nodes: [{ id: `burst:${index}`, label: 'Source', type: 'Symbol', properties: {} }], edges: [] },
    })
    unsubscribe()
    assert.ok(publications <= 32, `expected at most 32 preview publications, got ${publications}`)
    assert.equal(useGraphStore.getState().graphData.nodes.length, 1000)
    burst.rollback()

    useGraphStore.setState({ canvasRenderMode: '3d' })
    const xrGraph = useGraphStore.getState().graphData
    const xrPreview = createAgentGraphCanvasPreviewSession()
    xrPreview.apply(progressFrame(1, 'xr:'))
    assert.equal(useGraphStore.getState().canvasRenderMode, '3d', 'parsing must not tear down an active XR surface')
    assert.equal(useGraphStore.getState().graphData, xrGraph)
    xrPreview.rollback()
    useGraphStore.setState({ canvasRenderMode: '2d' })
  } finally {
    useGraphStore.getState().resetAll()
    restore()
  }
}
