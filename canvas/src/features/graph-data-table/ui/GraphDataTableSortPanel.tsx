import { Plus, Eraser } from 'lucide-react'
import {
  FilterCombobox,
  GraphDataTableInlineCheckbox,
  iconButtonClassName,
  secondaryButtonClassName,
  type FilterComboboxOption,
} from '@/features/graph-data-table/ui/GraphDataTableUiPrimitives'
import {
  type GraphDataTableColumnKey,
  type GraphDataTableSortDir,
  type GraphDataTableSortRule,
} from '@/features/graph-data-table/graphDataTable'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_FOOTER_ROW_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_HEADER_ROW_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_CHOICE_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_ROW_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SCROLL_STACK_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPLIT_ROW_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_WIDE_FLOATING_PANEL_CLASSNAME,
  UI_RESPONSIVE_SMALL_SELECTION_CONTROL_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { usePanelTypography } from '@/lib/ui/panelTypography'

export interface SortPanelProps {
  panelTitle: string
  isAutoSortEnabled: boolean
  setIsAutoSortEnabled: (enabled: boolean) => void
  sortRules: ReadonlyArray<GraphDataTableSortRule>
  columnOptions: ReadonlyArray<FilterComboboxOption<GraphDataTableColumnKey>>
  sortDirOptions: ReadonlyArray<FilterComboboxOption<GraphDataTableSortDir>>
  updateSortRule: (id: string, patch: Partial<Omit<GraphDataTableSortRule, 'id'>>) => void
  removeSortRule: (id: string) => void
  addSortRule: () => void
  resetSortRules: () => void
  onClose: () => void
}

export function SortPanel({
  panelTitle,
  isAutoSortEnabled,
  setIsAutoSortEnabled,
  sortRules,
  columnOptions,
  sortDirOptions,
  updateSortRule,
  removeSortRule,
  addSortRule,
  resetSortRules,
  onClose,
}: SortPanelProps) {
  const panelTypography = usePanelTypography()
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const sortKeyComboboxClassName = `${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_CHOICE_CLASSNAME} whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none ${UI_THEME_TOKENS.focus.primaryRing} disabled:pointer-events-none disabled:opacity-50 border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} shadow-none ${UI_THEME_TOKENS.button.hoverBg} ${panelTypography.textSizeClass}`
  const sortValueComboboxClassName = `${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_CHOICE_CLASSNAME} whitespace-nowrap rounded-md border ${UI_THEME_TOKENS.panel.border} bg-transparent ${UI_THEME_TOKENS.input.hoverBorder} ${panelTypography.textSizeClass} shadow-none ${UI_THEME_TOKENS.input.placeholder} ${UI_THEME_TOKENS.focus.primaryBorderRing} disabled:cursor-not-allowed disabled:opacity-50`
  const selectionControlClassName = `${UI_RESPONSIVE_SMALL_SELECTION_CONTROL_CLASSNAME} rounded ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.selectionControl}`

  return (
    <section className={`z-50 border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary} shadow-[var(--kg-shadow-overlay)] outline-none flex ${UI_RESPONSIVE_GRAPH_DATA_TABLE_WIDE_FLOATING_PANEL_CLASSNAME} flex-col overflow-hidden rounded-lg p-4 relative ${panelTypography.panelTextClass}`}>
      <header className={`${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_HEADER_ROW_CLASSNAME} ${panelTypography.textSizeClass}`}>
        <section className="font-medium">{panelTitle}</section>
        <button type="button" className={secondaryButtonClassName} onClick={onClose}>
          {UI_LABELS.close}
        </button>
      </header>
      <section className={`${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPLIT_ROW_CLASSNAME} ${panelTypography.textSizeClass}`}>
        <section className={UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_ROW_CLASSNAME}>
          <GraphDataTableInlineCheckbox
            checked={isAutoSortEnabled}
            onChange={setIsAutoSortEnabled}
            label={UI_COPY.graphDataTableAutoSortWhileEditingLabel}
            className={UI_THEME_TOKENS.text.secondary}
            checkboxClassName={selectionControlClassName}
            labelClassName="select-none"
          />
        </section>
        <button type="button" className={secondaryButtonClassName} onClick={resetSortRules}>
          {UI_LABELS.reset}
        </button>
      </section>
      <section className={UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SCROLL_STACK_CLASSNAME}>
        {sortRules.length === 0 ? (
          <section className={`${panelTypography.microLabelClass} ${UI_THEME_TOKENS.text.tertiary}`}>{UI_COPY.graphDataTableSortingByIdFallbackLabel}</section>
        ) : (
          sortRules.map(rule => (
            <section key={rule.id} className={UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_ROW_CLASSNAME}>
              <FilterCombobox
                value={rule.key}
                options={columnOptions}
                onChange={value =>
                  updateSortRule(rule.id, { key: value as GraphDataTableColumnKey })
                }
                className={sortKeyComboboxClassName}
              />
              <FilterCombobox
                value={rule.dir}
                options={sortDirOptions}
                onChange={value =>
                  updateSortRule(rule.id, { dir: value as GraphDataTableSortDir })
                }
                className={sortValueComboboxClassName}
              />
              <button
                type="button"
                className={iconButtonClassName}
                onClick={() => removeSortRule(rule.id)}
                title={UI_COPY.graphDataTableRemoveSortRuleTitle}
              >
                <Eraser className={iconSizeClass} strokeWidth={uiIconStrokeWidth} />
              </button>
            </section>
          ))
        )}
      </section>
      <section className={UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_FOOTER_ROW_CLASSNAME}>
        <button type="button" className={secondaryButtonClassName} onClick={addSortRule}>
          <Plus className={iconSizeClass} strokeWidth={uiIconStrokeWidth} />
          {UI_COPY.graphDataTableAddSortLabel}
        </button>
      </section>
    </section>
  )
}
