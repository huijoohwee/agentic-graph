import React from 'react'
import { Plus, Eraser } from 'lucide-react'
import {
  FilterCombobox,
  iconButtonClassName,
  secondaryButtonClassName,
  type FilterComboboxOption,
} from '@/features/graph-data-table/ui/GraphDataTableUiPrimitives'
import {
  type GraphDataTableColumnKey,
  type GraphDataTableFilterClause,
  type GraphDataTableFilterCondition,
  type GraphDataTableFilterMatch,
  type GraphDataTableFilterOperator,
} from '@/features/graph-data-table/graphDataTable'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui'
import { UI_COPY } from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_FOOTER_ROW_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_GROUP_FRAME_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_CHOICE_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_CONTROL_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_ROW_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SCROLL_STACK_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPLIT_ROW_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_STACK_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_VALUE_INPUT_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_WIDE_FLOATING_PANEL_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { usePanelTypography } from '@/lib/ui/panelTypography'

export interface FilterPanelProps {
  filterMatch: GraphDataTableFilterMatch
  setFilterMatch: (match: GraphDataTableFilterMatch) => void
  filterClauses: ReadonlyArray<GraphDataTableFilterClause>
  columnOptions: ReadonlyArray<FilterComboboxOption<GraphDataTableColumnKey>>
  filterOperatorOptions: ReadonlyArray<FilterComboboxOption<GraphDataTableFilterOperator>>
  columnLabelByKey: Map<GraphDataTableColumnKey, string>
  updateFilterCondition: (
    id: string,
    patch: Partial<Omit<GraphDataTableFilterCondition, 'id' | 'kind'>>,
  ) => void
  setFilterGroupMatch: (groupId: string, match: GraphDataTableFilterMatch) => void
  addFilterConditionToGroup: (groupId: string) => void
  removeFilterCondition: (id: string) => void
  addFilterCondition: () => void
  addFilterGroup: () => void
  clearAllFilters: () => void
}

