import React from 'react'
import type { GraphData } from '@/lib/graph/types'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { WIDGET_SELECTION_SURFACE_CLASS_NAME } from '@/components/StoryboardWidget/storyboardWidgetPanelChromeClassName'
import { agentGraphEdgeCertainty, AGENT_GRAPH_CERTAINTY_STYLES } from '@/features/agent-graph/agentGraphVisualEvidence'
import { agentMissionOverviewModel, agentMissionSpanImpact } from './agentMissionOverviewModel'
import type { MissionDashboardSnapshot } from './agentMissionDashboardSnapshot'
import type { AgentMissionProvenanceContext } from './agentMissionProvenance'
import { agentMissionWorkspace, agentMissionSourceDocument } from './agentMissionWorkspace'
import type { MissionCodebaseIndex } from './useAgentMissionCodebaseIndex'
import { numberLabel, workflowSourceLink, type RunTrace, type TraceSpan } from './missionControlProjection'

const GraphInspection = React.lazy(() => import('@/components/GraphCanvas/GraphCanvasInspection'))
const button = `${UI_THEME_TOKENS.control.singleLine} inline-block rounded border text-xs disabled:opacity-50 ${UI_THEME_TOKENS.button.neutralMuted}`

function loadedProjectionSummary(data?: MissionCodebaseIndex): string | null {
  const projection = data?.index.value.projection
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) return null
  const inventory = (projection as Record<string, unknown>).inventory
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) return null
  const value = inventory as Record<string, unknown>
  if (value.scope !== 'loaded-projection') return null
  const entries = (input: unknown) => Array.isArray(input) ? input.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const row = item as Record<string, unknown>
    return typeof row.category === 'string' && typeof row.count === 'number' && Number.isInteger(row.count) && row.count >= 0
      ? [`${row.category} ${row.count}`] : []
  }) : []
  const categories = [...entries(value.nodeTypes).slice(0, 4), ...entries(value.nativeBinaryFormats).map(item => `format ${item}`).slice(0, 2)]
  return categories.length ? `Loaded projection top categories: ${categories.join(' · ')}` : 'Loaded projection contains no categorized node types.'
}

function mostConnectedNodeId(graph: GraphData): string | null {
  const degree = new Map<string, number>()
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
  }
  return [...degree].sort((left, right) => right[1] - left[1]
    || (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))[0]?.[0] ?? graph.nodes[0]?.id ?? null
}

