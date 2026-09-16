import React from 'react'
import type { GraphRecordColumnDoc, GraphRecordTableId } from '@/lib/graph-record-db'
import type { GraphDataTableGridRow } from '@/features/graph-data-table/ui/graphDataTableTypes'
import type {
  GraphDataTableColumnVisibilityById,
  GraphDataTableColumnWidthsPxById,
  GraphDataTableFilterClause,
  GraphDataTableFilterMatch,
  GraphDataTableRowHeightPreset,
  GraphDataTableSortRule,
} from '@/features/graph-data-table/ui/graphDataTableViewState'
import { useGraphDataTableGridModel } from '@/features/graph-data-table/ui/fast-grid/useGraphDataTableGridModel'
import { getCellTextByKind } from '@/features/graph-data-table/ui/fast-grid/canvasGridRender'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { PanelTypography } from '@/lib/ui/panelTypography'
import { readDataViewHeaderPixelHeight, readDataViewRowPixelHeight } from '@/lib/ui/dataViewDensity'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import { UI_RESPONSIVE_CONTENT_START_OFFSET_CLASSNAME, UI_RESPONSIVE_VIEWPORT_SCROLL_PANEL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { readMarkdownSigilDisplayText } from '@/lib/markdown/markdownSigil'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import {
  GRAPH_DATA_TABLE_ORDER_COLUMN_WIDTH_PX,
  GRAPH_DATA_TABLE_SELECT_COLUMN_WIDTH_PX,
} from '@/features/graph-data-table/ui/graphDataTableResponsiveMetrics'

export const GraphDataTableDomTableView = React.memo(function GraphDataTableDomTableView(props: {
  tableId: GraphRecordTableId
  columns: GraphRecordColumnDoc[]
  rows: GraphDataTableGridRow[]
  selectedRowIds: string[]
  columnVisibilityById: GraphDataTableColumnVisibilityById
  filterMatch: GraphDataTableFilterMatch
  filterClauses: GraphDataTableFilterClause[]
  groupBy: string
  sortRules: GraphDataTableSortRule[]
  rowHeightPreset: GraphDataTableRowHeightPreset
  columnWidthsPxById: GraphDataTableColumnWidthsPxById
  columnOrderIds?: string[]
  panelTypography?: PanelTypography
  onRowClicked: (rowId: string) => void
  onSelectionChanged: (selectedRowIds: string[]) => void
}) {
  const rowHeightPx = readDataViewRowPixelHeight(props.rowHeightPreset)
  const headerHeightPx = readDataViewHeaderPixelHeight(props.rowHeightPreset)
  const model = useGraphDataTableGridModel({
    columns: props.columns,
    rows: props.rows,
    columnVisibilityById: props.columnVisibilityById,
    filterMatch: props.filterMatch,
    filterClauses: props.filterClauses,
    groupBy: props.groupBy,
    sortRules: props.sortRules,
    columnWidthsPxById: props.columnWidthsPxById,
    columnOrderIds: props.columnOrderIds,
    headerHeight: headerHeightPx,
    rowHeight: rowHeightPx,
    selectedRowIds: props.selectedRowIds,
  })

  const dataCols = React.useMemo(() => model.columns.filter(c => c.kind === 'data'), [model.columns])
  const selectColumnWidth = model.columns.find(c => c.kind === 'select')?.width ?? GRAPH_DATA_TABLE_SELECT_COLUMN_WIDTH_PX
  const orderColumnWidth = model.columns.find(c => c.kind === 'order')?.width ?? GRAPH_DATA_TABLE_ORDER_COLUMN_WIDTH_PX
  const selectedSet = React.useMemo(() => new Set(props.selectedRowIds), [props.selectedRowIds])

  return (
    <section className={`${UI_RESPONSIVE_VIEWPORT_SCROLL_PANEL_CLASSNAME} flex-1 min-h-0 min-w-0 max-w-full`} aria-label={`${props.tableId} dom table`}>
      <table className="min-w-full border-separate border-spacing-0">
        <thead className="sticky top-0 z-10">
          <tr className={`${UI_THEME_TOKENS.table.headerBg} ${UI_THEME_TOKENS.table.cellBorder}`}>
            <th className={`sticky left-0 z-20 border-b border-r ${UI_THEME_TOKENS.table.cellBorder} ${UI_THEME_TOKENS.table.headerBg}`} style={{ width: selectColumnWidth, height: headerHeightPx }}>
              <input
                type="checkbox"
                aria-label={model.allSelected ? 'Deselect all rows' : 'Select all rows'}
                checked={model.allSelected}
                onChange={() => {
                  if (model.allSelected) props.onSelectionChanged([])
                  else props.onSelectionChanged(model.allVisibleRowIds)
                }}
              />
            </th>
            <th
              className={`sticky ${UI_RESPONSIVE_CONTENT_START_OFFSET_CLASSNAME} z-20 border-b border-r px-2 text-left ${props.panelTypography?.microLabelClass || ''} ${UI_THEME_TOKENS.table.cellBorder} ${UI_THEME_TOKENS.table.headerBg} ${UI_THEME_TOKENS.text.secondary}`}
              style={{ width: orderColumnWidth, height: headerHeightPx }}
            >
              #
            </th>
            {dataCols.map(col => (
              <th
                key={col.id}
                className={`border-b border-r px-2 text-left ${props.panelTypography?.microLabelClass || ''} ${UI_THEME_TOKENS.table.cellBorder} ${UI_THEME_TOKENS.text.secondary}`}
                style={{ width: col.width, height: headerHeightPx }}
              >
                <span className={UI_TEXT_TRUNCATE}>{col.title}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={props.panelTypography?.panelTextClass || ''}>
          {model.displayRows.map((item, idx) => {
            if (item.kind === 'group') {
              return (
                <tr key={`g:${item.label}:${idx}`} className={UI_THEME_TOKENS.table.rowBg}>
                  <td colSpan={2 + dataCols.length} className={`border-b px-2 py-1 font-semibold ${UI_THEME_TOKENS.table.cellBorder} ${UI_THEME_TOKENS.text.secondary}`} style={{ height: rowHeightPx }}>
                    <span className={UI_TEXT_TRUNCATE} title={readMarkdownSigilDisplayText(item.label)}>
                      {renderMarkdownSigilInlineText(item.label)} ({item.count})
                    </span>
                  </td>
                </tr>
              )
            }

            const row = item.row
            const selected = selectedSet.has(row.id)
            return (
              <tr
                key={row.id}
                className={`${UI_THEME_TOKENS.table.rowBg} ${selected ? UI_THEME_TOKENS.table.rowSelected : ''} ${UI_THEME_TOKENS.table.rowHover}`}
                aria-current={selected ? 'true' : undefined}
                tabIndex={0}
                onKeyDown={event => {
                  if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
                    event.preventDefault(); props.onRowClicked(row.id)
                  }
                }}
                onClick={() => props.onRowClicked(row.id)}
              >
                <td className={`sticky left-0 z-10 border-b border-r ${UI_THEME_TOKENS.table.cellBorder} ${UI_THEME_TOKENS.table.rowBg}`} style={{ height: rowHeightPx }}>
                  <input
                    type="checkbox"
                    checked={selected}
                    aria-label={`Select row ${String((row as any).__order ?? row.id)}`}
                    onClick={event => event.stopPropagation()}
                    onChange={e => {
                      e.stopPropagation()
                      const next = new Set(props.selectedRowIds)
                      if (next.has(row.id)) next.delete(row.id)
                      else next.add(row.id)
                      props.onSelectionChanged(Array.from(next.values()))
                    }}
                  />
                </td>
                <td
                  className={`sticky ${UI_RESPONSIVE_CONTENT_START_OFFSET_CLASSNAME} z-10 border-b border-r px-2 ${UI_THEME_TOKENS.table.cellBorder} ${UI_THEME_TOKENS.table.rowBg} ${UI_THEME_TOKENS.text.tertiary}`}
                  style={{ height: rowHeightPx }}
                >
                  {String((row as any).__order ?? '')}
                </td>
                {dataCols.map(col => {
                  const raw = (row as any)[col.id]
                  const text = getCellTextByKind(raw, col.dataKind)
                  const displayText = readMarkdownSigilDisplayText(text)
                  return (
                    <td key={col.id} className={`border-b border-r px-2 ${UI_THEME_TOKENS.table.cellBorder} ${UI_THEME_TOKENS.text.primary}`} style={{ height: rowHeightPx }}>
                      <span className={UI_TEXT_TRUNCATE} title={displayText}>{renderMarkdownSigilInlineText(text)}</span>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
})
