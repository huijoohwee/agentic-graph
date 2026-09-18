import React from 'react'
import type { MarkdownDataView } from './markdownDataViewModel'
import type { MarkdownDataViewColumnType } from './markdownDataViewColumnType'
import { columnTypeToBaseKind, defaultColumnTypeForInferredKind, labelForMarkdownDataViewColumnType } from './markdownDataViewColumnType'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'
import { DataViewTagChip } from './MarkdownDataViewChips'
import { MarkdownDataViewColumnTypeMenu } from './MarkdownDataViewColumnTypeMenu'
import { iconByColumnType } from './markdownDataViewColumnTypeMenuIcons'
import { MarkdownDataViewAddColumnMenu } from './MarkdownDataViewAddColumnMenu'
import { ColumnHeaderPropertyTypeMenu } from '@/components/ui/ColumnHeaderPropertyTypeMenu'
import { Plus, Type } from 'lucide-react'
import { ColumnHeaderMenu } from '@/components/ui/ColumnHeaderMenu'
import { workspaceTablePreferencesStore } from '@/features/workspace-table/workspaceTablePreferencesStore'
import { splitMultiValues } from '@/features/markdown/ui/markdownDataViewValueUtils'
import { UI_RESPONSIVE_ACTION_ROW_CLASSNAME, UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME, UI_RESPONSIVE_DATA_VIEW_MENU_PANEL_CLASSNAME, UI_RESPONSIVE_DATA_VIEW_TABLE_FRAME_CLASSNAME, UI_RESPONSIVE_DATA_VIEW_TABLE_PROGRESS_CLASSNAME, UI_RESPONSIVE_DATA_VIEW_TABLE_VALUE_CLASSNAME, UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME, UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME, UI_RESPONSIVE_MENU_ICON_ACTION_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import { uiToolbarRowScrollClassName } from '@/features/toolbar/ui/toolbarStyles'
import { readMarkdownSigilDisplayText } from '@/lib/markdown/markdownSigil'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import { buildInlineMediaCommandContextFromRecord } from '@/lib/command-menu/inlineMediaCommandContext'
import { buildSourceLineNestedTableCellMap, renderMarkdownDataViewTableRichCell } from './MarkdownDataViewImageCell'
import { MarkdownDataViewHierarchyCell } from './MarkdownDataViewHierarchyCell'
import { MarkdownDataViewInlineTextCellEditor } from './MarkdownDataViewInlineTextCellEditor'
import { MarkdownDataViewNestedRowsBulkToggle } from './MarkdownDataViewNestedRowsBulkToggle'
import { useMarkdownDataViewNestedRowCollapse } from './useMarkdownDataViewNestedRowCollapse'
import { MarkdownDataViewColumnResizeHandle } from './MarkdownDataViewColumnResizeHandle'
import { MarkdownDataViewColumnsTableView } from './MarkdownDataViewColumnsTableView'
import { MarkdownDataViewCellSelectPopover } from './MarkdownDataViewCellSelectPopover'
import { MARKDOWN_DATA_VIEW_DEFAULT_COLUMN_WIDTH_PX, readMarkdownDataViewDefaultColumnWidth } from './markdownDataViewColumnSizing'
import { MARKDOWN_DATA_VIEW_TABLE_STICKY_HEADER_CLASSNAME } from './markdownDataViewTableClasses'
import {
  MARKDOWN_DATA_VIEW_TABLE_CELL_PREVIEW_CHAR_LIMIT,
  readMarkdownDataViewTableCellDisplayText,
  readMarkdownDataViewTableCellPreviewText,
} from './markdownDataViewCellPreview'
import {
  coerceDataViewFieldLineMode,
  coerceDataViewRowHeightPreset,
  readDataViewFieldLineClassName,
  readDataViewHeaderPaddingClassName,
  readDataViewTablePaddingClassName,
  type DataViewFieldLineMode,
  type DataViewRowHeightPreset,
} from '@/lib/ui/dataViewDensity'
type MarkdownDataViewTableViewProps = {
  view: MarkdownDataView
  visibleColumnIds?: string[] | null
  columnTypesById?: Record<string, MarkdownDataViewColumnType> | null
  canMutate: boolean
  canConfigure?: boolean
  onUpdateCell: (args: { rowId: string; columnId: string; nextValue: string }) => void
  onActivateRow?: (rowId: string) => void
  selectedRowId?: string | null
  onNewRecord?: () => void
  onAddColumn?: (args: { name: string; columnType: MarkdownDataViewColumnType }) => void
  onChangeColumnType?: (args: { columnId: string; nextType: MarkdownDataViewColumnType }) => void
  onHideColumnInView?: (columnId: string) => void
  onUpsertColumnFilter?: (args: { columnId: string; columnKind: MarkdownDataView['columns'][number]['kind']; op: 'contains' | 'equals' | 'includes'; value: string }) => void
  onSetColumnSort?: (args: { columnId: string; direction: 'asc' | 'desc' }) => void
  renderAllRows?: boolean
  orientation?: 'rows' | 'columns'
  tableFit?: 'content' | 'container'
  rowHeightPreset?: DataViewRowHeightPreset
  fieldLineMode?: DataViewFieldLineMode
}
const isTruthy = (raw: string): boolean => {
  const v = String(raw || '').trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes' || v === 'x'
}
const safeLinkHref = (raw: string): string | null => {
  const v = String(raw || '').trim()
  if (!v) return null
  const lower = v.toLowerCase()
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:')) return v
  return null
}
export const MARKDOWN_DATA_VIEW_TABLE_INITIAL_RENDER_ROW_LIMIT = 32
export const MARKDOWN_DATA_VIEW_TABLE_RENDER_ROW_INCREMENT = 32
const MARKDOWN_DATA_VIEW_HIERARCHY_COLUMN_WIDTH_PX = 64
export const MARKDOWN_DATA_VIEW_FIELD_COLUMN_ID = '__field'
export { MARKDOWN_DATA_VIEW_TABLE_CELL_PREVIEW_CHAR_LIMIT, readMarkdownDataViewTableCellPreviewText }
export const MarkdownDataViewTableView = React.memo(function MarkdownDataViewTableView(props: MarkdownDataViewTableViewProps) {
  const { view, visibleColumnIds, columnTypesById, canMutate, onUpdateCell, onActivateRow } = props
  const canConfigure = props.canConfigure ?? canMutate
  const orientation = props.orientation === 'columns' ? 'columns' : 'rows'
  const rowHeightPreset = coerceDataViewRowHeightPreset(props.rowHeightPreset)
  const fieldLineMode = coerceDataViewFieldLineMode(props.fieldLineMode)
  const cellPaddingClassName = readDataViewTablePaddingClassName(rowHeightPreset)
  const headerPaddingClassName = readDataViewHeaderPaddingClassName(rowHeightPreset)
  const fieldLineClassName = readDataViewFieldLineClassName(fieldLineMode)
  const [editing, setEditing] = React.useState<{ rowId: string; colId: string; anchorEl: HTMLElement } | null>(null)
  const [draft, setDraft] = React.useState('')
  const [renderedRowLimit, setRenderedRowLimit] = React.useState(MARKDOWN_DATA_VIEW_TABLE_INITIAL_RENDER_ROW_LIMIT)
  const [previewColumnWidthsById, setPreviewColumnWidthsById] = React.useState<Record<string, number>>({})
  const draftRef = React.useRef('')
  draftRef.current = draft
  const startEdit = React.useCallback(
    (rowId: string, colId: string, current: string, anchorEl: HTMLElement) => {
      if (!canMutate) return
      setEditing({ rowId, colId, anchorEl })
      setDraft(String(current ?? ''))
    },
    [canMutate],
  )
  const commit = React.useCallback((nextOverride?: string) => {
    if (!editing) return
    if (!canMutate) {
      setEditing(null)
      return
    }
    const nextValue = typeof nextOverride === 'string' ? nextOverride : draftRef.current
    onUpdateCell({ rowId: editing.rowId, columnId: editing.colId, nextValue })
    setEditing(null)
  }, [canMutate, editing, onUpdateCell])
  const cancel = React.useCallback(() => {
    setEditing(null)
  }, [])
  const handleInlineTextCommit = React.useCallback(
    (rowId: string, colId: string, nextValue: string) => {
      if (!canMutate) return
      if (!editing || editing.rowId !== rowId || editing.colId !== colId) return
      commit(nextValue)
    },
    [canMutate, commit, editing],
  )
  const visibleColumnMeta = React.useMemo(() => {
    if (!visibleColumnIds) return view.columns.map((c, idx) => ({ col: c, index: idx }))
    const allowed = new Set(visibleColumnIds)
    return view.columns
      .map((c, idx) => ({ col: c, index: idx }))
      .filter(x => allowed.has(x.col.id))
  }, [view.columns, visibleColumnIds])
  const visibleColumnSignature = React.useMemo(
    () => visibleColumnMeta.map(({ col }) => col.id).join('\u0000'),
    [visibleColumnMeta],
  )
  const readColumnWidth = React.useCallback((columnId: string, fallback = MARKDOWN_DATA_VIEW_DEFAULT_COLUMN_WIDTH_PX) => {
    const previewWidth = previewColumnWidthsById[columnId]
    if (typeof previewWidth === 'number' && Number.isFinite(previewWidth)) return previewWidth
    return fallback
  }, [previewColumnWidthsById])
  const previewColumnResize = React.useCallback((columnId: string, width: number) => {
    setPreviewColumnWidthsById(prev => ({ ...prev, [columnId]: width }))
  }, [])
  const commitColumnResize = React.useCallback(previewColumnResize, [previewColumnResize])
  React.useEffect(() => {
    if (props.renderAllRows) {
      setRenderedRowLimit(view.rows.length)
      return
    }
    setRenderedRowLimit(MARKDOWN_DATA_VIEW_TABLE_INITIAL_RENDER_ROW_LIMIT)
  }, [props.renderAllRows, view.rows, visibleColumnSignature])
  React.useEffect(() => {
    if (!editing) return
    const rowIndex = view.rows.findIndex(row => row.id === editing.rowId)
    if (rowIndex < 0 || rowIndex < renderedRowLimit) return
    setRenderedRowLimit(Math.min(view.rows.length, rowIndex + 1))
  }, [editing, renderedRowLimit, view.rows])
  const renderedRows = React.useMemo(
    () => (props.renderAllRows ? view.rows : view.rows.slice(0, Math.min(view.rows.length, renderedRowLimit))),
    [props.renderAllRows, renderedRowLimit, view.rows],
  )
  const hiddenRowCount = Math.max(0, view.rows.length - renderedRows.length)
  const [contentColumnIndex, lineColumnIndex, levelColumnIndex, indentColumnIndex] = React.useMemo(() => {
    const findColumn = (name: string) => view.columns.findIndex(column => String(column.name || '').trim() === name)
    return [findColumn('Content'), findColumn('Line'), findColumn('Level'), findColumn('Indent')] as const
  }, [view.columns])
  const sourceLineNestedTableCells = React.useMemo(
    () => buildSourceLineNestedTableCellMap({ rows: renderedRows, contentColumnIndex, lineColumnIndex, levelColumnIndex, indentColumnIndex }),
    [contentColumnIndex, indentColumnIndex, levelColumnIndex, lineColumnIndex, renderedRows],
  )
  const { areAllNestedRowsCollapsed, collapsedNestedRowIds, hasNestedRowHierarchy, toggleAllNestedRows, toggleNestedRow, visibleNestedRowStates } = useMarkdownDataViewNestedRowCollapse({ rows: renderedRows, levelColumnIndex, indentColumnIndex })
  const workspaceCellSelectPanelPlacement = React.useSyncExternalStore(
    workspaceTablePreferencesStore.subscribe,
    () => workspaceTablePreferencesStore.getSnapshot().workspaceCellSelectPanelPlacement,
    () => workspaceTablePreferencesStore.getServerSnapshot().workspaceCellSelectPanelPlacement,
  )
  const columnIndexById = React.useMemo(() => {
    const map = new Map<string, number>()
    for (let i = 0; i < view.columns.length; i += 1) {
      map.set(view.columns[i].id, i)
    }
    return map
  }, [view.columns])
  const editingMeta = React.useMemo(() => {
    if (!editing) return null
    const colIndex = columnIndexById.get(editing.colId)
    if (colIndex == null) return null
    const column = view.columns[colIndex]
    if (!column) return null
    const uiType = (columnTypesById && columnTypesById[column.id]) || defaultColumnTypeForInferredKind(column.kind)
    const baseKind = columnTypeToBaseKind(uiType)
    return {
      rowId: editing.rowId,
      colId: editing.colId,
      colIndex,
      column,
      uiType,
      baseKind,
      anchorEl: editing.anchorEl,
    }
  }, [columnIndexById, columnTypesById, editing, view.columns])
  const editingSelectOptions = React.useMemo(() => {
    if (!editingMeta) return []
    if (editingMeta.baseKind !== 'select' || editingMeta.uiType === 'checkbox') return []
    if (editingMeta.column.kind === 'select' && Array.isArray(editingMeta.column.options)) {
      const base = editingMeta.column.options.map(x => String(x || '').trim()).filter(Boolean)
      if (base.length) return base
    }
    const set = new Set<string>()
    for (const r of view.rows) {
      const v = String(r.cells[editingMeta.colIndex] ?? '').trim()
      if (!v) continue
      set.add(v)
      if (set.size >= 64) break
    }
    return Array.from(set)
  }, [editingMeta, view.rows])
  const editingMultiSelectOptions = React.useMemo(() => {
    if (!editingMeta) return []
    if (editingMeta.baseKind !== 'multi-select') return []
    if (editingMeta.column.kind === 'multi-select' && Array.isArray(editingMeta.column.options)) {
      const base = editingMeta.column.options.map(x => String(x || '').trim()).filter(Boolean)
      if (base.length) return base
    }
    const set = new Set<string>()
    const list: string[] = []
    for (const r of view.rows) {
      const vals = splitMultiValues(String(r.cells[editingMeta.colIndex] ?? ''))
      for (const v of vals) {
        const key = v.toLowerCase()
        if (set.has(key)) continue
        set.add(key)
        list.push(v)
        if (list.length >= 96) break
      }
      if (list.length >= 96) break
    }
    return list
  }, [editingMeta, view.rows])
  const titleColumnIndex = React.useMemo(() => {
    const index = view.columns.findIndex(column => column.id === view.titleColumnId)
    return index >= 0 ? index : 0
  }, [view.columns, view.titleColumnId])
  const rowRecordTableWidth = (hasNestedRowHierarchy ? MARKDOWN_DATA_VIEW_HIERARCHY_COLUMN_WIDTH_PX : 0)
    + visibleColumnMeta.reduce((sum, { col }) => sum + readColumnWidth(col.id, readMarkdownDataViewDefaultColumnWidth(col.name)), 0)
    + (canMutate && props.onAddColumn ? 52 : 0)
  const tableFit = props.tableFit === 'container' ? 'container' : 'content'
  const tableSizeClassName = tableFit === 'container' ? 'min-w-full w-full' : 'min-w-max w-max'
  const tableStyle: React.CSSProperties = tableFit === 'container'
    ? { minWidth: rowRecordTableWidth, width: '100%' }
    : { width: rowRecordTableWidth }
  if (orientation === 'columns') {
    return (
      <MarkdownDataViewColumnsTableView
        view={view}
        visibleColumnMeta={visibleColumnMeta}
        visibleNestedRowStates={visibleNestedRowStates}
        sourceLineNestedTableCells={sourceLineNestedTableCells}
        hiddenRowCount={hiddenRowCount}
        titleColumnIndex={titleColumnIndex}
        hasNestedRowHierarchy={hasNestedRowHierarchy}
        areAllNestedRowsCollapsed={areAllNestedRowsCollapsed}
        collapsedNestedRowIds={collapsedNestedRowIds}
        columnTypesById={columnTypesById}
        canConfigure={canConfigure}
        canMutate={canMutate}
        editing={editing}
        cellPaddingClassName={cellPaddingClassName}
        headerPaddingClassName={headerPaddingClassName}
        fieldLineClassName={fieldLineClassName}
        readColumnWidth={readColumnWidth}
        previewColumnResize={previewColumnResize}
        commitColumnResize={commitColumnResize}
        setRenderedRowLimit={setRenderedRowLimit}
        startEdit={startEdit}
        handleInlineTextCommit={handleInlineTextCommit}
        cancel={cancel}
        fieldLineMode={fieldLineMode}
        toggleAllNestedRows={toggleAllNestedRows}
        toggleNestedRow={toggleNestedRow}
        onUpdateCell={onUpdateCell}
        onChangeColumnType={props.onChangeColumnType}
        onHideColumnInView={props.onHideColumnInView}
        onUpsertColumnFilter={props.onUpsertColumnFilter}
      />
    )
  }
  return (
    <section className={`${UI_RESPONSIVE_DATA_VIEW_TABLE_FRAME_CLASSNAME} isolate`} aria-label="Table view">
      <table className={`${tableSizeClassName} table-fixed border-separate border-spacing-0 text-xs`} style={tableStyle}>
        <colgroup>
          {hasNestedRowHierarchy ? <col style={{ width: MARKDOWN_DATA_VIEW_HIERARCHY_COLUMN_WIDTH_PX }} /> : null}
          {visibleColumnMeta.map(({ col }) => <col key={col.id} style={{ width: readColumnWidth(col.id, readMarkdownDataViewDefaultColumnWidth(col.name)) }} />)}
          {canMutate && props.onAddColumn ? <col style={{ width: 52 }} /> : null}
        </colgroup>
        <thead className={`${MARKDOWN_DATA_VIEW_TABLE_STICKY_HEADER_CLASSNAME} sticky top-0 z-30 isolate ${UI_THEME_TOKENS.table.headerBg} ${UI_THEME_TOKENS.table.text}`}>
          <tr>
            {hasNestedRowHierarchy ? (
              <th aria-label="Nested row hierarchy" className={`${headerPaddingClassName} relative z-[31] w-16 border-b ${UI_THEME_TOKENS.table.cellBorder} ${UI_THEME_TOKENS.table.headerBg}`}>
                <MarkdownDataViewNestedRowsBulkToggle collapsed={areAllNestedRowsCollapsed} onToggle={toggleAllNestedRows} />
              </th>
            ) : null}
            {visibleColumnMeta.map(({ col: c }) => {
              const type = (columnTypesById && columnTypesById[c.id]) || defaultColumnTypeForInferredKind(c.kind)
              const Icon = iconByColumnType[type] || Type
              const allowTypeEdit = Boolean(canConfigure && props.onChangeColumnType)
              const canSort = Boolean(canConfigure && props.onSetColumnSort && c.id === view.titleColumnId)
              const filterOps = c.kind === 'multi-select'
                ? [{ key: 'includes', label: 'includes' }, { key: 'contains', label: 'contains' }, { key: 'equals', label: 'equals' }]
                : c.kind === 'select'
                  ? [{ key: 'equals', label: 'equals' }, { key: 'contains', label: 'contains' }]
                  : [{ key: 'contains', label: 'contains' }, { key: 'equals', label: 'equals' }]
              return (
              <th
                key={c.id}
                className={`${headerPaddingClassName} relative z-[31] text-left font-semibold border-b ${UI_THEME_TOKENS.table.cellBorder} ${UI_THEME_TOKENS.table.headerBg}`}
              >
                <section className="flex min-w-0 items-center gap-2 overflow-hidden">
                  <ColumnHeaderPropertyTypeMenu
                    ariaLabel={`Column type: ${c.name}`}
                    label={c.name}
                    Icon={Icon}
                    portal
                    portalPlacement="bottom-start"
                    toggleTargets="icon+chevron"
                    menu={({ close }) => (
                      <ColumnHeaderMenu
                        ariaLabel={`Column menu: ${c.name}`}
                        closeMenu={close}
                        typeSummaryLabel="Type"
                        typeValueLabel={labelForMarkdownDataViewColumnType(type)}
                        disableTypeChange={!allowTypeEdit}
                        renderTypeMenu={() => (
                          <MarkdownDataViewColumnTypeMenu
                            ariaLabel={`Column type: ${c.name}`}
                            value={type}
                            close={close}
                            disabled={!allowTypeEdit}
                            onSelect={(next) => {
                              if (!allowTypeEdit) return
                              props.onChangeColumnType?.({ columnId: c.id, nextType: next })
                            }}
                          />
                        )}
                        onHideInView={canConfigure && props.onHideColumnInView ? () => props.onHideColumnInView?.(c.id) : undefined}
                        filter={
                          canConfigure && props.onUpsertColumnFilter
                            ? {
                                ops: filterOps,
                                defaultOp: filterOps[0]?.key || 'contains',
                                onApply: ({ op, value }) =>
                                  props.onUpsertColumnFilter?.({
                                    columnId: c.id,
                                    columnKind: c.kind,
                                    op: (op === 'includes' ? 'includes' : op === 'equals' ? 'equals' : 'contains'),
                                    value,
                                  }),
                              }
                            : undefined
                        }
                        onSortAsc={canSort ? () => props.onSetColumnSort?.({ columnId: c.id, direction: 'asc' }) : undefined}
                        onSortDesc={canSort ? () => props.onSetColumnSort?.({ columnId: c.id, direction: 'desc' }) : undefined}
                        disableSort={!canSort}
                        disableInsert
                        disableDuplicate
                        disableDelete
                        disableMoveLeft
                        disableMoveRight
                      />
                    )}
                  />
                </section>
                <MarkdownDataViewColumnResizeHandle columnId={c.id} width={readColumnWidth(c.id, readMarkdownDataViewDefaultColumnWidth(c.name))} onPreview={previewColumnResize} onCommit={commitColumnResize} />
              </th>
              )
            })}
            {canMutate && props.onAddColumn ? (
              <th
                className={`${headerPaddingClassName} relative z-[31] text-left font-semibold border-b ${UI_THEME_TOKENS.table.cellBorder} ${UI_THEME_TOKENS.table.headerBg}`}
              >
                <MarkdownDataViewAddColumnMenu
                  ariaLabel="Add column"
                  nextColumnNumber={view.columns.length + 1}
                  canMutate={canMutate}
                  onAddColumn={props.onAddColumn}
                  summaryClassName={['list-none', UI_RESPONSIVE_MENU_ICON_ACTION_CLASSNAME, 'rounded border cursor-pointer', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg].join(' ')}
                  menuPositionClassName={`kg-data-view-add-column-menu absolute right-0 mt-2 ${UI_RESPONSIVE_DATA_VIEW_MENU_PANEL_CLASSNAME}`}
                />
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className={UI_THEME_TOKENS.table.text}>
          {visibleNestedRowStates.map(({ row: r, depth: rowDepth, childCount }) => {
            const isNestedRowCollapsed = collapsedNestedRowIds.has(r.id)
            return <tr
              key={r.id}
              className={[`${UI_THEME_TOKENS.table.rowHoverHighlight} transition-colors`, onActivateRow ? 'cursor-pointer' : '', props.selectedRowId === r.id ? 'bg-blue-50/80 outline outline-1 -outline-offset-1 outline-[var(--kg-primary)]' : ''].join(' ')}
              aria-selected={props.selectedRowId === undefined ? undefined : props.selectedRowId === r.id}
              tabIndex={onActivateRow ? 0 : undefined}
              onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onActivateRow?.(r.id) } }}
              data-kg-markdown-data-view-row-nested-depth={String(rowDepth)}
              onClick={
                onActivateRow
                  ? (e) => {
                      const el = e.target as HTMLElement | null
                      if (el?.closest('input,select,textarea,button')) return
                      onActivateRow(r.id)
                    }
                  : undefined
              }
            >
              {hasNestedRowHierarchy ? (
                <MarkdownDataViewHierarchyCell cellPaddingClassName={cellPaddingClassName} depth={rowDepth} childCount={childCount} collapsed={isNestedRowCollapsed} scope="row" onToggle={() => toggleNestedRow(r.id)} />
              ) : null}
              {visibleColumnMeta.map(({ col: c, index: colIndex }) => {
                const value = String(r.cells[colIndex] ?? '')
                const rowInlineMediaCommandContext = buildInlineMediaCommandContextFromRecord(r)
                const displayValue = readMarkdownSigilDisplayText(value)
                const uiType = (columnTypesById && columnTypesById[c.id]) || defaultColumnTypeForInferredKind(c.kind)
                const baseKind = columnTypeToBaseKind(uiType)
                const isEditing = editing?.rowId === r.id && editing?.colId === c.id
                const cellBase = `${cellPaddingClassName} overflow-hidden border-b ${UI_THEME_TOKENS.table.cellBorder} align-top`
                if (isEditing) {
                  const isSelect = baseKind === 'select' && uiType !== 'checkbox'
                  const isCheckbox = uiType === 'checkbox'
                  const isMulti = baseKind === 'multi-select'
                  return (
                    <td key={c.id} className={cellBase}>
                      {isCheckbox ? (
                        <label className={`${UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME} gap-2`}>
                          <input
                            autoFocus
                            type="checkbox"
                            checked={isTruthy(value)}
                            onChange={e => {
                              onUpdateCell({ rowId: r.id, columnId: c.id, nextValue: e.target.checked ? 'true' : '' })
                              setEditing(null)
                            }}
                          />
                          <span className={['min-w-0 text-xs', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.secondary].join(' ')}>{isTruthy(value) ? 'Checked' : 'Unchecked'}</span>
                        </label>
                      ) : isSelect ? (
                        draft ? <DataViewTagChip value={draft} /> : <span className={UI_THEME_TOKENS.text.tertiary}>—</span>
                      ) : isMulti ? (
                        (() => {
                          const chips = splitMultiValues(draft)
                          if (!chips.length) return <span className={UI_THEME_TOKENS.text.tertiary}>—</span>
                          return (
                            <section className={`${uiToolbarRowScrollClassName} gap-1`}>
                              {chips.map(v => (
                                <DataViewTagChip key={v} value={v} />
                              ))}
                            </section>
                          )
                        })()
                      ) : (
                        <MarkdownDataViewInlineTextCellEditor
                          key={`${r.id}:${c.id}`}
                          ariaLabel={`Edit ${c.name}`}
                          initialValue={value}
                          textClassName={UI_THEME_TOKENS.text.primary}
                          markdownCommandContextText={rowInlineMediaCommandContext}
                          onCommit={(next) => handleInlineTextCommit(r.id, c.id, next)}
                          onCancel={cancel}
                        />
                      )}
                    </td>
                  )
                }
                const chips = baseKind === 'multi-select' ? splitMultiValues(value) : []
                const href = uiType === 'link' ? safeLinkHref(value) : null
                const progressValue = uiType === 'progress' ? Number(value) : NaN
                const renderedDisplayValue = readMarkdownDataViewTableCellDisplayText(displayValue, fieldLineMode)
                const renderedRawValue = displayValue === value ? renderedDisplayValue : readMarkdownDataViewTableCellDisplayText(value, fieldLineMode)
                const renderedDisplayIsTruncated = renderedDisplayValue !== displayValue
                return (
                  <td
                    key={c.id}
                    className={cellBase}
                    onClick={(e) => {
                      const el = e.target as HTMLElement | null
                      if (el?.closest('a,button,input,select,textarea')) return
                      e.preventDefault()
                      e.stopPropagation()
                      startEdit(r.id, c.id, value, e.currentTarget)
                    }}
                    role={canMutate ? 'button' : undefined}
                  >
                    {renderMarkdownDataViewTableRichCell(value, { sourceLineNestedTable: c.name === 'Content' ? sourceLineNestedTableCells.get(r.id) : null }) || (uiType === 'checkbox' ? (
                      <span className={['inline-flex items-center gap-2', UI_THEME_TOKENS.text.primary].join(' ')}>
                        <input
                          type="checkbox"
                          checked={isTruthy(value)}
                          disabled={!canMutate}
                          onChange={e => {
                            if (!canMutate) return
                            onUpdateCell({ rowId: r.id, columnId: c.id, nextValue: e.target.checked ? 'true' : '' })
                          }}
                        />
                      </span>
                    ) : uiType === 'progress' && Number.isFinite(progressValue) ? (
                      <section className={`${UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME} gap-2`}>
                        <progress className={UI_RESPONSIVE_DATA_VIEW_TABLE_PROGRESS_CLASSNAME} value={Math.max(0, Math.min(100, progressValue))} max={100} />
                        <span className={['min-w-0', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.secondary].join(' ')}>{`${Math.round(Math.max(0, Math.min(100, progressValue)))}%`}</span>
                      </section>
                    ) : href ? (
                      <a className={[UI_RESPONSIVE_DATA_VIEW_TABLE_VALUE_CLASSNAME, fieldLineClassName, 'underline', UI_THEME_TOKENS.text.primary].join(' ')} href={href} target="_blank" rel="noreferrer" aria-label={renderedDisplayIsTruncated ? renderedDisplayValue : undefined}>
                        {renderedRawValue === value ? renderMarkdownSigilInlineText(value) : renderedDisplayValue}
                      </a>
                    ) : baseKind === 'select' && value ? (
                      <DataViewTagChip value={value} />
                    ) : baseKind === 'multi-select' && chips.length ? (
                      <section className={`${uiToolbarRowScrollClassName} gap-1`}>
                        {chips.map(v => (
                          <DataViewTagChip key={v} value={v} />
                        ))}
                      </section>
                    ) : (
                      <span className={[UI_RESPONSIVE_DATA_VIEW_TABLE_VALUE_CLASSNAME, fieldLineClassName, value ? '' : UI_THEME_TOKENS.text.tertiary].join(' ')} aria-label={renderedDisplayIsTruncated ? renderedDisplayValue : undefined}>
                        {value ? (renderedRawValue === value ? renderMarkdownSigilInlineText(value) : renderedDisplayValue) : (canMutate ? '—' : '')}
                      </span>
                    ))}
                  </td>
                )
              })}
              {canMutate && props.onAddColumn ? (
                <td className={`${headerPaddingClassName} border-b ${UI_THEME_TOKENS.table.cellBorder}`} />
              ) : null}
            </tr>
          })}
          {canMutate && props.onNewRecord ? (
            <tr>
              <td
                colSpan={visibleColumnMeta.length + (hasNestedRowHierarchy ? 1 : 0) + (canMutate && props.onAddColumn ? 1 : 0)}
                className={`${cellPaddingClassName} border-b ${UI_THEME_TOKENS.table.cellBorder}`}
              >
                <button
                  type="button"
                  className={[UI_RESPONSIVE_ACTION_ROW_CLASSNAME, 'gap-2 text-xs', UI_THEME_TOKENS.text.tertiary, UI_THEME_TOKENS.button.hoverBg, 'px-2 py-1 rounded'].join(' ')}
                  onClick={() => props.onNewRecord?.()}
                >
                  <Plus className={[UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME, UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
                  <span className={UI_TEXT_TRUNCATE}>{MARKDOWN_DATA_VIEW_COPY.newRecordLabel}</span>
                </button>
              </td>
            </tr>
          ) : null}
          {hiddenRowCount > 0 ? (
            <tr>
              <td
                colSpan={visibleColumnMeta.length + (hasNestedRowHierarchy ? 1 : 0) + (canMutate && props.onAddColumn ? 1 : 0)}
                className={`${cellPaddingClassName} border-b ${UI_THEME_TOKENS.table.cellBorder}`}
              >
                <button
                  type="button"
                  className={[UI_RESPONSIVE_ACTION_ROW_CLASSNAME, 'gap-2 text-xs', UI_THEME_TOKENS.text.secondary, UI_THEME_TOKENS.button.hoverBg, 'px-2 py-1 rounded'].join(' ')}
                  onClick={() => setRenderedRowLimit(limit => Math.min(view.rows.length, limit + MARKDOWN_DATA_VIEW_TABLE_RENDER_ROW_INCREMENT))}
                >
                  <span className={UI_TEXT_TRUNCATE}>{`Show ${Math.min(hiddenRowCount, MARKDOWN_DATA_VIEW_TABLE_RENDER_ROW_INCREMENT)} more rows`}</span>
                </button>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <MarkdownDataViewCellSelectPopover
        editingMeta={editingMeta}
        placement={workspaceCellSelectPanelPlacement}
        draft={draft}
        canMutate={canMutate}
        editingSelectOptions={editingSelectOptions}
        editingMultiSelectOptions={editingMultiSelectOptions}
        setDraft={setDraft}
        setEditingNull={() => setEditing(null)}
        onUpdateCell={onUpdateCell}
      />
    </section>
  )
})
