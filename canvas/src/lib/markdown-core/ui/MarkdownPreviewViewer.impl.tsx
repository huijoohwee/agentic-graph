import React from 'react'
import MarkdownTokenRenderer from '@/features/markdown/ui/MarkdownTokenRenderer'
import type { HighlightedLineRange, MarkdownGeoDatasetIntegration, MarkdownViewerMediaMode, RenderOpts } from '@/features/markdown/ui/MarkdownRendererTypes'
import type { TokenWithLines } from '@/features/markdown/ui/markdownPreviewLex'
import { MarkdownPanelLayout } from '@/features/markdown/ui/MarkdownPanelLayout'
import {
  computeStickyHeadingScrollPaddingTopPx,
  filterVisibleMarkdownTokensByCollapsedHeadings,
  getDefaultStickyHeadingTopPx,
  getMarkdownViewerWidthWrapperClassName,
} from '@/features/markdown/ui/markdownSectionUtils'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_COPY } from '@/lib/config'
import {
  normalizeLooseKey,
  parseMarkdownWikiHref,
} from 'grph-shared/markdown/wikiLinks'
import type { MarkdownSourceFilesPanelIntegration } from '@/features/markdown/ui/markdownSourceFilesPanelTypes'
import { useMarkdownExplorerControls } from '@/features/markdown/ui/useMarkdownExplorerControls'
import { encodeUtf8ToBase64 } from '@/features/markdown/markdownRoundTrip'
import {
  readBrowserLocationHash,
  subscribeHashChange,
  writeBrowserLocationHash,
} from '@/lib/browser/hashChangeEvents'
import {
  buildMarkdownVariableSsotAnchorId,
  collectMarkdownVariableSsotEntries,
} from '@/features/markdown/ui/markdownVariableReferences'
import { resetGlobalUserSelectLock } from '@/lib/canvas/interaction-user-select'
import { useMarkdownTocTreeState } from '@/features/markdown/ui/useMarkdownTocTreeState'
import {
  buildMarkdownFrontmatterPreviewRenderOpts,
} from '@/features/markdown/ui/markdownFrontmatterPreview'
import { MarkdownFrontmatterPreviewBlocks } from '@/features/markdown/ui/MarkdownFrontmatterPreviewBlocks'
import {
  deriveMarkdownPreviewDocumentMode,
  getMarkdownPreviewScrollStyle,
} from './markdownPreviewViewerMode'
import { useTextSelectionMatchHighlights } from '@/lib/ui/textSelectionMatchHighlights'
import { buildMarkdownVariablePreviewByKey } from './markdownInlineVariableMediaPreview'
import {
  buildSemanticTextHighlightOverlayStyle,
  getSemanticHighlightSurfaceAttributes,
  getSemanticHighlightSurfaceClassName,
  SEMANTIC_HIGHLIGHT_SURFACES,
} from '@/lib/ui/semanticHighlight'
const MARKDOWN_INLINE_EMBED_MAX_CHARS = 120_000
const MARKDOWN_VARIABLE_SSOT_SCAN_MAX_CHARS = 120_000
const MARKDOWN_MERMAID_DEFER_DOC_CHARS = 90_000
const MARKDOWN_MERMAID_DEFER_IDLE_MS = 180

