import fs from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'

import {
  createKnowledgeGraphHostAdapter,
  KNOWLEDGE_GRAPH_HOST_CAPABILITY_SCHEMA,
  normalizeKnowledgeGraphRepositoryUrl,
} from '@/features/knowledge-graph/knowledgeGraphHostAdapter'
import { createKnowledgeGraphBridgeRequestHandler } from '../../viteKnowledgeGraphBridge'

const GRAPH_ID = 'kg:graph:0123456789abcdef0123456789abcdef'
const SNAPSHOT_DIGEST = 'a'.repeat(64)

type IngestCall = {
  args: Record<string, unknown>
  rootDir: string
  env: NodeJS.ProcessEnv
  abortSignal: AbortSignal
}

const runtimeResult = {
  schema: 'knowgrph-knowledge-graph-ingest/v1',
  ok: true,
  operation: 'ingest',
  graphId: GRAPH_ID,
  snapshotDigest: SNAPSHOT_DIGEST,
  complete: true,
  counts: {
    repositories: 1,
    sources: 1,
    ready: 1,
    parsed: 1,
    reused: 0,
    deleted: 0,
    nodes: 2,
    edges: 1,
  },
  projection: {
    token: 'kg:projection:0123456789abcdef01234567',
    readOnly: true,
    graphData: {
      context: 'knowgrph-knowledge-graph-projection',
      type: 'Graph',
      nodes: [
        { id: 'node:a', label: 'A', type: 'Symbol', properties: {} },
        { id: 'node:b', label: 'B', type: 'Symbol', properties: {} },
      ],
      edges: [
        {
          id: 'edge:a-b',
          source: 'node:a',
          target: 'node:b',
          label: 'depends_on',
          properties: { 'evidence:explanation': 'A names B.' },
        },
      ],
    },
    complete: true,
    truncated: false,
    limit: 1_000,
  },
  acquisition: { rootPath: '/must-not-reach-browser' },
  diagnostics: [{ artifactPath: '/must-not-reach-browser' }],
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('test server did not bind a TCP port')
  return address.port
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
}

async function startHost(ingestResult: unknown = runtimeResult) {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'knowgrph-host-adapter-test-'))
  const calls: IngestCall[] = []
  const handler = createKnowledgeGraphBridgeRequestHandler({
    repoRoot: temporaryRoot,
    hostDataRoot: path.join(temporaryRoot, 'host-data'),
    runIngest: async context => {
      calls.push(context)
      return ingestResult
    },
  })
  const server = createServer((request, response) => {
    void handler(request, response).then(handled => {
      if (handled) return
      response.statusCode = 404
      response.end()
    })
  })
  const port = await listen(server)
  const baseUrl = `http://127.0.0.1:${port}`
  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit) => (
    fetch(new URL(String(input), baseUrl), init)
  )
  return {
    calls,
    fetchImpl,
    temporaryRoot,
    async dispose() {
      await close(server)
      await fs.rm(temporaryRoot, { recursive: true, force: true })
    },
  }
}

function fileHandle(name: string, body: Blob): FileSystemFileHandle {
  const file = Object.assign(body, { name, lastModified: 0 }) as File
  return {
    kind: 'file',
    name,
    getFile: async () => file,
  } as unknown as FileSystemFileHandle
}

function directoryHandle(
  name: string,
  entries: Array<FileSystemFileHandle | FileSystemDirectoryHandle>,
): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    async *values() {
      for (const entry of entries) yield entry
    },
  } as unknown as FileSystemDirectoryHandle
}

