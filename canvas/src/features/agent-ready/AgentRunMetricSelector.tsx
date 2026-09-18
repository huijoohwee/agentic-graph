import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { SPAN_METRICS, type SpanMetric } from './agentRunSpanMetric'

/** Uses the compact pressed-button treatment from the Skills & Commands selectors. */
export function AgentRunMetricSelector({ value, onChange }: { value: SpanMetric; onChange: (value: SpanMetric) => void }) {
  return <section role="group" aria-label="Span metric" data-agent-span-metric-selector=""
    className={`inline-flex h-6 shrink-0 items-center overflow-hidden rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.input.bg}`}>
    {SPAN_METRICS.map(option => <button key={option.key} type="button" aria-label={`Show ${option.label}`} aria-pressed={value === option.key}
      title={`Show ${option.label}`} data-span-metric-option={option.key} onClick={() => onChange(option.key)}
      className={`inline-flex h-full items-center justify-center border-0 px-2 text-[10px] font-semibold ${UI_THEME_TOKENS.text.secondary} ${value === option.key ? 'bg-black/10 dark:bg-white/15' : UI_THEME_TOKENS.button.hoverBg}`}>
      {option.label}
    </button>)}
  </section>
}
