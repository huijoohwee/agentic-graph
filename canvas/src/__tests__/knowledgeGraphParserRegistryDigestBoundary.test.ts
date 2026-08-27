import { createServer } from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createKnowledgeGraphBridgeRequestHandler } from '../../viteKnowledgeGraphBridge'
import { SOURCE_PARSER_REGISTRY } from '../../../mcp/knowledge-graph/source-parser-registry.mjs'

const runtimeResult = {
  schema: 'agenticgraph-knowledge-graph-ingest/v1',
  ok: true,
  operation: 'ingest',
  graphId: 'kg:graph:0123456789abcdef0123456789abcdef',
  snapshotDigest: 'a'.repeat(64),
  parserRegistryDigest: SOURCE_PARSER_REGISTRY.digest,
  complete: true,
  counts: { sources: 1, nodes: 1, edges: 0 },
  projection: {
    token: 'kg:projection:0123456789abcdef01234567',
    readOnly: true,
    graphData: {
      context: 'agenticgraph-knowledge-graph-projection',
      type: 'Graph',
      nodes: [{ id: 'node:a', label: 'A', type: 'Symbol', properties: {} }],
      edges: [],
    },
    complete: true,
    truncated: false,
    limit: 1_000,
  },
}

export async function testKnowledgeGraphBrowserHostParserRegistryDigestBoundary() {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agenticgraph-parser-digest-test-'))
  let nextRuntimeResult: Record<string, unknown> = runtimeResult
  const handler = createKnowledgeGraphBridgeRequestHandler({
    repoRoot: temporaryRoot,
    hostDataRoot: path.join(temporaryRoot, 'host-data'),
    runIngest: async () => nextRuntimeResult,
  })
  const server = createServer((request, response) => {
    void handler(request, response).then(handled => {
      if (!handled) {
        response.statusCode = 404
        response.end()
      }
    })
  })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('test server did not bind')
    const request = async () => fetch(`http://127.0.0.1:${address.port}/__agenticgraph_knowledge_graph/repositories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repositoryUrl: 'https://code.example.test/group/repository' }),
    })

    const accepted = await request()
    const acceptedResult = await accepted.json() as Record<string, unknown>
    if (
      accepted.status !== 200
      || acceptedResult.parserRegistryDigest !== SOURCE_PARSER_REGISTRY.digest
    ) {
      throw new Error(`expected the exact parser registry digest at the browser boundary, got ${JSON.stringify(acceptedResult)}`)
    }

    for (const parserRegistryDigest of [undefined, 'f'.repeat(64)]) {
      nextRuntimeResult = { ...runtimeResult, parserRegistryDigest }
      const rejected = await request()
      const failure = await rejected.json() as { error?: { code?: unknown } }
      if (rejected.status !== 502 || failure.error?.code !== 'invalid-runtime-result') {
        throw new Error(
          `expected ${parserRegistryDigest ? 'mismatched' : 'missing'} parser registry digest rejection, got ${JSON.stringify(failure)}`,
        )
      }
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await fs.rm(temporaryRoot, { recursive: true, force: true })
  }
}
