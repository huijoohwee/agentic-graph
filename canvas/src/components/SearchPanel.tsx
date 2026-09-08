import React, { forwardRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { scheduleDebouncedSearch } from '@/features/toolbar/utils'
import type { SearchResult } from '@/features/search/types'
import { UI_ANCHORS } from '@/lib/config'
import { dispatchRuntimeZoomActionSoon } from '@/lib/canvas/runtimeZoomDispatch'
import {
  UI_RESPONSIVE_TOOLBAR_FIELD_CLASSNAME,
  UI_RESPONSIVE_MENU_OPTION_ROW_CLASSNAME,
  UI_RESPONSIVE_WIDE_TOOLBAR_DROPDOWN_PANEL_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

interface SearchPanelProps {
  onClose?: () => void
}

const SearchPanel = forwardRef<HTMLElement, SearchPanelProps>(({ onClose }, ref) => {
  const { graphData, graphDataRevision, selectNode, selectEdge, setSelectionSource, graphId, historyIndex } = useGraphStore(useShallow(state => ({
    graphData: state.graphData, graphDataRevision: state.graphDataRevision, graphId: state.graphId, historyIndex: state.historyIndex,
    selectNode: state.selectNode, selectEdge: state.selectEdge, setSelectionSource: state.setSelectionSource,
  })))
  const [searchQuery, setSearchQuery] = React.useState('')
  const [searchResults, setSearchResults] = React.useState<SearchResult[]>([])
  const [activeIdx, setActiveIdx] = React.useState(0)
  const listId = React.useId()

  React.useEffect(() => {
    const versionKey = `${graphId || ''}|${historyIndex ?? ''}|${graphDataRevision ?? ''}`
    return scheduleDebouncedSearch(graphData, searchQuery, 50, 150, versionKey, (res) => {
      setSearchResults(res)
      setActiveIdx(0)
    })
  }, [graphData, graphDataRevision, searchQuery, graphId, historyIndex])

  React.useEffect(() => {
    if (searchResults[activeIdx]) document.getElementById(`${listId}-${activeIdx}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIdx, listId, searchResults])

  const commitSearchSelection = React.useCallback((result: SearchResult | null | undefined) => {
    if (!result) return
    setSelectionSource('menu')
    if (result.kind === 'node') selectNode(result.id)
    else selectEdge(result.id)
    dispatchRuntimeZoomActionSoon('selection')
    onClose?.()
  }, [onClose, selectEdge, selectNode, setSelectionSource])

  return (
    <section
      ref={ref}
      className={`${UI_RESPONSIVE_WIDE_TOOLBAR_DROPDOWN_PANEL_CLASSNAME} mt-1 rounded border border-[color:var(--kg-border)] bg-[var(--kg-panel-bg)] shadow p-1`}
      data-kg-anchor={UI_ANCHORS.searchPanel}
    >
      <input
        value={searchQuery}
        onChange={e => { setSearchQuery(e.target.value); setSearchResults([]); setActiveIdx(0) }}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={searchResults.length > 0}
        aria-activedescendant={searchResults[activeIdx] ? `${listId}-${activeIdx}` : undefined}
        placeholder="Search nodes and edges..."
        className={`${UI_RESPONSIVE_TOOLBAR_FIELD_CLASSNAME} w-full px-2 rounded border border-[color:var(--kg-border)] bg-[var(--kg-panel-bg)] text-[color:var(--kg-text-primary)] font-sans text-sm`}
        aria-label="Search graph"
        onKeyDown={e => {
          const k = e.key.toLowerCase()
          if ((k === 'arrowdown' || k === 'arrowup') && searchResults.length) {
            e.preventDefault()
            setActiveIdx(index => (index + (k === 'arrowdown' ? 1 : searchResults.length - 1)) % searchResults.length)
          } else if (k === 'enter') {
            e.preventDefault()
            commitSearchSelection(searchResults[activeIdx])
          } else if (k === 'escape') {
            if (searchQuery.trim().length > 0) {
              setSearchQuery('')
              setSearchResults([])
              setActiveIdx(0)
              return
            }
            onClose?.()
          }
        }}
        autoFocus
      />
      {searchResults.length > 0 && <ul id={listId} role="listbox" aria-label="Search results" className="m-0 max-h-64 overflow-y-auto list-none p-0">
        {searchResults.map((r, index) => <li
          key={`${r.kind}:${r.id}`}
          id={`${listId}-${index}`}
          role="option"
          aria-selected={index === activeIdx}
          data-kg-search-result-id={r.id}
          data-kg-search-result-kind={r.kind}
          className={`${UI_RESPONSIVE_MENU_OPTION_ROW_CLASSNAME} cursor-pointer ${index === activeIdx ? 'bg-[var(--kg-panel-action-bg-hover)]' : ''}`}
          onMouseEnter={() => setActiveIdx(index)}
          onMouseDown={event => event.preventDefault()}
          onClick={() => commitSearchSelection(r)}
        ><span className="min-w-0 flex-1 truncate">{r.title}</span><span className="text-[color:var(--kg-text-tertiary)]">{r.kind}</span></li>)}
      </ul>}
    </section>
  )
})

export default SearchPanel
