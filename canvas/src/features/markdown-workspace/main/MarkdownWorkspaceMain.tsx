import React from 'react'
import { useWorkspaceDocumentState } from './useWorkspaceDocumentState'
import type { MarkdownWorkspaceLayoutMode } from '@/features/markdown-explorer/workspaceUi'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { HighlightedLineRange, MarkdownPresentationApi } from '../markdownWorkspaceTypes'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import type { MarkdownGeoDatasetIntegration } from '@/features/markdown/ui/MarkdownRendererTypes'
import { extractYamlFrontmatterBlock, type WebpageFrontmatterMeta, type WebpageViewMode, type WebsiteImportFrontmatterMeta } from '@/lib/markdown/frontmatter'
import { parseGlbAssetDocument } from '@/lib/assets/glbAssetDocument'
import { summarizeCategorizedSignalsFromMarkdown } from '@/lib/websites/signalTokens'
import { buildWebpageLayoutWireframeAsciiFromMarkdown } from '@/lib/websites/webpageLayoutWireframe'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { MonacoTextEditorHandle } from '@/features/monaco/MonacoTextEditor'
import { useDebouncedValue } from '@/features/hooks/useDebouncedValue'
import { WebpageViewerPane } from './webpage/WebpageViewerPane'
import { deriveWebpageFrontmatterMetaFromBlock, deriveWebsiteImportFrontmatterMetaFromBlock, shouldRenderWebpageIframe } from './webpage/webpageMeta'
import { useWebpageIframeView } from './webpage/useWebpageIframeView'
import {
  DEFAULT_MARKDOWN_WORKSPACE_PANE_VISIBILITY,
  resolveMarkdownWorkspaceDocumentPanePreset,
  isMarkdownWorkspaceDelimitedTextPath,
  resolveMarkdownWorkspacePaneAvailability,
  resolveMarkdownWorkspacePaneVisibility,
  type MarkdownWorkspaceMainProps,
} from './types'
import { MarkdownWorkspaceLayout } from './layout/MarkdownWorkspaceLayout'
import { useWorkspaceScrollSync } from './scroll/useWorkspaceScrollSync'
import { useInitialWorkspacePaneVisibility } from './useInitialWorkspacePaneVisibility'
import { MarkdownWorkspaceDerivedViewer, type MarkdownWorkspaceDerivedViewerKind, type MarkdownWorkspaceDerivedViewerMode } from './viewer/MarkdownWorkspaceDerivedViewer'
import { MarkdownWorkspaceViewerSurface } from './viewer/MarkdownWorkspaceViewerSurface'
import { useWorkspaceExportBridge } from './useWorkspaceExportBridge'
import { workspaceTablePreferencesStore } from '@/features/workspace-table/workspaceTablePreferencesStore'
import { isWorkspaceEditorOverlayOpen } from '@/features/workspace-table/workspaceTableSsot'
const MarkdownWorkspacePresentationSurfaceLazy = React.lazy(
  async (): Promise<{ default: typeof import('./presentation/MarkdownWorkspacePresentationSurface')['MarkdownWorkspacePresentationSurface'] }> =>
    import('./presentation/MarkdownWorkspacePresentationSurface').then(mod => ({ default: mod.MarkdownWorkspacePresentationSurface })),
)

