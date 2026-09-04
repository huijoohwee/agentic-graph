import assert from 'node:assert/strict'
import test from 'node:test'

import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphData } from '@/lib/graph/types'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const legacyProjection = {
  type: 'Graph',
  nodes: [{ id: 'legacy:node', label: 'Retained', type: 'Symbol', properties: {} }],
  edges: [],
  metadata: {
    kind: 'knowledge-graph',
    knowledgeGraphProjection: {
      owner: 'knowledge-graph-runtime',
      readOnly: true,
      graphId: `kg:graph:${'1'.repeat(32)}`,
      snapshotDigest: 'a'.repeat(64),
      projectionToken: `kg:projection:${'2'.repeat(24)}`,
    },
  },
} as unknown as GraphData

test('a persisted pre-rename projection remains read-only after upgrade', () => {
  const { restore } = initJsdomHarness()
  try {
    useGraphStore.getState().resetAll()
    useGraphStore.getState().setGraphData(legacyProjection)
    const state = useGraphStore.getState()
    state.updateNode('legacy:node', { label: 'Changed' })
    state.addNode({ id: 'new:node', label: 'New', type: 'Symbol', properties: {} })
    state.clearGraphData()
    const current = useGraphStore.getState().graphData
    assert.equal(current.nodes.length, 1)
    assert.equal(current.nodes[0]?.label, 'Retained')
    assert.equal(current.metadata?.kind, 'knowledge-graph')
    assert.deepEqual(
      current.metadata?.knowledgeGraphProjection,
      legacyProjection.metadata?.knowledgeGraphProjection,
    )
  } finally {
    useGraphStore.getState().resetAll()
    restore()
  }
})
