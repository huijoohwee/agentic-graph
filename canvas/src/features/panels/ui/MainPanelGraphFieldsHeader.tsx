import React from 'react'
import { UI_COPY } from '@/lib/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import { KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME } from 'grph-shared/ui/keyTypeValueRows'
import { getChipClass, getIconSizeClass } from '@/lib/ui'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { MainPanelTypeIcon, type MainPanelTypeIconKey } from '@/features/panels/ui/mainPanelHelpIconLibrary'
import type { AgenticRagFieldKind } from '@/features/graph-fields/graphFields'

export type MainPanelGraphFieldsLegendEntry = Readonly<{
  kind: AgenticRagFieldKind
  label: string
}>

type MainPanelGraphFieldsHeaderProps = {
  agenticLegend: ReadonlyArray<MainPanelGraphFieldsLegendEntry> | null
}

const GRAPH_FIELDS_AGENTIC_LEGEND_ICON_KEY_BY_KIND: Record<AgenticRagFieldKind, MainPanelTypeIconKey> = {
  chunk_text: 'field.type.longText',
  embedding: 'field.type.number',
  media_url: 'field.type.url',
  graphRAGPath: 'field.origin.derived',
}

export default function MainPanelGraphFieldsHeader({
  agenticLegend,
}: MainPanelGraphFieldsHeaderProps) {
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const uiIconPillClass = useGraphStore(s => s.uiIconPillClass)
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME,
  )
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  )

  if (!agenticLegend || agenticLegend.length === 0) return null

  const iconSizeClass = getIconSizeClass(uiIconScale)

  return (
    <section
      className={[
        `mt-4 pt-3 border-t ${UI_THEME_TOKENS.panel.divider} mb-1 ${UI_THEME_TOKENS.text.tertiary} space-y-1`,
        uiPanelKeyValueTextSizeClass,
        uiPanelTextFontClass,
      ].join(' ')}
    >
      <section className="flex flex-wrap items-center gap-1">
        <span
          className={getChipClass('default', {
            textSizeClass: 'text-xs',
            textColorClass: UI_THEME_TOKENS.text.secondary,
            extraClassName: `font-medium ${UI_THEME_TOKENS.button.neutralSubtle} ${UI_THEME_TOKENS.input.border}`,
          })}
        >
          {UI_COPY.graphFieldsAgenticLegendChipLabel}
        </span>
        {agenticLegend.map(entry => (
          <span
            key={entry.kind}
            className={getChipClass('selected', {
              textSizeClass: 'text-xs',
              textColorClass: 'text-blue-700',
              extraClassName: `inline-flex max-w-full items-center gap-1 ${uiIconPillClass}`,
            })}
            title={entry.label}
          >
            <MainPanelTypeIcon
              iconKey={GRAPH_FIELDS_AGENTIC_LEGEND_ICON_KEY_BY_KIND[entry.kind]}
              className={iconSizeClass}
              strokeWidth={uiIconStrokeWidth}
            />
            <span className="min-w-0 truncate">{entry.label}</span>
          </span>
        ))}
      </section>
    </section>
  )
}
