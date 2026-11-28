import React from 'react'
import { readSubgraphs, subgraphGroupId } from '@/lib/graph/subgraphs'
import { readNodeSketch } from '@/lib/graph/canvasSketch'
import { useGraphStore } from '@/hooks/useGraphStore'
import { emitMainPanelOpen } from '@/features/panels/utils/useMainPanelRect'
import { getUiSectionActionClassName } from '@/lib/ui/sectionChipChrome'
import { canUndoCanvasTurn } from '@/features/graph-editor/canvasAuthoringTurn'

export default function CanvasTurnReceiptActions({ entryId }: { entryId: string }) {
  const entry = useGraphStore(state => state.history.find(item => item.id === entryId))
  const parent = useGraphStore(state => entry?.parentId ? state.history.find(item => item.id === entry.parentId) : undefined)
  const drawing = React.useMemo(() => {
    if (!entry || !parent) return null
    const previousNodes = new Set(parent.graphData.nodes.map(node => node.id))
    const previousGroups = new Set(readSubgraphs(parent.graphData).map(group => group.id))
    const groups = readSubgraphs(entry.graphData).filter(group => !previousGroups.has(group.id))
    let strokes = 0
    let figures = 0
    for (const node of entry.graphData.nodes) {
      if (previousNodes.has(node.id)) continue
      const sketch = readNodeSketch(node)
      if (sketch) {
        figures += 1
        strokes += sketch.marks.length
      }
    }
    return { groups, figures, strokes }
  }, [entry, parent])
  const current = useGraphStore(state => canUndoCanvasTurn(state, entryId))
  if (!entry) return <small>History entry unavailable</small>
  const buttonClass = getUiSectionActionClassName('secondary', 'px-2')
  return (
    <nav aria-label="Diagram receipt" className="mt-2 flex flex-wrap items-center gap-2">
      {drawing?.groups.map(group => current ? (
        <button type="button" key={group.id} aria-label={`Select created group ${group.label}`} className={buttonClass} onClick={() => {
          const state = useGraphStore.getState()
          if (!canUndoCanvasTurn(state, entryId)) return
          state.setSelectionSource('editor')
          state.selectGroup(subgraphGroupId(group.id))
        }}>Created group · {group.label}</button>
      ) : <span key={group.id}>Created group · {group.label}</span>)}
      {drawing && drawing.figures > 0 && <span>{drawing.figures} editable {drawing.figures === 1 ? 'figure' : 'figures'} · {drawing.strokes} {drawing.strokes === 1 ? 'stroke' : 'strokes'}</span>}
      <button type="button" className={buttonClass} onClick={() => emitMainPanelOpen({ tab: 'history', anchorId: entryId })}>View in History</button>
      {current && <button type="button" className={buttonClass} onClick={() => {
        const state = useGraphStore.getState()
        if (canUndoCanvasTurn(state, entryId)) state.undoHistory()
      }}>Undo</button>}
    </nav>
  )
}
