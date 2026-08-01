import type {
  WorkspaceKnowledgeGraphArtifactRequest,
  WorkspaceKnowledgeGraphArtifactResult,
} from '@/features/markdown-explorer/workspaceActionBridge'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { WORKSPACE_DOCS_SOURCE_ROOT_PATH } from '@/features/workspace-fs/workspaceSourceRoots'
import { formatWorkspaceUtcSessionTimestamp } from '@/features/workspace-fs/workspaceTimestamp'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { upsertWorkspaceMarkdownSourceFile } from '@/features/source-files/upsertWorkspaceMarkdownSourceFile'

const CODEBASE_GRAPH_DIRECTORY_NAME = 'codebase-graph'
const CODEBASE_GRAPH_DOCUMENT_PREFIX = 'codebase-graph'
const MANIFEST_SCALAR_MAX_CHARS = 2_048
const MANIFEST_LIST_MAX_ITEMS = 64

export const KNOWLEDGE_GRAPH_WORKSPACE_ARTIFACT_DIRECTORY =
  `${WORKSPACE_DOCS_SOURCE_ROOT_PATH}/${CODEBASE_GRAPH_DIRECTORY_NAME}` as const

export function buildKnowledgeGraphWorkspaceArtifactFileName(timestampMs: number): string {
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

export function buildKnowledgeGraphWorkspaceArtifactMarkdown(
  args: WorkspaceKnowledgeGraphArtifactRequest,
): string {
  const { invocation, repositoryUrl, result } = args
  const counts = result.counts
  return `---
title: "Codebase graph"
document_type: "knowledge-graph-manifest"
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

function assertCompletedKnowledgeGraphArtifactRequest(args: WorkspaceKnowledgeGraphArtifactRequest): void {
  if (
    args.result.kind !== 'knowledge-graph'
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
export async function materializeKnowledgeGraphWorkspaceArtifact(
  args: WorkspaceKnowledgeGraphArtifactRequest,
  options?: { timestampMs?: number },
): Promise<WorkspaceKnowledgeGraphArtifactResult> {
  assertCompletedKnowledgeGraphArtifactRequest(args)
  const fs = await getWorkspaceFs()
  const timestampMs = Number.isFinite(options?.timestampMs)
    ? Number(options?.timestampMs)
    : Date.now()
  const path = await upsertWorkspaceMarkdownSourceFile({
    fs,
    parentPath: KNOWLEDGE_GRAPH_WORKSPACE_ARTIFACT_DIRECTORY,
    name: buildKnowledgeGraphWorkspaceArtifactFileName(timestampMs),
    text: buildKnowledgeGraphWorkspaceArtifactMarkdown(args),
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
