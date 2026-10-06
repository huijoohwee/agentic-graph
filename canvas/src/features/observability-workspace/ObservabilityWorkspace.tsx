import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { defaultSchema } from '@/lib/graph/schema'
import type { GraphData } from '@/lib/graph/types'
import type { RunTrace } from '@/features/agent-ready/missionControlProjection'
import type { MissionDashboardSnapshot } from '@/features/agent-ready/agentMissionDashboardSnapshot'
import { readWorkspaceObservation } from '@/features/agent-ready/workspaceObservation'
import type { AgentMissionProvenanceContext } from '@/features/agent-ready/agentMissionProvenance'
import type { MissionCodebaseIndex } from '@/features/agent-ready/useAgentMissionCodebaseIndex'
import { PanelSelect } from '@/lib/ui/panelFormControls'
import { AGENT_GRAPH_PROJECTION_DIRECTORY } from '@/features/agent-graph/agentGraphProjectionPolicy'
import { buildAgentGraphWorkspaceIndex } from '@/features/agent-graph/agentGraphWorkspaceIndexBuilder'

const MissionDashboard = React.lazy(() => import('@/features/agent-ready/AgentMissionDashboardView'))
const button = `${UI_THEME_TOKENS.control.singleLine} rounded border text-sm disabled:opacity-50 ${UI_THEME_TOKENS.button.neutralMuted}`
type Manifest = { title: string; repositories: { id: string; label: string }[] }
type Observation = { trace: RunTrace | null; graph: GraphData | null; codebase?: MissionCodebaseIndex; provenance: AgentMissionProvenanceContext; sourceDirty?: boolean }
async function json(response: Response) {
  const text = await response.text()
  if (new TextEncoder().encode(text).length >= 500000) throw Error('Observation exceeds its transport bound')
  let value: any
  try { value = JSON.parse(text) } catch { throw Error('Local observation host unavailable. Open this workspace through its local launcher.') }
  if (!response.ok) throw Error(value.error || 'Observation unavailable')
  return value
}
function requestFor(repositoryId: string): typeof fetch {
  return (input, options) => {
    const operation = String(input).split('/').pop()
    return fetch(`/api/observability-workspace/${operation}`, { ...options,
      body: JSON.stringify({ ...JSON.parse(String(options?.body || '{}')), repositoryId }) })
  }
}
async function project(result: any): Promise<GraphData | null> {
  if (!result?.result) return null
  const { buildAgentGraphCanvasProjection } = await import('@/features/agent-graph/agentGraphCanvasProjectionBuilder')
  return buildAgentGraphCanvasProjection({ ...result.result, handled: true, kind: 'agent-graph' })
}
async function inspectIndex(graph: GraphData, signal: AbortSignal): Promise<MissionCodebaseIndex> {
  signal.throwIfAborted()
  const identity = graph.metadata!.agentGraphProjection as { graphId: string; snapshotDigest: string }
  const path = `${AGENT_GRAPH_PROJECTION_DIRECTORY}/${identity.graphId.slice(9)}-${identity.snapshotDigest}.json`
  // Logical native identity only: session inspection never initializes storage or binds workflow references.
  return { index: buildAgentGraphWorkspaceIndex(graph, path, { retention: 'session' }) }
}
async function mergeGraphNeighborhood(graph: GraphData, value: any, nodeId: string): Promise<GraphData> {
  const identity = graph.metadata?.agentGraphProjection as Record<string, any> | undefined
  if (!identity || identity.owner !== 'agent-graph-runtime' || identity.readOnly !== true
    || value?.mode !== 'neighbors' || value.resolution?.id !== nodeId
    || value.graphId !== identity.graphId || value.snapshotDigest !== identity.snapshotDigest
    || !Array.isArray(value.traversal?.nodes) || !Array.isArray(value.traversal?.edges))
    throw Error('Neighbor result did not match the selected native Graph snapshot and node')
  const { validateGraphData } = await import('@/features/agent-graph/agentGraphCanvasProjectionBuilder')
  const { styleAgentGraphEdge, styleAgentGraphNode } = await import('@/features/agent-graph/agentGraphVisualEvidence')
  const incoming = validateGraphData({ context: 'agentic-graph-agent-graph-projection', type: 'Graph',
    nodes: value.traversal.nodes, edges: value.traversal.edges }, identity.counts)
  const nodes = new Map(graph.nodes.map(node => [node.id, node]))
  for (const node of incoming.nodes) if (!nodes.has(node.id)) nodes.set(node.id, styleAgentGraphNode(node))
  const edges = new Map(graph.edges.map(edge => [edge.id, edge]))
  for (const edge of incoming.edges) if (!edges.has(edge.id)) edges.set(edge.id, styleAgentGraphEdge(edge))
  if (nodes.size > 2_000 || edges.size > 5_000) throw Error('Native Graph view reached its 2,000-node or 5,000-link live cap')
  const nodeList = [...nodes.values()], edgeList = [...edges.values()]
  const truncated = nodeList.length < identity.counts.nodes || edgeList.length < identity.counts.edges
  return validateGraphData({ ...graph, nodes: nodeList, edges: edgeList, metadata: { ...graph.metadata,
    agentGraphProjection: { ...identity, projectionComplete: !truncated && identity.complete === true,
      projectionTruncated: truncated, projectionReason: truncated ? 'connected-first-on-demand' : 'full_projection' } } }, identity.counts)
}

