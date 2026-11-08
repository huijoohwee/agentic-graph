import React from 'react'
import { ToggleButtonGroup, ToggleButton } from '@agentic-base/views-react/controls'
import { SPAN_METRICS, type SpanMetric } from './agentRunSpanMetric'

export function AgentRunMetricSelector({ value, onToggle }: { value: SpanMetric[]; onToggle: (value: SpanMetric) => void }) {
  return (
    <ToggleButtonGroup aria-label="Span metric" data-agent-span-metric-selector="">
      {SPAN_METRICS.map(option => {
        const pressed = value.includes(option.key)
        return (
          <ToggleButton key={option.key} pressed={pressed} aria-label={`Show ${option.label}`}
            title={`${pressed ? 'Hide' : 'Show'} ${option.label} column`}
            data-span-metric-option={option.key} onClick={() => onToggle(option.key)}>
            {option.label}
          </ToggleButton>
        )
      })}
    </ToggleButtonGroup>
  )
}
