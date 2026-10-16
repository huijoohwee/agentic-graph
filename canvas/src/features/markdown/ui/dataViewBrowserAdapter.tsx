import React from 'react'
import { createRoot } from 'react-dom/client'
import { UI_THEME_TOKENS } from 'grph-shared/ui/themeTokens'
export { mountSequenceGuide } from '../../sequence/sequenceGuideBrowserAdapter'
import {
  MarkdownDataViewTableCore,
  dataViewTableCellClassName,
  dataViewTableHeaderClassName,
  readMarkdownDataViewDefaultColumnWidth,
  MARKDOWN_DATA_VIEW_TABLE_INITIAL_RENDER_ROW_LIMIT,
  MARKDOWN_DATA_VIEW_TABLE_RENDER_ROW_INCREMENT,
} from './MarkdownDataViewTableCore'

export const DATA_VIEW_BROWSER_LIMITS = Object.freeze({
  columns: 64, rows: 1000, cellChars: 4096, idChars: 128, labelChars: 256, payloadBytes: 196608,
})

export type DataViewBrowserState = {
  columns: { id: string; name: string }[]
  rows: { id: string; cells: string[] }[]
  selectedRowId?: string | null
  onActivateRow?: (rowId: string) => void
  orientation?: 'rows' | 'columns'
  ariaLabel?: string
}
export type DataViewBrowserHandle = { update: (next: DataViewBrowserState) => void; destroy: () => void }
const mountedTargets = new WeakSet<HTMLElement>()

/** Validate and snapshot the plain-data boundary before changing any rendered state. */
function snapshot(input: DataViewBrowserState): DataViewBrowserState {
  if (!input || typeof input !== 'object') throw new TypeError('Data view state must be an object.')
  const limits = DATA_VIEW_BROWSER_LIMITS
  const string = (value: unknown, max: number, label: string, nonempty = false): string => {
    if (typeof value !== 'string' || value.length > max || (nonempty && !value.trim()) || value.includes('\u0000')) {
      throw new TypeError(`Invalid data view ${label}.`)
    }
    return value
  }
  if (!Array.isArray(input.columns) || !input.columns.length || input.columns.length > limits.columns) throw new RangeError('Data view column limit exceeded.')
  if (!Array.isArray(input.rows) || input.rows.length > limits.rows) throw new RangeError('Data view row limit exceeded.')
  const columnIds = new Set<string>(), rowIds = new Set<string>()
  let chars = 0
  const bounded = (value: string): string => {
    chars += value.length
    if (chars > limits.payloadBytes) throw new RangeError('Data view payload limit exceeded.')
    return value
  }
  const columns = Array.from(input.columns, column => {
    const id = bounded(string(column?.id, limits.idChars, 'column ID', true))
    if (columnIds.has(id)) throw new TypeError('Duplicate data view column ID.')
    columnIds.add(id)
    return { id, name: bounded(string(column?.name, limits.labelChars, 'column name', true)) }
  })
  const rows = Array.from(input.rows, row => {
    const id = bounded(string(row?.id, limits.idChars, 'row ID', true))
    if (rowIds.has(id)) throw new TypeError('Duplicate data view row ID.')
    rowIds.add(id)
    if (!Array.isArray(row?.cells) || row.cells.length !== columns.length) throw new TypeError('Data view cells must match columns.')
    return { id, cells: Array.from(row.cells, cell => bounded(string(cell, limits.cellChars, 'cell'))) }
  })
  const orientation = input.orientation ?? 'rows'
  if (orientation !== 'rows' && orientation !== 'columns') throw new TypeError('Invalid data view orientation.')
  const ariaLabel = string(input.ariaLabel ?? 'Table view', limits.labelChars, 'label', true)
  const selectedRowId = input.selectedRowId == null ? input.selectedRowId : string(input.selectedRowId, limits.idChars, 'selection', true)
  if (selectedRowId != null && !rowIds.has(selectedRowId)) throw new TypeError('Data view selected row does not exist.')
  if (input.onActivateRow !== undefined && typeof input.onActivateRow !== 'function') throw new TypeError('Invalid data view activation callback.')
  const state = { columns, rows, orientation, ariaLabel, selectedRowId }
  if (new TextEncoder().encode(JSON.stringify(state)).byteLength > limits.payloadBytes) throw new RangeError('Data view payload limit exceeded.')
  return { ...state, onActivateRow: input.onActivateRow }
}

