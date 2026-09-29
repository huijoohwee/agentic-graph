import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

export type KanbanCellProps = {
  rowId: string
  groupByColumnId: string
  value: string
  options: string[]
  onUpdateCell: (args: { rowId: string; columnId: string; nextValue: string }) => void
}

export const KanbanCell = React.memo(function KanbanCell(props: KanbanCellProps) {
  const options = React.useMemo(() => {
    const cleaned = props.options.map(x => String(x || '').trim()).filter(Boolean)
    const current = String(props.value || '').trim()
    if (!current) return cleaned
    if (cleaned.includes(current)) return cleaned
    return [current, ...cleaned]
  }, [props.options, props.value])
  const current = String(props.value || '').trim()
  const currentIndex = options.findIndex(x => x === current)
  const canCycle = options.length > 1
  return (
    <footer className="mt-2">
      <button
        type="button"
        aria-label="Status"
        className={['w-full text-left text-xs px-2 py-1 rounded border', UI_THEME_TOKENS.kanban.cellBg, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.text].join(' ')}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onKeyDown={e => {
          e.stopPropagation()
          if (!canCycle) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % options.length : 0
            const next = options[nextIndex] || ''
            props.onUpdateCell({ rowId: props.rowId, columnId: props.groupByColumnId, nextValue: next })
          }
        }}
        onDoubleClick={e => {
          e.stopPropagation()
          if (!canCycle) return
          const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % options.length : 0
          const next = options[nextIndex] || ''
          props.onUpdateCell({ rowId: props.rowId, columnId: props.groupByColumnId, nextValue: next })
        }}
        title={canCycle ? 'Double-click to cycle status' : undefined}
      >
        {current || '—'}
      </button>
    </footer>
  )
})
