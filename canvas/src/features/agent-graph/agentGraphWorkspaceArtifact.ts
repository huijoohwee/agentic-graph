import type {
  WorkspaceAgentGraphArtifactRequest,
  WorkspaceAgentGraphArtifactResult,
} from '@/features/markdown-explorer/workspaceActionBridge'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { WORKSPACE_DOCS_SOURCE_ROOT_PATH, WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH } from '@/features/workspace-fs/workspaceSourceRoots'
import { formatWorkspaceUtcSessionTimestamp } from '@/features/workspace-fs/workspaceTimestamp'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { upsertWorkspaceMarkdownSourceFile } from '@/features/source-files/upsertWorkspaceMarkdownSourceFile'
import type { GraphData } from '@/lib/graph/types'
import { isReadOnlyAgentGraphProjection } from './agentGraphProjectionPolicy'
import { prepareAgentGraphCanvasView, AGENT_GRAPH_CANVAS_MAX_BYTES } from './agentGraphCanvasProjection'
import { useGraphStore } from '@/hooks/useGraphStore'
import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'

const CODEBASE_GRAPH_DIRECTORY_NAME = 'codebase-graph'
const CODEBASE_GRAPH_DOCUMENT_PREFIX = 'codebase-graph'
const MANIFEST_SCALAR_MAX_CHARS = 2_048
const MANIFEST_LIST_MAX_ITEMS = 64

export const AGENT_GRAPH_WORKSPACE_ARTIFACT_DIRECTORY =
  `${WORKSPACE_DOCS_SOURCE_ROOT_PATH}/${CODEBASE_GRAPH_DIRECTORY_NAME}` as const
const PROJECTION_CACHE_DIRECTORY = `${WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH}/${CODEBASE_GRAPH_DIRECTORY_NAME}`

export function buildAgentGraphWorkspaceArtifactFileName(timestampMs: number): string {
  return `${CODEBASE_GRAPH_DOCUMENT_PREFIX}_${formatWorkspaceUtcSessionTimestamp(timestampMs)}.md`
}

function boundedManifestScalar(value: unknown): string {
  const text = Array.from(String(value ?? ''))
    .filter(character => {
      const code = character.charCodeAt(0)
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
    })
    .join('')
  return text.length > MANIFEST_SCALAR_MAX_CHARS
    ? `${text.slice(0, MANIFEST_SCALAR_MAX_CHARS)}…`
    : text
}

function manifestYamlString(value: unknown): string {
  return JSON.stringify(boundedManifestScalar(value))
}

function manifestYamlList(values: readonly unknown[]): string {
  const bounded = values.slice(0, MANIFEST_LIST_MAX_ITEMS)
  return `[${bounded.map(value => manifestYamlString(value)).join(', ')}]`
}

function manifestCount(value: unknown): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? Math.max(0, Math.floor(numberValue)) : 0
}

export function buildAgentGraphWorkspaceArtifactMarkdown(
  args: WorkspaceAgentGraphArtifactRequest,
): string {
  const { invocation, repositoryUrl, result } = args
  const counts = result.counts
  return `---
title: "Codebase graph"
document_type: "agent-graph-manifest"
kgCanvasGraphApply: false
source_remote: ${manifestYamlString(repositoryUrl)}
graph_id: ${manifestYamlString(result.graphId)}
snapshot_digest: ${manifestYamlString(result.snapshotDigest)}
parser_registry_digest: ${manifestYamlString(result.parserRegistryDigest)}
complete: ${result.complete === true ? 'true' : 'false'}
source_count: ${manifestCount(counts.sources)}
node_count: ${manifestCount(counts.nodes)}
edge_count: ${manifestCount(counts.edges)}
invocation:
  schema: ${manifestYamlString(invocation.schema)}
  tool: ${manifestYamlString(invocation.tool)}
  action: ${manifestYamlString(invocation.action)}
  semantics: ${manifestYamlList(invocation.semantics)}
  bindings: ${manifestYamlList(invocation.bindings)}
  source_revision: ${manifestYamlString(invocation.sourceRevision)}
  catalog_digest: ${manifestYamlString(invocation.catalogDigest)}
  routing_schema: ${manifestYamlString(invocation.routingSchema)}
  routing_digest: ${manifestYamlString(invocation.routingDigest)}
---

# Codebase graph

This source-backed record identifies the completed local, deterministic codebase graph import. The graph snapshot remains the canonical query surface; its edges retain their source explanations in the graph data.

- Source remote: ${manifestYamlString(repositoryUrl)}
- Graph ID: ${manifestYamlString(result.graphId)}
- Snapshot digest: ${manifestYamlString(result.snapshotDigest)}
- Parser registry digest: ${manifestYamlString(result.parserRegistryDigest)}
- Sources: ${manifestCount(counts.sources)}
- Nodes: ${manifestCount(counts.nodes)}
- Edges: ${manifestCount(counts.edges)}
`
}

