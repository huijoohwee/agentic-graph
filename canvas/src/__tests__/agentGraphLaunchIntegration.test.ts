import type { WorkspaceAgentGraphImportResult } from '@/features/markdown-explorer/workspaceActionBridge'
import {
  applyAgentGraphCanvasProjection,
  buildAgentGraphCanvasProjection,
  AgentGraphProjectionError,
  AGENT_GRAPH_CANVAS_MAX_NODES,
} from '@/features/agent-graph/agentGraphCanvasProjection'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  LAUNCH_FOLDER_PREVIEW_MAX_FILES,
  runLaunchImportAgentGraphFolder,
  runLaunchImportLocalFolderPreview,
  runLaunchImportUrl,
} from '@/lib/toolbar/launchImportDispatch'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from '@/features/agent-ready/agentic-graph-local-mcp-tool-names.mjs'

const SNAPSHOT_DIGEST = 'a'.repeat(64)
const PARSER_REGISTRY_DIGEST = 'f'.repeat(64)
const GRAPH_ID = `kg:graph:${'1'.repeat(32)}`
const FOLDER_GRAPH_ID = `kg:graph:${'2'.repeat(32)}`
const PROJECTION_TOKEN = `kg:projection:${'1'.repeat(24)}`
const SOURCE_BACKED_INVOCATION = Object.freeze({
  schema: 'agentic-graph-agent-graph-invocation/v1' as const,
  tool: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.agentGraphIngest,
  action: '/source.ingest',
  semantics: Object.freeze(['#source.graph']),
  bindings: Object.freeze(['@source.root']),
  sourceRevision: 'c'.repeat(40),
  catalogDigest: 'd'.repeat(64),
  routingSchema: 'agentic-canvas-os-docs-routing/v1' as const,
  routingDigest: 'e'.repeat(64),
})

function agentGraphResult(
  overrides: Partial<WorkspaceAgentGraphImportResult> = {},
): WorkspaceAgentGraphImportResult {
  return {
    handled: true,
    kind: 'agent-graph',
    graphId: GRAPH_ID,
    snapshotDigest: SNAPSHOT_DIGEST,
    parserRegistryDigest: PARSER_REGISTRY_DIGEST,
    complete: true,
    counts: { sources: 2, nodes: 2, edges: 1 },
    projection: {
      token: PROJECTION_TOKEN,
      readOnly: true,
      complete: true,
      truncated: false,
      limit: 1_000,
      graphData: {
        type: 'Graph',
        nodes: [
          { id: 'repo:alpha', label: 'Alpha', type: 'Symbol', properties: {} },
          { id: 'repo:beta', label: 'Beta', type: 'Symbol', properties: {} },
        ],
        edges: [
          {
            id: 'edge:alpha-beta',
            source: 'repo:alpha',
            target: 'repo:beta',
            label: 'depends_on',
            type: 'depends_on',
            properties: {
              'evidence:explanation': 'Alpha depends on Beta.',
              'evidence:sourcePath': 'src/alpha.ts',
              'evidence:sourceDigest': 'b'.repeat(64),
              'evidence:excerptHash': 'c'.repeat(64),
              'evidence:parserId': 'code.typescript',
              'evidence:parserDigest': 'd'.repeat(64),
              'evidence:ruleId': 'code.import',
            },
          },
        ],
      },
    },
    ...overrides,
  }
}

export async function testAgentGraphHandledResultSuppressesLegacyFallbackWithoutCreatedPaths() {
  const calls: string[] = []
  const result = await runLaunchImportUrl({
    urlRaw: 'https://docs.example.test/guide',
    bridge: {
      importUrl: async url => {
        calls.push(`bridge:${url}`)
        return { handled: true }
      },
    },
    fallback: async url => {
      calls.push(`fallback:${url}`)
      return { createdPaths: ['/legacy.md'] }
    },
  })
  if (!result || result.handled !== true) throw new Error('expected handled bridge result to be returned')
  if (calls.join(',') !== 'bridge:https://docs.example.test/guide') {
    throw new Error(`expected handled result to suppress fallback, got ${calls.join(',')}`)
  }
}