export function MissionGraphExplorer({ graph, span, context = 'mission', onClear, provenance, onExpandNode }: {
  graph: GraphData
  span: TraceSpan | null
  context?: 'mission' | 'codebase'
  onClear?: () => void
  provenance?: AgentMissionProvenanceContext
  onExpandNode?: (nodeId: string, afterEdgeId?: string) => Promise<{ nextCursor: string | null; nodes: number; edges: number }>
}) {
  const [selected, setSelected] = React.useState<string | null>(() => mostConnectedNodeId(graph)), [search, setSearch] = React.useState('')
  const [cursors, setCursors] = React.useState<Record<string, string | null>>({}), [expanding, setExpanding] = React.useState(false)
  const [expansionStatus, setExpansionStatus] = React.useState('')
  const lookup = React.useMemo(() => getCachedGraphLookup({ cacheScope: 'mission-codebase', graphData: graph }), [graph])
  const impact = React.useMemo(() => agentMissionSpanImpact(span, graph, provenance), [span, graph, provenance])
  React.useEffect(() => { if (span) setSelected(impact.nodeIds[0] ?? null) }, [span, impact])
  React.useEffect(() => { setSelected(current => current && graph.nodes.some(node => node.id === current) ? current : mostConnectedNodeId(graph)) }, [graph])
  const node = selected ? lookup?.nodeById.get(selected) : null
  const edges = selected ? lookup?.incidentEdgesByNodeId.get(selected) ?? [] : []
  const contextLabel = span ? `Selected span: ${span.operation}` : context === 'codebase' ? 'Static codebase evidence' : 'Codebase context'
  const contextReason = !span && context === 'codebase'
    ? 'Static source relationships and recognized binary metadata; runtime behavior is unobserved.' : impact.reason
  const hasExpansionPage = selected ? Object.hasOwn(cursors, selected) : false
  const nextCursor = selected ? cursors[selected] : undefined
  const expand = async () => {
    if (!selected || !onExpandNode || expanding) return
    setExpanding(true); setExpansionStatus('')
    try {
      const result = await onExpandNode(selected, nextCursor ?? undefined)
      setCursors(current => ({ ...current, [selected]: result.nextCursor }))
      setExpansionStatus(`${result.nodes} nodes and ${result.edges} relationships loaded${result.nextCursor ? ' · more neighbors available' : ' · direct neighbors complete'}.`)
    } catch (error) { setExpansionStatus(error instanceof Error ? error.message : 'Neighbor expansion unavailable.') }
    finally { setExpanding(false) }
  }
  return <section aria-label="Codebase traversal and context" className="min-w-0 space-y-3 pt-3">
    <div role="status" aria-label="Codebase context" tabIndex={0} className={`rounded border p-3 text-xs ${WIDGET_SELECTION_SURFACE_CLASS_NAME}`}><p>{contextLabel}</p><p>{contextReason}</p>
      {span && onClear && <button className={`${button} mt-2`} onClick={onClear}>Clear span focus</button>}
    </div>
    <label className="grid gap-1 text-xs">Find a node in this projection
      <input className={`rounded border bg-transparent p-2 ${WIDGET_SELECTION_SURFACE_CLASS_NAME}`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Source path or symbol" />
    </label>
    {search && <ul className="flex max-h-40 flex-wrap gap-2 overflow-auto" aria-label="Matching codebase nodes">
      {graph.nodes.filter(item => `${item.label} ${item.properties['corpus:sourcePath'] ?? ''}`.toLowerCase().includes(search.toLowerCase())).slice(0, 20).map(item =>
        <li key={item.id}><button type="button" className={button} onClick={() => setSelected(item.id)}>{item.label}</button></li>)}
    </ul>}
    {onExpandNode && <div className="flex flex-wrap items-center gap-2 text-xs">
      <button type="button" className={button} disabled={!selected || expanding || hasExpansionPage && nextCursor === null} onClick={() => void expand()}>
        {expanding ? 'Loading neighbors…' : hasExpansionPage ? nextCursor ? 'Load more neighbors' : 'Neighbors loaded' : 'Expand selected node'}
      </button>
      <span>One hop · up to 200 relationships · exact snapshot</span>
      {expansionStatus && <span role="status">{expansionStatus}</span>}
    </div>}
    <React.Suspense fallback={<p role="status">Loading D3…</p>}><GraphInspection graph={graph} selectedNodeId={span && !impact.nodeIds.length ? null : selected} onSelect={setSelected}
      highlightedNodeIds={impact.nodeIds} highlightedEdgeIds={impact.edgeIds}
      rendererControls label="Codebase knowledge graph" description="Indexed sources, symbols and relationships; select a node to inspect source evidence" /></React.Suspense>
    {node && <section aria-label="Selected codebase evidence" className="rounded border p-3 text-xs">
      <h4 className="font-semibold">{node.label} · {node.type}</h4>
      <p className="break-all">Source: {String(node.properties['corpus:sourcePath'] ?? 'Unreported')}</p>
      <p>{edges.length} relationships in this projection</p>
      <ul className="space-y-2 pt-2">{edges.slice(0, 12).map(edge => {
        const otherId = String(edge.source) === node.id ? String(edge.target) : String(edge.source), other = lookup?.nodeById.get(otherId)
        return <li key={edge.id} className="rounded border p-2">
          <button type="button" className="underline" disabled={!other} onClick={() => setSelected(otherId)}>{String(edge.label || edge.type)} → {other?.label ?? otherId}</button>
          <p>{AGENT_GRAPH_CERTAINTY_STYLES[agentGraphEdgeCertainty(edge)].label}</p>
          <p>{String(edge.properties['evidence:explanation'] ?? 'Explanation unreported')}</p>
          <p className="break-all">{String(edge.properties['evidence:sourcePath'] ?? '')} · {String(edge.properties['evidence:ruleId'] ?? '')}</p>
        </li>
      })}</ul>
      {edges.length > 12 && <p>Showing 12 of {edges.length} retained relationships.</p>}
    </section>}
  </section>
}

/** Shared read-only Mission summary used by the dashboard and observability workspace. */
export function AgentMissionDashboardSummary({ trace, codebase, exploring, onExplore, onOpenFile, onOpenView, embedded = false }: {
  trace: RunTrace
  codebase: { data?: MissionCodebaseIndex; error?: string }
  exploring: boolean
  onExplore: () => void
  onOpenFile: (path: string) => void
  onOpenView?: (view: 'tree' | 'source' | 'evidence') => void
  embedded?: boolean
}) {
  const { data, error } = codebase, model = agentMissionOverviewModel(trace, data?.index), files = agentMissionWorkspace(trace, data), source = workflowSourceLink(trace)
  const inventory = loadedProjectionSummary(data)
  return <>
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-base font-semibold">Codebase → Agent Mission</h3>
      {source && <a className="text-xs underline" href={source} target="_blank" rel="noreferrer">Workflow source revision</a>}
    </header>
    <ol className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3" aria-label="Index to observability">
      <li className="min-w-0 rounded border border-sky-500/40 p-3">
        <p className="text-xs text-sky-500">01 · INDEX</p><h4 className="font-semibold">{data ? model.sources : 'No linked'} sources</h4>
        <p className="py-1 text-xs">{data ? `${model.nodes} nodes · ${model.edges} relationships` : error || 'Load a retained codebase graph index.'}</p>
        {inventory && <p className="pb-2 text-xs">{inventory} · counts describe the loaded projection</p>}
        {data && <p className="pb-2 text-xs">{model.complete ? 'Complete admitted-source index' : 'Partial index'} · {model.parsed} parsed · {model.reused} reused</p>}
        <button className={button} title="Index manifest" disabled={!data} onClick={() => onOpenFile(`${files.root}/codebase-index.manifest.json`)}>Index manifest</button>
      </li>
      <li className="min-w-0 rounded border border-violet-500/40 p-3">
        <p className="text-xs text-violet-500">02 · TRAVERSE & CONTEXTUALIZE</p><h4 className="font-semibold">Source knowledge graph</h4>
        <p className="py-1 text-xs">{data ? `${model.loadedNodes} of ${model.nodes} nodes · ${model.loadedEdges} of ${model.edges} links${model.truncated ? ' · Connected-first projection' : ' · Complete projection'}` : 'No graph projection available'}</p>
        <p className="pb-2 text-xs">Start with highly connected nodes, then load exact-snapshot neighbors on demand.</p>
        <button className={button} title={exploring ? 'Hide codebase explorer' : 'Explore codebase · D3'} disabled={!data} aria-expanded={exploring} onClick={onExplore}>{exploring ? 'Hide codebase explorer' : 'Explore codebase · D3'}</button>
      </li>
      <li className="min-w-0 rounded border border-emerald-500/40 p-3">
        <p className="text-xs text-emerald-500">03 · OBSERVE & EVALUATE</p><h4 className="font-semibold">{trace.status} · {model.evaluation}</h4>
        <p className="py-1 text-xs">{trace.spans.length}/{trace.total} retained spans · {numberLabel(model.worktrees)} worktrees{trace.partial ? ' · Partial trace' : ''}</p>
        <p className="pb-2 text-xs">Evaluation score: {model.evaluationScore}</p>
        <div className="flex flex-wrap gap-2"><button className={button} onClick={() => onOpenFile(files.manifestPath)}>Mission manifest</button>
          {!embedded && onOpenView && <button className={button} onClick={() => onOpenView('evidence')}>Evaluation evidence</button>}</div>
      </li>
    </ol>
  </>
}

/** Read-only Mission presentation; no dashboard editor or execution control is mounted. */
export default function AgentMissionDashboardView({ retained, retainedSpanId, onRetainedSpan, provenance, onExpandNode }: {
  retained: MissionDashboardSnapshot
  retainedSpanId?: string | null
  onRetainedSpan?: (id: string | null) => void
  provenance?: AgentMissionProvenanceContext
  onExpandNode?: (nodeId: string, afterEdgeId?: string) => Promise<{ nextCursor: string | null; nodes: number; edges: number }>
}) {
  const [exploring, setExploring] = React.useState(false), [selectedSource, setSelectedSource] = React.useState<string | null>(null)
  const codebase = { data: retained.codebase }, trace = retained.trace
  const selectedSpan = trace.spans.find(span => span.spanId === retainedSpanId) ?? null
  const sourceDocument = agentMissionSourceDocument(trace, selectedSource, retained.codebase)
  return <section aria-label="Mission evidence loop" className="min-w-0 space-y-3">
    <AgentMissionDashboardSummary trace={trace} codebase={codebase} exploring={exploring} onExplore={() => setExploring(value => !value)}
      embedded onOpenFile={setSelectedSource} />
    {exploring && retained.graph && <MissionGraphExplorer graph={retained.graph} span={selectedSpan} onClear={() => onRetainedSpan?.(null)} provenance={provenance} onExpandNode={onExpandNode} />}
    {exploring && !retained.graph && <p role="status">This mission has no retained D3 projection.</p>}
    {sourceDocument && <details className={`rounded border p-3 ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`}>
      <summary className="cursor-pointer text-sm font-semibold">{sourceDocument.path}</summary>
      <p className="pt-2 text-xs">Mission source · read only · no execution or release authority.</p>
      <pre aria-label="Mission source document" className="max-h-96 overflow-auto whitespace-pre-wrap break-all pt-2 text-xs">{sourceDocument.text}</pre>
    </details>}
    {provenance && <details className={`rounded border p-3 ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`}>
      <summary className="cursor-pointer text-sm font-semibold">Source identity</summary>
      <p className="pt-2 text-xs">Workflow receipts and the codebase snapshot keep their own identities. Static relationships do not prove execution.</p>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(provenance, null, 2)}</pre>
    </details>}
  </section>
}
