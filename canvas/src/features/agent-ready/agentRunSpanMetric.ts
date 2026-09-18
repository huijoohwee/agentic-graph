import { known, numberLabel, spanResources, type TraceSpan } from './missionControlProjection'

export const SPAN_METRICS = [
  { key: 'time', label: 'Time' }, { key: 'tokens', label: 'Tokens' },
  { key: 'cpuMs', label: 'CPU' }, { key: 'peakMemoryBytes', label: 'Memory' },
  { key: 'costUsd', label: 'Cost' },
] as const
export type SpanMetric = typeof SPAN_METRICS[number]['key']
export const durationLabel = (ms: number | null) => ms === null ? 'Unknown duration' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`

/** Match the existing resource details, including explicitly labelled historical reuse. */
export function spanMetricValue(span: TraceSpan, metric: SpanMetric): number | null {
  if (metric === 'time') return known(span.timing.inclusive)
  const resources = span.status === 'reused' && span.historicalResources ? span.historicalResources : spanResources(span)
  return known(resources[metric])
}

export function spanMetricMaximum(spans: TraceSpan[], metric: SpanMetric): number {
  return spans.reduce((maximum, span) => Math.max(maximum, spanMetricValue(span, metric) ?? 0), 0)
}

export function spanMetricPercent(value: number | null, maximum: number): number | null {
  if (value === null) return null
  return maximum > 0 ? Math.min(100, Math.max(0, value / maximum * 100)) : 0
}

export function spanMetricLabel(value: number | null, metric: SpanMetric): string {
  if (value === null) return 'Unknown'
  if (metric === 'time' || metric === 'cpuMs') return durationLabel(value)
  if (metric === 'tokens') return numberLabel(value, ' tokens')
  if (metric === 'costUsd') return `Est. $${value.toLocaleString(undefined, { maximumSignificantDigits: 6 })}`
  const [unit, divisor] = value >= 1073741824 ? ['GiB', 1073741824] as const
    : value >= 1048576 ? ['MiB', 1048576] as const : value >= 1024 ? ['KiB', 1024] as const : ['B', 1] as const
  return `${(value / divisor).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`
}