export async function testAgentGraphRepositoryUrlUsesCanonicalHostAndPreservesProjectionIds() {
  const { restore } = initJsdomHarness()
  const calls: string[] = []
  let receivedInvocation: unknown
  try {
    useGraphStore.getState().resetAll()
    useGraphStore.getState().setCanvas2dRenderer('storyboard')
    useGraphStore.getState().setCanvasRenderMode('3d')
    const result = await runLaunchImportUrl({
      urlRaw: 'https://github.com/example/sample',
      forceAgentGraphRepository: true,
      bridge: {
        importUrl: async () => {
          calls.push('legacy-bridge')
          return { createdPaths: ['/partial.md'] }
        },
        agentGraph: {
          importRepositoryUrl: async (url, _opts, invocation) => {
            calls.push(`agent-graph:${url}`)
            receivedInvocation = invocation
            return agentGraphResult()
          },
        },
      },
      fallback: async () => {
        calls.push('legacy-fallback')
        return { createdPaths: ['/partial.md'] }
      },
      resolveMcpInvocation: async mcpTool => {
        calls.push(`resolve:${mcpTool}`)
        return { invocation: SOURCE_BACKED_INVOCATION }
      },
    })
    if (!result || !('kind' in result) || result.kind !== 'agent-graph') {
      throw new Error('expected canonical knowledge graph result')
    }
    if (
      calls.length !== 2
      || !calls[0]?.startsWith('resolve:agentic-graph.')
      || calls[1] !== 'agent-graph:https://github.com/example/sample'
    ) {
      throw new Error(`expected source-backed resolution before the canonical host bridge, got ${calls.join(',')}`)
    }
    if (receivedInvocation !== SOURCE_BACKED_INVOCATION) {
      throw new Error('expected the source-backed / # @ invocation packet to reach the canonical host bridge')
    }
    const graph = useGraphStore.getState().graphData
    if (graph.nodes.map(node => node.id).join(',') !== 'repo:alpha,repo:beta') {
      throw new Error(`expected authoritative node ids without remapping, got ${graph.nodes.map(node => node.id).join(',')}`)
    }
    if (graph.edges[0]?.id !== 'edge:alpha-beta') {
      throw new Error(`expected authoritative edge id without remapping, got ${String(graph.edges[0]?.id)}`)
    }
    if (useGraphStore.getState().canvas2dRenderer !== 'd3') {
      throw new Error('expected a successful knowledge graph import to open the graph-capable D3 renderer')
    }
    if (useGraphStore.getState().canvasRenderMode !== '2d') {
      throw new Error('expected a successful knowledge graph import to leave 3D and open the 2D Graph view')
    }
    const metadata = graph.metadata?.agentGraphProjection as Record<string, unknown> | undefined
    if (
      metadata?.owner !== 'agent-graph-runtime'
      || metadata?.readOnly !== true
      || metadata?.snapshotDigest !== SNAPSHOT_DIGEST
      || metadata?.parserRegistryDigest !== PARSER_REGISTRY_DIGEST
    ) {
      throw new Error(`expected read-only snapshot-bound projection metadata, got ${JSON.stringify(metadata)}`)
    }
    let neutralRepositoryUrl = ''
    await runLaunchImportUrl({
      urlRaw: 'https://code.example.test/group/sample.git',
      bridge: {
        agentGraph: {
          importRepositoryUrl: async url => {
            neutralRepositoryUrl = url
            return agentGraphResult()
          },
        },
      },
      fallback: async () => {
        throw new Error('explicit HTTPS Git repository URL must not use the webpage fallback')
      },
      resolveMcpInvocation: async () => ({ invocation: SOURCE_BACKED_INVOCATION }),
    })
    if (neutralRepositoryUrl !== 'https://code.example.test/group/sample.git') {
      throw new Error(`expected a provider-neutral submitted repository remote, got ${neutralRepositoryUrl}`)
    }
  } finally {
    restore()
  }
}

