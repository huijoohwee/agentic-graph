import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { createAgentGraphBridgeRequestHandler } from '../../viteAgentGraphBridge'
import { RETIRED_AGENT_GRAPH_ENVIRONMENT_KEYS } from '../../../mcp/agent-graph/environment.mjs'
import { SOURCE_PARSER_REGISTRY } from '../../../mcp/agent-graph/source-parser-registry.mjs'

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('knowledge graph Vite host test did not bind')
  return address.port
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
}

export function testAgentGraphViteHostRejectsRetiredEnvironmentKeys() {
  for (const key of RETIRED_AGENT_GRAPH_ENVIRONMENT_KEYS) {
    assert.throws(
      () => createAgentGraphBridgeRequestHandler({
        repoRoot: path.resolve(process.cwd(), '..'),
        env: {
          AGENTIC_OS_AGENT_GRAPH_OUTPUT_ROOT: 'canonical-output',
          [key]: '',
        },
      }),
      (error: unknown) => (
        error instanceof Error
        && (error as Error & { code?: string }).code === 'retired_environment'
        && error.message.includes(key)
      ),
      key,
    )
  }
}

export async function testAgentGraphViteHostUsesStartupBoundDefaultRuntime() {
  const source = await fs.readFile(path.resolve(process.cwd(), 'viteAgentGraphBridge.ts'), 'utf8')
  if (
    !/import\s+\{\s*runAgentGraphTool\s*\}\s+from\s+['"]\.\.\/mcp\/agent-graph-host\.js['"]/.test(source)
    || source.includes("await import('../mcp/agent-graph-host.js')")
  ) {
    throw new Error('the Vite host must bind the knowledge graph runtime while its config runner is open')
  }

  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-default-vite-host-'))
  const repoRoot = path.resolve(process.cwd(), '..')
  const diagnostics: unknown[] = []
  const handler = createAgentGraphBridgeRequestHandler({
    repoRoot,
    hostDataRoot: path.join(temporaryRoot, 'host'),
    env: {
      ...process.env,
      AGENTIC_OS_AGENT_GRAPH_ALLOWED_ROOTS: '',
      AGENTIC_OS_AGENT_GRAPH_OUTPUT_ROOT: path.join(temporaryRoot, 'output'),
    },
    onInternalError: diagnostic => diagnostics.push(diagnostic),
  })
  const server = createServer((request, response) => {
    void handler(request, response).then(handled => {
      if (handled) return
      response.statusCode = 404
      response.end()
    })
  })
  try {
    const port = await listen(server)
    const baseUrl = `http://127.0.0.1:${port}/__agentic_graph_agent_graph`
    const grantResponse = await fetch(`${baseUrl}/grants`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    const grant = await grantResponse.json() as { grantId?: unknown }
    const sourceBytes = new TextEncoder().encode(
      "import { value } from './value'\nexport const answer = value\n",
    )
    const valueBytes = new TextEncoder().encode('export const value = 42\n')
    for (const [sourcePath, bytes] of [
      ['src/index.ts', sourceBytes],
      ['src/value.ts', valueBytes],
    ] as const) {
      const upload = await fetch(
        `${baseUrl}/grants/${String(grant.grantId)}/files?path=${encodeURIComponent(sourcePath)}&offset=0&complete=1`,
        { method: 'PUT', body: bytes },
      )
      if (upload.status !== 200) throw new Error(`default host upload failed with ${upload.status}`)
    }
    const commit = await fetch(`${baseUrl}/grants/${String(grant.grantId)}/commit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileCount: 2,
        totalBytes: sourceBytes.byteLength + valueBytes.byteLength,
      }),
    })
    const result = await commit.json() as {
      graphId?: unknown
      complete?: unknown
      counts?: { sources?: unknown; nodes?: unknown; edges?: unknown }
      projection?: {
        graphData?: {
          edges?: Array<{ properties?: Record<string, unknown> }>
        }
      }
    }
    const edges = result.projection?.graphData?.edges || []
    if (
      commit.status !== 200
      || !/^kg:graph:[0-9a-f]{32}$/.test(String(result.graphId || ''))
      || result.complete !== true
      || result.counts?.sources !== 2
      || Number(result.counts?.nodes || 0) < 2
      || Number(result.counts?.edges || 0) < 1
      || !edges.length
      || edges.some(edge => !String(edge.properties?.['evidence:explanation'] || '').trim())
      || diagnostics.length
    ) {
      throw new Error(`expected a complete explained default-runtime graph, got ${JSON.stringify(result)}`)
    }
  } finally {
    await close(server).catch(() => undefined)
    await fs.rm(temporaryRoot, { recursive: true, force: true })
  }
}

export async function testAgentGraphViteHostStreamsSanitizedSourceProgress() {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-vite-host-progress-'))
  const graphId = `kg:graph:${'1'.repeat(32)}`
  const runtimeResult = {
    schema: 'agentic-graph-agent-graph-ingest/v1',
    ok: true,
    operation: 'ingest',
    graphId,
    snapshotDigest: '2'.repeat(64),
    parserRegistryDigest: SOURCE_PARSER_REGISTRY.digest,
    complete: true,
    counts: { sources: 1, nodes: 1, edges: 0 },
    projection: {
      token: `kg:projection:${'3'.repeat(24)}`,
      readOnly: true,
      complete: true,
      truncated: false,
      limit: 1_000,
      graphData: {
        context: 'agentic-graph-agent-graph-projection',
        type: 'Graph',
        nodes: [{ id: 'node:source', label: 'src/index.ts', type: 'SourceFile', properties: {} }],
        edges: [],
      },
    },
  }
  const handler = createAgentGraphBridgeRequestHandler({
    repoRoot: path.resolve(process.cwd(), '..'),
    hostDataRoot: path.join(temporaryRoot, 'host'),
    runIngest: async context => {
      await context.onProgress?.({
        schema: 'agentic-graph-agent-graph-import-progress/v1',
        kind: 'source-parsed',
        graphId,
        parserRegistryDigest: SOURCE_PARSER_REGISTRY.digest,
        sourcePath: 'src/index.ts',
        sourceIndex: 1,
        sourceTotal: 1,
        fragment: {
          nodes: [{ id: 'node:source', label: 'src/index.ts', type: 'SourceFile', properties: {} }],
          edges: [],
        },
      })
      return runtimeResult
    },
  })
  const server = createServer((request, response) => {
    void handler(request, response)
  })
  try {
    const port = await listen(server)
    const response = await fetch(
      `http://127.0.0.1:${port}/__agentic_graph_agent_graph/repositories/stream`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
        body: JSON.stringify({ repositoryUrl: 'https://github.com/example/repository' }),
      },
    )
    const frames = (await response.text()).trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    const progress = frames[0]?.progress as Record<string, unknown> | undefined
    const result = frames[1]?.result as Record<string, unknown> | undefined
    if (
      response.status !== 200
      || !response.headers.get('content-type')?.includes('application/x-ndjson')
      || frames.length !== 2
      || frames[0]?.type !== 'progress'
      || progress?.sourcePath !== 'src/index.ts'
      || progress?.truncated !== false
      || JSON.stringify(progress).includes(temporaryRoot)
      || frames[1]?.type !== 'result'
      || result?.graphId !== graphId
    ) {
      throw new Error(`expected an ordered sanitized progress stream, got ${JSON.stringify({ status: response.status, frames })}`)
    }
  } finally {
    await close(server).catch(() => undefined)
    await fs.rm(temporaryRoot, { recursive: true, force: true })
  }
}

export async function testAgentGraphViteHostKeepsUnknownFailureDetailsServerOnly() {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-vite-host-failure-'))
  const diagnostics: Array<Record<string, unknown>> = []
  const secretDetail = `${temporaryRoot}/private-runtime-detail`
  const handler = createAgentGraphBridgeRequestHandler({
    repoRoot: path.resolve(process.cwd(), '..'),
    hostDataRoot: path.join(temporaryRoot, 'host'),
    runIngest: async () => {
      throw new Error(secretDetail)
    },
    onInternalError: diagnostic => diagnostics.push(diagnostic),
  })
  const server = createServer((request, response) => {
    void handler(request, response)
  })
  try {
    const port = await listen(server)
    const response = await fetch(
      `http://127.0.0.1:${port}/__agentic_graph_agent_graph/repositories`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repositoryUrl: 'https://github.com/example/repository' }),
      },
    )
    const body = await response.text()
    if (
      response.status !== 500
      || body.includes(secretDetail)
      || !body.includes('"code":"host-internal-error"')
      || diagnostics.length !== 1
      || diagnostics[0]?.stage !== 'repository-runtime'
      || !/^[0-9a-f]{24}$/.test(String(diagnostics[0]?.fingerprint || ''))
      || JSON.stringify(diagnostics[0]).includes(temporaryRoot)
      || JSON.stringify(diagnostics[0]).includes('private-runtime-detail')
      || Object.hasOwn(diagnostics[0] || {}, 'message')
      || Object.hasOwn(diagnostics[0] || {}, 'stack')
    ) {
      throw new Error(`expected one server-only runtime diagnostic and a generic response, got ${body}`)
    }
  } finally {
    await close(server).catch(() => undefined)
    await fs.rm(temporaryRoot, { recursive: true, force: true })
  }
}
