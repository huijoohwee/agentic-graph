import type { KanbanDropPosition } from './kanbanReorder'

const normalizeLabel = (value: string | null | undefined, fallback: string): string => {
  const text = String(value || '').trim()
  return text || fallback
}

export const buildKanbanCardDropIntentLabel = (args: {
  position: KanbanDropPosition
  targetCardLabel?: string | null
  targetLaneLabel?: string | null
}): string => {
  const targetCardLabel = normalizeLabel(args.targetCardLabel, 'item')
  const targetLaneLabel = normalizeLabel(args.targetLaneLabel, 'lane')
  const action = args.position === 'left' ? 'Drop to the left of' : args.position === 'right' ? 'Drop to the right of'
    : args.position === 'before' ? 'Drop to place before' : 'Drop to place after'
  return `${action} ${targetCardLabel} in ${targetLaneLabel}`
}

export const buildKanbanLaneDropIntentLabel = (args: {
  targetLaneLabel?: string | null
}): string => {
  const targetLaneLabel = normalizeLabel(args.targetLaneLabel, 'lane')
  return `Drop to place at end of ${targetLaneLabel}`
}

export const buildKanbanDragStatusText = (args: {
  sourceLaneLabel?: string | null
  targetLaneLabel?: string | null
  targetCardLabel?: string | null
  position: KanbanDropPosition
  isDragging: boolean
}): string => {
  if (!args.isDragging) return ''
  const sourceLaneLabel = normalizeLabel(args.sourceLaneLabel, 'lane')
  if (!args.targetLaneLabel) return `Dragging from ${sourceLaneLabel}`
  if (!args.targetCardLabel || args.position === 'end') {
    return buildKanbanLaneDropIntentLabel({ targetLaneLabel: args.targetLaneLabel })
  }
  return buildKanbanCardDropIntentLabel({
    position: args.position,
    targetCardLabel: args.targetCardLabel,
    targetLaneLabel: args.targetLaneLabel,
  })
}
