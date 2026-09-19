import { buildDashboardCanvasModel } from '@/components/DashboardCanvas/dashboardModel'
import { observationGraph } from '@/components/DashboardCanvas/dashboardObservationGraph'
import { agentMissionOverviewModel } from './agentMissionOverviewModel'
import type { MissionDashboardSnapshot } from './agentMissionDashboardSnapshot'
import { DASHBOARD_EVENT_SCHEMA, type DashboardEvent } from '@/components/DashboardCanvas/dashboardMarkdownDocument'
import { record, traceResources, resourceLabels, type RunTrace } from './missionControlProjection'
import { spanMetricValue } from './agentRunSpanMetric'

/** Project retained evidence only. The original run schema, manifests and accounting stay upstream. */
export function agentMissionDashboardEvent(trace: RunTrace, mission?: MissionDashboardSnapshot): DashboardEvent {
  const sequence = record(trace.workflowManifest?.value).sequence
  const model = mission ? buildDashboardCanvasModel(observationGraph(trace), mission.schema) : null
  const overview = mission ? agentMissionOverviewModel(trace, mission.codebase?.index) : null
  return { schema: DASHBOARD_EVENT_SCHEMA, sourceId: trace.runId,
    sequence: Number.isSafeInteger(sequence) ? Number(sequence) : trace.observedAt,
    observedAt: trace.observedAt, complete: !trace.partial && trace.spans.length === trace.total,
    data: { ...(mission ? { mission, overview,
      metrics: Object.fromEntries(model!.metrics.map(metric => [metric.id, metric.value])),
      cards: Object.fromEntries(model!.sections.flatMap(section => section.cards.map(card => [card.id, card.rows.length ? card.rows : card.series]))),
      stages: [{ label: 'Sources', value: overview!.sources }, { label: 'Nodes', value: overview!.nodes }, { label: 'Relationships', value: overview!.edges },
        { label: 'Parsed', value: overview!.parsed }, { label: 'Reused', value: overview!.reused }, { label: 'Worktrees', value: overview!.worktrees },
        { label: 'Evaluation', value: overview!.evaluation }, { label: 'Score', value: overview!.evaluationScore }],
    } : {}), run: { id: trace.runId, status: trace.status, spanCount: trace.spans.length },
      resources: Object.entries(resourceLabels(traceResources(trace))).map(([label, value]) => ({ label, value })),
      spans: trace.spans.map(span => ({ id: span.spanId, parent: span.parentSpanId, kind: span.kind, operation: span.operation, status: span.status, model: span.model ?? null,
        tokens: spanMetricValue(span, 'tokens'), costUsd: spanMetricValue(span, 'costUsd'),
        durationMs: spanMetricValue(span, 'time'), cpuMs: spanMetricValue(span, 'cpuMs'), peakMemoryBytes: spanMetricValue(span, 'peakMemoryBytes') })) } }
}
