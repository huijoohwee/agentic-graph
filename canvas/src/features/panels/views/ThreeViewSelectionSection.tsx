import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { PanelKeyTypeRangeValueRow } from '@/features/panels/ui/PanelKeyTypeRangeValueRow'
import Tooltip from '@/features/panels/ui/Tooltip'
import type { GraphSchema } from '@/lib/graph/schema'
import {
  SELECTED_NODE_GLOW_TOOLTIP,
  DIMMED_NODE_OPACITY_TOOLTIP,
  DIMMED_EDGE_OPACITY_TOOLTIP,
} from '@/features/panels/views/ThreeViewTuningTooltips'
import { ThreeViewFieldSection } from '@/features/panels/views/threeViewResponsiveClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

interface ThreeViewSelectionSectionProps {
  schema: GraphSchema
  setThreeConfig: (config: Partial<GraphSchema['three']>) => void
  collapsed: boolean
  onToggle?: (next: boolean) => void
}

export default function ThreeViewSelectionSection({
  schema,
  setThreeConfig,
  collapsed,
  onToggle,
}: ThreeViewSelectionSectionProps) {
  const keyLabelClassName = UI_THEME_TOKENS.text.secondary
  const valueTextClassName = UI_THEME_TOKENS.text.tertiary

  return (
    <CollapsibleSection
      title="Selection highlighting"
      collapsed={collapsed}
      onToggle={onToggle}
      headerClassName="px-0"
      stickyOffsetClassName="top-6"
    >
      <ThreeViewFieldSection>
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Selected Node Glow</span>}
          min={0}
          max={3}
          step={0.1}
          value={Number(schema.three?.selection?.selectedNodeGlowIntensity ?? 0.8)}
          onChange={next =>
            setThreeConfig({
              selection: { selectedNodeGlowIntensity: next },
            })
          }
          valueNode={(
            <Tooltip content={SELECTED_NODE_GLOW_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>
                {String(schema.three?.selection?.selectedNodeGlowIntensity ?? 0.8)}
              </span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Dimmed Node Opacity</span>}
          min={0}
          max={1}
          step={0.05}
          value={Number(schema.three?.selection?.dimmedNodeOpacity ?? 0.2)}
          onChange={next =>
            setThreeConfig({
              selection: { dimmedNodeOpacity: next },
            })
          }
          valueNode={(
            <Tooltip content={DIMMED_NODE_OPACITY_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>
                {String(schema.three?.selection?.dimmedNodeOpacity ?? 0.2)}
              </span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Dimmed Edge Opacity</span>}
          min={0}
          max={1}
          step={0.05}
          value={Number(schema.three?.selection?.dimmedEdgeOpacity ?? 0.2)}
          onChange={next =>
            setThreeConfig({
              selection: { dimmedEdgeOpacity: next },
            })
          }
          valueNode={(
            <Tooltip content={DIMMED_EDGE_OPACITY_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>
                {String(schema.three?.selection?.dimmedEdgeOpacity ?? 0.2)}
              </span>
            </Tooltip>
          )}
        />
      </ThreeViewFieldSection>
    </CollapsibleSection>
  )
}
