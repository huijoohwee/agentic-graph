import type { MissionDashboardSnapshot } from './agentMissionDashboardSnapshot'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { useGraphStore } from '@/hooks/useGraphStore'
import DashboardWidgetDisclosure from '@/components/DashboardCanvas/DashboardWidgetDisclosure'
import React from 'react'
import { DashboardCardView, DashboardMetricGrid } from '@/components/DashboardCanvas/DashboardWidgets'
import DashboardWidgetBoard from '@/components/DashboardCanvas/DashboardWidgetBoard'
import DashboardWidgetFlip from '@/components/DashboardCanvas/DashboardWidgetFlip'
import { useDashboardWidgets, widgetSettings } from '@/components/DashboardCanvas/dashboardWidgetConfiguration'
import type { GraphData } from '@/lib/graph/types'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { activateAgentRunWorkspace, selectAgentRunView, selectAgentRunInspection, useAgentRunInspection, useAgentRunWorkspace } from './agentRunInspectionStore'
import { agentMissionWorkspace, agentMissionSourceDocument } from './agentMissionWorkspace'
import { agentMissionOverviewModel } from './agentMissionOverviewModel'
import type { AgentMissionProvenanceContext } from './agentMissionProvenance'
import { useAgentMissionCodebaseIndex, type MissionCodebaseIndex } from './useAgentMissionCodebaseIndex'
import { record, type TraceSpan } from './missionControlProjection'
import { AgentMissionDashboardSummary, MissionGraphExplorer } from './AgentMissionDashboardView'

import { AgentMissionCodebaseGraphButton } from './agentMissionSourceFiles'

const button = `${UI_THEME_TOKENS.control.singleLine} inline-block rounded border text-xs disabled:opacity-50 ${UI_THEME_TOKENS.button.neutralMuted}`


function CodebaseExplorer({ codebase, span, retainedGraph, onClear, provenance }: { codebase: MissionCodebaseIndex; span: TraceSpan | null; retainedGraph?: GraphData; onClear?: () => void; provenance?: AgentMissionProvenanceContext }) {
  const [graph, setGraph] = React.useState<GraphData | null>(retainedGraph ?? null), [error, setError] = React.useState('')
  React.useEffect(() => {
    if (retainedGraph) { setGraph(retainedGraph); return }
    let current = true
    const { value } = codebase.index
    void import('@/features/agent-graph/agentGraphWorkspaceArtifact').then(owner =>
      owner.readAgentGraphWorkspaceProjection(String(record(value.projection).path),
        { graphId: String(value.graphId), snapshotDigest: String(value.snapshotDigest) }))
      .then(graph => { if (current) setGraph(graph) })
      .catch(() => { if (current) setError('Retained projection unavailable. Inspect the linked index manifest.') })
    return () => { current = false }
  }, [codebase.index.path, retainedGraph])
  if (!graph) return <p role="status" className="py-3 text-sm">{error || 'Loading retained D3 projection…'}</p>
  return <MissionGraphExplorer graph={graph} span={span} onClear={onClear ?? (() => selectAgentRunInspection(null))} provenance={provenance} />
}