function BrowserDataView({ state }: { state: DataViewBrowserState }) {
  const [limit, setLimit] = React.useState(MARKDOWN_DATA_VIEW_TABLE_INITIAL_RENDER_ROW_LIMIT)
  const records = state.rows.slice(0, limit)
  const remaining = state.rows.length - records.length
  const isColumns = state.orientation === 'columns'
  const columns = isColumns
    ? [{ id: '__field', width: 168 }, ...records.map(row => ({ id: `row:${row.id}`, width: readMarkdownDataViewDefaultColumnWidth('') }))]
    : state.columns.map(column => ({ id: column.id, width: readMarkdownDataViewDefaultColumnWidth(column.name) }))
  const rows = isColumns
    ? state.columns.map((column, index) => ({ id: column.id, label: column.name, cells: records.map(row => row.cells[index]) }))
    : records.map(row => ({ ...row, label: '' }))
  const width = columns.reduce((sum, column) => sum + column.width, 0)
  return <MarkdownDataViewTableCore
    columns={columns} rows={rows} rowKey={row => row.id}
    ariaLabel={state.ariaLabel} focusable
    selectedRowId={isColumns ? undefined : state.selectedRowId}
    onActivateRow={isColumns ? undefined : state.onActivateRow}
    tableClassName="min-w-full w-full" textSizeClassName="text-sm" tableStyle={{ minWidth: width, width: '100%' }}
    renderHeader={() => isColumns ? <>
      <th scope="col" className={dataViewTableHeaderClassName()}>Field</th>
      {records.map(row => <th key={row.id} scope="col" className={dataViewTableHeaderClassName()}><span className="block whitespace-pre-wrap break-words">{row.cells[0] || row.id}</span></th>)}
    </> : state.columns.map(column => <th key={column.id} scope="col" className={dataViewTableHeaderClassName()}><span className="block whitespace-pre-wrap break-words">{column.name}</span></th>)}
    renderCells={row => <>
      {isColumns && <th scope="row" className={dataViewTableHeaderClassName(undefined, false)}><span className="block whitespace-pre-wrap break-words">{row.label}</span></th>}
      {row.cells.map((cell, index) => <td key={columns[index + (isColumns ? 1 : 0)].id} className={dataViewTableCellClassName()} style={{ height: 'var(--kg-table-row-height)' }}><span className="block whitespace-pre-wrap break-words">{cell}</span></td>)}
    </>}
    afterRows={<>
      {!state.rows.length && <tr><td colSpan={columns.length} className={dataViewTableCellClassName()}><p role="status" className={UI_THEME_TOKENS.text.secondary}>No records.</p></td></tr>}
      {remaining > 0 && <tr><td colSpan={columns.length} className={dataViewTableCellClassName()}><button type="button"
        className={`inline-flex min-h-11 items-center gap-2 rounded px-2 py-1 text-sm ${UI_THEME_TOKENS.text.secondary} ${UI_THEME_TOKENS.button.hoverBg}`}
        onClick={() => setLimit(value => Math.min(state.rows.length, value + MARKDOWN_DATA_VIEW_TABLE_RENDER_ROW_INCREMENT))}
      >{`Show ${Math.min(remaining, MARKDOWN_DATA_VIEW_TABLE_RENDER_ROW_INCREMENT)} more ${isColumns ? 'columns' : 'rows'}`}</button></td></tr>}
    </>}
  />
}

/** Mount into a dedicated element, including an element inside a consumer-owned ShadowRoot.
 * All cells remain literal text. This adapter has no media, invocation, store or persistence owner.
 */
export function mountDataView(target: HTMLElement, initial: DataViewBrowserState): DataViewBrowserHandle {
  const state = snapshot(initial)
  const ElementClass = target?.ownerDocument?.defaultView?.HTMLElement
  if (!ElementClass || !(target instanceof ElementClass)) throw new TypeError('Data view target must be an HTML element.')
  if (mountedTargets.has(target)) throw new Error('Data view target is already mounted.')
  const root = createRoot(target)
  mountedTargets.add(target)
  let destroyed = false
  const render = (next: DataViewBrowserState) => root.render(<BrowserDataView key={JSON.stringify([next.orientation, next.rows.map(row => row.id)])} state={next} />)
  render(state)
  return {
    update(next) {
      if (destroyed) throw new Error('Data view is destroyed.')
      render(snapshot(next))
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      root.unmount()
      mountedTargets.delete(target)
    },
  }
}
