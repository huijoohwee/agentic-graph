import React from 'react'
import { ExternalLink, Image as ImageIcon, Volume2 } from 'lucide-react'
import { applyImageLikeProxySrc } from '@/lib/url'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { resolveIframeEmbed } from 'grph-shared/rich-media/iframe'
import {
  CARD_MEDIA_IFRAME_ALLOW,
  normalizeCardMediaUrl,
  type CardMediaKind,
  type CardMediaPlaceholderVariant,
  type CardMediaSkeletonVariant,
} from '@/lib/cards/cardMediaPreviewUtils'
import { resolveMediaPreviewSelectableDataAttr } from '@/lib/cards/mediaPreviewSurfaceSelection'
import type { ImageToThreeJsRenderMode } from '@/features/image-to-threejs/imageToThreeJsContract'

type SkeletonBlock = {
  width: string
  height?: number | string
  minHeight?: number | string
  flex?: number
  radius: number | string
}

const CARD_MEDIA_SKELETON_STYLE_ID = 'kg-card-media-skeleton-style'
const CARD_MEDIA_LOW_PRIORITY_IMAGE_PROPS = {
  fetchpriority: 'low',
} as unknown as React.ImgHTMLAttributes<HTMLImageElement>
const ImageThreeJsSurfaceLazy = React.lazy(() =>
  import('@/features/image-to-threejs/ImageThreeJsSurface').then(mod => ({ default: mod.ImageThreeJsSurface })),
)

const stopInteractiveCardMediaEvent = (event: React.SyntheticEvent) => {
  try {
    event.stopPropagation()
  } catch {
    void 0
  }
}

function useCardMediaSkeletonStyles() {
  React.useEffect(() => {
    if (typeof document === 'undefined') return
    if (document.getElementById(CARD_MEDIA_SKELETON_STYLE_ID)) return
    const style = document.createElement('style')
    style.id = CARD_MEDIA_SKELETON_STYLE_ID
    style.textContent = `
      @keyframes kgCardMediaSkeletonShimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      .kg-card-media-skeleton-block {
        background-image: linear-gradient(
          90deg,
          rgba(148, 163, 184, 0.14) 0%,
          rgba(148, 163, 184, 0.22) 25%,
          rgba(255, 255, 255, 0.40) 50%,
          rgba(148, 163, 184, 0.22) 75%,
          rgba(148, 163, 184, 0.14) 100%
        );
        background-size: 220% 100%;
        animation: kgCardMediaSkeletonShimmer 1.35s linear infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        .kg-card-media-skeleton-block {
          animation: none;
          background-position: 50% 0;
        }
      }
    `
    document.head.appendChild(style)
  }, [])
}

function getCardMediaSkeletonBlocks(variant: CardMediaSkeletonVariant, labelWidth: string): ReadonlyArray<SkeletonBlock> {
  if (variant === 'text') {
    return [
      { width: labelWidth, height: 12, radius: 999 },
      { width: '100%', height: 18, radius: 8 },
      { width: '92%', height: 18, radius: 8 },
      { width: '96%', height: 18, radius: 8 },
      { width: '100%', height: '100%', minHeight: 84, flex: 1, radius: 12 },
    ]
  }
  if (variant === 'image') {
    return [
      { width: labelWidth, height: 12, radius: 999 },
      { width: '100%', height: '100%', minHeight: 112, flex: 1, radius: 14 },
      { width: '52%', height: 12, radius: 999 },
    ]
  }
  if (variant === 'video') {
    return [
      { width: labelWidth, height: 12, radius: 999 },
      { width: '100%', height: '100%', minHeight: 112, flex: 1, radius: 14 },
      { width: '36%', height: 10, radius: 999 },
      { width: '58%', height: 10, radius: 999 },
    ]
  }
  if (variant === 'audio') {
    return [
      { width: labelWidth, height: 12, radius: 999 },
      { width: '100%', height: 18, radius: 999 },
      { width: '82%', height: 18, radius: 999 },
      { width: '100%', height: 44, radius: 14 },
      { width: '46%', height: 10, radius: 999 },
    ]
  }
  return [
    { width: labelWidth, height: 12, radius: 999 },
    { width: '100%', height: '100%', minHeight: 112, flex: 1, radius: 14 },
    { width: '70%', height: 12, radius: 999 },
    { width: '46%', height: 12, radius: 999 },
  ]
}

