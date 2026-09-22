import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { Token, TokensParagraph, TokensGeneric, TokensLink, TokensImage, TokensText } from './MarkdownTokens'
import type { TokenWithLines } from '@/features/markdown/ui/markdownPreviewLex'
import { getLinkDisplayMode } from './linkDisplayMode'
import {
  applyMediaProxySrc,
  buildYouTubeEmbedUrl,
  isAbsoluteWebUrl,
  isSafeHref,
  isSafeMediaSrc,
  isVideoUrl,
  resolveHref,
  shouldRenderStandaloneMediaForLine,
} from '@/features/markdown/ui/markdownPreviewLinks'
import { normalizeWebpageLikeUrl } from 'grph-shared/url'
import { resolveIframeEmbed } from 'grph-shared/rich-media/iframe'
import { buildBilibiliEmbedUrl, buildTwitterEmbedUrl, buildVimeoEmbedUrl } from 'grph-shared/rich-media/providers'
import { isLikelyImageUrl } from '@/lib/url'
import { renderInlineTokens } from '@/lib/markdown-core/ui/MarkdownInlineRenderer.impl'
import { MediaWrapper, MediaIframe, MediaVideo, MediaImage, MediaWebpageSnapshot } from '@/lib/markdown-core/ui/MarkdownMediaUi.impl'
import type { RenderOpts } from './MarkdownRendererTypes'
import { renderReferencedParagraph } from '@/lib/markdown-core/ui/MarkdownReferencedParagraph'
import { MarkdownBlockContainer } from './MarkdownBlockContainer'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui'
import { UI_COPY } from '@/lib/config'
import {
  MARKDOWN_BLOCK_GUTTER_PADDING_LEFT_CLASS,
  MARKDOWN_BLOCK_GUTTER_PADDING_RIGHT_CLASS,
  MarkdownBlockDropMarkers,
  MarkdownBlockGutterControls,
  useMarkdownLineBlockDnD,
} from './MarkdownBlockGutter'
import { extractLinkText, extractDomain, StandaloneLinkCard, getStandaloneLinkedImageParagraph } from '@/lib/markdown-core/ui/MarkdownStandaloneLinkCard'
import { MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS } from './markdownEditSurfaceLayout'
import { readStandaloneParagraphUrlToken } from './standaloneMediaBudget'
import {
  CARD_MARKDOWN_PREVIEW_MEDIA_AUDIO_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_MEDIA_CHROME_CLASS_NAME,
} from '@/lib/cards/cardMarkdownPreviewUtils'
import { extractUpstreamUrlFromMarkdownLocalProxyUrl, normalizeMarkdownLocalProxyUrl } from '@/lib/markdown-core/ui/mediaProxyUrl'
type MarkdownParagraphBlockProps = {
  token: TokenWithLines
  highlightClass: string
  opts: RenderOpts
  baseTextClass: string
  commonBlockClass: string
  highlightStyle?: React.CSSProperties
  fragmentsEnabled?: boolean
  fragmentStep?: number
  fragmentClassNames?: string[]
  fragmentTags?: string[]
}
const isBlockHtmlToken = (t: Token): boolean => {
  const tt = t as unknown as { type?: unknown; text?: unknown; raw?: unknown }
  if (tt.type !== 'html') return false
  const raw = String(tt.text ?? tt.raw ?? '').trim()
  const lower = raw.toLowerCase()
  if (!lower.startsWith('<') || lower.startsWith('</')) return false
  const m = /^<\s*([a-z0-9-]+)/i.exec(lower)
  const tag = m && m[1] ? m[1] : ''
  if (!tag) return false
  const blockTags = new Set([
    'div',
    'section',
    'main',
    'article',
    'aside',
    'nav',
    'header',
    'footer',
    'ul',
    'ol',
    'table',
    'pre',
    'img',
    'picture',
    'iframe',
    'video',
    'audio',
    'svg',
    'details',
    'figure',
  ])
  if (!blockTags.has(tag)) return false
  if (!lower.includes(`</${tag}`) && !/\/\s*>$/.test(lower)) return false
  return true
}
const containsBlockHtml = (tokens: Token[] | undefined): boolean => {
  const list = Array.isArray(tokens) ? tokens : []
  for (const t of list) {
    if (isBlockHtmlToken(t)) return true
    const nested = (t as unknown as { tokens?: unknown }).tokens
    if (nested && containsBlockHtml(nested as Token[])) return true
  }
  return false
}