export function FilterPanel({
  filterMatch,
  setFilterMatch,
  filterClauses,
  columnOptions,
  filterOperatorOptions,
  columnLabelByKey,
  updateFilterCondition,
  setFilterGroupMatch,
  addFilterConditionToGroup,
  removeFilterCondition,
  addFilterCondition,
  addFilterGroup,
  clearAllFilters,
}: FilterPanelProps) {
  const panelTypography = usePanelTypography()
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const matchComboboxClassName = `${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_CHOICE_CLASSNAME} whitespace-nowrap rounded-md transition-colors focus-visible:outline-none ${UI_THEME_TOKENS.focus.primaryRing} disabled:pointer-events-none disabled:opacity-50 border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} shadow-none ${UI_THEME_TOKENS.button.hoverBg} ${panelTypography.microLabelClass}`
  const filterComboboxClassName = `${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_CHOICE_CLASSNAME} whitespace-nowrap rounded-md border ${UI_THEME_TOKENS.panel.border} bg-transparent ${UI_THEME_TOKENS.input.hoverBorder} ${panelTypography.textSizeClass} shadow-none ${UI_THEME_TOKENS.input.placeholder} ${UI_THEME_TOKENS.focus.primaryBorderRing} disabled:cursor-not-allowed disabled:opacity-50`
  const filterOperatorComboboxClassName = `${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_CHOICE_CLASSNAME} whitespace-nowrap rounded-md transition-colors focus-visible:outline-none ${UI_THEME_TOKENS.focus.primaryRing} disabled:pointer-events-none disabled:opacity-50 border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} shadow-none ${UI_THEME_TOKENS.button.hoverBg} ${panelTypography.textSizeClass}`
  const filterValueInputClassName = `${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_VALUE_INPUT_CLASSNAME} rounded-md border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.input.text} ${panelTypography.textSizeClass} shadow-none transition-colors ${UI_THEME_TOKENS.input.placeholder} focus-visible:outline-none ${UI_THEME_TOKENS.focus.primaryRing}`
  const filterGroupPanelClassName = `${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_GROUP_FRAME_CLASSNAME} ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.headerBg}`

  const handleFilterOperatorChange = React.useCallback(
    (id: string, operator: GraphDataTableFilterOperator) => {
      updateFilterCondition(id, { operator })
    },
    [updateFilterCondition],
  )

  const handleFilterColumnChange = React.useCallback(
    (id: string, key: GraphDataTableColumnKey) => {
      updateFilterCondition(id, { key })
    },
    [updateFilterCondition],
  )

  const handleFilterValueChange = React.useCallback(
    (id: string, value: string) => {
      updateFilterCondition(id, { value })
    },
    [updateFilterCondition],
  )

  return (
    <section className={`z-50 border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary} shadow-[var(--kg-shadow-overlay)] outline-none flex ${UI_RESPONSIVE_GRAPH_DATA_TABLE_WIDE_FLOATING_PANEL_CLASSNAME} flex-col overflow-hidden rounded-lg p-4 relative ${panelTypography.panelTextClass}`}>
      <header className={`mb-2 ${panelTypography.microLabelClass}`}>
        <section>In this view, show records</section>
      </header>
      <section className={UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SCROLL_STACK_CLASSNAME}>
        {filterClauses.length === 0 ? (
          <section className={`${panelTypography.microLabelClass} ${UI_THEME_TOKENS.text.tertiary}`}>{UI_COPY.graphDataTableNoFilters}</section>
        ) : null}
        {filterClauses.map((clause, index) => {
          const prefix =
            index === 0 ? (
              <span className={`px-1 leading-9 ${panelTypography.microLabelClass}`}>where</span>
            ) : (
              <FilterCombobox
                value={filterMatch}
                options={[
                  { value: 'all', label: 'and' },
                  { value: 'any', label: 'or' },
                ]}
                onChange={value => setFilterMatch(value === 'any' ? 'any' : 'all')}
                className={matchComboboxClassName}
              />
            )
          if (clause.kind === 'condition') {
            const condition = clause
            const columnLabel = columnLabelByKey.get(condition.key) ?? condition.key
            const isValueDisabled =
              condition.operator === 'is_empty' || condition.operator === 'is_not_empty'
            return (
              <section key={condition.id} className={UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_ROW_CLASSNAME}>
                {prefix}
                <FilterCombobox
                  value={condition.key}
                  options={columnOptions}
                  onChange={value =>
                    handleFilterColumnChange(condition.id, value as GraphDataTableColumnKey)
                  }
                  className={filterComboboxClassName}
                />
                <FilterCombobox
                  value={condition.operator}
                  options={filterOperatorOptions}
                  onChange={value =>
                    handleFilterOperatorChange(condition.id, value as GraphDataTableFilterOperator)
                  }
                  className={filterOperatorComboboxClassName}
                />
                <input
                  className={`${filterValueInputClassName} ${
                    isValueDisabled ? 'opacity-50' : ''
                  }`}
                  placeholder={`Enter value for ${columnLabel.toLowerCase()}`}
                  value={condition.value}
                  onChange={event => handleFilterValueChange(condition.id, event.target.value)}
                  disabled={isValueDisabled}
                />
                <button
                  type="button"
                  className={iconButtonClassName}
                  onClick={() => removeFilterCondition(condition.id)}
                  title="Remove condition"
                >
                  <Eraser className={iconSizeClass} strokeWidth={uiIconStrokeWidth} />
                </button>
              </section>
            )
          }

          const group = clause
          return (
            <section key={group.id} className={filterGroupPanelClassName}>
              <section className={UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SPLIT_ROW_CLASSNAME}>
                <section className={`${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_ROW_CLASSNAME} ${panelTypography.textSizeClass}`}>
                  {prefix}
                  <FilterCombobox
                    value={group.match}
                    options={[
                      { value: 'all', label: 'all' },
                      { value: 'any', label: 'any' },
                    ]}
                    onChange={value => setFilterGroupMatch(group.id, value)}
                    className={filterComboboxClassName}
                  />
                  <span className={UI_THEME_TOKENS.text.tertiary}>of the following conditions:</span>
                </section>
                <button
                  type="button"
                  className={iconButtonClassName}
                  onClick={() => addFilterConditionToGroup(group.id)}
                >
                  <Plus className={iconSizeClass} strokeWidth={uiIconStrokeWidth} />
                </button>
              </section>
              <section className={UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_STACK_CLASSNAME}>
                {group.clauses.map(innerClause => {
                  if (innerClause.kind !== 'condition') return null
                  const condition = innerClause
                  const isValueDisabled =
                    condition.operator === 'is_empty' || condition.operator === 'is_not_empty'
                  const columnLabel = columnLabelByKey.get(condition.key) ?? condition.key
                  return (
                    <section key={condition.id} className={UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_ROW_CLASSNAME}>
                      <FilterCombobox
                        value={condition.key}
                        options={columnOptions}
                        onChange={value =>
                          handleFilterColumnChange(condition.id, value as GraphDataTableColumnKey)
                        }
                        className={filterComboboxClassName}
                      />
                      <FilterCombobox
                        value={condition.operator}
                        options={filterOperatorOptions}
                        onChange={value =>
                          handleFilterOperatorChange(
                            condition.id,
                            value as GraphDataTableFilterOperator,
                          )
                        }
                        className={filterOperatorComboboxClassName}
                      />
                      <input
                        className={`${filterValueInputClassName} ${
                          isValueDisabled ? 'opacity-50' : ''
                        }`}
                        placeholder={`Enter value for ${columnLabel.toLowerCase()}`}
                        value={condition.value}
                        onChange={event => handleFilterValueChange(condition.id, event.target.value)}
                        disabled={isValueDisabled}
                      />
                    <button
                      type="button"
                      className={iconButtonClassName}
                      onClick={() => removeFilterCondition(condition.id)}
                      title="Remove condition"
                    >
                      <Eraser className={iconSizeClass} strokeWidth={uiIconStrokeWidth} />
                    </button>
                    </section>
                  )
                })}
              </section>
            </section>
          )
        })}
      </section>
      <section className={UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_FOOTER_ROW_CLASSNAME}>
        <section className={UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_ROW_CLASSNAME}>
          <button
            type="button"
            className={secondaryButtonClassName}
            onClick={addFilterCondition}
          >
            <Plus className={iconSizeClass} strokeWidth={uiIconStrokeWidth} />
            Add condition
          </button>
          <button type="button" className={secondaryButtonClassName} onClick={addFilterGroup}>
            <Plus className={iconSizeClass} strokeWidth={uiIconStrokeWidth} />
            Add group
          </button>
        </section>
        <button
          type="button"
          className={`${secondaryButtonClassName} ${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_CONTROL_CLASSNAME}`}
          onClick={clearAllFilters}
        >
          <Eraser className={iconSizeClass} strokeWidth={uiIconStrokeWidth} />
          Clear all
        </button>
      </section>
    </section>
  )
}
