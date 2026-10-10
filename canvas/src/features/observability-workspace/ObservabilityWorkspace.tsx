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
const CodebaseGraphExplorer = React.lazy(async () => ({
  default: (await import('@/features/agent-ready/AgentMissionDashboardView')).MissionGraphExplorer,
}))
const button = `${UI_THEME_TOKENS.control.singleLine} rounded border text-sm disabled:opacity-50 ${UI_THEME_TOKENS.button.neutralMuted}`
const localHost = import.meta.env.DEV
const observabilityApi = localHost ? '/api/observability-workspace' : '/agentic-os/api/observability-workspace'
type Manifest = { title: string; repositories: { id: string; label: string }[] }
type Observation = { trace: RunTrace | null; graph: GraphData | null; codebase?: MissionCodebaseIndex; graphEvidence?: any; provenance: AgentMissionProvenanceContext; sourceDirty?: boolean }
type ManualObservation = { route: string; visibleState: string; action: string; method: string; observedAt: string }

function indexSummary(codebase: MissionCodebaseIndex, graph: GraphData) {
  const counts = codebase.index.value.counts
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return `${graph.nodes.length} visible nodes · ${graph.edges.length} visible relationships`
  const value = counts as Record<string, unknown>
  const count = (key: string) => {
    const candidate = value[key]
    return typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 0 ? candidate : null
  }
  const sources = count('sources'), nodes = count('nodes'), edges = count('edges')
  if (sources === null || nodes === null || edges === null) return `${graph.nodes.length} visible nodes · ${graph.edges.length} visible relationships`
  return `${sources} indexed sources · ${nodes} snapshot nodes · ${edges} snapshot relationships · ${graph.nodes.length} currently visible nodes`
}
async function json(response: Response) {
  const text = await response.text()
  if (new TextEncoder().encode(text).length >= 500000) throw Error('Observation exceeds its transport bound')
  let value: any
  try { value = JSON.parse(text) } catch { throw Error('Observability service returned malformed JSON.') }
  if (!response.ok) throw Error(value.error || 'Observation unavailable')
  return value
}
function requestFor(repositoryId: string): typeof fetch {
  return (input, options) => {
    const operation = String(input).split('/').pop()
    return fetch(`${observabilityApi}/${operation}`, { ...options,
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
  // Session inspection never initializes storage or binds workflow references.
  return { index: buildAgentGraphWorkspaceIndex(graph, path, { retention: 'session' }) }
}
async function mergeGraphNeighborhood(graph: GraphData, value: any, nodeId: string): Promise<GraphData> {
  const identity = graph.metadata?.agentGraphProjection as Record<string, any> | undefined
  if (!identity || identity.owner !== 'agent-graph-runtime' || identity.readOnly !== true
    || value?.mode !== 'neighbors' || value.resolution?.id !== nodeId
    || value.graphId !== identity.graphId || value.snapshotDigest !== identity.snapshotDigest
    || !Array.isArray(value.traversal?.nodes) || !Array.isArray(value.traversal?.edges))
    throw Error('Neighbor result did not match the selected graph snapshot and node')
  const { validateGraphData } = await import('@/features/agent-graph/agentGraphCanvasProjectionBuilder')
  const { styleAgentGraphEdge, styleAgentGraphNode } = await import('@/features/agent-graph/agentGraphVisualEvidence')
  const incoming = validateGraphData({ context: 'agentic-graph-agent-graph-projection', type: 'Graph',
    nodes: value.traversal.nodes, edges: value.traversal.edges }, identity.counts)
  const nodes = new Map(graph.nodes.map(node => [node.id, node]))
  for (const node of incoming.nodes) if (!nodes.has(node.id)) nodes.set(node.id, styleAgentGraphNode(node))
  const edges = new Map(graph.edges.map(edge => [edge.id, edge]))
  for (const edge of incoming.edges) if (!edges.has(edge.id)) edges.set(edge.id, styleAgentGraphEdge(edge))
  if (nodes.size > 2_000 || edges.size > 5_000) throw Error('Graph view reached its 2,000-node or 5,000-link live cap')
  const nodeList = [...nodes.values()], edgeList = [...edges.values()]
  const truncated = nodeList.length < identity.counts.nodes || edgeList.length < identity.counts.edges
  return validateGraphData({ ...graph, nodes: nodeList, edges: edgeList, metadata: { ...graph.metadata,
    agentGraphProjection: { ...identity, projectionComplete: !truncated && identity.complete === true,
      projectionTruncated: truncated, projectionReason: truncated ? 'connected-first-on-demand' : 'full_projection' } } }, identity.counts)
}

/** This entry owns local selection; Mission and D3 own the evidence views. */
export default function ObservabilityWorkspace() {
  const [manifest, setManifest] = React.useState<Manifest | null>(null), [repository, setRepository] = React.useState('')
  const [observation, setObservation] = React.useState<Observation | null>(null), [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [spanId, setSpanId] = React.useState<string | null>(null)
  const [exploringCodebase, setExploringCodebase] = React.useState(false)
  const [sourceScope, setSourceScope] = React.useState('')
  const [sourceQuery, setSourceQuery] = React.useState('')
  const [sourceResult, setSourceResult] = React.useState<any>(null)
  const [sourceBusy, setSourceBusy] = React.useState(false)
  const [manualObservation, setManualObservation] = React.useState<ManualObservation | null>(null)
  const pending = React.useRef<AbortController | null>(null), generation = React.useRef(0)
  const sourcePending = React.useRef<AbortController | null>(null)
  const expansionPending = React.useRef(new Set<AbortController>())
  const observationRef = React.useRef<Observation | null>(null)
  observationRef.current = observation
  React.useEffect(() => {
    const controller = new AbortController()
    void fetch(`${observabilityApi}/manifest`, { signal: controller.signal }).then(json).then(value => {
      if (value.schema !== 'agentic-canvas-os/observability-workspace/v1' || value.readOnly !== true || !Array.isArray(value.repositories)) throw Error('Workspace configuration unavailable')
      setManifest(value)
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => { controller.abort(); pending.current?.abort(); sourcePending.current?.abort(); expansionPending.current.forEach(item => item.abort()); generation.current++ }
  }, [])
  const choose = (id: string) => {
    pending.current?.abort(); expansionPending.current.forEach(item => item.abort()); expansionPending.current.clear()
    sourcePending.current?.abort(); generation.current++; setRepository(id); setObservation(null); setError(''); setBusy(false); setSpanId(null); setExploringCodebase(false)
    setSourceResult(null); setSourceScope(''); setSourceQuery(''); setSourceBusy(false); setManualObservation(null)
  }
  const runSourceContext = async (input: Record<string, unknown>) => {
    if (!repository) return
    sourcePending.current?.abort()
    const controller = new AbortController(), current = generation.current
    sourcePending.current = controller; setSourceBusy(true); setError('')
    try {
      const value = await json(await requestFor(repository)('/source-context', { method: 'POST', signal: controller.signal,
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }))
      if (controller.signal.aborted || current !== generation.current) return
      setSourceResult(value)
    } catch (error) { if (!controller.signal.aborted && current === generation.current) setError(error instanceof Error ? error.message : 'Source context unavailable') }
    finally { if (current === generation.current) setSourceBusy(false) }
  }
  const load = async (index: boolean) => {
    pending.current?.abort()
    sourcePending.current?.abort(); setSourceBusy(false)
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
      setObservation({ trace, graph, codebase, graphEvidence: indexed?.result, sourceDirty: indexed?.sourceDirty, provenance: {
        source: trace?.workflowManifest?.value.source ?? {}, projectionSource: indexed?.projectionSource ?? {},
      } }); setSpanId(null); setExploringCodebase(false)
    } catch (error) { if (current === generation.current && !controller.signal.aborted) setError(error instanceof Error ? error.message : 'Observation unavailable') }
    finally { if (current === generation.current) setBusy(false) }
  }
  const trace = observation?.trace, graph = observation?.graph
  const expandNode = async (nodeId: string, afterEdgeId?: string) => {
    const current = observationRef.current, currentGraph = current?.graph
    const identity = currentGraph?.metadata?.agentGraphProjection as Record<string, any> | undefined
    if (!currentGraph || !identity || repository === '') throw Error('Select and index a repository before expanding the graph')
    const availableNodes = 2_000 - currentGraph.nodes.length, availableEdges = 5_000 - currentGraph.edges.length
    if (availableNodes <= 0 || availableEdges <= 0) throw Error('Graph view reached its live cap; re-index to restart from highly connected nodes')
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
  const addManualObservation = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const route = String(data.get('route') || '').trim(), visibleState = String(data.get('visibleState') || '').trim()
    const action = String(data.get('action') || '').trim(), method = String(data.get('method') || '')
    if (!route || !visibleState || !action || !['browser', 'accessibility', 'operator-note'].includes(method)) return
    setManualObservation({ route, visibleState, action, method, observedAt: new Date().toISOString() })
    event.currentTarget.reset()
  }
  const exportDossier = () => {
    const graph = observation?.graph, identity = graph?.metadata?.agentGraphProjection as Record<string, any> | undefined
    const sourceNodes = graph?.nodes.filter(node => node.type === 'SourceFile') ?? []
    const parserIds = [...new Set(sourceNodes.map(node => node.properties['corpus:parserId']).filter((value): value is string => typeof value === 'string'))].sort()
    const parserVersions = [...new Set(sourceNodes.map(node => node.properties['corpus:parserVersion']).filter((value): value is string => typeof value === 'string'))].sort()
    const nativeArtifacts = graph?.nodes.filter(node => node.type === 'NativeBinaryArtifact').map(node => {
      const sourcePath = node.properties['corpus:sourcePath']
      const source = sourceNodes.find(item => item.properties['corpus:sourcePath'] === sourcePath)
      return { id: node.id, label: node.label, sourcePath,
        sourceDigest: node.properties['native:sourceDigest'], format: node.properties['native:format'], architecture: node.properties['native:architecture'],
        parserId: source?.properties['corpus:parserId'], parserVersion: source?.properties['corpus:parserVersion'] }
    }) ?? []
    const sourceEvidence = sourceResult ? {
      operation: sourceResult.operation, scope: sourceResult.scope, revision: sourceResult.revision,
      snapshotSha256: sourceResult.snapshotSha256, sourceMode: sourceResult.sourceMode,
      dirty: sourceResult.repositoryState?.dirty ?? null, diagnostics: sourceResult.excluded ?? [],
      limits: sourceResult.limits ?? null,
      files: (Array.isArray(sourceResult.results) ? sourceResult.results : sourceResult.path ? [sourceResult] : []).map((item: any) => ({
        path: item.path, sha256: item.sha256, bytes: item.bytes,
        ...(Number.isSafeInteger(item.line) ? { line: item.line } : {}),
        ...(Number.isSafeInteger(item.nextLine) ? { nextLine: item.nextLine } : {}),
      })),
      observation: sourceResult.observation ?? null,
    } : null
    const dossier = {
      schema: 'agentic-graph/software-forensics-dossier/v1', authority: false, createdAt: new Date().toISOString(),
      selectedRepository: manifest?.repositories.find(row => row.id === repository) ?? null,
      repositoryState: sourceResult?.repositoryState ?? null,
      evidence: [
        ...(manualObservation ? [{ id: `observation:${manualObservation.observedAt}`, kind: 'operator-recorded-observation', ...manualObservation }] : []),
        ...(sourceEvidence ? [{ id: `source:${sourceEvidence.snapshotSha256}`, kind: 'exact-hash-source-context', ...sourceEvidence }] : []),
        ...(identity ? [{ id: `graph:${identity.graphId}:${identity.snapshotDigest}`, kind: 'source-graph', graphId: identity.graphId,
          snapshotDigest: identity.snapshotDigest, parserRegistryDigest: identity.parserRegistryDigest,
          complete: identity.complete, projectionComplete: identity.projectionComplete, counts: identity.counts,
          parserIds, parserVersions, diagnostics: observation?.graphEvidence?.diagnostics ?? [] }] : []),
        ...nativeArtifacts.map((item, index) => ({ id: `binary:${index}:${item.sourceDigest}`, kind: 'native-binary-metadata', ...item })),
        ...(trace ? [{ id: `retained-observation:${trace.runId}:${trace.workspaceObservation?.manifestDigest ?? trace.subjectDigest ?? 'unknown'}`,
          kind: 'retained-agent-observation', runId: trace.runId, status: trace.status,
          observedAt: trace.observedAt, manifestDigest: trace.workspaceObservation?.manifestDigest ?? null,
          partial: trace.partial, spanCount: trace.spans.length }] : []),
      ],
      limitations: ['Source excerpts and file bodies are omitted from this export; re-read by exact SHA-256.',
        'Operator-recorded UI observations are not independently verified.', 'Static parser output does not establish live application behavior.'],
    }
    const blob = new Blob([JSON.stringify(dossier, null, 2) + '\n'], { type: 'application/json' })
    const url = URL.createObjectURL(blob), anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'software-forensics-dossier.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <main className={`min-h-screen min-w-0 p-4 sm:p-6 ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary}`}>
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="space-y-2"><h1 className="text-xl font-semibold">{manifest?.title ?? 'Observability workspace'}</h1>
        <p className="text-sm">Inspect bounded source evidence. Source execution, native parsing, and evaluation are unavailable here.</p></header>
      <section aria-label="Repository selection" className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">Repository<PanelSelect aria-label="Repository" className={button} value={repository} onValueChange={choose}>
          <option value="">Select a repository</option>{manifest?.repositories.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</PanelSelect></label>
        {localHost && <><button type="button" className={button} disabled={!repository || busy} onClick={() => void load(false)}>Read retained observation</button>
          <button type="button" className={button} disabled={!repository || busy} onClick={() => void load(true)}>Index local source</button></>}
      </section>
      {localHost && <><p className="text-sm">Indexing reads the selected local repository with a deterministic parser. It does not run agents or fetch remote code.</p>
        <p className="text-sm">Index service: <code>agentic-graph.agent_graph.ingest</code>. Use the local controls in this read-only workspace.</p></>}
      {!localHost && <p className="text-sm">Published mode reads only the reviewed immutable source bundle selected above. Local indexing and retained traces are unavailable.</p>}
      {repository && <section aria-label="Exact-hash source context" className="rounded border p-4 space-y-3">
        <h2 className="font-semibold">Exact-hash source context</h2>
        <p className="text-sm">Map, search, and read the selected repository through a bounded immutable evidence artifact. Reads verify stored bytes against the returned SHA-256.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">Repository-relative scope<input className={`${button} min-w-56`} value={sourceScope} onChange={event => setSourceScope(event.target.value)} placeholder="src or a selected path" /></label>
          <button type="button" className={button} disabled={!sourceScope.trim() || sourceBusy} onClick={() => void runSourceContext({ operation: 'map', path: sourceScope.trim(), limit: 20 })}>Map scope</button>
          <label className="grid gap-1 text-sm">Literal search<input className={`${button} min-w-56`} value={sourceQuery} onChange={event => setSourceQuery(event.target.value)} placeholder="search selected source" /></label>
          <button type="button" className={button} disabled={!sourceScope.trim() || !sourceQuery.trim() || sourceBusy} onClick={() => void runSourceContext({ operation: 'search', path: sourceScope.trim(), query: sourceQuery.trim(), limit: 20 })}>Search scope</button>
        </div>
        {sourceBusy && <p role="status" className="text-sm">Reading selected source…</p>}
        {sourceResult && <div className="space-y-2 text-sm">
          <p>Operation: <code>{sourceResult.operation}</code> · Git revision: <code className="break-all">{sourceResult.revision}</code> · dirty: {String(sourceResult.repositoryState?.dirty ?? 'unknown')} · scope digest: <code className="break-all">{sourceResult.snapshotSha256}</code></p>
          {sourceResult.coverage && <p>Search coverage: {sourceResult.coverage.complete ? 'complete' : 'bounded partial'} · {sourceResult.coverage.filesInspected}/{sourceResult.coverage.filesInScope} files · {sourceResult.coverage.sourceBytesInspected} bytes inspected</p>}
          {sourceResult.observation && <p>Source bytes: {sourceResult.sourceBytes ?? 'unknown'} · read bytes: {sourceResult.observation.sourceReadBytes ?? 'unknown'} · elapsed: {typeof sourceResult.observation.elapsedMs === 'number' ? `${sourceResult.observation.elapsedMs.toFixed(1)} ms` : 'unknown'} · CPU: {typeof sourceResult.observation.cpuMs === 'number' ? `${sourceResult.observation.cpuMs.toFixed(1)} ms` : 'unknown'} · tokens/cost: unknown</p>}
          {sourceResult.limits && <p>Bounds: {sourceResult.limits.files} files · {sourceResult.limits.fileBytes} bytes/file · {sourceResult.limits.sourceBytes} selected bytes · {sourceResult.limits.outputBytes} output bytes · {sourceResult.limits.durationMs} ms</p>}
          {Array.isArray(sourceResult.results) && <ul className="max-h-56 space-y-1 overflow-auto rounded border p-2">{sourceResult.results.map((item: any) => <li key={`${item.path}:${item.sha256}`} className="flex flex-wrap items-center gap-2">
            <code>{item.path}</code><code className="break-all">{item.sha256}</code>{Number.isSafeInteger(item.line) && <span>line {item.line}</span>}
            <button type="button" className={button} disabled={sourceBusy} onClick={() => { setSourceScope(item.path); void runSourceContext({ operation: 'read', path: item.path, sha256: item.sha256, line: item.line ?? 1, lines: 40 }) }}>Read exact hash</button>
          </li>)}</ul>}
          {sourceResult.operation === 'read' && <section aria-label="Exact source excerpt" className="space-y-1"><p><code>{sourceResult.path}</code> · SHA-256 <code className="break-all">{sourceResult.sha256}</code> · lines {sourceResult.line}–{sourceResult.nextLine ? sourceResult.nextLine - 1 : 'end'}</p><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded border p-3">{sourceResult.content}</pre></section>}
        </div>}
      </section>}
      {localHost && repository && <section aria-label="Target UI observation record" className="rounded border p-4 space-y-3">
        <h2 className="font-semibold">Target UI observation record</h2>
        <p className="text-sm">Record what was actually visible and the inspection action. This operator-entered record is kept distinct from retained agent traces and source facts.</p>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={addManualObservation}>
          <label className="grid gap-1 text-sm">Target route<input name="route" required maxLength={512} className={button} placeholder="/settings or app route" /></label>
          <label className="grid gap-1 text-sm">Inspection method<select name="method" className={button} defaultValue="browser"><option value="browser">Browser</option><option value="accessibility">Accessibility tree</option><option value="operator-note">Operator note</option></select></label>
          <label className="grid gap-1 text-sm sm:col-span-2">Visible state<textarea name="visibleState" required maxLength={2000} className="min-h-20 rounded border bg-transparent p-2" placeholder="Describe the visible state; avoid secrets and personal data." /></label>
          <label className="grid gap-1 text-sm sm:col-span-2">Inspection action and outcome<textarea name="action" required maxLength={1000} className="min-h-16 rounded border bg-transparent p-2" placeholder="For example: inspected the displayed page without activating controls." /></label>
          <div className="sm:col-span-2"><button type="submit" className={button}>Record observation</button></div>
        </form>
        {manualObservation && <p role="status" className="text-sm">Recorded at {manualObservation.observedAt} · {manualObservation.method} · {manualObservation.route}: {manualObservation.action}</p>}
      </section>}
      {localHost && repository && <div className="flex flex-wrap items-center gap-3"><button type="button" className={button} onClick={exportDossier}>Download local evidence dossier</button><span className="text-sm">Export omits source text and marks unverified observations and static-analysis limits.</span></div>}
      {busy && <p role="status">Reading selected source…</p>}
      {error && <p role="alert" className="rounded border p-3">{error}</p>}
      {!observation && !busy && <p role="status">{repository ? 'Choose a read action to inspect this repository.' : 'Select a repository to begin. No observation is inferred.'}</p>}
      {observation && <>
        {!trace && <section aria-label="Agent observation" className="rounded border p-4"><h2 className="font-semibold">Agent activity is unobserved</h2><p className="text-sm">No selected workflow archive is available for this repository.</p></section>}
        {graph && observation.codebase && <>
          <section aria-label="Indexed codebase evidence" className="rounded border p-4 space-y-2">
            <h2 className="font-semibold">Indexed codebase evidence</h2>
            <p className="text-sm">{indexSummary(observation.codebase, graph)}</p>
            <p className="text-sm">This snapshot records static source relationships and recognized binary metadata. Record live application behavior and agent activity as separate evidence.</p>
            <button type="button" className={button} disabled={busy} aria-expanded={exploringCodebase} onClick={() => setExploringCodebase(value => !value)}>{exploringCodebase ? 'Hide codebase graph' : 'Explore codebase graph'}</button>
          </section>
          {exploringCodebase && <section aria-label="Codebase graph explorer" className="kg-dashboard-content min-w-0">
            <React.Suspense fallback={<p role="status">Loading codebase graph…</p>}>
              <CodebaseGraphExplorer graph={graph} span={null} context="codebase" provenance={observation.provenance}
                onExpandNode={!busy ? expandNode : undefined} />
            </React.Suspense>
          </section>}
        </>}
        {retained && <>
          <section aria-label="Mission dashboard" className="kg-dashboard-content min-w-0">
            <React.Suspense fallback={<p role="status">Loading Mission dashboard…</p>}>
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
