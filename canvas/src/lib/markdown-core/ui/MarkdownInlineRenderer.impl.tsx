import React from 'react'
import type {
  Token,
  TokensGeneric,
  TokensText,
  TokensStrong,
  TokensEm,
  TokensDel,
  TokensLink,
  TokensImage,
  TokensCode,
  TokensMath,
  TokensHTML,
  TokensSub,
  TokensSup,
  TokensMark,
  TokensFootnoteRef,
} from '@/features/markdown/ui/MarkdownTokens'
import {
  applyMediaProxySrc,
  isAbsoluteWebUrl,
  isSafeHref,
  isSafeMediaSrc,
  resolveHref,
  buildAnchorAttrs,
  renderSafeHtmlBlock,
} from '@/features/markdown/ui/markdownPreviewLinks'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { InlineRenderOpts } from '@/features/markdown/ui/MarkdownRendererTypes'
import { resolveIframeEmbed } from 'grph-shared/rich-media/iframe'
import { buildYouTubeTimestampPreviewDescriptor } from 'grph-shared/rich-media/providers'
import { Volume2 } from 'lucide-react'
import { MediaIframe, MediaVideo, MediaWebpageSnapshot } from '@/lib/markdown-core/ui/MarkdownMediaUi.impl'
import { CardMediaPreview } from '@/lib/cards/CardMediaPreview'
import { useGraphStore } from '@/hooks/useGraphStore'
import { MARKDOWN_INLINE_CODE_VIEW_CLASS } from '@/features/markdown/ui/markdownInlineCodeParity'
import { parseMarkdownInlineCodeSemantic, parseMarkdownSigil, readMarkdownSigilInlineStyle } from '@/features/markdown/ui/markdownSigil'
import { DATA_VIEW_INLINE_TEXT_CHIP_ROW_CLASSNAME } from '@/features/markdown/ui/dataViewChipStyles'
import { renderAgenticOsInlineCodeInvocationLinks } from '@/features/agentic-os/agenticOsInvocationChips'
import {
  parseMarkdownVariableTokens,
} from '@/features/markdown/ui/markdownVariableReferences'
import { renderInlineHtmlElement, renderInlineHtmlToken } from './markdownInlineHtmlToken'
import { renderInlineMediaWithDownload } from './MarkdownInlineMediaDownload'
import { YouTubeTimestampPreviewLink } from './MarkdownYouTubeTimestampPreviewLink'
import { normalizeSvgDataUriForImg } from './markdownSvgDataUri'
import {
  CARD_MARKDOWN_PREVIEW_MEDIA_AUDIO_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_MEDIA_CHROME_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_CLASS_NAME,
  readCardMarkdownPreviewMediaLabel,
} from '@/lib/cards/cardMarkdownPreviewUtils'
import { CardPreviewInlineMediaPill } from '@/lib/cards/CardPreviewInlineMediaPill'
import { UI_RESPONSIVE_MARKDOWN_BOUNDED_IMAGE_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import { renderMarkdownVariableReferenceChip } from './markdownInlineVariableMediaPreview'
type KatexModule = typeof import('katex')
let katexModulePromise: Promise<KatexModule> | null = null
const normalizeInlineVariablePreviewKey = (key: string): string => String(key || '').trim().toLowerCase()
function resolveInlineMediaVariablePillProps(args: {
  label: string
  fallbackLabel: string
  mediaUrl: string
  opts: InlineRenderOpts
}): {
  displayLabel?: string
  sourceTitle?: string
  sourceToken?: string
  sourceValue?: string
} {
  const label = readCardMarkdownPreviewMediaLabel(args.label, args.fallbackLabel)
  const preview = args.opts.markdownVariablePreviewByKey?.[normalizeInlineVariablePreviewKey(label)]
  if (!preview) return {}
  const token = `@${label}`
  const source = preview.source || 'unresolved'
  const line = preview.line ? ` line ${preview.line}` : ''
  return {
    displayLabel: token,
    sourceToken: token,
    sourceValue: preview.value || args.mediaUrl,
    sourceTitle: [
      `${token} - Markdown media reference`,
      `Source: ${source}${line}`,
      preview.value ? `Value: ${preview.value}` : '',
      args.mediaUrl ? `Media: ${args.mediaUrl}` : '',
    ].filter(Boolean).join('\n'),
  }
}
const loadKatexModule = async (): Promise<KatexModule> => {
  if (!katexModulePromise) {
    katexModulePromise = import('katex')
      .then(mod => mod)
      .catch(err => {
        katexModulePromise = null
        throw err
      })
  }
  return katexModulePromise
}
function InlineMathRenderer({ tex, display }: { tex: string; display: boolean }) {
  const [html, setHtml] = React.useState<string>(display ? tex : tex)
  React.useEffect(() => {
    let cancelled = false
    void loadKatexModule()
      .then(katex => {
        if (cancelled) return
        let nextHtml = ''
        try {
          nextHtml = katex.renderToString(tex, {
            throwOnError: false,
            displayMode: display,
            strict: 'warn',
          })
        } catch {
          nextHtml = tex
        }
        setHtml(nextHtml)
      })
      .catch(() => {
        if (cancelled) return
        setHtml(tex)
      })
    return () => {
      cancelled = true
    }
  }, [display, tex])
  if (display) {
    return <span className="block my-3 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
  }
  return <span className="inline-block" dangerouslySetInnerHTML={{ __html: html }} />
}
const INLINE_HTML_WRAPPER_TAGS = new Set([
  'a',
  'abbr',
  'button',
  'code',
  'span',
  'u',
  'strong',
  'b',
  'em',
  'i',
  's',
  'del',
  'sub',
  'sup',
  'mark',
  'v-click',
  'v-mark',
])
const readInlineHtmlWrapperToken = (token: Token): { tag: string; kind: 'open' | 'close'; raw: string } | null => {
  const generic = token as unknown as TokensGeneric
  if (generic.type !== 'html') return null
  const raw = String((token as unknown as TokensHTML).text || '').trim()
  if (!raw) return null
  const closeMatch = raw.match(/^<\s*\/\s*([A-Za-z0-9-]+)\s*>$/)
  if (closeMatch) {
    const tag = String(closeMatch[1] || '').toLowerCase()
    if (INLINE_HTML_WRAPPER_TAGS.has(tag)) return { tag, kind: 'close', raw }
    return null
  }
  if (/\/\s*>$/.test(raw)) return null
  const openMatch = raw.match(/^<\s*([A-Za-z0-9-]+)\b[^>]*>$/)
  if (!openMatch) return null
  const tag = String(openMatch[1] || '').toLowerCase()
  if (!INLINE_HTML_WRAPPER_TAGS.has(tag)) return null
  return { tag, kind: 'open', raw }
}
const splitPlainUrls = (text: string): Array<{ kind: 'text' | 'url'; value: string }> => {
  const raw = String(text || '')
  if (!raw) return [{ kind: 'text', value: '' }]
  const re = /https?:\/\/[^\s<>()]+/g
  const out: Array<{ kind: 'text' | 'url'; value: string }> = []
  let last = 0
  for (;;) {
    const m = re.exec(raw)
    if (!m) break
    const start = m.index
    const end = start + m[0].length
    if (start > last) out.push({ kind: 'text', value: raw.slice(last, start) })
    out.push({ kind: 'url', value: m[0] })
    last = end
  }
  if (last < raw.length) out.push({ kind: 'text', value: raw.slice(last) })
  return out.length ? out : [{ kind: 'text', value: raw }]
}
const splitVariableRefs = (text: string): Array<
  | { kind: 'text'; value: string }
  | { kind: 'var'; value: string; key: string }
> => {
  const raw = String(text || '')
  if (!raw) return [{ kind: 'text', value: '' }]
  const tokens = parseMarkdownVariableTokens(raw)
  if (!tokens.length) return [{ kind: 'text', value: raw }]
  const out: Array<{ kind: 'text'; value: string } | { kind: 'var'; value: string; key: string }> = []
  let cursor = 0
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i]
    if (!t) continue
    if (t.start > cursor) out.push({ kind: 'text', value: raw.slice(cursor, t.start) })
    out.push({ kind: 'var', value: t.raw, key: t.key })
    cursor = t.end
  }
  if (cursor < raw.length) out.push({ kind: 'text', value: raw.slice(cursor) })
  return out
}
const INLINE_SEMANTIC_BADGE_CLASS = [
  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 align-baseline leading-none',
  'border-slate-300/70 bg-slate-100/80 text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200',
].join(' ')
const INLINE_SEMANTIC_LABEL_CLASS = [
  'uppercase tracking-wide text-[10px] font-semibold',
  UI_THEME_TOKENS.text.secondary,
].join(' ')
const INLINE_SEMANTIC_VALUE_CLASS = 'font-medium'
const INLINE_COMMENT_RANGE_CLASS = [
  'cursor-pointer underline decoration-dotted underline-offset-2',
  UI_THEME_TOKENS.status.warning,
].join(' ')
const readCommentReferenceCodeToken = (token: Token): { code: string; commentId: string } | null => {
  const generic = token as unknown as TokensGeneric
  if (generic.type !== 'code') return null
  const codeToken = token as unknown as TokensCode
  const semantic = parseMarkdownInlineCodeSemantic(codeToken.text)
  if (!semantic || semantic.kind !== 'reference' || semantic.referenceKind !== 'comment') return null
  const commentId = String(semantic.value || '').trim()
  if (!commentId) return null
  return {
    code: semantic.code,
    commentId,
  }
}
const getInlineSemanticToneClassName = (badgeLabel: string): string => {
  const label = String(badgeLabel || '').trim().toLowerCase()
  if (label === 'comment') return `${UI_THEME_TOKENS.status.warning} border-amber-300/70 dark:border-amber-700/70`
  if (label === 'callout') return `${UI_THEME_TOKENS.status.info} border-sky-300/70 dark:border-sky-700/70`
  if (label === 'node' || label === 'edge' || label === 'media' || label === 'media-row') {
    return `${UI_THEME_TOKENS.status.info} border-sky-300/70 dark:border-sky-700/70`
  }
  if (label === 'url') return `${UI_THEME_TOKENS.status.success} border-emerald-300/70 dark:border-emerald-700/70`
  if (label === 'date' || label === 'hash') return `${UI_THEME_TOKENS.status.warning} border-amber-300/70 dark:border-amber-700/70`
  return ''
}
const renderInlineCodeSemanticToken = (
  rawText: string,
  key: string,
  activeDocumentPath: string | undefined,
): React.ReactNode | null => {
  const semantic = parseMarkdownInlineCodeSemantic(rawText)
  if (!semantic) return null
  if (semantic.kind === 'annotation') {
    return (
      <span
        key={key}
        data-kg-sigil="1"
        style={readMarkdownSigilInlineStyle({
          text: semantic.displayText,
          color: semantic.color,
          background: semantic.background,
        })}
      >
        {semantic.displayText}
      </span>
    )
  }
  const className = [INLINE_SEMANTIC_BADGE_CLASS, getInlineSemanticToneClassName(semantic.badgeLabel)].filter(Boolean).join(' ')
  const valueNode =
    semantic.kind === 'value' && semantic.valueKind === 'url' && isAbsoluteWebUrl(semantic.value) && isSafeHref(semantic.value)
      ? (() => {
          const href = resolveHref(semantic.value, activeDocumentPath)
          const anchor = buildAnchorAttrs(href)
          return (
            <a href={href || undefined} target={anchor.target} rel={anchor.rel} className={anchor.className}>
              {semantic.displayText}
            </a>
          )
        })()
      : <span className={INLINE_SEMANTIC_VALUE_CLASS}>{semantic.displayText}</span>
  return (
    <span
      key={key}
      data-kg-inline-code-token="1"
      data-kg-inline-code-kind={semantic.kind}
      data-kg-inline-code-badge={semantic.badgeLabel}
      data-kg-inline-code-raw={semantic.code}
      className={className}
    >
      <span className={INLINE_SEMANTIC_LABEL_CLASS}>{semantic.badgeLabel}</span>
      {valueNode}
    </span>
  )
}
export const renderInlineTokens = (tokens: Token[] | undefined, opts: InlineRenderOpts): React.ReactNode => {
  const { activeDocumentPath, uiPanelTextFontClass, uiPanelMonospaceTextClass, markdownPresentationMode } = opts
  const cardPreviewMode = opts.markdownCardPreviewMode === true
  const inlineMediaChipMode = cardPreviewMode || (!markdownPresentationMode && opts.markdownViewerMediaMode !== 'image')
  const inlineMediaToggleEnabled = inlineMediaChipMode && !cardPreviewMode
  const fragmentOpts = opts.fragmentOptions || null
  const fragmentIndexRef = { current: 0 }
  const inlineCodeClassName = MARKDOWN_INLINE_CODE_VIEW_CLASS
  const renderTokens = (subTokens: Token[] | undefined, insideLink: boolean): React.ReactNode => {
    const list = Array.isArray(subTokens) ? subTokens : []
    const out: React.ReactNode[] = []
    for (let i = 0; i < list.length; i += 1) {
      const token = list[i]!
      const commentRangeStart = readCommentReferenceCodeToken(token)
      if (commentRangeStart) {
        let closeIndex = -1
        for (let j = i + 2; j < list.length; j += 1) {
          const commentRangeEnd = readCommentReferenceCodeToken(list[j]!)
          if (!commentRangeEnd) continue
          if (commentRangeEnd.commentId !== commentRangeStart.commentId) continue
          closeIndex = j
          break
        }
        if (closeIndex > i) {
          const childTokens = list.slice(i + 1, closeIndex)
          const childNodes = renderTokens(childTokens, insideLink)
          const previewText = childTokens
            .map(child => {
              const childToken = child as unknown as { raw?: unknown; text?: unknown }
              return String(childToken.raw ?? childToken.text ?? '')
            })
            .join('')
            .trim()
          out.push(
            <span
              key={`${commentRangeStart.commentId}:${i}`}
              data-kg-comment="1"
              data-kg-comment-range="1"
              data-kg-comment-id={commentRangeStart.commentId}
              data-kg-comment-text={previewText}
              data-kg-comment-raw-start={`\`${commentRangeStart.code}\``}
              data-kg-comment-raw-end={`\`${commentRangeStart.code}\``}
              className={INLINE_COMMENT_RANGE_CLASS}
              role="note"
              tabIndex={0}
              title={previewText || 'Comment range'}
            >
              {childNodes}
            </span>,
          )
          i = closeIndex
          continue
        }
      }
      const wrapper = readInlineHtmlWrapperToken(token)
      if (wrapper?.kind === 'open') {
        let depth = 1
        let closeIndex = -1
        for (let j = i + 1; j < list.length; j += 1) {
          const nextWrapper = readInlineHtmlWrapperToken(list[j]!)
          if (!nextWrapper || nextWrapper.tag !== wrapper.tag) continue
          depth += nextWrapper.kind === 'open' ? 1 : -1
          if (depth === 0) {
            closeIndex = j
            break
          }
        }
        if (closeIndex > i) {
          const wrapperChildren = renderTokens(list.slice(i + 1, closeIndex), insideLink || wrapper.tag === 'a')
          out.push(renderInlineHtmlElement({
            raw: wrapper.raw,
            key: `${wrapper.tag}:${i}`,
            opts,
            uiPanelTextFontClass,
            uiPanelMonospaceTextClass,
            inlineCodeClassName,
            fragmentIndexRef,
            children: wrapperChildren,
          }))
          i = closeIndex
          continue
        }
      }
      if (wrapper?.kind === 'close') continue
      out.push(renderOne(token, i, insideLink))
    }
    return out
  }
  const renderOne = (t: Token, i: number, insideLink: boolean): React.ReactNode => {
    const key = `${t.type}:${i}`
    const tt = t as unknown as TokensGeneric
    if (tt.type === 'text') {
      const text = String((t as unknown as TokensText).text || '')
      if (insideLink) {
        return <React.Fragment key={key}>{text}</React.Fragment>
      }
      return (
        <React.Fragment key={key}>
          {splitVariableRefs(text).map((segment, segmentIndex) => {
            const baseKey = `${key}:seg:${segmentIndex}`
            if (segment.kind === 'var') {
              return renderMarkdownVariableReferenceChip({ baseKey, key: segment.key, raw: segment.value, opts })
            }
            const parts = splitPlainUrls(segment.value)
            return parts.map((p, j) => {
              const k = `${baseKey}:plain:${j}`
              if (p.kind !== 'url') {
                return (
                  <React.Fragment key={k}>
                    {renderMarkdownSigilInlineText(p.value, { keywordChipClassName: DATA_VIEW_INLINE_TEXT_CHIP_ROW_CLASSNAME })}
                  </React.Fragment>
                )
              }
                const hrefRaw = p.value.trim()
                if (!hrefRaw || !isAbsoluteWebUrl(hrefRaw) || !isSafeHref(hrefRaw)) {
                  return <React.Fragment key={k}>{p.value}</React.Fragment>
                }
                const anchor = buildAnchorAttrs(hrefRaw)
                const preview = buildYouTubeTimestampPreviewDescriptor(hrefRaw)
                if (preview) {
                  return (
                    <YouTubeTimestampPreviewLink key={k} href={hrefRaw} anchor={anchor} preview={preview}>
                      {hrefRaw}
                    </YouTubeTimestampPreviewLink>
                  )
                }
                return (
                  <a
                    key={k}
                    href={hrefRaw}
                    target={anchor.target}
                    rel={anchor.rel}
                    className={anchor.className}
                  >
                    {hrefRaw}
                  </a>
                )
              })
          })}
        </React.Fragment>
      )
    }
    if (tt.type === 'strong') {
      return <strong key={key}>{renderTokens((t as unknown as TokensStrong).tokens, insideLink)}</strong>
    }
    if (tt.type === 'em') {
      return <em key={key}>{renderTokens((t as unknown as TokensEm).tokens, insideLink)}</em>
    }
    if (tt.type === 'del') {
      return <del key={key}>{renderTokens((t as unknown as TokensDel).tokens, insideLink)}</del>
    }
    if (tt.type === 'sub') {
      return <sub key={key}>{renderTokens((t as unknown as TokensSub).tokens, insideLink)}</sub>
    }
    if (tt.type === 'sup') {
      return <sup key={key}>{renderTokens((t as unknown as TokensSup).tokens, insideLink)}</sup>
    }
    if (tt.type === 'mark') {
      return (
        <mark key={key} className={`${UI_THEME_TOKENS.status.warning} px-0.5 rounded-sm`}>
          {renderTokens((t as unknown as TokensMark).tokens, insideLink)}
        </mark>
      )
    }
    if (tt.type === 'footnote_ref') {
      const ref = t as unknown as TokensFootnoteRef
      const footnoteLabel = String(ref.label || ref.id || '').trim() || String(ref.id || '')
      const footnoteTitle = String(ref.caption || '').trim() || `Footnote ${footnoteLabel}`
      return (
        <sup key={key} id={`fnref${ref.id}`} className="scroll-mt-16">
          <a
            href={`#fn${ref.id}`}
            className={`${UI_THEME_TOKENS.icon.active} no-underline font-medium px-0.5`}
            aria-describedby={`fn${ref.id}`}
            aria-label={footnoteTitle}
            title={footnoteTitle}
          >
            {footnoteLabel}
          </a>
        </sup>
      )
    }
    if (tt.type === 'br') return <br key={key} />
    if (tt.type === 'link') {
      const link = t as unknown as TokensLink
      const href = isSafeHref(link.href) ? resolveHref(link.href, activeDocumentPath) : ''
      const anchor = buildAnchorAttrs(href)
      const rawHashHref = (() => {
        if (!href.startsWith('#')) return href
        const raw = href.slice(1)
        const decoded = (() => {
          try {
            return decodeURIComponent(raw)
          } catch {
            return raw
          }
        })()
        return decoded.startsWith('^') ? `#${decoded}` : href
      })()
      const enforceRawHashCaretHref = rawHashHref.startsWith('#^')
      const preview = buildYouTubeTimestampPreviewDescriptor(href)
      if (preview) {
        return (
          <YouTubeTimestampPreviewLink key={key} href={href} anchor={anchor} preview={preview}>
            {renderTokens(link.tokens, true)}
          </YouTubeTimestampPreviewLink>
        )
      }
      return (
        <a
          key={key}
          href={href || undefined}
          target={anchor.target}
          rel={anchor.rel}
          className={anchor.className}
          ref={
            enforceRawHashCaretHref
              ? (el) => {
                  if (!el) return
                  try {
                    el.setAttribute('href', rawHashHref)
                  } catch {
                    void 0
                  }
                }
              : undefined
          }
        >
          {renderTokens(link.tokens, true)}
        </a>
      )
    }
    if (tt.type === 'image') {
      const img = t as unknown as TokensImage
      const resolved = isSafeMediaSrc(img.href) ? resolveHref(img.href, activeDocumentPath) : ''
      const srcRaw = applyMediaProxySrc(resolved)
      const src = normalizeSvgDataUriForImg(srcRaw)
      const alt = String(img.text || '')
      const altNorm = alt.trim().toLowerCase()
      const isVideo = altNorm.startsWith('video') || /\.(mp4|webm|mov|ogg)(\?|#|$)/i.test(src)
      const isAudio = altNorm.startsWith('audio') || /\.(mp3|wav|m4a|aac|flac|ogg)(\?|#|$)/i.test(src)
      const isIframe = altNorm.startsWith('iframe')
      if (isIframe && resolved && isSafeMediaSrc(resolved)) {
        const embed = resolveIframeEmbed({ url: resolved })
        return (
          embed.direct ? (
            <MediaIframe
              key={key}
              src={resolved}
              title={alt || 'Embedded content'}
              presentationMode={opts.markdownPresentationMode}
              cardPreviewMode={cardPreviewMode}
            />
          ) : (
            <MediaWebpageSnapshot
              key={key}
              url={resolved}
              title={alt || 'Embedded content'}
              presentationMode={opts.markdownPresentationMode}
              cardPreviewMode={cardPreviewMode}
            />
          )
        )
      }
      if (isVideo && src && isSafeMediaSrc(src)) {
        const videoNode = (
          <MediaVideo
            src={src}
            controls={!inlineMediaChipMode}
            cardPreviewMode={inlineMediaChipMode}
            className={inlineMediaChipMode ? CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_CLASS_NAME : undefined}
          />
        )
        const fullVideoNode = inlineMediaToggleEnabled ? (
          <MediaVideo
            src={src}
            controls
            cardPreviewMode={false}
          />
        ) : null
        const children = inlineMediaChipMode
          ? (
            <CardPreviewInlineMediaPill
              label={alt}
              fallbackLabel="Video"
              fullMedia={fullVideoNode}
              thumbnailKind="video"
              toggleEnabled={inlineMediaToggleEnabled}
              {...resolveInlineMediaVariablePillProps({ label: alt, fallbackLabel: 'Video', mediaUrl: resolved || src, opts })}
            >
              {videoNode}
            </CardPreviewInlineMediaPill>
          )
          : videoNode
        if (inlineMediaChipMode) return <React.Fragment key={key}>{children}</React.Fragment>
        return renderInlineMediaWithDownload({
          children,
          insideLink,
          kind: 'video',
          nodeKey: key,
          src: resolved || src,
          cardPreviewMode,
        })
      }
      if (isAudio && src && isSafeMediaSrc(src)) {
        const audioClassName = cardPreviewMode
          ? `${CARD_MARKDOWN_PREVIEW_MEDIA_AUDIO_CLASS_NAME} ${CARD_MARKDOWN_PREVIEW_MEDIA_CHROME_CLASS_NAME}`
          : `${CARD_MARKDOWN_PREVIEW_MEDIA_AUDIO_CLASS_NAME} rounded border ${UI_THEME_TOKENS.panel.border}`
        if (inlineMediaChipMode) {
          const fullAudioNode = inlineMediaToggleEnabled ? (
            <audio
              controls
              src={src || undefined}
              className={audioClassName}
            />
          ) : null
          return (
            <CardPreviewInlineMediaPill
              key={key}
              label={alt}
              fallbackLabel="Audio"
              fullMedia={fullAudioNode}
              thumbnailKind="audio"
              toggleEnabled={inlineMediaToggleEnabled}
              {...resolveInlineMediaVariablePillProps({ label: alt, fallbackLabel: 'Audio', mediaUrl: resolved || src, opts })}
            >
              <span className={[CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_CLASS_NAME, 'inline-flex items-center justify-center bg-black/5 text-[color:var(--kg-text-secondary)]'].join(' ')}>
                <Volume2 className="h-2.5 w-2.5" aria-hidden="true" />
              </span>
            </CardPreviewInlineMediaPill>
          )
        }
        return (
          <audio
            key={key}
            controls
            src={src || undefined}
            className={audioClassName}
          />
        )
      }
      const isViewportBoundedImage = src.startsWith('/__pdf_assets/') || /^data:image\//i.test(src)
      const isSvgImage = /^data:image\/svg\+xml;base64,/i.test(src) || /\.svg(\?|#|$)/i.test(src)
      const imageNode = (
        <CardMediaPreview
          key={`${key}-image`}
          kind={isSvgImage ? 'svg' : 'image'}
          url={src}
          title={alt}
          interactive={false}
          fit={inlineMediaChipMode ? 'cover' : 'contain'}
          mediaThumbnailDataAttr
          mediaClassName={[
            inlineMediaChipMode ? CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_CLASS_NAME : 'max-w-full h-auto rounded border object-contain',
            isViewportBoundedImage ? UI_RESPONSIVE_MARKDOWN_BOUNDED_IMAGE_CLASSNAME : '',
            isSvgImage && !inlineMediaChipMode ? 'bg-black/5 dark:bg-white/5' : '',
            inlineMediaChipMode ? '' : UI_THEME_TOKENS.panel.border,
          ]
            .filter(Boolean)
            .join(' ')}
        />
      )
      const fullImageNode = inlineMediaToggleEnabled ? (
        <CardMediaPreview
          key={`${key}-image-full`}
          kind={isSvgImage ? 'svg' : 'image'}
          url={src}
          title={alt}
          interactive={false}
          fit="contain"
          mediaThumbnailDataAttr
          mediaClassName={[
            'max-w-full h-auto rounded border object-contain',
            isViewportBoundedImage ? UI_RESPONSIVE_MARKDOWN_BOUNDED_IMAGE_CLASSNAME : '',
            isSvgImage ? 'bg-black/5 dark:bg-white/5' : '',
            UI_THEME_TOKENS.panel.border,
          ]
            .filter(Boolean)
            .join(' ')}
        />
      ) : null
      const children = inlineMediaChipMode
        ? (
          <CardPreviewInlineMediaPill
            label={alt}
            fallbackLabel="Image"
            fullMedia={fullImageNode}
            thumbnailKind="image"
            thumbnailUrl={src}
            toggleEnabled={inlineMediaToggleEnabled}
            {...resolveInlineMediaVariablePillProps({ label: alt, fallbackLabel: 'Image', mediaUrl: resolved || src, opts })}
          >
            {imageNode}
          </CardPreviewInlineMediaPill>
        )
        : imageNode
      if (inlineMediaChipMode) return <React.Fragment key={key}>{children}</React.Fragment>
      return renderInlineMediaWithDownload({
        children,
        insideLink,
        kind: 'image',
        nodeKey: key,
        src: resolved || src,
        cardPreviewMode,
      })
    }
    if (tt.type === 'code') {
      const codeText = (t as unknown as TokensCode).text
      const semanticToken = renderInlineCodeSemanticToken(codeText, key, activeDocumentPath)
      if (semanticToken) return semanticToken
      const inlineCodeInvocationLinks = renderAgenticOsInlineCodeInvocationLinks({
        text: codeText,
        keyValue: key,
      })
      if (inlineCodeInvocationLinks) return inlineCodeInvocationLinks
      const sigil = parseMarkdownSigil(codeText)
      if (sigil) {
        return (
          <span
            key={key}
            data-kg-sigil="1"
            style={readMarkdownSigilInlineStyle(sigil)}
          >
            {sigil.text}
          </span>
        )
      }
      return (
        <code key={key} className={inlineCodeClassName}>
          {codeText}
        </code>
      )
    }
    if (tt.type === 'math') {
      const m = t as unknown as TokensMath
      return <InlineMathRenderer key={key} tex={m.tex} display={!!m.display} />
    }
    if (tt.type === 'html') {
      return renderInlineHtmlToken({
        token: t as TokensHTML,
        key,
        opts,
        uiPanelTextFontClass,
        uiPanelMonospaceTextClass,
        inlineCodeClassName,
        fragmentIndexRef,
      })
    }
    if ((t as unknown as { tokens?: unknown }).tokens) {
      return (
        <React.Fragment key={key}>
          {renderTokens((t as unknown as { tokens?: Token[] }).tokens, insideLink)}
        </React.Fragment>
      )
    }
    return <React.Fragment key={key}>{(t as unknown as { raw?: string }).raw || ''}</React.Fragment>
  }
  return <>{renderTokens(tokens, false)}</>
}
