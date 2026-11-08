import React from 'react'
import { CheckboxGroup, CheckboxOption } from '@/lib/ui/CheckboxGroup'
import { SPAN_METRICS, type SpanMetric } from './agentRunSpanMetric'

export function AgentRunMetricSelector({ value, onToggle }: { value: SpanMetric[]; onToggle: (value: SpanMetric) => void }) {
  return (
    <CheckboxGroup aria-label="Span metric" data-agent-span-metric-selector="">
      {SPAN_METRICS.map(option => {
        const checked = value.includes(option.key)
        return <CheckboxOption key={option.key} label={option.label}
          aria-label={`Show ${option.label}`} title={`${checked ? 'Hide' : 'Show'} ${option.label} column`}
          data-span-metric-option={option.key} checked={checked} onChange={() => onToggle(option.key)} />
      })}
    </CheckboxGroup>
  )
}