export type MarkdownPreviewViewerProps = {
  rootRef: (el: HTMLElement | null) => void
  tokens: TokenWithLines[]
  activeDocumentPath: string
  highlightedLineRange: HighlightedLineRange
  markdownWordWrap: boolean
  markdownTextHighlight: boolean
  selectionKind: 'node' | 'edge' | null
  uiPanelTextFontClass: string
  uiPanelMonospaceTextClass: string
  sidebarPosition?: 'left' | 'right'
  stickyHeadingTopClass?: string
  stickyHeadingTopPx?: number
  mermaidFrontmatterConfig: Record<string, unknown> | null
  rootThemeMode: 'light' | 'dark'
  previewOverlayScope: 'viewport' | 'container'
  previewOverlayPortalTarget: HTMLElement | null
  effectiveHighlightBackgroundColor: string | null
  effectiveHighlightUnderlineColor: string | null
  scrollClass: string
  frontmatterMermaidCode?: string
  frontmatterRawText?: string
  frontmatterMeta?: Record<string, unknown> | null
  codeAnnotations?: Record<string, string> | null
  geoDatasetIntegration?: MarkdownGeoDatasetIntegration
  onScroll?: (event: React.UIEvent<HTMLElement>) => void
  onClick: (event: React.MouseEvent<HTMLElement>) => void
  showSidebar?: boolean
  onToggleSidebar?: (show: boolean) => void
  collapsedIds?: Set<string>
  onToggleCollapse?: (id: string) => void
  onExpandAll?: () => void
  onCollapseAll?: () => void
  onTocSelect?: (id: string) => void
  onTocDoubleClick?: (id: string) => void
  onTocReorder?: (parentId: string | null, fromIndex: number, toIndex: number) => void
  onInsertLineAfter?: (afterLine: number) => void
  onReorderLineBlock?: (
    source: { startLine: number; endLine: number },
    target: { startLine: number; endLine: number },
    position: 'before' | 'after',
  ) => void
  onReplaceLineRange?: (args: { startLine: number; endLine: number; replacementLines: string[] }) => void
  onDoubleClick?: (event: React.MouseEvent<HTMLElement>) => void
  annotateDisplayMode?: 'inline' | 'beside' | 'render'
  flashLine?: number | null
  contentClassName?: string
  markdownViewerWidthMode?: 'standard' | 'wide'
  sourceFiles?: Array<{ id: string; name: string; text?: string | null; active?: boolean }>
  onSourceFileSelect?: (id: string) => void
  onShowInEditor?: (line: number) => void
  sourceFilesPanelIntegration?: MarkdownSourceFilesPanelIntegration
  webpageLayoutWireframeAscii?: string | null
  sourceMarkdownText?: string
  markdownForcePlainTables?: boolean
  forbidCopy?: boolean
  onInlineEditStateChange?: (active: boolean) => void
  onInlineDraftTextChange?: (nextText: string, options?: import('@/features/markdown/ui/MarkdownRendererTypes').MarkdownInlineDraftTextChangeOptions) => void
  markdownCardPreviewMode?: boolean
  markdownViewerMediaMode?: MarkdownViewerMediaMode
}

