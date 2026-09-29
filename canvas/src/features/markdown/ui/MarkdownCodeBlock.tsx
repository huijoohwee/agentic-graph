import { PanelSelect } from '@/lib/ui/panelFormControls'
import React from 'react'
import { WrapText } from 'lucide-react'
import type { TokensCode } from './MarkdownTokens'
import type { TokenWithLines } from '@/features/markdown/ui/markdownPreviewLex'
import type { RenderOpts } from './MarkdownRendererTypes'
import { parseCodeInfoMeta } from './markdownCodeInfo'
import { MarkdownBlockContainer } from './MarkdownBlockContainer'
import { parseAnnotatedCode, type AnnotatedCodeRow } from './markdownAnnotatedCode'
import { mergeMermaidInitConfig, splitMermaidBlockFrontmatter } from './mermaidBlockFrontmatter'
import { splitMermaidIntoDiagrams } from 'grph-shared/markdown/mermaidBlocks'
import { isMermaidCodeFenceLang } from 'grph-shared/markdown/mermaidInput'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
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
import { ensureHljsThemeStyle } from './codeblock/hljsTheme'
import { ClipboardCopyButton } from './codeblock/ClipboardCopyButton'
import { AnnotateDisplayModeToggle, AnnotatedRow, type AnnotateDisplayMode } from './codeblock/CodeAnnotationRows'
import { GeoJsonGeoPanelRenderer } from './codeblock/GeoJsonGeoPanelRenderer'
import { HighlightedCode } from './codeblock/HighlightedCode'
import { HtmlCodeBlockRenderer } from './codeblock/HtmlCodeBlockRenderer'
import { encodeUtf8ToBase64 } from '@/features/markdown/markdownRoundTrip'
import { useForbidBrowserZoomWheel } from '@/lib/ui/forbidBrowserZoom'
import { MermaidVisibilityGate } from './MermaidVisibilityGate'
import { buildMarkdownGeoDatasetRegistrationRequest } from '@/features/geospatial/markdownGeoDatasetRequest'
import {
  MARKDOWN_CODE_FENCE_ASCII_TEXT_COMPACT_CLASS,
  MARKDOWN_CODE_BLOCK_READ_SPACING_CLASS,
  MARKDOWN_CODE_FENCE_CONTENT_SURFACE_BASE_CLASS,
  MARKDOWN_CODE_FENCE_EDITOR_LAYOUT_CLASS,
  MARKDOWN_CODE_FENCE_LINE_SPACING_CLASS,
  MARKDOWN_CODE_FENCE_PRE_SURFACE_BASE_CLASS,
  MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_BASE_CLASS,
} from './markdownEditSurfaceLayout'
import {
  CARD_MARKDOWN_PREVIEW_BLOCK_SPACING_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_CODE_SURFACE_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_FRAME_CLASS_NAME,
} from '@/lib/cards/cardMarkdownPreviewUtils'

const MermaidDiagramLazy = React.lazy(() =>
  import('@/lib/panels/views/preview-panel/ui/MermaidDiagram.impl').then(mod => ({ default: mod.MermaidDiagram })),
)
const PlainMermaidDiagramLazy = React.lazy(() =>
  import('@/features/markdown/ui/PlainMermaidDiagram').then(mod => ({ default: mod.PlainMermaidDiagram })),
)

type MarkdownCodeBlockProps = {
  token: TokenWithLines
  highlightClass: string
  opts: RenderOpts
  wrapClass: string
  highlightStyle?: React.CSSProperties
  fragmentStep?: number
  fragmentsEnabled?: boolean
  fragmentClassNames?: string[]
  fragmentTags?: string[]
  annotateDisplayMode?: AnnotateDisplayMode
}

