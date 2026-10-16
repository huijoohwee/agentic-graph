import React from 'react'
import { UI_THEME_TOKENS } from 'grph-shared/ui/themeTokens'
import { uiSelectedRowStateClassName } from 'grph-shared/ui/selectedRowClasses'
import { UI_RESPONSIVE_DATA_VIEW_TABLE_FRAME_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { MARKDOWN_DATA_VIEW_TABLE_STICKY_HEADER_CLASSNAME } from './markdownDataViewTableClasses'

export { readMarkdownDataViewDefaultColumnWidth } from './markdownDataViewColumnSizing'
export const MARKDOWN_DATA_VIEW_TABLE_INITIAL_RENDER_ROW_LIMIT = 32
export const MARKDOWN_DATA_VIEW_TABLE_RENDER_ROW_INCREMENT = 32

export const dataViewTableHeaderClassName = (padding = 'px-3 py-2', sticky = true): string =>
  `${padding} ${sticky ? 'relative z-[31] ' : ''}text-left font-semibold border-b ${UI_THEME_TOKENS.table.cellBorder} ${UI_THEME_TOKENS.table.headerBg}`
export const dataViewTableCellClassName = (padding = 'px-3 py-2'): string =>
  `${padding} overflow-hidden border-b ${UI_THEME_TOKENS.table.cellBorder} align-top`

/** One table structure for native rows, native columns, and controlled browser consumers.
 * Slots retain native editing and rich content without making them a portable dependency.
 */
export function MarkdownDataViewTableCore<Row>(props: {
  columns: readonly { id: string; width: number }[]
  rows: readonly Row[]
  rowKey: (row: Row) => string
  renderHeader: () => React.ReactNode
  renderCells: (row: Row) => React.ReactNode
  rowDepth?: (row: Row) => number
  selectedRowId?: string | null
  onActivateRow?: (rowId: string) => void
  tableClassName?: string
  textSizeClassName?: 'text-xs' | 'text-sm' | 'text-base'
  tableStyle?: React.CSSProperties
  ariaLabel?: string
  focusable?: boolean
  beforeRows?: React.ReactNode
  afterRows?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <section className={`${UI_RESPONSIVE_DATA_VIEW_TABLE_FRAME_CLASSNAME} isolate`} aria-label={props.ariaLabel || 'Table view'} role={props.focusable ? 'region' : undefined} tabIndex={props.focusable ? 0 : undefined}>
      <table aria-label={props.ariaLabel} className={`${props.tableClassName || 'min-w-max w-max'} table-fixed border-separate border-spacing-0 ${props.textSizeClassName || 'text-xs'}`} style={props.tableStyle}>
        <colgroup>{props.columns.map(column => <col key={column.id} style={{ width: column.width }} />)}</colgroup>
        <thead className={`${MARKDOWN_DATA_VIEW_TABLE_STICKY_HEADER_CLASSNAME} sticky top-0 z-30 isolate ${UI_THEME_TOKENS.table.headerBg} ${UI_THEME_TOKENS.table.text}`}>
          <tr>{props.renderHeader()}</tr>
        </thead>
        <tbody className={UI_THEME_TOKENS.table.text}>
          {props.beforeRows}
          {props.rows.map(row => {
            const id = props.rowKey(row)
            return <tr key={id}
              className={[`${UI_THEME_TOKENS.table.rowHoverHighlight} transition-colors`, props.onActivateRow ? 'cursor-pointer' : '', uiSelectedRowStateClassName(props.selectedRowId === id)].filter(Boolean).join(' ')}
              aria-selected={props.selectedRowId === undefined ? undefined : props.selectedRowId === id}
              tabIndex={props.onActivateRow ? 0 : undefined}
              data-kg-markdown-data-view-row-nested-depth={props.rowDepth ? String(props.rowDepth(row)) : undefined}
              onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); props.onActivateRow?.(id) } }}
              onClick={props.onActivateRow ? event => {
                const element = event.target as HTMLElement | null
                if (element?.closest('input,select,textarea,button')) return
                props.onActivateRow?.(id)
              } : undefined}
            >{props.renderCells(row)}</tr>
          })}
          {props.afterRows}
        </tbody>
      </table>
      {props.children}
    </section>
  )
}
