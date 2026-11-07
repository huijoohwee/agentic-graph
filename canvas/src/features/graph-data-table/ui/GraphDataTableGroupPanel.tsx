import { Eraser } from 'lucide-react'
import {
  GraphDataTableInlineCheckbox,
  secondaryButtonClassName,
} from '@/features/graph-data-table/ui/GraphDataTableUiPrimitives'
import { uiDataTableToggleActiveClassName } from '@/features/graph-data-table/ui/GraphDataTableToolbarStyles'
import { type GraphDataTableColumnKey } from '@/features/graph-data-table/graphDataTable'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_DIVIDER_STACK_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_HEADER_ROW_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_CHOICE_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_CONTROL_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_ROW_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPACIOUS_SCROLL_STACK_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_STACK_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPLIT_ROW_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_WRAP_ROW_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_NARROW_FLOATING_PANEL_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { usePanelTypography } from '@/lib/ui/panelTypography'

export interface GroupPanelProps {
  panelTitle: string
  groupKey: GraphDataTableColumnKey | ''
  setGroupKey: (key: GraphDataTableColumnKey | '') => void
  groupOptions: ReadonlyArray<{ value: GraphDataTableColumnKey; label: string }>
  includeMixedNumericFields: boolean
  setIncludeMixedNumericFields: (value: boolean) => void
  includeIdAsNumeric: boolean
  setIncludeIdAsNumeric: (value: boolean) => void
  includeSourceAsNumeric: boolean
  setIncludeSourceAsNumeric: (value: boolean) => void
  includeTargetAsNumeric: boolean
  setIncludeTargetAsNumeric: (value: boolean) => void
  aggregatePanelColumnKeys: GraphDataTableColumnKey[]
  aggregateKeys: GraphDataTableColumnKey[]
  setAggregateKeys: (keys: GraphDataTableColumnKey[]) => void
  columnLabelByKey: Map<GraphDataTableColumnKey, string>
  onClose: () => void
}

