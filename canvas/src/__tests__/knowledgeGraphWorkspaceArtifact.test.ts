import type { WorkspaceKnowledgeGraphImportResult } from '@/features/markdown-explorer/workspaceActionBridge'
import { KNOWGRPH_LOCAL_MCP_TOOL_NAMES } from '@/features/agent-ready/knowgrphLocalMcpToolNames.mjs'
import { KnowledgeGraphProjectionError } from '@/features/knowledge-graph/knowledgeGraphCanvasProjection'
import {
  KNOWLEDGE_GRAPH_WORKSPACE_ARTIFACT_DIRECTORY,
  KNOWLEDGE_GRAPH_WORKSPACE_ARTIFACT_PATH,
  materializeKnowledgeGraphWorkspaceArtifact,
} from '@/features/knowledge-graph/knowledgeGraphWorkspaceArtifact'
import { loadWorkspaceSourceIndex, setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'
import { runLaunchImportUrl } from '@/lib/toolbar/launchImportDispatch'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const SNAPSHOT_DIGEST = 'a'.repeat(64)
const PARSER_REGISTRY_DIGEST = 'f'.repeat(64)
const GRAPH_ID = `kg:graph:${'1'.repeat(32)}`
const PROJECTION_TOKEN = `kg:projection:${'2'.repeat(24)}`
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

export async function testKnowledgeGraphRepositoryImportMaterializesSourceFilesArtifact() {
  const { restore } = initJsdomHarness()
  const repositoryUrl = 'https://code.example.test/organization/project'
  const importedResult = knowledgeGraphResult()
  try {
    resetWorkspaceFsForTests()
    useGraphStore.getState().resetAll()
    useGraphStore.getState().setSourceFiles([])
    let materializationCalls = 0

    await runLaunchImportUrl({
      urlRaw: repositoryUrl,
      forceKnowledgeGraphRepository: true,
      bridge: {
        knowledgeGraph: {
          importRepositoryUrl: async () => importedResult,
        },
        materializeKnowledgeGraphImport: async args => {
          materializationCalls += 1
          return materializeKnowledgeGraphWorkspaceArtifact(args)
        },
      },
      fallback: async () => {
        throw new Error('the repository graph artifact must not use the document fallback')
      },
      resolveMcpInvocation: async () => ({ invocation: SOURCE_BACKED_INVOCATION }),
    })

    if (materializationCalls !== 1) {
      throw new Error(`expected one materialization after a completed repository graph, got ${materializationCalls}`)
    }
    const fs = await getWorkspaceFs()
    const entries = await fs.listEntries()
    if (!entries.some(entry => entry.path === KNOWLEDGE_GRAPH_WORKSPACE_ARTIFACT_DIRECTORY && entry.kind === 'folder')) {
      throw new Error('expected a codebase-graph folder under Source Files docs')
    }
    if (entries.filter(entry => entry.path === KNOWLEDGE_GRAPH_WORKSPACE_ARTIFACT_PATH && entry.kind === 'file').length !== 1) {
      throw new Error('expected one deterministic codebase-graph Markdown document')
    }
    const text = await fs.readFileText(KNOWLEDGE_GRAPH_WORKSPACE_ARTIFACT_PATH)
    if (
      !text?.includes(`source_remote: ${JSON.stringify(repositoryUrl)}`)
      || !text.includes(`graph_id: ${JSON.stringify(GRAPH_ID)}`)
      || !text.includes(`snapshot_digest: ${JSON.stringify(SNAPSHOT_DIGEST)}`)
      || !text.includes(`parser_registry_digest: ${JSON.stringify(PARSER_REGISTRY_DIGEST)}`)
      || !text.includes('source_count: 2')
      || !text.includes('node_count: 2')
      || !text.includes('edge_count: 1')
    ) {
      throw new Error(`expected bounded graph provenance in the Source Files artifact, got ${String(text || '')}`)
    }
    const indexedSource = loadWorkspaceSourceIndex()[KNOWLEDGE_GRAPH_WORKSPACE_ARTIFACT_PATH]
    if (!indexedSource || indexedSource.kind !== 'local') {
      throw new Error(`expected the generated graph manifest to have local workspace ownership, got ${JSON.stringify(indexedSource)}`)
    }
    if (!useGraphStore.getState().sourceFiles.some(file => file.source?.path === `workspace:${KNOWLEDGE_GRAPH_WORKSPACE_ARTIFACT_PATH}`)) {
      throw new Error('expected the codebase graph manifest to be visible in Source Files')
    }
    if (useGraphStore.getState().canvas2dRenderer !== 'd3' || useGraphStore.getState().canvasRenderMode !== '2d') {
      throw new Error('expected the artifact write to preserve the authoritative graph canvas')
    }

    const replacementDigest = '9'.repeat(64)
    await materializeKnowledgeGraphWorkspaceArtifact({
      repositoryUrl,
      invocation: SOURCE_BACKED_INVOCATION,
      result: { ...importedResult, snapshotDigest: replacementDigest },
    })
    const replacementText = await fs.readFileText(KNOWLEDGE_GRAPH_WORKSPACE_ARTIFACT_PATH)
    const replacementEntries = await fs.listEntries()
    if (
      !replacementText?.includes(`snapshot_digest: ${JSON.stringify(replacementDigest)}`)
      || replacementEntries.filter(entry => entry.path === KNOWLEDGE_GRAPH_WORKSPACE_ARTIFACT_PATH && entry.kind === 'file').length !== 1
    ) {
      throw new Error('expected repeat imports to upsert the same deterministic codebase graph document')
    }
  } finally {
    setWorkspaceEntrySource(KNOWLEDGE_GRAPH_WORKSPACE_ARTIFACT_PATH, null, { persist: 'sync' })
    useGraphStore.getState().resetAll()
    resetWorkspaceFsForTests()
    restore()
  }
}

export async function testIncompleteKnowledgeGraphRepositoryDoesNotMaterializeSourceFilesArtifact() {
  const { restore } = initJsdomHarness()
  try {
    resetWorkspaceFsForTests()
    useGraphStore.getState().resetAll()
    const incomplete = knowledgeGraphResult()
    incomplete.complete = false
    incomplete.projection = { ...incomplete.projection, complete: false }
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
    if ((await fs.readFileText(KNOWLEDGE_GRAPH_WORKSPACE_ARTIFACT_PATH)) !== null) {
      throw new Error('expected no codebase graph document after an incomplete import')
    }
  } finally {
    setWorkspaceEntrySource(KNOWLEDGE_GRAPH_WORKSPACE_ARTIFACT_PATH, null, { persist: 'sync' })
    useGraphStore.getState().resetAll()
    resetWorkspaceFsForTests()
    restore()
  }
}
