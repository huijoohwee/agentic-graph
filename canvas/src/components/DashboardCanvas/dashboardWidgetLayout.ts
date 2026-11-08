import { reorderKanbanRowIds, type KanbanDropPosition } from '@/features/markdown/ui/kanban/kanbanReorder'
import { snapPointToGrid, type SnapGridConfig } from '@/lib/canvas/gridSnap'

export { dashboardWidgetRows, dashboardColumnStyle } from '@agentic-base/views-react/dashboard'

export function moveDashboardWidget(rows: string[][], id: string, target: string | null, position: KanbanDropPosition): string[][] {
  if (!rows.flat().includes(id) || id === target || target && !rows.flat().includes(target)) return rows
  const next = rows.map(row => row.filter(item => item !== id)).filter(row => row.length)
  const rowIndex = next.findIndex(row => target && row.includes(target))
  if (rowIndex < 0) return [...next, [id]]
  if (position === 'left' || position === 'right') {
    if (next[rowIndex].length >= 12) return rows
    const ids = [...next[rowIndex], id]
    next[rowIndex] = reorderKanbanRowIds({ orderedRowIds: ids, availableRowIds: ids,
      rowIdToGroupKey: new Map(ids.map(item => [item, 'row'])), draggedRowId: id,
      targetGroupKey: 'row', targetRowId: target, position })
  } else next.splice(rowIndex + (position === 'after' ? 1 : 0), 0, [id])
  return next
}

export function dashboardDropPosition(point: { x: number; y: number }, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, grid: SnapGridConfig): KanbanDropPosition {
  const local = { x: point.x - rect.left, y: point.y - rect.top }
  const p = grid.enabled ? snapPointToGrid(local, grid) : local
  // Vertical ends remain reorder targets; the middle side edges form columns.
  const endZone = Math.min(40, rect.height * 0.2)
  if (p.y > endZone && p.y < rect.height - endZone) {
    if (p.x < rect.width * 0.25) return 'left'
    if (p.x > rect.width * 0.75) return 'right'
  }
  return p.y >= rect.height / 2 ? 'after' : 'before'
}
