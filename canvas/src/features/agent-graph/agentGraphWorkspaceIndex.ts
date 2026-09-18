import type { GraphData } from '@/lib/graph/types'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { retainedAgentGraphDocumentIdentity, isReadOnlyAgentGraphProjection } from './agentGraphProjectionPolicy'
import { normalizeAgentGraphObservation } from '../../../../contracts/agent-graph-observation.mjs'

const ROOT = '/.workspace/codebase-index'
const ACTIVE = `${ROOT}/active.ref.json`
const SCHEMA = 'agentic-graph-codebase-index-manifest/v1'
const MAX_BYTES = 32_000
export type WorkspaceCodebaseIndex = { path: string; value: Record<string, unknown>; text: string }
const pending = new WeakMap<WorkspaceFs, Promise<unknown>>()

/** Serialize local references; importing the same snapshot never creates another index. */
async function serialize<T>(fs: WorkspaceFs, operation: () => Promise<T>): Promise<T> {
  const next = (pending.get(fs) ?? Promise.resolve()).catch(() => undefined).then(operation)
  pending.set(fs, next)
  try { return await next } finally { if (pending.get(fs) === next) pending.delete(fs) }
}

async function write(fs: WorkspaceFs, path: string, value: unknown) {
  const text = JSON.stringify(value, null, 2) + '\n'
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw Error('Codebase index manifest exceeds its workspace budget')
  const previous = await fs.readFileText(path)
  if (previous === text) return
  const split = path.lastIndexOf('/'), parentPath = path.slice(0, split)
  await ensureWorkspaceFolderTreeIfMissing({ fs, folderPath: parentPath })
  if (previous === null) await fs.createFile({ parentPath, name: path.slice(split + 1), text, mirrorToHost: false })
  else await fs.writeFileText(path, text, { mirrorToHost: false })
}

export function buildAgentGraphWorkspaceIndex(graph: GraphData, projectionPath: string): WorkspaceCodebaseIndex {
  const identity = graph.metadata?.agentGraphProjection as Record<string, unknown> | undefined
  const retained = retainedAgentGraphDocumentIdentity(projectionPath)
  if (!identity || !isReadOnlyAgentGraphProjection(graph) || identity.complete !== true || !retained
    || retained.graphId !== identity.graphId || retained.snapshotDigest !== identity.snapshotDigest) throw Error('Codebase index requires an identified native snapshot')
  const value = {
    schema: SCHEMA, authority: false, graphId: retained.graphId, snapshotDigest: retained.snapshotDigest,
    parserRegistryDigest: identity.parserRegistryDigest, acquisition: identity.acquisition ?? null,
    counts: identity.counts, complete: identity.complete,
    projection: { path: projectionPath, renderer: 'd3', readOnly: true, complete: identity.projectionComplete,
      truncated: identity.projectionTruncated, limit: identity.projectionLimit,
      loadedNodes: graph.nodes.length, loadedEdges: graph.edges.length },
    traversal: { graphId: retained.graphId, expectedSnapshotDigest: retained.snapshotDigest },
    observation: normalizeAgentGraphObservation(identity.observation) ?? null,
    observationBasis: 'first-retained-import',
    evaluation: { status: 'unobserved', evidence: null },
  }
  const path = `${ROOT}/${retained.graphId.slice(9)}/${retained.snapshotDigest}.manifest.json`
  return { path, value, text: JSON.stringify(value, null, 2) + '\n' }
}

/** Reuses the native snapshot and retained D3 projection. No parsing or graph copies. */
export async function retainAgentGraphWorkspaceIndex(graph: GraphData, projectionPath: string, { activate = true } = {}) {
  const fs = await getWorkspaceFs(), index = buildAgentGraphWorkspaceIndex(graph, projectionPath)
  return serialize(fs, async () => {
    // Preserve the first measured import for this exact snapshot. Subsequent runs have their own observations.
    if (await fs.readFileText(index.path) === null) await write(fs, index.path, index.value)
    if (activate) await write(fs, ACTIVE, { schema: 'agentic-graph-codebase-index-reference/v1', path: index.path,
      graphId: index.value.graphId, snapshotDigest: index.value.snapshotDigest })
    return index.path
  })
}

export async function readActiveAgentGraphWorkspaceIndex(snapshotPath?: string): Promise<WorkspaceCodebaseIndex | null> {
  const fs = await getWorkspaceFs(), referenceText = snapshotPath ? JSON.stringify({ path: snapshotPath }) : await fs.readFileText(ACTIVE)
  if (!referenceText) return null
  if (referenceText.length > MAX_BYTES) throw Error('Codebase index reference exceeds its workspace budget')
  const reference = JSON.parse(referenceText)
  const match = /^\/\.workspace\/codebase-index\/([a-f0-9]{32})\/([a-f0-9]{64})\.manifest\.json$/.exec(reference.path)
  if (!match || !snapshotPath && (reference.graphId !== `kg:graph:${match[1]}` || reference.snapshotDigest !== match[2])) throw Error('Invalid codebase index reference')
  const text = await fs.readFileText(reference.path)
  if (!text || new TextEncoder().encode(text).length > MAX_BYTES) throw Error('Codebase index manifest unavailable')
  const value = JSON.parse(text), retained = retainedAgentGraphDocumentIdentity(value.projection?.path ?? '')
  if (value.schema !== SCHEMA || value.authority !== false || value.graphId !== `kg:graph:${match[1]}`
    || value.snapshotDigest !== match[2] || retained?.graphId !== value.graphId
    || retained?.snapshotDigest !== value.snapshotDigest) throw Error('Codebase index identity mismatch')
  const { readAgentGraphWorkspaceProjection } = await import('./agentGraphWorkspaceArtifact')
  const graph = await readAgentGraphWorkspaceProjection(retained.path, retained)
  if (JSON.stringify(buildAgentGraphWorkspaceIndex(graph, retained.path).value) !== JSON.stringify(value)) throw Error('Codebase index does not match its retained native projection')
  return { path: reference.path, value, text }
}

/** A workflow retains only a reference to the shared index, never its graph or private run trace. */
export async function bindAgentGraphWorkspaceIndex(workflowId: string, index: WorkspaceCodebaseIndex) {
  const fs = await getWorkspaceFs()
  const path = `/.workspace/${encodeURIComponent(workflowId)}/codebase-index.ref.json`
  const value = { schema: 'agentic-graph-codebase-index-reference/v1', authority: false, workflowId,
    path: index.path, graphId: index.value.graphId, snapshotDigest: index.value.snapshotDigest }
  await serialize(fs, () => write(fs, path, value))
  return { path, value }
}
