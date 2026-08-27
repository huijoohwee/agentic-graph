import type { WorkspaceKnowledgeGraphImportResult } from '@/features/markdown-explorer/workspaceActionBridge'
import { AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES } from '@/features/agent-ready/agenticgraphLocalMcpToolNames.mjs'
import { KnowledgeGraphProjectionError } from '@/features/knowledge-graph/knowledgeGraphCanvasProjection'
import {
  buildKnowledgeGraphWorkspaceArtifactFileName,
  KNOWLEDGE_GRAPH_WORKSPACE_ARTIFACT_DIRECTORY,
  materializeKnowledgeGraphWorkspaceArtifact,
} from '@/features/knowledge-graph/knowledgeGraphWorkspaceArtifact'
import type { WorkspaceFileActions } from '@/features/markdown-workspace/useWorkspaceFileActions/types'
import { loadWorkspaceSourceIndex, setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { workspaceDocumentKey } from '@/features/workspace-fs/path'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import { getGraphDataForDisplay } from '@/components/GraphCanvas/displayFilter'
import { resolveActiveMarkdownBaseGraph } from '@/hooks/active-graph-data/useActiveGraphData.impl'
import { useGraphStore } from '@/hooks/useGraphStore'
import { isWorkspaceDocumentCanvasGraphApplyDisabled } from '@/lib/markdown/workspaceDocumentCanvasApplyPolicy'
import {
  isWorkspaceDocumentSwitchApplySettled,
  shouldApplyStableWorkspaceSelectionToCanvas,
} from '@/lib/markdown-workspace-runtime/markdownWorkspaceDocumentSwitchApply'
import { buildMarkdownWorkspaceActionBridge } from '@/lib/markdown-workspace-runtime/markdownWorkspaceRuntime.composition'
import { runLaunchImportUrl } from '@/lib/toolbar/launchImportDispatch'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const SNAPSHOT_DIGEST = 'a'.repeat(64)
const PARSER_REGISTRY_DIGEST = 'f'.repeat(64)
const GRAPH_ID = `kg:graph:${'1'.repeat(32)}`
const PROJECTION_TOKEN = `kg:projection:${'2'.repeat(24)}`
const ARTIFACT_TIMESTAMP_MS = Date.UTC(2026, 6, 31, 12, 53, 37)
const ARTIFACT_FILE_NAME = 'codebase-graph_20260731T125337Z.md'
const SOURCE_BACKED_INVOCATION = Object.freeze({
  schema: 'agenticgraph-knowledge-graph-invocation/v1' as const,
  tool: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest,
  action: '/source.ingest',
  semantics: Object.freeze(['#source.graph']),
  bindings: Object.freeze(['@source.root']),
  sourceRevision: 'c'.repeat(40),
  catalogDigest: 'd'.repeat(64),
  routingSchema: 'agentic-canvas-os-docs-routing/v1' as const,
  routingDigest: 'e'.repeat(64),
})

function knowledgeGraphResult(): WorkspaceKnowledgeGraphImportResult {
  return {
    handled: true,
    kind: 'knowledge-graph',
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
        edges: [{
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
        }],
      },
    },
  }
}

function knowledgeGraphArtifactPath(timestampMs = ARTIFACT_TIMESTAMP_MS): string {
  return `${KNOWLEDGE_GRAPH_WORKSPACE_ARTIFACT_DIRECTORY}/${buildKnowledgeGraphWorkspaceArtifactFileName(timestampMs)}`
}

