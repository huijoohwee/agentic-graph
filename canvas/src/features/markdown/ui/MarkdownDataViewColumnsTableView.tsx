import React from 'react'
import type { MarkdownDataView } from './markdownDataViewModel'
import type { MarkdownDataViewColumnType } from './markdownDataViewColumnType'
import {
  columnTypeToBaseKind,
  defaultColumnTypeForInferredKind,
  labelForMarkdownDataViewColumnType,
} from './markdownDataViewColumnType'
import { DataViewTagChip } from './MarkdownDataViewChips'
import { MarkdownDataViewMultiTagSelect } from './MarkdownDataViewMultiTagSelect'
import { MarkdownDataViewSingleSelect } from './MarkdownDataViewSingleSelect'
import { MarkdownDataViewColumnTypeMenu } from './MarkdownDataViewColumnTypeMenu'
import { iconByColumnType } from './markdownDataViewColumnTypeMenuIcons'
import { ColumnHeaderPropertyTypeMenu } from '@/components/ui/ColumnHeaderPropertyTypeMenu'
import { ColumnHeaderMenu } from '@/components/ui/ColumnHeaderMenu'
import { Type } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { uiToolbarRowScrollClassName } from '@/features/toolbar/ui/toolbarStyles'
import { UI_RESPONSIVE_ACTION_ROW_CLASSNAME, UI_RESPONSIVE_DATA_VIEW_TABLE_PROGRESS_CLASSNAME, UI_RESPONSIVE_DATA_VIEW_TABLE_VALUE_CLASSNAME, UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME, UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import { readMarkdownSigilDisplayText } from '@/lib/markdown/markdownSigil'
import { buildInlineMediaCommandContextFromRecord } from '@/lib/command-menu/inlineMediaCommandContext'
import { renderMarkdownDataViewTableRichCell, type SourceLineNestedTableCell } from './MarkdownDataViewImageCell'
import { MarkdownDataViewHierarchyCell } from './MarkdownDataViewHierarchyCell'
import { MarkdownDataViewInlineTextCellEditor } from './MarkdownDataViewInlineTextCellEditor'
import { MarkdownDataViewNestedRowsBulkToggle } from './MarkdownDataViewNestedRowsBulkToggle'
import { MarkdownDataViewColumnResizeHandle } from './MarkdownDataViewColumnResizeHandle'
import { splitMultiValues } from './markdownDataViewValueUtils'
import { MarkdownDataViewTableCore, dataViewTableHeaderClassName, dataViewTableCellClassName, MARKDOWN_DATA_VIEW_TABLE_RENDER_ROW_INCREMENT } from './MarkdownDataViewTableCore'
import { readMarkdownDataViewTableCellDisplayText, readMarkdownDataViewTableCellPreviewText } from './markdownDataViewCellPreview'
import type { DataViewFieldLineMode } from '@/lib/ui/dataViewDensity'

const MARKDOWN_DATA_VIEW_FIELD_COLUMN_ID = '__field'

type VisibleColumnMeta = { col: MarkdownDataView['columns'][number]; index: number }
type VisibleNestedRowState = { row: MarkdownDataView['rows'][number]; depth: number; childCount: number }
type EditingState = { rowId: string; colId: string; anchorEl: HTMLElement } | null

const isTruthy = (raw: string): boolean => {
  const v = String(raw || '').trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes' || v === 'x'
}

const safeLinkHref = (raw: string): string | null => {
  const v = String(raw || '').trim()
  const lower = v.toLowerCase()
  return lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:') ? v : null
}

export function MarkdownDataViewColumnsTableView(props: {
  view: MarkdownDataView
  visibleColumnMeta: VisibleColumnMeta[]
  visibleNestedRowStates: VisibleNestedRowState[]
  sourceLineNestedTableCells: ReadonlyMap<string, SourceLineNestedTableCell>
  hiddenRowCount: number
  titleColumnIndex: number
  hasNestedRowHierarchy: boolean
  areAllNestedRowsCollapsed: boolean
  collapsedNestedRowIds: ReadonlySet<string>
  columnTypesById?: Record<string, MarkdownDataViewColumnType> | null
  canConfigure: boolean
  canMutate: boolean
  editing: EditingState
  cellPaddingClassName: string
  headerPaddingClassName: string
  fieldLineClassName: string
  fieldLineMode: DataViewFieldLineMode
  readColumnWidth: (columnId: string, fallback?: number) => number
  previewColumnResize: (columnId: string, width: number) => void
  commitColumnResize: (columnId: string, width: number) => void
  setRenderedRowLimit: React.Dispatch<React.SetStateAction<number>>
  startEdit: (rowId: string, colId: string, current: string, anchorEl: HTMLElement) => void
  handleInlineTextCommit: (rowId: string, colId: string, nextValue: string) => void
  cancel: () => void
  toggleAllNestedRows: () => void
  toggleNestedRow: (rowId: string) => void
  onUpdateCell: (args: { rowId: string; columnId: string; nextValue: string }) => void
  onChangeColumnType?: (args: { columnId: string; nextType: MarkdownDataViewColumnType }) => void
  onHideColumnInView?: (columnId: string) => void
  onUpsertColumnFilter?: (args: { columnId: string; columnKind: MarkdownDataView['columns'][number]['kind']; op: 'contains' | 'equals' | 'includes'; value: string }) => void
}) {
  const tableWidth = props.readColumnWidth(MARKDOWN_DATA_VIEW_FIELD_COLUMN_ID, 168)
    + props.visibleNestedRowStates.reduce((sum, { row }) => sum + props.readColumnWidth(`row:${row.id}`), 0)
  return (
    <MarkdownDataViewTableCore
      columns={[
        { id: MARKDOWN_DATA_VIEW_FIELD_COLUMN_ID, width: props.readColumnWidth(MARKDOWN_DATA_VIEW_FIELD_COLUMN_ID, 168) },
        ...props.visibleNestedRowStates.map(({ row }) => ({ id: `row:${row.id}`, width: props.readColumnWidth(`row:${row.id}`) })),
      ]}
      rows={props.visibleColumnMeta}
      rowKey={({ col }) => col.id}
      tableStyle={{ width: tableWidth }}
      renderHeader={() => <>
            <th className={dataViewTableHeaderClassName(props.headerPaddingClassName)}>
              Field
              <MarkdownDataViewColumnResizeHandle columnId={MARKDOWN_DATA_VIEW_FIELD_COLUMN_ID} width={props.readColumnWidth(MARKDOWN_DATA_VIEW_FIELD_COLUMN_ID, 168)} onPreview={props.previewColumnResize} onCommit={props.commitColumnResize} />
            </th>
            {props.visibleNestedRowStates.map(({ row }, rowIndex) => {
              const label = String(row.cells[props.titleColumnIndex] ?? '').trim() || `Row ${rowIndex + 1}`
              const columnId = `row:${row.id}`
              return (
                <th key={row.id} className={dataViewTableHeaderClassName(props.headerPaddingClassName)}>
                  <span className={[UI_TEXT_TRUNCATE, 'block max-w-[14rem]'].join(' ')}>{readMarkdownDataViewTableCellPreviewText(label)}</span>
                  <MarkdownDataViewColumnResizeHandle columnId={columnId} width={props.readColumnWidth(columnId)} onPreview={props.previewColumnResize} onCommit={props.commitColumnResize} />
                </th>
              )
            })}
      </>}
      beforeRows={<>
          {props.hasNestedRowHierarchy ? (
            <tr data-kg-markdown-data-view-column-record-hierarchy-row="1">
              <th className={dataViewTableHeaderClassName(props.headerPaddingClassName, false)}>
                <span className={`${UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME} gap-1`}><MarkdownDataViewNestedRowsBulkToggle collapsed={props.areAllNestedRowsCollapsed} onToggle={props.toggleAllNestedRows} /><span>Hierarchy</span></span>
              </th>
              {props.visibleNestedRowStates.map(({ row, depth, childCount }) => (
                <MarkdownDataViewHierarchyCell key={`column-record-hierarchy:${row.id}`} cellPaddingClassName={props.cellPaddingClassName} depth={depth} childCount={childCount} collapsed={props.collapsedNestedRowIds.has(row.id)} scope="columnRecord" onToggle={() => props.toggleNestedRow(row.id)} />
              ))}
            </tr>
          ) : null}

      </>}
      renderCells={({ col: column, index: colIndex }) => {
            const type = (props.columnTypesById && props.columnTypesById[column.id]) || defaultColumnTypeForInferredKind(column.kind)
            const Icon = iconByColumnType[type] || Type
            const allowTypeEdit = Boolean(props.canConfigure && props.onChangeColumnType)
            const filterOps = column.kind === 'multi-select'
              ? [{ key: 'includes', label: 'includes' }, { key: 'contains', label: 'contains' }, { key: 'equals', label: 'equals' }]
              : column.kind === 'select'
                ? [{ key: 'equals', label: 'equals' }, { key: 'contains', label: 'contains' }]
                : [{ key: 'contains', label: 'contains' }, { key: 'equals', label: 'equals' }]

        return <>
                <th className={dataViewTableHeaderClassName(props.headerPaddingClassName, false)}>
                  <ColumnHeaderPropertyTypeMenu ariaLabel={`Column type: ${column.name}`} label={column.name} Icon={Icon} portal portalPlacement="bottom-start" toggleTargets="icon+chevron" menu={({ close }) => (
                    <ColumnHeaderMenu
                      ariaLabel={`Column menu: ${column.name}`} closeMenu={close} typeSummaryLabel="Type" typeValueLabel={labelForMarkdownDataViewColumnType(type)} disableTypeChange={!allowTypeEdit}
                      renderTypeMenu={() => <MarkdownDataViewColumnTypeMenu ariaLabel={`Column type: ${column.name}`} value={type} close={close} disabled={!allowTypeEdit} onSelect={(next) => { if (allowTypeEdit) props.onChangeColumnType?.({ columnId: column.id, nextType: next }) }} />}
                      onHideInView={props.canConfigure && props.onHideColumnInView ? () => props.onHideColumnInView?.(column.id) : undefined}
                      filter={props.canConfigure && props.onUpsertColumnFilter ? { ops: filterOps, defaultOp: filterOps[0]?.key || 'contains', onApply: ({ op, value }) => props.onUpsertColumnFilter?.({ columnId: column.id, columnKind: column.kind, op: (op === 'includes' ? 'includes' : op === 'equals' ? 'equals' : 'contains'), value }) } : undefined}
                      disableSort disableInsert disableDuplicate disableDelete disableMoveLeft disableMoveRight
                    />
                  )} />
                </th>
                {props.visibleNestedRowStates.map(({ row }) => {
                  const value = String(row.cells[colIndex] ?? '')
                  const uiType = (props.columnTypesById && props.columnTypesById[column.id]) || defaultColumnTypeForInferredKind(column.kind)
                  const baseKind = columnTypeToBaseKind(uiType)
                  const isEditing = props.editing?.rowId === row.id && props.editing?.colId === column.id
                  const cellBase = dataViewTableCellClassName(props.cellPaddingClassName)
                  if (isEditing) {
                    return (
                      <td key={`${row.id}:${column.id}`} className={cellBase}>
                        <MarkdownDataViewInlineTextCellEditor key={`${row.id}:${column.id}`} ariaLabel={`Edit ${column.name}`} initialValue={value} textClassName={UI_THEME_TOKENS.text.primary} markdownCommandContextText={buildInlineMediaCommandContextFromRecord(row)} onCommit={(next) => props.handleInlineTextCommit(row.id, column.id, next)} onCancel={props.cancel} />
                      </td>
                    )
                  }
                  const displayValue = readMarkdownSigilDisplayText(value)
                  const renderedDisplayValue = readMarkdownDataViewTableCellDisplayText(displayValue, props.fieldLineMode)
                  const renderedRawValue = displayValue === value ? renderedDisplayValue : readMarkdownDataViewTableCellDisplayText(value, props.fieldLineMode)
                  const chips = baseKind === 'multi-select' ? splitMultiValues(value) : []
                  const href = uiType === 'link' ? safeLinkHref(value) : null
                  const progressValue = uiType === 'progress' ? Number(value) : NaN
                  return (
                    <td key={`${row.id}:${column.id}`} className={cellBase} onClick={(event) => { const el = event.target as HTMLElement | null; if (el?.closest('a,button,input,select,textarea')) return; event.preventDefault(); event.stopPropagation(); props.startEdit(row.id, column.id, value, event.currentTarget) }} role={props.canMutate ? 'button' : undefined}>
                      {renderMarkdownDataViewTableRichCell(value, { sourceLineNestedTable: column.name === 'Content' ? props.sourceLineNestedTableCells.get(row.id) : null }) || (uiType === 'checkbox' ? (
                        <input type="checkbox" checked={isTruthy(value)} disabled={!props.canMutate} onChange={event => { if (props.canMutate) props.onUpdateCell({ rowId: row.id, columnId: column.id, nextValue: event.target.checked ? 'true' : '' }) }} />
                      ) : uiType === 'progress' && Number.isFinite(progressValue) ? (
                        <section className={`${UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME} gap-2`}><progress className={UI_RESPONSIVE_DATA_VIEW_TABLE_PROGRESS_CLASSNAME} value={Math.max(0, Math.min(100, progressValue))} max={100} /><span className={['min-w-0', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.secondary].join(' ')}>{`${Math.round(Math.max(0, Math.min(100, progressValue)))}%`}</span></section>
                      ) : href ? (
                        <a className={[UI_RESPONSIVE_DATA_VIEW_TABLE_VALUE_CLASSNAME, props.fieldLineClassName, 'underline', UI_THEME_TOKENS.text.primary].join(' ')} href={href} target="_blank" rel="noreferrer">{renderedRawValue === value ? renderMarkdownSigilInlineText(value) : renderedDisplayValue}</a>
                      ) : baseKind === 'select' && value ? <DataViewTagChip value={value} /> : baseKind === 'multi-select' && chips.length ? (
                        <section className={`${uiToolbarRowScrollClassName} gap-1`}>{chips.map(v => <DataViewTagChip key={v} value={v} />)}</section>
                      ) : (
                        <span className={[UI_RESPONSIVE_DATA_VIEW_TABLE_VALUE_CLASSNAME, props.fieldLineClassName, value ? '' : UI_THEME_TOKENS.text.tertiary].join(' ')}>{value ? (renderedRawValue === value ? renderMarkdownSigilInlineText(value) : renderedDisplayValue) : (props.canMutate ? '—' : '')}</span>
                      ))}
                    </td>
                  )
                })}
        </>
      }}
      afterRows={<>
          {props.hiddenRowCount > 0 ? (
            <tr>
              <td colSpan={props.visibleNestedRowStates.length + 1} className={`${props.cellPaddingClassName} border-b ${UI_THEME_TOKENS.table.cellBorder}`}>
                <button type="button" className={[UI_RESPONSIVE_ACTION_ROW_CLASSNAME, 'gap-2 text-xs', UI_THEME_TOKENS.text.secondary, UI_THEME_TOKENS.button.hoverBg, 'px-2 py-1 rounded'].join(' ')} onClick={() => props.setRenderedRowLimit(limit => Math.min(props.view.rows.length, limit + MARKDOWN_DATA_VIEW_TABLE_RENDER_ROW_INCREMENT))}>
                  <span className={UI_TEXT_TRUNCATE}>{`Show ${Math.min(props.hiddenRowCount, MARKDOWN_DATA_VIEW_TABLE_RENDER_ROW_INCREMENT)} more columns`}</span>
                </button>
              </td>
            </tr>
          ) : null}
      </>}
    />
  )
}