const tryExtractProxiedInnerUrl = (href: string): string => {
  const raw = normalizeMarkdownLocalProxyUrl(String(href || '').trim())
  if (!raw) return ''
  if (!raw.startsWith('/__webpage_asset_proxy') && !raw.startsWith('/__webpage_asset_path') && !raw.startsWith('/__fetch_remote')) return ''
  return extractUpstreamUrlFromMarkdownLocalProxyUrl(raw)
}
const looksLikeImageHref = (href: string): boolean => {
  const raw = normalizeMarkdownLocalProxyUrl(String(href || '').trim())
  if (!raw) return false
  if (/^data:image\//i.test(raw)) return true
  if (/\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(raw)) return true
  if (isLikelyImageUrl(raw)) return true
  const inner = tryExtractProxiedInnerUrl(raw)
  if (!inner) return false
  if (/\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(inner)) return true
  return isLikelyImageUrl(inner)
}

const looksLikeStandaloneBinaryMediaHref = (href: string): boolean => {
  const raw = normalizeMarkdownLocalProxyUrl(String(href || '').trim())
  if (!raw) return false
  if (looksLikeImageHref(raw)) return true
  if (isVideoUrl(raw) || /\.(mov)(\?|#|$)/i.test(raw)) return true
  if (/\.(mp3|wav|m4a|aac|flac|ogg)(\?|#|$)/i.test(raw)) return true
  return false
}

const getStandaloneMediaImageHref = (
  tokens: Token[] | undefined,
): { kind: 'image' | 'video' | 'audio' | 'iframe'; href: string; alt: string } | null => {
  const list = Array.isArray(tokens) ? tokens : []
  let image: TokensImage | null = null
  for (const t of list) {
    const tt = t as unknown as { type?: unknown }
    const type = String(tt.type || '')
    if (type === 'image') {
      if (image) return null
      image = t as unknown as TokensImage
      continue
    }
    if (type === 'text') {
      const text = String((t as unknown as TokensText).text || '')
      if (!text.trim()) continue
      return null
    }
    if (type === 'softbreak' || type === 'br') continue
    return null
  }
  if (!image) return null
  const href = String(image.href || '').trim()
  if (!href) return null
  const alt = String(image.text || '').trim(), altNorm = alt.toLowerCase()
  const looksImage = looksLikeImageHref(href)
  const looksVideo = isVideoUrl(href) || /\.(mov)(\?|#|$)/i.test(href)
  const looksAudio = /\.(mp3|wav|m4a|aac|flac|ogg)(\?|#|$)/i.test(href)
  if (altNorm.startsWith('iframe')) return { kind: 'iframe', href, alt }
  if (altNorm.startsWith('image') || looksImage) return { kind: 'image', href, alt }
  if (altNorm.startsWith('audio') || looksAudio) return { kind: 'audio', href, alt }
  if (altNorm.startsWith('video') || looksVideo) return { kind: 'video', href, alt }
  return null
}

const getStandaloneWebpageHrefFromImageToken = (tokens: Token[] | undefined): string | null => {
  const list = Array.isArray(tokens) ? tokens : []
  let image: TokensImage | null = null
  for (const t of list) {
    const tt = t as unknown as { type?: unknown }
    const type = String(tt.type || '')
    if (type === 'image') {
      if (image) return null
      image = t as unknown as TokensImage
      continue
    }
    if (type === 'text') {
      const text = String((t as unknown as TokensText).text || '')
      if (!text.trim()) continue
      return null
    }
    if (type === 'softbreak' || type === 'br') continue
    return null
  }
  if (!image) return null
  const href = String(image.href || '').trim()
  if (!href) return null
  if (!/^https?:\/\//i.test(href)) return null
  const altNorm = String(image.text || '').trim().toLowerCase()
  if (altNorm.startsWith('iframe') || altNorm.startsWith('video') || altNorm.startsWith('audio')) return null
  if (/^data:image\//i.test(href)) return null
  if (looksLikeImageHref(href)) return null
  if (/\.(mp4|webm|ogg|mov|mp3|wav|m4a|aac|flac)(\?|#|$)/i.test(href)) return null
  return href
}

export const MarkdownParagraphBlock = React.memo(function MarkdownParagraphBlock({
  token: t,
  highlightClass,
  opts,
  baseTextClass,
  commonBlockClass,
  highlightStyle,
  fragmentsEnabled = false,
  fragmentStep = 0,
  fragmentClassNames,
  fragmentTags,
}: MarkdownParagraphBlockProps) {
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const iconSizeClass = getIconSizeClass(uiIconScale)

  const p = t as unknown as TokensParagraph
  const endLine = t.endLine || t.startLine
  const blockControlsAllowed =
    !opts.markdownPresentationMode &&
    !!opts.viewerBlockEditingEnabled &&
    opts.markdownBlockControlsEnabled !== false
  const canInsertLine = blockControlsAllowed && !!opts.onInsertLineAfter && Number.isFinite(endLine)
  const canReorder = blockControlsAllowed && !!opts.onReorderLineBlock && Number.isFinite(t.startLine)
  const gutterEnabled = (canInsertLine || canReorder) && opts.markdownBlockGutterEnabled !== false
  const standaloneMediaEnabled =
    opts.markdownPresentationMode ||
    opts.markdownCardPreviewMode === true ||
    blockControlsAllowed ||
    opts.markdownViewerMediaMode === 'image'

  const dnd = useMarkdownLineBlockDnD({
    enabled: canReorder,
    targetStartLine: t.startLine,
    targetEndLine: endLine,
    onReorder: (source, target, position) => opts.onReorderLineBlock?.(source, target, position),
  })

  const standaloneLinkedImage = getStandaloneLinkedImageParagraph(t as unknown as Token)
  const allowStandaloneLinkedYouTubeThumbnail =
    !!standaloneLinkedImage && !!buildYouTubeEmbedUrl(standaloneLinkedImage.linkHref)
  if ((standaloneMediaEnabled || allowStandaloneLinkedYouTubeThumbnail) && standaloneLinkedImage) {
    const resolvedImageHref = resolveHref(standaloneLinkedImage.imageHref, opts.activeDocumentPath)
    return (
      <MediaWrapper
        type="image"
        srcRaw={standaloneLinkedImage.linkHref}
        startLine={t.startLine}
        endLine={endLine}
        highlightClass={highlightClass}
        highlightStyle={highlightStyle}
        opts={opts}
      >
        <MediaImage src={resolvedImageHref} alt={standaloneLinkedImage.imageAlt} cardPreviewMode={opts.markdownCardPreviewMode} />
      </MediaWrapper>
    )
  }
  const standaloneHrefCandidate = readStandaloneParagraphUrlToken(t as unknown as Token, { rejectLinkedMedia: true })
  const allowLargeDocumentStandaloneYouTubeSnapshot =
    !!opts.markdownLargeDocumentMode && !!buildYouTubeEmbedUrl(standaloneHrefCandidate)
  const standaloneHrefRaw =
    standaloneHrefCandidate && (
      standaloneMediaEnabled
      || allowLargeDocumentStandaloneYouTubeSnapshot
      || !looksLikeStandaloneBinaryMediaHref(standaloneHrefCandidate)
    )
      ? standaloneHrefCandidate
      : null
  const standaloneHref = standaloneHrefRaw && shouldRenderStandaloneMediaForLine({ href: standaloneHrefRaw, startLine: t.startLine, markdownLargeDocumentMode: opts.markdownLargeDocumentMode, standaloneMediaRenderLineSet: opts.standaloneMediaRenderLineSet }) ? standaloneHrefRaw : null
  if (standaloneHref && isSafeHref(standaloneHref) && isAbsoluteWebUrl(standaloneHref)) {
    const renderStandaloneMedia = (type: string, children: React.ReactNode) => (
      <MediaWrapper
        type={type}
        srcRaw={standaloneHref}
        startLine={t.startLine}
        endLine={endLine}
        highlightClass={highlightClass}
        highlightStyle={highlightStyle}
        opts={opts}
      >
        {children}
      </MediaWrapper>
    )

    const youtube = buildYouTubeEmbedUrl(standaloneHref)
    if (youtube) {
      return renderStandaloneMedia(
        'youtube',
        <MediaIframe
          src={youtube}
          title="YouTube"
          presentationMode={opts.markdownPresentationMode}
          deferLoad={opts.markdownLargeDocumentMode}
          cardPreviewMode={opts.markdownCardPreviewMode}
        />,
      )
    }

    const tweet = buildTwitterEmbedUrl(standaloneHref)
    if (tweet) {
      const theme = String(opts.rootThemeMode || '').toLowerCase() === 'dark' ? 'dark' : 'light'
      const src = `${tweet}&theme=${theme}`
      return renderStandaloneMedia(
        'tweet',
        <MediaIframe
          src={src}
          title="X"
          presentationMode={opts.markdownPresentationMode}
          cardPreviewMode={opts.markdownCardPreviewMode}
        />,
      )
    }

    if (looksLikeImageHref(standaloneHref)) {
      const resolved = resolveHref(standaloneHref, opts.activeDocumentPath)
      return renderStandaloneMedia('image', <MediaImage src={resolved} alt={standaloneHref} cardPreviewMode={opts.markdownCardPreviewMode} />)
    }

    const vimeo = buildVimeoEmbedUrl(standaloneHref)
    if (vimeo) {
      return renderStandaloneMedia(
        'vimeo',
        <MediaIframe
          src={vimeo}
          title="Vimeo"
          presentationMode={opts.markdownPresentationMode}
          cardPreviewMode={opts.markdownCardPreviewMode}
        />,
      )
    }

    const bilibili = buildBilibiliEmbedUrl(standaloneHref)
    if (bilibili) {
      return renderStandaloneMedia(
        'bilibili',
        <MediaIframe
          src={bilibili}
          title="Bilibili"
          presentationMode={opts.markdownPresentationMode}
          cardPreviewMode={opts.markdownCardPreviewMode}
        />,
      )
    }

    if (isVideoUrl(standaloneHref)) {
      const resolved = resolveHref(standaloneHref, opts.activeDocumentPath)
      const src = applyMediaProxySrc(resolved)
      return renderStandaloneMedia('video', <MediaVideo src={src} cardPreviewMode={opts.markdownCardPreviewMode} />)
    }

    const normalizedHref = normalizeWebpageLikeUrl(standaloneHref)
    const linkText = extractLinkText(t as unknown as Token)
    const linkDomain = extractDomain(standaloneHref)
    const linkDisplayMode = getLinkDisplayMode(t.startLine)
    if (linkDisplayMode === 'card') {
      return renderStandaloneMedia(
        'webpage',
        <StandaloneLinkCard href={standaloneHref} title={linkText} domain={linkDomain} opts={opts} />,
      )
    }

    return renderStandaloneMedia(
      'webpage',
      <MediaWebpageSnapshot
        url={normalizedHref}
        title="Webpage"
        presentationMode={opts.markdownPresentationMode}
        cardPreviewMode={opts.markdownCardPreviewMode}
      />,
    )
  }

  const standaloneWebpageHref = !opts.markdownLargeDocumentMode ? getStandaloneWebpageHrefFromImageToken(p.tokens) : null
  if (standaloneWebpageHref && isSafeHref(standaloneWebpageHref) && isAbsoluteWebUrl(standaloneWebpageHref)) {
    const normalizedHref = normalizeWebpageLikeUrl(standaloneWebpageHref)
    const youtube = buildYouTubeEmbedUrl(normalizedHref)
    if (youtube) {
      return (
        <MediaWrapper
          type="youtube"
          srcRaw={normalizedHref}
          startLine={t.startLine}
          endLine={t.endLine || t.startLine}
          highlightClass={highlightClass}
          highlightStyle={highlightStyle}
          opts={opts}
        >
          <MediaIframe
            src={youtube}
            title="YouTube"
            presentationMode={opts.markdownPresentationMode}
            cardPreviewMode={opts.markdownCardPreviewMode}
          />
        </MediaWrapper>
      )
    }
    const tweet = buildTwitterEmbedUrl(normalizedHref)
    if (tweet) {
      const theme = String(opts.rootThemeMode || '').toLowerCase() === 'dark' ? 'dark' : 'light'
      const src = `${tweet}&theme=${theme}`
      return (
        <MediaWrapper
          type="tweet"
          srcRaw={normalizedHref}
          startLine={t.startLine}
          endLine={t.endLine || t.startLine}
          highlightClass={highlightClass}
          highlightStyle={highlightStyle}
          opts={opts}
        >
          <MediaIframe
            src={src}
            title="X"
            presentationMode={opts.markdownPresentationMode}
            cardPreviewMode={opts.markdownCardPreviewMode}
          />
        </MediaWrapper>
      )
    }

    const bilibili = buildBilibiliEmbedUrl(normalizedHref)
    if (bilibili) {
      return (
        <MediaWrapper
          type="bilibili"
          srcRaw={normalizedHref}
          startLine={t.startLine}
          endLine={t.endLine || t.startLine}
          highlightClass={highlightClass}
          highlightStyle={highlightStyle}
          opts={opts}
        >
          <MediaIframe
            src={bilibili}
            title="Bilibili"
            presentationMode={opts.markdownPresentationMode}
            cardPreviewMode={opts.markdownCardPreviewMode}
          />
        </MediaWrapper>
      )
    }
    return (
      <MediaWrapper
        type="webpage"
        srcRaw={normalizedHref}
        startLine={t.startLine}
        endLine={t.endLine || t.startLine}
        highlightClass={highlightClass}
        highlightStyle={highlightStyle}
        opts={opts}
      >
        <MediaWebpageSnapshot
          url={normalizedHref}
          title="Webpage"
          presentationMode={opts.markdownPresentationMode}
          cardPreviewMode={opts.markdownCardPreviewMode}
        />
      </MediaWrapper>
    )
  }
  const standaloneMedia = standaloneMediaEnabled ? getStandaloneMediaImageHref(p.tokens) : null
  if (standaloneMedia && isSafeMediaSrc(standaloneMedia.href)) {
    const resolved = resolveHref(standaloneMedia.href, opts.activeDocumentPath)
    const renderStandaloneMedia = (type: string, children: React.ReactNode) => (
      <MediaWrapper
        type={type}
        srcRaw={standaloneMedia.href}
        startLine={t.startLine}
        endLine={t.endLine || t.startLine}
        highlightClass={highlightClass}
        highlightStyle={highlightStyle}
        opts={opts}
      >
        {children}
      </MediaWrapper>
    )
    if (standaloneMedia.kind === 'iframe' && isAbsoluteWebUrl(resolved)) {
      const embed = resolveIframeEmbed({ url: resolved })
      return renderStandaloneMedia(
        'iframe',
        embed.direct ? (
          <MediaIframe
            src={resolved}
            title="Embedded content"
            presentationMode={opts.markdownPresentationMode}
            cardPreviewMode={opts.markdownCardPreviewMode}
          />
        ) : (
          <MediaWebpageSnapshot
            url={resolved}
            title="Embedded content"
            presentationMode={opts.markdownPresentationMode}
            cardPreviewMode={opts.markdownCardPreviewMode}
          />
        ),
      )
    }
    if (standaloneMedia.kind === 'image') {
      return renderStandaloneMedia('image', <MediaImage src={resolved} alt={standaloneMedia.alt || standaloneMedia.href} cardPreviewMode={opts.markdownCardPreviewMode} />)
    }
    if (standaloneMedia.kind === 'video') {
      const src = applyMediaProxySrc(resolved)
      return renderStandaloneMedia('video', <MediaVideo src={src} cardPreviewMode={opts.markdownCardPreviewMode} />)
    }
    if (standaloneMedia.kind === 'audio') {
      const src = applyMediaProxySrc(resolved)
      const audioClassName = opts.markdownCardPreviewMode === true
        ? `${CARD_MARKDOWN_PREVIEW_MEDIA_AUDIO_CLASS_NAME} ${CARD_MARKDOWN_PREVIEW_MEDIA_CHROME_CLASS_NAME}`
        : `${CARD_MARKDOWN_PREVIEW_MEDIA_AUDIO_CLASS_NAME} rounded border ${UI_THEME_TOKENS.panel.border}`
      return renderStandaloneMedia(
        'audio',
        <audio controls src={src || undefined} className={audioClassName} />,
      )
    }
  }
  const wrapperAs = containsBlockHtml(p.tokens) || !!standaloneMedia ? 'section' : 'p'
  const baseClassName = ['mt-2 mb-2', baseTextClass, commonBlockClass]
    .filter(Boolean)
    .join(' ')
  const referenced = blockControlsAllowed && wrapperAs === 'p' ? renderReferencedParagraph({
    source: opts.markdownSourceLines?.slice(t.startLine - 1, t.endLine).join('\n') || '', opts,
    startLine: t.startLine, endLine: t.endLine, className: `${baseClassName} ${highlightClass} ${gutterEnabled ? `${MARKDOWN_BLOCK_GUTTER_PADDING_LEFT_CLASS} ${MARKDOWN_BLOCK_GUTTER_PADDING_RIGHT_CLASS}` : ''}`, style: highlightStyle,
  }) : null
  if (referenced) return referenced
  return (
    <MarkdownBlockContainer
      as={wrapperAs}
      className={`${baseClassName} relative group ${gutterEnabled ? `${MARKDOWN_BLOCK_GUTTER_PADDING_LEFT_CLASS} ${MARKDOWN_BLOCK_GUTTER_PADDING_RIGHT_CLASS}` : ''} ${dnd.isDragging ? 'opacity-60' : ''}`}
      highlightClass={highlightClass}
      highlightStyle={highlightStyle}
      startLine={t.startLine}
      endLine={t.endLine}
      inlineEditable={blockControlsAllowed && !!opts.onReplaceLineRange}
      sourceLines={opts.markdownSourceLines}
      onReplaceLineRange={opts.onReplaceLineRange}
      onInlineEditStateChange={opts.onInlineEditStateChange}
        onInlineDraftTextChange={opts.onInlineDraftTextChange}
      forbidCopy={!!opts.forbidCopy}
      editorClassName={MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS}
      editPresentation="html"
      editHtmlRender="inline"
      editStripLinePrefix={opts.markdownParagraphEditStripLinePrefix}
      editDefaultLinePrefix={opts.markdownParagraphEditDefaultLinePrefix}
      onDragOver={dnd.handleDragOver}
      onDragLeave={dnd.handleDragLeave}
      onDrop={dnd.handleDrop}
    >
      {gutterEnabled && (
        <>
          <MarkdownBlockDropMarkers dragState={dnd.dragState} />
          <MarkdownBlockGutterControls
            canInsertLine={canInsertLine}
            onInsertLine={() => opts.onInsertLineAfter?.(endLine)}
            canReorder={canReorder}
            onDragStart={dnd.handleDragStart}
            onDragEnd={dnd.handleDragEnd}
            iconSizeClass={iconSizeClass}
            iconStrokeWidth={uiIconStrokeWidth}
            labelReorder={UI_COPY.markdownBlockReorderLineLabel}
            labelInsert={UI_COPY.markdownBlockInsertLineLabel}
          />
        </>
      )}
      <span data-kg-paragraph-content="1">{renderInlineTokens(p.tokens, {
        activeDocumentPath: opts.activeDocumentPath,
        uiPanelTextFontClass: opts.uiPanelTextFontClass,
        uiPanelMonospaceTextClass: opts.uiPanelMonospaceTextClass,
        markdownPresentationMode: opts.markdownPresentationMode,
        markdownCardPreviewMode: opts.markdownCardPreviewMode,
        markdownViewerMediaMode: opts.markdownViewerMediaMode, markdownVariablePreviewByKey: opts.markdownVariablePreviewByKey,
        fragmentOptions:
          opts.markdownPresentationMode && fragmentsEnabled
            ? {
                enabled: true,
                currentStep: fragmentStep,
                classNames: fragmentClassNames || [],
                tags: fragmentTags || [],
              }
            : null,
      })}</span>
    </MarkdownBlockContainer>
  )
})