export function GroupPanel({
  panelTitle,
  groupKey,
  setGroupKey,
  groupOptions,
  includeMixedNumericFields,
  setIncludeMixedNumericFields,
  includeIdAsNumeric,
  setIncludeIdAsNumeric,
  includeSourceAsNumeric,
  setIncludeSourceAsNumeric,
  includeTargetAsNumeric,
  setIncludeTargetAsNumeric,
  aggregatePanelColumnKeys,
  aggregateKeys,
  setAggregateKeys,
  columnLabelByKey,
  onClose,
}: GroupPanelProps) {
  const panelTypography = usePanelTypography()
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const selectionControlClassName = `${UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME} rounded ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.selectionControl}`
  const panelChoiceBaseClassName = `${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_CHOICE_CLASSNAME} rounded-md border shadow-none transition-colors focus-visible:outline-none ${UI_THEME_TOKENS.focus.primaryRing} ${panelTypography.textSizeClass}`
  const panelChoiceInactiveClassName = `${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.button.text}`

  return (
    <section
      className={`z-50 border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary} shadow-[var(--kg-shadow-overlay)] outline-none flex ${UI_RESPONSIVE_GRAPH_DATA_TABLE_NARROW_FLOATING_PANEL_CLASSNAME} flex-col overflow-hidden rounded-lg p-4 relative ${panelTypography.panelTextClass}`}
      aria-label="Group Panel"
    >
      <section className={`${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_HEADER_ROW_CLASSNAME} ${panelTypography.textSizeClass}`}>
        <section className="font-medium">{panelTitle}</section>
        <button type="button" className={secondaryButtonClassName} onClick={onClose}>
          {UI_LABELS.close}
        </button>
      </section>
      <section className={UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPACIOUS_SCROLL_STACK_CLASSNAME}>
        <section className={`${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPLIT_ROW_CLASSNAME} ${panelTypography.textSizeClass}`}>
          <section className={UI_THEME_TOKENS.text.secondary}>{UI_COPY.graphDataTableGroupRowsByLabel}</section>
          <button
            type="button"
            className={`${secondaryButtonClassName} ${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_CONTROL_CLASSNAME}`}
            onClick={() => setGroupKey('')}
            aria-label={UI_COPY.graphDataTableClearGroupingAriaLabel}
          >
            <Eraser className={iconSizeClass} strokeWidth={uiIconStrokeWidth} />
            {UI_LABELS.clear}
          </button>
        </section>
        <section className={UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_STACK_CLASSNAME}>
          <button
            type="button"
            className={`${panelChoiceBaseClassName} ${
              groupKey === '' ? uiDataTableToggleActiveClassName : panelChoiceInactiveClassName
            }`}
            onClick={() => setGroupKey('')}
          >
            <span className="truncate">{UI_COPY.graphDataTableNoGroupingLabel}</span>
          </button>
          {groupOptions.map(option => (
            <button
              key={option.value}
              type="button"
              className={`${panelChoiceBaseClassName} ${
                groupKey === option.value ? uiDataTableToggleActiveClassName : panelChoiceInactiveClassName
              }`}
              onClick={() => setGroupKey(option.value)}
            >
              <span className="truncate">
                {option.label}
              </span>
            </button>
          ))}
        </section>
        <section className={`${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_DIVIDER_STACK_CLASSNAME} ${UI_THEME_TOKENS.panel.divider}`}>
          <section className={UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPLIT_ROW_CLASSNAME}>
            <section className={`${panelTypography.textSizeClass} ${UI_THEME_TOKENS.text.secondary}`}>{UI_COPY.graphDataTableAggregateNumericFieldsLabel}</section>
            <section className={UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_ROW_CLASSNAME}>
              <GraphDataTableInlineCheckbox
                checked={includeMixedNumericFields}
                onChange={setIncludeMixedNumericFields}
                label="Include mixed"
                className={`${panelTypography.textSizeClass} ${UI_THEME_TOKENS.text.secondary}`}
                checkboxClassName={selectionControlClassName}
              />
              <GraphDataTableInlineCheckbox
                checked={includeIdAsNumeric}
                onChange={setIncludeIdAsNumeric}
                label="Treat ID as numeric"
                className={`${panelTypography.textSizeClass} ${UI_THEME_TOKENS.text.secondary}`}
                checkboxClassName={selectionControlClassName}
              />
              <GraphDataTableInlineCheckbox
                checked={includeSourceAsNumeric}
                onChange={setIncludeSourceAsNumeric}
                label="Treat Source as numeric"
                className={`${panelTypography.textSizeClass} ${UI_THEME_TOKENS.text.secondary}`}
                checkboxClassName={selectionControlClassName}
              />
              <GraphDataTableInlineCheckbox
                checked={includeTargetAsNumeric}
                onChange={setIncludeTargetAsNumeric}
                label="Treat Target as numeric"
                className={`${panelTypography.textSizeClass} ${UI_THEME_TOKENS.text.secondary}`}
                checkboxClassName={selectionControlClassName}
              />
            </section>
          </section>
          <section className={UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_WRAP_ROW_CLASSNAME}>
            {aggregatePanelColumnKeys.map(key => {
              const isActive = aggregateKeys.includes(key)
              const label = columnLabelByKey.get(key) ?? key
              return (
                <button
                  key={key}
                  type="button"
                  className={`${panelChoiceBaseClassName} ${
                    isActive ? uiDataTableToggleActiveClassName : panelChoiceInactiveClassName
                  }`}
                  onClick={() => {
                    if (isActive) {
                      setAggregateKeys(aggregateKeys.filter(k => k !== key))
                    } else {
                      setAggregateKeys([...aggregateKeys, key])
                    }
                  }}
                >
                  <span className="truncate">{label}</span>
                </button>
              )
            })}
          </section>
        </section>
      </section>
    </section>
  )
}