export async function testKnowledgeGraphHostUsesOpaqueContentAddressedFolderGrant() {
  const host = await startHost()
  try {
    const capabilityResponse = await host.fetchImpl('/__knowgrph_knowledge_graph/capability')
    const capability = await capabilityResponse.json() as { schema?: unknown; available?: unknown }
    if (
      capabilityResponse.status !== 200
      || capability.schema !== KNOWLEDGE_GRAPH_HOST_CAPABILITY_SCHEMA
      || capability.available !== true
    ) {
      throw new Error(`expected available host capability, got ${JSON.stringify(capability)}`)
    }

    const createResponse = await host.fetchImpl('/__knowgrph_knowledge_graph/grants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const grant = await createResponse.json() as { grantId: string }
    await host.fetchImpl(
      `/__knowgrph_knowledge_graph/grants/${grant.grantId}/files?path=src%2Findex.ts&offset=0&complete=1`,
      { method: 'PUT', body: new TextEncoder().encode('export const answer = 42\\n') },
    )
    const commitResponse = await host.fetchImpl(
      `/__knowgrph_knowledge_graph/grants/${grant.grantId}/commit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileCount: 1, totalBytes: 26 }),
      },
    )
    const result = await commitResponse.json() as Record<string, unknown>
    if (commitResponse.status !== 200 || result.graphId !== GRAPH_ID || result.snapshotDigest !== SNAPSHOT_DIGEST) {
      throw new Error(`expected canonical ingest identity, got ${JSON.stringify(result)}`)
    }
    const serialized = JSON.stringify(result)
    if (
      serialized.includes(host.temporaryRoot)
      || serialized.includes('rootPath')
      || serialized.includes('artifactPath')
      || serialized.includes('acquisition')
    ) {
      throw new Error(`host-only paths or runtime diagnostics reached the browser contract: ${serialized}`)
    }
    if (host.calls.length !== 1 || typeof host.calls[0]?.args.rootPath !== 'string') {
      throw new Error('expected one canonical runtime ingest using a host-owned staged root')
    }
    const stagedRoot = String(host.calls[0].args.rootPath)
    if (!stagedRoot.includes(`${path.sep}corpora${path.sep}`) || stagedRoot.includes(grant.grantId)) {
      throw new Error(`expected content-addressed staging identity, got ${stagedRoot}`)
    }
    const stagedText = await fs.readFile(path.join(stagedRoot, 'src', 'index.ts'), 'utf8')
    if (stagedText !== 'export const answer = 42\\n') {
      throw new Error(`expected exact staged bytes, got ${JSON.stringify(stagedText)}`)
    }
  } finally {
    await host.dispose()
  }
}

export async function testKnowledgeGraphBrowserAdapterStreamsFolderAndSkipsGeneratedTrees() {
  const host = await startHost()
  let uploadCalls = 0
  try {
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') uploadCalls += 1
      return host.fetchImpl(input, init)
    }
    const generated = directoryHandle('node_modules', [
      fileHandle('ignored.js', new Blob(['ignored'])),
    ])
    const sourceBytes = new Uint8Array((4 * 1024 * 1024) + 17)
    sourceBytes.fill(65)
    const root = directoryHandle('workspace', [
      generated,
      directoryHandle('src', [
        fileHandle('index.ts', new Blob([sourceBytes])),
      ]),
    ])
    const bridge = createKnowledgeGraphHostAdapter({
      fetchImpl,
      pickDirectory: async () => root,
    })
    const result = await bridge.importFolder?.()
    if (!result || result.graphId !== GRAPH_ID || result.projection.readOnly !== true) {
      throw new Error(`expected a validated read-only graph projection, got ${JSON.stringify(result)}`)
    }
    if (uploadCalls !== 2) {
      throw new Error(`expected the source file to stream in two bounded chunks, got ${uploadCalls}`)
    }
    const stagedRoot = String(host.calls[0]?.args.rootPath || '')
    const sourceStat = await fs.stat(path.join(stagedRoot, 'src', 'index.ts'))
    if (sourceStat.size !== sourceBytes.byteLength) {
      throw new Error(`expected ${sourceBytes.byteLength} staged bytes, got ${sourceStat.size}`)
    }
    const ignored = await fs.stat(path.join(stagedRoot, 'node_modules')).catch(() => null)
    if (ignored) throw new Error('expected generated dependency trees to stay outside the canonical corpus upload')
  } finally {
    await host.dispose()
  }
}

export async function testKnowledgeGraphHostRepositoryBoundaryIsStrictAndPathSafe() {
  const host = await startHost()
  const invocation = {
    schema: 'knowgrph-knowledge-graph-invocation/v1',
    tool: 'knowgrph.knowledge_graph.ingest',
    action: '/source.ingest',
    semantics: ['#source.graph'],
    bindings: ['@source.root'],
    sourceRevision: 'c'.repeat(40),
    catalogDigest: 'd'.repeat(64),
    routingSchema: 'agentic-canvas-os-docs-routing/v1',
    routingDigest: 'e'.repeat(64),
  }
  try {
    for (const invalid of [
      'http://github.com/example/repo',
      'https://github.com/example/repo?tab=readme',
      'https://user@github.com/example/repo',
      'https://example.test/example/repo',
    ]) {
      let failure: unknown = null
      try {
        normalizeKnowledgeGraphRepositoryUrl(invalid)
      } catch (error) {
        failure = error
      }
      if (!failure) throw new Error(`expected strict repository rejection for ${invalid}`)
    }
    const response = await host.fetchImpl('/__knowgrph_knowledge_graph/repositories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://malicious.example',
      },
      body: JSON.stringify({ repositoryUrl: 'https://github.com/example/repo' }),
    })
    const failure = await response.json() as { error?: { code?: unknown } }
    if (response.status !== 403 || failure.error?.code !== 'cross-origin-forbidden' || host.calls.length !== 0) {
      throw new Error(`expected cross-origin request to fail before acquisition, got ${JSON.stringify(failure)}`)
    }

    const accepted = await host.fetchImpl('/__knowgrph_knowledge_graph/repositories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repositoryUrl: 'https://github.com/example/repo.git',
        invocation,
      }),
    })
    if (accepted.status !== 200 || host.calls[0]?.args.repositoryUrl !== 'https://github.com/example/repo') {
      throw new Error('expected repository acquisition to use the normalized canonical runtime URL')
    }
    if (
      JSON.stringify(host.calls[0]?.args.invocation) !== JSON.stringify(invocation)
      || host.calls[0]?.args.strict !== true
    ) {
      throw new Error('expected the verified / # @ packet and strict mode to reach canonical ingestion')
    }
    const include = host.calls[0]?.args.include
    if (
      !Array.isArray(include)
      || !include.includes('*.ts')
      || include.includes('*.css')
      || include.includes('*.rst')
    ) {
      throw new Error(`expected source-registry structural parser scope, got ${JSON.stringify(include)}`)
    }
  } finally {
    await host.dispose()
  }
}

export async function testKnowledgeGraphHostRejectsOversizedProjectionBeforeBrowserTransfer() {
  const host = await startHost({
    ...runtimeResult,
    projection: {
      ...runtimeResult.projection,
      graphData: {
        type: 'Graph',
        nodes: [{
          id: 'node:oversized',
          label: 'Oversized',
          type: 'Symbol',
          properties: { content: 'x'.repeat((2 * 1024 * 1024) + 1) },
        }],
        edges: [],
      },
    },
  })
  try {
    const response = await host.fetchImpl('/__knowgrph_knowledge_graph/repositories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repositoryUrl: 'https://github.com/example/repo' }),
    })
    const failure = await response.json() as { error?: { code?: unknown } }
    if (response.status !== 502 || failure.error?.code !== 'invalid-runtime-result') {
      throw new Error(`expected oversized projection to fail at the host boundary, got ${JSON.stringify(failure)}`)
    }
  } finally {
    await host.dispose()
  }
}
