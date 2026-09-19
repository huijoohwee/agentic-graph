import React from 'react'
import { DashboardCardView, DashboardMetricGrid } from '@/components/DashboardCanvas/DashboardWidgets'
import DashboardWidgetBoard from '@/components/DashboardCanvas/DashboardWidgetBoard'
import DashboardWidgetFlip from '@/components/DashboardCanvas/DashboardWidgetFlip'
import { useDashboardWidgets, widgetSettings } from '@/components/DashboardCanvas/dashboardWidgetConfiguration'
import { WIDGET_SELECTION_SURFACE_CLASS_NAME } from '@/components/StoryboardWidget/storyboardWidgetPanelChromeClassName'
import type { GraphData } from '@/lib/graph/types'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { agentGraphEdgeCertainty, AGENT_GRAPH_CERTAINTY_STYLES } from '@/features/agent-graph/agentGraphVisualEvidence'
import { activateAgentRunWorkspace, selectAgentRunView, selectAgentRunInspection, useAgentRunInspection, useAgentRunWorkspace } from './agentRunInspectionStore'
import { agentMissionWorkspace } from './agentMissionWorkspace'
import { agentMissionOverviewModel, agentMissionSpanImpact } from './agentMissionOverviewModel'
import { useAgentMissionCodebaseIndex, type MissionCodebaseIndex } from './useAgentMissionCodebaseIndex'
import { numberLabel, record, workflowSourceLink, type TraceSpan } from './missionControlProjection'

import { AgentMissionCodebaseGraphButton } from './agentMissionSourceFiles'

const GraphInspection = React.lazy(() => import('@/components/GraphCanvas/GraphCanvasInspection'))
const button = `rounded border px-3 py-2 text-xs disabled:opacity-50 ${UI_THEME_TOKENS.button.neutralMuted}`


