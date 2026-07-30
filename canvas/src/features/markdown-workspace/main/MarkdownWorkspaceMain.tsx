import React from 'react'
import type { MarkdownWorkspaceLayoutMode } from '@/features/markdown-explorer/workspaceUi'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { HighlightedLineRange, MarkdownPresentationApi } from '../markdownWorkspaceTypes'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import { replaceMarkdownLineRange } from 'grph-shared/markdown/lineEditing'
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
import { usePendingGltfJson } from './usePendingGltfJson'
import { MarkdownEditorPane } from './editor/MarkdownEditorPane'
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
import { buildMarkdownPipeTableFromRowsJsonArtifact } from './viewer/markdownWorkspaceDataViewCandidates'
import { tryBuildJsonMarkdownDocumentFromText } from '@/features/markdown/jsonToMarkdownDocument'
import { useWorkspaceExportBridge } from './useWorkspaceExportBridge'
import { buildDelimitedTextJsonPreviewText } from '../workspaceImport/csvJsonConversion'
import { workspaceTablePreferencesStore } from '@/features/workspace-table/workspaceTablePreferencesStore'
import { tryBuildWidgetBundleMarkdownFromJsonText } from '@/lib/graph/io/widgetBundle'
import { isWorkspaceEditorOverlayOpen } from '@/features/workspace-table/workspaceTableSsot'
import { buildJsonMarkdownSourceSemanticKey, serializeJsonMarkdownDraftToSourceText } from './jsonMarkdownEditing'
import { readMarkdownSourceFidelityTextFromJsonText } from '@/features/markdown/jsonMarkdownSourceFidelity'
import { applyStructuredSourceDataViewReplacement, buildStructuredSourceDataViewProjection } from './viewer/sourceStructuredDataViewTable'
import {
  clearLocalEditorWorkspaceSurfaceSnapshot,
  publishLocalEditorWorkspaceSurfaceSnapshot,
} from '@/features/agent-ready/browserLocalSurfaceSnapshots'
const MarkdownWorkspacePresentationSurfaceLazy = React.lazy(
  async (): Promise<{ default: typeof import('./presentation/MarkdownWorkspacePresentationSurface')['MarkdownWorkspacePresentationSurface'] }> =>
    import('./presentation/MarkdownWorkspacePresentationSurface').then(mod => ({ default: mod.MarkdownWorkspacePresentationSurface })),
)

function sanitizeInvalidDataUrls(raw: string): string {
  const s = String(raw || '')
  if (!s.includes('data:image/') || !s.includes('<omitted>')) return s
  return s.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,<omitted>/g, 'data:,')
}

