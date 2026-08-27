import assert from 'node:assert/strict'

import {
  createKnowledgeGraphHostAdapter,
  KNOWLEDGE_GRAPH_HOST_CAPABILITY_SCHEMA,
  KNOWLEDGE_GRAPH_HOST_ROUTE,
} from '@/features/knowledge-graph/knowledgeGraphHostAdapter'
import { SOURCE_PARSER_REGISTRY } from '../../../mcp/knowledge-graph/source-parser-registry.mjs'

const graphId = `kg:graph:${'1'.repeat(32)}`
const parserRegistryDigest = SOURCE_PARSER_REGISTRY.digest
const graphData = {
  context: 'agenticgraph-knowledge-graph-projection',
  type: 'Graph' as const,
  nodes: [{ id: 'node:source', label: 'src/index.ts', type: 'SourceFile', properties: {} }],
  edges: [],
}

export async function testKnowledgeGraphBrowserAdapterStreamsRepositoryProgress() {
  const frames = [
    {
      type: 'progress',
      progress: {
        schema: 'agenticgraph-knowledge-graph-import-progress/v1',
        kind: 'source-parsed',
        graphId,
        parserRegistryDigest,
        sourcePath: 'src/index.ts',
        sourceIndex: 1,
        sourceTotal: 1,
        truncated: false,
        graphData,
      },
    },
    {
      type: 'result',
      result: {
        handled: true,
        kind: 'knowledge-graph',
        graphId,
        snapshotDigest: '2'.repeat(64),
        parserRegistryDigest,
        complete: true,
        counts: { sources: 1, nodes: 1, edges: 0 },
        projection: {
          token: `kg:projection:${'3'.repeat(24)}`,
          readOnly: true,
          complete: true,
          truncated: false,
          limit: 1_000,
          graphData,
        },
      },
    },
  ]
  const bridge = createKnowledgeGraphHostAdapter({
    fetchImpl: async input => {
      const route = String(input)
      if (route === `${KNOWLEDGE_GRAPH_HOST_ROUTE}/capability`) {
        return new Response(JSON.stringify({
          schema: KNOWLEDGE_GRAPH_HOST_CAPABILITY_SCHEMA,
          available: true,
          limits: { maxChunkBytes: 1, maxFiles: 1, maxFileBytes: 1, maxTotalBytes: 1 },
        }), { headers: { 'Content-Type': 'application/json' } })
      }
      if (route === `${KNOWLEDGE_GRAPH_HOST_ROUTE}/repositories/stream`) {
        return new Response(`${frames.map(frame => JSON.stringify(frame)).join('\n')}\n`, {
          headers: { 'Content-Type': 'application/x-ndjson' },
        })
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    },
  })
  const progress: unknown[] = []
  const result = await bridge.importRepositoryUrl?.(
    'https://github.com/example/repository',
    undefined,
    undefined,
    frame => progress.push(frame),
  )
  assert.equal(result?.graphId, graphId)
  assert.equal(progress.length, 1)
  assert.equal((progress[0] as { sourcePath?: unknown }).sourcePath, 'src/index.ts')
}
