import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import IconButton from '@/components/IconButton'
import { CollapsibleToolbar } from '@/components/ui/CollapsibleToolbar'
import { DetailsMenu } from '@/components/ui/DetailsMenu'
import {
  ArrowUpDown,
  Columns2,
  Filter,
  PanelRightClose,
  PanelRightOpen,
  Ruler,
  SidebarClose,
  SidebarOpen,
} from 'lucide-react'
import {
  makeGraphDataTableRuleId,
  type GraphDataTableColumnVisibilityById,
  type GraphDataTableColumnWidthsPxById,
  type GraphDataTableFilterClause,
  type GraphDataTableFilterMatch,
  type GraphDataTableFilterOperator,
  type GraphDataTableRowHeightPreset,
  type GraphDataTableSortRule,
  type GraphDataTableSortDirection,
} from './graphDataTableViewState'
import type { PanelTypography } from '@/lib/ui/panelTypography'
import { DATA_VIEW_ROW_HEIGHT_OPTIONS, readDataViewRowHeightLabel } from '@/lib/ui/dataViewDensity'
import { PanelField, PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import {
  UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME,
  UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
  UI_RESPONSIVE_TOOLBAR_FIELD_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { uiToolbarRowScrollClassName, uiToolbarRowScrollJustifyEndClassName } from '@/features/toolbar/ui/toolbarStyles'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'

export type GraphDataTableToolbarProps = {
  columns: { columnId: string; name: string }[]
  inspectorOpen: boolean
  setInspectorOpen: (next: boolean) => void

  canvasPreviewAvailable?: boolean
  canvasPreviewCollapsed?: boolean
  setCanvasPreviewCollapsed?: (next: boolean) => void

  panelTypography?: PanelTypography

  columnVisibilityById: GraphDataTableColumnVisibilityById
  setColumnVisibilityById: (next: GraphDataTableColumnVisibilityById) => void

  filterMatch: GraphDataTableFilterMatch
  setFilterMatch: (next: GraphDataTableFilterMatch) => void
  filterClauses: GraphDataTableFilterClause[]
  setFilterClauses: (next: GraphDataTableFilterClause[]) => void

  groupBy: string
  setGroupBy: (next: string) => void

  sortRules: GraphDataTableSortRule[]
  setSortRules: (next: GraphDataTableSortRule[]) => void

  rowHeightPreset: GraphDataTableRowHeightPreset
  setRowHeightPreset: (next: GraphDataTableRowHeightPreset) => void

  columnWidthsPxById: GraphDataTableColumnWidthsPxById
  resetColumnWidths: () => void
}

export function GraphDataTableToolbar(props: GraphDataTableToolbarProps) {
  const iconButtonClass = `${UI_THEME_TOKENS.button.square} kg-toolbar-btn shrink-0`
  const iconSummaryClass = `list-none ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg} kg-toolbar-btn ${UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME} justify-center rounded cursor-pointer select-none`
  const microLabelClass = props.panelTypography?.microLabelClass || ''
  const toolbarFieldClass = UI_RESPONSIVE_TOOLBAR_FIELD_CLASSNAME
  const menuRowClass = `kg-graph-data-table-menu-row ${uiToolbarRowScrollClassName} gap-2`
  const menuFieldClass = 'kg-graph-data-table-menu-field min-w-0 max-w-full'
  const menuFieldLabelClass = UI_TEXT_TRUNCATE
  const toggleColumn = (columnId: string) => {
    const next = { ...props.columnVisibilityById }
    const current = props.columnVisibilityById[columnId]
    next[columnId] = current === false
    props.setColumnVisibilityById(next)
  }

  const addFilterClause = () => {
    const first = props.columns[0]?.columnId || 'id'
    const next: GraphDataTableFilterClause[] = [
      ...props.filterClauses,
      { id: makeGraphDataTableRuleId(), columnId: first, operator: 'contains', value: '' },
    ]
    props.setFilterClauses(next)
  }

  const updateFilterClause = (id: string, patch: Partial<Pick<GraphDataTableFilterClause, 'columnId' | 'operator' | 'value'>>) => {
    props.setFilterClauses(props.filterClauses.map(c => (c.id === id ? { ...c, ...patch } : c)))
  }

  const removeFilterClause = (id: string) => {
    props.setFilterClauses(props.filterClauses.filter(c => c.id !== id))
  }

  const addSortRule = () => {
    const first = props.columns[0]?.columnId || 'id'
    const next: GraphDataTableSortRule[] = [...props.sortRules, { id: makeGraphDataTableRuleId(), columnId: first, direction: 'asc' }]
    props.setSortRules(next)
  }

  const updateSortRule = (id: string, patch: Partial<Pick<GraphDataTableSortRule, 'columnId' | 'direction'>>) => {
    props.setSortRules(props.sortRules.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  const removeSortRule = (id: string) => {
    props.setSortRules(props.sortRules.filter(r => r.id !== id))
  }

  const hasCustomWidths = Object.keys(props.columnWidthsPxById || {}).length > 0

  return (
    <CollapsibleToolbar ariaLabel={MARKDOWN_DATA_VIEW_COPY.toolbarAriaLabel} className={`kg-graph-data-table-toolbar kg-toolbar ${uiToolbarRowScrollJustifyEndClassName} gap-1.5 ${microLabelClass}`}>
      <IconButton
        title={props.inspectorOpen ? 'Hide Inspector' : 'Show Inspector'}
        showTooltip={false}
        onClick={() => props.setInspectorOpen(!props.inspectorOpen)}
        className={iconButtonClass}
      >
        {props.inspectorOpen ? <SidebarClose className="w-4 h-4" aria-hidden="true" /> : <SidebarOpen className="w-4 h-4" aria-hidden="true" />}
      </IconButton>

      {props.canvasPreviewAvailable && props.setCanvasPreviewCollapsed ? (
        <IconButton
          title={props.canvasPreviewCollapsed ? 'Show Canvas Preview' : 'Hide Canvas Preview'}
          showTooltip={false}
          onClick={() => props.setCanvasPreviewCollapsed?.(!props.canvasPreviewCollapsed)}
          className={iconButtonClass}
        >
          {props.canvasPreviewCollapsed ? (
            <PanelRightOpen className="w-4 h-4" aria-hidden="true" />
          ) : (
            <PanelRightClose className="w-4 h-4" aria-hidden="true" />
          )}
        </IconButton>
      ) : null}

      <DetailsMenu
        ariaLabel="Fields"
        detailsClassName="relative"
        summaryClassName={iconSummaryClass}
        portal
        portalPlacement="bottom-end"
        summary={<Columns2 className="w-4 h-4" aria-hidden="true" />}
        menu={({ close }) => (
          <form className={['kg-graph-data-table-menu-form kg-graph-data-table-menu-form--narrow rounded border p-2 shadow-[var(--kg-shadow-overlay)]', UI_THEME_TOKENS.panel.bg, UI_THEME_TOKENS.panel.border].join(' ')}>
            <fieldset className="space-y-1">
              <legend className={`${UI_THEME_TOKENS.text.tertiary}`}>Visible columns</legend>
              {props.columns.map(c => (
                <label key={c.columnId} className={`${UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME} gap-2`}>
                  <input
                    className="shrink-0"
                    type="checkbox"
                    checked={props.columnVisibilityById[c.columnId] !== false}
                    onChange={() => {
                      toggleColumn(c.columnId)
                    }}
                  />
                  <span className={UI_TEXT_TRUNCATE}>{c.name}</span>
                </label>
              ))}
            </fieldset>
          </form>
        )}
      />

      <DetailsMenu
        ariaLabel="Filter"
        detailsClassName="relative"
        summaryClassName={iconSummaryClass}
        portal
        portalPlacement="bottom-end"
        summary={<Filter className="w-4 h-4" aria-hidden="true" />}
        menu={
          <form className={['kg-graph-data-table-menu-form rounded border p-2 shadow-[var(--kg-shadow-overlay)]', UI_THEME_TOKENS.panel.bg, UI_THEME_TOKENS.panel.border].join(' ')}>
            <fieldset className="space-y-2">
              <section className={menuRowClass}>
                <PanelField label="Match" variant="section" layout="compact" className="min-w-0 flex-1" labelClassName={menuFieldLabelClass}>
                  <PanelSelect
                    variant="transparent"
                    value={props.filterMatch}
                    onValueChange={selectedValueInput => props.setFilterMatch(selectedValueInput === 'any' ? 'any' : 'all')}
                    className={toolbarFieldClass}
                  >
                    <option value="all">All</option>
                    <option value="any">Any</option>
                  </PanelSelect>
                </PanelField>
              </section>
              {props.filterClauses.map(clause => (
                <section key={clause.id} className={menuRowClass}>
                  <PanelField label="Field" variant="section" layout="compact" className={menuFieldClass} labelClassName={menuFieldLabelClass}>
                    <PanelSelect
                      variant="transparent"
                      value={clause.columnId}
                      onValueChange={selectedValueInput => updateFilterClause(clause.id, { columnId: selectedValueInput })}
                      className={toolbarFieldClass}
                    >
                      {props.columns.map(c => (
                        <option key={c.columnId} value={c.columnId}>
                          {c.name}
                        </option>
                      ))}
                    </PanelSelect>
                  </PanelField>
                  <PanelField label="Op" variant="section" layout="compact" className={menuFieldClass} labelClassName={menuFieldLabelClass}>
                    <PanelSelect
                      variant="transparent"
                      value={clause.operator}
                      onValueChange={selectedValueInput => updateFilterClause(clause.id, { operator: selectedValueInput as GraphDataTableFilterOperator })}
                      className={toolbarFieldClass}
                    >
                      <option value="contains">contains</option>
                      <option value="equals">equals</option>
                      <option value="startsWith">startsWith</option>
                      <option value="endsWith">endsWith</option>
                    </PanelSelect>
                  </PanelField>
                  <PanelField label="Value" variant="section" layout="compact" className={menuFieldClass} labelClassName={menuFieldLabelClass}>
                    <PanelTextInput
                      variant="transparent"
                      value={clause.value}
                      onChange={e => updateFilterClause(clause.id, { value: e.target.value })}
                      className={toolbarFieldClass}
                    />
                  </PanelField>
                  <button
                    type="button"
                    className={`App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
                    onClick={() => removeFilterClause(clause.id)}
                  >
                    Remove
                  </button>
                </section>
              ))}
              <section className={menuRowClass}>
                <button
                  type="button"
                  className={`App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
                  onClick={addFilterClause}
                >
                  Add filter
                </button>
                <button
                  type="button"
                  className={`App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
                  onClick={() => props.setFilterClauses([])}
                >
                  Clear all
                </button>
              </section>
            </fieldset>
          </form>
        }
      />

      <PanelField
        label="Group"
        variant="section"
        layout="compact"
        className={`${UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME} gap-2`}
        labelClassName={UI_TEXT_TRUNCATE}
      >
        <PanelSelect
          value={props.groupBy}
          onValueChange={selectedValueInput => props.setGroupBy(selectedValueInput)}
          className={toolbarFieldClass}
        >
          <option value="">None</option>
          {props.columns.map(c => (
            <option key={c.columnId} value={c.columnId}>
              {c.name}
            </option>
          ))}
        </PanelSelect>
      </PanelField>

      <DetailsMenu
        ariaLabel="Sort"
        detailsClassName="relative"
        summaryClassName={iconSummaryClass}
        portal
        portalPlacement="bottom-end"
        summary={<ArrowUpDown className="w-4 h-4" aria-hidden="true" />}
        menu={
          <form className={['kg-graph-data-table-menu-form rounded border p-2 shadow-[var(--kg-shadow-overlay)]', UI_THEME_TOKENS.panel.bg, UI_THEME_TOKENS.panel.border].join(' ')}>
            <fieldset className="space-y-2">
              {props.sortRules.map(rule => (
                <section key={rule.id} className={menuRowClass}>
                  <PanelField label="Field" variant="section" layout="compact" className={menuFieldClass} labelClassName={menuFieldLabelClass}>
                    <PanelSelect
                      variant="transparent"
                      value={rule.columnId}
                      onValueChange={selectedValueInput => updateSortRule(rule.id, { columnId: selectedValueInput })}
                      className={toolbarFieldClass}
                    >
                      {props.columns.map(c => (
                        <option key={c.columnId} value={c.columnId}>
                          {c.name}
                        </option>
                      ))}
                    </PanelSelect>
                  </PanelField>
                  <PanelField label="Direction" variant="section" layout="compact" className={menuFieldClass} labelClassName={menuFieldLabelClass}>
                    <PanelSelect
                      variant="transparent"
                      value={rule.direction}
                      onValueChange={selectedValueInput => updateSortRule(rule.id, { direction: selectedValueInput as GraphDataTableSortDirection })}
                      className={toolbarFieldClass}
                    >
                      <option value="asc">asc</option>
                      <option value="desc">desc</option>
                    </PanelSelect>
                  </PanelField>
                  <button
                    type="button"
                    className={`App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
                    onClick={() => removeSortRule(rule.id)}
                  >
                    Remove
                  </button>
                </section>
              ))}
              <section className={menuRowClass}>
                <button
                  type="button"
                  className={`App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
                  onClick={addSortRule}
                >
                  Add sort
                </button>
                <button
                  type="button"
                  className={`App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
                  onClick={() => props.setSortRules([])}
                >
                  Clear all
                </button>
              </section>
            </fieldset>
          </form>
        }
      />

      <label className={`${UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME} gap-2`}>
        <span className={UI_TEXT_TRUNCATE}>{`Row height: ${readDataViewRowHeightLabel(props.rowHeightPreset)}`}</span>
        <PanelSelect
          value={props.rowHeightPreset}
          onValueChange={selectedValueInput => props.setRowHeightPreset(selectedValueInput === 'compact' ? 'compact' : 'comfortable')}
          className={toolbarFieldClass}
        >
          {DATA_VIEW_ROW_HEIGHT_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </PanelSelect>
      </label>

      {hasCustomWidths ? (
        <IconButton
          title="Reset column widths"
          showTooltip
          onClick={props.resetColumnWidths}
          className={iconButtonClass}
        >
          <Ruler className="w-4 h-4" aria-hidden="true" />
        </IconButton>
      ) : null}
    </CollapsibleToolbar>
  )
}