function getCardMediaEmptyBlocks(variant: CardMediaPlaceholderVariant): ReadonlyArray<SkeletonBlock> {
  if (variant === 'text') {
    return [
      { width: '46%', height: 12, radius: 999 },
      { width: '100%', height: 16, radius: 8 },
      { width: '92%', height: 16, radius: 8 },
      { width: '96%', minHeight: 58, flex: 1, radius: 12 },
      { width: '64%', height: 10, radius: 999 },
    ]
  }
  if (variant === 'image') {
    return [
      { width: '34%', height: 12, radius: 999 },
      { width: '100%', minHeight: 80, flex: 1, radius: 14 },
      { width: '48%', height: 10, radius: 999 },
      { width: '66%', height: 10, radius: 999 },
    ]
  }
  if (variant === 'video') {
    return [
      { width: '38%', height: 12, radius: 999 },
      { width: '100%', minHeight: 80, flex: 1, radius: 14 },
      { width: '28%', height: 8, radius: 999 },
      { width: '52%', height: 8, radius: 999 },
      { width: '40%', height: 8, radius: 999 },
    ]
  }
  if (variant === 'audio') {
    return [
      { width: '36%', height: 12, radius: 999 },
      { width: '92%', height: 18, radius: 999 },
      { width: '100%', height: 44, radius: 14 },
      { width: '52%', height: 8, radius: 999 },
    ]
  }
  return [
    { width: '42%', height: 12, radius: 999 },
    { width: '100%', minHeight: 76, flex: 1, radius: 14 },
    { width: '72%', height: 10, radius: 999 },
    { width: '56%', height: 10, radius: 999 },
  ]
}

function getCardMediaEmptyStatusLabel(variant: CardMediaPlaceholderVariant) {
  if (variant === 'text') return 'Waiting for text content'
  if (variant === 'image') return 'Waiting for image content'
  if (variant === 'video') return 'Waiting for video content'
  if (variant === 'audio') return 'Waiting for audio content'
  return 'Waiting for rich media content'
}

export function CardMediaLoadingSkeleton({
  label,
  variant,
  richMediaDataAttrs = false,
}: {
  label: string
  variant: CardMediaSkeletonVariant
  richMediaDataAttrs?: boolean
}) {
  useCardMediaSkeletonStyles()
  const safeLabel = String(label || '').trim() || 'Generating output...'
  const labelWidth = `${Math.min(72, Math.max(28, Math.round(safeLabel.length * 2.6)))}%`
  const blocks = getCardMediaSkeletonBlocks(variant, labelWidth)

  return (
    <section
      aria-label="Card media loading state"
      aria-live="polite"
      className="w-full h-full"
      data-kg-card-media-loading-surface="1"
      data-kg-rich-media-loading-surface={richMediaDataAttrs ? '1' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 14,
        borderRadius: 'calc(var(--kg-media-panel-radius, 10px) * 0.8)',
        background: 'rgba(15, 23, 42, 0.04)',
        color: 'var(--kg-muted-foreground, rgba(0,0,0,0.62))',
        fontSize: 12,
        userSelect: 'none',
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <section
        aria-hidden="true"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          flex: 1,
          minHeight: 0,
        }}
      >
        {blocks.map((block, index) => (
          <span
            key={`${variant}-${index}`}
            className="kg-card-media-skeleton-block"
            style={{
              display: 'block',
              width: block.width,
              height: block.height,
              minHeight: block.minHeight,
              flex: block.flex,
              borderRadius: block.radius,
            }}
          />
        ))}
      </section>
      <span
        style={{
          display: 'block',
          fontSize: 11,
          lineHeight: 1.3,
          color: 'var(--kg-muted-foreground, rgba(0,0,0,0.62))',
        }}
      >
        {safeLabel}
      </span>
    </section>
  )
}

