import assert from 'node:assert/strict'
import { DEFAULT_SPAN_METRICS, SPAN_METRICS, toggleSpanMetric, spanMetricLabel, spanMetricMaximum, spanMetricPercent, spanMetricValue } from '@/features/agent-ready/agentRunSpanMetric'
import type { TraceSpan } from '@/features/agent-ready/missionControlProjection'

export function testAgentRunSpanMetric(): void {
  const span: TraceSpan = { spanId: 'check', parentSpanId: null, kind: 'check', operation: 'check', taskId: '',
    attempt: null, status: 'completed', subjectDigest: null, component: { id: '', revision: '', digest: '' },
    links: [], timing: { offset: 15, inclusive: 120, exclusive: null }, cost: null,
    evaluation: { status: 'unevaluated', score: null, reason: null, evidence: null },
    resources: { cpuMs: 60, tokens: 0, peakMemoryBytes: 1024, costUsd: null } }
  assert.equal(spanMetricValue(span, 'time'), 120)
  assert.equal(spanMetricValue(span, 'exclusive'), null, 'Unobserved exclusive time is not inferred from duration')
  assert.equal(spanMetricValue({ ...span, timing: { ...span.timing, exclusive: 40 } }, 'exclusive'), 40)
  assert.equal(spanMetricLabel(40, 'exclusive'), '40 ms')
  assert.equal(spanMetricValue(span, 'tokens'), 0)
  assert.equal(spanMetricValue(span, 'costUsd'), null)
  assert.equal(spanMetricLabel(0, 'tokens'), '0 tokens')
  assert.equal(spanMetricLabel(null, 'tokens'), 'Unknown')
  assert.equal(spanMetricLabel(1024, 'peakMemoryBytes'), '1 KiB')
  assert.equal(spanMetricLabel(60, 'cpuMs'), '60 ms')
  assert.equal(spanMetricLabel(0.0000001, 'costUsd'), 'Est. $0.0000001')
  const reused: TraceSpan = { ...span, status: 'reused', historicalResources: { cpuMs: 120, tokens: 10, peakMemoryBytes: null, costUsd: 0 } }
  assert.equal(spanMetricValue(reused, 'cpuMs'), 120, 'Historical reuse agrees with the existing labelled resource details')
  const maximum = spanMetricMaximum([span, reused], 'cpuMs')
  assert.equal(spanMetricPercent(spanMetricValue(span, 'cpuMs'), maximum), 50)
  assert.equal(spanMetricPercent(null, maximum), null, 'Missing observations never become zero-length measurements')
  assert.equal(spanMetricPercent(0, 0), 0, 'A measured zero stays finite when all measurements are zero')
  assert.equal(spanMetricMaximum([], 'cpuMs'), 0)
  const costLog: TraceSpan = { ...span, resources: undefined, cost: { status: 'reported', prompt_tokens: 4, completion_tokens: 6, estimated_cost_usd: 0.01 } }
  assert.equal(spanMetricValue(costLog, 'tokens'), 10, 'Reuse the native cost-log projection')
  assert.equal(spanMetricValue(costLog, 'costUsd'), 0.01)
  const selected = toggleSpanMetric(toggleSpanMetric(DEFAULT_SPAN_METRICS, 'cpuMs'), 'exclusive')
  assert.deepEqual(selected, ['time', 'exclusive', 'cpuMs'], 'Independent metric selections retain the canonical column order')
  assert.deepEqual(toggleSpanMetric(selected, 'time'), ['exclusive', 'cpuMs'])
  assert.deepEqual(DEFAULT_SPAN_METRICS, ['time'], 'Toggling must not mutate the existing selection')
  assert.deepEqual(toggleSpanMetric(DEFAULT_SPAN_METRICS, 'time'), [], 'All metrics can be hidden without hiding the hierarchy')
  assert.deepEqual(SPAN_METRICS.map(metric => metric.label), ['Time', 'Exclusive observed', 'Tokens', 'CPU', 'Peak RSS', 'Cost'])
}
