import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_PREVIEW_GALLERY_DRAG_CARD_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_INTENT_TOKENS } from 'grph-shared/ui/intentTokens'
import {
  uiToolbarToggleActiveClassName,
  uiSecondaryToggleActiveClassName,
  UI_COLOR_PRIMARY_BLUE_INDICATOR,
  UI_RING_PRIMARY_BLUE_INDICATOR,
  UI_COLOR_PRIMARY_BLUE_BG,
} from '@/features/graph-data-table/ui/GraphDataTableToolbarStyles'
import { reorderList } from '@/lib/reorder'

const previewGalleryMoveButtonClassName = `text-xs ${UI_THEME_TOKENS.text.tertiary} ${UI_THEME_TOKENS.button.hoverBg} rounded px-1`
const previewGalleryActiveBadgeClassName = `px-1 py-0.5 rounded ${UI_INTENT_TOKENS.primary.bg} text-xs font-medium ${UI_INTENT_TOKENS.primary.text} uppercase tracking-normal`
export const PREVIEW_GALLERY_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2'
export type PreviewGalleryItem = {
  id: string
  label: string
  preview?: React.ReactNode
}

type PreviewGalleryProps = {
  items: PreviewGalleryItem[]
  activeId: string | null
  onSelect: (id: string) => void
  onReorder: (nextIds: string[]) => void
  showPreview?: boolean
  layout?: 'list' | 'grid'
  onHighlightChange?: (id: string | null) => void
  selectedIds?: string[]
  onSelectedIdsChange?: (ids: string[]) => void
  onDoubleClick?: (id: string) => void
  onContextMenu?: (id: string, e: React.MouseEvent) => void
}

