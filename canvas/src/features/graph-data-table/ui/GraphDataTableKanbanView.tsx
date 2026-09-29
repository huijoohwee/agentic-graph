import React from 'react'
import type { GraphRecordColumnDoc, GraphRecordTableId } from '@/lib/graph-record-db'
import type { GraphDataTableGridRow } from '@/features/graph-data-table/ui/graphDataTableTypes'
import type {
  GraphDataTableColumnVisibilityById,
  GraphDataTableFilterClause,
  GraphDataTableFilterMatch,
  GraphDataTableSortRule,
} from '@/features/graph-data-table/ui/graphDataTableViewState'
import { useGraphDataTableGridModel } from '@/features/graph-data-table/ui/fast-grid/useGraphDataTableGridModel'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import { readMarkdownSigilDisplayText } from '@/lib/markdown/markdownSigil'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import { useKanbanDragAndDrop } from '@/features/markdown/ui/kanban/useKanbanDragAndDrop'
import { KanbanCardDropPreview, KanbanLaneDragOverIndicator, KanbanLaneDropPreview } from '@/features/markdown/ui/kanban/KanbanDropPreview'
import { buildKanbanCardDropIntentLabel, buildKanbanDragStatusText, buildKanbanLaneDropIntentLabel } from '@/features/markdown/ui/kanban/kanbanDragIntent'
import { buildKanbanDropOutcomeText, isKanbanMoveNoOp } from '@/features/markdown/ui/kanban/kanbanMoveOutcomes'
import { reorderKanbanRowIds, resolveKanbanGroupOrder } from '@/features/markdown/ui/kanban/kanbanReorder'
import { getKanbanCardDragVisualState, getKanbanLaneDragVisualState } from '@/features/markdown/ui/kanban/kanbanDragVisualState'
import { isInteractiveEventTarget } from '@/features/markdown/ui/kanban/kanbanMenu'
import { buildCardParagraphEntries } from '@/lib/cards/cardParagraphs'
import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'
import { buildInlineMediaCommandContextFromRecord } from '@/lib/command-menu/inlineMediaCommandContext'
import {
  UI_RESPONSIVE_DATA_VIEW_KANBAN_CARD_LIST_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_KANBAN_STATUS_ROW_CLASSNAME,
  UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME,
  UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'

const EMPTY_COLUMN_WIDTHS: Record<string, number> = {}
const EMPTY_LANE_LABEL = '(empty)'
const TITLE_COLUMN_KEYS = ['label', 'title', 'name', 'heading'] as const
const SUMMARY_COLUMN_KEYS = ['summary', 'description', 'content', 'text', 'note', 'notes'] as const
const ACTION_COLUMN_KEYS = ['action', 'direction', 'instructions'] as const
const DIALOGUE_COLUMN_KEYS = ['dialogue', 'voiceover', 'narration'] as const
const PROMPT_COLUMN_KEYS = ['prompt', 'imagePrompt', 'visualPrompt'] as const

type LaneModel = {
  id: string
  label: string
  rows: readonly GraphDataTableGridRow[]
}

const getRowTitle = (row: GraphDataTableGridRow): string => {
  const anyRow = row as unknown as Record<string, unknown>
  const title = typeof anyRow.title === 'string' ? anyRow.title.trim() : ''
  if (title) return title
  const label = typeof anyRow.label === 'string' ? anyRow.label.trim() : ''
  if (label) return label
  const name = typeof anyRow.name === 'string' ? anyRow.name.trim() : ''
  if (name) return name
  const heading = typeof anyRow.heading === 'string' ? anyRow.heading.trim() : ''
  if (heading) return heading
  return row.id
}

const isVisibleTextColumn = (column: GraphRecordColumnDoc, columnVisibilityById: GraphDataTableColumnVisibilityById): boolean => {
  if (column.kind !== 'text') return false
  if (column.hidden) return false
  if (columnVisibilityById[column.columnId] === false) return false
  return true
}

const findEditableColumn = (
  columns: readonly GraphRecordColumnDoc[],
  columnVisibilityById: GraphDataTableColumnVisibilityById,
  keys: readonly string[],
): GraphRecordColumnDoc | null => {
  for (const key of keys) {
    const direct = columns.find(column => column.columnId === key)
    if (direct && isVisibleTextColumn(direct, columnVisibilityById)) return direct
  }
  for (const key of keys) {
    const byName = columns.find(column => column.name === key)
    if (byName && isVisibleTextColumn(byName, columnVisibilityById)) return byName
  }
  return null
}

const getRowMeta = (row: GraphDataTableGridRow, tableId: GraphRecordTableId): string => {
  const anyRow = row as unknown as Record<string, unknown>
  if (tableId === 'edges') {
    const source = typeof anyRow.source === 'string' ? anyRow.source.trim() : ''
    const target = typeof anyRow.target === 'string' ? anyRow.target.trim() : ''
    if (source || target) return [source, target].filter(Boolean).join(' → ')
  }
  return ''
}

const getRowParagraphEntries = (
  row: GraphDataTableGridRow,
  columns: readonly GraphRecordColumnDoc[],
  columnVisibilityById: GraphDataTableColumnVisibilityById,
) => {
  const anyRow = row as unknown as Record<string, unknown>
  const summaryColumn = findEditableColumn(columns, columnVisibilityById, SUMMARY_COLUMN_KEYS)
  const actionColumn = findEditableColumn(columns, columnVisibilityById, ACTION_COLUMN_KEYS)
  const dialogueColumn = findEditableColumn(columns, columnVisibilityById, DIALOGUE_COLUMN_KEYS)
  const promptColumn = findEditableColumn(columns, columnVisibilityById, PROMPT_COLUMN_KEYS)
  return buildCardParagraphEntries([
    { id: summaryColumn?.columnId || '', label: summaryColumn?.name || 'Summary', value: summaryColumn ? anyRow[summaryColumn.columnId] : '' },
    { id: actionColumn?.columnId || '', label: actionColumn?.name || 'Action', value: actionColumn ? anyRow[actionColumn.columnId] : '' },
    { id: dialogueColumn?.columnId || '', label: dialogueColumn?.name || 'Dialogue', value: dialogueColumn ? anyRow[dialogueColumn.columnId] : '' },
    { id: promptColumn?.columnId || '', label: promptColumn?.name || 'Prompt', value: promptColumn ? anyRow[promptColumn.columnId] : '' },
  ], { excludeUrlLike: true })
}

export const GraphDataTableKanbanView = React.memo(function GraphDataTableKanbanView(props: {
  tableId: GraphRecordTableId
  columns: GraphRecordColumnDoc[]
  rows: GraphDataTableGridRow[]
  columnVisibilityById: GraphDataTableColumnVisibilityById
  filterMatch: GraphDataTableFilterMatch
  filterClauses: GraphDataTableFilterClause[]
  groupBy: string
  sortRules: GraphDataTableSortRule[]
  columnOrderIds?: string[]
  selectedRowIds: readonly string[]
  onRowClicked: (rowId: string) => void
  onUpdateCell?: (rowId: string, columnId: string, nextValue: unknown) => void
  onMoveRowToGroup?: (args: {
    rowId: string
    columnId: string
    nextValue: string
    orderedRowIds: readonly string[]
  }) => void
}) {
  const typography = usePanelTypography()
  const selectedSet = React.useMemo(() => new Set(props.selectedRowIds), [props.selectedRowIds])
  const boardScrollRef = React.useRef<HTMLElement>(null)
  const laneScrollElementsRef = React.useRef(new Map<string, HTMLUListElement>())

  const { displayRows } = useGraphDataTableGridModel({
    columns: props.columns,
    rows: props.rows,
    columnVisibilityById: props.columnVisibilityById,
    filterMatch: props.filterMatch,
    filterClauses: props.filterClauses,
    groupBy: props.groupBy,
    sortRules: props.sortRules,
    columnWidthsPxById: EMPTY_COLUMN_WIDTHS,
    columnOrderIds: props.columnOrderIds,
    headerHeight: 32,
    rowHeight: 32,
    selectedRowIds: Array.from(selectedSet),
  })

  const lanes = React.useMemo<LaneModel[]>(() => {
    if (!props.groupBy) {
      const rows = displayRows.filter(r => r.kind === 'row').map(r => r.row)
      return [{ id: 'all', label: 'All', rows }]
    }

    const byLabel = new Map<string, GraphDataTableGridRow[]>()
    for (const item of displayRows) {
      if (item.kind !== 'row') continue
      const label = item.groupLabel || EMPTY_LANE_LABEL
      const existing = byLabel.get(label)
      if (existing) existing.push(item.row)
      else byLabel.set(label, [item.row])
    }
    const encounteredGroupOrder = Array.from(byLabel.keys())
    const laneOrder = resolveKanbanGroupOrder({
      configuredGroupOrder: null,
      encounteredGroupOrder,
    })
    return laneOrder.map(label => ({ id: label, label, rows: byLabel.get(label) || [] }))
  }, [displayRows, props.columns, props.groupBy])

  const rowIdToGroupKey = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const lane of lanes) {
      for (const row of lane.rows) map.set(row.id, lane.id)
    }
    return map
  }, [lanes])
  const groupToRowIds = React.useMemo(() => {
    const map = new Map<string, readonly string[]>()
    for (const lane of lanes) {
      map.set(lane.id, lane.rows.map(row => row.id))
    }
    return map
  }, [lanes])

  const orderedRowIds = React.useMemo(() => props.rows.map(row => row.id), [props.rows])
  const rowIdToTitle = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const row of props.rows) {
      map.set(row.id, getRowTitle(row))
    }
    return map
  }, [props.rows])

  const kanbanDrag = useKanbanDragAndDrop({
    enabled: !!props.groupBy && typeof props.onMoveRowToGroup === 'function',
    getBoardScrollElement: () => boardScrollRef.current,
    getLaneScrollElement: groupKey => laneScrollElementsRef.current.get(groupKey) || null,
    isNoOpMove: move => isKanbanMoveNoOp({
      groupToRowIds,
      draggedRowId: move.rowId,
      sourceGroupKey: move.sourceGroupKey,
      targetGroupKey: move.targetGroupKey,
      targetRowId: move.targetRowId,
      position: move.position,
    }),
    buildOutcomeMessage: ({ kind, move, sourceGroupKey, blockedReason }) => buildKanbanDropOutcomeText({
      kind,
      sourceLaneLabel: sourceGroupKey || move?.sourceGroupKey || null,
      targetLaneLabel: move?.targetGroupKey || null,
      targetCardLabel: move?.targetRowId ? rowIdToTitle.get(move.targetRowId) || move.targetRowId : null,
      blockedReason,
    }),
    onCommitMove: ({ rowId, targetGroupKey, targetRowId, position }) => {
      if (!props.groupBy || !props.onMoveRowToGroup) return
      const nextOrderedRowIds = reorderKanbanRowIds({
        orderedRowIds,
        availableRowIds: props.rows.map(row => row.id),
        rowIdToGroupKey,
        draggedRowId: rowId,
        targetGroupKey,
        targetRowId,
        position,
      })
      props.onMoveRowToGroup({
        rowId,
        columnId: props.groupBy,
        nextValue: targetGroupKey === EMPTY_LANE_LABEL ? '' : targetGroupKey,
        orderedRowIds: nextOrderedRowIds,
      })
    },
  })

  const handleKeyboardMove = React.useCallback((args: { rowId: string; direction: 'up' | 'down' | 'left' | 'right' }): boolean => {
    if (!props.groupBy || !props.onMoveRowToGroup) return false
    const currentGroupKey = rowIdToGroupKey.get(args.rowId) || EMPTY_LANE_LABEL
    const currentLane = lanes.find(lane => lane.id === currentGroupKey) || null
    if (!currentLane) return false
    const currentIndex = currentLane.rows.findIndex(row => row.id === args.rowId)
    if (currentIndex < 0) return false

    if (args.direction === 'up' || args.direction === 'down') {
      if (args.direction === 'up' && currentIndex === 0) {
        kanbanDrag.reportBlockedMove({
          rowId: args.rowId,
          sourceGroupKey: currentLane.id,
          reason: 'start-of-lane',
        })
        return true
      }
      if (args.direction === 'down' && currentIndex === currentLane.rows.length - 1) {
        kanbanDrag.reportBlockedMove({
          rowId: args.rowId,
          sourceGroupKey: currentLane.id,
          reason: 'end-of-lane',
        })
        return true
      }
      const delta = args.direction === 'up' ? -1 : 1
      const neighbor = currentLane.rows[currentIndex + delta] || null
      kanbanDrag.commitMove({
        rowId: args.rowId,
        sourceGroupKey: currentLane.id,
        targetGroupKey: currentLane.id,
        targetRowId: neighbor?.id ?? null,
        position: neighbor ? (args.direction === 'up' ? 'before' : 'after') : 'end',
      })
      return true
    }

    const laneIndex = lanes.findIndex(lane => lane.id === currentLane.id)
    const nextLane = lanes[laneIndex + (args.direction === 'left' ? -1 : 1)] || null
    if (!nextLane) {
      kanbanDrag.reportBlockedMove({
        rowId: args.rowId,
        sourceGroupKey: currentLane.id,
        reason: args.direction === 'left' ? 'start-of-board' : 'end-of-board',
      })
      return true
    }
    kanbanDrag.commitMove({
      rowId: args.rowId,
      sourceGroupKey: currentLane.id,
      targetGroupKey: nextLane.id,
      targetRowId: null,
      position: 'end',
    })
    return true
  }, [kanbanDrag, lanes, props.groupBy, props.onMoveRowToGroup, rowIdToGroupKey])

  const activeDragStatusText = buildKanbanDragStatusText({
    sourceLaneLabel: kanbanDrag.dragSourceGroupKey,
    targetLaneLabel: kanbanDrag.dragOverGroupKey,
    targetCardLabel: kanbanDrag.dragOverRowId ? rowIdToTitle.get(kanbanDrag.dragOverRowId) || kanbanDrag.dragOverRowId : null,
    position: kanbanDrag.dragOverPosition,
    isDragging: kanbanDrag.draggingRowId !== null,
  })
  const statusPillText = activeDragStatusText || kanbanDrag.dragOutcomeMessage
  const liveRegionKey = [
    kanbanDrag.dragOutcomeSequence,
    kanbanDrag.draggingRowId || '',
    kanbanDrag.dragOverGroupKey || '',
    kanbanDrag.dragOverRowId || '',
    kanbanDrag.dragOverPosition,
    statusPillText || '',
  ].join(':')

  return (
    <section ref={boardScrollRef} className="flex-1 min-h-0 min-w-0 max-w-full overflow-x-auto overflow-y-auto" aria-label={MARKDOWN_DATA_VIEW_COPY.kanbanViewAriaLabel}>
      <section key={liveRegionKey} className="sr-only" aria-live="polite">{statusPillText}</section>
      {props.onMoveRowToGroup ? (
        <section className="flex items-center justify-between gap-3 px-3 pt-3">
          <section className={[UI_RESPONSIVE_DATA_VIEW_KANBAN_STATUS_ROW_CLASSNAME, 'text-xs', UI_THEME_TOKENS.text.secondary].join(' ')}>
            {statusPillText ? (
              <span className={['inline-flex items-center rounded-full border px-2.5 py-1', UI_THEME_TOKENS.panel.border].join(' ')}>
                {statusPillText}
              </span>
            ) : null}
          </section>
        </section>
      ) : null}
      <section className="min-h-0 min-w-0 max-w-full flex items-start gap-3 p-3" role="list">
        {lanes.map(lane => {
          const laneDragVisualState = getKanbanLaneDragVisualState({
            hasActiveDrag: kanbanDrag.draggingRowId !== null,
            isDragOver: kanbanDrag.dragOverGroupKey === lane.id && kanbanDrag.dragSourceGroupKey !== lane.id,
            isSourceLane: kanbanDrag.dragSourceGroupKey === lane.id,
            isCommitFlash: kanbanDrag.commitFlashGroupKey === lane.id,
          })
          return (
          <section
            key={lane.id}
            className={[
              'kg-graph-data-table-kanban-lane relative shrink-0 rounded border flex flex-col max-h-full overflow-hidden transition-colors',
              laneDragVisualState.className,
              UI_THEME_TOKENS.panel.border,
              UI_THEME_TOKENS.panel.bg,
            ].join(' ')}
            style={laneDragVisualState.style}
            aria-label={`Lane ${readMarkdownSigilDisplayText(lane.label)}`}
            onDragEnter={kanbanDrag.createLaneDropProps(lane.id).onDragEnter}
            onDragOver={kanbanDrag.createLaneDropProps(lane.id).onDragOver}
            onDragLeave={kanbanDrag.createLaneDropProps(lane.id).onDragLeave}
            onDrop={kanbanDrag.createLaneDropProps(lane.id).onDrop}
          >
            {kanbanDrag.dragOverGroupKey === lane.id && kanbanDrag.dragSourceGroupKey !== lane.id ? <KanbanLaneDragOverIndicator /> : null}
            <header className={['px-3 py-2 border-b', UI_THEME_TOKENS.panel.border].join(' ')}>
              <section className={['flex min-w-0 max-w-full items-center justify-between gap-2 overflow-hidden', typography.microLabelClass].join(' ')}>
                <h2 className={['min-w-0 font-medium', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.primary].join(' ')} title={readMarkdownSigilDisplayText(lane.label)}>
                  {renderMarkdownSigilInlineText(lane.label)}
                </h2>
                <output className={UI_THEME_TOKENS.text.tertiary}>{lane.rows.length}</output>
              </section>
            </header>

            <ul
              ref={element => {
                if (element) {
                  laneScrollElementsRef.current.set(lane.id, element)
                  return
                }
                laneScrollElementsRef.current.delete(lane.id)
              }}
              className={`${UI_RESPONSIVE_DATA_VIEW_KANBAN_CARD_LIST_CLASSNAME} flex-1 min-h-0`}
              aria-label={`${readMarkdownSigilDisplayText(lane.label)} cards`}
            >
              {lane.rows.map(row => {
                const selected = selectedSet.has(row.id)
                const title = getRowTitle(row)
                const displayTitle = readMarkdownSigilDisplayText(title)
                const meta = getRowMeta(row, props.tableId)
                const displayMeta = readMarkdownSigilDisplayText(meta)
                const paragraphEntries = getRowParagraphEntries(row, props.columns, props.columnVisibilityById)
                const titleColumn = findEditableColumn(props.columns, props.columnVisibilityById, TITLE_COLUMN_KEYS)
                const cardDragVisualState = getKanbanCardDragVisualState({
                  hasActiveDrag: kanbanDrag.draggingRowId !== null,
                  isDragging: kanbanDrag.draggingRowId === row.id,
                  isDropTarget: kanbanDrag.dragOverRowId === row.id,
                  isCommitFlash: kanbanDrag.commitFlashRowId === row.id,
                })
                const cardDragProps = kanbanDrag.createCardDragProps({ rowId: row.id, groupKey: lane.id })
                const cardDropProps = kanbanDrag.createCardDropProps({ rowId: row.id, groupKey: lane.id })
                const rowInlineMediaCommandContext = buildInlineMediaCommandContextFromRecord(row)
                return (
                  <li key={row.id} className="list-none">
                    <article
                      ref={element => {
                        kanbanDrag.registerFocusableRowElement({
                          rowId: row.id,
                          element,
                        })
                      }}
                      className={[
                        'group relative w-full min-w-0 max-w-full overflow-hidden text-left rounded border px-3 py-2 transition-transform transition-shadow duration-150 ease-out',
                        typography.microLabelClass,
                        cardDragVisualState.className,
                        kanbanDrag.draggingRowId !== row.id ? 'hover:-translate-y-[1px] active:translate-y-0' : '',
                        selected ? `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}` : `${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`,
                        UI_THEME_TOKENS.panel.border,
                      ].join(' ')}
                      style={cardDragVisualState.style}
                      tabIndex={0}
                      role="button"
                      aria-current={selected ? 'true' : undefined}
                      aria-grabbed={cardDragProps.draggable ? kanbanDrag.draggingRowId === row.id : undefined}
                      title={displayTitle}
                      draggable={cardDragProps.draggable}
                      onDragStart={cardDragProps.onDragStart}
                      onDragEnd={cardDragProps.onDragEnd}
                      onDragEnter={cardDropProps.onDragEnter}
                      onDragOver={cardDropProps.onDragOver}
                      onDragLeave={cardDropProps.onDragLeave}
                      onDrop={cardDropProps.onDrop}
                      onKeyDown={event => {
                        if (isInteractiveEventTarget(event.target)) return
                        if ((event.key === 'Enter' || event.key === ' ') && !event.altKey && !event.metaKey) {
                          event.preventDefault()
                          props.onRowClicked(row.id)
                          return
                        }
                        if (!props.onMoveRowToGroup || (!event.altKey && !event.metaKey)) return
                        const direction =
                          event.key === 'ArrowUp'
                            ? 'up'
                            : event.key === 'ArrowDown'
                              ? 'down'
                              : event.key === 'ArrowLeft'
                                ? 'left'
                                : event.key === 'ArrowRight'
                                  ? 'right'
                                  : null
                        if (!direction) return
                        const handled = handleKeyboardMove({ rowId: row.id, direction })
                        if (!handled) return
                        event.preventDefault()
                      }}
                      onClick={event => {
                        if (isInteractiveEventTarget(event.target)) return
                        props.onRowClicked(row.id)
                      }}
                    >
                      {kanbanDrag.dragOverRowId === row.id ? (
                        <KanbanCardDropPreview
                          position={kanbanDrag.dragOverPosition}
                          label={buildKanbanCardDropIntentLabel({
                            position: kanbanDrag.dragOverPosition,
                            targetCardLabel: rowIdToTitle.get(row.id) || row.id,
                            targetLaneLabel: lane.label,
                          })}
                        />
                      ) : null}
                      <CardInlineTextEditor
                        value={title}
                        ariaLabel={`Title for ${row.id}`}
                        placeholder="Add title"
                        canEdit={!!props.onUpdateCell && !!titleColumn}
                        onCommit={nextValue => {
                          if (!props.onUpdateCell || !titleColumn) return
                          props.onUpdateCell(row.id, titleColumn.columnId, nextValue)
                        }}
                        displayClassName={['font-medium', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.primary].join(' ')}
                        editorClassName={`${UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME} text-sm font-medium leading-5`}
                      />
                      {meta ? (
                        <section className={['mt-1', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.tertiary].join(' ')} title={displayMeta}>
                          {renderMarkdownSigilInlineText(meta)}
                        </section>
                      ) : null}
                      {paragraphEntries.length ? (
                        <section className="mt-2 flex flex-col gap-2">
                          {paragraphEntries.map(entry => {
                            const displayValue = readMarkdownSigilDisplayText(entry.value)
                            return (
                              <section key={`${row.id}:${entry.id}`} className="rounded border border-black/5 bg-black/[0.025] px-2.5 py-2">
                                <p className={['m-0 text-xs font-semibold uppercase tracking-normal', UI_THEME_TOKENS.text.tertiary].join(' ')}>
                                  {entry.label}
                                </p>
                                <CardInlineTextEditor
                                  value={entry.value}
                                  ariaLabel={`${entry.label} for ${row.id}`}
                                  placeholder={`Add ${entry.label.toLowerCase()}`}
                                  canEdit={!!props.onUpdateCell}
                                  multiline
                                  markdownPreview="auto"
                                  markdownCommandContextText={rowInlineMediaCommandContext}
                                  rows={3}
                                  onCommit={nextValue => {
                                    if (!props.onUpdateCell) return
                                    props.onUpdateCell(row.id, entry.id, nextValue)
                                  }}
                                  displayClassName={['m-0 mt-1 text-xs leading-5', UI_THEME_TOKENS.text.secondary].join(' ')}
                                  editorClassName={`mt-1 ${UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME} text-xs leading-5`}
                                />
                              </section>
                            )
                          })}
                        </section>
                      ) : null}
                      <section className={['mt-1', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.tertiary].join(' ')}>{row.id}</section>
                    </article>
                  </li>
                )
              })}
              {kanbanDrag.draggingRowId !== null && kanbanDrag.dragOverGroupKey === lane.id && kanbanDrag.dragOverRowId === null ? (
                <li className="list-none">
                  <KanbanLaneDropPreview label={buildKanbanLaneDropIntentLabel({ targetLaneLabel: lane.label })} compact />
                </li>
              ) : null}
            </ul>
          </section>
          )
        })}
      </section>
    </section>
  )
})