export async function testKnowledgeGraphRepositoryImportMaterializesSourceFilesArtifact() {
  const { restore } = initJsdomHarness()
  const repositoryUrl = 'https://code.example.test/organization/project'
  const importedResult = knowledgeGraphResult()
  const artifactPath = knowledgeGraphArtifactPath()
  const nextArtifactPath = knowledgeGraphArtifactPath(ARTIFACT_TIMESTAMP_MS + 1_000)
  importedResult.projection = {
    ...importedResult.projection,
    complete: false,
    truncated: true,
    reason: 'projection_limit',
  }
  try {
    if (buildKnowledgeGraphWorkspaceArtifactFileName(ARTIFACT_TIMESTAMP_MS) !== ARTIFACT_FILE_NAME) {
      throw new Error('expected codebase graph artifacts to use the UTC codebase-graph_YYYYMMDDTHHmmssZ.md format')
    }
    resetWorkspaceFsForTests()
    useGraphStore.getState().resetAll()
    useGraphStore.getState().setSourceFiles([])
    const focusCalls: Array<{ path: string; applyToGraph?: boolean }> = []
    const bridge = {
      ...buildMarkdownWorkspaceActionBridge({
        fileActions: {
          focusAfterImport: async (path, opts) => {
            focusCalls.push({ path, applyToGraph: opts?.applyToGraph })
          },
        } as unknown as WorkspaceFileActions,
        createParentPath: '/' as WorkspacePath,
        saveEnabled: false,
        saveActiveFileNow: () => undefined,
      }),
      knowledgeGraph: {
        importRepositoryUrl: async () => importedResult,
      },
    }
    const originalDateNow = Date.now
    try {
      Date.now = () => ARTIFACT_TIMESTAMP_MS
      await runLaunchImportUrl({
        urlRaw: repositoryUrl,
        forceKnowledgeGraphRepository: true,
        bridge,
        fallback: async () => {
          throw new Error('the repository graph artifact must not use the document fallback')
        },
        resolveMcpInvocation: async () => ({ invocation: SOURCE_BACKED_INVOCATION }),
      })
    } finally {
      Date.now = originalDateNow
    }

    if (focusCalls.length !== 1 || focusCalls[0]?.path !== artifactPath || focusCalls[0]?.applyToGraph !== false) {
      throw new Error(`expected the completed graph artifact to auto-focus through Source Files persistence, got ${JSON.stringify(focusCalls)}`)
    }
    const fs = await getWorkspaceFs()
    const entries = await fs.listEntries()
    if (!entries.some(entry => entry.path === KNOWLEDGE_GRAPH_WORKSPACE_ARTIFACT_DIRECTORY && entry.kind === 'folder')) {
      throw new Error('expected a codebase-graph folder under Source Files docs')
    }
    if (entries.filter(entry => entry.path === artifactPath && entry.kind === 'file').length !== 1) {
      throw new Error(`expected one timestamped codebase-graph Markdown document at ${artifactPath}`)
    }
    const text = await fs.readFileText(artifactPath)
    if (
      !text?.includes(`source_remote: ${JSON.stringify(repositoryUrl)}`)
      || !text.includes(`graph_id: ${JSON.stringify(GRAPH_ID)}`)
      || !text.includes(`snapshot_digest: ${JSON.stringify(SNAPSHOT_DIGEST)}`)
      || !text.includes(`parser_registry_digest: ${JSON.stringify(PARSER_REGISTRY_DIGEST)}`)
      || !text.includes('kgCanvasGraphApply: false')
      || !text.includes('source_count: 2')
      || !text.includes('node_count: 2')
      || !text.includes('edge_count: 1')
    ) {
      throw new Error(`expected bounded graph provenance in the Source Files artifact, got ${String(text || '')}`)
    }
    if (!isWorkspaceDocumentCanvasGraphApplyDisabled(text || '')) {
      throw new Error('expected the graph receipt to declare its graph-passive Source Files policy')
    }
    const indexedSource = loadWorkspaceSourceIndex()[artifactPath]
    if (!indexedSource || indexedSource.kind !== 'local') {
      throw new Error(`expected the generated graph manifest to have local workspace ownership, got ${JSON.stringify(indexedSource)}`)
    }
    if (!useGraphStore.getState().sourceFiles.some(file => file.source?.path === `workspace:${artifactPath}`)) {
      throw new Error('expected the codebase graph manifest to be visible in Source Files')
    }
    if (useGraphStore.getState().canvas2dRenderer !== 'd3' || useGraphStore.getState().canvasRenderMode !== '2d') {
      throw new Error('expected the artifact write to preserve the authoritative graph canvas')
    }
    const canonicalGraph = useGraphStore.getState().graphData
    if (!canonicalGraph || canonicalGraph.nodes.length !== 2 || canonicalGraph.edges.length !== 1) {
      throw new Error(`expected the canonical codebase graph to remain on Canvas, got ${JSON.stringify(canonicalGraph)}`)
    }
    const artifactDocumentKey = workspaceDocumentKey(artifactPath as WorkspacePath)
    const renderedGraph = resolveActiveMarkdownBaseGraph({
      baseGraphDataRaw: canonicalGraph,
      markdownName: artifactDocumentKey,
      markdownText: text || '',
    })
    if (!renderedGraph) throw new Error('expected a graph while the generated receipt is active')
    const displayGraph = getGraphDataForDisplay({ graphData: renderedGraph })
    if (
      !displayGraph.nodes.some(node => node.id === 'repo:alpha')
      || !displayGraph.nodes.some(node => node.id === 'repo:beta')
      || !displayGraph.edges.some(edge => edge.id === 'edge:alpha-beta')
    ) {
      throw new Error(`expected the receipt to retain visible canonical graph nodes and edges, got ${JSON.stringify(displayGraph)}`)
    }
    if (shouldApplyStableWorkspaceSelectionToCanvas({
      activePath: artifactPath as WorkspacePath,
      activeEntryKind: 'file',
      activeDocumentKey: artifactDocumentKey,
      nextText: text || '',
      markdownDocumentName: artifactDocumentKey,
      markdownDocumentText: text || '',
      graphDataSource: GRAPH_ID,
    })) {
      throw new Error('expected the graph receipt to avoid replaying a Markdown graph over the canonical graph')
    }
    if (!isWorkspaceDocumentSwitchApplySettled({
      activeDocumentKey: artifactDocumentKey,
      text: text || '',
      markdownDocumentName: artifactDocumentKey,
      markdownDocumentText: text || '',
      graphDataSource: GRAPH_ID,
    })) {
      throw new Error('expected the graph receipt switch to settle without replacing the canonical graph')
    }
    const replacementDigest = '9'.repeat(64)
    await materializeKnowledgeGraphWorkspaceArtifact({
      repositoryUrl,
      invocation: SOURCE_BACKED_INVOCATION,
      result: { ...importedResult, snapshotDigest: replacementDigest },
    }, { timestampMs: ARTIFACT_TIMESTAMP_MS })
    const replacementText = await fs.readFileText(artifactPath)
    const replacementEntries = await fs.listEntries()
    if (
      !replacementText?.includes(`snapshot_digest: ${JSON.stringify(replacementDigest)}`)
      || replacementEntries.filter(entry => entry.path === artifactPath && entry.kind === 'file').length !== 1
    ) {
      throw new Error('expected same-second imports to upsert the timestamped codebase graph document')
    }

    await materializeKnowledgeGraphWorkspaceArtifact({
      repositoryUrl,
      invocation: SOURCE_BACKED_INVOCATION,
      result: { ...importedResult, snapshotDigest: SNAPSHOT_DIGEST },
    }, { timestampMs: ARTIFACT_TIMESTAMP_MS + 1_000 })
    const nextText = await fs.readFileText(nextArtifactPath)
    if (
      !nextText?.includes(`snapshot_digest: ${JSON.stringify(SNAPSHOT_DIGEST)}`)
      || !useGraphStore.getState().sourceFiles.some(file => file.source?.path === `workspace:${nextArtifactPath}`)
    ) {
      throw new Error('expected a later codebase graph import to retain its own timestamped artifact')
    }
  } finally {
    setWorkspaceEntrySource(artifactPath, null, { persist: 'sync' })
    setWorkspaceEntrySource(nextArtifactPath, null, { persist: 'sync' })
    useGraphStore.getState().resetAll()
    resetWorkspaceFsForTests()
    restore()
  }
}

