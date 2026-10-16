import React from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import PreviewOverlay from '@/features/panels/views/preview-panel/ui/PreviewOverlay'
import type { UploadedMediaPanelItem } from '@/lib/storage/uploadedMediaPanelItems'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  MEDIA_EXPANDED_PREVIEW_OVERLAY_CLASS_NAME,
  MEDIA_EXPANDED_PREVIEW_PANEL_CLASS_NAME,
  MEDIA_EXPANDED_PREVIEW_PLAYER_CLASS_NAME,
  MEDIA_EXPANDED_PREVIEW_PLAYER_FRAME_CLASS_NAME,
  MEDIA_EXPANDED_PREVIEW_MEDIA_CLASS_NAME,
} from '@/lib/ui/mediaExpandedPreviewLayout'
import { MediaExpandedPreviewFullscreenButton } from '@/lib/ui/MediaExpandedPreviewFullscreenButton'
import { cn } from '@/lib/utils'
import { MediaCatalogPreviewDeck } from './MediaCatalogPreviewDeck'
import { resolveMediaCatalogPreviewDeckItems } from './mediaCatalogPreviewDeckPlan'
import { useMediaCatalogPreviewNavigation } from './useMediaCatalogPreviewNavigation'

export function MediaCatalogRichMediaPreview(props: {
  item: UploadedMediaPanelItem
  items: readonly UploadedMediaPanelItem[]
  onClose: () => void
  onNavigate: (item: UploadedMediaPanelItem) => void
}) {
  const { item, items, onClose, onNavigate } = props
  const previewRef = React.useRef<HTMLElement | null>(null)
  const navigation = useMediaCatalogPreviewNavigation({ item, items, onNavigate })
  const deckItems = React.useMemo(
    () => resolveMediaCatalogPreviewDeckItems(item, navigation.adjacentItems),
    [item, navigation.adjacentItems],
  )
  const preloadItems = deckItems.filter(deckItem => deckItem.id !== item.id)

  return (
    <PreviewOverlay
      open
      onClose={onClose}
      overlayClassName={MEDIA_EXPANDED_PREVIEW_OVERLAY_CLASS_NAME}
      panelClassName={MEDIA_EXPANDED_PREVIEW_PANEL_CLASS_NAME}
    >
      <section
        ref={previewRef}
        className={MEDIA_EXPANDED_PREVIEW_PLAYER_CLASS_NAME}
        aria-label={`${item.name} media preview`}
        data-kg-media-catalog-preview="1"
        data-kg-media-catalog-preview-kind={item.kind}
        data-kg-media-catalog-preview-placement="legacy-lightbox"
        data-kg-media-catalog-preview-index={navigation.activeIndex >= 0 ? navigation.activeIndex + 1 : undefined}
        data-kg-media-catalog-preview-count={navigation.count}
        data-kg-media-catalog-preview-preload-count={preloadItems.length}
        data-kg-media-catalog-preview-preload-kinds={preloadItems.map(preloadItem => preloadItem.kind).join(',') || undefined}
        data-kg-media-catalog-preview-touch-navigation={navigation.canNavigate ? 'horizontal-swipe' : undefined}
        {...navigation.touchHandlers}
      >
        <menu className="absolute right-2 top-2 z-20 m-0 flex list-none items-center gap-1 p-0" aria-label="Media preview actions">
          <li className="list-none">
            <MediaExpandedPreviewFullscreenButton
              targetRef={previewRef}
              dataAttributes={{ 'data-kg-media-catalog-preview-fullscreen': '1' }}
            />
          </li>
          <li className="list-none">
            <button
              type="button"
              className={cn('inline-flex h-8 w-8 items-center justify-center rounded border bg-black/50 text-white backdrop-blur-sm', UI_THEME_TOKENS.panel.border)}
              aria-label="Close media preview"
              data-kg-media-catalog-preview-close="1"
              onClick={event => {
                event.stopPropagation()
                onClose()
              }}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </li>
        </menu>
        {navigation.canNavigate ? (
          <>
            <button
              type="button"
              className={cn('absolute left-2 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border bg-black/50 text-white backdrop-blur-sm', UI_THEME_TOKENS.panel.border)}
              title="Previous media"
              aria-label="Previous media"
              data-kg-media-catalog-preview-previous="1"
              onClick={event => {
                event.stopPropagation()
                navigation.navigate(-1)
              }}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              className={cn('absolute right-2 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border bg-black/50 text-white backdrop-blur-sm', UI_THEME_TOKENS.panel.border)}
              title="Next media"
              aria-label="Next media"
              data-kg-media-catalog-preview-next="1"
              onClick={event => {
                event.stopPropagation()
                navigation.navigate(1)
              }}
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
            <p className="sr-only" aria-live="polite" data-kg-media-catalog-preview-navigation="arrow-keys">
              {`${item.name}, item ${navigation.activeIndex + 1} of ${navigation.count}. Use Previous, Left, or Up for the previous item; use Next, Right, or Down for the next item. Swipe horizontally on touch screens.`}
            </p>
          </>
        ) : null}
        <section className={MEDIA_EXPANDED_PREVIEW_PLAYER_FRAME_CLASS_NAME}>
          <section className={MEDIA_EXPANDED_PREVIEW_MEDIA_CLASS_NAME} data-kg-media-catalog-preview-panel="1">
            <MediaCatalogPreviewDeck activeItemId={item.id} items={deckItems} />
          </section>
        </section>
      </section>
    </PreviewOverlay>
  )
}