const CODE_FENCE_LANGUAGE_AUTO_VALUE = '__auto__'
const CODE_FENCE_LANGUAGE_OPTIONS = [
  { value: CODE_FENCE_LANGUAGE_AUTO_VALUE, label: 'auto' },
  { value: 'plaintext', label: 'plaintext' },
  { value: 'javascript', label: 'javascript' },
  { value: 'typescript', label: 'typescript' },
  { value: 'json', label: 'json' },
  { value: 'yaml', label: 'yaml' },
  { value: 'markdown', label: 'markdown' },
  { value: 'bash', label: 'bash' },
  { value: 'python', label: 'python' },
  { value: 'sql', label: 'sql' },
  { value: 'html', label: 'html' },
  { value: 'css', label: 'css' },
  { value: 'xml', label: 'xml' },
]

export const MarkdownCodeBlock = React.memo(function MarkdownCodeBlock({
  token: t,
  highlightClass,
  opts,
  wrapClass,
  highlightStyle,
  fragmentStep: _fragmentStep,
  fragmentsEnabled,
  fragmentClassNames,
  fragmentTags,
  annotateDisplayMode,
}: MarkdownCodeBlockProps) {
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const containerRef = React.useRef<HTMLElement>(null)
  useForbidBrowserZoomWheel(containerRef, true)

  React.useEffect(() => {
    ensureHljsThemeStyle()
  }, [])

  const c = t as unknown as TokensCode & { info?: string }
  const codeText = String((c as { text?: unknown }).text ?? '')
  const meta = parseCodeInfoMeta(c)
  const lang = String(meta.lang || '').trim().toLowerCase()
  const isMermaidLang = isMermaidCodeFenceLang(lang)
  const isSvgOnlyFence =
    !lang && /<\s*svg\b/i.test(codeText) && /<\/\s*svg\s*>/i.test(codeText)
  const isHtmlLang = lang === 'html' || lang === 'htm' || lang === 'svg' || isSvgOnlyFence
  const isSvgFence = lang === 'svg' || isSvgOnlyFence
  const isAsciiDiagram =
    lang === 'ascii' ||
    lang === 'grid' ||
    lang === 'diagram' ||
    /[┌┐└┘┬┴┼│─╔╗╚╝╦╩╬║═]/.test(codeText) ||
    (/(^|\n)\s*\+[-+]{3,}\+\s*(\n|$)/.test(codeText) && /\|/.test(codeText))

  const highlightLines = React.useMemo(() => {
    const info = c.info || ''
    const match = info.match(/\{([\d,-]+)\}/)
    if (!match) return null
    const rangeStr = match[1]
    const lines = new Set<number>()
    rangeStr.split(',').forEach(part => {
      const [start, end] = part.split('-').map(n => parseInt(n, 10))
      if (!Number.isFinite(start)) return
      if (Number.isFinite(end)) {
        for (let i = start; i <= end; i += 1) lines.add(i)
      } else {
        lines.add(start)
      }
    })
    return lines
  }, [c.info])

  const markdownGeoReq = React.useMemo(() => {
    const normalizedLang: 'geojson' | 'json' = lang === 'geojson' ? 'geojson' : 'json'
    return buildMarkdownGeoDatasetRegistrationRequest({
      activeDocumentPath: opts.activeDocumentPath,
      lang: normalizedLang,
      text: codeText,
      startLine: t.startLine,
      endLine: t.endLine || t.startLine,
    })
  }, [codeText, lang, opts.activeDocumentPath, t.endLine, t.startLine])
  const isGeoJsonRenderable = React.useMemo(() => {
    const integration = opts.geoDatasetIntegration
    const normalizedLang: 'geojson' | 'json' | null =
      lang === 'geojson' ? 'geojson' : lang === 'json' ? 'json' : null

    const req = markdownGeoReq

    if (normalizedLang) {
      if (normalizedLang === 'geojson') return true
      if (normalizedLang === 'json' && typeof integration?.isGeoJsonCodeBlock === 'function') {
        try {
          return !!integration.isGeoJsonCodeBlock(req)
        } catch {
          return false
        }
      }
      return false
    }

    if (typeof integration?.isGeoJsonCodeBlock === 'function') {
      try {
        return !!integration.isGeoJsonCodeBlock(req)
      } catch {
        return false
      }
    }
    return false
  }, [lang, markdownGeoReq, opts.geoDatasetIntegration])

  const mermaidBlock = React.useMemo(() => {
    if (!isMermaidLang) return null
    return splitMermaidBlockFrontmatter(codeText)
  }, [codeText, isMermaidLang])

  const cardPreviewMode = opts.markdownCardPreviewMode === true
  const defaultMode: AnnotateDisplayMode = annotateDisplayMode ?? 'inline'
  const baseMode: AnnotateDisplayMode = cardPreviewMode
    ? (isMermaidLang ? 'render' : defaultMode)
    : isGeoJsonRenderable || isMermaidLang ? 'render' : defaultMode
  const [localMode, setLocalMode] = React.useState<AnnotateDisplayMode>(() => baseMode)
  const [localOverride, setLocalOverride] = React.useState(false)
  const baseWordWrapEnabled = /\bwhitespace-pre-wrap\b/.test(String(wrapClass || ''))
  const [localWordWrapEnabled, setLocalWordWrapEnabled] = React.useState<boolean>(() => baseWordWrapEnabled)
  const [wordWrapOverride, setWordWrapOverride] = React.useState(false)
  const pointerWrapTogglePendingRef = React.useRef(false)

  React.useEffect(() => {
    if (!localOverride) return
    if (localMode !== baseMode) return
    setLocalOverride(false)
  }, [baseMode, localMode, localOverride])

  React.useEffect(() => {
    if (localOverride) return
    setLocalMode(baseMode)
  }, [baseMode, localOverride])
  React.useEffect(() => {
    if (wordWrapOverride) return
    setLocalWordWrapEnabled(baseWordWrapEnabled)
  }, [baseWordWrapEnabled, wordWrapOverride])

  const clearOverride = React.useCallback(() => {
    setLocalOverride(false)
    setLocalMode(baseMode)
  }, [baseMode])
  const effectiveWordWrap = wordWrapOverride ? localWordWrapEnabled : baseWordWrapEnabled
  React.useEffect(() => {
    if (!wordWrapOverride) return
    if (localWordWrapEnabled !== baseWordWrapEnabled) return
    setWordWrapOverride(false)
  }, [baseWordWrapEnabled, localWordWrapEnabled, wordWrapOverride])

  const effectiveViewMode = localMode
  const isRender = effectiveViewMode === 'render' && !(isMermaidLang && opts.deferMermaidRender)
  const isBeside = effectiveViewMode === 'beside'
  const canToggleWordWrap = !isAsciiDiagram && !isRender
  const effectiveWrapClass = canToggleWordWrap && effectiveWordWrap ? 'whitespace-pre-wrap break-words' : ''
  const toggleWordWrap = React.useCallback(() => {
    if (!canToggleWordWrap) return
    const next = !effectiveWordWrap
    setWordWrapOverride(next !== baseWordWrapEnabled)
    setLocalWordWrapEnabled(next)
  }, [baseWordWrapEnabled, canToggleWordWrap, effectiveWordWrap])
  const monospaceCodeClass = React.useMemo(() => {
    const base = String(opts.uiPanelMonospaceTextClass || '').trim() || 'font-mono text-xs'
    return opts.markdownPresentationMode ? `${base} text-xl` : base
  }, [opts.markdownPresentationMode, opts.uiPanelMonospaceTextClass])

  const annotatedRows: AnnotatedCodeRow[] | null = React.useMemo(() => {
    if (isMermaidLang || isAsciiDiagram) return null
    const rows = parseAnnotatedCode(codeText, lang, t.startLine)
    if (rows.length === 1 && !rows[0].annotation) return null
    return rows
  }, [codeText, isAsciiDiagram, isMermaidLang, lang, t.startLine])

  const endLine = t.endLine || t.startLine
  const blockControlsAllowed =
    !opts.markdownPresentationMode &&
    !!opts.viewerBlockEditingEnabled &&
    opts.markdownBlockControlsEnabled !== false
  const canInsertLine = blockControlsAllowed && !!opts.onInsertLineAfter && Number.isFinite(endLine)
  const canReorder = blockControlsAllowed && !!opts.onReorderLineBlock && Number.isFinite(t.startLine)
  const gutterEnabled = (canInsertLine || canReorder) && opts.markdownBlockGutterEnabled !== false
  const gutterLayoutEnabled = opts.markdownBlockGutterEnabled !== false

  const dnd = useMarkdownLineBlockDnD({
    enabled: canReorder,
    targetStartLine: t.startLine,
    targetEndLine: endLine,
    onReorder: (source, target, position) => opts.onReorderLineBlock?.(source, target, position),
  })

  const documentCodeFrameClassName = `rounded-lg border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} overflow-hidden shadow-sm`
  const figureFrameClassName = cardPreviewMode ? CARD_MARKDOWN_PREVIEW_FRAME_CLASS_NAME : documentCodeFrameClassName
  const figureClassName = `${figureFrameClassName} highlight highlight-source-${lang} transition-shadow duration-200`
  const codeBlockSpacingClassName = cardPreviewMode
    ? CARD_MARKDOWN_PREVIEW_BLOCK_SPACING_CLASS_NAME
    : MARKDOWN_CODE_BLOCK_READ_SPACING_CLASS
  const editorCodeClassName = [
    MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_BASE_CLASS,
    MARKDOWN_CODE_FENCE_EDITOR_LAYOUT_CLASS,
    monospaceCodeClass,
    MARKDOWN_CODE_FENCE_LINE_SPACING_CLASS,
    isAsciiDiagram ? MARKDOWN_CODE_FENCE_ASCII_TEXT_COMPACT_CLASS : '',
    effectiveWrapClass,
    UI_THEME_TOKENS.code.bg,
    UI_THEME_TOKENS.code.text,
  ]
    .filter(Boolean)
    .join(' ')

  const editLineRange = React.useMemo(() => {
    const src = opts.markdownSourceLines
    if (!Array.isArray(src) || src.length === 0) return null
    const start = Math.max(1, Math.floor(t.startLine || 1))
    const end = Math.max(start, Math.floor(t.endLine || start))
    const openLine = src[start - 1] || ''
    const mOpen = openLine.match(/^(\s*)(```+|~~~+)(.*)$/)
    if (!mOpen) return null
    const fence = mOpen[2] || '```'
    let closeIdx = -1
    for (let i = Math.min(src.length - 1, end - 1); i > start - 1; i -= 1) {
      const line = src[i] || ''
      if (String(line || '').trimStart().startsWith(fence)) {
        closeIdx = i
        break
      }
    }
    if (closeIdx < 0) return null
    const innerStart = start + 1
    const innerEnd = closeIdx
    if (innerStart > innerEnd) return null
    return { startLine: innerStart, endLine: innerEnd }
  }, [opts.markdownSourceLines, t.endLine, t.startLine])
  const normalizedLang = String(lang || '').trim().toLowerCase()
  const languageSelectOptions = React.useMemo(() => {
    if (!normalizedLang || normalizedLang === CODE_FENCE_LANGUAGE_AUTO_VALUE) return CODE_FENCE_LANGUAGE_OPTIONS
    if (CODE_FENCE_LANGUAGE_OPTIONS.some(option => option.value === normalizedLang)) return CODE_FENCE_LANGUAGE_OPTIONS
    return [{ value: normalizedLang, label: normalizedLang }, ...CODE_FENCE_LANGUAGE_OPTIONS]
  }, [normalizedLang])
  const languageSelectValue = normalizedLang || CODE_FENCE_LANGUAGE_AUTO_VALUE
  const canChangeFenceLanguage =
    blockControlsAllowed &&
    !!opts.onReplaceLineRange &&
    Array.isArray(opts.markdownSourceLines) &&
    Number.isFinite(t.startLine)
  const handleLanguageSelectChange = React.useCallback((nextValue: string) => {
    if (!opts.onReplaceLineRange) return
    const sourceLines = opts.markdownSourceLines
    if (!Array.isArray(sourceLines) || sourceLines.length === 0) return
    const openLineIndex = Math.max(0, Math.floor(t.startLine) - 1)
    const openLine = String(sourceLines[openLineIndex] || '')
    const fenceMatch = openLine.match(/^(\s*)(`{3,}|~{3,})([\s\S]*)$/)
    if (!fenceMatch) return
    const indent = String(fenceMatch[1] || '')
    const fence = String(fenceMatch[2] || '```')
    const originalInfoChunk = String(fenceMatch[3] || '')
    const prefersInfoSeparator = /^\s+/.test(originalInfoChunk)
    const infoRaw = String(c.info || '').trim()
    const existingLangToken = String(meta.lang || '').trim()
    const trailingInfo = (() => {
      if (!infoRaw) return ''
      if (!existingLangToken) return infoRaw
      if (infoRaw.toLowerCase().startsWith(existingLangToken.toLowerCase())) {
        return infoRaw.slice(existingLangToken.length).trimStart()
      }
      return infoRaw
    })()
    const nextLanguageToken =
      nextValue && nextValue !== CODE_FENCE_LANGUAGE_AUTO_VALUE ? String(nextValue).trim().toLowerCase() : ''
    const nextInfo = [nextLanguageToken, trailingInfo].filter(Boolean).join(' ').trim()
    const replacementOpenLine = `${indent}${fence}${nextInfo ? `${prefersInfoSeparator ? ' ' : ''}${nextInfo}` : ''}`
    opts.onReplaceLineRange({
      startLine: t.startLine,
      endLine: t.startLine,
      replacementLines: [replacementOpenLine],
    })
  }, [c.info, meta.lang, opts, t.startLine])
  const codeFenceContentSurfaceClassName = cardPreviewMode
    ? CARD_MARKDOWN_PREVIEW_CODE_SURFACE_CLASS_NAME
    : MARKDOWN_CODE_FENCE_CONTENT_SURFACE_BASE_CLASS
  const codeFenceContentClassName = `${codeFenceContentSurfaceClassName} ${UI_THEME_TOKENS.code.bg} ${UI_THEME_TOKENS.code.text}`
  const codeFencePreClassName = `${MARKDOWN_CODE_FENCE_PRE_SURFACE_BASE_CLASS} ${MARKDOWN_CODE_FENCE_LINE_SPACING_CLASS} ${effectiveWrapClass} ${monospaceCodeClass}`

  const asciiNode = (
    <section className={codeFenceContentClassName}>
      <pre className={`${codeFencePreClassName} ${MARKDOWN_CODE_FENCE_ASCII_TEXT_COMPACT_CLASS}`}>
        {codeText}
      </pre>
    </section>
  )

  const headerNode = cardPreviewMode ? null : (
    <header
      className={`flex items-center justify-between px-3 py-1.5 border-b ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.headerBg}`}
    >
      {canChangeFenceLanguage ? (
        <PanelSelect
          value={languageSelectValue}
          aria-label="Code fence language"
          className={`flex-1 min-w-0 h-6 px-1 rounded border-0 outline-none font-mono text-xs font-semibold ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.input.text}`}
          onMouseDown={event => event.stopPropagation()}
          onClick={event => event.stopPropagation()}
          onDoubleClick={event => event.stopPropagation()}
          onValueChange={selectedValueInput => {
            handleLanguageSelectChange(selectedValueInput)
          }}
        >
          {languageSelectOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </PanelSelect>
      ) : (
        <span className={`flex-1 font-mono text-xs ${UI_THEME_TOKENS.text.secondary} font-semibold uppercase`}>
          {lang || 'text'}
        </span>
      )}

      <menu className="flex items-center gap-2" aria-label={UI_COPY.markdownCodeBlockActionsLabel}>
        <button
          type="button"
          aria-label={UI_COPY.markdownWorkspaceWordWrapToggleTitle}
          title={effectiveWordWrap ? UI_COPY.markdownWorkspaceWordWrapOnTooltip : UI_COPY.markdownWorkspaceWordWrapOffTooltip}
          className={`p-1.5 rounded-md transition-colors ${canToggleWordWrap
            ? `${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`
            : `opacity-50 cursor-not-allowed ${UI_THEME_TOKENS.text.secondary}`}`}
          disabled={!canToggleWordWrap}
          onMouseDown={event => {
            event.stopPropagation()
            event.preventDefault()
            pointerWrapTogglePendingRef.current = true
            toggleWordWrap()
          }}
          onDoubleClick={event => event.stopPropagation()}
          onClick={event => {
            event.stopPropagation()
            event.preventDefault()
            if (event.detail !== 0) {
              pointerWrapTogglePendingRef.current = false
              return
            }
            if (pointerWrapTogglePendingRef.current) {
              pointerWrapTogglePendingRef.current = false
              return
            }
            toggleWordWrap()
          }}
          onKeyDown={event => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.stopPropagation()
            event.preventDefault()
            toggleWordWrap()
          }}
        >
          <WrapText className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
        <AnnotateDisplayModeToggle
          baseMode={baseMode}
          mode={localMode}
          setMode={next => {
            setLocalOverride(true)
            setLocalMode(next)
          }}
          clearOverride={clearOverride}
        />
        <ClipboardCopyButton text={codeText} disabled={!!opts.forbidCopy} />
      </menu>
    </header>
  )

  const contentNode = (
    <>
      {headerNode}

      {isAsciiDiagram ? (
        asciiNode
      ) : isRender ? (
        <section className={`relative ${cardPreviewMode ? 'overflow-y-auto overflow-x-hidden' : (isMermaidLang ? 'overflow-hidden' : 'overflow-auto')} ${UI_THEME_TOKENS.code.bg} ${UI_THEME_TOKENS.code.text}`}>
          {isMermaidLang ? (
            <section className="flex flex-col gap-3 p-3">
              {(() => {
                const base = mermaidBlock?.diagramCode ?? codeText
                const diagrams = splitMermaidIntoDiagrams(base)
                const fm = mergeMermaidInitConfig(opts.mermaidFrontmatterConfig, mermaidBlock?.mergedInitConfig ?? null)
                const useEnhancedMermaid = !!(fm && Object.keys(fm).length)
                return diagrams.map((diagramCode, index) => (
                  <React.Suspense key={index} fallback={null}>
                    <MermaidVisibilityGate>
                      {useEnhancedMermaid ? (
                        <MermaidDiagramLazy
                          code={diagramCode}
                          highlightClass={highlightClass}
                          frontmatterConfig={fm}
                          rootThemeMode={opts.rootThemeMode}
                          overlayScope={opts.previewOverlayScope}
                          overlayPortalTarget={opts.previewOverlayPortalTarget}
                          variant="codeblock"
                          enablePanZoom={!cardPreviewMode}
                          wheelZoomRequiresModifier={cardPreviewMode ? true : false}
                          wheelZoomBehavior={cardPreviewMode ? 'modifier' : 'active'}
                        />
                      ) : (
                        <PlainMermaidDiagramLazy
                          code={diagramCode}
                          rootThemeMode={opts.rootThemeMode}
                          cardPreviewMode={cardPreviewMode}
                        />
                      )}
                    </MermaidVisibilityGate>
                  </React.Suspense>
                ))
              })()}
            </section>
          ) : isGeoJsonRenderable ? (
            <GeoJsonGeoPanelRenderer
              lang={lang === 'geojson' ? 'geojson' : 'json'}
              text={codeText}
              req={markdownGeoReq}
              opts={opts}
              monospaceCodeClass={monospaceCodeClass}
            />
          ) : isHtmlLang ? (
            (() => {
              if (!isSvgFence) {
                return (
                  <HtmlCodeBlockRenderer
                    html={codeText}
                    opts={opts}
                    fragmentsEnabled={fragmentsEnabled}
                    fragmentStep={_fragmentStep}
                    fragmentClassNames={fragmentClassNames}
                    fragmentTags={fragmentTags}
                  />
                )
              }
              const svgMatch = codeText.match(/<\s*svg\b[\s\S]*<\/\s*svg\s*>/i)
              const svgRaw = String(svgMatch?.[0] || '').trim()
              if (!svgRaw) {
                return (
                  <HtmlCodeBlockRenderer
                    html={codeText}
                    opts={opts}
                    fragmentsEnabled={fragmentsEnabled}
                    fragmentStep={_fragmentStep}
                    fragmentClassNames={fragmentClassNames}
                    fragmentTags={fragmentTags}
                  />
                )
              }
              if (/<\s*use\b/i.test(svgRaw) && /(xlink:href|href)\s*=\s*["']\s*#/.test(svgRaw)) {
                const idMatch = svgRaw.match(
                  /<(?:\s*use\b)[^>]*\s(?:xlink:href|href)\s*=\s*["']\s*#([^"'\s>]+)\s*["'][^>]*>/i,
                )
                const id = String(idMatch?.[1] || '').trim()
                const hasSymbol = id
                  ? new RegExp(
                      `<\\s*symbol\\b[^>]*\\bid\\s*=\\s*["']\\s*${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*["']`,
                      'i',
                    ).test(svgRaw)
                  : false
                if (!hasSymbol) {
                  return (
                    <HtmlCodeBlockRenderer
                      html={codeText}
                      opts={opts}
                      fragmentsEnabled={fragmentsEnabled}
                      fragmentStep={_fragmentStep}
                      fragmentClassNames={fragmentClassNames}
                      fragmentTags={fragmentTags}
                    />
                  )
                }
              }

              const sanitizeSvg = (raw: string): string => {
                try {
                  const win = (globalThis as unknown as { window?: Window }).window
                  const DomParserCtor = (globalThis as unknown as { DOMParser?: typeof DOMParser }).DOMParser
                  if (!win || !DomParserCtor) return raw
                  const parser = new DomParserCtor()
                  const doc = parser.parseFromString(raw, 'image/svg+xml')
                  const root = doc.documentElement
                  const nodes = root ? root.querySelectorAll('*') : []
                  for (const node of Array.from(nodes)) {
                    const tag = node.tagName.toLowerCase()
                    if (tag === 'script') {
                      node.remove()
                      continue
                    }
                    for (const name of node.getAttributeNames()) {
                      const lower = name.toLowerCase()
                      if (lower.startsWith('on')) node.removeAttribute(name)
                      if (lower === 'href' || lower === 'xlink:href') {
                        const v = String(node.getAttribute(name) || '')
                        if (v && !v.startsWith('#')) node.removeAttribute(name)
                      }
                    }
                  }
                  const out = new XMLSerializer().serializeToString(root)
                  return out || raw
                } catch {
                  return raw
                }
              }

              const sanitizedSvg = sanitizeSvg(svgRaw)
              const src = `data:image/svg+xml;base64,${encodeUtf8ToBase64(sanitizedSvg)}`
              const alt = (() => {
                const m =
                  sanitizedSvg.match(/\baria-label\s*=\s*["']([^"']+)["']/i) ||
                  sanitizedSvg.match(/\bdata-icon\s*=\s*["']([^"']+)["']/i)
                return String(m?.[1] || '').trim()
              })()
              return (
                <section className={codeFenceContentClassName}>
                  <img
                    src={src}
                  alt={alt}
                    className={cardPreviewMode
                      ? 'inline-block max-w-full h-auto'
                      : `inline-block max-w-full h-auto rounded border ${UI_THEME_TOKENS.code.border}`}
                  />
                </section>
              )
            })()
          ) : (
            <section className={codeFenceContentClassName}>
              <pre className={codeFencePreClassName}>
                <HighlightedCode code={codeText} lang={lang} highlightLines={highlightLines} />
              </pre>
            </section>
          )}
        </section>
      ) : annotatedRows ? (
        <section className={`flex flex-col ${UI_THEME_TOKENS.code.bg} ${UI_THEME_TOKENS.code.text}`}>
          {annotatedRows.map(row => (
            <AnnotatedRow
              key={row.id}
              row={row}
              lang={lang}
              wrapClass={effectiveWrapClass}
              isBeside={isBeside}
              textSizeClass={monospaceCodeClass}
            />
          ))}
        </section>
      ) : (
        <section className={codeFenceContentClassName}>
          <pre className={codeFencePreClassName}>
            <HighlightedCode code={codeText} lang={lang} highlightLines={highlightLines} />
          </pre>
        </section>
      )}
    </>
  )

  const editStaticHeaderNode = headerNode

  const codeOuterClassName = [codeBlockSpacingClassName, figureClassName].filter(Boolean).join(' ')
  const codeGutterWrapperClassName = [
    codeBlockSpacingClassName,
    'relative group',
    MARKDOWN_BLOCK_GUTTER_PADDING_LEFT_CLASS,
    MARKDOWN_BLOCK_GUTTER_PADDING_RIGHT_CLASS,
    dnd.isDragging ? 'opacity-60' : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (!gutterLayoutEnabled) {
    return (
      <MarkdownBlockContainer
        as="figure"
        ref={containerRef}
        className={codeOuterClassName}
        highlightClass={highlightClass}
        highlightStyle={highlightStyle}
        startLine={t.startLine}
        endLine={t.endLine}
        editLineRange={editLineRange || undefined}
        inlineEditable={blockControlsAllowed && !!opts.onReplaceLineRange}
        sourceLines={opts.markdownSourceLines}
        onReplaceLineRange={opts.onReplaceLineRange}
        onInlineEditStateChange={opts.onInlineEditStateChange}
        onInlineDraftTextChange={opts.onInlineDraftTextChange}
        forbidCopy={!!opts.forbidCopy}
        editDisableRichUi
        editTypographyMode="none"
        editPreserveWhitespace
        editPreserveBlockHeight={false}
        editStaticChildren={editStaticHeaderNode}
        editorClassName={editorCodeClassName}
      >
        {contentNode}
      </MarkdownBlockContainer>
    )
  }

  return (
    <section
      className={codeGutterWrapperClassName}
      onDragOver={gutterEnabled ? dnd.handleDragOver : undefined}
      onDragLeave={gutterEnabled ? dnd.handleDragLeave : undefined}
      onDrop={gutterEnabled ? dnd.handleDrop : undefined}
    >
      {gutterEnabled ? (
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
      ) : null}
      <MarkdownBlockContainer
        as="figure"
        ref={containerRef}
        className={figureClassName}
        highlightClass={highlightClass}
        highlightStyle={highlightStyle}
        startLine={t.startLine}
        endLine={t.endLine}
        editLineRange={editLineRange || undefined}
        inlineEditable={blockControlsAllowed && !!opts.onReplaceLineRange}
        sourceLines={opts.markdownSourceLines}
        onReplaceLineRange={opts.onReplaceLineRange}
        onInlineEditStateChange={opts.onInlineEditStateChange}
        onInlineDraftTextChange={opts.onInlineDraftTextChange}
        forbidCopy={!!opts.forbidCopy}
        editDisableRichUi
        editTypographyMode="none"
        editPreserveWhitespace
        editPreserveBlockHeight={false}
        editStaticChildren={editStaticHeaderNode}
        editorClassName={editorCodeClassName}
      >
        {contentNode}
      </MarkdownBlockContainer>
    </section>
  )
})
