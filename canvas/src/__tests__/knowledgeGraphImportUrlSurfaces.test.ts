import { buildAgenticOsTestCatalogMetadata } from '@/__tests__/helpers/agenticOsCatalogDigest'
import { AGENTIC_OS_DOCS_MCP_TOOL_NAME } from '@/features/agent-ready/agenticOsDocsMcpBridgeContract'
import {
  buildKnowgrphAgentReadyToolContracts,
  KNOWGRPH_AGENT_READY_TOOL_IDS,
} from '@/features/agent-ready/knowgrphAgentReadyToolContract.mjs'
import { KNOWGRPH_LOCAL_MCP_TOOL_NAMES } from '@/features/agent-ready/knowgrphLocalMcpToolNames.mjs'
import { buildImportUrlWebMcpToolBuilders } from '@/features/agent-ready/importUrlWebMcpTools'
import { resetAgenticOsRemoteGrammarCatalogForTests } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import {
  readSkillsCommandsMcpTarget,
  resetSkillsCommandsMcpTargetForTests,
} from '@/features/agentic-os/skillsCommandsMcpTarget'
import { executeStructuredImportUrl } from '@/features/chat/nativeImportUrlInvocation'
import {
  getMarkdownWorkspaceActionBridge,
  registerMarkdownWorkspaceActionBridge,
  type WorkspaceKnowledgeGraphImportResult,
  type WorkspaceKnowledgeGraphInvocation,
} from '@/features/markdown-explorer/workspaceActionBridge'
import { useGraphStore } from '@/hooks/useGraphStore'
import { runLaunchImportUrl } from '@/lib/toolbar/launchImportDispatch'

