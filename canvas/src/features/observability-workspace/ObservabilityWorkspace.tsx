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

/** This entry owns only local selection; native Mission and D3 own every evidence view. */
export default function ObservabilityWorkspace() {
  const [manifest, setManifest] = React.useState<Manifest | null>(null), [repository, setRepository] = React.useState('')
  const [observation, setObservation] = React.useState<Observation | null>(null), [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [spanId, setSpanId] = React.useState<string | null>(null)
  const pending = React.useRef<AbortController | null>(null), generation = React.useRef(0)
  React.useEffect(() => {
    const controller = new AbortController()
    void fetch('/observability-workspace.json', { signal: controller.signal }).then(json).then(value => {
      if (value.schema !== 'agentic-canvas-os/observability-workspace/v1' || value.readOnly !== true || !Array.isArray(value.repositories)) throw Error('Workspace configuration unavailable')
      setManifest(value)
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => { controller.abort(); pending.current?.abort(); generation.current++ }
  }, [])
  const choose = (id: string) => {
    pending.current?.abort(); generation.current++; setRepository(id); setObservation(null); setError(''); setBusy(false); setSpanId(null)
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
              <MissionDashboard retained={retained} retainedSpanId={spanId} onRetainedSpan={setSpanId} provenance={observation.provenance} />
            </React.Suspense>
          </section>
          {observation.sourceDirty && <p role="status" className="text-sm">The local index contains uncommitted source; no immutable Git revision is assigned.</p>}
        </>}
      </>}
    </div>
  </main>
}