export function testAgentGraphCanvasProjectionAcceptsBoundedMultilineLabels() {
  const multilineLabel = 'layer\n    .selectAll '
  const projected = buildAgentGraphCanvasProjection(agentGraphResult({
    projection: {
      token: PROJECTION_TOKEN,
      readOnly: true,
      complete: true,
      truncated: false,
      limit: 1_000,
      graphData: {
        type: 'Graph',
        nodes: [
          { id: 'repo:alpha', label: multilineLabel, type: 'CodeCallReference', properties: {} },
          { id: 'repo:beta', label: 'Document text\nwith a second line', type: 'DocumentText', properties: {} },
        ],
        edges: [{
          id: 'edge:alpha-beta',
          source: 'repo:alpha',
          target: 'repo:beta',
          label: 'references',
          properties: {
            'evidence:explanation': 'The call\nreferences the document text. ',
            'evidence:sourcePath': 'src/alpha.ts',
            'evidence:sourceDigest': 'b'.repeat(64),
            'evidence:excerptHash': 'c'.repeat(64),
            'evidence:parserId': 'code.typescript',
            'evidence:parserDigest': 'd'.repeat(64),
            'evidence:ruleId': 'code.call',
          },
        }],
      },
    },
  }))
  if (projected.nodes[0]?.label !== multilineLabel) {
    throw new Error('expected bounded multiline display labels to remain authoritative')
  }

  let failure: unknown = null
  try {
    buildAgentGraphCanvasProjection(agentGraphResult({
      counts: { sources: 1, nodes: 1, edges: 0 },
      projection: {
        token: PROJECTION_TOKEN,
        readOnly: true,
        complete: true,
        truncated: false,
        limit: 1_000,
        graphData: {
          type: 'Graph',
          nodes: [{ id: 'repo:alpha', label: 'unsafe\u0000label', type: 'Symbol', properties: {} }],
          edges: [],
        },
      },
    }))
  } catch (error) {
    failure = error
  }
  if (!(failure instanceof AgentGraphProjectionError) || failure.code !== 'invalid-node-id') {
    throw new Error('expected unsafe label controls to remain rejected')
  }
}

export function testAgentGraphCanvasProjectionKeepsLockedViewAtomic() {
  const { restore } = initJsdomHarness()
  try {
    const store = useGraphStore.getState()
    store.resetAll()
    store.setCanvas2dRenderer('storyboard')
    store.setCanvasRenderMode('3d')
    store.setDocumentStructureBaselineLock(true)
    const graphBefore = useGraphStore.getState().graphData
    let failure: unknown = null
    try {
      applyAgentGraphCanvasProjection(agentGraphResult())
    } catch (error) {
      failure = error
    }
    if (!(failure instanceof AgentGraphProjectionError) || failure.code !== 'graph-view-unavailable') {
      throw new Error(`expected a locked Graph-view transition to fail closed, got ${String(failure)}`)
    }
    const state = useGraphStore.getState()
    if (
      state.canvasRenderMode !== '3d'
      || state.canvas2dRenderer !== 'storyboard'
      || state.graphData !== graphBefore
    ) {
      throw new Error('expected a locked Graph-view failure to leave the graph and view unchanged')
    }
  } finally {
    useGraphStore.getState().setDocumentStructureBaselineLock(false)
    useGraphStore.getState().resetAll()
    restore()
  }
}

export async function testAgentGraphRepositoryUrlFailsClosedWithoutCanonicalHost() {
  let legacyFallbackCalls = 0
  let failure: unknown = null
  try {
    await runLaunchImportUrl({
      urlRaw: 'https://github.com/example/sample',
      forceAgentGraphRepository: true,
      bridge: {},
      fallback: async () => {
        legacyFallbackCalls += 1
        return { createdPaths: ['/partial.md'] }
      },
      resolveMcpInvocation: async () => ({ invocation: SOURCE_BACKED_INVOCATION }),
    })
  } catch (error) {
    failure = error
  }
  if (!failure || !String((failure as Error).message).includes('unavailable')) {
    throw new Error('expected repository URL import to fail closed without a canonical host bridge')
  }
  if (legacyFallbackCalls !== 0) {
    throw new Error('expected repository URL import not to invoke the partial legacy fallback')
  }
}

export async function testAgentGraphRepositoryUrlRejectsUnsafeVariants() {
  for (const urlRaw of [
    'ftp://github.com/example/sample',
    'https://user:secret@github.com/example/sample',
    'https://github.com/example/sample?ref=main',
    'https://github.com/example/sample#readme',
  ]) {
    let hostCalls = 0
    let fallbackCalls = 0
    let failure: unknown = null
    try {
      await runLaunchImportUrl({
        urlRaw,
        forceAgentGraphRepository: true,
        bridge: {
          agentGraph: {
            importRepositoryUrl: async () => {
              hostCalls += 1
              return agentGraphResult()
            },
          },
        },
        fallback: async () => {
          fallbackCalls += 1
        },
      })
    } catch (error) {
      failure = error
    }
    if (!failure || hostCalls !== 0 || fallbackCalls !== 0) {
      throw new Error(`expected unsafe repository URL to fail before host or fallback: ${urlRaw}`)
    }
  }
}