const GRAPH_ID = 'kg:graph:0123456789abcdef0123456789abcdef'
const SNAPSHOT_DIGEST = 'a'.repeat(64)
const SOURCE_REVISION = 'c'.repeat(40)
const SOURCE_COMMAND = '/knowledge.graph.ingest'
const SOURCE_SEMANTICS = ['#knowledge-graph', '#mcp', '#runtime-ready']
const SOURCE_BINDINGS = ['@working-directory', '@knowledge-graph', '@operator', '@runtime-proof']
const SOURCE_CATALOG = [
  {
    token: SOURCE_COMMAND,
    kind: 'command',
    label: 'Ingest knowledge graph',
    summary: 'Compile one bounded local workspace into one deterministic graph snapshot.',
    sourcePath: `DICTIONARY-COMMAND.md#${SOURCE_COMMAND}`,
    mcpTool: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest,
    mcpTools: [KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest],
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

const knowledgeGraphResult: WorkspaceKnowledgeGraphImportResult = {
  handled: true,
  kind: 'knowledge-graph',
  graphId: GRAPH_ID,
  snapshotDigest: SNAPSHOT_DIGEST,
  parserRegistryDigest: 'f'.repeat(64),
  complete: true,
  counts: { sources: 1, nodes: 2, edges: 1 },
  projection: {
    token: 'kg:projection:0123456789abcdef01234567',
    readOnly: true,
    complete: true,
    truncated: false,
    limit: 1_000,
    graphData: {
      context: 'knowgrph-knowledge-graph-projection',
      type: 'Graph',
      nodes: [
        { id: 'node:a', label: 'A', type: 'Symbol', properties: {} },
        { id: 'node:b', label: 'B', type: 'Symbol', properties: {} },
      ],
      edges: [{
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
      }],
    },
  },
}

const assertKnowledgeGraphSummary = (value: unknown, surface: string) => {
  const result = value as Record<string, unknown>
  const counts = result.counts as Record<string, unknown> | undefined
  const projectionCounts = result.projectionCounts as Record<string, unknown> | undefined
  if (
    result.kind !== 'knowledge-graph'
    || result.graphId !== GRAPH_ID
    || result.snapshotDigest !== SNAPSHOT_DIGEST
    || result.complete !== true
    || counts?.nodes !== 2
    || counts?.edges !== 1
    || result.projectionToken !== knowledgeGraphResult.projection.token
    || projectionCounts?.nodes !== 2
    || projectionCounts?.edges !== 1
    || 'createdPaths' in result
    || 'removedPaths' in result
    || !String(result.outputText || '').includes('# Knowledge graph imported')
  ) {
    throw new Error(`expected ${surface} to return a path-free knowledge graph success, got ${JSON.stringify(value)}`)
  }
}

const assertKnowledgeGraphLaunchResult = (value: unknown) => {
  const result = value as Record<string, unknown>
  const counts = result.counts as Record<string, unknown> | undefined
  const projection = result.projection as {
    token?: unknown
    graphData?: { nodes?: unknown[]; edges?: unknown[] }
  } | undefined
  if (
    result.kind !== 'knowledge-graph'
    || result.graphId !== GRAPH_ID
    || result.snapshotDigest !== SNAPSHOT_DIGEST
    || result.parserRegistryDigest !== knowledgeGraphResult.parserRegistryDigest
    || result.complete !== true
    || counts?.nodes !== 2
    || counts?.edges !== 1
    || projection?.token !== knowledgeGraphResult.projection.token
    || projection?.graphData?.nodes?.length !== 2
    || projection?.graphData?.edges?.length !== 1
    || 'createdPaths' in result
    || 'removedPaths' in result
  ) {
    throw new Error(`expected Launch Import URL to return the canonical path-free knowledge graph result, got ${JSON.stringify(value)}`)
  }
}

export async function testKnowledgeGraphCanonicalRepositoryRunsThroughNativeAndWebMcpImportUrl(): Promise<void> {
  const originalFetch = globalThis.fetch
  const exactInvocationRequests: string[][] = []
  const repositoryCalls: Array<{
    url: string
    invocation: WorkspaceKnowledgeGraphInvocation | undefined
  }> = []
  let legacyImportCalls = 0
  resetSkillsCommandsMcpTargetForTests()
  resetAgenticOsRemoteGrammarCatalogForTests()
  useGraphStore.getState().resetAll()
  const unregister = registerMarkdownWorkspaceActionBridge('knowledge-graph-native-webmcp-import-url-test', {
    importUrl: async () => {
      legacyImportCalls += 1
      return { handled: true, createdPaths: ['/legacy-fallback-must-not-run.md'] }
    },
    knowledgeGraph: {
      importRepositoryUrl: async (url, _options, invocation) => {
        repositoryCalls.push({ url, invocation })
        return knowledgeGraphResult
      },
    },
  })
  try {
    globalThis.fetch = (async (input, init) => {
      const requestUrl = String(input)
      const body = JSON.parse(String(init?.body || '{}')) as {
        id?: unknown
        method?: unknown
        invocationTokens?: string[]
        params?: { arguments?: { query?: unknown } }
      }
      if (requestUrl === '/__knowgrph_mcp_agentic_os_docs_invoke') {
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
            'mcp-session-id': 'knowledge-graph-native-webmcp-session',
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

    const url = 'https://github.com/example/repository'
    const launchResult = await runLaunchImportUrl({
      urlRaw: url,
      forceKnowledgeGraphRepository: true,
      bridge: getMarkdownWorkspaceActionBridge(),
      fallback: async () => {
        throw new Error('canonical repository ingest must not use the legacy URL fallback')
      },
    })
    assertKnowledgeGraphLaunchResult(launchResult)

    const nativeResult = await executeStructuredImportUrl({ url })
    assertKnowledgeGraphSummary(nativeResult, 'native Import URL')

    const contracts = buildKnowgrphAgentReadyToolContracts({
      defaultWorkspaceId: 'kgws:test',
      includeBrowserOnlyTools: true,
    })
    const toolId = KNOWGRPH_AGENT_READY_TOOL_IDS.controlLocalImportUrl
    const webMcpTool = buildImportUrlWebMcpToolBuilders(name => {
      const contract = contracts.find(candidate => candidate.name === name)
      if (!contract) throw new Error(`missing Import URL contract ${name}`)
      return contract
    })[toolId]()
    const webMcpResult = await webMcpTool.execute({ url })
    assertKnowledgeGraphSummary(webMcpResult, 'WebMCP Import URL')

    const expectedTokens = [SOURCE_COMMAND, ...SOURCE_SEMANTICS, ...SOURCE_BINDINGS]
    if (
      repositoryCalls.length !== 3
      || repositoryCalls.some(call => call.url !== url)
      || repositoryCalls.some(call => call.invocation?.tool !== KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest)
      || repositoryCalls.some(call => JSON.stringify([
        call.invocation?.action,
        ...(call.invocation?.semantics || []),
        ...(call.invocation?.bindings || []),
      ]) !== JSON.stringify(expectedTokens))
      || exactInvocationRequests.length !== 3
      || exactInvocationRequests.some(tokens => JSON.stringify(tokens) !== JSON.stringify(expectedTokens))
      || legacyImportCalls !== 0
    ) {
      throw new Error(`expected Launch, native, and WebMCP to use only digest-bound repository ingest, got ${JSON.stringify({
        repositoryCalls,
        exactInvocationRequests,
        legacyImportCalls,
      })}`)
    }
    if (readSkillsCommandsMcpTarget().status !== 'idle') {
      throw new Error('expected headless native and WebMCP repository ingest to leave the Launch panel target idle')
    }
  } finally {
    unregister()
    globalThis.fetch = originalFetch
    resetSkillsCommandsMcpTargetForTests()
    resetAgenticOsRemoteGrammarCatalogForTests()
    useGraphStore.getState().resetAll()
  }
}