export function CardMediaEmptyPlaceholder({
  variant,
  richMediaDataAttrs = false,
}: {
  variant: CardMediaPlaceholderVariant
  richMediaDataAttrs?: boolean
}) {
  const blocks = getCardMediaEmptyBlocks(variant)
  const statusLabel = getCardMediaEmptyStatusLabel(variant)

  return (
    <section
      aria-label="Card media empty state"
      role="status"
      className="w-full h-full"
      data-kg-card-media-empty-placeholder="1"
      data-kg-card-media-empty-variant={variant}
      data-kg-rich-media-empty-card-placeholder={richMediaDataAttrs ? '1' : undefined}
      data-kg-rich-media-empty-card-static={richMediaDataAttrs ? '1' : undefined}
      data-kg-rich-media-empty-card-variant={richMediaDataAttrs ? variant : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
        borderRadius: 'calc(var(--kg-media-panel-radius, 10px) * 0.8)',
        background: 'transparent',
        userSelect: 'none',
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <section
        aria-hidden="true"
        style={{
          width: '100%',
          maxWidth: 260,
          minHeight: 132,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 14,
          background: 'transparent',
        }}
      >
        {blocks.map((block, index) => (
          <span
            key={`${variant}-${index}`}
            style={{
              display: 'block',
              width: block.width,
              height: block.height,
              minHeight: block.minHeight,
              flex: block.flex,
              borderRadius: block.radius,
              background: index === 0
                ? 'rgba(148, 163, 184, 0.18)'
                : 'rgba(148, 163, 184, 0.12)',
            }}
          />
        ))}
      </section>
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {statusLabel}
      </span>
    </section>
  )
}

export function CardMediaPreview({
  kind,
  renderMode,
  url,
  srcDoc,
  title,
  href,
  interactive = false,
  fit = 'cover',
  className,
  mediaClassName,
  style,
  mediaStyle,
  proxyImageLike = false,
  videoControls,
  videoMuted,
  videoAutoPlay,
  videoLoop,
  videoPoster,
  iframeEmbedMode,
  iframeScriptPolicy,
  mediaThumbnailDataAttr = false,
  mediaSelectableSurfaceDataAttr = false,
  onMediaElement,
  onVideoElement,
  onReady,
  onError,
}: {
  kind: CardMediaKind | null | undefined
  renderMode?: ImageToThreeJsRenderMode
  url: string
  srcDoc?: string
  title: string
  href?: string
  interactive?: boolean
  fit?: 'cover' | 'contain'
  className?: string
  mediaClassName?: string
  style?: React.CSSProperties
  mediaStyle?: React.CSSProperties
  proxyImageLike?: boolean
  videoControls?: boolean
  videoMuted?: boolean
  videoAutoPlay?: boolean
  videoLoop?: boolean
  videoPoster?: string
  iframeEmbedMode?: 'auto' | 'direct' | 'proxy'
  iframeScriptPolicy?: 'strip' | 'allow'
  mediaThumbnailDataAttr?: boolean
  mediaSelectableSurfaceDataAttr?: boolean
  onMediaElement?: (element: HTMLMediaElement | null) => void
  onVideoElement?: (element: HTMLVideoElement | null) => void
  onReady?: () => void
  onError?: () => void
}) {
  const mediaUrl = normalizeCardMediaUrl(url)
  const mediaSrcDoc = typeof srcDoc === 'string' ? srcDoc.trim() : ''
  const fallbackHref = normalizeCardMediaUrl(href)
  const rootClassName = ['h-full w-full', className].filter(Boolean).join(' ')
  const selectableSurfaceDataAttr = resolveMediaPreviewSelectableDataAttr(mediaSelectableSurfaceDataAttr)
  const mediaPointerStyle: React.CSSProperties = {
    pointerEvents: interactive ? 'auto' : 'none',
  }
  const mediaEventProps = interactive
    ? {
        onPointerDownCapture: stopInteractiveCardMediaEvent,
        onClickCapture: stopInteractiveCardMediaEvent,
        onDoubleClickCapture: stopInteractiveCardMediaEvent,
        onDragStart: (event: React.DragEvent) => {
          try {
            event.preventDefault()
            event.stopPropagation()
          } catch {
            void 0
          }
        },
      }
    : {
        onDragStart: (event: React.DragEvent) => {
          try {
            event.preventDefault()
          } catch {
            void 0
          }
        },
      }

  if ((kind === 'image' || kind === 'svg') && mediaUrl && renderMode === 'threejs') {
    const src = proxyImageLike ? applyImageLikeProxySrc(mediaUrl) : mediaUrl
    return (
      <section
        className={rootClassName}
        data-kg-card-media-interactive={interactive ? '1' : undefined}
        data-kg-media-thumbnail={mediaThumbnailDataAttr ? '1' : undefined}
        data-kg-rich-media-selectable-surface={selectableSurfaceDataAttr}
        data-kg-image-threejs-card-surface="1"
        style={style}
        {...mediaEventProps}
      >
        <React.Suspense fallback={<CardMediaLoadingSkeleton label="Converting image to Three.js..." variant="image" />}>
          <ImageThreeJsSurfaceLazy
            sourceUrl={src}
            title={title}
            mediaClassName={mediaClassName}
            mediaStyle={{ ...mediaPointerStyle, ...(mediaStyle || null) }}
            interactive={interactive}
            onReady={onReady}
            onError={onError}
          />
        </React.Suspense>
      </section>
    )
  }

  if ((kind === 'image' || kind === 'svg') && mediaUrl) {
    const src = proxyImageLike ? applyImageLikeProxySrc(mediaUrl) : mediaUrl
    return (
      <img
        src={src}
        alt={title}
        data-kg-card-media-kind={kind}
        data-kg-card-media-interactive={interactive ? '1' : undefined}
        data-kg-card-media-loading="lazy"
        data-kg-media-thumbnail={mediaThumbnailDataAttr ? '1' : undefined}
        data-kg-rich-media-selectable-surface={selectableSurfaceDataAttr}
        className={['block h-full w-full select-none', mediaClassName].filter(Boolean).join(' ')}
        loading="lazy"
        decoding="async"
        {...CARD_MEDIA_LOW_PRIORITY_IMAGE_PROPS}
        draggable={false}
        onLoad={() => onReady?.()}
        onError={() => onError?.()}
        style={{
          objectFit: fit,
          ...mediaPointerStyle,
          ...(mediaStyle || null),
        }}
        {...mediaEventProps}
      />
    )
  }

  if (kind === 'video' && mediaUrl) {
    return (
      <video
        src={proxyImageLike ? applyImageLikeProxySrc(mediaUrl) : mediaUrl}
        data-kg-card-media-kind="video"
        data-kg-card-media-interactive={interactive ? '1' : undefined}
        data-kg-card-media-preload="metadata"
        data-kg-media-thumbnail={mediaThumbnailDataAttr ? '1' : undefined}
        data-kg-rich-media-selectable-surface={selectableSurfaceDataAttr}
        className={['block h-full w-full select-none', mediaClassName].filter(Boolean).join(' ')}
        aria-label={title}
        controls={videoControls ?? interactive}
        muted={videoMuted ?? false}
        autoPlay={videoAutoPlay || undefined}
        loop={videoLoop || undefined}
        poster={videoPoster || undefined}
        playsInline
        preload="metadata"
        draggable={false}
        ref={element => {
          onVideoElement?.(element)
          onMediaElement?.(element)
        }}
        onLoadedMetadata={() => onReady?.()}
        onLoadedData={() => onReady?.()}
        onCanPlay={() => onReady?.()}
        onError={() => onError?.()}
        style={{
          objectFit: fit,
          background: 'rgba(2, 6, 23, 0.72)',
          ...mediaPointerStyle,
          ...(mediaStyle || null),
        }}
        {...mediaEventProps}
      />
    )
  }

  if (kind === 'audio' && mediaUrl) {
    return (
      <section
        className={[
          'flex h-full w-full select-none flex-col items-center justify-center gap-3',
          mediaClassName,
        ].filter(Boolean).join(' ')}
        data-kg-card-media-kind="audio"
        data-kg-card-media-interactive={interactive ? '1' : undefined}
        data-kg-card-media-preload="metadata"
        data-kg-media-thumbnail={mediaThumbnailDataAttr ? '1' : undefined}
        data-kg-rich-media-selectable-surface={selectableSurfaceDataAttr}
        style={{
          background: 'rgba(2, 6, 23, 0.06)',
          padding: 12,
          ...mediaPointerStyle,
          ...(mediaStyle || null),
        }}
        {...mediaEventProps}
      >
        <Volume2 className="h-5 w-5 shrink-0 text-black/55" aria-hidden="true" />
        <audio
          src={proxyImageLike ? applyImageLikeProxySrc(mediaUrl) : mediaUrl}
          className="w-full max-w-full"
          aria-label={title}
          controls
          preload="metadata"
          draggable={false}
          ref={onMediaElement}
          onLoadedMetadata={() => onReady?.()}
          onCanPlay={() => onReady?.()}
          onError={() => onError?.()}
          style={mediaPointerStyle}
        />
      </section>
    )
  }

  if (kind === 'iframe' && (mediaUrl || mediaSrcDoc)) {
    const embed = resolveIframeEmbed({
      url: mediaUrl,
      embedMode: iframeEmbedMode === 'direct' || iframeEmbedMode === 'proxy' ? iframeEmbedMode : undefined,
      scriptPolicy: iframeScriptPolicy || (interactive ? 'allow' : undefined),
    })
    const sandbox = mediaSrcDoc
      ? (iframeScriptPolicy === 'allow' || interactive
          ? 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox'
          : '')
      : embed.sandbox
    return (
      <iframe
        src={mediaSrcDoc ? undefined : embed.iframeSrc}
        srcDoc={mediaSrcDoc || undefined}
        title={title}
        className={['block h-full w-full select-none border-0', mediaClassName].filter(Boolean).join(' ')}
        allow={CARD_MEDIA_IFRAME_ALLOW}
        allowFullScreen
        sandbox={sandbox}
        referrerPolicy={embed.direct ? 'strict-origin-when-cross-origin' : 'no-referrer'}
        loading="lazy"
        data-kg-card-media-iframe="1"
        data-kg-card-media-kind="iframe"
        data-kg-card-media-interactive={interactive ? '1' : undefined}
        data-kg-card-media-srcdoc={mediaSrcDoc ? '1' : undefined}
        data-kg-media-thumbnail={mediaThumbnailDataAttr ? '1' : undefined}
        data-kg-rich-media-selectable-surface={selectableSurfaceDataAttr}
        onLoad={() => onReady?.()}
        style={{
          background: 'transparent',
          ...mediaPointerStyle,
          ...(mediaStyle || null),
        }}
        {...mediaEventProps}
      />
    )
  }

  return (
    <section
      className={[
        'flex h-full w-full items-center justify-center gap-2 text-sm',
        UI_THEME_TOKENS.text.secondary,
        rootClassName,
      ].filter(Boolean).join(' ')}
      style={style}
      data-kg-card-media-fallback="1"
    >
      {fallbackHref ? <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ImageIcon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span className="truncate">{fallbackHref ? 'Open reference' : 'No preview'}</span>
    </section>
  )
}
