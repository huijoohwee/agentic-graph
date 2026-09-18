import assert from 'node:assert/strict'
import test from 'node:test'

import {
  hasSameReadOnlyAgentGraphProjectionIdentity,
  isReadOnlyAgentGraphProjection,
} from '@/features/agent-graph/agentGraphProjectionPolicy'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphData } from '@/lib/graph/types'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { startAgentGraphObservation } from '../../../mcp/agent-graph/operation-observation.mjs'
import { sanitizeAgentGraphImportResult } from '../../viteAgentGraphIngestSanitizer'
import { validateAgentGraphHostResult } from '@/features/agent-graph/agentGraphHostAdapter'
import { applyAgentGraphCanvasProjection, buildAgentGraphCanvasProjection } from '@/features/agent-graph/agentGraphCanvasProjection'
import { agentGraphResult } from './agentGraphWorkspaceArtifact.test'

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

test('projection compatibility accepts only one exact metadata family', () => {
  const canonicalProjection = {
    ...legacyProjection,
    metadata: {
      kind: 'agent-graph',
      agentGraphProjection: {
        owner: 'agent-graph-runtime',
        readOnly: true,
        graphId: `kg:graph:${'1'.repeat(32)}`,
        snapshotDigest: 'a'.repeat(64),
        projectionToken: `kg:projection:${'2'.repeat(24)}`,
      },
    },
  } as unknown as GraphData
  assert.equal(isReadOnlyAgentGraphProjection(canonicalProjection), true)
  assert.equal(hasSameReadOnlyAgentGraphProjectionIdentity(legacyProjection, canonicalProjection), false)
  assert.equal(isReadOnlyAgentGraphProjection({
    ...canonicalProjection,
    metadata: {
      ...canonicalProjection.metadata,
      knowledgeGraphPreview: {
        owner: 'knowledge-graph-runtime-preview',
        readOnly: true,
        graphId: `kg:graph:${'1'.repeat(32)}`,
        parserRegistryDigest: 'b'.repeat(64),
        complete: false,
      },
    },
  }), false)
})

test('execution measurements survive the host sanitizer and browser projection without changing graph evidence', () => {
  const source = agentGraphResult()
  const result = startAgentGraphObservation('ingest')({ ...source, ok: true })
  const options = { fail: (_code: string, message: string): never => { throw new Error(message) }, expectedParserRegistryDigest: source.parserRegistryDigest }
  const sanitized = sanitizeAgentGraphImportResult(result, options)
  const imported = validateAgentGraphHostResult(sanitized)
  const projected = buildAgentGraphCanvasProjection(imported)
  assert.deepEqual((projected.metadata?.agentGraphProjection as any).observation, result.observation)
  assert.equal((projected.metadata?.agentGraphProjection as any).snapshotDigest, source.snapshotDigest)
  assert.deepEqual(projected.nodes, buildAgentGraphCanvasProjection(source).nodes)
  assert.deepEqual(projected.edges, buildAgentGraphCanvasProjection(source).edges)
  assert.equal(validateAgentGraphHostResult(source).observation, undefined)
  for (const observation of [{ ...result.observation, elapsedMs: -1 }, { ...result.observation, operation: 'query' }]) {
    assert.throws(() => sanitizeAgentGraphImportResult({ ...result, observation }, options), /measurements/)
    assert.throws(() => validateAgentGraphHostResult({ ...source, observation }), /invalid/)
  }
})

test('reimport of the same snapshot refreshes measurements while preserving node identity and selection', () => {
  const { restore } = initJsdomHarness(), before = useGraphStore.getState()
  try {
    useGraphStore.getState().resetAll()
    const imported = agentGraphResult()
    applyAgentGraphCanvasProjection(imported)
    const first = useGraphStore.getState().graphData
    const selectedNodeId = first.nodes[0]!.id
    useGraphStore.setState({ selectedNodeId, selectedNodeIds: [selectedNodeId] })
    const observation = startAgentGraphObservation('ingest')({ ok: true, counts: { parsed: 0, reused: 2, admittedBytes: 100 } }).observation
    applyAgentGraphCanvasProjection({ ...imported, observation })
    const second = useGraphStore.getState().graphData
    assert.equal(second.nodes, first.nodes); assert.equal(second.edges, first.edges)
    assert.equal(useGraphStore.getState().selectedNodeId, selectedNodeId)
    assert.equal((second.metadata?.agentGraphProjection as any).observation.sources.reused, 2)
    assert.equal(hasSameReadOnlyAgentGraphProjectionIdentity(first, second), true)
    applyAgentGraphCanvasProjection(imported)
    assert.equal((useGraphStore.getState().graphData.metadata?.agentGraphProjection as any).observation, undefined)
  } finally { useGraphStore.setState(before, true); restore() }
})