/** This entry owns only local selection; native Mission and D3 own every evidence view. */
export default function ObservabilityWorkspace() {
  const [manifest, setManifest] = React.useState<Manifest | null>(null), [repository, setRepository] = React.useState('')
  const [observation, setObservation] = React.useState<Observation | null>(null), [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [spanId, setSpanId] = React.useState<string | null>(null)
  const pending = React.useRef<AbortController | null>(null), generation = React.useRef(0)
  const expansionPending = React.useRef(new Set<AbortController>())
  const observationRef = React.useRef<Observation | null>(null)
  observationRef.current = observation
  React.useEffect(() => {
    const controller = new AbortController()
    void fetch('/observability-workspace.json', { signal: controller.signal }).then(json).then(value => {
      if (value.schema !== 'agentic-canvas-os/observability-workspace/v1' || value.readOnly !== true || !Array.isArray(value.repositories)) throw Error('Workspace configuration unavailable')
      setManifest(value)
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => { controller.abort(); pending.current?.abort(); expansionPending.current.forEach(item => item.abort()); generation.current++ }
  }, [])
  const choose = (id: string) => {
    pending.current?.abort(); expansionPending.current.forEach(item => item.abort()); expansionPending.current.clear()
    generation.current++; setRepository(id); setObservation(null); setError(''); setBusy(false); setSpanId(null)
  }
  const load = async (index: boolean) => {
    pending.current?.abort()
    const controller = new AbortController(), current = ++generation.current
    pending.current = controller; setBusy(true); setError('')
    const request = requestFor(repository)
    try {
      const trace = await readWorkspaceObservation(controller.signal, request)
      const indexed = index ? await json(await request('/index', { method: 'POST', signal: controller.signal,
        headers: { 'content-type': 'application/json' }, body: '{}' })) : trace?.workspaceObservation ? await json(await request('/workspace-codebase', {
          method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ manifestDigest: trace.workspaceObservation.manifestDigest }) })) : null
      const graph = await project(indexed)
      const codebase = graph ? await inspectIndex(graph, controller.signal) : undefined
      if (current !== generation.current || controller.signal.aborted) return
      setObservation({ trace, graph, codebase, sourceDirty: indexed?.sourceDirty, provenance: {
        source: trace?.workflowManifest?.value.source ?? {}, projectionSource: indexed?.projectionSource ?? {},
      } }); setSpanId(null)
    } catch (error) { if (current === generation.current && !controller.signal.aborted) setError(error instanceof Error ? error.message : 'Observation unavailable') }
    finally { if (current === generation.current) setBusy(false) }
  }
  const trace = observation?.trace, graph = observation?.graph
  const expandNode = async (nodeId: string, afterEdgeId?: string) => {
    const current = observationRef.current, currentGraph = current?.graph
    const identity = currentGraph?.metadata?.agentGraphProjection as Record<string, any> | undefined
    if (!currentGraph || !identity || repository === '') throw Error('Select and index a repository before expanding the graph')
    const availableNodes = 2_000 - currentGraph.nodes.length, availableEdges = 5_000 - currentGraph.edges.length
    if (availableNodes <= 0 || availableEdges <= 0) throw Error('Native Graph view reached its live cap; re-index to restart from highly connected nodes')
    const controller = new AbortController(), currentGeneration = generation.current, request = requestFor(repository)
    expansionPending.current.add(controller)
    try {
      const value = await json(await request('/graph-neighbors', { method: 'POST', signal: controller.signal,
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ graphId: identity.graphId,
          snapshotDigest: identity.snapshotDigest, from: nodeId, afterEdgeId, limit: Math.min(200, availableNodes, availableEdges) }) }))
      if (currentGeneration !== generation.current || controller.signal.aborted) throw Error('Repository selection changed; discarded stale neighbors')
      const latest = observationRef.current, latestIdentity = latest?.graph?.metadata?.agentGraphProjection as Record<string, any> | undefined
      if (!latest?.graph || latestIdentity?.graphId !== identity.graphId || latestIdentity?.snapshotDigest !== identity.snapshotDigest)
        throw Error('Selected graph snapshot changed; discarded stale neighbors')
      const merged = await mergeGraphNeighborhood(latest.graph, value, nodeId), codebase = await inspectIndex(merged, controller.signal)
      if (controller.signal.aborted || currentGeneration !== generation.current) throw Error('Repository selection changed; discarded stale neighbors')
      const next = { ...latest, graph: merged, codebase }; observationRef.current = next; setObservation(next)
      return { nextCursor: value.traversal.nextCursor ?? null,
        nodes: merged.nodes.length - latest.graph.nodes.length, edges: merged.edges.length - latest.graph.edges.length }
    } finally { expansionPending.current.delete(controller) }
  }
  const retained = React.useMemo<MissionDashboardSnapshot | undefined>(() => trace ? {
    trace, schema: defaultSchema, codebase: observation?.codebase, graph: graph ?? undefined,
  } : undefined, [trace, graph, observation?.codebase])
  return <main className={`min-h-screen min-w-0 p-4 sm:p-6 ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary}`}>
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="space-y-2"><h1 className="text-xl font-semibold">{manifest?.title ?? 'Observability workspace'}</h1>
        <p className="text-sm">Inspect retained agent observations and local codebase relationships. Source execution and evaluation are unavailable here.</p></header>
      <section aria-label="Repository selection" className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">Repository<PanelSelect aria-label="Repository" className={button} value={repository} onValueChange={choose}>
          <option value="">Select a repository</option>{manifest?.repositories.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</PanelSelect></label>
        <button type="button" className={button} disabled={!repository || busy} onClick={() => void load(false)}>Read retained observation</button>
        <button type="button" className={button} disabled={!repository || busy} onClick={() => void load(true)}>Index local source</button>
      </section>
      <p className="text-sm">Indexing explicitly reads the selected local repository with the native deterministic parser. It does not run agents or fetch remote code.</p>
      <p className="text-sm">Native capability: <code>agentic-graph.agent_graph.ingest</code>. WebMCP and command invocations are unavailable in this read-only entry; use its local controls.</p>
      {busy && <p role="status">Reading selected source…</p>}
      {error && <p role="alert" className="rounded border p-3">{error}</p>}
      {!observation && !busy && <p role="status">{repository ? 'Choose a read action to inspect this repository.' : 'Select a repository to begin. No observation is inferred.'}</p>}
      {observation && <>
        {!trace && <section aria-label="Agent observation" className="rounded border p-4"><h2 className="font-semibold">Agent activity is unobserved</h2><p className="text-sm">No selected native workflow archive is available for this repository.</p></section>}
        {retained && <>
          <section aria-label="Mission dashboard" className="kg-dashboard-content min-w-0">
            <React.Suspense fallback={<p role="status">Loading native Mission…</p>}>
              <MissionDashboard retained={retained} retainedSpanId={spanId} onRetainedSpan={setSpanId} provenance={observation.provenance}
                onExpandNode={!busy && graph ? expandNode : undefined} />
            </React.Suspense>
          </section>
          {observation.sourceDirty && <p role="status" className="text-sm">The local index contains uncommitted source; no immutable Git revision is assigned.</p>}
        </>}
      </>}
    </div>
  </main>
}
