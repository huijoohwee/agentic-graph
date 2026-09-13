import { load as parseYaml } from 'js-yaml'
import { useGraphStore } from '@/hooks/useGraphStore'
import { extractYamlFrontmatterHeaderBlock } from '@/lib/markdown/frontmatter'
import { readAgentGraphWorkspaceProjection } from './agentGraphWorkspaceArtifact'
import { prepareAgentGraphCanvasView } from './agentGraphCanvasProjection'
import { persistGraphDataToLocalStorage } from '@/hooks/store/graphDataPersistence'

/** A passive import document reopens a retained native snapshot; Markdown never becomes code evidence. */
export async function restoreAgentGraphWorkspaceDocument(name: string, text: string): Promise<boolean> {
  const header = extractYamlFrontmatterHeaderBlock(text)
  if (!header || header.yamlText.length > 40_000) return true
  const meta = parseYaml(header.yamlText) as Record<string, unknown> | null
  if (meta?.document_type !== 'agent-graph-manifest' || meta.source_projection === undefined) return true
  const graphId = String(meta.graph_id || '')
  const snapshotDigest = String(meta.snapshot_digest || '')
  const historyId = typeof meta.graphId === 'string' ? meta.graphId : graphId
  if (!/^kg:graph:[a-f0-9]{32}$/.test(graphId) || !/^[a-f0-9]{64}$/.test(snapshotDigest)
    || historyId.length > 200 || typeof meta.source_projection !== 'string') throw new Error('Invalid source graph document identity.')
  const current = useGraphStore.getState().graphData
  const identity = current?.metadata?.agentGraphProjection as Record<string, unknown> | undefined
  if (identity?.graphId === graphId && identity.snapshotDigest === snapshotDigest
    && (current?.metadata?.graphId || graphId) === historyId) return true
  const graph = await readAgentGraphWorkspaceProjection(meta.source_projection, { graphId, snapshotDigest })
  const active = useGraphStore.getState()
  if (active.markdownDocumentName !== name || active.markdownDocumentText !== text) return false
  prepareAgentGraphCanvasView()
  active.setGraphData(graph)
  // Native graph commits dedupe identical snapshots. Bind only the document's
  // presentation/history identity; never change source nodes, edges or evidence.
  const committed = useGraphStore.getState().graphData!
  const bound = { ...committed, metadata: { ...committed.metadata, graphId: historyId } }
  useGraphStore.setState(state => ({ graphData: bound, graphDataRevision: (state.graphDataRevision || 0) + 1 }))
  persistGraphDataToLocalStorage(bound)
  useGraphStore.getState().requestZoom('fit', { intent: 'fitToView' })
  return true
}