function CodebaseExplorer({ codebase, span }: { codebase: MissionCodebaseIndex; span: TraceSpan | null }) {
  const [graph, setGraph] = React.useState<GraphData | null>(null), [error, setError] = React.useState('')
  const [selected, setSelected] = React.useState<string | null>(null), [search, setSearch] = React.useState('')
  React.useEffect(() => {
    let current = true
    const { value } = codebase.index
    void import('@/features/agent-graph/agentGraphWorkspaceArtifact').then(owner =>
      owner.readAgentGraphWorkspaceProjection(String(record(value.projection).path),
        { graphId: String(value.graphId), snapshotDigest: String(value.snapshotDigest) }))
      .then(graph => { if (current) { setGraph(graph); setSelected(graph.nodes[0]?.id ?? null) } })
      .catch(() => { if (current) setError('Retained projection unavailable. Inspect the linked index manifest.') })
    return () => { current = false }
  }, [codebase.index.path])
  const lookup = React.useMemo(() => getCachedGraphLookup({ cacheScope: 'mission-codebase', graphData: graph }), [graph])
  const impact = React.useMemo(() => agentMissionSpanImpact(span, graph), [span, graph])
  React.useEffect(() => { if (span) setSelected(impact.nodeIds[0] ?? null) }, [span, impact])
  const node = selected ? lookup?.nodeById.get(selected) : null
  const edges = selected ? lookup?.incidentEdgesByNodeId.get(selected) ?? [] : []
  if (!graph) return <p role="status" className="py-3 text-sm">{error || 'Loading retained D3 projection…'}</p>
  return <section aria-label="Codebase traversal and context" className="min-w-0 space-y-3 pt-3">
    <div role="status" aria-label="Codebase context" tabIndex={0} className={`rounded border p-3 text-xs ${WIDGET_SELECTION_SURFACE_CLASS_NAME}`}><p>{span ? `Selected span: ${span.operation}` : 'Codebase context'}</p><p>{impact.reason}</p>
      {span && <button className={`${button} mt-2`} onClick={() => selectAgentRunInspection(null)}>Clear span focus</button>}
    </div>
    <label className="grid gap-1 text-xs">Find a node in this projection
      <input className={`rounded border bg-transparent p-2 ${WIDGET_SELECTION_SURFACE_CLASS_NAME}`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Source path or symbol" />
    </label>
    {search && <ul className="flex max-h-40 flex-wrap gap-2 overflow-auto" aria-label="Matching codebase nodes">
      {graph.nodes.filter(node => `${node.label} ${node.properties['corpus:sourcePath'] ?? ''}`.toLowerCase().includes(search.toLowerCase())).slice(0,20).map(node =>
        <li key={node.id}><button type="button" className={button} onClick={() => setSelected(node.id)}>{node.label}</button></li>)}
    </ul>}
    <React.Suspense fallback={<p role="status">Loading D3…</p>}><GraphInspection graph={graph} rendererControls selectedNodeId={span && !impact.nodeIds.length ? null : selected} onSelect={setSelected}
      highlightedNodeIds={impact.nodeIds} highlightedEdgeIds={impact.edgeIds}
      label="Codebase knowledge graph" description="Indexed sources, symbols and relationships; select a node to inspect source evidence" /></React.Suspense>
    {node && <section aria-label="Selected codebase evidence" className="rounded border p-3 text-xs">
      <h4 className="font-semibold">{node.label} · {node.type}</h4>
      <p className="break-all">Source: {String(node.properties['corpus:sourcePath'] ?? 'Unreported')}</p>
      <p>{edges.length} relationships in this projection</p>
      <ul className="space-y-2 pt-2">{edges.slice(0,12).map(edge => {
        const otherId = String(edge.source) === node.id ? String(edge.target) : String(edge.source)
        const other = lookup?.nodeById.get(otherId)
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

/** Mission adds an evidence overview to the existing Dashboard; graph rendering stays with D3. */
export default function AgentMissionOverview({ children }: { children?: React.ReactNode }) {
  const inspection = useAgentRunInspection(), workspace = useAgentRunWorkspace()
  const codebase = useAgentMissionCodebaseIndex(inspection?.trace)
  const widgetConfiguration = useDashboardWidgets()
  const codebaseWidget = widgetSettings(widgetConfiguration.document, 'mission:codebase')
  const [exploring, setExploring] = React.useState(false)
  React.useEffect(() => { if (typeof codebaseWidget.visible === 'boolean') setExploring(codebaseWidget.visible) }, [codebaseWidget.visible])
  const explorer = React.useRef<HTMLElement | null>(null)
  React.useEffect(() => {
    if (!inspection?.spanId) return
    setExploring(true)
    const frame = requestAnimationFrame(() => explorer.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
    return () => cancelAnimationFrame(frame)
  }, [inspection?.spanId])
  // Keep the single Mission observer mounted while its first snapshot loads or expires.
  // The stable keyed board also preserves the trace component when evidence arrives.
  const missionItem = children ? [{ id: 'mission:tree', cardId: 'agent-tree', content: children }] : []
  if (!inspection || !workspace) return <section aria-label="Mission evidence loop" className="min-w-0 space-y-3">
    <section key="widgets" ref={explorer}><DashboardWidgetBoard id="mission" items={missionItem} /></section>
  </section>
  const trace = inspection.trace, data = codebase.data, model = agentMissionOverviewModel(trace, data?.index)
  const files = agentMissionWorkspace(trace, data), source = workflowSourceLink(trace)
  const openFile = (path: string) => activateAgentRunWorkspace(workspace.view, 'editor', path)
  const openView = (view: 'tree' | 'source' | 'evidence') => {
    selectAgentRunView(view)
    document.querySelector(`[data-agent-mission-mode]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  return <section aria-label="Mission evidence loop" className="min-w-0 space-y-3">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-base font-semibold">Codebase → Agent Mission</h3>
      {source && <a className="text-xs underline" href={source} target="_blank" rel="noreferrer">Workflow source revision</a>}
    </header>
    <ol className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3" aria-label="Index to observability">
      <li className="min-w-0 rounded border border-sky-500/40 p-3">
        <p className="text-xs text-sky-500">01 · INDEX</p><h4 className="font-semibold">{data ? model.sources : 'No linked'} sources</h4>
        <p className="py-1 text-xs">{data ? `${model.nodes} nodes · ${model.edges} relationships` : codebase.error || 'Load a retained native Codebase graph index.'}</p>
        {data && <p className="pb-2 text-xs">{model.complete ? 'Complete admitted-source index' : 'Partial index'} · {model.parsed} parsed · {model.reused} reused</p>}
        <button className={button} disabled={!data} onClick={() => openFile(`${files.root}/codebase-index.manifest.json`)}>Index manifest</button>
      </li>
      <li className="min-w-0 rounded border border-violet-500/40 p-3">
        <p className="text-xs text-violet-500">02 · TRAVERSE & CONTEXTUALIZE</p><h4 className="font-semibold">Source knowledge graph</h4>
        <p className="py-1 text-xs">{data ? `${model.loadedNodes} nodes · ${model.loadedEdges} links in D3${model.truncated ? ' · Bounded projection' : ''}` : 'No graph projection available'}</p>
        <p className="pb-2 text-xs">Select nodes and follow source-backed relationship explanations.</p>
        <button className={button} disabled={!data} aria-expanded={exploring} onClick={() => setExploring(value => !value)}>{exploring ? 'Hide codebase explorer' : 'Explore codebase · D3'}</button>
      </li>
      <li className="min-w-0 rounded border border-emerald-500/40 p-3">
        <p className="text-xs text-emerald-500">03 · OBSERVE & EVALUATE</p><h4 className="font-semibold">{trace.status} · {model.evaluation}</h4>
        <p className="py-1 text-xs">{trace.spans.length}/{trace.total} retained spans · {numberLabel(model.worktrees)} worktrees{trace.partial ? ' · Partial trace' : ''}</p>
        <p className="pb-2 text-xs">Evaluation score: {model.evaluationScore}</p>
        <div className="flex flex-wrap gap-2"><button className={button} onClick={() => openFile(files.manifestPath)}>Mission manifest</button>
          <button className={button} onClick={() => openView('evidence')}>Evaluation evidence</button></div>
      </li>
    </ol>
    <section key="widgets" ref={explorer}>
      <DashboardWidgetBoard id="mission" items={[
        ...(data && exploring ? [{ id: 'mission:codebase', cardId: 'mission-codebase', content: (
<DashboardWidgetFlip widgetId="mission:codebase" template="codebase" title={codebaseWidget.title ?? 'Codebase knowledge graph'}
        defaults={{ title: 'Codebase knowledge graph', subtitle: 'Retained native snapshot · read only', tone: 'blue' }}
        configuration={<p className="text-xs">Uses the current Mission’s linked native codebase index. Renderer settings configure its retained D3 visualization.</p>}>
        <DashboardCardView card={{ id: 'mission-codebase', title: codebaseWidget.title ?? 'Codebase knowledge graph', subtitle: codebaseWidget.subtitle ?? 'Retained native snapshot · read only', footnote: codebaseWidget.footnote, kind: 'table', tone: codebaseWidget.tone ?? 'blue', series: [], rows: [] }}>
          <p className="text-xs">This explorer traverses the retained projection. Full-index queries use the same graph and snapshot identity from the index manifest.</p>
          <CodebaseExplorer key={data.index.path} codebase={data} span={trace.spans.find(span => span.spanId === inspection.spanId) ?? null} />
          <AgentMissionCodebaseGraphButton codebase={data} />
        </DashboardCardView>
      </DashboardWidgetFlip>
        ) }] : []),
        ...missionItem,
      ]} />
    </section>

    <details className="rounded border p-3" open><summary className="cursor-pointer text-sm font-semibold">Indexing economics · {model.model}</summary>
      <DashboardMetricGrid metrics={model.indexMetrics} />
      <p className="text-xs">{model.modelCalls} captured model calls. These are retained import measurements; opening this dashboard does not repeat indexing.</p>
    </details>
    <details className="rounded border p-3" open><summary className="cursor-pointer text-sm font-semibold">Agent execution economics</summary>
      <DashboardMetricGrid metrics={model.workflowMetrics} />
      <p className="text-xs">Retained span coverage; reused stages are excluded from current consumption. Missing measurements remain unknown. Indexing and run values are not added together.</p>
      <div className="flex flex-wrap gap-2 pt-2"><button className={button} onClick={() => openView('tree')}>Trace spans</button>
        <button className={button} onClick={() => openView('source')}>Workflow context</button></div>
    </details>
  </section>
}
