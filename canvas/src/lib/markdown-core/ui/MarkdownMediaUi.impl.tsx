import React from 'react'
import { SharedWebpageSnapshotSurface } from '@/components/SharedWebpageSnapshotSurface'
import { useGraphStore } from '@/hooks/useGraphStore'
import { SharedWebpageSurface } from '@/components/SharedWebpageSurface'
import { applyMediaProxySrc } from '@/features/markdown/ui/markdownPreviewLinks'
import { resolveIframeEmbed, shouldForceSnapshotIframeUrl } from 'grph-shared/rich-media/iframe'
import { inferMediaKindFromUrl } from 'grph-shared/rich-media/mediaKind'
import { buildYouTubeThumbnailPreviewDescriptor, getYouTubeId } from 'grph-shared/rich-media/providers'
import { getOrCreateVideoThumbnail } from 'grph-shared/rich-media/videoThumbnail'
import { getWebpageFallbackInfo } from 'grph-shared/rich-media/webpageFallback'
import { applyImageLikeProxySrc } from '@/lib/url'
import { CardMediaPreview } from '@/lib/cards/CardMediaPreview'
import {
  CARD_MARKDOWN_PREVIEW_MEDIA_EMBED_FRAME_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_MEDIA_ERROR_FRAME_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_MEDIA_FRAME_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_MEDIA_CHROME_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_MEDIA_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_MEDIA_SHELL_CLASS_NAME,
} from '@/lib/cards/cardMarkdownPreviewUtils'
import { UI_COPY } from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_PASSIVE_FILL_SURFACE_CLASSNAME,
  UI_RESPONSIVE_WEBPAGE_SNAPSHOT_EMPTY_MEDIA_CLASSNAME,
  UI_RESPONSIVE_WEBPAGE_SNAPSHOT_OVERLAY_BADGE_CLASSNAME,
  UI_RESPONSIVE_WEBPAGE_SNAPSHOT_PREVIEW_MEDIA_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { buildWebpageLayoutCacheKey, getMarkdownWebpageSnapshotPreset } from '@/lib/websites/webpageLayoutPresets'
import {
  isNoiseProneWebpagePreviewHost,
  useWebpageLayoutSnapshotLifecycle,
  useWebpageSnapshotSurfaceAssets,
} from '@/lib/websites/webpageSnapshotShared'
import { normalizeSvgDataUriForImg } from './markdownSvgDataUri'
export { MediaWrapper } from './MarkdownMediaWrapper'

const mediaFrameClassName = `rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`
const mediaShellClassName = `w-full h-full rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} overflow-hidden relative`
const mediaLoadButtonClassName = `text-xs px-3 py-2 rounded border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.text.primary} ${UI_THEME_TOKENS.button.hoverBg}`
const mediaLinkClassName = `text-xs underline ${UI_THEME_TOKENS.text.primary}`
const getMediaFrameClassName = (cardPreviewMode?: boolean) =>
  cardPreviewMode === true ? CARD_MARKDOWN_PREVIEW_MEDIA_CHROME_CLASS_NAME : mediaFrameClassName
const getMediaShellClassName = (cardPreviewMode?: boolean) =>
  cardPreviewMode === true ? CARD_MARKDOWN_PREVIEW_MEDIA_SHELL_CLASS_NAME : mediaShellClassName

