import React from 'react'
import { replaceMarkdownLineRange } from 'grph-shared/markdown/lineEditing'
import { commitRichMediaInlineEditVersion } from '@/features/history/richMediaInlineEditHistory'
import { RICH_MEDIA_OUTPUT_DRAFT_VERSION_ID } from '@/lib/render/richMediaOutputVersions'
import {
  UI_VIEW_EDIT_SURFACE_DATA_ATTRIBUTES,
  UI_VIEW_EDIT_SURFACE_VIEWER_CLASS_NAME,
} from '@/lib/ui/surfaceClasses'
import { useGraphStore } from '@/hooks/useGraphStore'
import { requestPropsPanelOpen } from '@/features/toolbar/floatingPanelBridge'
import { isCanonicalNodeIdEqual } from '@/lib/graph/canonicalNodeIds'
import {
  beginTextSelectionWidgetLinkSession,
  readTextSelectionWidgetSourceHighlights,
} from '@/lib/storyboardWidget/textSelectionWidgetLink'
import { TextSelectionWidgetLinkContext } from '@/lib/storyboardWidget/textSelectionWidgetLinkContext'
import {
  subscribeStoryboardCardProvenanceFocus,
  type StoryboardCardProvenanceFocus,
} from '@/lib/storyboardWidget/storyboardCardProvenanceFocus'
import { revealTextSelectionProvenanceMatch } from '@/lib/ui/textSelectionProvenanceHighlights'
import type { RichMediaPanelProps } from './RichMediaPanel.types'
import type { RichMediaPanelModel } from './useRichMediaPanelModel'
import { RichMediaPanelSelectionProvenanceConnector } from './RichMediaPanelSelectionProvenanceConnector'

const MarkdownWorkspaceViewerSurface = React.lazy(() =>
  import('@/features/markdown-workspace/main/viewer/MarkdownWorkspaceViewerSurface')
    .then(module => ({ default: module.MarkdownWorkspaceViewerSurface })),
)

const RICH_MEDIA_WORKSPACE_VIEWER_DATA_ATTRIBUTES = {
  'data-kg-rich-media-workspace-viewer': '1',
  'data-kg-canvas-pointer-ignore': 'true',
  'data-kg-canvas-wheel-ignore': 'true',
  'data-kg-media-scroll-surface': '1',
} as const