export const MarkdownWorkspaceMain = React.memo(function MarkdownWorkspaceMain(props: MarkdownWorkspaceMainProps) {
  const panelTypography = usePanelTypography()
  const [splitPaneVisibility, setSplitPaneVisibility] = React.useState(DEFAULT_MARKDOWN_WORKSPACE_PANE_VISIBILITY)
  const [viewerEl, setViewerEl] = React.useState<HTMLElement | null>(null)
  const [webpageViewerEl, setWebpageViewerEl] = React.useState<HTMLElement | null>(null)
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null)
  const workspaceCanvasPaneOpen = useGraphStore(s => s.workspaceCanvasPaneOpen)
  const setWorkspaceCanvasPaneOpen = useGraphStore(s => s.setWorkspaceCanvasPaneOpen)
  const bottomSurfaceCollapsed = useGraphStore(s => s.bottomSurfaceCollapsed)
  const bottomSurfaceTab = useGraphStore(s => s.bottomSurfaceTab)
  const setBottomSurfaceCollapsed = useGraphStore(s => s.setBottomSurfaceCollapsed)
  const setBottomSurfaceTab = useGraphStore(s => s.setBottomSurfaceTab)
  const workspaceViewMode = useGraphStore(s => s.workspaceViewMode)
  const workspaceEditorOverlayOpen = isWorkspaceEditorOverlayOpen({ workspaceViewMode, workspaceCanvasPaneOpen })
  const graphData = useGraphStore(s => s.graphData)
  const pushUiToast = useGraphStore(s => s.pushUiToast)
  const {
    themeMode,
    uiPanelTextFontClass,
    uiPanelMonospaceTextClass,
    geoDatasetIntegration,
    explorerOpen,
    setExplorerOpen,
    layoutMode,
    setLayoutMode,
    markdownWordWrap,
    setMarkdownWordWrap,
    markdownTextHighlight,
    setMarkdownTextHighlight,
    onStatusProgress,
    onStatusWithAutoClear,
    onSaveAs,
    onToggleFullscreen,
    presentationApiRef,
    isMarkdown,
    webpageWorkspaceMeta, onWebpageChangeView, onWebpageUpdateMeta, contentFormat, onContentFormatChange,
    activeText,
    setActiveText,
    jsonSourceText,
    editorTextOverride,
    webpageHtmlOverride,
    disableEditorMutations,
    liveTextTailFollowKey,
    viewerTextOverride,
    disableViewerMutations,
    widgetModeActive = false,
    activeDocumentKey,
    highlightedLineRange,
    revealLineInEditor,
    showInViewer,
    showInPresentation,
    showInGallery,
    editorUri,
    editorLanguage,
    editorRef,
    onEditorCaretLine,
    onViewerInlineEditStateChange,
  } = props
  const viewerRef = React.useRef<HTMLElement | null>(null), webpageViewerRef = React.useRef<HTMLElement | null>(null)

  const frontmatterBlock = React.useMemo(() => extractYamlFrontmatterBlock(activeText), [activeText])
  const modelAsset = React.useMemo(() => parseGlbAssetDocument(activeText), [activeText])
  const modelAssetFormat = modelAsset?.format || null
  const paneAvailability = React.useMemo(
    () => resolveMarkdownWorkspacePaneAvailability({ modelAssetFormat }),
    [modelAssetFormat],
  )
  const webpageMeta = React.useMemo((): WebpageFrontmatterMeta | null => {
    return deriveWebpageFrontmatterMetaFromBlock(frontmatterBlock)
  }, [frontmatterBlock])
  const websiteImportMeta = React.useMemo((): WebsiteImportFrontmatterMeta | null => {
    return deriveWebsiteImportFrontmatterMetaFromBlock(frontmatterBlock)
  }, [frontmatterBlock])

  const webpageViewRequestsIframe = shouldRenderWebpageIframe(webpageMeta)
  const hasJsonSourcePreviewText = typeof jsonSourceText === 'string' && jsonSourceText.trim().length > 0
  const documentPanePreset = React.useMemo(
    () => resolveMarkdownWorkspaceDocumentPanePreset(activeDocumentKey),
    [activeDocumentKey],
  )
  const shouldUseDataViewDocumentPreset = React.useMemo(
    () => documentPanePreset === 'viewer' && (hasJsonSourcePreviewText || isMarkdownWorkspaceDelimitedTextPath(activeDocumentKey)),
    [activeDocumentKey, documentPanePreset, hasJsonSourcePreviewText],
  )
  const forceMarkdownEditorInEditorMode = !modelAssetFormat
    && documentPanePreset !== 'json'
    && documentPanePreset !== 'viewer'
    && (!webpageMeta || webpageMeta.view === 'markdown' || typeof editorTextOverride === 'string')

  const [viewerKind, setViewerKind] = React.useState<MarkdownWorkspaceDerivedViewerKind>('markdown')
  const [viewerMode, setViewerMode] = React.useState<MarkdownWorkspaceDerivedViewerMode>(() => (
    shouldUseDataViewDocumentPreset
      ? 'multiDimTable'
      : 'read'
  ))
  React.useEffect(() => {
    if (layoutMode !== 'editor') return
    if (viewerKind === 'markdown' || viewerKind === 'json') return
    setViewerKind('markdown')
  }, [layoutMode, viewerKind])
  React.useEffect(() => {
    if (layoutMode !== 'viewer') return
    if (viewerKind !== 'markdown') {
      setViewerKind('markdown')
      return
    }
    if (viewerMode !== 'read' && !shouldUseDataViewDocumentPreset) {
      setViewerMode('read')
    }
  }, [layoutMode, shouldUseDataViewDocumentPreset, viewerKind, viewerMode])
  useInitialWorkspacePaneVisibility({
    activeDocumentKey,
    modelAssetFormat,
    splitPaneVisibility,
    webpageUrl: webpageMeta?.url || null,
    webpageView: webpageMeta?.view || null,
    workspaceEditorOverlayOpen,
    workspaceEditorSurfaceActive: workspaceEditorOverlayOpen || layoutMode === 'editor' || layoutMode === 'split',
    setSplitPaneVisibility,
  })

  React.useEffect(() => {
    if (!modelAssetFormat) return
    if (layoutMode === 'editor' || layoutMode === 'split') return
    setLayoutMode('editor')
  }, [layoutMode, modelAssetFormat, setLayoutMode])

  const workspaceEditorMode = React.useSyncExternalStore(
    workspaceTablePreferencesStore.subscribe,
    () => workspaceTablePreferencesStore.getSnapshot().workspaceEditorMode,
    () => workspaceTablePreferencesStore.getServerSnapshot().workspaceEditorMode,
  )

  React.useEffect(() => {
    setViewerMode(prev => {
      if (prev === 'read') return prev
      if (prev === 'geospatial') return prev
      if (shouldUseDataViewDocumentPreset && prev === 'multiDimTable') return prev
      return prev === workspaceEditorMode ? prev : workspaceEditorMode
    })
  }, [shouldUseDataViewDocumentPreset, workspaceEditorMode])

  const handleSetViewerMode = React.useCallback(
    (next: MarkdownWorkspaceDerivedViewerMode) => {
      setViewerMode(prev => (prev === next ? prev : next))
      if (next === 'read') return
      const store = useGraphStore.getState()
      if (next === 'geospatial') {
        if (workspaceEditorMode !== 'multiDimTable') {
          workspaceTablePreferencesStore.setWorkspaceEditorMode('multiDimTable')
        }
        return
      }
      if (next === 'multiDimTable') {
        store.setMultiDimTableModeEnabled(true)
      } else if (next === 'table' || next === 'kanban') {
        store.setMultiDimTableModeEnabled(false)
      }
      if (next !== workspaceEditorMode) {
        workspaceTablePreferencesStore.setWorkspaceEditorMode(next)
      }
    },
    [workspaceEditorMode],
  )


  const paneVisibility = React.useMemo(
    () => resolveMarkdownWorkspacePaneVisibility({
      layoutMode,
      splitPaneVisibility,
      paneAvailability,
      forceMarkdownEditorInEditorMode,
    }),
    [forceMarkdownEditorInEditorMode, layoutMode, paneAvailability, splitPaneVisibility],
  )
  const jsonPaneVisible = paneVisibility.json
  const markdownPaneVisible = paneVisibility.markdown
  const viewerPaneVisible = paneVisibility.viewer
  const htmlPaneVisible = paneVisibility.html && !!webpageMeta?.url
  const showWebpageHtml = webpageViewRequestsIframe || htmlPaneVisible
  const binaryPaneVisible = paneAvailability.bin && (layoutMode === 'editor' || layoutMode === 'split')
  const activeJsonSourcePreviewText = hasJsonSourcePreviewText && typeof jsonSourceText === 'string' ? jsonSourceText : null

  const viewerModePresetKeyRef = React.useRef('')
  React.useEffect(() => {
    const presetKey = [
      activeDocumentKey,
      documentPanePreset || '',
      activeJsonSourcePreviewText ? 'json-source' : '',
      isMarkdownWorkspaceDelimitedTextPath(activeDocumentKey) ? 'delimited-text' : '',
    ].join('\n')
    if (viewerModePresetKeyRef.current === presetKey) return
    viewerModePresetKeyRef.current = presetKey
    if (!shouldUseDataViewDocumentPreset || viewerMode === 'multiDimTable') return
    setViewerMode('multiDimTable')
    if (workspaceEditorMode !== 'multiDimTable') {
      workspaceTablePreferencesStore.setWorkspaceEditorMode('multiDimTable')
    }
  }, [activeDocumentKey, activeJsonSourcePreviewText, documentPanePreset, shouldUseDataViewDocumentPreset, viewerMode, workspaceEditorMode])

  React.useEffect(() => {
    if (viewerKind === 'markdown' || viewerKind === 'json') return
    setViewerKind('markdown')
  }, [viewerKind])



  const { markdownEditorHandle, jsonEditorHandle, renderMarkdownEditorPane, renderJsonEditorPane,
    sourceEditorTextRaw, isJsonMarkdownEditing, editableMarkdownText, markdownEditText, viewerText, derivedViewerText,
    handleInsertLineAfter, handleReorderLineBlock, handleReplaceLineRange,
    onInsertLineAfter, onReorderLineBlock, onReplaceLineRange, handleInlineEditStateChange, handleInlineDraftTextChange,
  } = useWorkspaceDocumentState({ props, panelTypography, modelAsset, documentPanePreset, activeJsonSourcePreviewText,
    viewerKind, viewerMode, markdownPaneVisible, jsonPaneVisible, viewerPaneVisible, htmlPaneVisible,
    binaryPaneVisible, showWebpageHtml, splitPaneVisibility, workspaceViewMode, workspaceCanvasPaneOpen, workspaceEditorOverlayOpen })
  const frontmatterWarningSourceText = !isJsonMarkdownEditing && isMarkdown ? String(editableMarkdownText || '') : String(sourceEditorTextRaw || '')
  const frontmatterWarnings = React.useMemo(() => {
    if (props.suppressFrontmatterWarnings) return [] as string[]
    const text = String(frontmatterWarningSourceText || '')
    if (!text.startsWith('---')) return [] as string[]
    return parseMarkdownFrontmatter(splitMarkdownLines(text)).warnings || []
  }, [frontmatterWarningSourceText, props.suppressFrontmatterWarnings])
  const frontmatterWarningSummary = frontmatterWarnings[0] || ''
  const frontmatterWarningCount = frontmatterWarnings.length
  const frontmatterNotice = frontmatterWarningSummary ? (
    <section
      className={`rounded border px-3 py-2 text-xs leading-5 ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.status.warning}`}
      role="status"
      aria-label="Frontmatter warning"
    >
      <section className="font-medium">Frontmatter warning</section>
      <section className="whitespace-pre-wrap break-words">{frontmatterWarningSummary}</section>
      {frontmatterWarningCount > 1 ? (
        <section className={`mt-1 ${UI_THEME_TOKENS.text.secondary}`}>
          {`${frontmatterWarningCount - 1} more warning${frontmatterWarningCount - 1 === 1 ? '' : 's'}`}
        </section>
      ) : null}
    </section>
  ) : null
  const documentNotice = frontmatterNotice ? (
    <section className="space-y-2">
      {frontmatterNotice}
    </section>
  ) : null
  const documentVersionGraphOpen = bottomSurfaceTab === 'documentVersionGraph' && bottomSurfaceCollapsed !== true
  const setDocumentVersionGraphOpen = React.useCallback((next: boolean) => {
    if (next) {
      setBottomSurfaceTab('documentVersionGraph')
      setBottomSurfaceCollapsed(false)
      return
    }
    if (bottomSurfaceTab === 'documentVersionGraph') {
      setBottomSurfaceCollapsed(true)
    }
  }, [bottomSurfaceTab, setBottomSurfaceCollapsed, setBottomSurfaceTab])
  const webpageLayoutWireframeAscii = React.useMemo(() => {
    if (!webpageMeta?.url) return null
    const ascii = buildWebpageLayoutWireframeAsciiFromMarkdown(viewerText)
    return ascii && ascii.trim() ? ascii : null
  }, [viewerText, webpageMeta?.url])

  const debouncedSignalText = useDebouncedValue(activeText, 450, webpageMeta?.url)
  const webpageSignalSummary = React.useMemo(() => {
    if (!webpageMeta?.url) return null
    const signals = summarizeCategorizedSignalsFromMarkdown(debouncedSignalText, { maxLines: 8000, maxPerKind: 24 })
    return {
      nav: signals.nav.length,
      cta: signals.cta.length,
      price: signals.price.length,
      time: signals.time.length,
    }
  }, [debouncedSignalText, webpageMeta?.url])

  const handleMarkdownViewerRootRef = React.useCallback((el: HTMLElement | null) => {
    viewerRef.current = el
    setViewerEl(prev => (prev === el ? prev : el))
  }, [])
  const handleWebpageViewerRootRef = React.useCallback((el: HTMLElement | null) => {
    webpageViewerRef.current = el
    setWebpageViewerEl(prev => (prev === el ? prev : el))
  }, [])
  const handleIframeRef = React.useCallback((el: HTMLIFrameElement | null) => {
    iframeRef.current = el
  }, [])

  const { iframeSrcDoc, iframeSrc } = useWebpageIframeView({
    enabled: showWebpageHtml,
    webpageMeta,
    websiteImportMeta,
    webpageHtmlOverride,
    onStatusProgress,
    onStatusWithAutoClear,
  })

  useWorkspaceScrollSync({
    activeDocumentKey,
    layoutMode,
    showWebpageHtml,
    markdownEditorHandle,
    jsonEditorHandle,
    viewerEl,
    iframeRef,
    liveTextTailFollowKey,
  })

  React.useEffect(() => {
    if (layoutMode !== 'presentation') {
      presentationApiRef.current = null
    }
  }, [layoutMode, presentationApiRef])


  const binaryPane = modelAsset?.format === 'glb' ? (
    <section className={`flex-1 min-h-0 min-w-0 overflow-auto p-3 ${panelTypography.panelTextClass}`} aria-label="Binary GLB Model">
      <section className={`rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-3`}>
        <h2 className={panelTypography.keyLabelClass}>Binary GLB</h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className={UI_THEME_TOKENS.text.secondary}>Name</dt>
          <dd className="min-w-0 break-all">{modelAsset.name}</dd>
          <dt className={UI_THEME_TOKENS.text.secondary}>Format</dt>
          <dd>GLB</dd>
          {typeof modelAsset.byteLength === 'number' ? (
            <>
              <dt className={UI_THEME_TOKENS.text.secondary}>Bytes</dt>
              <dd>{modelAsset.byteLength}</dd>
            </>
          ) : null}
          {modelAsset.pendingLocalImport ? (
            <>
              <dt className={UI_THEME_TOKENS.text.secondary}>State</dt>
              <dd>pending local file handle</dd>
            </>
          ) : null}
        </dl>
      </section>
    </section>
  ) : null

  const htmlViewer = showWebpageHtml ? (
    <WebpageViewerPane
      url={webpageMeta?.url || ''}
      iframeSrc={iframeSrc}
      iframeSrcDoc={iframeSrcDoc}
      onIframeRef={handleIframeRef}
      onViewerRef={handleWebpageViewerRootRef}
    />
  ) : null

  const disableDerivedMarkdownMutations = !!disableViewerMutations

  const markdownViewer = !viewerPaneVisible ? null : (viewerMode === 'read' || viewerMode === 'table') && viewerKind === 'markdown' ? (
    <MarkdownWorkspaceViewerSurface
      ref={handleMarkdownViewerRootRef}
      markdownText={viewerText}
      activeDocumentPath={activeDocumentKey}
      highlightedLineRange={highlightedLineRange}
      markdownWordWrap={markdownWordWrap}
      markdownTextHighlight={markdownTextHighlight}
      markdownViewerMediaMode={webpageMeta?.url ? 'image' : undefined}
      selectionKind={null}
      uiPanelTextFontClass={uiPanelTextFontClass}
      uiPanelMonospaceTextClass={uiPanelMonospaceTextClass}
      webpageLayoutWireframeAscii={webpageLayoutWireframeAscii}
      geoDatasetIntegration={geoDatasetIntegration}
      onInsertLineAfter={disableDerivedMarkdownMutations ? undefined : onInsertLineAfter}
      onReorderLineBlock={disableDerivedMarkdownMutations ? undefined : onReorderLineBlock}
      onReplaceLineRange={disableDerivedMarkdownMutations ? undefined : onReplaceLineRange}
      onShowInEditor={line => revealLineInEditor(line)}
      onInlineEditStateChange={disableDerivedMarkdownMutations ? undefined : handleInlineEditStateChange}
      onInlineDraftTextChange={disableDerivedMarkdownMutations ? undefined : handleInlineDraftTextChange}
      markdownForcePlainTables={viewerMode === 'table'}
    />
  ) : (
    <MarkdownWorkspaceDerivedViewer
      viewerKind={viewerKind}
      viewerMode={viewerMode}
      markdownText={derivedViewerText}
      title={String(activeDocumentKey || '').split('/').filter(Boolean).pop() || 'Workspace'}
      activeDocumentPath={activeDocumentKey}
      highlightedLineRange={highlightedLineRange}
      markdownWordWrap={markdownWordWrap}
      markdownTextHighlight={markdownTextHighlight}
      uiPanelTextFontClass={uiPanelTextFontClass}
      uiPanelMonospaceTextClass={uiPanelMonospaceTextClass}
      webpageLayoutWireframeAscii={webpageLayoutWireframeAscii}
      geoDatasetIntegration={geoDatasetIntegration}
      disableViewerMutations={disableDerivedMarkdownMutations}
      onInsertLineAfter={handleInsertLineAfter}
      onReorderLineBlock={handleReorderLineBlock}
      onReplaceLineRange={handleReplaceLineRange}
      onRevealLineInEditor={line => revealLineInEditor(line)}
      onInlineEditStateChange={handleInlineEditStateChange}
      onInlineDraftTextChange={handleInlineDraftTextChange}
      onViewerRootRef={handleMarkdownViewerRootRef}
      onChangeViewerMode={handleSetViewerMode}
    />
  )
  const viewer = layoutMode === 'viewer' && showWebpageHtml ? htmlViewer : markdownViewer, exportViewerEl = showWebpageHtml ? webpageViewerEl : viewerEl
  const getExportViewerRefCurrent = React.useCallback(() => (showWebpageHtml ? webpageViewerRef.current : viewerRef.current), [showWebpageHtml])

  const {
    handleExportWorkspaceFile,
    handleExportMarkdown,
    handleExportHtmlViewer,
    handleExportHtmlCanvas,
    handleExportSvg,
    handleExportJson,
  } = useWorkspaceExportBridge({
    activeDocumentKey,
    activeText,
    jsonSourceText,
    markdownEditText,
    viewerTextOverride,
    showWebpageHtml,
    iframeSrcDoc,
    viewerEl: exportViewerEl,
    pushUiToast,
    onSaveAs,
    getViewerRefCurrent: getExportViewerRefCurrent,
  })

  const presentation = (
    <React.Suspense fallback={null}>
      <MarkdownWorkspacePresentationSurfaceLazy
        showWebpageHtml={showWebpageHtml}
        webpageUrl={webpageMeta?.url || ''}
        iframeSrc={iframeSrc}
        iframeSrcDoc={iframeSrcDoc}
        viewerText={viewerText}
        activeDocumentKey={activeDocumentKey}
        highlightedLineRange={highlightedLineRange}
        markdownWordWrap={markdownWordWrap}
        markdownTextHighlight={markdownTextHighlight}
        uiPanelTextFontClass={uiPanelTextFontClass}
        uiPanelMonospaceTextClass={uiPanelMonospaceTextClass}
        webpageLayoutWireframeAscii={webpageLayoutWireframeAscii || ''}
        geoDatasetIntegration={geoDatasetIntegration}
        presentationApiRef={presentationApiRef}
        showInViewer={showInViewer}
        revealLineInEditor={(line: number) => revealLineInEditor(line)}
        showInPresentation={showInPresentation}
        showInGallery={showInGallery}
        onSurfaceRef={handleMarkdownViewerRootRef}
      />
    </React.Suspense>
  )

  return (
    <MarkdownWorkspaceLayout
      toolbarProps={{
        explorerOpen,
        setExplorerOpen,
        canvasOpen: workspaceCanvasPaneOpen,
        setCanvasOpen: setWorkspaceCanvasPaneOpen,
        layoutMode,
        setLayoutMode,
        markdownWordWrap,
        setMarkdownWordWrap,
        markdownTextHighlight,
        setMarkdownTextHighlight,
        documentVersionGraphOpen,
        setDocumentVersionGraphOpen,
        viewerKind,
        viewerMode,
        setViewerMode: handleSetViewerMode,
        splitPaneVisibility,
        setSplitPaneVisibility,
        paneAvailability,
        onSaveAs,
        onExportWorkspaceFile: handleExportWorkspaceFile,
        onExportMarkdown: handleExportMarkdown,
        onExportHtmlViewer: handleExportHtmlViewer,
        onExportHtmlCanvas: handleExportHtmlCanvas,
        onExportJson: handleExportJson,
        onExportSvg: handleExportSvg,
        onToggleFullscreen,
        presentationApiRef,
        webpageSignalSummary,
        webpageWorkspaceMeta, onWebpageChangeView, onWebpageUpdateMeta, contentFormat, onContentFormatChange,
        forceMarkdownEditorInEditorMode,
      }}
      layoutMode={layoutMode}
      documentNotice={documentNotice}
      renderMarkdownEditor={renderMarkdownEditorPane}
      renderJsonEditor={renderJsonEditorPane}
      binaryPane={binaryPane}
      binaryPaneVisible={binaryPaneVisible}
      splitPaneVisibility={splitPaneVisibility}
      paneAvailability={paneAvailability}
      forceMarkdownEditorInEditorMode={forceMarkdownEditorInEditorMode}
      viewer={viewer}
      htmlViewer={htmlPaneVisible ? htmlViewer : null}
      presentation={presentation}
    />
  )
})
