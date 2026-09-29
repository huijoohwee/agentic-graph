import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { SPAN_METRICS, type SpanMetric } from './agentRunSpanMetric'

/** Uses the compact pressed-button treatment from the Skills & Commands selectors. */
export function AgentRunMetricSelector({ value, onToggle }: { value: SpanMetric[]; onToggle: (value: SpanMetric) => void }) {
  return <section role="group" aria-label="Span metric" data-agent-span-metric-selector=""
    className={`inline-flex ${UI_THEME_TOKENS.control.height} min-w-0 max-w-full items-center overflow-hidden rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.input.bg}`}>
    {SPAN_METRICS.map(option => <button key={option.key} type="button" aria-label={`Show ${option.label}`} aria-pressed={value.includes(option.key)}
      title={`${value.includes(option.key) ? 'Hide' : 'Show'} ${option.label} column`} data-span-metric-option={option.key} onClick={() => onToggle(option.key)}
      className={`inline-flex h-full min-w-0 items-center justify-center border-0 px-2 text-xs font-medium ${UI_THEME_TOKENS.text.secondary} ${value.includes(option.key) ? 'bg-black/10 dark:bg-white/15' : UI_THEME_TOKENS.button.hoverBg}`}>
      <span className="min-w-0 truncate">{option.label}</span>
    </button>)}
  </section>
}