/** Mission adds an evidence overview to the existing Dashboard; graph rendering stays with D3. */
export default function AgentMissionOverview({ children, retained, retainedSpanId, onRetainedSpan, onRetainedView, embedded = false, provenance }: { children?: React.ReactNode; retained?: MissionDashboardSnapshot; retainedSpanId?: string | null; onRetainedSpan?: (id: string | null) => void; onRetainedView?: (view: 'tree' | 'source' | 'evidence') => void; embedded?: boolean; provenance?: AgentMissionProvenanceContext }) {
  const inspection = useAgentRunInspection(), workspace = useAgentRunWorkspace()
  const liveCodebase = useAgentMissionCodebaseIndex(inspection?.trace, !retained)
  const codebase = retained ? { data: retained.codebase, error: undefined } : liveCodebase
  const selectedSpanId = retained ? retainedSpanId : inspection?.spanId
  const widgetConfiguration = useDashboardWidgets()
  const codebaseWidget = widgetSettings(widgetConfiguration.document, 'mission:codebase')
  const [exploring, setExploring] = React.useState(false)
  const [selectedSource, setSelectedSource] = React.useState<string | null>(null)
  React.useEffect(() => setSelectedSource(null), [retained?.trace.workflowManifest?.digest])
  React.useEffect(() => { if (typeof codebaseWidget.visible === 'boolean') setExploring(codebaseWidget.visible) }, [codebaseWidget.visible])
  const explorer = React.useRef<HTMLElement | null>(null)
  React.useEffect(() => {
    if (!selectedSpanId) return
    setExploring(true)
    const frame = requestAnimationFrame(() => explorer.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
    return () => cancelAnimationFrame(frame)
  }, [selectedSpanId])
  // Keep the single Mission observer mounted while its first snapshot loads or expires.
  // The stable keyed board also preserves the trace component when evidence arrives.
  const missionItem = children ? [{ id: 'mission:tree', cardId: 'agent-tree', content: children }] : []
  if (!retained && (!inspection || !workspace)) return <section aria-label="Mission evidence loop" className="min-w-0 space-y-3">
    <section key="widgets" ref={explorer}><DashboardWidgetBoard id="mission" items={missionItem} /></section>
  </section>
  const trace = retained?.trace ?? inspection!.trace, data = codebase.data, model = agentMissionOverviewModel(trace, data?.index)
  const sessionIndex = record(data?.index.value.projection).retention === 'session'
  const files = agentMissionWorkspace(trace, data)
  const openFile = (path: string) => {
    if (embedded && retained) { setSelectedSource(path); return }
    if (retained) {
      const input = widgetConfiguration.dashboard?.files?.input
      if (input) { useMarkdownExplorerStore.getState().setActivePath(input); useGraphStore.getState().setWorkspaceViewState({ mode: 'editor', paneOpen: true }) }
    } else activateAgentRunWorkspace(workspace!.view, 'editor', path)
  }
  const openView = (view: 'tree' | 'source' | 'evidence') => {
    if (retained) onRetainedView?.(view); else selectAgentRunView(view)
    document.querySelector(`[data-agent-mission-mode]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  const sourceDocument = embedded ? agentMissionSourceDocument(trace, selectedSource, data) : null
  return <section aria-label="Mission evidence loop" className="min-w-0 space-y-3">
    <AgentMissionDashboardSummary trace={trace} codebase={codebase} exploring={exploring} onExplore={() => setExploring(value => !value)}
      onOpenFile={openFile} onOpenView={openView} embedded={embedded} />
    {sourceDocument && <DashboardWidgetDisclosure id="mission:source-document" title={sourceDocument.path}>
      <p className="text-xs">Native mission source · read only · no execution or release authority.</p>
      <pre aria-label="Mission source document" className="max-h-96 overflow-auto whitespace-pre-wrap break-all pt-2 text-xs">{sourceDocument.text}</pre>
    </DashboardWidgetDisclosure>}
    {embedded && provenance && <DashboardWidgetDisclosure id="mission:source-binding" title="Source identity">
      <p className="text-xs">Workflow receipts and the codebase snapshot keep their own identities. Static relationships do not prove execution.</p>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(provenance, null, 2)}</pre>
    </DashboardWidgetDisclosure>}
    <section key="widgets" ref={explorer}>
      <DashboardWidgetBoard id="mission" items={[
        ...(data && exploring ? [{ id: 'mission:codebase', cardId: 'mission-codebase', content: (
<DashboardWidgetFlip widgetId="mission:codebase" template="codebase" title={codebaseWidget.title ?? 'Codebase knowledge graph'}
        defaults={{ title: 'Codebase knowledge graph', subtitle: 'Retained native snapshot · read only', tone: 'blue' }}
        configuration={<p className="text-xs">Uses the current Mission’s linked native codebase index. Renderer settings configure its retained D3 visualization.</p>}>
        <DashboardCardView card={{ id: 'mission-codebase', title: codebaseWidget.title ?? 'Codebase knowledge graph', subtitle: codebaseWidget.subtitle ?? (sessionIndex ? 'Session snapshot · read only' : 'Retained native snapshot · read only'), footnote: codebaseWidget.footnote, kind: 'table', tone: codebaseWidget.tone ?? 'blue', series: [], rows: [] }}>
          <p className="text-xs">{sessionIndex ? 'This session projection is not a retained workflow reference. Reloading or changing the source clears it.' : 'This explorer traverses the retained projection. Full-index queries use the same graph and snapshot identity from the index manifest.'}</p>
          <CodebaseExplorer key={data.index.path} codebase={data} retainedGraph={retained?.graph} provenance={provenance} onClear={retained ? () => onRetainedSpan?.(null) : undefined} span={trace.spans.find(span => span.spanId === selectedSpanId) ?? null} />
          {!retained && <AgentMissionCodebaseGraphButton codebase={data} />}
        </DashboardCardView>
      </DashboardWidgetFlip>
        ) }] : []),
        ...missionItem,
      ]} />
    </section>

    <DashboardWidgetDisclosure id="mission:index-economics" title={`Indexing economics · ${model.model}`}>
      <DashboardMetricGrid metrics={model.indexMetrics} />
      <p className="text-xs">{model.modelCalls} captured model calls. These are retained import measurements; opening this dashboard does not repeat indexing.</p>
    </DashboardWidgetDisclosure>
    <DashboardWidgetDisclosure id="mission:execution-economics" title="Agent execution economics">
      <DashboardMetricGrid metrics={model.workflowMetrics} />
      <p className="text-xs">Retained span coverage; reused stages are excluded from current consumption. Missing measurements remain unknown. Indexing and run values are not added together.</p>
      {!embedded && <div className="flex flex-wrap gap-2 pt-2"><button className={button} onClick={() => openView('tree')}>Trace spans</button>
        <button className={button} onClick={() => openView('source')}>Workflow context</button></div>
      }
    </DashboardWidgetDisclosure>
  </section>
}
