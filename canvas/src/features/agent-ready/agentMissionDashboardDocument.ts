import { DASHBOARD_EVENT_SCHEMA, type DashboardEvent } from '@/components/DashboardCanvas/dashboardMarkdownDocument'
import { record, traceResources, resourceLabels, type RunTrace } from './missionControlProjection'
import { spanMetricValue } from './agentRunSpanMetric'

/** Project retained evidence only. The original run schema, manifests and accounting stay upstream. */
export function agentMissionDashboardEvent(trace: RunTrace): DashboardEvent {
  const sequence = record(trace.workflowManifest?.value).sequence
  return { schema: DASHBOARD_EVENT_SCHEMA, sourceId: trace.runId,
    sequence: Number.isSafeInteger(sequence) ? Number(sequence) : trace.observedAt,
    observedAt: trace.observedAt, complete: !trace.partial && trace.spans.length === trace.total,
    data: { run: { id: trace.runId, status: trace.status, spanCount: trace.spans.length },
      resources: Object.entries(resourceLabels(traceResources(trace))).map(([label, value]) => ({ label, value })),
      spans: trace.spans.map(span => ({ operation: span.operation, status: span.status,
        durationMs: spanMetricValue(span, 'time'), cpuMs: spanMetricValue(span, 'cpuMs'), peakMemoryBytes: spanMetricValue(span, 'peakMemoryBytes') })) } }
}