export const MediaIframe = React.memo(function MediaIframe({
  src,
  title,
  presentationMode,
  deferLoad,
  embedMode,
  scriptPolicy,
  containerClassName,
  containerStyle,
  className,
  style,
  cardPreviewMode,
}: {
  src: string
  title: string
  presentationMode: boolean
  deferLoad?: boolean
  embedMode?: 'auto' | 'direct'
  scriptPolicy?: 'strip' | 'allow'
  containerClassName?: string
  containerStyle?: React.CSSProperties
  className?: string
  style?: React.CSSProperties
  cardPreviewMode?: boolean
}) {
  const [error, setError] = React.useState(false)
  const [forceProxy, setForceProxy] = React.useState(false)
  const [loaded, setLoaded] = React.useState<boolean>(() => {
    return deferLoad !== true
  })

  const richMediaPanelMode = useGraphStore(s => s.richMediaPanelMode)

  if (!src || error) {
    return <MediaErrorPlaceholder alt={title} />
  }
  const rawSrc = String(src || '').trim()

  const inferredKind = inferMediaKindFromUrl(rawSrc)

  if (inferredKind === 'image' || inferredKind === 'svg') {
    return <MediaImage src={rawSrc} alt={title} className={className} style={style} cardPreviewMode={cardPreviewMode} />
  }
  if (inferredKind === 'video') {
    return richMediaPanelMode === 'snapshot' || deferLoad === true ? (
      <MediaVideoSnapshot
        url={rawSrc}
        title={title}
        presentationMode={presentationMode}
        containerClassName={containerClassName}
        containerStyle={containerStyle}
        className={className}
        style={style}
        cardPreviewMode={cardPreviewMode}
      />
    ) : (
      <MediaVideo src={rawSrc} className={className} style={style} cardPreviewMode={cardPreviewMode} />
    )
  }
  if (inferredKind === 'audio') {
    return <MediaAudio src={rawSrc} className={className} style={style} />
  }
  if ((richMediaPanelMode === 'snapshot' || deferLoad === true) && getYouTubeId(rawSrc)) {
    return (
      <MediaVideoSnapshot
        url={rawSrc}
        title={title}
        presentationMode={presentationMode}
        containerClassName={containerClassName}
        containerStyle={containerStyle}
        className={className}
        style={style}
        cardPreviewMode={cardPreviewMode}
      />
    )
  }
  const preferEmbed = richMediaPanelMode === 'embed'
  const embed = resolveIframeEmbed({
    url: rawSrc,
    embedMode: embedMode === 'direct' ? 'direct' : forceProxy ? 'proxy' : undefined,
    scriptPolicy: scriptPolicy || ((preferEmbed || forceProxy) ? 'allow' : undefined),
  })

  return (
    <section
      className={containerClassName || (presentationMode ? 'aspect-video w-full' : CARD_MARKDOWN_PREVIEW_MEDIA_EMBED_FRAME_CLASS_NAME)}
      style={containerStyle}
    >
      {loaded ? (
        embed.direct ? (
          <CardMediaPreview
            kind="iframe"
            url={rawSrc}
            title={title}
            interactive={preferEmbed || embedMode === 'direct'}
            fit="contain"
            mediaThumbnailDataAttr
            mediaClassName={['w-full h-full', getMediaFrameClassName(cardPreviewMode), className].filter(Boolean).join(' ') || undefined}
            mediaStyle={style}
            iframeEmbedMode={embedMode === 'direct' ? 'direct' : forceProxy ? 'proxy' : 'auto'}
            iframeScriptPolicy={scriptPolicy || ((preferEmbed || forceProxy) ? 'allow' : undefined)}
          />
        ) : (
          <SharedWebpageSurface
            renderMode="iframe"
            webpageUrl={rawSrc}
            title={title}
            iframeSrc={embed.iframeSrc}
            iframeAllow="fullscreen; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            iframeAllowFullScreen
            iframeSandbox={embed.sandbox}
            iframeReferrerPolicy={embed.direct ? 'strict-origin-when-cross-origin' : 'no-referrer'}
            iframeLoading="lazy"
            className={['w-full h-full', getMediaFrameClassName(cardPreviewMode), className].filter(Boolean).join(' ') || undefined}
            style={style}
            iframeRenderer={frameProps => (
              <iframe
                src={embed.iframeSrc}
                title={frameProps.title}
                allow="fullscreen; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                sandbox={embed.sandbox}
                referrerPolicy={embed.direct ? 'strict-origin-when-cross-origin' : 'no-referrer'}
                loading="lazy"
                className={frameProps.className}
                style={frameProps.style}
                onError={() => {
                  if (!forceProxy && /^https?:\/\//i.test(rawSrc)) {
                    setForceProxy(true)
                    return
                  }
                  setError(true)
                }}
              />
            )}
          />
        )
      ) : (
        <section className={`w-full h-full ${getMediaFrameClassName(cardPreviewMode)} bg-black/5 flex items-center justify-center`}>
          <section className="flex items-center gap-2">
            <button
              type="button"
              className={mediaLoadButtonClassName}
              onClick={() => setLoaded(true)}
            >
              {UI_COPY.markdownMediaLoadEmbedLabel}
            </button>
            <a
              className={mediaLinkClassName}
              href={rawSrc}
              target="_blank"
              rel="noreferrer"
            >
              {UI_COPY.markdownMediaOpenInNewTabLabel}
            </a>
          </section>
        </section>
      )}
    </section>
  )
})

