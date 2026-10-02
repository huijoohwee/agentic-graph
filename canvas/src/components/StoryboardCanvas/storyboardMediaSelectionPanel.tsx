import React from 'react'
import { Image as ImageIcon, Plus } from 'lucide-react'
import { CardMediaLoadingSkeleton, CardMediaPreview } from '@/lib/cards/CardMediaPreview'
import { MediaDownloadOverlay, MediaInfoOverlay, MediaKindOverlay, MediaOpenLinkOverlay, MediaPromptActionOverlay } from '@/lib/ui/MediaKindOverlay'
import { MediaLightbox, type MediaLightboxPromptParameter, type MediaLightboxPromptParameters } from '@/lib/ui/MediaLightbox'
import { MEDIA_POINTER_DRAG_DROP_EVENT, claimMediaPointerDragDrop, clearMediaPointerDragPayload, hasMediaDragPayload, isMediaPointerDragDropClaimed, readMediaDragPayload, readMediaPointerDragPayload, type MediaDragPayload, type MediaPointerDragDropDetail } from '@/lib/ui/mediaDragPayload'
import { buildMediaLightboxPromptParameters } from '@/lib/ui/mediaLightboxPromptParameters'
import { resolveMediaKindOverlayIcon } from '@/lib/ui/mediaKindOverlayIcon'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_STORYBOARD_REFERENCE_LINK_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import type { StoryboardCardModel, StoryboardCardReference } from '@/components/StoryboardCanvas/storyboardModel'

export type StoryboardDisplayMedia = { kind: 'image' | 'svg' | 'video' | 'audio' | 'iframe'; url: string; srcDoc?: string }

type StoryboardMediaLoadingState = {
  label: string
  variant: 'text' | 'image' | 'video' | 'audio' | 'iframe'
}

export type StoryboardMediaSelectionSlot = {
  id: string
  label: string
  index: number
  kind: 'primary' | 'reference' | 'empty'
  referenceIndex?: number
  media: StoryboardDisplayMedia | null
  href: string
}

const isStoryboardRelatedTargetInside = (currentTarget: HTMLElement, relatedTarget: EventTarget | null): boolean => {
  if (!(relatedTarget instanceof Node)) return false
  return currentTarget.contains(relatedTarget)
}

const isStoryboardDisplayReference = (
  reference: StoryboardCardReference,
): reference is StoryboardCardReference & { kind: StoryboardDisplayMedia['kind'] } =>
  reference.kind === 'image'
  || reference.kind === 'svg'
  || reference.kind === 'video'
  || reference.kind === 'audio'
  || reference.kind === 'iframe'

function buildStoryboardMediaSelectionSlots(props: {
  card: StoryboardCardModel
  media: StoryboardDisplayMedia | null
}): StoryboardMediaSelectionSlot[] {
  const slots: StoryboardMediaSelectionSlot[] = []
  const seen = new Set<string>()
  const pushSlot = (slot: StoryboardMediaSelectionSlot) => {
    const key = `${slot.media?.kind || 'empty'}:${slot.media?.url || slot.media?.srcDoc || slot.href || slot.id}`.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    slots.push(slot)
  }
  if (props.media) {
    pushSlot({
      id: `${props.card.id}:media:primary`,
      label: props.media.kind === 'audio' ? 'Audio' : props.media.kind === 'video' ? 'Video' : 'Media 1',
      index: slots.length,
      kind: 'primary',
      media: props.media,
      href: props.card.href,
    })
  }
  props.card.references.forEach((reference, index) => {
    if (!isStoryboardDisplayReference(reference)) return
    pushSlot({
      id: `${props.card.id}:media:reference:${index}`,
      label: `Media ${slots.length + 1}`,
      index: slots.length,
      kind: 'reference',
      referenceIndex: index,
      media: {
        kind: reference.kind,
        url: reference.url,
      },
      href: reference.url,
    })
  })
  return slots.slice(0, 2)
}

function readStoryboardMediaDownloadKind(media: StoryboardDisplayMedia | null): 'image' | 'video' | 'audio' | 'media' {
  if (media?.kind === 'image' || media?.kind === 'svg') return 'image'
  if (media?.kind === 'video') return 'video'
  if (media?.kind === 'audio') return 'audio'
  return 'media'
}

