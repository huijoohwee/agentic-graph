import { CardMediaPreview } from '@/lib/cards/CardMediaPreview'
import '@/lib/cards/CardMediaAlbum.css'
import { CardMediaDropZoneFrame, CARD_MEDIA_DROP_ZONE_EMPTY_PLACEHOLDER_CLASS_NAME } from '@/lib/cards/CardMediaDropZone'
import { readStoryboardMediaFileLabel, toStoryboardInlineMediaKind } from '@/components/StoryboardCanvas/storyboardCardMediaProjection'
import { InlineMediaCommandThumbnail } from '@/lib/command-menu/InlineMediaCommandThumbnail'
import {
  CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_PILL_CLASS_NAME,
} from '@/lib/cards/cardMarkdownPreviewUtils'
import type { MediaDragPayload } from '@/lib/ui/mediaDragPayload'
import type { StoryboardCardModel } from '@/components/StoryboardCanvas/storyboardModel'
import { MediaDownloadOverlay } from '@/lib/ui/MediaKindOverlay'
import { CardMediaAlbum } from '@/lib/cards/CardMediaAlbum'
import { CardMediaHoverPreview, useCardMediaHoverPreview } from '@/lib/cards/CardMediaHoverPreview'
import type { StoryboardMediaAlbumItem } from '@/components/StoryboardCanvas/storyboardCardMediaAlbum'

type StoryboardCardMediaDropSlot2dProps = {
  card: StoryboardCardModel
  displayMedia: StoryboardCardModel['media']
  displayMediaItems: readonly StoryboardMediaAlbumItem[]
  onDropMedia: (card: StoryboardCardModel, payload: MediaDragPayload) => void
}

export function StoryboardCardMediaDropSlot2d({ card, displayMedia, displayMediaItems, onDropMedia }: StoryboardCardMediaDropSlot2dProps) {
  const hoverPreview = useCardMediaHoverPreview<HTMLElement>()
  const mediaUrl = displayMedia?.url || displayMedia?.thumbnailUrl || ''
  const mediaPoster = displayMedia?.thumbnailUrl || undefined
  const inlineMediaKind = toStoryboardInlineMediaKind(displayMedia?.kind)
  const mediaChipLabel = inlineMediaKind ? readStoryboardMediaFileLabel(displayMedia?.sourceUrl || mediaUrl, card.title || 'Media') : ''
  const mediaChipThumbnailUrl = inlineMediaKind === 'image' ? mediaUrl : mediaPoster

  return (
    <CardMediaDropZoneFrame
      ariaLabel={`Media drop zone for ${card.title || card.id}`}
      className="group h-full w-full"
      dataAttributes={{
        'data-kg-storyboard-card-media-drop': '1',
        'data-kg-storyboard-card-id': card.id,
      }}
      onDropMedia={payload => onDropMedia(card, payload)}
    >
      {displayMediaItems.length > 1 ? (
        <CardMediaAlbum items={displayMediaItems} title={card.title || card.id} />
      ) : mediaUrl ? (
        <section ref={hoverPreview.anchorRef} {...hoverPreview.anchorProps} className="relative h-full w-full" tabIndex={0}>
          <CardMediaPreview
            title={card.title}
            kind={displayMedia?.kind || null}
            renderMode={displayMedia?.renderMode}
            url={mediaUrl}
            href={card.href || displayMedia?.sourceUrl || mediaUrl}
            srcDoc={displayMedia?.srcDoc}
            interactive={false}
            fit="cover"
            videoPoster={mediaPoster}
            className="h-full w-full"
            mediaClassName="h-full w-full"
            mediaThumbnailDataAttr
            mediaSelectableSurfaceDataAttr
          />
          {inlineMediaKind ? (
            <figcaption className="pointer-events-none absolute bottom-1 left-1 right-1 z-10 flex min-w-0">
              <span className={`${CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_PILL_CLASS_NAME} max-w-full bg-[color:var(--kg-panel-bg)]/90 shadow-none backdrop-blur`} data-kg-storyboard-card-media-chip="1">
                <InlineMediaCommandThumbnail kind={inlineMediaKind} thumbnailUrl={mediaChipThumbnailUrl} variant="inline" />
                <span className={CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME}>{mediaChipLabel}</span>
              </span>
            </figcaption>
          ) : null}
          {inlineMediaKind ? <MediaDownloadOverlay href={mediaUrl} kind={inlineMediaKind} appearance="hover" /> : null}
          {inlineMediaKind ? (
            <CardMediaHoverPreview
              anchorRef={hoverPreview.anchorRef}
              kind={inlineMediaKind}
              open={hoverPreview.show}
              title={mediaChipLabel}
              tooltipId={hoverPreview.tooltipId}
              url={mediaUrl}
              onClose={hoverPreview.close}
            />
          ) : null}
        </section>
      ) : null}
      {!mediaUrl ? (
        <span className={CARD_MEDIA_DROP_ZONE_EMPTY_PLACEHOLDER_CLASS_NAME}>+</span>
      ) : null}
    </CardMediaDropZoneFrame>
  )
}
