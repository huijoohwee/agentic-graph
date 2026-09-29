import React from 'react'
import { LayoutList, LayoutPanelTop } from 'lucide-react'
import PreviewGallery from '@/lib/panels/views/preview-panel/ui/PreviewGallery.impl'
import { UI_COPY } from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import IconButton from '@/components/IconButton'
import { MarkdownSidebarFrame } from './MarkdownSidebarFrame'
import { MARKDOWN_SLIDES_SIDEBAR_CLASS_NAME } from './markdownPresentationResponsiveClasses'

type SlidesSidebarProps = {
  as?: 'aside' | 'section'
  embedded?: boolean
  orderedSlideIndices: number[]
  activeSlideId: number
  slideOrder: number[]
  slideCount: number
  activeSlideHeading: string
  showSlideThumbnails: boolean
  onToggleShowSlideThumbnails: () => void
  onSidebarFocusSlideIdChange: (id: number | null) => void
  onActiveSlideIndexChange: (index: number) => void
  onSlideOrderChange: (nextOrder: number[]) => void
  renderSlidePreview: (slideIdx: number) => React.ReactNode
  onSlideDoubleClick?: (slideIdx: number) => void
  onSlideContextMenu?: (slideIdx: number, e: React.MouseEvent) => void
  width?: string
  layout?: 'list' | 'grid'
}

export function SlidesSidebar(props: SlidesSidebarProps) {
  const {
    as: Tag = 'aside',
    embedded = false,
    orderedSlideIndices,
    activeSlideId,
    slideOrder,
    slideCount,
    activeSlideHeading,
    showSlideThumbnails,
    onToggleShowSlideThumbnails,
    onSidebarFocusSlideIdChange,
    onActiveSlideIndexChange,
    onSlideOrderChange,
    renderSlidePreview,
    onSlideDoubleClick,
    onSlideContextMenu,
    width = MARKDOWN_SLIDES_SIDEBAR_CLASS_NAME,
    layout = 'list',
  } = props

  const [selectedSlideIds, setSelectedSlideIds] = React.useState<string[]>([])

  React.useEffect(() => {
    if (!selectedSlideIds.length) return
    const idSet = new Set(orderedSlideIndices.map(id => String(id)))
    setSelectedSlideIds((prev) => {
      if (!prev.length) return prev
      const next = prev.filter(id => idSet.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [orderedSlideIndices, selectedSlideIds.length])

  const items = React.useMemo(
    () =>
      orderedSlideIndices.map((slideIdx, i) => ({
        id: String(slideIdx),
        label: UI_COPY.markdownSlideIndexLabel(i + 1),
        preview: renderSlidePreview(slideIdx),
      })),
    [orderedSlideIndices, renderSlidePreview],
  )

  const containerClassName =
    layout === 'grid'
      ? `${width} border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} flex flex-col rounded`
      : `${width} shrink-0 border-r ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} flex flex-col`
  const embeddedClassName =
    layout === 'grid'
      ? `${width} h-full min-h-0 border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} flex flex-col rounded`
      : `${width} h-full min-h-0 ${UI_THEME_TOKENS.panel.bg} flex flex-col`

  // When embedded in MarkdownPanelLayout, we let the layout handle the container.
  // But we might want to customize the header.
  // If embedded, we assume the parent provides the outer structure (aside),
  // but we still render our header because it has specific controls (thumbnails toggle, selection clear).
  
  const headerRight = (
    <section className="flex items-center gap-1">
      {selectedSlideIds.length > 0 ? (
        <button
          type="button"
          className={`text-xs mr-1 ${UI_THEME_TOKENS.text.tertiary} ${UI_THEME_TOKENS.button.hoverBg} rounded px-1`}
          onClick={() => setSelectedSlideIds([])}
        >
          {UI_COPY.markdownSlidesSidebarClearSelectionLabel}
        </button>
      ) : null}
      <IconButton
        className="App-toolbar__btn flex items-center justify-center"
        onClick={onToggleShowSlideThumbnails}
        title={showSlideThumbnails ? 'Hide Thumbnails' : 'Show Thumbnails'}
        showTooltip
      >
        {showSlideThumbnails ? (
          <LayoutPanelTop className="w-4 h-4" strokeWidth={1.5} aria-hidden={true} />
        ) : (
          <LayoutList className="w-4 h-4" strokeWidth={1.5} aria-hidden={true} />
        )}
      </IconButton>
    </section>
  )

  const title = (
    <section className="min-w-0">
      <span className={['text-xs font-semibold uppercase truncate', UI_THEME_TOKENS.text.tertiary].join(' ')}>
        {UI_COPY.markdownSlidesSidebarViewTitle}
      </span>
      <span className={`mt-0.5 block text-xs ${UI_THEME_TOKENS.text.secondary} truncate`}>
        {slideCount} {UI_COPY.markdownSlidesSidebarSlidesSuffix}
        {activeSlideHeading ? ` · ${activeSlideHeading}` : ''}
      </span>
    </section>
  )

  const content = (
    <>
      <MarkdownSidebarFrame
        as={embedded ? 'section' : Tag}
        ariaLabel={UI_COPY.markdownSlidesSidebarViewTitle}
        className={embedded ? embeddedClassName : containerClassName}
        title={title}
        headerRight={headerRight}
      >
        <nav className="flex-1 min-h-0 overflow-auto" aria-label="Gallery">
          <PreviewGallery
            items={items}
            activeId={String(activeSlideId)}
            selectedIds={selectedSlideIds}
            onSelectedIdsChange={setSelectedSlideIds}
            showPreview={showSlideThumbnails}
            onHighlightChange={(id) => {
              if (id === null) {
                onSidebarFocusSlideIdChange(null)
                return
              }
              const idx = Number.parseInt(id, 10)
              if (!Number.isFinite(idx)) return
              onSidebarFocusSlideIdChange(idx)
            }}
            onSelect={(id) => {
              const idx = Number.parseInt(id, 10)
              if (!Number.isFinite(idx)) return
              const pos = orderedSlideIndices.indexOf(idx)
              if (pos < 0) return
              onActiveSlideIndexChange(pos)
            }}
            onReorder={(nextIds) => {
              const next = nextIds.map(x => Number.parseInt(x, 10)).filter(n => Number.isFinite(n))
              const nextOrder = next.length ? next : slideOrder
              onSlideOrderChange(nextOrder)
              const nextPos = nextOrder.indexOf(activeSlideId)
              if (nextPos >= 0) onActiveSlideIndexChange(nextPos)
            }}
            onDoubleClick={(id) => {
              const idx = Number.parseInt(id, 10)
              if (!Number.isFinite(idx)) return
              if (onSlideDoubleClick) onSlideDoubleClick(idx)
            }}
            onContextMenu={(id, e) => {
              const idx = Number.parseInt(id, 10)
              if (!Number.isFinite(idx)) return
              if (onSlideContextMenu) onSlideContextMenu(idx, e)
            }}
            layout={layout}
          />
        </nav>
      </MarkdownSidebarFrame>
    </>
  )

  return content
}
