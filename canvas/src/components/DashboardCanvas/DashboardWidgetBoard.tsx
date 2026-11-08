import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useContainerDims } from '@/hooks/useContainerDims'
import { useKanbanDragAndDrop } from '@/features/markdown/ui/kanban/useKanbanDragAndDrop'
import { isInteractiveEventTarget } from '@/features/markdown/ui/kanban/kanbanMenu'
import { readSnapGridConfigFromSchema } from '@/lib/canvas/gridSnap'
import { useDashboardWidgets, updateDashboardWidgets } from './dashboardWidgetConfiguration'
import { dashboardWidgetRows, moveDashboardWidget, dashboardDropPosition, dashboardColumnStyle } from './dashboardWidgetLayout'
import { DashboardWidgetBoard as BaseWidgetBoard } from '@agentic-base/views-react/dashboard'

type DragOwner = ReturnType<typeof useKanbanDragAndDrop>
type CardBinding = { id: string; cardId: string; board: string; owner: DragOwner }
const CardDragContext = React.createContext<CardBinding | null>(null)
export function useDashboardCardDrag(cardId: string) {
  const binding = React.useContext(CardDragContext)
  if (!binding || binding.cardId !== cardId) return null
  const { id, board, owner } = binding
  return { cardDragProps: owner.createCardDragProps({ rowId: id, groupKey: board }),
    cardDropProps: owner.createCardDropProps({ rowId: id, groupKey: board }),
    dragging: owner.draggingRowId ? owner.draggingRowId === id ? cardId : '__other__' : null,
    over: owner.dragOverRowId === id ? cardId : null, position: owner.dragOverPosition,
    flash: owner.commitFlashRowId === id ? cardId : null,
    register: (_: string, element: HTMLElement | null) => owner.registerFocusableRowElement({ rowId: id, element }) }
}

/** One adapter to shared card drag, grid snapping and persisted display configuration. */
export default function DashboardWidgetBoard({ id, items, columns = 1 }: {
  id: string; items: { id: string; cardId: string; content: React.ReactNode }[]; columns?: number
}) {
  const config = useDashboardWidgets(), schema = useGraphStore(state => state.schema)
  const element = React.useRef<HTMLElement | null>(null), dims = useContainerDims(element)
  const grid = readSnapGridConfigFromSchema(schema)
  const rows = dashboardWidgetRows(config.document.boards?.[id], items.map(item => item.id), columns)
  const nextRows = (move: Parameters<DragOwner['commitMove']>[0]) => move.sourceGroupKey === id && move.targetGroupKey === id
    ? moveDashboardWidget(rows, move.rowId, move.targetRowId, move.position) : rows
  const drag = useKanbanDragAndDrop({ enabled: config.ready,
    getLaneScrollElement: () => element.current?.closest<HTMLElement>('[data-kg-dashboard-scroll-surface]') ?? null,
    resolveCardDropPosition: (point, rect) => dashboardDropPosition(point, rect, grid),
    isNoOpMove: move => JSON.stringify(nextRows(move)) === JSON.stringify(rows),
    onCommitMove: move => { void updateDashboardWidgets({}, { [id]: nextRows(move) }).catch(() => undefined) },
    buildOutcomeMessage: outcome => outcome.kind === 'committed' ? 'Widget moved.' : outcome.kind === 'no-op' ? 'Widget position unchanged.' : 'Widget move cancelled.',
  })
  return <BaseWidgetBoard ref={element} id={id} rows={rows}
    items={items.map(item => ({ id: item.id, content: <CardDragContext.Provider value={{ id: item.id, cardId: item.cardId, board: id, owner: drag }}>{item.content}</CardDragContext.Provider> }))}
    laneDropProps={{ ...drag.createLaneDropProps(id), 'data-dashboard-board': id, 'data-dashboard-snap-grid': grid.enabled ? '1' : '0' }}
    cellAttributes={(row, columns) => ({ 'data-dashboard-layout-row': String(row), 'data-dashboard-columns': String(columns) })}
    columnStyle={columns => dashboardColumnStyle(dims.width, columns, grid)}
    statusMessage={config.error || drag.dragOutcomeMessage} statusKey={String(drag.dragOutcomeSequence)}
    onItemKeyDown={(widgetId, event) => {
      if (!event.altKey || !event.shiftKey || isInteractiveEventTarget(event.target) || !event.key.startsWith('Arrow')) return
      const flat = rows.flat(), index = flat.indexOf(widgetId), backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
      const target = flat[index + (backward ? -1 : 1)]
      if (!target) return
      event.preventDefault(); event.stopPropagation()
      drag.commitMove({ rowId: widgetId, sourceGroupKey: id, targetGroupKey: id, targetRowId: target,
        position: event.key === 'ArrowLeft' ? 'left' : event.key === 'ArrowRight' ? 'right' : backward ? 'before' : 'after' })
    }}
  />
}
