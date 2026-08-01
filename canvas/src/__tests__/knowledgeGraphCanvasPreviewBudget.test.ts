import assert from 'node:assert/strict'

import type { WorkspaceKnowledgeGraphImportProgress } from '@/features/markdown-explorer/workspaceActionBridge'
import {
  createKnowledgeGraphCanvasPreviewSession,
  KNOWLEDGE_GRAPH_CANVAS_MAX_BYTES,
} from '@/features/knowledge-graph/knowledgeGraphCanvasProjection'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const GRAPH_ID = `kg:graph:${'a'.repeat(32)}`
const PARSER_REGISTRY_DIGEST = 'b'.repeat(64)
const LARGE_RECORD_CONTENT = 'payload'.repeat(2_000)
const RECORDS_PER_PROGRESS_FRAME = 100

function progressFrame(
  sourceIndex: number,
  idPrefix: string,
): WorkspaceKnowledgeGraphImportProgress {
  return {
    schema: 'knowgrph-knowledge-graph-import-progress/v1',
    kind: 'source-parsed',
    graphId: GRAPH_ID,
    parserRegistryDigest: PARSER_REGISTRY_DIGEST,
    sourcePath: `src/source-${sourceIndex}.ts`,
    sourceIndex,
    sourceTotal: 2,
    truncated: false,
    graphData: {
      context: 'knowgrph-knowledge-graph-projection',
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

export function testKnowledgeGraphCanvasPreviewFitsAggregateProgressWithinDecoratedByteBudget() {
  const { restore } = initJsdomHarness()
  try {
    useGraphStore.getState().resetAll()
    const first = progressFrame(1, 'node:z:')
    const second = progressFrame(2, 'node:a:')
    const session = createKnowledgeGraphCanvasPreviewSession()

    session.apply(first)
    const preview = session.apply(second)
    const ids = preview.nodes.map(node => node.id)
    const expectedIds = [
      ...first.graphData.nodes,
      ...second.graphData.nodes,
    ].map(node => node.id).sort().slice(0, ids.length)
    const metadata = preview.metadata?.knowledgeGraphPreview as Record<string, unknown> | undefined

    assert.ok(ids.length > 0 && ids.length < RECORDS_PER_PROGRESS_FRAME * 2)
    assert.deepEqual(ids, expectedIds, 'the byte fitter must retain a stable canonical-id prefix')
    assert.ok(projectionBytes(preview) <= KNOWLEDGE_GRAPH_CANVAS_MAX_BYTES)
    assert.equal(metadata?.owner, 'knowledge-graph-runtime-preview')
    assert.equal(metadata?.complete, false)
    assert.equal(metadata?.truncated, true)
    assert.deepEqual(useGraphStore.getState().graphData.nodes.map(node => node.id), ids)
  } finally {
    useGraphStore.getState().resetAll()
    restore()
  }
}
