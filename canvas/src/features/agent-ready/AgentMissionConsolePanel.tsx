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
  return <section aria-label="Console" className="min-w-0 h-full overflow-y-auto px-2 py-3 text-sm">
    <header className="mb-3 border-b pb-3">
      <h2 className="font-semibold">Console</h2>
      <p className="text-xs">Selected Agent Mission observation · inspection only</p>
    </header>
    {!trace ? <p role="status">No Mission observation is selected. Open Agent Mission in Dashboard to inspect its Span tree.</p> : <>
      <p role="status" className="mb-3 text-xs">Run {trace.runId} · {trace.status} · {trace.spans.length}/{trace.total} retained spans{trace.partial ? ' · partial coverage' : ''}</p>
      <section aria-label="Mission span tree" className="min-w-0 rounded border">
        <AgentRunSpanViews key={trace.runId} rows={rows} selectedId={inspection.spanId}
          onSelect={selectAgentRunInspection} search={inspection.search} metrics={[]} />
      </section>
      <section aria-label="Selected span evidence" className="mt-3 rounded border p-3 text-xs">
        <h3 className="font-semibold">{selected ? selected.operation : 'Whole run'}</h3>
        <p>Status: {selected?.status ?? trace.status}</p>
        <p>Source: {selected?.spanId ?? trace.runId}</p>
        <p>Evaluation: {selected?.evaluation.status ?? trace.evaluation.status}</p>
        <p className="mt-2">This observation grants no execution, release, payment, or publication authority.</p>
      </section>
    </>}
  </section>
}
