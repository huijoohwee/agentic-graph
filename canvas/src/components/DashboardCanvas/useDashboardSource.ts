import { useDashboardWidgets } from './dashboardWidgetConfiguration'
import { useCallback, useMemo } from 'react'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useAgentRunInspection, useAgentRunWorkspace, selectAgentRunInspection } from '@/features/agent-ready/agentRunInspectionStore'
import { spanNodeId } from '@/features/agent-ready/missionControlProjection'
import { observationGraph } from './dashboardObservationGraph'

/** Fronts and configuration backs resolve one source; observation never enters the authored store. */
export function useDashboardSource(active: boolean, retainedSpanId: string | null = null, onRetainedSpan?: (id: string | null) => void) {
  const saved = useDashboardWidgets().dashboard?.mission
  const workspace = useAgentRunWorkspace(), inspection = useAgentRunInspection()
  const authored = useActiveGraphRenderData(active && !workspace && !saved)
  const authoredSelection = useGraphStore(state => String(state.selectedNodeId || '').trim())
  const selectAuthored = useGraphStore(state => state.selectNode)
  const readOnly = !!workspace || !!saved, trace = workspace ? inspection?.trace ?? null : saved?.trace ?? null
  const graphData = useMemo(() => readOnly ? observationGraph(trace) : authored, [readOnly, trace, authored])
  const selectNode = useCallback((id: string) => {
    if (!readOnly) { selectAuthored(id); return }
    const span = trace?.spans.find(span => spanNodeId(trace.runId, span.spanId) === id)
    if (span) { if (saved && !workspace) onRetainedSpan?.(span.spanId); else selectAgentRunInspection(span.spanId) }
  }, [readOnly, trace, selectAuthored, saved, workspace, onRetainedSpan])
  return { graphData, readOnly, selectNode,
    selectedNodeId: readOnly ? trace && (workspace ? inspection?.spanId : retainedSpanId) ? spanNodeId(trace.runId, (workspace ? inspection!.spanId : retainedSpanId)!) : '' : authoredSelection }
}