export async function testAgentGraphIncompleteRepositoryImportFailsClosed() {
  let legacyFallbackCalls = 0
  let failure: unknown = null
  try {
    await runLaunchImportUrl({
      urlRaw: 'https://github.com/example/sample',
      forceAgentGraphRepository: true,
      bridge: {
        agentGraph: {
          importRepositoryUrl: async () => agentGraphResult({ complete: false }),
        },
      },
      fallback: async () => {
        legacyFallbackCalls += 1
        return { createdPaths: ['/partial.md'] }
      },
      resolveMcpInvocation: async () => ({ invocation: SOURCE_BACKED_INVOCATION }),
    })
  } catch (error) {
    failure = error
  }
  if (!(failure instanceof AgentGraphProjectionError) || failure.code !== 'incomplete-snapshot') {
    throw new Error(`expected incomplete snapshot rejection, got ${String(failure)}`)
  }
  if (legacyFallbackCalls !== 0) {
    throw new Error('expected incomplete canonical import not to invoke the legacy fallback')
  }
}

export async function testAgentGraphProjectionFailureNeverFallsBackAfterCanonicalResult() {
  let legacyFallbackCalls = 0
  let failure: unknown = null
  try {
    await runLaunchImportUrl({
      urlRaw: 'https://example.test/canonical-graph',
      bridge: {
        importUrl: async () => agentGraphResult({ complete: false }),
      },
      fallback: async () => {
        legacyFallbackCalls += 1
        return { createdPaths: ['/partial.md'] }
      },
    })
  } catch (error) {
    failure = error
  }
  if (!(failure instanceof AgentGraphProjectionError) || failure.code !== 'incomplete-snapshot') {
    throw new Error(`expected canonical projection validation failure, got ${String(failure)}`)
  }
  if (legacyFallbackCalls !== 0) {
    throw new Error('expected canonical projection validation failure not to invoke a legacy fallback')
  }
}

export async function testAgentGraphFolderUsesOpaqueHostCapability() {
  const { restore } = initJsdomHarness()
  let calls = 0
  try {
    useGraphStore.getState().resetAll()
    const result = await runLaunchImportAgentGraphFolder({
      bridge: {
        agentGraph: {
          importFolder: async () => {
            calls += 1
            return agentGraphResult({ graphId: FOLDER_GRAPH_ID })
          },
        },
      },
    })
    if (calls !== 1 || result.graphId !== FOLDER_GRAPH_ID) {
      throw new Error('expected folder import to use the no-argument host capability bridge')
    }
    if (useGraphStore.getState().graphData.nodes.length !== 2) {
      throw new Error('expected host folder projection to be applied to Canvas')
    }
  } finally {
    restore()
  }
}

export async function testAgentGraphBrowserFolderFallbackIsSmallAndExplicit() {
  const files = Array.from(
    { length: LAUNCH_FOLDER_PREVIEW_MAX_FILES + 1 },
    (_, index) => new File(['x'], `file-${index}.ts`, { type: 'text/plain' }),
  )
  let fallbackCalls = 0
  let failure: unknown = null
  try {
    await runLaunchImportLocalFolderPreview({
      files,
      bridge: {},
      fallback: async () => {
        fallbackCalls += 1
      },
    })
  } catch (error) {
    failure = error
  }
  if (!failure || !String((failure as Error).message).includes('Browser folder preview is limited')) {
    throw new Error(`expected oversized browser folder preview to fail closed, got ${String(failure)}`)
  }
  if (fallbackCalls !== 0) throw new Error('expected oversized browser folder preview not to invoke fallback')
}