function normalizeStoryboardLightboxText(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function readStoryboardMediaLightboxDescription(card: StoryboardCardModel): string {
  for (const value of [card.prompt, card.output, card.summary, card.action]) {
    const text = normalizeStoryboardLightboxText(value)
    if (text) return text
  }
  return ''
}

function buildStoryboardMediaPromptParameters(props: {
  kind: 'image' | 'video' | 'audio' | 'media'
  model: string
}): readonly MediaLightboxPromptParameter[] {
  return buildMediaLightboxPromptParameters(props)
}

export function StoryboardMediaPreview(props: {
  title: string
  href: string
  media: StoryboardDisplayMedia | null
}) {
  const { title, href, media } = props
  const interactive = media?.kind === 'video' || media?.kind === 'audio' || media?.kind === 'iframe'
  const Icon = resolveMediaKindOverlayIcon(media?.kind)
  const mediaHref = String(media?.url || '').trim()
  return (
    <section className="group relative h-full w-full overflow-hidden" aria-label={`Media preview for ${title}`} data-kg-storyboard-media-overlay-root="1">
      <CardMediaPreview
        kind={media?.kind || null}
        url={media?.url || ''}
        srcDoc={media?.srcDoc || undefined}
        title={title}
        href={href}
        interactive={interactive}
        fit="cover"
        videoControls={interactive}
        iframeScriptPolicy="allow"
        mediaClassName="h-full w-full"
      />
      {media ? <MediaKindOverlay Icon={Icon} label={media.kind} appearance="hover" /> : null}
      {mediaHref ? <MediaOpenLinkOverlay href={mediaHref} appearance="hover" /> : null}
      {mediaHref ? <MediaDownloadOverlay href={mediaHref} kind={readStoryboardMediaDownloadKind(media)} appearance="hover" /> : null}
      {media ? <MediaInfoOverlay label={`${media.kind} media: ${mediaHref || title}`} appearance="hover" /> : null}
    </section>
  )
}

export function StoryboardReferenceStrip(props: {
  cardId: string
  references: StoryboardCardReference[]
  layout?: 'strip' | 'grid'
}) {
  if (props.references.length === 0) return null
  const layout = props.layout === 'grid' ? 'grid' : 'strip'
  const visible = layout === 'grid' ? props.references : props.references.slice(0, 3)
  return (
    <section className="rounded-lg border border-black/5 bg-black/[0.025] px-2.5 py-2" aria-label="Reference pack">
      <section className="mb-2 flex items-center justify-between gap-2">
        <section className="flex items-center gap-2">
          <ImageIcon className={['h-3.5 w-3.5 shrink-0', UI_THEME_TOKENS.text.tertiary].join(' ')} aria-hidden="true" />
          <span className={['text-xs font-semibold uppercase tracking-normal', UI_THEME_TOKENS.text.tertiary].join(' ')}>
            Reference Pack
          </span>
        </section>
        <span className={['inline-flex h-5 min-w-5 items-center justify-center rounded px-1.5 text-xs', UI_THEME_TOKENS.badge.chip, UI_THEME_TOKENS.text.secondary].join(' ')}>
          {props.references.length}
        </span>
      </section>
      <section className={layout === 'grid' ? 'grid max-h-40 grid-cols-2 gap-2 overflow-y-auto pb-1' : 'flex gap-2 overflow-x-auto pb-1'}>
        {visible.map((reference, index) => {
          const key = `${props.cardId}:reference:${index}`
          if (reference.kind === 'image' || reference.kind === 'svg') {
            const Icon = resolveMediaKindOverlayIcon(reference.kind)
            return (
              <span key={key} className={layout === 'grid' ? 'group relative block h-16 min-w-0' : 'group relative block h-14 w-14 shrink-0'}>
                <a
                  href={reference.url}
                  target="_blank"
                  rel="noreferrer"
                  className={layout === 'grid' ? 'block h-full w-full overflow-hidden rounded-lg border border-black/10 bg-white' : 'block h-14 w-14 overflow-hidden rounded-lg border border-black/10 bg-white'}
                  title={reference.url}
                  draggable={false}
                  onDragStart={event => {
                    event.preventDefault()
                  }}
                >
                  <CardMediaPreview
                    kind={reference.kind}
                    url={reference.url}
                    title="Reference"
                    href={reference.url}
                    interactive={false}
                    fit="cover"
                    className="h-full w-full"
                    mediaClassName="h-full w-full"
                  />
                </a>
                <MediaKindOverlay Icon={Icon} label={reference.kind} appearance="hover" />
                <MediaOpenLinkOverlay href={reference.url} appearance="hover" />
                <MediaDownloadOverlay href={reference.url} kind="image" appearance="hover" />
              </span>
            )
          }
          return (
            <a
              key={key}
              href={reference.url}
              target="_blank"
              rel="noreferrer"
              className={[UI_RESPONSIVE_STORYBOARD_REFERENCE_LINK_CLASSNAME, 'rounded-lg border px-2 text-center text-xs', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.text.secondary].join(' ')}
              title={reference.url}
              draggable={false}
              onDragStart={event => {
                event.preventDefault()
              }}
            >
              {reference.kind === 'video' ? 'Video ref' : 'Open ref'}
            </a>
          )
        })}
      </section>
    </section>
  )
}

function StoryboardMediaSelectionSlotView(props: {
  slot: StoryboardMediaSelectionSlot
  title: string
  onAddMedia: () => void
  onDropMedia?: (slot: StoryboardMediaSelectionSlot, payload: MediaDragPayload) => void
  onOpenMedia: (slot: StoryboardMediaSelectionSlot) => void
}) {
  const { onDropMedia, slot, title } = props
  const slotRef = React.useRef<HTMLElement | null>(null)
  const setSlotElement = React.useCallback((element: HTMLElement | null) => {
    slotRef.current = element
  }, [])
  const [dropActive, setDropActive] = React.useState(false)
  const [mediaError, setMediaError] = React.useState(false)
  const media = slot.media
  const mediaHref = String(media?.url || slot.href || '').trim()
  const interactive = media?.kind === 'video' || media?.kind === 'audio' || media?.kind === 'iframe'
  const lightboxKind = readStoryboardMediaDownloadKind(media)
  const canOpenLightbox = !!mediaHref && lightboxKind !== 'media'
  const Icon = resolveMediaKindOverlayIcon(media?.kind)
  React.useEffect(() => {
    setMediaError(false)
  }, [mediaHref, media?.kind])
  const handleDragOver = React.useCallback((event: React.DragEvent<HTMLElement>) => {
    if (!onDropMedia || !hasMediaDragPayload(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setDropActive(true)
  }, [onDropMedia])
  const handleDragLeave = React.useCallback((event: React.DragEvent<HTMLElement>) => {
    if (!isStoryboardRelatedTargetInside(event.currentTarget, event.relatedTarget)) setDropActive(false)
  }, [])
  const handleDrop = React.useCallback((event: React.DragEvent<HTMLElement>) => {
    if (!onDropMedia) return
    const payload = readMediaDragPayload(event.dataTransfer)
    if (!payload) return
    event.preventDefault()
    event.stopPropagation()
    setDropActive(false)
    onDropMedia(slot, payload)
  }, [onDropMedia, slot])
  const handlePointerEnter = React.useCallback(() => {
    if (!onDropMedia || !readMediaPointerDragPayload()) return
    setDropActive(true)
  }, [onDropMedia])
  const handlePointerLeave = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!isStoryboardRelatedTargetInside(event.currentTarget, event.relatedTarget)) setDropActive(false)
  }, [])
  const handlePointerUp = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!onDropMedia) return
    const payload = readMediaPointerDragPayload()
    if (!payload) return
    event.preventDefault()
    event.stopPropagation()
    setDropActive(false)
    onDropMedia(slot, payload)
    clearMediaPointerDragPayload()
  }, [onDropMedia, slot])
  const handleMouseEnter = React.useCallback(() => {
    if (!onDropMedia || !readMediaPointerDragPayload()) return
    setDropActive(true)
  }, [onDropMedia])
  const handleMouseLeave = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!isStoryboardRelatedTargetInside(event.currentTarget, event.relatedTarget)) setDropActive(false)
  }, [])
  const handleMouseUp = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!onDropMedia) return
    const payload = readMediaPointerDragPayload()
    if (!payload) return
    event.preventDefault()
    event.stopPropagation()
    setDropActive(false)
    onDropMedia(slot, payload)
    clearMediaPointerDragPayload()
  }, [onDropMedia, slot])
  React.useEffect(() => {
    if (!onDropMedia || typeof window === 'undefined') return
    const handlePointerDragDrop = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const detail = event.detail as Partial<MediaPointerDragDropDetail> | null
      if (isMediaPointerDragDropClaimed(detail as MediaPointerDragDropDetail | null | undefined)) return
      const payload = detail?.payload
      const clientX = Number(detail?.clientX)
      const clientY = Number(detail?.clientY)
      const element = slotRef.current
      if (!payload || !Number.isFinite(clientX) || !Number.isFinite(clientY) || !element) return
      const rect = element.getBoundingClientRect()
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return
      claimMediaPointerDragDrop(detail as MediaPointerDragDropDetail | null | undefined)
      setDropActive(false)
      onDropMedia(slot, payload)
      clearMediaPointerDragPayload()
    }
    window.addEventListener(MEDIA_POINTER_DRAG_DROP_EVENT, handlePointerDragDrop)
    return () => {
      window.removeEventListener(MEDIA_POINTER_DRAG_DROP_EVENT, handlePointerDragDrop)
    }
  }, [onDropMedia, slot])
  const preview = media ? (
    <CardMediaPreview
      kind={media.kind}
      url={media.url}
      srcDoc={media.srcDoc}
      title={`${slot.label} for ${title}`}
      href={slot.href}
      interactive={!canOpenLightbox && interactive}
      fit="cover"
      videoControls={!canOpenLightbox && interactive}
      iframeScriptPolicy="allow"
      mediaClassName="h-full w-full"
      onReady={() => setMediaError(false)}
      onError={() => setMediaError(true)}
    />
  ) : null
  const dropTargetProps = {
    ref: setSlotElement,
    'data-kg-storyboard-media-slot': '1',
    'data-kg-storyboard-media-slot-index': slot.index,
    'data-kg-storyboard-media-drop-active': dropActive ? '1' : undefined,
    onDragEnter: handleDragOver,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    onPointerEnter: handlePointerEnter,
    onPointerLeave: handlePointerLeave,
    onPointerUp: handlePointerUp,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onMouseUp: handleMouseUp,
  } satisfies React.HTMLAttributes<HTMLElement> & {
    ref: React.RefCallback<HTMLElement>
    'data-kg-storyboard-media-slot': string
    'data-kg-storyboard-media-slot-index': number
    'data-kg-storyboard-media-drop-active': string | undefined
  }
  return (
    <figure
      className="m-0 flex min-h-0 flex-col gap-1.5"
    >
      <figcaption className={['truncate text-xs', UI_THEME_TOKENS.text.secondary].join(' ')}>
        {slot.label}
      </figcaption>
      {media ? (
        <section className={[
          'group relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-black/[0.06]',
          dropActive ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-black/5',
        ].join(' ')} data-kg-storyboard-media-slot-frame="1" {...dropTargetProps}>
          {mediaError ? (
            <section
              className="flex h-full w-full items-center justify-center px-3 text-black/45"
              role="status"
              aria-label={`${slot.label} source media for ${title}`}
              data-kg-storyboard-media-missing="1"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </section>
          ) : preview}
          {canOpenLightbox ? (
            <button
              type="button"
              className="absolute inset-0 z-[1] cursor-zoom-in rounded-lg bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500"
              data-kg-storyboard-media-lightbox-trigger="1"
              aria-label={`Open ${slot.label} lightbox for ${title}`}
              onPointerDown={event => {
                event.stopPropagation()
              }}
              onPointerUp={event => {
                event.stopPropagation()
                props.onOpenMedia(slot)
              }}
              onMouseDown={event => {
                event.stopPropagation()
              }}
              onMouseUp={event => {
                event.stopPropagation()
                props.onOpenMedia(slot)
              }}
              onClick={event => {
                event.stopPropagation()
                props.onOpenMedia(slot)
              }}
            >
              <span className="sr-only">Open media lightbox</span>
            </button>
          ) : null}
          {canOpenLightbox ? (
            <MediaPromptActionOverlay
              appearance="hover"
              label="Modify prompt"
              onClick={() => props.onOpenMedia(slot)}
            />
          ) : null}
          <MediaKindOverlay Icon={Icon} label={media.kind} appearance="hover" />
          {mediaHref ? <MediaOpenLinkOverlay href={mediaHref} appearance="hover" /> : null}
          {mediaHref ? <MediaDownloadOverlay href={mediaHref} kind={lightboxKind} appearance="hover" /> : null}
        </section>
      ) : (
        <button
          type="button"
          className={[
            'flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed bg-black/[0.035] text-black/45',
            dropActive ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-black/10',
            UI_THEME_TOKENS.button.hoverBg,
          ].join(' ')}
          aria-label={`Add media for ${title}`}
          onClick={event => {
            event.stopPropagation()
            props.onAddMedia()
          }}
          {...dropTargetProps}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </figure>
  )
}

export function StoryboardMediaSelectionPanel(props: {
  card: StoryboardCardModel
  title: string
  media: StoryboardDisplayMedia | null
  loadingState: StoryboardMediaLoadingState | null
  model: string
  onAddMedia: () => void
  onDropMedia?: (card: StoryboardCardModel, slot: StoryboardMediaSelectionSlot, payload: MediaDragPayload) => void
  onGenerateMediaPrompt?: (card: StoryboardCardModel, prompt: string, parameters?: MediaLightboxPromptParameters) => void | Promise<void>
}) {
  const [lightboxSlotId, setLightboxSlotId] = React.useState<string | null>(null)
  const slots = buildStoryboardMediaSelectionSlots({ card: props.card, media: props.media })
  while (slots.length < 2) {
    slots.push({
      id: `${props.card.id}:media:empty:${slots.length}`,
      label: `Media ${slots.length + 1}`,
      index: slots.length,
      kind: 'empty',
      media: null,
      href: '',
    })
  }
  const lightboxSlot = lightboxSlotId ? slots.find(slot => slot.id === lightboxSlotId) || null : null
  const lightboxMedia = lightboxSlot?.media || null
  const lightboxKind = readStoryboardMediaDownloadKind(lightboxMedia)
  const lightboxSrc = String(lightboxMedia?.url || '').trim()
  const lightboxPrompt = readStoryboardMediaLightboxDescription(props.card)
  const promptParameters = React.useMemo(
    () => buildStoryboardMediaPromptParameters({ kind: lightboxKind, model: props.model }),
    [lightboxKind, props.model],
  )
  return (
    <>
      <section className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_minmax(5.5rem,0.82fr)] gap-2 p-3" aria-label={`Media for ${props.title}`} data-kg-storyboard-media-selection-panel="1">
        <section className="grid min-h-0 grid-cols-2 gap-2" aria-label="Storyboard media slots">
          {props.loadingState ? (
            <section className="col-span-2 min-h-0 overflow-hidden rounded-lg border border-black/5 bg-black/[0.035]">
              <CardMediaLoadingSkeleton
                label={props.loadingState.label}
                variant={props.loadingState.variant}
              />
            </section>
          ) : (
            slots.map(slot => (
              <StoryboardMediaSelectionSlotView
                key={slot.id}
                slot={slot}
                title={props.title}
                onAddMedia={props.onAddMedia}
                onDropMedia={props.onDropMedia ? (slot, payload) => props.onDropMedia?.(props.card, slot, payload) : undefined}
                onOpenMedia={slot => setLightboxSlotId(slot.id)}
              />
            ))
          )}
        </section>
        <section className="grid min-h-0 grid-cols-2 gap-2" aria-label="Storyboard media actions">
          <button
            type="button"
            className={[
              'flex min-h-0 items-center justify-center rounded-lg border border-dashed border-black/10 bg-black/[0.035] text-black/50',
              UI_THEME_TOKENS.button.hoverBg,
            ].join(' ')}
            data-kg-storyboard-add-media="1"
            aria-label={`Add media to storyboard card ${props.title}`}
            onClick={event => {
              event.stopPropagation()
              props.onAddMedia()
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Add media</span>
          </button>
          <section className="min-h-0 rounded-lg border border-transparent" aria-hidden="true" />
        </section>
      </section>
      <MediaLightbox
        open={!!lightboxMedia && !!lightboxSrc && lightboxKind !== 'media'}
        src={lightboxSrc}
        alt={`${lightboxSlot?.label || 'Media'} for ${props.title}`}
        kind={lightboxKind}
        title={lightboxSlot?.label || props.title}
        description={lightboxPrompt}
        descriptionLabel="Prompt"
        promptValue={lightboxPrompt}
        promptSubmitLabel="Regenerate media"
        promptParameters={promptParameters}
        onPromptSubmit={props.onGenerateMediaPrompt ? (prompt, parameters) => props.onGenerateMediaPrompt?.(props.card, prompt, parameters) : undefined}
        onClose={() => setLightboxSlotId(null)}
      />
    </>
  )
}
