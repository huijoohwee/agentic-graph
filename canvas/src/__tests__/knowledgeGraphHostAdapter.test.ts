import fs from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'

import {
  createKnowledgeGraphHostAdapter,
  KNOWLEDGE_GRAPH_HOST_CAPABILITY_SCHEMA,
  KNOWLEDGE_GRAPH_HOST_ROUTE,
  normalizeKnowledgeGraphRepositoryUrl,
} from '@/features/knowledge-graph/knowledgeGraphHostAdapter'
import { registerKnowledgeGraphLaunchHostBridge } from '@/features/knowledge-graph/knowledgeGraphLaunchHostBridge'
import { getMarkdownWorkspaceActionBridge } from '@/features/markdown-explorer/workspaceActionBridge'
import { runLaunchImportUrl } from '@/lib/toolbar/launchImportDispatch'
import { buildAgenticOsTestCatalogMetadata } from '@/__tests__/helpers/agenticOsCatalogDigest'
import { AGENTIC_OS_DOCS_MCP_TOOL_NAME } from '@/features/agent-ready/agenticOsDocsMcpBridgeContract'
import { AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES } from '@/features/agent-ready/agenticgraphLocalMcpToolNames.mjs'
import { resetAgenticOsRemoteGrammarCatalogForTests } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { resetSkillsCommandsMcpTargetForTests } from '@/features/agentic-os/skillsCommandsMcpTarget'
import { useGraphStore } from '@/hooks/useGraphStore'
import { createKnowledgeGraphBridgeRequestHandler } from '../../viteKnowledgeGraphBridge'
import { createKnowledgeGraphRuntime } from '../../../mcp/knowledge-graph/runtime.mjs'
import { SOURCE_PARSER_REGISTRY } from '../../../mcp/knowledge-graph/source-parser-registry.mjs'

const GRAPH_ID = 'kg:graph:0123456789abcdef0123456789abcdef'
const SNAPSHOT_DIGEST = 'a'.repeat(64)
const SOURCE_REVISION = 'c'.repeat(40)
const SOURCE_COMMAND = '/agentic.graph.ingest'
const SOURCE_SEMANTICS = ['#agentic-graph', '#mcp', '#runtime-ready']
const SOURCE_BINDINGS = ['@working-directory', '@agentic-graph', '@operator', '@runtime-proof']
const SOURCE_CATALOG = [
  {
    token: SOURCE_COMMAND,
    kind: 'command',
    label: 'Ingest knowledge graph',
    summary: 'Compile one bounded local workspace into one deterministic graph snapshot.',
    sourcePath: `DICTIONARY-COMMAND.md#${SOURCE_COMMAND}`,
    mcpTool: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest,
    mcpTools: [AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest],
    semantics: SOURCE_SEMANTICS,
    bindings: SOURCE_BINDINGS,
  },
  ...SOURCE_SEMANTICS.map(token => ({
    token,
    kind: 'semantic',
    label: token,
    summary: 'Source-backed knowledge graph semantic.',
    sourcePath: `DICTIONARY-SEMANTIC.md#${token}`,
  })),
  ...SOURCE_BINDINGS.map(token => ({
    token,
    kind: 'binding',
    label: token,
    summary: 'Source-backed knowledge graph binding.',
    sourcePath: `DICTIONARY-BINDING.md#${token}`,
  })),
]
const SOURCE_CATALOG_METADATA = buildAgenticOsTestCatalogMetadata(SOURCE_CATALOG)

type IngestCall = {
  args: Record<string, unknown>
  rootDir: string
  env: NodeJS.ProcessEnv
  abortSignal: AbortSignal
}