export async function testIncompleteKnowledgeGraphRepositoryDoesNotMaterializeSourceFilesArtifact() {
  const { restore } = initJsdomHarness()
  const artifactPath = knowledgeGraphArtifactPath()
  try {
    resetWorkspaceFsForTests()
    useGraphStore.getState().resetAll()
    const incomplete = knowledgeGraphResult()
    incomplete.complete = false
    incomplete.projection = { ...incomplete.projection, complete: true }
    let materializationCalls = 0
    let failure: unknown = null
    try {
      await runLaunchImportUrl({
        urlRaw: 'https://code.example.test/organization/incomplete',
        forceKnowledgeGraphRepository: true,
        bridge: {
          knowledgeGraph: {
            importRepositoryUrl: async () => incomplete,
          },
          materializeKnowledgeGraphImport: async args => {
            materializationCalls += 1
            return materializeKnowledgeGraphWorkspaceArtifact(args)
          },
        },
        fallback: async () => {
          throw new Error('the incomplete repository graph must not use the document fallback')
        },
        resolveMcpInvocation: async () => ({ invocation: SOURCE_BACKED_INVOCATION }),
      })
    } catch (error) {
      failure = error
    }
    if (!(failure instanceof KnowledgeGraphProjectionError) || failure.code !== 'incomplete-snapshot') {
      throw new Error(`expected incomplete graph failure before materialization, got ${String(failure)}`)
    }
    if (materializationCalls !== 0) {
      throw new Error('expected incomplete graph imports not to materialize Source Files artifacts')
    }
    const fs = await getWorkspaceFs()
    if ((await fs.readFileText(artifactPath)) !== null) {
      throw new Error('expected no codebase graph document after an incomplete import')
    }
  } finally {
    setWorkspaceEntrySource(artifactPath, null, { persist: 'sync' })
    useGraphStore.getState().resetAll()
    resetWorkspaceFsForTests()
    restore()
  }
}