export const MediaVideoSnapshot = React.memo(function MediaVideoSnapshot({
  url,
  title,
  presentationMode,
  thumbnailSrc,
  fallbackThumbnailSrc,
  containerClassName,
  containerStyle,
  className,
  style,
  cardPreviewMode,
}: {
  url: string
  title: string
  presentationMode: boolean
  thumbnailSrc?: string
  fallbackThumbnailSrc?: string
  containerClassName?: string
  containerStyle?: React.CSSProperties
  className?: string
  style?: React.CSSProperties
  cardPreviewMode?: boolean
}) {
  const normalizedUrl = String(url || '').trim()
  const fallbackInfo = React.useMemo(() => getWebpageFallbackInfo(normalizedUrl, title), [normalizedUrl, title])
  const immediateThumbnailSrc = React.useMemo(() => applyImageLikeProxySrc(String(thumbnailSrc || '').trim()), [thumbnailSrc])
  const explicitFallbackThumbnailSrc = React.useMemo(() => applyImageLikeProxySrc(String(fallbackThumbnailSrc || '').trim()), [fallbackThumbnailSrc])
  const youtubeFallbackThumbnailSrc = React.useMemo(
    () => explicitFallbackThumbnailSrc || applyImageLikeProxySrc(String(buildYouTubeThumbnailPreviewDescriptor(normalizedUrl)?.thumbnailUrl || '').trim()),
    [explicitFallbackThumbnailSrc, normalizedUrl],
  )
  const immediateOrExplicitFallbackThumbnailSrc = React.useMemo(
    () => immediateThumbnailSrc || explicitFallbackThumbnailSrc,
    [explicitFallbackThumbnailSrc, immediateThumbnailSrc],
  )
  const [thumb, setThumb] = React.useState<string>(
    () => immediateOrExplicitFallbackThumbnailSrc,
  )
  const snapshotOverlayBadgeClassName = `absolute left-2 bottom-2 ${UI_RESPONSIVE_WEBPAGE_SNAPSHOT_OVERLAY_BADGE_CLASSNAME} rounded border ${UI_THEME_TOKENS.panel.border} bg-[color:var(--kg-panel-bg)]/90 px-2 py-1`

  React.useEffect(() => {
    let cancelled = false
    setThumb(immediateOrExplicitFallbackThumbnailSrc)
    if (immediateOrExplicitFallbackThumbnailSrc) return
    if (!normalizedUrl) return
    void getOrCreateVideoThumbnail(normalizedUrl).then((v) => {
      if (cancelled) return
      const next = String(v || '').trim()
      setThumb(prev => (prev === next ? prev : next))
    })
    return () => {
      cancelled = true
    }
  }, [immediateOrExplicitFallbackThumbnailSrc, normalizedUrl])

  if (!normalizedUrl) return <MediaErrorPlaceholder alt={title} />

  return (
    <section className={presentationMode ? 'w-full' : CARD_MARKDOWN_PREVIEW_MEDIA_FRAME_CLASS_NAME} data-kg-video-snapshot="1" data-src={normalizedUrl}>
      <a className="sr-only" href={normalizedUrl} target="_blank" rel="noreferrer">
        {normalizedUrl}
      </a>
      <section className={containerClassName || (presentationMode ? 'aspect-video w-full' : 'aspect-video w-full')} style={containerStyle}>
        <section
          className={
            [
              getMediaShellClassName(cardPreviewMode),
              className,
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
          style={style}
          data-kg-media-thumbnail="1"
          role="button"
          tabIndex={0}
        >
          {thumb ? (
            <img
              src={thumb}
              alt={fallbackInfo.titleLabel}
              loading="lazy"
              decoding="async"
              className={UI_RESPONSIVE_WEBPAGE_SNAPSHOT_PREVIEW_MEDIA_CLASSNAME}
              onError={() => {
                setThumb(prev => (youtubeFallbackThumbnailSrc && prev !== youtubeFallbackThumbnailSrc ? youtubeFallbackThumbnailSrc : ''))
              }}
            />
          ) : (
            <section className={UI_RESPONSIVE_WEBPAGE_SNAPSHOT_EMPTY_MEDIA_CLASSNAME} />
          )}
          <section aria-hidden={true} className={UI_RESPONSIVE_PASSIVE_FILL_SURFACE_CLASSNAME}>
            <section className={snapshotOverlayBadgeClassName}>
              <section className={`text-xs font-semibold ${UI_THEME_TOKENS.text.primary} truncate`}>{fallbackInfo.titleLabel}</section>
              <section className={`text-xs ${UI_THEME_TOKENS.text.tertiary} truncate`}>{fallbackInfo.hostLabel}</section>
            </section>
          </section>
        </section>
      </section>
    </section>
  )
})

export const MediaWebpageSnapshot = React.memo(function MediaWebpageSnapshot({
  url,
  title,
  presentationMode,
  containerClassName,
  containerStyle,
  className,
  style,
  cardPreviewMode,
}: {
  url: string
  title: string
  presentationMode: boolean
  containerClassName?: string
  containerStyle?: React.CSSProperties
  className?: string
  style?: React.CSSProperties
  cardPreviewMode?: boolean
}) {
  const richMediaPanelMode = useGraphStore(s => s.richMediaPanelMode)
  const preferEmbed = richMediaPanelMode === 'embed'

  const forceSnapshot = React.useMemo(() => {
    return shouldForceSnapshotIframeUrl(url)
  }, [url])

  const preferEmbedEffective = preferEmbed && !forceSnapshot

  const normalizedUrl = String(url || '').trim()
  const layoutPreset = React.useMemo(() => getMarkdownWebpageSnapshotPreset(), [])
  const layoutCacheKey = React.useMemo(() => buildWebpageLayoutCacheKey(layoutPreset), [layoutPreset])
  const skipSnapshot = preferEmbedEffective || isNoiseProneWebpagePreviewHost(normalizedUrl)
  const { snap, blocked } = useWebpageLayoutSnapshotLifecycle({
    url: normalizedUrl,
    layoutPreset,
    layoutCacheKey,
    skipSnapshot,
    resetOnDisabled: true,
  })
  const {
    fallbackInfo,
    metaImageSrc,
    faviconSrc,
    hostIconSrc,
  } = useWebpageSnapshotSurfaceAssets({
    url: normalizedUrl,
    title,
    suppressMetaImageUrl: isNoiseProneWebpagePreviewHost,
  })

  if (!normalizedUrl) return <MediaErrorPlaceholder alt={title} />

  const content = preferEmbedEffective ? (
    <MediaIframe
      src={normalizedUrl}
      title={title}
      presentationMode={presentationMode}
      scriptPolicy="allow"
      containerClassName={containerClassName}
      containerStyle={containerStyle}
      className={className}
      style={style}
      cardPreviewMode={cardPreviewMode}
    />
  ) : (
    <SharedWebpageSnapshotSurface
      url={normalizedUrl}
      title={title}
      titleLabel={fallbackInfo.titleLabel}
      hostLabel={fallbackInfo.hostLabel}
      snap={snap}
      blocked={blocked}
      metaImageSrc={metaImageSrc}
      faviconSrc={faviconSrc}
      hostIconSrc={hostIconSrc}
      thumbnailInteractive
    />
  )

  return (
    <section
      className={presentationMode ? 'w-full' : CARD_MARKDOWN_PREVIEW_MEDIA_FRAME_CLASS_NAME}
      data-kg-webpage-snapshot="1"
      data-src={normalizedUrl}
    >
      <section
        className={containerClassName || (presentationMode ? 'aspect-video w-full' : 'aspect-video w-full')}
        style={containerStyle}
      >
        <section
          className={
            [
              getMediaShellClassName(cardPreviewMode),
              className,
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
          style={style}
        >
          {content}
        </section>
      </section>
    </section>
  )
})

export const MediaVideo = ({
  src,
  poster,
  autoPlay,
  muted,
  loop,
  controls,
  className,
  style,
  cardPreviewMode,
}: {
  src: string
  poster?: string
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
  playsInline?: boolean
  controls?: boolean
  className?: string
  style?: React.CSSProperties
  cardPreviewMode?: boolean
}) => {
  const [error, setError] = React.useState(false)
  const primarySrc = applyMediaProxySrc(src)
  const [useFallback, setUseFallback] = React.useState(false)
  const activeSrc = useFallback ? src : primarySrc
  if (!src || error) {
    return <MediaErrorPlaceholder alt="Video" />
  }
  const showControls = controls === true ? true : autoPlay || loop ? false : true
  return (
    <CardMediaPreview
      kind="video"
      url={activeSrc}
      title="Video"
      interactive={showControls}
      fit={cardPreviewMode === true ? 'cover' : 'contain'}
      videoControls={showControls}
      videoMuted={muted}
      videoAutoPlay={autoPlay}
      videoLoop={loop}
      videoPoster={poster}
      mediaThumbnailDataAttr
      mediaClassName={['w-full max-w-full', getMediaFrameClassName(cardPreviewMode), className].filter(Boolean).join(' ') || undefined}
      mediaStyle={style}
      onError={() => {
        if (!useFallback && primarySrc !== src) {
          setUseFallback(true)
          return
        }
        setError(true)
      }}
    />
  )
}

export const MediaAudio = ({
  src,
  autoPlay,
  muted,
  loop,
  controls,
  className,
  style,
}: {
  src: string
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
  controls?: boolean
  className?: string
  style?: React.CSSProperties
}) => {
  const [error, setError] = React.useState(false)
  const primarySrc = applyMediaProxySrc(src)
  const [useFallback, setUseFallback] = React.useState(false)
  const activeSrc = useFallback ? src : primarySrc
  if (!src || error) {
    return <MediaErrorPlaceholder alt="Audio" />
  }
  const showControls = controls === false ? false : true
  return (
    <audio
      controls={showControls}
      className={['w-full max-w-full', mediaFrameClassName, className].filter(Boolean).join(' ') || undefined}
      style={style}
      src={activeSrc}
      autoPlay={autoPlay || undefined}
      muted={muted || undefined}
      loop={loop || undefined}
      onError={() => {
        if (!useFallback && primarySrc !== src) {
          setUseFallback(true)
          return
        }
        setError(true)
      }}
    />
  )
}

const MediaErrorPlaceholder = ({ alt }: { alt?: string }) => {
  const prefix = UI_COPY.markdownMediaErrorPrefix
  const label = alt ? `${prefix}: ${alt}` : prefix
  return (
    <section className={`${CARD_MARKDOWN_PREVIEW_MEDIA_ERROR_FRAME_CLASS_NAME} rounded border border-dashed border-red-300 bg-red-50 text-xs text-red-700 px-3 text-center`}>
      <span>{label}</span>
    </section>
  )
}

export const MediaImage = ({
  src,
  alt,
  width,
  height,
  className,
  style: styleProp,
  cardPreviewMode,
}: {
  src?: string
  alt: string
  width?: number | null
  height?: number | null
  className?: string
  style?: React.CSSProperties
  cardPreviewMode?: boolean
}) => {
  const [error, setError] = React.useState(false)
  const style: React.CSSProperties = { ...(styleProp || {}) }
  if (width) {
    style.width = `${Math.round(width)}px`
    style.maxWidth = '100%'
  }
  if (height) style.height = `${Math.round(height)}px`
  const normalizedSrc = normalizeSvgDataUriForImg(src || '')
  const primarySrc = applyImageLikeProxySrc(normalizedSrc)
  const [useFallback, setUseFallback] = React.useState(false)
  const activeSrc = useFallback ? normalizedSrc : primarySrc
  if (!normalizedSrc || error) {
    return <MediaErrorPlaceholder alt={alt} />
  }
  const kind = /^data:image\/svg\+xml/i.test(normalizedSrc) || /\.svg(?:[?#]|$)/i.test(normalizedSrc) ? 'svg' : 'image'
  return (
    <CardMediaPreview
      kind={kind}
      url={activeSrc}
      title={alt}
      interactive={false}
      fit="contain"
      mediaThumbnailDataAttr
      mediaStyle={Object.keys(style).length ? style : undefined}
      mediaClassName={[
        cardPreviewMode === true ? CARD_MARKDOWN_PREVIEW_MEDIA_CLASS_NAME : 'block mx-auto max-w-full h-auto',
        getMediaFrameClassName(cardPreviewMode),
        className,
      ].filter(Boolean).join(' ') || undefined}
      onError={() => {
        if (!useFallback && primarySrc !== src) {
          setUseFallback(true)
          return
        }
        setError(true)
      }}
    />
  )
}
