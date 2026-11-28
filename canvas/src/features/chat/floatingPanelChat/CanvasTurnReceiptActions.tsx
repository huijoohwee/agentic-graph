import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { emitMainPanelOpen } from '@/features/panels/utils/useMainPanelRect'
import { getUiSectionActionClassName } from '@/lib/ui/sectionChipChrome'
import { canUndoCanvasTurn } from '@/features/graph-editor/canvasAuthoringTurn'

export default function CanvasTurnReceiptActions({ entryId }: { entryId: string }) {
  const available = useGraphStore(state => state.history.some(entry => entry.id === entryId))
  const current = useGraphStore(state => canUndoCanvasTurn(state, entryId))
  if (!available) return <small>History entry unavailable</small>
  const buttonClass = getUiSectionActionClassName('secondary', 'px-2')
  return (
    <nav aria-label="Diagram receipt" className="mt-2 flex flex-wrap gap-2">
      <button type="button" className={buttonClass} onClick={() => emitMainPanelOpen({ tab: 'history', anchorId: entryId })}>View in History</button>
      {current && <button type="button" className={buttonClass} onClick={() => {
        const state = useGraphStore.getState()
        if (canUndoCanvasTurn(state, entryId)) state.undoHistory()
      }}>Undo</button>}
    </nav>
  )
}
