import type { WorkspaceKnowledgeGraphImportResult } from '@/features/markdown-explorer/workspaceActionBridge'
import {
  buildKnowledgeGraphCanvasProjection,
  KnowledgeGraphProjectionError,
  KNOWLEDGE_GRAPH_CANVAS_MAX_NODES,
} from '@/features/knowledge-graph/knowledgeGraphCanvasProjection'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  LAUNCH_FOLDER_PREVIEW_MAX_FILES,
  runLaunchImportKnowledgeGraphFolder,
  runLaunchImportLocalFolderPreview,
  runLaunchImportUrl,
} from '@/lib/toolbar/launchImportDispatch'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { KNOWGRPH_LOCAL_MCP_TOOL_NAMES } from '@/features/agent-ready/knowgrphLocalMcpToolNames.mjs'

const SNAPSHOT_DIGEST = 'a'.repeat(64)
const GRAPH_ID = `kg:graph:${'1'.repeat(32)}`
const FOLDER_GRAPH_ID = `kg:graph:${'2'.repeat(32)}`
const PROJECTION_TOKEN = `kg:projection:${'1'.repeat(24)}`
const SOURCE_BACKED_INVOCATION = Object.freeze({
  schema: 'knowgrph-knowledge-graph-invocation/v1' as const,
  tool: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest,
  action: '/source.ingest',
  semantics: Object.freeze(['#source.graph']),
  bindings: Object.freeze(['@source.root']),
  sourceRevision: 'c'.repeat(40),
  catalogDigest: 'd'.repeat(64),
  routingSchema: 'agentic-canvas-os-docs-routing/v1' as const,
  routingDigest: 'e'.repeat(64),
})

