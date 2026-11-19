import { CollapsibleSection, PanelScrollRegion, SettingsSectionHeader } from 'agentic-design-system/react/panels'
import React from 'react'
import { AgentRunSpanViews } from './AgentRunSpanViews'
import { selectAgentRunInspection, useAgentRunInspection } from './agentRunInspectionStore'
import { visibleSpanTree } from './missionControlProjection'

/** The floating Console reads the selected Mission snapshot; it never starts or evaluates a run. */
export default function AgentMissionConsolePanel() {
  const inspection = useAgentRunInspection()
  const trace = inspection?.trace
  const rows = React.useMemo(() => visibleSpanTree(trace?.spans ?? [], inspection?.search ?? ''), [trace, inspection?.search])
  const selected = trace?.spans.find(span => span.spanId === inspection?.spanId)
  return <PanelScrollRegion aria-label="Console" className="h-full">
    <SettingsSectionHeader headingAs="h2" title="Console" />
    <section className="agentic-panel-section-body">
      <p>Selected Agent Mission observation · inspection only</p>
      {!trace ? <p role="status">No Mission observation is selected. Open Agent Mission in Dashboard to inspect its Span tree.</p> : <>
        <p role="status" className="mb-3 text-xs">Run {trace.runId} · {trace.status} · {trace.spans.length}/{trace.total} retained spans{trace.partial ? ' · partial coverage' : ''}</p>
        <CollapsibleSection headingAs="h3" title="Mission span tree" defaultCollapsed={false}>
          <AgentRunSpanViews key={trace.runId} rows={rows} selectedId={inspection.spanId}
            onSelect={selectAgentRunInspection} search={inspection.search} metrics={[]} />
        </CollapsibleSection>
        <CollapsibleSection headingAs="h3" title={selected ? selected.operation : 'Whole run'} defaultCollapsed={false}>
          <section aria-label="Selected span evidence">
            <p>Status: {selected?.status ?? trace.status}</p>
            <p>Source: {selected?.spanId ?? trace.runId}</p>
            <p>Evaluation: {selected?.evaluation.status ?? trace.evaluation.status}</p>
            <p className="mt-2">This observation grants no execution, release, payment, or publication authority.</p>
          </section>
        </CollapsibleSection>
      </>}
    </section>
  </PanelScrollRegion>
}
