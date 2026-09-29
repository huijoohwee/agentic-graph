import React from 'react'
import type { MarkdownDataView, MarkdownDataViewRow } from '../markdownDataViewModel'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { DataViewTagChip } from '../MarkdownDataViewChips'
import { KanbanCard } from './KanbanCard'
import { KanbanLaneDragOverIndicator, KanbanLaneDropPreview } from './KanbanDropPreview'
import { KanbanNewRecordDividerRow } from './KanbanNewRecordDividerRow'
import { getKanbanLaneDragVisualState } from './kanbanDragVisualState'
import type { KanbanCardDragProps, KanbanCardDropProps, KanbanLaneDropProps } from './useKanbanDragAndDrop'
import {
  UI_RESPONSIVE_DATA_VIEW_KANBAN_CARD_LIST_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_KANBAN_GROUP_CLASSNAME,
  UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME,
  UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import type { KanbanDropPosition } from './kanbanReorder'

export type KanbanGroupModel = {
  key: string
  rows: MarkdownDataViewRow[]
}

export type KanbanGroupProps = {
  group: KanbanGroupModel
  canMutate: boolean
  view: MarkdownDataView
  titleIndex: number
  groupByIndex: number
  moveTargets: string[]
  groupColumnOptions: string[]
  otherColumnIndices: number[]
  onUpdateCell: (args: { rowId: string; columnId: string; nextValue: string }) => void
  onNewRecord: (seed?: Partial<Record<string, string>>) => void
  onActivateRow?: (rowId: string) => void
  isDragOver?: boolean
  getCardDragProps?: (args: { rowId: string; groupKey: string }) => KanbanCardDragProps
  getCardDropProps?: (args: { rowId: string; groupKey: string }) => KanbanCardDropProps
  laneDropProps?: KanbanLaneDropProps
  draggingRowId?: string | null
  dragOverRowId?: string | null
  dragOverPosition?: KanbanDropPosition
  onKeyboardMove?: (args: { rowId: string; direction: 'up' | 'down' | 'left' | 'right' }) => boolean
  showLaneDropPreview?: boolean
  laneScrollRef?: (element: HTMLOListElement | null) => void
  hasActiveDrag?: boolean
  isSourceLane?: boolean
  isCommitFlash?: boolean
  commitFlashRowId?: string | null
  laneDropPreviewLabel?: string
  getCardDropPreviewLabel?: (args: { rowId: string; groupKey: string }) => string
  onFocusableRowElement?: (args: { rowId: string; element: HTMLElement | null }) => void
}

export const KanbanGroup = React.memo(function KanbanGroup(props: KanbanGroupProps) {
  const groupByColumnId = String(props.view.groupByColumnId || '')
  const laneDragVisualState = getKanbanLaneDragVisualState({
    hasActiveDrag: !!props.hasActiveDrag,
    isDragOver: !!props.isDragOver,
    isSourceLane: !!props.isSourceLane,
    isCommitFlash: !!props.isCommitFlash,
  })
  const [expanded, setExpanded] = React.useState(true)
  const toggleExpanded = React.useCallback(() => {
    setExpanded(prev => !prev)
  }, [])

  return (
    <li className="list-none">
      <section
        data-kg-kanban-group="1"
        className={[
          UI_RESPONSIVE_DATA_VIEW_KANBAN_GROUP_CLASSNAME,
          'relative flex-shrink-0 border transition-colors',
          'rounded-[var(--kg-kanban-card-radius)]',
          laneDragVisualState.className,
          UI_THEME_TOKENS.panel.border,
          UI_THEME_TOKENS.kanban.groupBg,
        ].join(' ')}
        style={laneDragVisualState.style}
        aria-label={`Group: ${props.group.key}`}
        {...props.laneDropProps}
      >
        {props.isDragOver ? <KanbanLaneDragOverIndicator /> : null}
        <header
          data-kg-kanban-group-header="1"
          className={[UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME, 'gap-2 px-2 py-2 border-b', UI_THEME_TOKENS.panel.divider].join(' ')}
        >
          <button
            type="button"
            className={['flex items-center gap-2 flex-1 min-w-0 rounded', UI_THEME_TOKENS.button.hoverBg, UI_THEME_TOKENS.focus.primarySoftRing].join(' ')}
            aria-expanded={expanded}
            onClick={toggleExpanded}
            onKeyDown={e => {
              if (e.key === 'ArrowRight') {
                e.preventDefault()
                setExpanded(true)
              }
              if (e.key === 'ArrowLeft') {
                e.preventDefault()
                setExpanded(false)
              }
            }}
          >
            {expanded ? (
              <ChevronDown className={['w-4 h-4', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
            ) : (
              <ChevronRight className={['w-4 h-4', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
            )}
            <h3 className="min-w-0 flex items-center gap-2 m-0 text-sm font-medium">
              <DataViewTagChip value={props.group.key} />
              <span className={['inline-flex items-center justify-center w-5 h-5 rounded', UI_THEME_TOKENS.badge.chip, UI_THEME_TOKENS.text.secondary, 'text-xs'].join(' ')}>
                {props.group.rows.length}
              </span>
            </h3>
          </button>

          {props.canMutate ? (
            <menu
              data-kg-kanban-group-actions="1"
              className="m-0 p-0 list-none flex shrink-0 items-center gap-1 opacity-0 pointer-events-none transition-opacity"
              aria-label="Group actions"
            >
              <li className="list-none">
                <button
                  type="button"
                  className={[
                    'kg-panel-action-btn kg-panel-icon-btn',
                    UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME,
                    'rounded-md',
                    UI_THEME_TOKENS.focus.primarySoftRing,
                  ].join(' ')}
                  aria-label={`New record in ${props.group.key}`}
                  onClick={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    props.onNewRecord({ [groupByColumnId]: props.group.key })
                  }}
                >
                  <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
                </button>
              </li>
            </menu>
          ) : null}
        </header>

        {expanded ? (
          <ol
            ref={props.laneScrollRef}
            data-kg-kanban-group-list="1"
            className={UI_RESPONSIVE_DATA_VIEW_KANBAN_CARD_LIST_CLASSNAME}
            aria-label={`Cards in ${props.group.key}`}
          >
            {props.group.rows.map((row, index) => {
              const title = String(row.cells[props.titleIndex] ?? '')
              const groupValue = String(row.cells[props.groupByIndex] ?? '').trim() || props.group.key
              return (
                <React.Fragment key={row.id}>
                  <li className="list-none">
                    <KanbanCard
                      row={row}
                      title={title}
                      groupValue={groupValue}
                      canMutate={props.canMutate}
                      groupByColumnId={groupByColumnId}
                      groupByIndex={props.groupByIndex}
                      moveTargets={props.moveTargets}
                      groupColumnOptions={props.groupColumnOptions}
                      view={props.view}
                      otherColumnIndices={props.otherColumnIndices}
                      onUpdateCell={props.onUpdateCell}
                      onActivateRow={props.onActivateRow}
                      cardDragProps={props.getCardDragProps?.({ rowId: row.id, groupKey: props.group.key })}
                      cardDropProps={props.getCardDropProps?.({ rowId: row.id, groupKey: props.group.key })}
                      isDragging={props.draggingRowId === row.id}
                      isDropTarget={props.dragOverRowId === row.id}
                      dropPosition={props.dragOverPosition}
                      onKeyboardMove={props.onKeyboardMove}
                      hasActiveDrag={!!props.hasActiveDrag}
                      dropPreviewLabel={props.getCardDropPreviewLabel?.({ rowId: row.id, groupKey: props.group.key })}
                      isCommitFlash={props.commitFlashRowId === row.id}
                      onFocusableRowElement={props.onFocusableRowElement}
                    />
                  </li>
                  {props.canMutate && index < props.group.rows.length - 1 ? (
                    <KanbanNewRecordDividerRow onClick={() => props.onNewRecord({ [groupByColumnId]: props.group.key })} />
                  ) : null}
                </React.Fragment>
              )
            })}

            {props.canMutate ? (
              <KanbanNewRecordDividerRow onClick={() => props.onNewRecord({ [groupByColumnId]: props.group.key })} />
            ) : null}
            {props.showLaneDropPreview ? (
              <li className="list-none">
                <KanbanLaneDropPreview label={props.laneDropPreviewLabel || `Drop to place at end of ${props.group.key}`} compact />
              </li>
            ) : null}
          </ol>
        ) : null}
      </section>
    </li>
  )
})
