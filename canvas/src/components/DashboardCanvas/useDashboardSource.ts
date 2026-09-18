import { useCallback, useMemo } from 'react'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useAgentRunInspection, useAgentRunWorkspace, selectAgentRunInspection } from '@/features/agent-ready/agentRunInspectionStore'
import { spanNodeId, traceGraph, type RunTrace } from '@/features/agent-ready/missionControlProjection'
import { spanMetricValue } from '@/features/agent-ready/agentRunSpanMetric'
import type { GraphData } from '@/lib/graph/types'

/** Reuse the trace topology, with observation fields instead of renderer styling as data. */
function observationGraph(trace: RunTrace | null): GraphData {
  const graph = trace ? traceGraph(trace, '') : { type: 'agentic-os-observation', nodes: [], edges: [] }
  const spans = new Map(trace?.spans.map(span => [spanNodeId(trace.runId, span.spanId), span]))
  return { ...graph, metadata: { readOnly: true,
    title: trace ? `Agent Mission · ${trace.runId}` : 'Agent Mission',
    sourceKind: trace ? `Retained observation · ${trace.partial ? 'Partial trace' : 'Complete trace'}` : 'No observation loaded',
    summaryScope: 'Selected run · retained observation',
  }, nodes: graph.nodes.map(node => {
    const span = spans.get(node.id)
    return { ...node, properties: span ? {
      status: span.status, model: span.model ?? null, evaluation: span.evaluation.status,
      measurement: span.status === 'reused' ? 'historical' : 'current',
      'Time ms': spanMetricValue(span, 'time'), 'Exclusive observed ms': spanMetricValue(span, 'exclusive'),
      'CPU ms': spanMetricValue(span, 'cpuMs'), 'Peak RSS bytes': spanMetricValue(span, 'peakMemoryBytes'),
      Tokens: spanMetricValue(span, 'tokens'), 'Estimated cost USD': spanMetricValue(span, 'costUsd'),
    } : { observed: false } }
  }), edges: graph.edges.map(edge => ({ ...edge, properties: {} })) }
}

/** Fronts and configuration backs resolve one source; observation never enters the authored store. */
export function useDashboardSource(active: boolean) {
  const workspace = useAgentRunWorkspace(), inspection = useAgentRunInspection()
  const authored = useActiveGraphRenderData(active && !workspace)
  const authoredSelection = useGraphStore(state => String(state.selectedNodeId || '').trim())
  const selectAuthored = useGraphStore(state => state.selectNode)
  const readOnly = !!workspace, trace = inspection?.trace ?? null
  const graphData = useMemo(() => readOnly ? observationGraph(trace) : authored, [readOnly, trace, authored])
  const selectNode = useCallback((id: string) => {
    if (!readOnly) { selectAuthored(id); return }
    const span = trace?.spans.find(span => spanNodeId(trace.runId, span.spanId) === id)
    if (span) selectAgentRunInspection(span.spanId)
  }, [readOnly, trace, selectAuthored])
  return { graphData, readOnly, selectNode,
    selectedNodeId: readOnly ? trace && inspection?.spanId ? spanNodeId(trace.runId, inspection.spanId) : '' : authoredSelection }
}