export function MarkdownPreviewViewer(props: MarkdownPreviewViewerProps) {
  const uiPanelKeyValueTextSizeClass = useGraphStore(s => s.uiPanelKeyValueTextSizeClass || 'text-xs')
  const uiPanelMicroLabelTextSizeClass = useGraphStore(s => s.uiPanelMicroLabelTextSizeClass || 'text-[10px]')
  const {
    rootRef,
    tokens,
    activeDocumentPath,
    highlightedLineRange,
    markdownWordWrap,
    markdownTextHighlight,
    selectionKind,
    uiPanelTextFontClass,
    uiPanelMonospaceTextClass,
    sidebarPosition,
    stickyHeadingTopClass,
    stickyHeadingTopPx,
    mermaidFrontmatterConfig,
    rootThemeMode,
    previewOverlayScope,
    previewOverlayPortalTarget,
    effectiveHighlightBackgroundColor,
    effectiveHighlightUnderlineColor,
    scrollClass,
    onScroll,
    onClick,
    showSidebar,
    onToggleSidebar,
    collapsedIds,
    onToggleCollapse,
    onExpandAll,
    onCollapseAll,
    onTocSelect,
    onTocDoubleClick,
    onTocReorder,
    onInsertLineAfter,
    onReorderLineBlock,
    onReplaceLineRange,
    frontmatterMermaidCode,
    frontmatterRawText,
    frontmatterMeta: frontmatterMetaProp,
    onDoubleClick,
    codeAnnotations,
    geoDatasetIntegration,
    annotateDisplayMode,
    flashLine,
    contentClassName,
    markdownViewerWidthMode,
    sourceFiles,
    onSourceFileSelect,
    onShowInEditor,
    sourceFilesPanelIntegration,
    webpageLayoutWireframeAscii,
    sourceMarkdownText,
    markdownForcePlainTables,
    forbidCopy = false,
    onInlineEditStateChange,
    onInlineDraftTextChange,
    markdownCardPreviewMode = false,
    markdownViewerMediaMode = 'chip',
  } = props
  const blockCopy = React.useCallback((event: React.ClipboardEvent<HTMLElement>) => {
    if (!forbidCopy) return
    event.preventDefault()
  }, [forbidCopy])
  const blockCopyKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (!forbidCopy) return
    const key = String(event.key || '').toLowerCase()
    const mod = event.metaKey || event.ctrlKey
    if (!mod) return
    if (key !== 'c' && key !== 'x') return
    event.preventDefault()
  }, [forbidCopy])
  const { sourceMarkdownLength, markdownLargeDocumentMode } = React.useMemo(
    () => deriveMarkdownPreviewDocumentMode({ sourceMarkdownText, tokens }),
    [sourceMarkdownText, tokens],
  )

  const resetUserSelectLockIfNeeded = React.useCallback(() => {
    try {
      resetGlobalUserSelectLock()
    } catch {
      void 0
    }
  }, [])

  const embeddedMarkdownBase64 = React.useMemo(() => {
    const src = typeof sourceMarkdownText === 'string' ? sourceMarkdownText : ''
    if (!src) return ''
    if (src.length > MARKDOWN_INLINE_EMBED_MAX_CHARS) return ''
    try {
      return encodeUtf8ToBase64(src)
    } catch {
      return ''
    }
  }, [sourceMarkdownText])
  const viewerInlineEditingEnabled =
    !!onTocReorder || !!onInsertLineAfter || !!onReorderLineBlock || !!onReplaceLineRange
  const markdownSourceLines = React.useMemo(() => {
    if (!viewerInlineEditingEnabled) return []
    if (typeof sourceMarkdownText !== 'string' || !sourceMarkdownText) return []
    return sourceMarkdownText.split(/\r?\n/)
  }, [sourceMarkdownText, viewerInlineEditingEnabled])
  const { entries: variableSsotEntries, previewByKey: markdownVariablePreviewByKey } = React.useMemo(() => (
    typeof sourceMarkdownText !== 'string' || !sourceMarkdownText || sourceMarkdownText.length > MARKDOWN_VARIABLE_SSOT_SCAN_MAX_CHARS ? { entries: [], previewByKey: {} } : { entries: collectMarkdownVariableSsotEntries(sourceMarkdownText), previewByKey: buildMarkdownVariablePreviewByKey(sourceMarkdownText) }
  ), [sourceMarkdownText])
  const frontmatterMeta = React.useMemo(() => {
    if (!frontmatterMetaProp || typeof frontmatterMetaProp !== 'object' || Array.isArray(frontmatterMetaProp)) {
      return {} as Record<string, unknown>
    }
    return frontmatterMetaProp
  }, [frontmatterMetaProp])
  const shouldDeferMermaidRender = sourceMarkdownLength > MARKDOWN_MERMAID_DEFER_DOC_CHARS
  const [deferMermaidRender, setDeferMermaidRender] = React.useState<boolean>(shouldDeferMermaidRender)
  React.useEffect(() => {
    if (!shouldDeferMermaidRender) {
      setDeferMermaidRender(false)
      return
    }
    setDeferMermaidRender(true)
    let cancelled = false
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    const idleHandle = typeof idleWindow.requestIdleCallback === 'function'
      ? idleWindow.requestIdleCallback(
          () => {
            if (!cancelled) setDeferMermaidRender(false)
          },
          { timeout: MARKDOWN_MERMAID_DEFER_IDLE_MS },
        )
      : null
    const timerHandle = idleHandle == null
      ? window.setTimeout(() => {
          if (!cancelled) setDeferMermaidRender(false)
        }, MARKDOWN_MERMAID_DEFER_IDLE_MS)
      : null
    return () => {
      cancelled = true
      if (idleHandle != null && typeof idleWindow.cancelIdleCallback === 'function') {
        try {
          idleWindow.cancelIdleCallback(idleHandle)
        } catch {
          void 0
        }
      }
      if (timerHandle != null) {
        try {
          window.clearTimeout(timerHandle)
        } catch {
          void 0
        }
      }
    }
  }, [shouldDeferMermaidRender])
  const variableSsotByKey = React.useMemo(() => {
    const out = new Map<string, { line: number; source: 'frontmatter' | 'inline'; key: string }>()
    for (let i = 0; i < variableSsotEntries.length; i += 1) {
      const entry = variableSsotEntries[i]
      if (!entry) continue
      out.set(entry.key.toLowerCase(), { line: entry.line, source: entry.source, key: entry.key })
    }
    return out
  }, [variableSsotEntries])

  const isRenderMode = annotateDisplayMode === 'render'
  const frontmatterModeEnabled = useGraphStore(s => s.frontmatterModeEnabled || false)

  const scrollRootRef = React.useRef<HTMLElement | null>(null)
  const handleScrollRootRef = React.useCallback(
    (el: HTMLElement | null) => {
      scrollRootRef.current = el
      rootRef(el)
    },
    [rootRef],
  )
  const selectionMatchRects = useTextSelectionMatchHighlights({
    rootRef: scrollRootRef,
    resetKey: activeDocumentPath,
    enabled: !markdownCardPreviewMode,
  })

  React.useEffect(() => {
    const tryScrollToHash = () => {
      const hash = readBrowserLocationHash()
      if (!hash || !hash.startsWith('#')) return
      const id = (() => {
        const raw = hash.slice(1)
        try {
          return decodeURIComponent(raw)
        } catch {
          return raw
        }
      })()
      if (!id) return
      const el = document.getElementById(id)
      const root = scrollRootRef.current
      if (!el || !root) return
      if (!root.contains(el)) return
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } catch {
        try {
          el.scrollIntoView()
        } catch {
          void 0
        }
      }
    }

    tryScrollToHash()

    return subscribeHashChange(() => {
      tryScrollToHash()
    })
  }, [activeDocumentPath])

  React.useEffect(() => {
    const root = scrollRootRef.current
    if (!root) return
    const hash = readBrowserLocationHash()
    if (hash && hash.startsWith('#')) return
    try {
      root.scrollTop = 0
    } catch {
      void 0
    }
  }, [activeDocumentPath])

  const explorerControls = useMarkdownExplorerControls({
    tokens,
    storageScopeKey: activeDocumentPath,
    showSidebar,
    onToggleSidebar,
    collapsedHeadingIds: collapsedIds,
    onToggleCollapse,
    onExpandAll,
    onCollapseAll,
  })

  const handleTocSelect = React.useCallback((id: string) => {
    if (onTocSelect) {
      onTocSelect(id)
      return
    }
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [onTocSelect])

  const handleWikiLinkNavigate = React.useCallback(
    (href: string): boolean => {
      const parsed = parseMarkdownWikiHref(href)
      if (!parsed) return false
      const list = Array.isArray(sourceFiles) ? sourceFiles : []
      if (!list.length || typeof onSourceFileSelect !== 'function') return false

      const docKeyNorm = normalizeLooseKey(parsed.docKey)
      if (!docKeyNorm) return false

      const findMatch = (): { id: string; name: string } | null => {
        for (const f of list) {
          const name = String(f?.name || '')
          const base = name.replace(/\\/g, '/').split('/').pop() || name
          const baseNoExt = base.replace(/\.(md|markdown)$/i, '')
          const candidates = [
            normalizeLooseKey(baseNoExt),
            normalizeLooseKey(base),
            normalizeLooseKey(name.replace(/\.(md|markdown)$/i, '')),
          ]
          if (candidates.some(c => c && c === docKeyNorm)) {
            const id = String(f?.id || '')
            if (!id) continue
            return { id, name }
          }
        }
        return null
      }

      const match = findMatch()
      if (!match) return false

      try {
        onSourceFileSelect(match.id)
      } catch {
        return false
      }

      const anchorId = parsed.anchorId
      if (anchorId) {
        writeBrowserLocationHash(`#${encodeURIComponent(anchorId)}`)
      }

      return true
    },
    [onSourceFileSelect, sourceFiles],
  )

  const handleClickWithWikiLinks = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      try {
        const target = event.target as Element | null
        const variableRef = target ? target.closest('[data-kg-var-key]') as HTMLElement | null : null
        const variableKey = String(variableRef?.getAttribute('data-kg-var-key') || '').trim()
        if (variableKey) {
          const ssot = variableSsotByKey.get(variableKey.toLowerCase())
          if (ssot && typeof onShowInEditor === 'function') {
            event.preventDefault()
            event.stopPropagation()
            onShowInEditor(ssot.line)
            return
          }
        }
        const anchor = target ? target.closest('a') : null
        const href = anchor?.getAttribute('href') || ''
        if (href && href.startsWith('#') && handleWikiLinkNavigate(href)) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
      } catch {
        void 0
      }
      onClick(event)
    },
    [handleWikiLinkNavigate, onClick, onShowInEditor, variableSsotByKey],
  )

  const visibleTokens = React.useMemo(() => {
    return filterVisibleMarkdownTokensByCollapsedHeadings({
      tokens,
      collapsedHeadingIds: explorerControls.collapsedHeadingIds,
    })
  }, [tokens, explorerControls.collapsedHeadingIds])
  const {
    onMoveItem: handleMoveHeadingSection,
    onReorderByIds: handleReorderHeadingSection,
  } = useMarkdownTocTreeState({
    tokens,
    onReorder: onTocReorder,
  })

  const providedStickyHeadingTopPx = React.useMemo(
    () => getDefaultStickyHeadingTopPx(stickyHeadingTopPx),
    [stickyHeadingTopPx],
  )

  const effectiveStickyHeadingTopPx = markdownLargeDocumentMode ? 0 : providedStickyHeadingTopPx

  const stickyHeadingScrollPaddingTopPx = React.useMemo(() => {
    if (markdownLargeDocumentMode) return 0
    return computeStickyHeadingScrollPaddingTopPx({
      tokens,
      baseTopPx: effectiveStickyHeadingTopPx,
      markdownPresentationMode: false,
    })
  }, [effectiveStickyHeadingTopPx, markdownLargeDocumentMode, tokens])

  const body = React.useMemo(
    () => (
      <MarkdownTokenRenderer
        tokens={visibleTokens}
        activeDocumentPath={activeDocumentPath}
        highlightedLineRange={highlightedLineRange}
        markdownWordWrap={markdownWordWrap}
        markdownPresentationMode={false}
        uiPanelTextFontClass={uiPanelTextFontClass}
        uiPanelMonospaceTextClass={uiPanelMonospaceTextClass}
        stickyHeadingTopClass={stickyHeadingTopClass}
        stickyHeadingTopPx={effectiveStickyHeadingTopPx}
        mermaidFrontmatterConfig={mermaidFrontmatterConfig}
        rootThemeMode={rootThemeMode}
        previewOverlayScope={previewOverlayScope}
        previewOverlayPortalTarget={previewOverlayPortalTarget}
        markdownTextHighlight={markdownTextHighlight}
        codeAnnotations={codeAnnotations}
        geoDatasetIntegration={geoDatasetIntegration}
        annotateDisplayMode={annotateDisplayMode}
        selectionKind={selectionKind}
        highlightBackgroundColor={effectiveHighlightBackgroundColor}
        highlightUnderlineColor={effectiveHighlightUnderlineColor}
        collapsedIds={explorerControls.collapsedHeadingIds}
        onToggleCollapse={explorerControls.onToggleCollapse}
        viewerBlockEditingEnabled={viewerInlineEditingEnabled}
        onMoveHeadingSection={handleMoveHeadingSection}
        onReorderHeadingSection={handleReorderHeadingSection}
        onInsertLineAfter={onInsertLineAfter}
        onReorderLineBlock={onReorderLineBlock}
        onReplaceLineRange={onReplaceLineRange}
        flashLine={flashLine}
        webpageLayoutWireframeAscii={webpageLayoutWireframeAscii}
        markdownForcePlainTables={markdownForcePlainTables}
        markdownSourceLines={markdownSourceLines}
        forbidCopy={forbidCopy}
        onInlineEditStateChange={onInlineEditStateChange}
        onInlineDraftTextChange={onInlineDraftTextChange}
        deferMermaidRender={deferMermaidRender}
        markdownLargeDocumentMode={markdownLargeDocumentMode}
        markdownCardPreviewMode={markdownCardPreviewMode}
        markdownViewerMediaMode={markdownViewerMediaMode}
        markdownVariablePreviewByKey={markdownVariablePreviewByKey}
      />
    ),
    [
      activeDocumentPath,
      effectiveHighlightBackgroundColor,
      effectiveHighlightUnderlineColor,
      geoDatasetIntegration,
      highlightedLineRange,
      markdownTextHighlight,
      markdownWordWrap,
      annotateDisplayMode,
      mermaidFrontmatterConfig,
      previewOverlayPortalTarget,
      previewOverlayScope,
      rootThemeMode,
      codeAnnotations,
      stickyHeadingTopClass,
      effectiveStickyHeadingTopPx,
      selectionKind,
      visibleTokens,
      uiPanelMonospaceTextClass,
      uiPanelTextFontClass,
      explorerControls.collapsedHeadingIds,
      explorerControls.onToggleCollapse,
      handleMoveHeadingSection,
      handleReorderHeadingSection,
      onInsertLineAfter,
      onReorderLineBlock,
      onReplaceLineRange,
      viewerInlineEditingEnabled,
      markdownForcePlainTables,
      flashLine,
      markdownSourceLines,
      webpageLayoutWireframeAscii,
      forbidCopy,
      onInlineEditStateChange,
      onInlineDraftTextChange,
      deferMermaidRender,
      markdownLargeDocumentMode,
      markdownCardPreviewMode,
      markdownViewerMediaMode,
      markdownVariablePreviewByKey,
    ],
  )

  const frontmatterPreviewOpts = React.useMemo(() => {
    if (!frontmatterModeEnabled) return null
    return buildMarkdownFrontmatterPreviewRenderOpts({
      activeDocumentPath,
      highlightedLineRange,
      markdownWordWrap,
      uiPanelTextFontClass,
      uiPanelMonospaceTextClass,
      stickyHeadingTopClass,
      stickyHeadingTopPx: effectiveStickyHeadingTopPx,
      mermaidFrontmatterConfig: mermaidFrontmatterConfig as never,
      rootThemeMode,
      previewOverlayScope,
      previewOverlayPortalTarget,
      codeAnnotations,
      collapsedIds: explorerControls.collapsedHeadingIds,
      onToggleCollapse: explorerControls.onToggleCollapse,
      geoDatasetIntegration,
      forbidCopy,
      deferMermaidRender,
      markdownViewerMediaMode,
    })
  }, [
    activeDocumentPath,
    codeAnnotations,
    forbidCopy,
    explorerControls.collapsedHeadingIds,
    effectiveStickyHeadingTopPx,
    frontmatterModeEnabled,
    geoDatasetIntegration,
    explorerControls.onToggleCollapse,
    highlightedLineRange,
    markdownWordWrap,
    mermaidFrontmatterConfig,
    previewOverlayPortalTarget,
    previewOverlayScope,
    rootThemeMode,
    stickyHeadingTopClass,
    uiPanelMonospaceTextClass,
    uiPanelTextFontClass,
    deferMermaidRender,
    markdownViewerMediaMode,
  ])

  const previewContent = (
    <section
      ref={handleScrollRootRef}
      onPointerDownCapture={resetUserSelectLockIfNeeded}
      onMouseDownCapture={resetUserSelectLockIfNeeded}
      onMouseUpCapture={resetUserSelectLockIfNeeded}
      onDoubleClickCapture={resetUserSelectLockIfNeeded}
      onScroll={onScroll}
      onClick={handleClickWithWikiLinks}
      onDoubleClick={onDoubleClick}
      onCopy={blockCopy}
      onCut={blockCopy}
      onKeyDown={blockCopyKeyDown}
      style={getMarkdownPreviewScrollStyle(scrollClass, stickyHeadingScrollPaddingTopPx)}
      className={[
        'relative flex-1 min-h-0', // Removed py-2 to ensure sticky headers snap perfectly to top
        scrollClass,
        uiPanelTextFontClass,
        UI_THEME_TOKENS.text.primary,
      ].join(' ')}
      data-testid="markdown-preview-root"
      data-kg-card-markdown-viewer={markdownCardPreviewMode ? '1' : undefined}
      data-kg-large-markdown-viewer={markdownLargeDocumentMode ? '1' : undefined}
      aria-label="Markdown Preview Content"
    >
      <section
        aria-hidden="true"
        className="pointer-events-none select-none absolute left-0 top-0 z-10"
        data-kg-selection-match-overlay="true"
        {...getSemanticHighlightSurfaceAttributes(SEMANTIC_HIGHLIGHT_SURFACES.selectionMatch)}
      >
        {selectionMatchRects.map(rect => (
          <span
            key={rect.id}
            className={`absolute select-none ${getSemanticHighlightSurfaceClassName(SEMANTIC_HIGHLIGHT_SURFACES.selectionMatch)}`}
            data-kg-selection-match-highlight="true"
            {...getSemanticHighlightSurfaceAttributes(SEMANTIC_HIGHLIGHT_SURFACES.selectionMatch)}
            style={buildSemanticTextHighlightOverlayStyle(rect)}
          />
        ))}
      </section>
      {!markdownCardPreviewMode && embeddedMarkdownBase64 ? (
        <script type="application/x-kg-markdown" data-kg-markdown-source="1" data-kg-encoding="base64">
          {embeddedMarkdownBase64}
        </script>
      ) : null}
      {variableSsotEntries.length > 0 ? (
        <section aria-hidden className="sr-only">
          {variableSsotEntries.map(entry => (
            <span
              key={`var-ssot:${entry.key}`}
              id={buildMarkdownVariableSsotAnchorId(entry.key)}
              data-kg-var-ssot-key={entry.key}
              data-kg-var-ssot-line={entry.line}
            />
          ))}
        </section>
      ) : null}
      {frontmatterPreviewOpts ? (
        <MarkdownFrontmatterPreviewBlocks
          yaml={frontmatterRawText}
          mermaid={frontmatterMermaidCode}
          frontmatterMeta={frontmatterMeta}
          variableSsotEntries={variableSsotEntries}
          onShowInEditor={onShowInEditor}
          annotateDisplayMode={annotateDisplayMode}
          opts={frontmatterPreviewOpts}
          markdownWordWrap={markdownWordWrap}
          contentClassName={contentClassName}
          markdownViewerWidthMode={markdownViewerWidthMode}
        />
      ) : null}
      <article
        className={
          contentClassName ||
          getMarkdownViewerWidthWrapperClassName(markdownViewerWidthMode || 'standard')
        }
      >
         {body}
      </article>
    </section>
  )

  if (markdownCardPreviewMode) return previewContent

  return (
    <MarkdownPanelLayout
      tokens={tokens}
      uiPanelTextFontClass={uiPanelTextFontClass}
      uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
      uiPanelMicroLabelTextSizeClass={uiPanelMicroLabelTextSizeClass}
      showSidebar={explorerControls.showSidebar}
      onTocSelect={handleTocSelect}
      onTocDoubleClick={onTocDoubleClick}
      onTocReorder={onTocReorder}
      collapsedIds={explorerControls.collapsedHeadingIds}
      onToggleCollapse={explorerControls.onToggleCollapse}
      onExpandAll={explorerControls.onExpandAll}
      onCollapseAll={explorerControls.onCollapseAll}
      allCollapsed={explorerControls.allCollapsed}
      sourceFiles={sourceFiles}
      onSourceFileSelect={onSourceFileSelect}
      sourceFilesPanelIntegration={sourceFilesPanelIntegration}
      sidebarPosition={sidebarPosition}
    >
      {previewContent}
    </MarkdownPanelLayout>
  )
}