function decodeBase64DataUrlToText(dataUrl: string): string {
  const comma = String(dataUrl || '').indexOf(',')
  if (comma < 0) return ''
  const encoded = String(dataUrl || '').slice(comma + 1).replace(/\s+/g, '')
  if (!encoded) return ''
  try {
    const binary = atob(encoded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder().decode(bytes)
  } catch {
    return ''
  }
}

function prettyJsonOrRaw(text: string): string {
  const raw = String(text || '')
  if (!raw.trim()) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export const MarkdownWorkspaceMain = React.memo(function MarkdownWorkspaceMain(props: MarkdownWorkspaceMainProps) {
  const panelTypography = usePanelTypography()
  const [markdownEditorHandle, setMarkdownEditorHandle] = React.useState<MonacoTextEditorHandle | null>(null)
  const [jsonEditorHandle, setJsonEditorHandle] = React.useState<MonacoTextEditorHandle | null>(null)
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
  const viewerInlineEditActiveRef = React.useRef(false)

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
  const jsonMarkdownRoundTripRef = React.useRef<{ sourceKey: string; markdownText: string } | null>(null)
  const [viewerInlineMarkdownDraftText, setViewerInlineMarkdownDraftText] = React.useState<string | null>(null)
  const [viewerInlineViewerText, setViewerInlineViewerText] = React.useState<string | null>(null)
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

  const editorVariantUri = React.useCallback(
    (variant: 'markdown' | 'json') => {
      const base = String(editorUri || '').trim()
      if (!base) return `inmemory://workspace/${variant}`
      return `${base}#${variant}`
    },
    [editorUri],
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
  const { pendingGltfJsonKey, pendingGltfJson } = usePendingGltfJson({ activeDocumentKey, jsonPaneVisible, modelAsset })
  const activeJsonSourceKey = React.useMemo(
    () => buildJsonMarkdownSourceSemanticKey({ activeDocumentKey, text: activeText }),
    [activeDocumentKey, activeText],
  )
  const sourceEditorTextRaw = typeof editorTextOverride === 'string' ? editorTextOverride : activeText
  const activeJsonSourcePreviewText = hasJsonSourcePreviewText && typeof jsonSourceText === 'string' ? jsonSourceText : null
  const needsDelimitedPaneJsonPreviewText =
    documentPanePreset === 'viewer'
    && !activeJsonSourcePreviewText
    && isMarkdownWorkspaceDelimitedTextPath(activeDocumentKey)
    && (jsonPaneVisible || markdownPaneVisible)
  const delimitedPaneJsonPreviewText = React.useMemo(() => {
    if (!needsDelimitedPaneJsonPreviewText) return null
    const sourceText = String(sourceEditorTextRaw || '')
    if (!sourceText.trim()) return null
    return buildDelimitedTextJsonPreviewText({
      sourcePath: activeDocumentKey,
      sourceText,
    })
  }, [activeDocumentKey, needsDelimitedPaneJsonPreviewText, sourceEditorTextRaw])
  const activePaneJsonPreviewText = activeJsonSourcePreviewText || delimitedPaneJsonPreviewText

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

  const jsonDerivedMarkdownBase = React.useMemo(() => {
    if (isMarkdown) return null
    if (!markdownPaneVisible && !viewerPaneVisible) return null
    const cachedRoundTrip = jsonMarkdownRoundTripRef.current
    if (cachedRoundTrip && cachedRoundTrip.sourceKey === activeJsonSourceKey) {
      return cachedRoundTrip.markdownText
    }
    const text = String(activeText || '').trim()
    if (!text || (!text.startsWith('{') && !text.startsWith('['))) return null
    const markdownSourceText = readMarkdownSourceFidelityTextFromJsonText(text)
    if (markdownSourceText !== null) return markdownSourceText
    if (widgetModeActive) {
      const widgetBundleMarkdown = tryBuildWidgetBundleMarkdownFromJsonText(text)
      if (widgetBundleMarkdown) return widgetBundleMarkdown
    }
    return tryBuildJsonMarkdownDocumentFromText(text, 'table', { documentName: activeDocumentKey || 'workspace.json' })?.markdown || null
  }, [activeDocumentKey, activeJsonSourceKey, activeText, isMarkdown, markdownPaneVisible, viewerPaneVisible, widgetModeActive])

  const needsMarkdownViewerText = !showWebpageHtml || markdownPaneVisible || viewerPaneVisible
  const needsSourceAttachedMarkdownTableText = documentPanePreset === 'viewer' && (markdownPaneVisible || viewerPaneVisible), needsJsonSourceAttachedMarkdownTableText = needsSourceAttachedMarkdownTableText && !!activePaneJsonPreviewText
  const structuredSourceDataViewProjection = React.useMemo(() => (needsSourceAttachedMarkdownTableText && isMarkdown ? buildStructuredSourceDataViewProjection(activeText) : null), [activeText, isMarkdown, needsSourceAttachedMarkdownTableText])
  const sourceAttachedMarkdownTableKey = React.useMemo(() => (
    needsJsonSourceAttachedMarkdownTableText && activePaneJsonPreviewText && !structuredSourceDataViewProjection
      ? buildJsonMarkdownSourceSemanticKey({ activeDocumentKey, text: activePaneJsonPreviewText })
      : ''
  ), [activeDocumentKey, activePaneJsonPreviewText, needsJsonSourceAttachedMarkdownTableText, structuredSourceDataViewProjection])
  const sourceAttachedMarkdownTableText = React.useMemo(() => (
    structuredSourceDataViewProjection?.markdownText || (sourceAttachedMarkdownTableKey && activePaneJsonPreviewText ? buildMarkdownPipeTableFromRowsJsonArtifact(activePaneJsonPreviewText, sourceAttachedMarkdownTableKey) : null)
  ), [activePaneJsonPreviewText, sourceAttachedMarkdownTableKey, structuredSourceDataViewProjection])
  const isSourceAttachedMarkdownTable = !!sourceAttachedMarkdownTableText
  const isStructuredSourceAttachedMarkdownTable = !!structuredSourceDataViewProjection?.markdownText

  const isJsonMarkdownEditing = !isMarkdown && viewerKind === 'markdown' && !!jsonDerivedMarkdownBase
  const [jsonDerivedMarkdownDraft, setJsonDerivedMarkdownDraft] = React.useState<string | null>(null)
  const jsonDerivedMarkdownSeedRef = React.useRef<string>('')
  const editableMarkdownText = viewerInlineMarkdownDraftText ?? (
    isJsonMarkdownEditing
      ? (jsonDerivedMarkdownDraft ?? jsonDerivedMarkdownBase ?? '')
      : sourceAttachedMarkdownTableText ?? activeText
  )
  const viewerInlineDraftDocumentKeyRef = React.useRef(activeDocumentKey)
  React.useEffect(() => {
    if (viewerInlineDraftDocumentKeyRef.current === activeDocumentKey) return
    viewerInlineDraftDocumentKeyRef.current = activeDocumentKey
    if (viewerInlineMarkdownDraftText !== null) setViewerInlineMarkdownDraftText(null)
    if (viewerInlineViewerText !== null) setViewerInlineViewerText(null)
  }, [activeDocumentKey, viewerInlineMarkdownDraftText, viewerInlineViewerText])
  React.useEffect(() => {
    if (!isJsonMarkdownEditing || !jsonDerivedMarkdownBase) {
      if (jsonDerivedMarkdownSeedRef.current) jsonDerivedMarkdownSeedRef.current = ''
      if (jsonDerivedMarkdownDraft !== null) setJsonDerivedMarkdownDraft(null)
      return
    }
    const seed = `${activeDocumentKey}::${jsonDerivedMarkdownBase}`
    if (jsonDerivedMarkdownSeedRef.current === seed) return
    jsonDerivedMarkdownSeedRef.current = seed
    if (jsonDerivedMarkdownDraft !== jsonDerivedMarkdownBase) setJsonDerivedMarkdownDraft(jsonDerivedMarkdownBase)
  }, [activeDocumentKey, isJsonMarkdownEditing, jsonDerivedMarkdownBase, jsonDerivedMarkdownDraft])
  const persistedEditableMarkdownText = isJsonMarkdownEditing
    ? (jsonDerivedMarkdownDraft ?? jsonDerivedMarkdownBase ?? '')
    : sourceAttachedMarkdownTableText
      ? sourceAttachedMarkdownTableText
    : activeText
  const markdownEditText = isJsonMarkdownEditing || isSourceAttachedMarkdownTable ? editableMarkdownText : null

  React.useEffect(() => {
    publishLocalEditorWorkspaceSurfaceSnapshot({
      activeDocumentKey: String(activeDocumentKey || ''),
      workspaceViewMode: String(workspaceViewMode || ''),
      workspaceCanvasPaneOpen: workspaceCanvasPaneOpen === true,
      workspaceEditorOverlayOpen,
      layoutMode: String(layoutMode || ''),
      viewerKind: String(viewerKind || ''),
      viewerMode: String(viewerMode || ''),
      isMarkdown,
      isJsonMarkdownEditing,
      paneVisibility: {
        markdown: markdownPaneVisible,
        json: jsonPaneVisible,
        viewer: viewerPaneVisible,
        html: htmlPaneVisible,
        binary: binaryPaneVisible,
      },
      splitPaneVisibility: {
        markdown: splitPaneVisibility.markdown === true,
        json: splitPaneVisibility.json === true,
        viewer: splitPaneVisibility.viewer === true,
        html: splitPaneVisibility.html === true,
        bin: binaryPaneVisible,
      },
      liveMarkdownText: String(editableMarkdownText || ''),
      persistedMarkdownText: String(persistedEditableMarkdownText || ''),
      hasUncommittedDraft:
        viewerInlineMarkdownDraftText != null
        || String(editableMarkdownText || '') !== String(persistedEditableMarkdownText || ''),
      liveDraftSource:
        viewerInlineMarkdownDraftText != null
          ? 'viewer-inline'
          : isJsonMarkdownEditing && String(editableMarkdownText || '') !== String(persistedEditableMarkdownText || '')
            ? 'json-derived'
            : 'persisted',
    })
    return () => {
      clearLocalEditorWorkspaceSurfaceSnapshot()
    }
  }, [
    activeDocumentKey,
    binaryPaneVisible,
    editableMarkdownText,
    htmlPaneVisible,
    isJsonMarkdownEditing,
    isMarkdown,
    jsonPaneVisible,
    layoutMode,
    markdownPaneVisible,
    persistedEditableMarkdownText,
    splitPaneVisibility.html,
    splitPaneVisibility.json,
    splitPaneVisibility.markdown,
    splitPaneVisibility.viewer,
    viewerInlineMarkdownDraftText,
    viewerKind,
    viewerMode,
    viewerPaneVisible,
    workspaceCanvasPaneOpen,
    workspaceEditorOverlayOpen,
    workspaceViewMode,
  ])

  const commitMarkdownEditText = React.useCallback(
    (nextText: string) => {
      if (isSourceAttachedMarkdownTable) {
        setViewerInlineMarkdownDraftText(null); setViewerInlineViewerText(null)
        if (isStructuredSourceAttachedMarkdownTable) {
          // Structured source tables are derived projections, so raw source writes
          // must round-trip through line/block replacements instead of committing the
          // projection text verbatim back into the Markdown document.
          return
        }
        const nextSourceText = serializeJsonMarkdownDraftToSourceText({ activeDocumentKey, editorUri, markdownText: String(nextText || '') })
        jsonMarkdownRoundTripRef.current = { sourceKey: buildJsonMarkdownSourceSemanticKey({ activeDocumentKey, text: nextSourceText }), markdownText: String(nextText || '') }
        if (nextSourceText !== activeText) setActiveText(nextSourceText); return
      }
      if (!isJsonMarkdownEditing) {
        setViewerInlineMarkdownDraftText(null)
        setViewerInlineViewerText(null)
        setActiveText(nextText)
        return
      }
      setViewerInlineMarkdownDraftText(null)
      setViewerInlineViewerText(null)
      const nextMarkdownText = String(nextText || '')
      setJsonDerivedMarkdownDraft(prev => (prev === nextMarkdownText ? prev : nextMarkdownText))
      const nextJsonText = serializeJsonMarkdownDraftToSourceText({
        activeDocumentKey,
        editorUri,
        markdownText: nextMarkdownText,
      })
      jsonMarkdownRoundTripRef.current = {
        sourceKey: buildJsonMarkdownSourceSemanticKey({ activeDocumentKey, text: nextJsonText }),
        markdownText: nextMarkdownText,
      }
      if (nextJsonText !== activeText) {
        setActiveText(nextJsonText)
      }
    },
    [activeDocumentKey, activeText, editorUri, isJsonMarkdownEditing, isSourceAttachedMarkdownTable, isStructuredSourceAttachedMarkdownTable, setActiveText],
  )
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
  const deferredSourceEditorTextRaw = React.useDeferredValue(sourceEditorTextRaw)
  const deferredEditableMarkdownText = React.useDeferredValue(editableMarkdownText)
  const jsonEditorText = React.useMemo(() => {
    if (!jsonPaneVisible) return ''
    if (activePaneJsonPreviewText) return prettyJsonOrRaw(activePaneJsonPreviewText)
    if (modelAsset?.format === 'gltf') {
      if (modelAsset.dataUrl) return prettyJsonOrRaw(decodeBase64DataUrlToText(modelAsset.dataUrl))
      if (pendingGltfJson.key === pendingGltfJsonKey && pendingGltfJson.status === 'ready' && pendingGltfJson.text) {
        return prettyJsonOrRaw(pendingGltfJson.text)
      }
      return JSON.stringify({
        kgAssetType: 'model',
        kgAssetFormat: 'gltf',
        kgAssetName: modelAsset.name,
        kgAssetPendingLocalImport: modelAsset.pendingLocalImport === true,
        kgAssetPendingLocalPath: modelAsset.pendingLocalImportPath || undefined,
        kgAssetBytes: modelAsset.byteLength,
        kgAssetJsonStatus: pendingGltfJson.key === pendingGltfJsonKey ? pendingGltfJson.status : 'pending',
      }, null, 2)
    }
    if (modelAsset?.format === 'glb') return ''
    if (isMarkdown || isJsonMarkdownEditing) {
      const sourceText = String(deferredEditableMarkdownText || '')
      if (!sourceText.trim()) return ''
      try {
        return serializeJsonMarkdownDraftToSourceText({
          activeDocumentKey,
          editorUri,
          markdownText: sourceText,
        })
      } catch {
        return '{}'
      }
    }
    const text = String(deferredSourceEditorTextRaw || '')
    try {
      return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      return text
    }
  }, [activeDocumentKey, activePaneJsonPreviewText, deferredEditableMarkdownText, deferredSourceEditorTextRaw, editorUri, isJsonMarkdownEditing, isMarkdown, jsonPaneVisible, modelAsset, pendingGltfJson, pendingGltfJsonKey])

  const sourceViewerTextRaw = typeof viewerTextOverride === 'string' ? viewerTextOverride : activeText
  const viewerTextRaw = needsMarkdownViewerText ? (viewerInlineViewerText ?? markdownEditText ?? sourceViewerTextRaw) : ''
  const viewerText = React.useMemo(
    () => {
      if (!needsMarkdownViewerText) return ''
      if (viewerKind === 'json') return sourceViewerTextRaw
      return sanitizeInvalidDataUrls(viewerTextRaw)
    },
    [needsMarkdownViewerText, sourceViewerTextRaw, viewerKind, viewerTextRaw],
  )

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

  const handleInsertLineAfter = React.useCallback(
    (afterLine: number) => {
      if (disableViewerMutations) return
      const line = Math.max(1, Math.floor(afterLine))
      const lines = splitMarkdownLines(editableMarkdownText)
      const idx = Math.min(lines.length, line)
      const next = [...lines.slice(0, idx), '', ...lines.slice(idx)].join('\n')
      commitMarkdownEditText(next)
      if (layoutMode === 'viewer') return
      try {
        revealLineInEditor(line + 1)
      } catch {
        void 0
      }
    },
    [commitMarkdownEditText, disableViewerMutations, editableMarkdownText, layoutMode, revealLineInEditor],
  )

  const handleReorderLineBlock = React.useCallback(
    (
      source: { startLine: number; endLine: number },
      target: { startLine: number; endLine: number },
      position: 'before' | 'after',
    ) => {
      if (disableViewerMutations) return
      const srcStart = Math.max(1, Math.floor(source.startLine))
      const srcEnd = Math.max(srcStart, Math.floor(source.endLine))
      const tgtStart = Math.max(1, Math.floor(target.startLine))
      const tgtEnd = Math.max(tgtStart, Math.floor(target.endLine))
      if (srcStart === tgtStart && srcEnd === tgtEnd) return

      const lines = splitMarkdownLines(editableMarkdownText)
      if (srcStart > lines.length) return

      const safeSrcEnd = Math.min(lines.length, srcEnd)
      const srcChunk = lines.slice(srcStart - 1, safeSrcEnd)
      const rest = [...lines.slice(0, srcStart - 1), ...lines.slice(safeSrcEnd)]

      const insertionLine = position === 'before' ? tgtStart : tgtEnd + 1
      const insertionIndex = Math.max(0, Math.min(rest.length, insertionLine - 1))

      const next = [...rest.slice(0, insertionIndex), ...srcChunk, ...rest.slice(insertionIndex)].join('\n')
      commitMarkdownEditText(next)
    },
    [commitMarkdownEditText, disableViewerMutations, editableMarkdownText],
  )

  const handleReplaceLineRange = React.useCallback(
    (args: { startLine: number; endLine: number; replacementLines: string[] }) => {
      if (disableViewerMutations) return
      const startLine = Math.max(1, Math.floor(args.startLine || 1))
      const endLine = Math.max(startLine, Math.floor(args.endLine || startLine))
      const replacementLines = Array.isArray(args.replacementLines) ? args.replacementLines : []
      const structuredNext = applyStructuredSourceDataViewReplacement({ sourceText: activeText, projection: structuredSourceDataViewProjection, startLine, endLine, replacementLines })
      if (structuredNext != null) { if (structuredNext !== activeText) commitMarkdownEditText(structuredNext); return }
      if (isStructuredSourceAttachedMarkdownTable) return
      const next = replaceMarkdownLineRange({
        markdownText: persistedEditableMarkdownText,
        startLine,
        endLine,
        replacementLines,
      })
      if (next === persistedEditableMarkdownText) return
      commitMarkdownEditText(next)
      if (layoutMode === 'viewer') return
      if (viewerInlineEditActiveRef.current) return
      try {
        revealLineInEditor(startLine)
      } catch {
        void 0
      }
    },
    [activeText, commitMarkdownEditText, disableViewerMutations, isStructuredSourceAttachedMarkdownTable, layoutMode, persistedEditableMarkdownText, revealLineInEditor, structuredSourceDataViewProjection],
  )
  const onInsertLineAfter = disableViewerMutations ? undefined : handleInsertLineAfter
  const onReorderLineBlock = disableViewerMutations ? undefined : handleReorderLineBlock
  const onReplaceLineRange = disableViewerMutations ? undefined : handleReplaceLineRange
  const handleInlineEditStateChange = React.useCallback((active: boolean) => {
    if (!active) {
      setViewerInlineMarkdownDraftText(null)
      setViewerInlineViewerText(null)
    }
    if (viewerInlineEditActiveRef.current === active) return
    viewerInlineEditActiveRef.current = active
    onViewerInlineEditStateChange?.(active)
  }, [onViewerInlineEditStateChange])
  const handleInlineDraftTextChange = React.useCallback((nextText: string, options?: { reflectInViewer?: boolean }) => {
    setViewerInlineMarkdownDraftText(prev => (prev === nextText ? prev : nextText))
    if (options?.reflectInViewer === false) return
    setViewerInlineViewerText(prev => (prev === nextText ? prev : nextText))
  }, [])
  const renderMarkdownEditorPane = React.useCallback(
    () => markdownPaneVisible ? (
      <MarkdownEditorPane
        value={typeof editorTextOverride === 'string' ? editorTextOverride : editableMarkdownText}
        onChange={
          disableEditorMutations
            ? () => void 0
            : (next: string) => commitMarkdownEditText(next)
        }
        wordWrap={markdownWordWrap}
        editorRef={editorRef}
        onCaretLine={onEditorCaretLine}
        panelTypography={panelTypography}
        readOnly={disableEditorMutations || !isMarkdown}
        themeMode={themeMode}
        language="markdown"
        uri={editorVariantUri('markdown')}
        onEditorHandle={setMarkdownEditorHandle}
        ariaLabel="Markdown Editor Text"
      />
    ) : null,
    [
      activeText,
      commitMarkdownEditText,
      disableEditorMutations,
      editableMarkdownText,
      editorRef,
      editorTextOverride,
      editorVariantUri,
      isJsonMarkdownEditing,
      isMarkdown,
      markdownEditText,
      markdownPaneVisible,
      markdownWordWrap,
      onEditorCaretLine,
      panelTypography,
      themeMode,
    ],
  )
  const renderJsonEditorPane = React.useCallback(
    () => jsonPaneVisible ? (
      <MarkdownEditorPane
        value={jsonEditorText}
        onChange={
          disableEditorMutations || isMarkdown || !!activePaneJsonPreviewText
            ? () => void 0
            : (next: string) => {
                setActiveText(next)
              }
        }
        wordWrap={markdownWordWrap}
        editorRef={editorRef}
        onCaretLine={onEditorCaretLine}
        panelTypography={panelTypography}
        readOnly={disableEditorMutations || isMarkdown || !!modelAsset || !!activePaneJsonPreviewText}
        themeMode={themeMode}
        language="json"
        uri={editorVariantUri('json')}
        onEditorHandle={setJsonEditorHandle}
        ariaLabel="JSON Editor Text" paneAriaLabel="JSON Editor Surface"
      />
    ) : null,
    [
      disableEditorMutations,
      editorRef,
      editorVariantUri,
      activePaneJsonPreviewText,
      isMarkdown,
      jsonEditorText,
      jsonPaneVisible,
      markdownWordWrap,
      onEditorCaretLine,
      panelTypography,
      setActiveText,
      themeMode,
      modelAsset,
    ],
  )

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
  const derivedViewerText = viewerMode === 'multiDimTable' ? (sourceAttachedMarkdownTableText || activeJsonSourcePreviewText || viewerText) : viewerText

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