export function testAgentGraphCanvasProjectionRejectsUnboundedPayload() {
  const nodes = Array.from({ length: AGENT_GRAPH_CANVAS_MAX_NODES + 1 }, (_, index) => ({
    id: `node:${index}`,
    label: `Node ${index}`,
    type: 'Symbol',
    properties: {},
  }))
  let failure: unknown = null
  try {
    buildAgentGraphCanvasProjection(agentGraphResult({
      counts: { sources: 1, nodes: nodes.length, edges: 0 },
      projection: {
        token: PROJECTION_TOKEN,
        readOnly: true,
        complete: false,
        truncated: true,
        limit: 1_000,
        graphData: { type: 'Graph', nodes, edges: [] },
      },
    }))
  } catch (error) {
    failure = error
  }
  if (!(failure instanceof AgentGraphProjectionError) || failure.code !== 'projection-node-limit') {
    throw new Error(`expected bounded projection rejection, got ${String(failure)}`)
  }
}

export function testAgentGraphCanvasProjectionRejectsPrivatePathsAndNonCanonicalIds() {
  for (const result of [
    agentGraphResult({
      projection: {
        token: PROJECTION_TOKEN,
        readOnly: true,
        complete: true,
        truncated: false,
        limit: 1_000,
        graphData: {
          type: 'Graph',
          nodes: [
            {
              id: 'repo:alpha',
              label: 'Alpha',
              type: 'Symbol',
              properties: { rootPath: '/workspace/private/repository' },
            },
          ],
          edges: [],
        },
      },
      counts: { sources: 1, nodes: 1, edges: 0 },
    }),
    agentGraphResult({
      projection: {
        token: PROJECTION_TOKEN,
        readOnly: true,
        complete: true,
        truncated: false,
        limit: 1_000,
        graphData: {
          type: 'Graph',
          nodes: [{ id: ' repo:alpha ', label: 'Alpha', type: 'Symbol', properties: {} }],
          edges: [],
        },
      },
      counts: { sources: 1, nodes: 1, edges: 0 },
    }),
  ]) {
    let failure: unknown = null
    try {
      buildAgentGraphCanvasProjection(result)
    } catch (error) {
      failure = error
    }
    if (!(failure instanceof AgentGraphProjectionError)) {
      throw new Error('expected private paths and non-canonical ids to be rejected')
    }
  }
}

export function testAgentGraphCanvasProjectionRejectsOversizedProperties() {
  let failure: unknown = null
  try {
    buildAgentGraphCanvasProjection(agentGraphResult({
      projection: {
        token: PROJECTION_TOKEN,
        readOnly: true,
        complete: true,
        truncated: false,
        limit: 1_000,
        graphData: {
          type: 'Graph',
          nodes: [{
            id: 'repo:alpha',
            label: 'Alpha',
            type: 'Symbol',
            properties: { content: 'x'.repeat(2 * 1024 * 1024) },
          }],
          edges: [],
        },
      },
      counts: { sources: 1, nodes: 1, edges: 0 },
    }))
  } catch (error) {
    failure = error
  }
  if (!(failure instanceof AgentGraphProjectionError)) {
    throw new Error('expected oversized projection property to be rejected')
  }
}

export function testAgentGraphCanvasProjectionBlocksGraphContentMutations() {
  const { restore } = initJsdomHarness()
  try {
    useGraphStore.getState().resetAll()
    const applied = buildAgentGraphCanvasProjection(agentGraphResult())
    useGraphStore.getState().setGraphData(applied)
    const state = useGraphStore.getState()
    state.updateNode('repo:alpha', { label: 'Changed' })
    state.addNode({ id: 'repo:new', label: 'New', type: 'Symbol', properties: {} })
    state.removeEdge('edge:alpha-beta')
    state.updateGraphMetadata({ changed: true })
    state.setGraphRagWorkflowJsonText('{"@type":"GraphRAGWorkflow"}')
    state.setGraphData({
      ...applied,
      nodes: applied.nodes.map(node => node.id === 'repo:alpha' ? { ...node, label: 'Replaced' } : node),
    })
    state.setGraphDataPreservingLayout({
      ...applied,
      edges: [],
    })
    state.clearGraphData()
    const current = useGraphStore.getState().graphData
    if (
      current?.nodes.length !== 2
      || current.nodes[0]?.label !== 'Alpha'
      || current.edges.length !== 1
      || current.metadata?.changed === true
    ) {
      throw new Error('expected read-only knowledge graph projection to reject graph content mutations')
    }
  } finally {
    useGraphStore.getState().resetAll()
    restore()
  }
}