export function RichMediaPanelWorkspaceViewerSurface(args: {
  model: RichMediaPanelModel
  props: RichMediaPanelProps
}) {
  const { model, props } = args
  const [viewerDraftText, setViewerDraftText] = React.useState<string | null>(null)
  const [provenanceFocus, setProvenanceFocus] = React.useState<StoryboardCardProvenanceFocus | null>(null)
  const pendingCommittedTextRef = React.useRef<string | null>(null)
  const viewerShellRef = React.useRef<HTMLElement | null>(null)
  const graphData = useGraphStore(state => state.graphData)
  const viewerText = viewerDraftText ?? model.panelDisplayText
  const provenanceSelections = React.useMemo(() => (
    readTextSelectionWidgetSourceHighlights({
      graphData,
      sourceNodeId: props.overlayId,
    }).filter(selection => (
      !selection.documentPath
      || !model.panelMarkdownDocumentPath
      || selection.documentPath === model.panelMarkdownDocumentPath
    ))
  ), [graphData, model.panelMarkdownDocumentPath, props.overlayId])
  const visibleProvenanceSelections = React.useMemo(() => {
    if (!provenanceFocus) return provenanceSelections
    const focused = provenanceSelections.filter(selection => selection.edgeId === provenanceFocus.edgeId)
    if (focused.length > 0) return focused
    return [{
      edgeId: provenanceFocus.edgeId,
      sourceNodeId: provenanceFocus.sourceNodeId,
      sourcePortKey: 'output',
      targetPortKey: 'input',
      targetNodeId: '',
      targetFieldId: 'prompt' as const,
      selectedText: provenanceFocus.selectedText,
      documentPath: provenanceFocus.documentPath,
      startLine: provenanceFocus.startLine,
      endLine: provenanceFocus.endLine,
      createdAt: '',
    }]
  }, [provenanceFocus, provenanceSelections])
  const provenanceConnectorInputs = React.useMemo(() => (
    visibleProvenanceSelections.map(selection => ({
      edgeId: selection.edgeId,
      sourceNodeId: selection.sourceNodeId,
      sourcePortKey: selection.sourcePortKey,
      text: selection.selectedText,
      startLine: selection.startLine,
      endLine: selection.endLine,
    }))
  ), [visibleProvenanceSelections])
  const selectionWidgetLink = React.useMemo(() => {
    const sourceNodeId = String(props.overlayId || '').trim()
    if (!sourceNodeId) return null
    return {
      createLinkedWidget: (selection: {
        selectedText: string
        startLine: number
        endLine: number
      }) => {
        const session = beginTextSelectionWidgetLinkSession({
          sourceNodeId,
          selectedText: selection.selectedText,
          startLine: selection.startLine,
          endLine: selection.endLine,
          documentPath: model.panelMarkdownDocumentPath,
        })
        if (!session) return
        requestPropsPanelOpen()
        useGraphStore.getState().upsertUiToast({
          id: 'rich-media-selection-widget-link',
          kind: 'neutral',
          message: 'Choose a Widget to create and link to the selected text.',
          ttlMs: 4000,
        })
      },
    }
  }, [model.panelMarkdownDocumentPath, props.overlayId])

  React.useEffect(() => {
    const pendingCommittedText = pendingCommittedTextRef.current
    if (pendingCommittedText !== null && model.panelDisplayText !== pendingCommittedText) return
    pendingCommittedTextRef.current = null
    setViewerDraftText(null)
  }, [model.panelDisplayText])

  React.useEffect(() => {
    const sourceNodeId = String(props.overlayId || '').trim()
    if (!sourceNodeId) return
    return subscribeStoryboardCardProvenanceFocus(focus => {
      if (!isCanonicalNodeIdEqual(focus.sourceNodeId, sourceNodeId)) return
      setProvenanceFocus(focus)
    })
  }, [props.overlayId])

  React.useEffect(() => {
    if (!provenanceFocus) return
    const timer = window.setTimeout(() => setProvenanceFocus(null), 4000)
    return () => window.clearTimeout(timer)
  }, [provenanceFocus])

  React.useLayoutEffect(() => {
    if (!provenanceFocus) return
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        const root = viewerShellRef.current
        if (!root) return
        revealTextSelectionProvenanceMatch({
          root,
          selection: {
            edgeId: provenanceFocus.edgeId,
            text: provenanceFocus.selectedText,
            startLine: provenanceFocus.startLine,
            endLine: provenanceFocus.endLine,
          },
        })
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [provenanceFocus])

  const viewerDataAttributes = React.useMemo(() => ({
    ...RICH_MEDIA_WORKSPACE_VIEWER_DATA_ATTRIBUTES,
    'data-kg-provenance-focus-edge-id': provenanceFocus?.edgeId || undefined,
    'data-kg-provenance-focus-source-node-id': provenanceFocus?.sourceNodeId || undefined,
    'data-kg-provenance-focus-document-path': provenanceFocus?.documentPath || undefined,
    'data-kg-provenance-focus-start-line': provenanceFocus ? String(provenanceFocus.startLine) : undefined,
    'data-kg-provenance-focus-end-line': provenanceFocus ? String(provenanceFocus.endLine) : undefined,
    'data-kg-selection-provenance-count': visibleProvenanceSelections.length > 0
      ? String(visibleProvenanceSelections.length)
      : undefined,
  }), [provenanceFocus, visibleProvenanceSelections.length])

  const commitText = React.useCallback((nextText: string) => {
    if (!model.panelTextEditable) return
    commitRichMediaInlineEditVersion({
      currentText: model.panelDisplayText,
      nextText,
      commit: () => {
        model.setPanelDraftText(nextText)
        props.onPanelChange?.({
          activeTab: 'text',
          freezeConnectedOutput: true,
          text: nextText,
          ...((props.panel?.outputVersions?.length || 0) > 0
            ? { selectedOutputVersionId: RICH_MEDIA_OUTPUT_DRAFT_VERSION_ID }
            : {}),
        })
      },
    })
  }, [model, props])

  const handleReplaceLineRange = React.useCallback((change: {
    startLine: number
    endLine: number
    replacementLines: string[]
  }) => {
    const canonicalText = model.panelDisplayText
    const nextText = replaceMarkdownLineRange({
      markdownText: canonicalText,
      startLine: change.startLine,
      endLine: change.endLine,
      replacementLines: change.replacementLines,
    })
    if (nextText === canonicalText) return
    pendingCommittedTextRef.current = nextText
    setViewerDraftText(nextText)
    commitText(nextText)
  }, [commitText, model.panelDisplayText])

  return (
    <React.Suspense fallback={(
      <section
        aria-label="Loading Editor Workspace Viewer"
        className={UI_VIEW_EDIT_SURFACE_VIEWER_CLASS_NAME}
        {...UI_VIEW_EDIT_SURFACE_DATA_ATTRIBUTES}
        {...RICH_MEDIA_WORKSPACE_VIEWER_DATA_ATTRIBUTES}
      />
    )}>
      <TextSelectionWidgetLinkContext.Provider value={selectionWidgetLink}>
        <section
          ref={viewerShellRef}
          className="relative flex min-h-0 min-w-0 flex-1 overflow-visible"
          data-kg-selection-provenance-source-surface="1"
        >
          <MarkdownWorkspaceViewerSurface
            markdownText={viewerText}
            activeDocumentPath={model.panelMarkdownDocumentPath}
            highlightedLineRange={null}
            markdownWordWrap
            markdownTextHighlight={false}
            uiPanelTextFontClass="font-sans"
            uiPanelMonospaceTextClass="font-mono text-xs"
            markdownTokenStoreSync={false}
            markdownViewerWidthMode="wide"
            dataAttributes={viewerDataAttributes}
            onInlineEditStateChange={model.panelTextEditable ? active => {
              if (!active && pendingCommittedTextRef.current === null) setViewerDraftText(null)
            } : undefined}
            onInlineDraftTextChange={model.panelTextEditable ? (nextText, options) => {
              if (options?.reflectInViewer === false) return
              setViewerDraftText(nextText)
            } : undefined}
            onReplaceLineRange={model.panelTextEditable ? handleReplaceLineRange : undefined}
          />
          <RichMediaPanelSelectionProvenanceConnector
            rootRef={viewerShellRef}
            selections={provenanceConnectorInputs}
          />
        </section>
      </TextSelectionWidgetLinkContext.Provider>
    </React.Suspense>
  )
}
