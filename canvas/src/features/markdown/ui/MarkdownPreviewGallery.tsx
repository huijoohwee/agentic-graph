import React from 'react'
import { buildKanbanCardDropIntentLabel } from '@/features/markdown/ui/kanban/kanbanDragIntent'
import { getKanbanCardDragVisualState } from '@/features/markdown/ui/kanban/kanbanDragVisualState'
import { isInteractiveEventTarget } from '@/features/markdown/ui/kanban/kanbanMenu'
import {
  areKanbanRowIdsEqual,
  reconcileKanbanRowIds,
} from '@/features/markdown/ui/kanban/kanbanOrderState'
import { reorderKanbanRowIds, type KanbanDropPosition } from '@/features/markdown/ui/kanban/kanbanReorder'
import { KanbanCardDropPreview } from '@/features/markdown/ui/kanban/KanbanDropPreview'
import {
  type KanbanCardDragProps,
  type KanbanCardDropProps,
  useKanbanDragAndDrop,
} from '@/features/markdown/ui/kanban/useKanbanDragAndDrop'
import { splitMarkdownLines } from '@/lib/markdown'
import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'
import {
  UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME,
  UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import {
  UI_RESPONSIVE_VIEWPORT_FIT_GRID_CLASSNAME,
  buildResponsiveViewportFitGridStyle,
} from '@/lib/ui/responsiveViewportFitGrid'
import {
  buildZoomScaledCssLength,
  readScrollSurfaceZoomScale,
} from '@/lib/canvas/scrollSurfaceZoom'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { Slide } from './markdownPreviewSlides'

const MARKDOWN_GALLERY_GROUP_KEY = 'markdown-gallery'
const MARKDOWN_GALLERY_CARD_BASE_WIDTH_PX = 390
const MARKDOWN_GALLERY_CARD_MIN_WIDTH_PX = 220
const MARKDOWN_GALLERY_CARD_MAX_WIDTH_PX = 680
const MARKDOWN_GALLERY_CARD_ASPECT_RATIO = '16 / 9'
const MARKDOWN_GALLERY_CARD_CONTENT_ASPECT_RATIO = MARKDOWN_GALLERY_CARD_ASPECT_RATIO
const MARKDOWN_GALLERY_CARD_HEADER_CHROME_PX = 32
const MARKDOWN_GALLERY_CARD_FOOTER_CHROME_PX = 62

type GallerySlideTextField = 'title' | 'summary'
type GallerySlideTextOverride = Partial<Record<GallerySlideTextField, string>>

type MarkdownPreviewGalleryProps = {
  slides: Slide[]
  orderedSlideIndices: number[]
  activeSlideId: number
  slideOrder: number[]
  slideCount: number
  activeSlideHeading: string
  showSlideThumbnails: boolean
  uiPanelTextFontClass: string
  zoomScale?: number
  onActiveSlideIndexChange: (index: number) => void
  onSlideOrderChange: (nextOrder: number[]) => void
  renderSlidePreview: (slideIdx: number) => React.ReactNode
  onSlideDoubleClick?: (slideIdx: number) => void
  onSlideContextMenu?: (slideIdx: number, event: React.MouseEvent) => void
}

type GallerySlideCard = {
  id: string
  slideIdx: number
  position: number
  startLine: number
  endLine: number
  baseTitle: string
  baseSummary: string
  title: string
  summary: string
  preview: React.ReactNode
}

const normalizeGalleryText = (value: string): string => String(value || '').trim()

const readSlideHeading = (slide: Slide, fallback: string): string => {
  const lines = splitMarkdownLines(slide.text || '')
  for (const line of lines) {
    const trimmed = String(line || '').trim()
    if (!trimmed.startsWith('#')) continue
    const heading = trimmed.replace(/^#+\s*/, '').trim()
    if (heading) return heading
  }
  for (const line of lines) {
    const trimmed = String(line || '').trim()
    if (!trimmed || trimmed.startsWith('---')) continue
    return trimmed.length > 72 ? `${trimmed.slice(0, 71)}...` : trimmed
  }
  return fallback
}

const readSlideSummary = (slide: Slide): string => {
  const lines = splitMarkdownLines(slide.text || '')
  const out: string[] = []
  let inFence = false
  let fenceMarker = ''
  for (const line of lines) {
    const trimmed = String(line || '').trim()
    const fenceMatch = trimmed.match(/^(```+|~~~+)/)
    if (fenceMatch) {
      const marker = fenceMatch[1] || ''
      if (!inFence) {
        inFence = true
        fenceMarker = marker
      } else if (marker === fenceMarker) {
        inFence = false
        fenceMarker = ''
      }
      continue
    }
    if (inFence || !isGallerySummaryCandidateLine(trimmed)) continue
    out.push(trimmed)
    if (out.length >= 2) break
  }
  return out.join('\n')
}

const hasGallerySlideTextOverride = (value: GallerySlideTextOverride | undefined): value is GallerySlideTextOverride => {
  return !!value && (!!value.title || !!value.summary)
}

const isGallerySummaryCandidateLine = (trimmed: string): boolean => {
  if (!trimmed) return false
  if (trimmed.startsWith('#') || trimmed.startsWith('---') || trimmed === '::right::') return false
  if (trimmed.startsWith('|') && trimmed.endsWith('|')) return false
  if (/^\|?[\s:-]+\|[\s|:-]*$/.test(trimmed)) return false
  if (/^[A-Za-z0-9_.-]+\s*:\s*(?:$|["'[{]|true\b|false\b|\d)/.test(trimmed)) return false
  return /[A-Za-z0-9]/.test(trimmed)
}

const readGallerySlideTextField = (card: GallerySlideCard, field: GallerySlideTextField): string => {
  return field === 'title' ? card.baseTitle : card.baseSummary
}

function MarkdownPreviewGalleryCard(props: {
  card: GallerySlideCard
  selected: boolean
  showPreview: boolean
  canEditCardText: boolean
  uiPanelTextFontClass: string
  cardDragProps: KanbanCardDragProps
  cardDropProps: KanbanCardDropProps
  draggingCardId: string | null
  dragOverCardId: string | null
  dragOverPosition: KanbanDropPosition
  commitFlashCardId: string | null
  registerCardElement: (cardId: string, element: HTMLElement | null) => void
  onSelect: (slideIdx: number) => void
  onOpen: (slideIdx: number) => void
  onContextMenu?: (slideIdx: number, event: React.MouseEvent) => void
  onCommitCardText: (cardId: string, field: GallerySlideTextField, nextValue: string) => void
}) {
  const {
    card,
    cardDragProps,
    cardDropProps,
    commitFlashCardId,
    dragOverCardId,
    dragOverPosition,
    draggingCardId,
  } = props
  const dragging = draggingCardId === card.id
  const dropTarget = dragOverCardId === card.id
  const cardDragVisualState = getKanbanCardDragVisualState({
    hasActiveDrag: draggingCardId !== null,
    isDragging: dragging,
    isDropTarget: dropTarget,
    isCommitFlash: commitFlashCardId === card.id,
  })

  return (
    <article
      className={[
        'relative min-w-0 overflow-hidden rounded-md border p-0 shadow-sm transition-transform duration-150',
        UI_THEME_TOKENS.panel.bg,
        props.selected ? 'border-blue-300 ring-1 ring-blue-300' : UI_THEME_TOKENS.panel.border,
        cardDragVisualState.className,
        dragging ? '' : 'hover:-translate-y-[1px]',
      ].join(' ')}
      style={{
        ...cardDragVisualState.style,
        aspectRatio: MARKDOWN_GALLERY_CARD_ASPECT_RATIO,
      }}
      ref={element => props.registerCardElement(card.id, element)}
      data-kg-markdown-gallery-card={card.id}
      data-kg-markdown-gallery-card-draggable="1"
      tabIndex={0}
      role="button"
      aria-pressed={props.selected}
      aria-grabbed={cardDragProps.draggable ? dragging : undefined}
      aria-label={`Gallery card ${card.title}`}
      {...cardDropProps}
      draggable={cardDragProps.draggable}
      onDragStart={cardDragProps.onDragStart}
      onDragEnd={cardDragProps.onDragEnd}
      onClick={event => {
        if (isInteractiveEventTarget(event.target)) return
        props.onSelect(card.slideIdx)
      }}
      onDoubleClick={event => {
        if (isInteractiveEventTarget(event.target)) return
        event.preventDefault()
        props.onOpen(card.slideIdx)
      }}
      onContextMenu={event => {
        if (!props.onContextMenu) return
        event.preventDefault()
        props.onContextMenu(card.slideIdx, event)
      }}
      onKeyDown={event => {
        if (isInteractiveEventTarget(event.target)) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          props.onSelect(card.slideIdx)
        }
      }}
    >
      {dropTarget ? (
        <KanbanCardDropPreview
          position={dragOverPosition}
          label={buildKanbanCardDropIntentLabel({
            position: dragOverPosition,
            targetCardLabel: card.title,
            targetLaneLabel: 'Gallery',
          })}
        />
      ) : null}
      <header
        className={`absolute inset-x-0 top-0 z-20 min-w-0 cursor-grab select-none border-b border-[var(--kg-border)] px-2.5 py-1.5 active:cursor-grabbing ${UI_THEME_TOKENS.panel.bg}`}
        data-kg-markdown-gallery-card-drag-region="1"
        data-kg-markdown-gallery-card-chrome="solid"
      >
        <section className="min-w-0" data-kg-markdown-gallery-card-inline-edit="title">
          <CardInlineTextEditor
            value={card.title}
            ariaLabel={`Gallery card title for ${card.id}`}
            placeholder="Add card title"
            canEdit={props.canEditCardText}
            onCommit={nextValue => props.onCommitCardText(card.id, 'title', nextValue)}
            displayClassName={`m-0 truncate text-xs font-semibold leading-4 ${UI_THEME_TOKENS.text.primary}`}
            editorClassName={`${UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME} text-xs font-semibold leading-4`}
          />
        </section>
      </header>
      {props.showPreview ? (
        <section
          className={`absolute inset-0 z-0 min-w-0 ${props.uiPanelTextFontClass}`}
          data-kg-markdown-gallery-card-preview="1"
        >
          <section
            className={`kg-markdown-gallery-card-preview-frame h-full w-full overflow-hidden ${UI_THEME_TOKENS.panel.bg}`}
            style={{
              aspectRatio: MARKDOWN_GALLERY_CARD_CONTENT_ASPECT_RATIO,
              paddingBlockStart: MARKDOWN_GALLERY_CARD_HEADER_CHROME_PX,
              paddingBlockEnd: MARKDOWN_GALLERY_CARD_FOOTER_CHROME_PX,
            }}
            data-kg-markdown-gallery-card-content-aspect-ratio={MARKDOWN_GALLERY_CARD_CONTENT_ASPECT_RATIO}
            data-kg-markdown-gallery-card-content-reserves-chrome="1"
          >
            {card.preview}
          </section>
        </section>
      ) : null}
      <section
        className={`absolute inset-x-0 bottom-0 z-20 max-h-[30%] min-h-8 overflow-y-auto border-t border-[var(--kg-border)] px-2.5 py-1.5 ${UI_THEME_TOKENS.panel.bg}`}
        data-kg-markdown-gallery-card-scrollable="1"
        data-kg-markdown-gallery-card-chrome="solid"
      >
        <section className="min-w-0" data-kg-markdown-gallery-card-inline-edit="summary">
          <CardInlineTextEditor
            value={card.summary}
            ariaLabel={`Gallery card summary for ${card.id}`}
            placeholder="Add card summary"
            canEdit={props.canEditCardText}
            multiline
            markdownPreview="auto"
            rows={3}
            onCommit={nextValue => props.onCommitCardText(card.id, 'summary', nextValue)}
            displayClassName={`m-0 line-clamp-2 text-xs leading-4 ${UI_THEME_TOKENS.text.secondary}`}
            editorClassName={`${UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME} text-xs leading-4`}
          />
        </section>
        <p
          className={`m-0 mt-1 text-xs font-medium uppercase leading-3 ${UI_THEME_TOKENS.text.tertiary}`}
          data-kg-markdown-gallery-card-source-meta="1"
        >
          Slide {card.position + 1} / Lines {card.startLine}-{card.endLine}
        </p>
      </section>
    </article>
  )
}

export function MarkdownPreviewGallery(props: MarkdownPreviewGalleryProps) {
  const {
    activeSlideHeading,
    activeSlideId,
    onActiveSlideIndexChange,
    onSlideOrderChange,
    orderedSlideIndices,
    renderSlidePreview,
    showSlideThumbnails,
    slideCount,
    slideOrder,
    slides,
    uiPanelTextFontClass,
    onSlideContextMenu,
    onSlideDoubleClick,
    zoomScale,
  } = props
  const scrollRef = React.useRef<HTMLElement | null>(null)
  const [selectedSlideIds, setSelectedSlideIds] = React.useState<string[]>([])
  const [cardTextOverrides, setCardTextOverrides] = React.useState<Record<string, GallerySlideTextOverride>>({})
  const safeZoomScale = readScrollSurfaceZoomScale(zoomScale)
  const galleryCardTrackInlineSize = React.useMemo(
    () => buildZoomScaledCssLength({
      basePx: MARKDOWN_GALLERY_CARD_BASE_WIDTH_PX,
      scale: safeZoomScale,
      minPx: MARKDOWN_GALLERY_CARD_MIN_WIDTH_PX,
      maxPx: MARKDOWN_GALLERY_CARD_MAX_WIDTH_PX,
    }),
    [safeZoomScale],
  )
  const galleryGridStyle = React.useMemo(
    () => buildResponsiveViewportFitGridStyle({
      minInlineSize: galleryCardTrackInlineSize,
      trackMode: 'fixed',
    }),
    [galleryCardTrackInlineSize],
  )
  const orderedSlideIds = React.useMemo(
    () => reconcileKanbanRowIds(
      slideOrder.map(id => String(id)),
      orderedSlideIndices.map(id => String(id)),
    ),
    [orderedSlideIndices, slideOrder],
  )
  const orderedSlideIdsKey = orderedSlideIds.join('\u0000')

  React.useEffect(() => {
    setSelectedSlideIds([String(activeSlideId)])
  }, [activeSlideId])

  React.useEffect(() => {
    setCardTextOverrides(current => {
      const valid = new Set(orderedSlideIds)
      let changed = false
      const next: Record<string, GallerySlideTextOverride> = {}
      for (const [cardId, override] of Object.entries(current)) {
        if (!valid.has(cardId)) {
          changed = true
          continue
        }
        next[cardId] = override
      }
      return changed ? next : current
    })
  }, [orderedSlideIdsKey, orderedSlideIds])

  const cards = React.useMemo<GallerySlideCard[]>(() => {
    return orderedSlideIds.map((id, position) => {
      const slideIdx = Number.parseInt(id, 10)
      const slide = slides[slideIdx]
      if (!slide) return null
      const baseTitle = readSlideHeading(slide, `Slide ${position + 1}`)
      const baseSummary = readSlideSummary(slide)
      const override = cardTextOverrides[id]
      return {
        id,
        slideIdx,
        position,
        startLine: slide.startLine,
        endLine: slide.endLine,
        baseTitle,
        baseSummary,
        title: override?.title || baseTitle,
        summary: override?.summary || baseSummary,
        preview: renderSlidePreview(slideIdx),
      }
    }).filter(Boolean) as GallerySlideCard[]
  }, [cardTextOverrides, orderedSlideIds, renderSlidePreview, slides])

  const galleryDrag = useKanbanDragAndDrop({
    enabled: cards.length > 1,
    getBoardScrollElement: () => scrollRef.current,
    getLaneScrollElement: () => scrollRef.current,
    isNoOpMove: move => {
      if (move.sourceGroupKey !== MARKDOWN_GALLERY_GROUP_KEY || move.targetGroupKey !== MARKDOWN_GALLERY_GROUP_KEY) return true
      const currentOrder = reconcileKanbanRowIds(orderedSlideIds, orderedSlideIds)
      if (!currentOrder.includes(move.rowId)) return true
      const rowIdToGroupKey = new Map(currentOrder.map(id => [id, MARKDOWN_GALLERY_GROUP_KEY]))
      const nextOrder = reorderKanbanRowIds({
        orderedRowIds: currentOrder,
        availableRowIds: currentOrder,
        rowIdToGroupKey,
        draggedRowId: move.rowId,
        targetGroupKey: move.targetGroupKey,
        targetRowId: move.targetRowId,
        position: move.position,
      })
      return areKanbanRowIdsEqual(currentOrder, nextOrder)
    },
    onCommitMove: move => {
      if (move.sourceGroupKey !== MARKDOWN_GALLERY_GROUP_KEY || move.targetGroupKey !== MARKDOWN_GALLERY_GROUP_KEY) return
      const currentOrder = reconcileKanbanRowIds(orderedSlideIds, orderedSlideIds)
      if (!currentOrder.includes(move.rowId)) return
      const rowIdToGroupKey = new Map(currentOrder.map(id => [id, MARKDOWN_GALLERY_GROUP_KEY]))
      const nextOrder = reorderKanbanRowIds({
        orderedRowIds: currentOrder,
        availableRowIds: currentOrder,
        rowIdToGroupKey,
        draggedRowId: move.rowId,
        targetGroupKey: move.targetGroupKey,
        targetRowId: move.targetRowId,
        position: move.position,
      })
      if (areKanbanRowIdsEqual(currentOrder, nextOrder)) return
      const nextSlideOrder = nextOrder
        .map(id => Number.parseInt(id, 10))
        .filter(id => Number.isFinite(id))
      onSlideOrderChange(nextSlideOrder)
      const nextActivePosition = nextSlideOrder.indexOf(activeSlideId)
      if (nextActivePosition >= 0) onActiveSlideIndexChange(nextActivePosition)
    },
  })

  const handleSelectSlide = React.useCallback((slideIdx: number) => {
    const pos = orderedSlideIds.indexOf(String(slideIdx))
    if (pos < 0) return
    setSelectedSlideIds([String(slideIdx)])
    onActiveSlideIndexChange(pos)
  }, [onActiveSlideIndexChange, orderedSlideIds])

  const handleOpenSlide = React.useCallback((slideIdx: number) => {
    handleSelectSlide(slideIdx)
    onSlideDoubleClick?.(slideIdx)
  }, [handleSelectSlide, onSlideDoubleClick])

  const commitCardTextOverride = React.useCallback((cardId: string, field: GallerySlideTextField, nextValue: string) => {
    const id = String(cardId || '').trim()
    if (!id) return
    const card = cards.find(item => item.id === id)
    if (!card) return
    const baseValue = readGallerySlideTextField(card, field)
    const normalized = normalizeGalleryText(nextValue)
    setCardTextOverrides(current => {
      const currentEntry = current[id] || {}
      const nextEntry: GallerySlideTextOverride = { ...currentEntry }
      if (!normalized || normalized === baseValue) {
        delete nextEntry[field]
      } else {
        nextEntry[field] = normalized
      }
      if (!hasGallerySlideTextOverride(nextEntry) && !current[id]) return current
      const next = { ...current }
      if (hasGallerySlideTextOverride(nextEntry)) next[id] = nextEntry
      else delete next[id]
      return next
    })
  }, [cards])

  return (
    <section
      className={`flex min-h-0 flex-1 flex-col ${uiPanelTextFontClass} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary}`}
      data-kg-markdown-gallery="1"
      data-kg-markdown-gallery-zoom-scale={safeZoomScale}
      data-kg-markdown-gallery-card-aspect-ratio={MARKDOWN_GALLERY_CARD_ASPECT_RATIO}
    >
      <header className="flex min-w-0 items-center gap-3 border-b border-[var(--kg-border)] px-3 py-3">
        <section className="min-w-0">
          <h3 className={`m-0 truncate text-sm font-semibold ${UI_THEME_TOKENS.text.primary}`}>Gallery</h3>
          <p className={`m-0 mt-0.5 truncate text-xs ${UI_THEME_TOKENS.text.tertiary}`}>
            {slideCount} slides{activeSlideHeading ? ` / ${activeSlideHeading}` : ''}
          </p>
        </section>
      </header>
      <section ref={scrollRef} className="min-h-0 flex-1 overflow-auto p-3" data-kg-markdown-gallery-scroll-surface="1">
        <ol
          className={`${UI_RESPONSIVE_VIEWPORT_FIT_GRID_CLASSNAME} list-none p-0 m-0`}
          style={galleryGridStyle}
          data-kg-markdown-gallery-grid="1"
          data-kg-markdown-gallery-grid-fixed-track="1"
          data-kg-markdown-gallery-card-inline-size={galleryCardTrackInlineSize}
          {...galleryDrag.createLaneDropProps(MARKDOWN_GALLERY_GROUP_KEY)}
        >
          {cards.map(card => {
            const cardDragProps = galleryDrag.createCardDragProps({ rowId: card.id, groupKey: MARKDOWN_GALLERY_GROUP_KEY })
            const cardDropProps = galleryDrag.createCardDropProps({ rowId: card.id, groupKey: MARKDOWN_GALLERY_GROUP_KEY })
            return (
              <li key={card.id} className="min-w-0 list-none">
                <MarkdownPreviewGalleryCard
                  card={card}
                  selected={selectedSlideIds.includes(card.id)}
                  showPreview={showSlideThumbnails}
                  canEditCardText
                  uiPanelTextFontClass={uiPanelTextFontClass}
                  cardDragProps={cardDragProps}
                  cardDropProps={cardDropProps}
                  draggingCardId={galleryDrag.draggingRowId}
                  dragOverCardId={galleryDrag.dragOverRowId}
                  dragOverPosition={galleryDrag.dragOverPosition}
                  commitFlashCardId={galleryDrag.commitFlashRowId}
                  registerCardElement={(cardId, element) => {
                    galleryDrag.registerFocusableRowElement({ rowId: cardId, element })
                  }}
                  onSelect={handleSelectSlide}
                  onOpen={handleOpenSlide}
                  onContextMenu={onSlideContextMenu}
                  onCommitCardText={commitCardTextOverride}
                />
              </li>
            )
          })}
        </ol>
      </section>
    </section>
  )
}
