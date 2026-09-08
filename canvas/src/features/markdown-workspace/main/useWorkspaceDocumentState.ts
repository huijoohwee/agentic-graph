import React from 'react'
import type { MonacoTextEditorHandle } from '@/features/monaco/MonacoTextEditor'
import type { usePanelTypography } from '@/lib/ui/panelTypography'
import type { parseGlbAssetDocument } from '@/lib/assets/glbAssetDocument'
import { splitMarkdownLines } from '@/lib/markdown'
import { replaceMarkdownLineRange } from 'grph-shared/markdown/lineEditing'
import { usePendingGltfJson } from './usePendingGltfJson'
import { MarkdownEditorPane } from './editor/MarkdownEditorPane'
import { isMarkdownWorkspaceDelimitedTextPath, type MarkdownWorkspaceMainProps, type MarkdownWorkspaceDocumentPanePreset, type MarkdownWorkspacePaneVisibility } from './types'
import type { MarkdownWorkspaceDerivedViewerKind, MarkdownWorkspaceDerivedViewerMode } from './viewer/MarkdownWorkspaceDerivedViewer'
import { buildMarkdownPipeTableFromRowsJsonArtifact } from './viewer/markdownWorkspaceDataViewCandidates'
import { tryBuildJsonMarkdownDocumentFromText } from '@/features/markdown/jsonToMarkdownDocument'
import { buildDelimitedTextJsonPreviewText } from '../workspaceImport/csvJsonConversion'
import { tryBuildWidgetBundleMarkdownFromJsonText } from '@/lib/graph/io/widgetBundle'
import { buildJsonMarkdownSourceSemanticKey, serializeJsonMarkdownDraftToSourceText } from './jsonMarkdownEditing'
import { readMarkdownSourceFidelityTextFromJsonText } from '@/features/markdown/jsonMarkdownSourceFidelity'
import { applyStructuredSourceDataViewReplacement, buildStructuredSourceDataViewProjection } from './viewer/sourceStructuredDataViewTable'
import { clearLocalEditorWorkspaceSurfaceSnapshot, publishLocalEditorWorkspaceSurfaceSnapshot } from '@/features/agent-ready/browserLocalSurfaceSnapshots'

type WorkspaceDocumentStateArgs = {
  props: MarkdownWorkspaceMainProps
  panelTypography: ReturnType<typeof usePanelTypography>
  modelAsset: ReturnType<typeof parseGlbAssetDocument>
  documentPanePreset: MarkdownWorkspaceDocumentPanePreset
  activeJsonSourcePreviewText: string | null
  viewerKind: MarkdownWorkspaceDerivedViewerKind
  viewerMode: MarkdownWorkspaceDerivedViewerMode
  markdownPaneVisible: boolean
  jsonPaneVisible: boolean
  viewerPaneVisible: boolean
  htmlPaneVisible: boolean
  binaryPaneVisible: boolean
  showWebpageHtml: boolean
  splitPaneVisibility: MarkdownWorkspacePaneVisibility
  workspaceViewMode: string
  workspaceCanvasPaneOpen: boolean
  workspaceEditorOverlayOpen: boolean
}


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

export function useWorkspaceDocumentState(args: WorkspaceDocumentStateArgs) {
  const { props, panelTypography, modelAsset, documentPanePreset, activeJsonSourcePreviewText,
    viewerKind, viewerMode, markdownPaneVisible, jsonPaneVisible, viewerPaneVisible, htmlPaneVisible,
    binaryPaneVisible, showWebpageHtml, splitPaneVisibility, workspaceViewMode,
    workspaceCanvasPaneOpen, workspaceEditorOverlayOpen } = args
  const { activeText, setActiveText, activeDocumentKey, editorUri, editorTextOverride, viewerTextOverride,
    isMarkdown, widgetModeActive = false, layoutMode, disableViewerMutations, disableEditorMutations,
    revealLineInEditor, onViewerInlineEditStateChange, markdownWordWrap, editorRef, onEditorCaretLine, themeMode } = props
  const [markdownEditorHandle, setMarkdownEditorHandle] = React.useState<MonacoTextEditorHandle | null>(null)
  const [jsonEditorHandle, setJsonEditorHandle] = React.useState<MonacoTextEditorHandle | null>(null)

  const viewerInlineEditActiveRef = React.useRef(false)

  const jsonMarkdownRoundTripRef = React.useRef<{ sourceKey: string; markdownText: string } | null>(null)
  const [viewerInlineMarkdownDraftText, setViewerInlineMarkdownDraftText] = React.useState<string | null>(null)
  const [viewerInlineViewerText, setViewerInlineViewerText] = React.useState<string | null>(null)

  const editorVariantUri = React.useCallback(
    (variant: 'markdown' | 'json') => {
      const base = String(editorUri || '').trim()
      if (!base) return `inmemory://workspace/${variant}`
      return `${base}#${variant}`
    },
    [editorUri],
  )

  const { pendingGltfJsonKey, pendingGltfJson } = usePendingGltfJson({ activeDocumentKey, jsonPaneVisible, modelAsset })
  const activeJsonSourceKey = React.useMemo(
    () => buildJsonMarkdownSourceSemanticKey({ activeDocumentKey, text: activeText }),
    [activeDocumentKey, activeText],
  )
  const sourceEditorTextRaw = typeof editorTextOverride === 'string' ? editorTextOverride : activeText

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
      React.createElement(MarkdownEditorPane, {
        value: typeof editorTextOverride === 'string' ? editorTextOverride : editableMarkdownText,
        onChange: disableEditorMutations ? () => void 0 : (next: string) => commitMarkdownEditText(next),
        wordWrap: markdownWordWrap,
        editorRef,
        onCaretLine: onEditorCaretLine,
        panelTypography,
        readOnly: disableEditorMutations || !isMarkdown,
        themeMode,
        language: 'markdown',
        uri: editorVariantUri('markdown'),
        onEditorHandle: setMarkdownEditorHandle,
        ariaLabel: 'Markdown Editor Text',
      })
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
      React.createElement(MarkdownEditorPane, {
        value: jsonEditorText,
        onChange: disableEditorMutations || isMarkdown || !!activePaneJsonPreviewText ? () => void 0 : (next: string) => setActiveText(next),
        wordWrap: markdownWordWrap,
        editorRef,
        onCaretLine: onEditorCaretLine,
        panelTypography,
        readOnly: disableEditorMutations || isMarkdown || !!modelAsset || !!activePaneJsonPreviewText,
        themeMode,
        language: 'json',
        uri: editorVariantUri('json'),
        onEditorHandle: setJsonEditorHandle,
        ariaLabel: 'JSON Editor Text',
        paneAriaLabel: 'JSON Editor Surface',
      })
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

  // Preserve Markdown projections for editing/export, but never reparse them as CSV.
  const structuredDataViewText = isMarkdownWorkspaceDelimitedTextPath(activeDocumentKey)
    ? activePaneJsonPreviewText
    : null
  const derivedViewerText = viewerMode === 'multiDimTable'
    ? (structuredDataViewText || sourceAttachedMarkdownTableText || activeJsonSourcePreviewText || viewerText)
    : viewerText
  return { markdownEditorHandle, jsonEditorHandle, renderMarkdownEditorPane, renderJsonEditorPane,
    sourceEditorTextRaw, isJsonMarkdownEditing, editableMarkdownText, markdownEditText, viewerText, derivedViewerText,
    handleInsertLineAfter, handleReorderLineBlock, handleReplaceLineRange,
    onInsertLineAfter, onReorderLineBlock, onReplaceLineRange, handleInlineEditStateChange, handleInlineDraftTextChange }
}