function knowledgeGraphResult(
  overrides: Partial<WorkspaceKnowledgeGraphImportResult> = {},
): WorkspaceKnowledgeGraphImportResult {
  return {
    handled: true,
    kind: 'knowledge-graph',
    graphId: GRAPH_ID,
    snapshotDigest: SNAPSHOT_DIGEST,
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

export async function testKnowledgeGraphHandledResultSuppressesLegacyFallbackWithoutCreatedPaths() {
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

export async function testKnowledgeGraphRepositoryUrlUsesCanonicalHostAndPreservesProjectionIds() {
  const { restore } = initJsdomHarness()
  const calls: string[] = []
  let receivedInvocation: unknown
  try {
    useGraphStore.getState().resetAll()
    const result = await runLaunchImportUrl({
      urlRaw: 'https://github.com/example/sample',
      bridge: {
        importUrl: async () => {
          calls.push('legacy-bridge')
          return { createdPaths: ['/partial.md'] }
        },
        knowledgeGraph: {
          importRepositoryUrl: async (url, _opts, invocation) => {
            calls.push(`knowledge-graph:${url}`)
            receivedInvocation = invocation
            return knowledgeGraphResult()
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
    if (!result || !('kind' in result) || result.kind !== 'knowledge-graph') {
      throw new Error('expected canonical knowledge graph result')
    }
    if (
      calls.length !== 2
      || !calls[0]?.startsWith('resolve:knowgrph.')
      || calls[1] !== 'knowledge-graph:https://github.com/example/sample'
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
    const metadata = graph.metadata?.knowledgeGraphProjection as Record<string, unknown> | undefined
    if (
      metadata?.owner !== 'knowledge-graph-runtime'
      || metadata?.readOnly !== true
      || metadata?.snapshotDigest !== SNAPSHOT_DIGEST
    ) {
      throw new Error(`expected read-only snapshot-bound projection metadata, got ${JSON.stringify(metadata)}`)
    }
  } finally {
    restore()
  }
}

export async function testKnowledgeGraphRepositoryUrlFailsClosedWithoutCanonicalHost() {
  let legacyFallbackCalls = 0
  let failure: unknown = null
  try {
    await runLaunchImportUrl({
      urlRaw: 'https://github.com/example/sample',
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

export async function testKnowledgeGraphRepositoryUrlRejectsUnsafeVariants() {
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
        bridge: {
          knowledgeGraph: {
            importRepositoryUrl: async () => {
              hostCalls += 1
              return knowledgeGraphResult()
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

export async function testKnowledgeGraphIncompleteRepositoryImportFailsClosed() {
  let legacyFallbackCalls = 0
  let failure: unknown = null
  try {
    await runLaunchImportUrl({
      urlRaw: 'https://github.com/example/sample',
      bridge: {
        knowledgeGraph: {
          importRepositoryUrl: async () => knowledgeGraphResult({ complete: false }),
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
  if (!(failure instanceof KnowledgeGraphProjectionError) || failure.code !== 'incomplete-snapshot') {
    throw new Error(`expected incomplete snapshot rejection, got ${String(failure)}`)
  }
  if (legacyFallbackCalls !== 0) {
    throw new Error('expected incomplete canonical import not to invoke the legacy fallback')
  }
}

export async function testKnowledgeGraphProjectionFailureNeverFallsBackAfterCanonicalResult() {
  let legacyFallbackCalls = 0
  let failure: unknown = null
  try {
    await runLaunchImportUrl({
      urlRaw: 'https://example.test/canonical-graph',
      bridge: {
        importUrl: async () => knowledgeGraphResult({ complete: false }),
      },
      fallback: async () => {
        legacyFallbackCalls += 1
        return { createdPaths: ['/partial.md'] }
      },
    })
  } catch (error) {
    failure = error
  }
  if (!(failure instanceof KnowledgeGraphProjectionError) || failure.code !== 'incomplete-snapshot') {
    throw new Error(`expected canonical projection validation failure, got ${String(failure)}`)
  }
  if (legacyFallbackCalls !== 0) {
    throw new Error('expected canonical projection validation failure not to invoke a legacy fallback')
  }
}

export async function testKnowledgeGraphFolderUsesOpaqueHostCapability() {
  const { restore } = initJsdomHarness()
  let calls = 0
  try {
    useGraphStore.getState().resetAll()
    const result = await runLaunchImportKnowledgeGraphFolder({
      bridge: {
        knowledgeGraph: {
          importFolder: async () => {
            calls += 1
            return knowledgeGraphResult({ graphId: FOLDER_GRAPH_ID })
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

export async function testKnowledgeGraphBrowserFolderFallbackIsSmallAndExplicit() {
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

export function testKnowledgeGraphCanvasProjectionRejectsUnboundedPayload() {
  const nodes = Array.from({ length: KNOWLEDGE_GRAPH_CANVAS_MAX_NODES + 1 }, (_, index) => ({
    id: `node:${index}`,
    label: `Node ${index}`,
    type: 'Symbol',
    properties: {},
  }))
  let failure: unknown = null
  try {
    buildKnowledgeGraphCanvasProjection(knowledgeGraphResult({
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
  if (!(failure instanceof KnowledgeGraphProjectionError) || failure.code !== 'projection-node-limit') {
    throw new Error(`expected bounded projection rejection, got ${String(failure)}`)
  }
}

export function testKnowledgeGraphCanvasProjectionRejectsPrivatePathsAndNonCanonicalIds() {
  for (const result of [
    knowledgeGraphResult({
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
    knowledgeGraphResult({
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
      buildKnowledgeGraphCanvasProjection(result)
    } catch (error) {
      failure = error
    }
    if (!(failure instanceof KnowledgeGraphProjectionError)) {
      throw new Error('expected private paths and non-canonical ids to be rejected')
    }
  }
}

export function testKnowledgeGraphCanvasProjectionRejectsOversizedProperties() {
  let failure: unknown = null
  try {
    buildKnowledgeGraphCanvasProjection(knowledgeGraphResult({
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
  if (!(failure instanceof KnowledgeGraphProjectionError)) {
    throw new Error('expected oversized projection property to be rejected')
  }
}

export function testKnowledgeGraphCanvasProjectionBlocksGraphContentMutations() {
  const { restore } = initJsdomHarness()
  try {
    useGraphStore.getState().resetAll()
    const applied = buildKnowledgeGraphCanvasProjection(knowledgeGraphResult())
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