const runtimeResult = {
  schema: 'agenticgraph-knowledge-graph-ingest/v1',
  ok: true,
  operation: 'ingest',
  graphId: GRAPH_ID,
  snapshotDigest: SNAPSHOT_DIGEST,
  parserRegistryDigest: SOURCE_PARSER_REGISTRY.digest,
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
      context: 'agenticgraph-knowledge-graph-projection',
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
          properties: {
            'evidence:explanation': 'A names B.',
            'evidence:sourcePath': 'src/index.ts',
            'evidence:sourceDigest': '1'.repeat(64),
            'evidence:excerptHash': '2'.repeat(64),
            'evidence:parserId': 'typescript-ast',
            'evidence:parserDigest': '3'.repeat(64),
            'evidence:ruleId': 'typescript.import',
          },
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

async function startHost(
  ingestResult: unknown = runtimeResult,
  runIngestOverride?: (context: IngestCall, temporaryRoot: string) => Promise<unknown>,
) {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agenticgraph-host-adapter-test-'))
  const calls: IngestCall[] = []
  const nativeFetch = globalThis.fetch.bind(globalThis)
  const handler = createKnowledgeGraphBridgeRequestHandler({
    repoRoot: temporaryRoot,
    hostDataRoot: path.join(temporaryRoot, 'host-data'),
    runIngest: async context => {
      calls.push(context)
      return runIngestOverride
        ? runIngestOverride(context, temporaryRoot)
        : ingestResult
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
    nativeFetch(new URL(String(input), baseUrl), init)
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
    const capabilityResponse = await host.fetchImpl('/__agenticgraph_knowledge_graph/capability')
    const capability = await capabilityResponse.json() as { schema?: unknown; available?: unknown }
    if (
      capabilityResponse.status !== 200
      || capability.schema !== KNOWLEDGE_GRAPH_HOST_CAPABILITY_SCHEMA
      || capability.available !== true
    ) {
      throw new Error(`expected available host capability, got ${JSON.stringify(capability)}`)
    }

    const createResponse = await host.fetchImpl('/__agenticgraph_knowledge_graph/grants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const grant = await createResponse.json() as { grantId: string }
    await host.fetchImpl(
      `/__agenticgraph_knowledge_graph/grants/${grant.grantId}/files?path=src%2Findex.ts&offset=0&complete=1`,
      { method: 'PUT', body: new TextEncoder().encode('export const answer = 42\\n') },
    )
    const commitResponse = await host.fetchImpl(
      `/__agenticgraph_knowledge_graph/grants/${grant.grantId}/commit`,
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

export async function testKnowledgeGraphHostStrictFolderCommitCompletesMultipartRuntime() {
  let rawRuntimeResult: Record<string, unknown> | null = null
  const host = await startHost(runtimeResult, async (context, temporaryRoot) => {
    if (context.args.strict !== true) {
      throw new Error('Launch folder commit must retain strict canonical ingestion')
    }
    const rootPath = String(context.args.rootPath || '')
    const runtime = createKnowledgeGraphRuntime({
      agenticgraphRoot: temporaryRoot,
      allowedRoots: [rootPath],
      outputRoot: path.join(temporaryRoot, 'runtime-output'),
      maxSourceShardBytes: 32_768,
      maxSourcePartTargetBytes: 16_384,
    })
    rawRuntimeResult = await runtime.ingest(context.args, {
      abortSignal: context.abortSignal,
    }) as Record<string, unknown>
    return rawRuntimeResult
  })
  try {
    const body = Array.from(
      { length: 160 },
      (_, index) => `## Section ${index}\nparagraph ${index}`,
    ).join('\n')
    const bytes = new TextEncoder().encode(body)
    const createResponse = await host.fetchImpl('/__agenticgraph_knowledge_graph/grants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const grant = await createResponse.json() as { grantId: string }
    const upload = await host.fetchImpl(
      `/__agenticgraph_knowledge_graph/grants/${grant.grantId}/files?path=large.md&offset=0&complete=1`,
      { method: 'PUT', body: bytes },
    )
    if (upload.status !== 200) {
      throw new Error(`expected bounded folder upload, got ${upload.status}`)
    }
    const commit = await host.fetchImpl(
      `/__agenticgraph_knowledge_graph/grants/${grant.grantId}/commit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileCount: 1, totalBytes: bytes.byteLength }),
      },
    )
    const result = await commit.json() as Record<string, unknown>
    if (
      commit.status !== 200
      || result.complete !== true
      || rawRuntimeResult?.ok !== true
      || rawRuntimeResult?.complete !== true
      || host.calls[0]?.args.strict !== true
    ) {
      throw new Error(`expected strict complete multipart Launch ingest, got ${JSON.stringify(result)}`)
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
    schema: 'agenticgraph-knowledge-graph-invocation/v1',
    tool: 'agenticgraph.knowledge_graph.ingest',
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
      'http://code.example.test/example/repo',
      'https://code.example.test/example/repo?tab=readme',
      'https://user@code.example.test/example/repo',
    ]) {
      let failure: unknown = null
      try {
        normalizeKnowledgeGraphRepositoryUrl(invalid)
      } catch (error) {
        failure = error
      }
      if (!failure) throw new Error(`expected strict repository rejection for ${invalid}`)
    }
    const response = await host.fetchImpl('/__agenticgraph_knowledge_graph/repositories', {
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

    const accepted = await host.fetchImpl('/__agenticgraph_knowledge_graph/repositories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repositoryUrl: 'https://github.com/example/repo.git',
        invocation,
      }),
    })
    if (accepted.status !== 200 || host.calls[0]?.args.repositoryUrl !== 'https://github.com/example/repo.git') {
      throw new Error('expected repository acquisition to preserve the submitted remote suffix')
    }
    if (
      normalizeKnowledgeGraphRepositoryUrl('https://code.example.test/group/project.git')
      !== 'https://code.example.test/group/project'
    ) {
      throw new Error('expected the browser host envelope to remain repository-provider neutral')
    }
    if (
      normalizeKnowledgeGraphRepositoryUrl('https://localhost/group/project.git')
      !== 'https://localhost/group/project'
    ) {
      throw new Error('expected repository host policy to remain solely owned by the local MCP runtime')
    }
    if (
      JSON.stringify(host.calls[0]?.args.invocation) !== JSON.stringify(invocation)
      || host.calls[0]?.args.strict !== true
    ) {
      throw new Error('expected the verified / # @ packet and strict mode to reach canonical ingestion')
    }
    if (host.calls[0]?.args.include !== undefined) {
      throw new Error(
        `expected the full bounded repository inventory to reach discovery, got ${JSON.stringify(host.calls[0]?.args.include)}`,
      )
    }
  } finally {
    await host.dispose()
  }
}

export async function testKnowledgeGraphDefaultCanvasBridgeRunsSourceBackedRepositoryIngest() {
  const host = await startHost()
  const originalFetch = globalThis.fetch
  const exactInvocationRequests: string[][] = []
  let unregister = () => undefined
  resetSkillsCommandsMcpTargetForTests()
  resetAgenticOsRemoteGrammarCatalogForTests()
  useGraphStore.getState().resetAll()
  try {
    globalThis.fetch = (async (input, init) => {
      const requestUrl = String(input)
      if (requestUrl.startsWith(KNOWLEDGE_GRAPH_HOST_ROUTE)) {
        return host.fetchImpl(input, init)
      }
      const body = JSON.parse(String(init?.body || '{}')) as {
        id?: unknown
        method?: unknown
        invocationTokens?: string[]
        params?: { arguments?: { query?: unknown } }
      }
      if (requestUrl === '/__agenticgraph_mcp_agentic_os_docs_invoke') {
        const tokens = Array.isArray(body.invocationTokens) ? body.invocationTokens : []
        exactInvocationRequests.push(tokens)
        return new Response(JSON.stringify({
          ok: true,
          tool: AGENTIC_OS_DOCS_MCP_TOOL_NAME,
          mcpInvoked: true,
          sourceRevision: SOURCE_REVISION,
          ...SOURCE_CATALOG_METADATA,
          invocations: tokens.map(token => ({ token, ok: true })),
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (body.method === 'initialize') {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          result: { protocolVersion: '2024-11-05' },
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'mcp-session-id': 'knowledge-graph-launch-host-session',
          },
        })
      }
      const query = String(body.params?.arguments?.query || '')
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          structuredContent: {
            ok: true,
            sourceRevision: SOURCE_REVISION,
            ...SOURCE_CATALOG_METADATA,
            catalog: SOURCE_CATALOG.filter(entry => entry.token.startsWith(query)),
          },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    unregister = registerKnowledgeGraphLaunchHostBridge({ enabled: true })
    const result = await runLaunchImportUrl({
      urlRaw: 'https://github.com/example/repository',
      forceKnowledgeGraphRepository: true,
      bridge: getMarkdownWorkspaceActionBridge(),
      fallback: async () => {
        throw new Error('repository ingest must not use the legacy URL fallback')
      },
    })
    if (!result || !('kind' in result) || result.kind !== 'knowledge-graph' || result.graphId !== GRAPH_ID) {
      throw new Error(`expected one default Canvas knowledge graph result, got ${JSON.stringify(result)}`)
    }
    if (host.calls.length !== 1 || host.calls[0]?.args.repositoryUrl !== 'https://github.com/example/repository') {
      throw new Error('expected the Launch-owned bridge to reach the Vite repository host exactly once')
    }
    const invocation = host.calls[0]?.args.invocation as Record<string, unknown> | undefined
    if (
      invocation?.tool !== AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest
      || invocation?.action !== SOURCE_COMMAND
      || JSON.stringify(invocation?.semantics) !== JSON.stringify(SOURCE_SEMANTICS)
      || JSON.stringify(invocation?.bindings) !== JSON.stringify(SOURCE_BINDINGS)
      || invocation?.sourceRevision !== SOURCE_REVISION
      || invocation?.catalogDigest !== SOURCE_CATALOG_METADATA.catalogDigest
      || invocation?.routingSchema !== SOURCE_CATALOG_METADATA.routingSchema
      || invocation?.routingDigest !== SOURCE_CATALOG_METADATA.routingDigest
    ) {
      throw new Error(`expected an exact source-backed invocation at the host, got ${JSON.stringify(invocation)}`)
    }
    if (JSON.stringify(exactInvocationRequests) !== JSON.stringify([[
      SOURCE_COMMAND,
      ...SOURCE_SEMANTICS,
      ...SOURCE_BINDINGS,
    ]])) {
      throw new Error(`expected one exact shared catalog invocation, got ${JSON.stringify(exactInvocationRequests)}`)
    }
  } finally {
    unregister()
    globalThis.fetch = originalFetch
    resetSkillsCommandsMcpTargetForTests()
    resetAgenticOsRemoteGrammarCatalogForTests()
    useGraphStore.getState().resetAll()
    await host.dispose()
  }
}

export async function testKnowledgeGraphToolbarLauncherOwnsDefaultHostRegistration() {
  const launcherSource = await fs.readFile(
    path.resolve(process.cwd(), 'src/features/toolbar/ToolbarMenuLauncher.tsx'),
    'utf8',
  )
  const editorShellSource = await fs.readFile(
    path.resolve(process.cwd(), 'src/lib/markdown-workspace-runtime/useMarkdownWorkspaceShell.ts'),
    'utf8',
  )
  if (
    !launcherSource.includes("from '@/features/knowledge-graph/knowledgeGraphLaunchHostBridge'")
    || !launcherSource.includes('useKnowledgeGraphLaunchHostBridge()')
  ) {
    throw new Error('the always-mounted Launch owner must install the default knowledge graph host bridge')
  }
  if (
    editorShellSource.includes('createKnowledgeGraphHostAdapter')
    || editorShellSource.includes('useKnowledgeGraphLaunchHostBridge')
  ) {
    throw new Error('the default knowledge graph host bridge must not depend on the editor-only shell')
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
    const response = await host.fetchImpl('/__agenticgraph_knowledge_graph/repositories', {
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
