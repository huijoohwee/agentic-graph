import React from 'react'
import { Redo, Undo } from 'lucide-react'
import IconButton from '@/components/IconButton'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_LABELS } from '@/lib/config'
import { toolbarActionAffordance } from '@/lib/toolbar/toolbarActionAffordance'

export const canUndoGraphHistory = (historyIndex: number): boolean => historyIndex > 0

export const canRedoGraphHistory = (historyIndex: number, historyLength: number): boolean => (
  historyIndex >= 0 && historyIndex < historyLength - 1
)

export function HistoryUndoRedoControls({
  iconSizeClass,
  iconStrokeWidth,
}: {
  iconSizeClass: string
  iconStrokeWidth: number
}) {
  const historyIndex = useGraphStore(state => state.historyIndex)
  const historyLength = useGraphStore(state => state.history.length)
  const undoHistory = useGraphStore(state => state.undoHistory)
  const redoHistory = useGraphStore(state => state.redoHistory)
  const canUndo = canUndoGraphHistory(historyIndex)
  const canRedo = canRedoGraphHistory(historyIndex, historyLength)

  return (
    <section className="contents" aria-label="Version history controls">
      <IconButton
        className="App-toolbar__btn"
        title={UI_LABELS.undo}
        tooltipContent={UI_LABELS.undo}
        disabled={!canUndo}
        onClick={undoHistory}
        data-kg-history-action="undo"
        {...toolbarActionAffordance('history:undo')}
        showTooltip
      >
        <Undo className={iconSizeClass} strokeWidth={iconStrokeWidth} />
      </IconButton>
      <IconButton
        className="App-toolbar__btn"
        title={UI_LABELS.redo}
        tooltipContent={UI_LABELS.redo}
        disabled={!canRedo}
        onClick={redoHistory}
        data-kg-history-action="redo"
        {...toolbarActionAffordance('history:redo')}
        showTooltip
      >
        <Redo className={iconSizeClass} strokeWidth={iconStrokeWidth} />
      </IconButton>
    </section>
  )
}
