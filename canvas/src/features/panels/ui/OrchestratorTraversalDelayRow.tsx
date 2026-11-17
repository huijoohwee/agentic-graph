import React from 'react'
import Tooltip from 'agentic-design-system/react/hover'
import { PanelKeyTypeSliderNumberRow } from '@/features/panels/ui/PanelKeyTypeSliderNumberRow'
import {
  ORCHESTRATOR_TRAVERSAL_DELAY_DEFAULT_MS,
  ORCHESTRATOR_TRAVERSAL_DELAY_MAX_MS,
  ORCHESTRATOR_TRAVERSAL_DELAY_MIN_MS,
  ORCHESTRATOR_TRAVERSAL_DELAY_TOOLTIP,
} from '@/features/panels/utils/orchestratorTraversal'
import { ORCHESTRATOR_TRAVERSAL_DELAY_ROW_TOOLTIP } from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

export function OrchestratorTraversalDelayRow(props: {
  traversalDelayMs: number
  onChangeTraversalDelayMs: (next: number) => void
  uiPanelKeyValueInputClass: string
  density?: 'compact' | 'default'
}) {
  const { traversalDelayMs, onChangeTraversalDelayMs, uiPanelKeyValueInputClass, density } = props
  return (
    <PanelKeyTypeSliderNumberRow
      density={density}
      uiPanelKeyValueInputClass={uiPanelKeyValueInputClass}
      min={ORCHESTRATOR_TRAVERSAL_DELAY_MIN_MS}
      max={ORCHESTRATOR_TRAVERSAL_DELAY_MAX_MS}
      step={50}
      value={Number(traversalDelayMs)}
      fallbackValue={ORCHESTRATOR_TRAVERSAL_DELAY_DEFAULT_MS}
      normalizeValue={raw =>
        Math.max(
          ORCHESTRATOR_TRAVERSAL_DELAY_MIN_MS,
          Math.min(
            ORCHESTRATOR_TRAVERSAL_DELAY_MAX_MS,
            Math.round(raw / 50) * 50,
          ),
        )
      }
      onChange={onChangeTraversalDelayMs}
      keyNode={(
        <Tooltip
          content={ORCHESTRATOR_TRAVERSAL_DELAY_ROW_TOOLTIP}
          maxWidthPx={260}
          contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
        >
          <section className="flex min-w-0 w-full items-center gap-1">
            <span className="break-words">orchestratorTraversalDelayMs</span>
          </section>
        </Tooltip>
      )}
      controlTooltip={ORCHESTRATOR_TRAVERSAL_DELAY_TOOLTIP}
    />
  )
}
