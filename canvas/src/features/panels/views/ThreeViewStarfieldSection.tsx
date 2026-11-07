import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { PanelKeyTypeColorTextValueRow } from '@/features/panels/ui/PanelKeyTypeColorTextValueRow'
import { PanelKeyTypeCheckboxValueRow } from '@/features/panels/ui/PanelKeyTypeCheckboxValueRow'
import { PanelKeyTypeRangeValueRow } from '@/features/panels/ui/PanelKeyTypeRangeValueRow'
import Tooltip from '@/features/panels/ui/Tooltip'
import type { GraphSchema } from '@/lib/graph/schema'
import {
  STAR_COUNT_TOOLTIP,
  STARFIELD_RADIUS_TOOLTIP,
  STARFIELD_BRIGHTNESS_TOOLTIP,
} from '@/features/panels/views/ThreeViewTuningTooltips'
import { ThreeViewFieldSection } from '@/features/panels/views/threeViewResponsiveClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

interface ThreeViewStarfieldSectionProps {
  schema: GraphSchema
  setThreeConfig: (config: Partial<GraphSchema['three']>) => void
  collapsed: boolean
  onToggle?: (next: boolean) => void
  uiPanelKeyValueInputClass: string
}

export default function ThreeViewStarfieldSection({
  schema,
  setThreeConfig,
  collapsed,
  onToggle,
  uiPanelKeyValueInputClass,
}: ThreeViewStarfieldSectionProps) {
  const keyLabelClassName = UI_THEME_TOKENS.text.secondary
  const valueTextClassName = UI_THEME_TOKENS.text.tertiary
  const selectionControlClassName = `${UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME} rounded ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.selectionControl}`
  return (
    <CollapsibleSection
      title="Starfield"
      collapsed={collapsed}
      onToggle={onToggle}
      headerClassName="px-0"
      stickyOffsetClassName="top-6"
    >
      <ThreeViewFieldSection>
        <PanelKeyTypeCheckboxValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Starfield</span>}
          checked={Boolean(schema.three?.starfieldEnabled ?? false)}
          onChange={next => setThreeConfig({ starfieldEnabled: next })}
          checkboxClassName={selectionControlClassName}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Star Count</span>}
          min={0}
          max={4000}
          step={100}
          value={Number(schema.three?.starfieldCount ?? 0)}
          onChange={next => setThreeConfig({ starfieldCount: next })}
          valueNode={(
            <Tooltip content={STAR_COUNT_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>
                {String(schema.three?.starfieldCount ?? 0)}
              </span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Starfield Radius</span>}
          min={60}
          max={800}
          step={10}
          value={Number(
            schema.three?.starfieldRadius ??
              schema.three?.sphereRadius ??
              650,
          )}
          onChange={next => setThreeConfig({ starfieldRadius: next })}
          valueNode={(
            <Tooltip content={STARFIELD_RADIUS_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>
                {String(
                  schema.three?.starfieldRadius ??
                    schema.three?.sphereRadius ??
                    650,
                )}
              </span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Starfield Brightness</span>}
          min={0}
          max={1}
          step={0.05}
          value={Number(schema.three?.starfieldOpacity ?? 0.9)}
          onChange={next => setThreeConfig({ starfieldOpacity: next })}
          valueNode={(
            <Tooltip content={STARFIELD_BRIGHTNESS_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>
                {String(schema.three?.starfieldOpacity ?? 0.9)}
              </span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeColorTextValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Starfield Color</span>}
          value={String(schema.three?.starfieldColor ?? '')}
          onChange={next => setThreeConfig({ starfieldColor: next })}
          textInputClassName={uiPanelKeyValueInputClass}
          placeholder="#facc15"
        />
      </ThreeViewFieldSection>
    </CollapsibleSection>
  )
}
