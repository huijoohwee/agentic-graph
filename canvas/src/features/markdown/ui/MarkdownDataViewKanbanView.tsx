import { projectDataViewGroups, dataViewGroupValue, dataViewGroupLabel } from '@/features/markdown-workspace/main/viewer/workspaceDataViewGroups'
import React from 'react'
import type { MarkdownDataView } from './markdownDataViewModel'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { KanbanGroup } from './kanban/KanbanGroup'
import { buildKanbanCardDropIntentLabel, buildKanbanDragStatusText, buildKanbanLaneDropIntentLabel } from './kanban/kanbanDragIntent'
import { buildKanbanDropOutcomeText, isKanbanMoveNoOp } from './kanban/kanbanMoveOutcomes'
import { useKanbanDragAndDrop } from './kanban/useKanbanDragAndDrop'
import { reorderKanbanRowIds } from './kanban/kanbanReorder'
import { UI_RESPONSIVE_DATA_VIEW_KANBAN_STATUS_ROW_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

type MarkdownDataViewKanbanViewProps = {
  view: MarkdownDataView
  hiddenGroupIds?: readonly string[]
  hideEmptyGroups?: boolean
  visibleColumnIds?: string[] | null
  canMutate: boolean
  onUpdateCell: (args: { rowId: string; columnId: string; nextValue: string }) => void
  onReorderRows?: (args: {
    orderedRowIds: readonly string[]
    rowPatch?: { rowId: string; columnId: string; nextValue: string }
  }) => void
  onNewRecord: (seed?: Partial<Record<string, string>>) => void
  onActivateRow?: (rowId: string) => void
}

export const MarkdownDataViewKanbanView = React.memo(function MarkdownDataViewKanbanView(props: MarkdownDataViewKanbanViewProps) {
  const { view, visibleColumnIds, canMutate, onUpdateCell, onReorderRows, onNewRecord, onActivateRow } = props
  const boardScrollRef = React.useRef<HTMLElement>(null)
  const laneScrollElementsRef = React.useRef(new Map<string, HTMLOListElement>())
  const visibleColumnIdSet = React.useMemo(() => {
    return visibleColumnIds ? new Set(visibleColumnIds) : null
  }, [visibleColumnIds])

  const groupById = view.groupByColumnId
  const groupByIndex = React.useMemo(() => {
    return groupById ? view.columns.findIndex(c => c.id === groupById) : -1
  }, [groupById, view.columns])

  const titleIndex = React.useMemo(() => {
    return view.columns.findIndex(c => c.id === view.titleColumnId)
  }, [view.columns, view.titleColumnId])

  const groups = React.useMemo(() => projectDataViewGroups(view, groupById).filter(group =>
    !props.hiddenGroupIds?.includes(group.key) && (!props.hideEmptyGroups || group.rows.length > 0)),
  [view, groupById, props.hiddenGroupIds, props.hideEmptyGroups])

  const rowIdToGroupKey = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const group of groups) {
      for (const row of group.rows) map.set(row.id, group.key)
    }
    return map
  }, [groups])
  const groupToRowIds = React.useMemo(() => {
    const map = new Map<string, readonly string[]>()
    for (const group of groups) {
      map.set(group.key, group.rows.map(row => row.id))
    }
    return map
  }, [groups])

  const moveTargets = React.useMemo(() => groups.map(x => x.value), [groups])
  const rowIdToTitle = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const row of view.rows) {
      map.set(row.id, String(row.cells[titleIndex] ?? '').trim() || row.id)
    }
    return map
  }, [titleIndex, view.rows])

  const groupColumnOptions = React.useMemo(() => {
    if (groupByIndex < 0) return [] as string[]
    const col = view.columns[groupByIndex]
    return Array.isArray(col.options) ? col.options.filter(Boolean) : []
  }, [groupByIndex, view.columns])

  const otherColumnIndices = React.useMemo(() => {
    if (groupByIndex < 0 || titleIndex < 0) return []
    const out: number[] = []
    for (let i = 0; i < view.columns.length; i += 1) {
      const col = view.columns[i]
      if (col.id === view.titleColumnId) continue
      if (col.id === view.groupByColumnId) continue
      if (visibleColumnIdSet && !visibleColumnIdSet.has(col.id)) continue
      if (col.kind === 'select' || col.kind === 'multi-select' || col.kind === 'text') out.push(i)
    }
    return out
  }, [view.columns, view.groupByColumnId, view.titleColumnId, visibleColumnIdSet])

  const kanbanDrag = useKanbanDragAndDrop({
    enabled: canMutate && !!view.groupByColumnId,
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
      sourceLaneLabel: sourceGroupKey ? dataViewGroupLabel(sourceGroupKey) : null,
      targetLaneLabel: move?.targetGroupKey ? dataViewGroupLabel(move.targetGroupKey) : null,
      targetCardLabel: move?.targetRowId ? rowIdToTitle.get(move.targetRowId) || move.targetRowId : null,
      blockedReason,
    }),
    onCommitMove: ({ rowId, targetGroupKey, targetRowId, position }) => {
      if (!view.groupByColumnId) return
      const nextValue = dataViewGroupValue(targetGroupKey)
      if (!onReorderRows) {
        onUpdateCell({
          rowId,
          columnId: view.groupByColumnId,
          nextValue,
        })
        return
      }
      const orderedRowIds = reorderKanbanRowIds({
        orderedRowIds: view.rows.map(row => row.id),
        availableRowIds: view.rows.map(row => row.id),
        rowIdToGroupKey,
        draggedRowId: rowId,
        targetGroupKey,
        targetRowId,
        position,
      })
      onReorderRows({
        orderedRowIds,
        rowPatch: {
          rowId,
          columnId: view.groupByColumnId,
          nextValue,
        },
      })
    },
  })

  const handleKeyboardMove = React.useCallback((args: { rowId: string; direction: 'up' | 'down' | 'left' | 'right' }): boolean => {
    if (!view.groupByColumnId) return false
    const currentGroupKey = rowIdToGroupKey.get(args.rowId) || MARKDOWN_DATA_VIEW_COPY.ungroupedLabel
    const currentGroup = groups.find(group => group.key === currentGroupKey) || null
    if (!currentGroup) return false
    const currentIndex = currentGroup.rows.findIndex(row => row.id === args.rowId)
    if (currentIndex < 0) return false

    if (args.direction === 'up' || args.direction === 'down') {
      if (args.direction === 'up' && currentIndex === 0) {
        kanbanDrag.reportBlockedMove({
          rowId: args.rowId,
          sourceGroupKey: currentGroup.key,
          reason: 'start-of-lane',
        })
        return true
      }
      if (args.direction === 'down' && currentIndex === currentGroup.rows.length - 1) {
        kanbanDrag.reportBlockedMove({
          rowId: args.rowId,
          sourceGroupKey: currentGroup.key,
          reason: 'end-of-lane',
        })
        return true
      }
      const delta = args.direction === 'up' ? -1 : 1
      const neighbor = currentGroup.rows[currentIndex + delta] || null
      kanbanDrag.commitMove({
        rowId: args.rowId,
        sourceGroupKey: currentGroup.key,
        targetGroupKey: currentGroup.key,
        targetRowId: neighbor?.id ?? null,
        position: neighbor ? (args.direction === 'up' ? 'before' : 'after') : 'end',
      })
      return true
    }

    const groupIndex = groups.findIndex(group => group.key === currentGroup.key)
    const nextGroup = groups[groupIndex + (args.direction === 'left' ? -1 : 1)] || null
    if (!nextGroup) {
      kanbanDrag.reportBlockedMove({
        rowId: args.rowId,
        sourceGroupKey: currentGroup.key,
        reason: args.direction === 'left' ? 'start-of-board' : 'end-of-board',
      })
      return true
    }
    kanbanDrag.commitMove({
      rowId: args.rowId,
      sourceGroupKey: currentGroup.key,
      targetGroupKey: nextGroup.key,
      targetRowId: null,
      position: 'end',
    })
    return true
  }, [groups, kanbanDrag, rowIdToGroupKey, view.groupByColumnId])

  if (groupByIndex < 0 || titleIndex < 0 || !view.groupByColumnId) return null

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
    <section ref={boardScrollRef} className="p-2 overflow-x-auto" aria-label={MARKDOWN_DATA_VIEW_COPY.kanbanViewLabel}>
      <section key={liveRegionKey} className="sr-only" aria-live="polite">{statusPillText}</section>
      {canMutate ? (
        <section className="mb-2 flex items-center justify-between gap-3">
          <section className={[UI_RESPONSIVE_DATA_VIEW_KANBAN_STATUS_ROW_CLASSNAME, 'text-xs', UI_THEME_TOKENS.text.secondary].join(' ')}>
            {statusPillText ? (
              <span className={['inline-flex items-center rounded-full border px-2.5 py-1', UI_THEME_TOKENS.panel.border].join(' ')}>
                {statusPillText}
              </span>
            ) : null}
          </section>
        </section>
      ) : null}
      <ul className="flex items-start gap-3 min-w-fit list-none m-0 p-0" aria-label="Kanban groups">
        {groups.map(group => (
          <KanbanGroup
            key={group.key}
            group={group}
            canMutate={canMutate}
            view={view}
            titleIndex={titleIndex}
            groupByIndex={groupByIndex}
            moveTargets={moveTargets}
            groupColumnOptions={groupColumnOptions}
            otherColumnIndices={otherColumnIndices}
            onUpdateCell={onUpdateCell}
            onNewRecord={onNewRecord}
            onActivateRow={onActivateRow}
            isDragOver={kanbanDrag.dragOverGroupKey === group.key && kanbanDrag.dragSourceGroupKey !== group.key}
            getCardDragProps={kanbanDrag.createCardDragProps}
            getCardDropProps={kanbanDrag.createCardDropProps}
            laneDropProps={kanbanDrag.createLaneDropProps(group.key)}
            draggingRowId={kanbanDrag.draggingRowId}
            dragOverRowId={kanbanDrag.dragOverRowId}
            dragOverPosition={kanbanDrag.dragOverPosition}
            onKeyboardMove={handleKeyboardMove}
            showLaneDropPreview={
              kanbanDrag.draggingRowId !== null &&
              kanbanDrag.dragOverGroupKey === group.key &&
              kanbanDrag.dragOverRowId === null
            }
            hasActiveDrag={kanbanDrag.draggingRowId !== null}
            isSourceLane={kanbanDrag.dragSourceGroupKey === group.key}
            isCommitFlash={kanbanDrag.commitFlashGroupKey === group.key}
            commitFlashRowId={kanbanDrag.commitFlashRowId}
            onFocusableRowElement={kanbanDrag.registerFocusableRowElement}
            laneDropPreviewLabel={buildKanbanLaneDropIntentLabel({ targetLaneLabel: group.label })}
            getCardDropPreviewLabel={({ rowId }) =>
              buildKanbanCardDropIntentLabel({
                position: kanbanDrag.dragOverPosition,
                targetCardLabel: rowIdToTitle.get(rowId) || rowId,
                targetLaneLabel: group.label,
              })
            }
            laneScrollRef={element => {
              if (element) {
                laneScrollElementsRef.current.set(group.key, element)
                return
              }
              laneScrollElementsRef.current.delete(group.key)
            }}
          />
        ))}
      </ul>
    </section>
  )
})