export default function PreviewGallery({
  items,
  activeId,
  onSelect,
  onReorder,
  showPreview = true,
  layout = 'list',
  onHighlightChange,
  selectedIds,
  onSelectedIdsChange,
  onDoubleClick,
  onContextMenu,
}: PreviewGalleryProps) {
  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const [dragOverId, setDragOverId] = React.useState<string | null>(null)
  const [highlightId, setHighlightId] = React.useState<string | null>(null)
  const dragImageRef = React.useRef<HTMLElement | null>(null)
  const dragImageContainerRef = React.useRef<HTMLElement | null>(null)
  const dragImagePrimaryLabelRef = React.useRef<HTMLElement | null>(null)
  const dragImageSecondaryLabelRef = React.useRef<HTMLElement | null>(null)
  const dragImageStripRef = React.useRef<HTMLElement | null>(null)
  const dragImageActiveBadgeRef = React.useRef<HTMLElement | null>(null)

  const ids = React.useMemo(() => items.map(i => i.id), [items])
  const isGridLayout = layout === 'grid'
  const isDomNode = React.useCallback((v: unknown): v is Node => {
    try {
      return typeof Node !== 'undefined' && v instanceof Node
    } catch {
      return false
    }
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!onSelectedIdsChange || !selectedIds) return
    const rawKey = e.key
    const key = rawKey.toLowerCase()
    const metaOrCtrl = e.metaKey || e.ctrlKey
    if (metaOrCtrl && key === 'a') {
      e.preventDefault()
      onSelectedIdsChange(ids)
      return
    }
    if (key === 'escape') {
      if (!selectedIds.length) return
      e.preventDefault()
      onSelectedIdsChange([])
      return
    }
    if (!e.shiftKey && (rawKey === 'ArrowDown' || rawKey === 'ArrowUp')) {
      e.preventDefault()
      if (!ids.length) return
      const direction: 'up' | 'down' = rawKey === 'ArrowUp' ? 'up' : 'down'
      let baseIdx: number | null = null
      if (selectedIds.length) {
        const indexes = selectedIds
          .map(id => ids.indexOf(id))
          .filter(i => i >= 0)
          .sort((a, b) => a - b)
        if (!indexes.length) return
        baseIdx = direction === 'down' ? indexes[indexes.length - 1] : indexes[0]
      } else if (activeId) {
        const idxActive = ids.indexOf(activeId)
        baseIdx = idxActive >= 0 ? idxActive : 0
      } else {
        baseIdx = 0
      }
      if (baseIdx == null) return
      const nextIdx = direction === 'down' ? baseIdx + 1 : baseIdx - 1
      if (nextIdx < 0 || nextIdx >= ids.length) return
      const nextId = ids[nextIdx]
      onSelectedIdsChange([nextId])
      onSelect(nextId)
      return
    }
    if (e.shiftKey && (rawKey === 'ArrowDown' || rawKey === 'ArrowUp')) {
      e.preventDefault()
      if (!ids.length) return
      const direction: 'up' | 'down' = rawKey === 'ArrowUp' ? 'up' : 'down'
      const currentSelected = selectedIds
      if (!currentSelected.length) {
        let startIdx = activeId ? ids.indexOf(activeId) : 0
        if (startIdx < 0) startIdx = 0
        const startId = ids[startIdx]
        onSelectedIdsChange([startId])
        onSelect(startId)
        return
      }
      const indexes = currentSelected
        .map(id => ids.indexOf(id))
        .filter(i => i >= 0)
        .sort((a, b) => a - b)
      if (!indexes.length) return
      if (direction === 'down') {
        const maxIdx = indexes[indexes.length - 1]
        if (maxIdx >= ids.length - 1) return
        const nextIdx = maxIdx + 1
        const nextId = ids[nextIdx]
        const nextSelected = Array.from(new Set([...currentSelected, nextId]))
        onSelectedIdsChange(nextSelected)
        onSelect(nextId)
      } else {
        const minIdx = indexes[0]
        if (minIdx <= 0) return
        const nextIdx = minIdx - 1
        const nextId = ids[nextIdx]
        const nextSelected = Array.from(new Set([...currentSelected, nextId]))
        onSelectedIdsChange(nextSelected)
        onSelect(nextId)
      }
    }
  }

  return (
    <section
      className={`p-2 rounded outline-none ${UI_THEME_TOKENS.focus.primaryRing}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="Slides"
    >
      <header className="mb-2">
        <h3 className={`text-xs font-medium ${UI_THEME_TOKENS.text.primary}`}>Slides</h3>
        <p className={`mt-0.5 text-xs ${UI_THEME_TOKENS.text.tertiary}`}>
          Drag or use arrows to reorder
        </p>
      </header>
      <ul className={isGridLayout ? PREVIEW_GALLERY_GRID_CLASS_NAME : 'space-y-3'}>
        {!isGridLayout && items.length > 0 && draggingId ? (
          <li
            className={`h-6 flex items-center justify-center ${UI_COLOR_PRIMARY_BLUE_BG} border-y-2 cursor-move transition-colors rounded`}
            style={{ borderColor: UI_COLOR_PRIMARY_BLUE_INDICATOR }}
            onDragEnter={(e) => {
              e.preventDefault()
              const dt = e.dataTransfer
              if (dt) dt.dropEffect = 'move'
              const first = items[0]
              setDragOverId(first.id)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              const dt = e.dataTransfer
              if (dt) dt.dropEffect = 'move'
              const first = items[0]
              setDragOverId(first.id)
            }}
            onDrop={(e) => {
              e.preventDefault()
              const dt = e.dataTransfer
              const from = dt ? dt.getData('text/plain') || '' : ''
              if (!from) return
              let nextIds = ids.slice()
              if (selectedIds && selectedIds.length > 1 && onSelectedIdsChange) {
                const selectedSet = new Set(selectedIds)
                const moving = nextIds.filter(id => selectedSet.has(id))
                const staying = nextIds.filter(id => !selectedSet.has(id))
                nextIds = [...moving, ...staying]
              } else {
                const fromIdxDrop = ids.indexOf(from)
                if (fromIdxDrop < 0) return
                const toIdxDrop = 0
                nextIds = reorderList(ids, fromIdxDrop, toIdxDrop)
              }
              onReorder(nextIds)
              setDraggingId(null)
              setDragOverId(null)
              setHighlightId(null)
              if (onHighlightChange) onHighlightChange(null)
            }}
          >
            <section
              className="w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent"
              style={{ borderBottomColor: UI_COLOR_PRIMARY_BLUE_INDICATOR }}
            />
          </li>
        ) : null}
        {items.map((it, idx) => {
          const isActive = activeId === it.id
          const isSelected = selectedIds ? selectedIds.includes(it.id) : false
          const isFocused = highlightId === it.id
          const isDragOver = dragOverId === it.id
          const isDragging = draggingId === it.id
          const isDraggingAny = !!draggingId
          const fromIdx = draggingId ? ids.indexOf(draggingId) : -1
          const showTopDivider = isDragOver && !isDragging && fromIdx > idx
          const showBottomDivider = isDragOver && !isDragging && fromIdx >= 0 && fromIdx < idx
          return (
            <li key={it.id} className="relative">
              {!isGridLayout && showTopDivider ? (
                <section
                  className={`absolute left-0 right-0 -top-2 h-5 flex items-center justify-center ${UI_INTENT_TOKENS.primary.bg} border-t-2 cursor-move transition-colors`}
                  style={{ borderTopColor: UI_COLOR_PRIMARY_BLUE_INDICATOR }}
                  onDragEnter={(e) => {
                    e.preventDefault()
                    const dt = e.dataTransfer
                    if (dt) dt.dropEffect = 'move'
                    setDragOverId(it.id)
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    const dt = e.dataTransfer
                    if (dt) dt.dropEffect = 'move'
                    setDragOverId(it.id)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const dt = e.dataTransfer
                    const from = dt ? dt.getData('text/plain') || '' : ''
                    if (!from) return
                    const fromIdxDrop = ids.indexOf(from)
                    const toIdxDrop = idx
                    if (fromIdxDrop < 0 || toIdxDrop < 0) return
                    const nextIds = reorderList(ids, fromIdxDrop, toIdxDrop)
                    onReorder(nextIds)
                    setDraggingId(null)
                    setDragOverId(null)
                    setHighlightId(null)
                    if (onHighlightChange) onHighlightChange(null)
                  }}
                >
                  <section
                    className="w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent"
                    style={{ borderBottomColor: UI_COLOR_PRIMARY_BLUE_INDICATOR }}
                  />
                </section>
              ) : null}
              {!isGridLayout && showBottomDivider ? (
                <section
                  className={`absolute left-0 right-0 -bottom-2 h-5 flex items-center justify-center ${UI_INTENT_TOKENS.primary.bg} border-b-2 cursor-move transition-colors`}
                  style={{ borderBottomColor: UI_COLOR_PRIMARY_BLUE_INDICATOR }}
                  onDragEnter={(e) => {
                    e.preventDefault()
                    const dt = e.dataTransfer
                    if (dt) dt.dropEffect = 'move'
                    setDragOverId(it.id)
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    const dt = e.dataTransfer
                    if (dt) dt.dropEffect = 'move'
                    setDragOverId(it.id)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const dt = e.dataTransfer
                    const from = dt ? dt.getData('text/plain') || '' : ''
                    if (!from) return
                    const fromIdxDrop = ids.indexOf(from)
                    const toIdxRaw = idx + 1
                    const toIdxDrop = Math.min(items.length - 1, toIdxRaw)
                    if (fromIdxDrop < 0 || toIdxDrop < 0) return
                    const nextIds = reorderList(ids, fromIdxDrop, toIdxDrop)
                    onReorder(nextIds)
                    setDraggingId(null)
                    setDragOverId(null)
                    setHighlightId(null)
                    if (onHighlightChange) onHighlightChange(null)
                  }}
                >
                  <section
                    className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent"
                    style={{ borderTopColor: UI_COLOR_PRIMARY_BLUE_INDICATOR }}
                  />
                </section>
              ) : null}
              <section
                className={[
                  'relative rounded border px-2 py-2 select-none',
                  isDraggingAny
                    ? `${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`
                    : isActive
                      ? uiToolbarToggleActiveClassName
                      : isFocused
                        ? uiSecondaryToggleActiveClassName
                        : isSelected
                          ? `${UI_THEME_TOKENS.table.rowSelected}`
                          : `${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.table.rowHoverHighlight}`,
                  isDragOver ? ['ring-1', UI_RING_PRIMARY_BLUE_INDICATOR].join(' ') : '',
                ].filter(Boolean).join(' ')}
                draggable
                onClick={(e) => {
                  if (onContextMenu && (e.ctrlKey || e.metaKey)) {
                     e.preventDefault()
                     onContextMenu(it.id, e)
                     return
                  }
                  
                  if (!onSelectedIdsChange || !selectedIds) {
                    onSelect(it.id)
                    return
                  }
                  const isMeta = e.metaKey || e.ctrlKey
                  const isShift = e.shiftKey
                  if (!isMeta && !isShift) {
                    onSelectedIdsChange([it.id])
                    onSelect(it.id)
                    return
                  }
                  if (isShift) {
                    const currentIds = ids
                    const lastSelectedId = selectedIds[selectedIds.length - 1] || activeId || it.id
                    const startIdx = currentIds.indexOf(lastSelectedId)
                    const endIdx = currentIds.indexOf(it.id)
                    if (startIdx >= 0 && endIdx >= 0) {
                      const [fromIdxRange, toIdxRange] =
                        startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
                      const range = currentIds.slice(fromIdxRange, toIdxRange + 1)
                      onSelectedIdsChange(Array.from(new Set([...selectedIds, ...range])))
                    } else {
                      onSelectedIdsChange([it.id])
                    }
                    onSelect(it.id)
                    return
                  }
                  if (isMeta) {
                    const exists = selectedIds.includes(it.id)
                    const nextSelected = exists
                      ? selectedIds.filter(x => x !== it.id)
                      : [...selectedIds, it.id]
                    onSelectedIdsChange(nextSelected.length ? nextSelected : [it.id])
                    onSelect(it.id)
                  }
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  if (onDoubleClick) onDoubleClick(it.id)
                }}
                onContextMenu={(e) => {
                  if (onContextMenu) {
                    e.preventDefault()
                    onContextMenu(it.id, e)
                  }
                }}
                onDragStart={(e) => {
                  setDraggingId(it.id)
                  setDragOverId(it.id)
                  setHighlightId(null)
                  if (onHighlightChange) onHighlightChange(null)
                  const dt = e.dataTransfer
                  if (dt) {
                    dt.effectAllowed = 'move'
                    dt.setData('text/plain', it.id)
                    const dragImage = dragImageRef.current
                    const container = dragImageContainerRef.current
                    const primary = dragImagePrimaryLabelRef.current
                    const secondary = dragImageSecondaryLabelRef.current
                    const strip = dragImageStripRef.current
                    const activeBadge = dragImageActiveBadgeRef.current
                    if (dragImage && container && primary && secondary && strip && activeBadge && typeof dt.setDragImage === 'function') {
                      primary.textContent = `#${idx + 1}`
                      secondary.textContent = it.label
                      if (isActive) {
                        strip.style.backgroundColor = UI_COLOR_PRIMARY_BLUE_INDICATOR
                        container.style.borderColor = UI_COLOR_PRIMARY_BLUE_INDICATOR
                        primary.style.color = '#1D4ED8'
                        primary.style.fontWeight = '700'
                        secondary.style.color = '#4B5563'
                        activeBadge.style.display = ''
                      } else {
                        strip.style.backgroundColor = '#D1D5DB'
                        container.style.borderColor = '#D1D5DB'
                        primary.style.color = '#111827'
                        primary.style.fontWeight = '600'
                        secondary.style.color = '#D1D5DB'
                        activeBadge.style.display = 'none'
                      }
                      dt.setDragImage(dragImage, 12, 12)
                    }
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  const dt = e.dataTransfer
                  if (dt) dt.dropEffect = 'move'
                  setDragOverId(it.id)
                }}
                onDragEnter={(e) => {
                  e.preventDefault()
                  const dt = e.dataTransfer
                  if (dt) dt.dropEffect = 'move'
                  setDragOverId(it.id)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const dt = e.dataTransfer
                  const from = dt ? dt.getData('text/plain') || '' : ''
                  if (!from) return
                  const fromIdxDrop = ids.indexOf(from)
                  if (fromIdxDrop < 0) return
                  const toIdxBase = idx
                  if (toIdxBase < 0) return
                  if (fromIdxDrop === toIdxBase) return
                  let nextIds = ids.slice()
                  if (selectedIds && selectedIds.length > 1 && onSelectedIdsChange) {
                    const selectedSet = new Set(selectedIds)
                    const moving = nextIds.filter(id => selectedSet.has(id))
                    const staying = nextIds.filter(id => !selectedSet.has(id))
                    const targetId = nextIds[toIdxBase]
                    const targetIdxStaying = staying.indexOf(targetId)
                    if (targetIdxStaying < 0) return
                    const insertIdx = targetIdxStaying + (fromIdxDrop < toIdxBase ? 1 : 0)
                    staying.splice(insertIdx, 0, ...moving)
                    nextIds = staying
                  } else {
                    let toIdxDrop = toIdxBase
                    if (fromIdxDrop < toIdxBase) {
                      const toIdxRaw = toIdxBase + 1
                      toIdxDrop = Math.min(items.length - 1, toIdxRaw)
                    }
                    nextIds = reorderList(ids, fromIdxDrop, toIdxDrop)
                  }
                  onReorder(nextIds)
                  setDraggingId(null)
                  setDragOverId(null)
                  setHighlightId(null)
                  if (onHighlightChange) onHighlightChange(null)
                }}
                onDragEnd={() => {
                  setDraggingId(null)
                  setDragOverId(null)
                  setHighlightId(null)
                  if (onHighlightChange) onHighlightChange(null)
                }}
                onDragLeave={(e) => {
                  const related = e.relatedTarget
                  if (!isDomNode(related) || !e.currentTarget.contains(related)) {
                    setDragOverId(null)
                    setHighlightId(null)
                    if (onHighlightChange) onHighlightChange(null)
                  }
                }}
                onMouseEnter={() => {
                  if (draggingId) return
                  setHighlightId(it.id)
                  if (onHighlightChange) onHighlightChange(it.id)
                }}
                onMouseLeave={(e) => {
                  if (draggingId) return
                  const related = e.relatedTarget
                  if (!isDomNode(related) || !e.currentTarget.contains(related)) {
                    setHighlightId(null)
                    if (onHighlightChange) onHighlightChange(null)
                  }
                }}
              >
                {showPreview && it.preview ? (
                  <section className="mb-2">
                    <section className={`w-full aspect-video overflow-hidden rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`}>
                      <section className="w-full h-full flex items-center justify-center">
                        <section className="w-full h-full overflow-hidden">
                          {it.preview}
                        </section>
                      </section>
                    </section>
                  </section>
                ) : null}
                <header className="flex items-center justify-between gap-2">
                  <section className="min-w-0">
                    <section className={`text-xs ${UI_THEME_TOKENS.text.primary} truncate`}>{it.label}</section>
                    <section className={`text-xs ${UI_THEME_TOKENS.text.tertiary}`}>#{idx + 1}</section>
                  </section>
                  <section className="flex flex-col items-end gap-1">
                    <section className="flex items-center gap-1">
                      {idx > 0 ? (
                        <button
                          type="button"
                          className={previewGalleryMoveButtonClassName}
                          onClick={(e) => {
                            e.stopPropagation()
                            const fromIdxClick = idx
                            const toIdxClick = Math.max(0, fromIdxClick - 1)
                            if (fromIdxClick < 0 || toIdxClick < 0 || fromIdxClick === toIdxClick) return
                            const nextIds = reorderList(ids, fromIdxClick, toIdxClick)
                            onReorder(nextIds)
                          }}
                        >
                          ↑
                        </button>
                      ) : null}
                      {idx < items.length - 1 ? (
                        <button
                          type="button"
                          className={previewGalleryMoveButtonClassName}
                          onClick={(e) => {
                            e.stopPropagation()
                            const fromIdxClick = idx
                            const toIdxClick = Math.min(items.length - 1, fromIdxClick + 1)
                            if (fromIdxClick < 0 || toIdxClick < 0 || fromIdxClick === toIdxClick) return
                            const nextIds = reorderList(ids, fromIdxClick, toIdxClick)
                            onReorder(nextIds)
                          }}
                        >
                          ↓
                        </button>
                      ) : null}
                    </section>
                    {isDragging ? <section className={`text-xs ${UI_THEME_TOKENS.text.tertiary}`}>Moving</section> : null}
                  </section>
                </header>
              </section>
            </li>
          )
        })}
        {!isGridLayout && items.length > 0 && draggingId ? (
          <li
            className={`h-6 flex items-center justify-center ${UI_INTENT_TOKENS.primary.bg} border-y-2 cursor-move transition-colors rounded`}
            style={{ borderColor: UI_COLOR_PRIMARY_BLUE_INDICATOR }}
            onDragOver={(e) => {
              e.preventDefault()
              const dt = e.dataTransfer
              if (dt) dt.dropEffect = 'move'
              const last = items[items.length - 1]
              setDragOverId(last.id)
            }}
            onDrop={(e) => {
              e.preventDefault()
              const dt = e.dataTransfer
              const from = dt ? dt.getData('text/plain') || '' : ''
              if (!from) return
              let nextIds = ids.slice()
              if (selectedIds && selectedIds.length > 1 && onSelectedIdsChange) {
                const selectedSet = new Set(selectedIds)
                const moving = nextIds.filter(id => selectedSet.has(id))
                const staying = nextIds.filter(id => !selectedSet.has(id))
                nextIds = [...staying, ...moving]
              } else {
                const fromIdxDrop = ids.indexOf(from)
                if (fromIdxDrop < 0) return
                const toIdxDrop = Math.max(0, items.length - 1)
                nextIds = reorderList(ids, fromIdxDrop, toIdxDrop)
              }
              onReorder(nextIds)
              setDraggingId(null)
              setDragOverId(null)
              setHighlightId(null)
              if (onHighlightChange) onHighlightChange(null)
            }}
          >
            <section
              className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent"
              style={{ borderTopColor: UI_COLOR_PRIMARY_BLUE_INDICATOR }}
            />
          </li>
        ) : null}
      </ul>
      <section
        ref={dragImageRef}
        className="fixed top-0 left-0 pointer-events-none z-50"
      >
        <section
          ref={dragImageContainerRef}
          className={`flex items-stretch rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} shadow-md ${UI_RESPONSIVE_PREVIEW_GALLERY_DRAG_CARD_CLASSNAME}`}
        >
          <section
            ref={dragImageStripRef}
            className="w-1.5 rounded-l"
            style={{ backgroundColor: UI_COLOR_PRIMARY_BLUE_INDICATOR }}
          />
          <section className="px-3 py-1.5 flex flex-col">
            <section
              ref={dragImagePrimaryLabelRef}
              className={`text-xs font-semibold ${UI_THEME_TOKENS.text.primary} leading-tight`}
            >
              #1
            </section>
            <section className="flex items-center gap-1">
              <section
                ref={dragImageSecondaryLabelRef}
                className={`text-xs ${UI_THEME_TOKENS.text.secondary} leading-tight truncate`}
              >
                Slide title
              </section>
              <section
                ref={dragImageActiveBadgeRef}
                className={previewGalleryActiveBadgeClassName}
              >
                Active
              </section>
            </section>
          </section>
        </section>
      </section>
    </section>
  )
}
