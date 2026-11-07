import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { PanelKeyTypeColorTextValueRow } from '@/features/panels/ui/PanelKeyTypeColorTextValueRow'
import { PanelKeyTypeRangeValueRow } from '@/features/panels/ui/PanelKeyTypeRangeValueRow'
import Tooltip from '@/features/panels/ui/Tooltip'
import type { GraphSchema } from '@/lib/graph/schema'
import { FOG_NEAR_TOOLTIP, FOG_FAR_TOOLTIP } from '@/features/panels/views/ThreeViewTuningTooltips'
import { ThreeViewFieldSection } from '@/features/panels/views/threeViewResponsiveClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

interface ThreeViewBackgroundFogSectionProps {
  schema: GraphSchema
  setThreeConfig: (config: Partial<GraphSchema['three']>) => void
  collapsed: boolean
  onToggle?: (next: boolean) => void
  uiPanelKeyValueInputClass: string
}

export default function ThreeViewBackgroundFogSection({
  schema,
  setThreeConfig,
  collapsed,
  onToggle,
  uiPanelKeyValueInputClass,
}: ThreeViewBackgroundFogSectionProps) {
  const keyLabelClassName = UI_THEME_TOKENS.text.secondary
  const valueTextClassName = UI_THEME_TOKENS.text.tertiary
  return (
    <CollapsibleSection
      title="Background and fog"
      collapsed={collapsed}
      onToggle={onToggle}
      headerClassName="px-0"
      stickyOffsetClassName="top-6"
    >
      <ThreeViewFieldSection>
        <PanelKeyTypeColorTextValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Background Color</span>}
          value={String(schema.three?.backgroundColor ?? '')}
          onChange={next => setThreeConfig({ backgroundColor: next })}
          textInputClassName={uiPanelKeyValueInputClass}
          placeholder="#020617"
        />
        <PanelKeyTypeColorTextValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Fog Color (blank = off)</span>}
          value={String(schema.three?.fogColor ?? '')}
          onChange={next => setThreeConfig({ fogColor: next })}
          textInputClassName={uiPanelKeyValueInputClass}
          placeholder="#1e1b4b"
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Fog Near</span>}
          min={50}
          max={400}
          step={5}
          value={Number(schema.three?.fogNear ?? 180)}
          onChange={next => setThreeConfig({ fogNear: next })}
          valueNode={(
            <Tooltip
              content={FOG_NEAR_TOOLTIP}
              maxWidthPx={260}
            >
              <span className={valueTextClassName}>
                {String(schema.three?.fogNear ?? 180)}
              </span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Fog Far</span>}
          min={80}
          max={600}
          step={5}
          value={Number(schema.three?.fogFar ?? 360)}
          onChange={next => setThreeConfig({ fogFar: next })}
          valueNode={(
            <Tooltip
              content={FOG_FAR_TOOLTIP}
              maxWidthPx={260}
            >
              <span className={valueTextClassName}>
                {String(schema.three?.fogFar ?? 360)}
              </span>
            </Tooltip>
          )}
        />
      </ThreeViewFieldSection>
    </CollapsibleSection>
  )
}