function assertCompletedAgentGraphArtifactRequest(args: WorkspaceAgentGraphArtifactRequest): void {
  if (
    args.result.kind !== 'agent-graph'
    || args.result.complete !== true
  ) {
    throw new Error('A completed canonical knowledge graph result is required before materializing its Source Files artifact.')
  }
}

/**
 * Upserts a timestamped Source Files artifact for each completed repository
 * graph import. Source Files owns selection through its existing persistence
 * flow; this receipt explicitly stays passive to the authoritative graph
 * canvas when selected.
 */
export async function materializeAgentGraphWorkspaceArtifact(
  args: WorkspaceAgentGraphArtifactRequest,
  options?: { timestampMs?: number },
): Promise<WorkspaceAgentGraphArtifactResult> {
  assertCompletedAgentGraphArtifactRequest(args)
  const fs = await getWorkspaceFs()
  const timestampMs = Number.isFinite(options?.timestampMs)
    ? Number(options?.timestampMs)
    : Date.now()
  const path = await upsertWorkspaceMarkdownSourceFile({
    fs,
    parentPath: AGENT_GRAPH_WORKSPACE_ARTIFACT_DIRECTORY,
    name: buildAgentGraphWorkspaceArtifactFileName(timestampMs),
    text: buildAgentGraphWorkspaceArtifactMarkdown(args),
    source: { kind: 'local', originalName: null },
    sourcePersistence: 'sync',
  })

  await applyWorkspaceImportToCanvas({
    fs,
    createdPaths: [path],
    opts: {
      applyToGraph: false,
      skipComposedGraphApply: true,
    },
  })
  return { path }
}

/** Cache the native read-only projection in the existing workspace, independent of any proposal. */
export async function retainAgentGraphWorkspaceProjection(graph: GraphData): Promise<string> {
  const identity = graph.metadata?.agentGraphProjection as Record<string, unknown>
  if (!isReadOnlyAgentGraphProjection(graph) || !/^kg:graph:[a-f0-9]{32}$/.test(String(identity?.graphId)) || !/^[a-f0-9]{64}$/.test(String(identity?.snapshotDigest))) throw new Error('A completed source projection is required')
  const text = JSON.stringify(graph)
  if (new TextEncoder().encode(text).length > AGENT_GRAPH_CANVAS_MAX_BYTES) throw new Error('Native source projection exceeds its workspace budget')
  const name = `${String(identity.graphId).slice(9)}-${identity.snapshotDigest}.json`
  const fs = await getWorkspaceFs()
  await ensureWorkspaceFolderTreeIfMissing({ fs, folderPath: PROJECTION_CACHE_DIRECTORY })
  const target = `${PROJECTION_CACHE_DIRECTORY}/${name}`
  if (await fs.readFileText(target) === null) await fs.createFile({ parentPath: PROJECTION_CACHE_DIRECTORY, name, text, mirrorToHost: false })
  return target
}

export async function reopenAgentGraphWorkspaceProjection(target: string, expected: { graphId: string; snapshotDigest: string }): Promise<void> {
  if (!target.startsWith(`${PROJECTION_CACHE_DIRECTORY}/`) || !/^[a-f0-9]{32}-[a-f0-9]{64}\.json$/.test(target.slice(PROJECTION_CACHE_DIRECTORY.length + 1))) throw new Error('Invalid retained source path')
  const text = await (await getWorkspaceFs()).readFileText(target)
  if (!text || new TextEncoder().encode(text).length > AGENT_GRAPH_CANVAS_MAX_BYTES) throw new Error('Retained source projection unavailable')
  const graph = JSON.parse(text) as GraphData
  const identity = graph.metadata?.agentGraphProjection as Record<string, unknown>
  if (!isReadOnlyAgentGraphProjection(graph) || identity.graphId !== expected.graphId || identity.snapshotDigest !== expected.snapshotDigest) throw new Error('Retained source identity mismatch')
  prepareAgentGraphCanvasView({ activateSource: true })
  useGraphStore.getState().setGraphData(graph)
}
