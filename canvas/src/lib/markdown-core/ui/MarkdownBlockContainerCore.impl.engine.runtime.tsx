import React from 'react'
import { areReplacementLinesNoop } from '@/features/markdown/ui/markdownEditParitySsot'
import { captureInlineSelectionForToolbarAction } from '@/lib/markdown-core/ui/markdownInlineSelectionToolbarInteractions'
import { applyAppendixCommentToSelection, readAppendixAuthoringPromptConfig } from '@/lib/markdown/markdownAppendixComment'
import { parseMarkdownCommentMarker } from '@/lib/markdown/markdownCommentMarker'
import { promptForText } from '@/features/toolbar/ingestUtils'
import { resolveTurnIntoFormatAction } from './markdownBlockContainerCore.toolbar'
import { useMarkdownBlockContainerEdgeTrim } from './markdownBlockContainerCore.edgeTrim'
import { useMarkdownBlockContainerVariableActions } from './markdownBlockContainerCore.variableActions'
import { useMarkdownBlockContainerHtmlFormatting } from './markdownBlockContainerCore.htmlFormatting'
import { useMarkdownBlockContainerMarkdownFormatting } from './markdownBlockContainerCore.markdownFormatting'
import { useMarkdownBlockContainerEditOpenCaretProbe } from './markdownBlockContainerCore.editOpenCaretProbe'
import { useMarkdownBlockContainerSelectionToolbarSync } from './markdownBlockContainerCore.selectionToolbarSync'
import { useMarkdownBlockContainerEditInitialization } from './markdownBlockContainerCore.editInitialization'
import { MarkdownBlockContainerEditSurfaceView } from './markdownBlockContainerCore.editSurfaceView'
import { useMarkdownBlockContainerDraftCommit } from './markdownBlockContainerCore.draftCommit'
import { useMarkdownBlockContainerRuntimeProbe } from './markdownBlockContainerCore.runtimeProbe'
import { useMarkdownBlockContainerInlineUiState } from './markdownBlockContainerCore.inlineUiState'
import { useMarkdownBlockContainerSelectionState } from './markdownBlockContainerCore.selectionState'
import { useMarkdownBlockContainerHostEditing } from './markdownBlockContainerCore.hostEditing'
import { registerActiveMarkdownBlockEditor } from './markdownBlockContainerCore.activeEditor'
import {
  cancelMarkdownBlockInlineEditStateSync,
  scheduleMarkdownBlockInlineEditStateSync,
  toMarkdownBlockInlineEditRangeToken,
  toMarkdownBlockInlineEditStateTaskKey,
} from './markdownBlockContainerCore.stateSync'
import { useMarkdownInlineSelectionActions } from './markdownInlineSelectionActions'
import { useTextSelectionWidgetLinkAction } from '@/lib/storyboardWidget/textSelectionWidgetLinkContext'
const MARKDOWN_EDIT_TYPOGRAPHY_SOURCE_SELECTOR =
  'h1,h2,h3,h4,h5,h6,p,li,blockquote,section,aside,div,span'
type MarkdownBlockContainerProps = {
  as: React.ElementType
  className?: string
  highlightClass: string
  highlightStyle?: React.CSSProperties
  startLine: number
  endLine?: number
  editLineRange?: { startLine: number; endLine: number }
  resolveEditLineRangeOnOpen?: (eventTarget: HTMLElement | null) => { startLine: number; endLine: number } | null
  resolveEditMinHeightOnOpen?: (eventTarget: HTMLElement | null, currentTarget: HTMLElement) => number | null
  id?: string
  defaultOpen?: boolean
  open?: boolean
  children: React.ReactNode
  inlineEditable?: boolean
  sourceLines?: string[]
  onReplaceLineRange?: (args: { startLine: number; endLine: number; replacementLines: string[] }) => void
  editorClassName?: string
  editStripLinePrefix?: (line: string) => { prefix: string; content: string }
  editStripLinePrefixSpacingSanitize?: boolean
  editDefaultLinePrefix?: string
  editKeepLinePrefixesInEditor?: boolean
  editTrimEmptyBlockEdges?: boolean
  editEnforceSingleListRoot?: boolean
  editTrimEdgeNewlines?: boolean
  editListMode?: 'ordered' | 'unordered'
  editPresentation?: 'markdown' | 'html'
  editHtmlRender?: 'inline' | 'block'
  editHtmlDisableDefaultBlockFlow?: boolean
  editSigilRenderMode?: 'styled' | 'plain'
  editLeftRailClassName?: string
  forbidCopy?: boolean
  onInlineEditStateChange?: (active: boolean) => void
  onInlineDraftTextChange?: (nextText: string, options?: { reflectInViewer?: boolean }) => void
  editDisableRichUi?: boolean
  editStaticChildren?: React.ReactNode
  editStaticChildrenMode?: 'flow' | 'overlay' | 'passthrough'
  editTypographyMode?: 'inherit' | 'none'
  editPreserveWhitespace?: boolean
  editPreserveBlockHeight?: boolean
  editInlineFlow?: boolean
  editCaptureLayoutSpacing?: boolean
}
export const MarkdownBlockContainer = React.forwardRef<HTMLElement, MarkdownBlockContainerProps & React.HTMLAttributes<HTMLElement>>(({
  as: Tag,
  className,
  highlightClass,
  highlightStyle,
  startLine,
  endLine,
  editLineRange,
  resolveEditLineRangeOnOpen,
  resolveEditMinHeightOnOpen,
  id,
  children,
  inlineEditable = false,
  sourceLines,
  onReplaceLineRange,
  editorClassName,
  editStripLinePrefix,
  editStripLinePrefixSpacingSanitize = true,
  editDefaultLinePrefix,
  editKeepLinePrefixesInEditor = false,
  editTrimEmptyBlockEdges = false,
  editEnforceSingleListRoot = false,
  editTrimEdgeNewlines = false,
  editListMode,
  editPresentation = 'markdown',
  editHtmlRender = 'inline',
  editHtmlDisableDefaultBlockFlow = false,
  editSigilRenderMode = 'styled',
  editLeftRailClassName,
  forbidCopy = false,
  onInlineEditStateChange,
  onInlineDraftTextChange,
  editDisableRichUi = false,
  editStaticChildren,
  editStaticChildrenMode = 'flow',
  editTypographyMode = 'inherit',
  editPreserveWhitespace = false,
  editPreserveBlockHeight = true,
  editInlineFlow = false,
  editCaptureLayoutSpacing = false,
  ...rest
}, ref) => {
  const cls = [className, highlightClass].filter(Boolean).join(' ')
  const originalOnClick = (rest as React.HTMLAttributes<HTMLElement>).onClick
  const [editing, setEditing] = React.useState(false)
  const inlineSelectionActions = useMarkdownInlineSelectionActions()
  const textSelectionWidgetLink = useTextSelectionWidgetLinkAction()
  const [sessionEditLineRange, setSessionEditLineRange] = React.useState<{ startLine: number; endLine: number } | null>(null)
  const inlineEditRangeToken = React.useMemo(
    () => toMarkdownBlockInlineEditRangeToken(startLine, endLine),
    [endLine, startLine],
  )
  const inlineEditStateScheduleKey = React.useMemo(
    () => toMarkdownBlockInlineEditStateTaskKey(inlineEditRangeToken),
    [inlineEditRangeToken],
  )
  React.useEffect(() => {
    if (!onInlineEditStateChange) return
    scheduleMarkdownBlockInlineEditStateSync(inlineEditStateScheduleKey, editing, onInlineEditStateChange)
    return () => {
      cancelMarkdownBlockInlineEditStateSync(inlineEditStateScheduleKey)
    }
  }, [editing, inlineEditStateScheduleKey, onInlineEditStateChange])
  React.useEffect(() => {
    if (editing) return
    lastSelectionOffsetsRef.current = null
    lastNonCollapsedSelectionOffsetsRef.current = null
    lastNonCollapsedDomRangeRef.current = null
    if (!sessionEditLineRange) return
    setSessionEditLineRange(null)
  }, [editing, sessionEditLineRange])
  const editable = inlineEditable && Array.isArray(sourceLines) && !!onReplaceLineRange && Number.isFinite(startLine)
  const effectiveEndLine = endLine ?? startLine
  const effectiveEditLineRange = sessionEditLineRange || editLineRange || null
  const editStartLine = effectiveEditLineRange && Number.isFinite(effectiveEditLineRange.startLine) ? effectiveEditLineRange.startLine : startLine
  const editEndLine = effectiveEditLineRange && Number.isFinite(effectiveEditLineRange.endLine) ? effectiveEditLineRange.endLine : effectiveEndLine
  const initialText = React.useMemo(() => {
    if (!editable || !sourceLines) return ''
    const startIndex = Math.max(0, Math.floor(editStartLine) - 1)
    const endIndex = Math.max(startIndex + 1, Math.floor(editEndLine))
    return sourceLines.slice(startIndex, endIndex).join('\n')
  }, [editable, editEndLine, editStartLine, sourceLines])
  const draftRef = React.useRef('')
  const editDirtyRef = React.useRef(false)
  const editorRef = React.useRef<HTMLElement | null>(null)
  const hostRef = React.useRef<HTMLElement | null>(null)
  const editTypographySnapshotRef = React.useRef<React.CSSProperties | null>(null)
  const editSpacingSnapshotRef = React.useRef<React.CSSProperties | null>(null)
  const parityProbeSnapshotRef = React.useRef<{
    source: HTMLElement
    sourceMetrics: Record<string, string>
  } | null>(null)
  const initialEditorHtmlRef = React.useRef('')
  const lastSerializedEditorHtmlRef = React.useRef('')
  const initialPresentTextRef = React.useRef('')
  const editSessionIdRef = React.useRef(0)
  const editLinePrefixesRef = React.useRef<string[] | null>(null)
  const toolbarRef = React.useRef<HTMLElement | null>(null)
  const variableMenuRef = React.useRef<HTMLElement | null>(null)
  const toolbarInteractingRef = React.useRef(false)
  const toolbarInteractionUntilRef = React.useRef(0)
  const selectionSyncSuspendUntilRef = React.useRef(0)
  const {
    linkRangeRef,
    lastSelectionOffsetsRef,
    lastNonCollapsedSelectionOffsetsRef,
    lastNonCollapsedDomRangeRef,
    liveSelectionSnapshotRef,
  } = useMarkdownBlockContainerSelectionState()
  const editorPresentation = editPresentation === 'html' ? 'html' : 'markdown'
  const htmlRenderMode = editHtmlRender === 'block' ? 'block' : 'inline'
  const normalizeRenderedBlockHtmlForEditor = React.useCallback((renderedHtml: string): string => {
    const raw = editListMode
      ? String(renderedHtml || '').replace(/>\s+</g, '><').trim()
      : String(renderedHtml || '').trimEnd()
    if (!raw.trim() || typeof DOMParser === 'undefined') return raw
    let doc: Document
    try {
      doc = new DOMParser().parseFromString(`<section>${raw}</section>`, 'text/html')
    } catch {
      return raw
    }
    const root = doc.body.firstElementChild as HTMLElement | null
    if (!root) return raw
    const footnoteRefs = Array.from(root.querySelectorAll('sup > a[href^="#fn"]')) as HTMLAnchorElement[]
    footnoteRefs.forEach(anchor => {
      const label = String(anchor.textContent || '').trim()
      if (!label) return
      const span = doc.createElement('span')
      span.setAttribute('data-kg-footnote-ref', '1')
      span.setAttribute('data-kg-footnote-label', label)
      span.style.verticalAlign = 'super'
      span.style.fontSize = '0.8em'
      span.textContent = `[^${label}]`
      const sup = anchor.parentElement
      if (sup && String(sup.tagName || '').toLowerCase() === 'sup') sup.replaceWith(span)
      else anchor.replaceWith(span)
    })
    return root.innerHTML
  }, [editListMode])
  const {
    edgeTrimRafRef,
    trimEmptyEditableEdges,
    scheduleEdgeTrimBurst,
  } = useMarkdownBlockContainerEdgeTrim({
    editorRef,
    editing,
    editListMode,
    editTrimEmptyBlockEdges,
    editEnforceSingleListRoot,
  })
  const editMinHeightPxRef = React.useRef<number>(0)
  const editOpenBlurGuardUntilRef = React.useRef<number>(0)
  const blurCommitTimerRef = React.useRef<number>(0)
  const lastEditorPointerDownAtRef = React.useRef<number>(0)
  const lastEditorPointerUpAtRef = React.useRef<number>(0)
  const lastDocumentPointerDownTargetRef = React.useRef<Node | null>(null)
  const lastDocumentPointerDownAtRef = React.useRef<number>(0)
  const selectionSyncBurstTokenRef = React.useRef<number>(0)
  const lastInlineSelectionToolbarProbeRef = React.useRef<'show' | 'hide' | null>(null)
  const { probe, probeSelection } = useMarkdownBlockContainerRuntimeProbe({
    startLine,
    endLine,
    editing,
    editorRef,
  })
  const {
    readEditorPlainText,
    getSelectionOffsets,
    setSelectionByOffsets,
    setDraftToDom,
    publishMarkdownDraftWithoutDomMutation,
    readCurrentMarkdownDraft,
    emitHtmlDraftTextChangeFromEditorDom,
    getDraft,
    buildReplacementLinesFromDraft,
    commit,
    cancel,
  } = useMarkdownBlockContainerDraftCommit({
    editable,
    onReplaceLineRange,
    sourceLines,
    editStartLine,
    editEndLine,
    initialText,
    editorPresentation,
    htmlRenderMode,
    normalizeRenderedBlockHtmlForEditor,
    editDefaultLinePrefix,
    hasEditStripLinePrefix: !!editStripLinePrefix,
    editLinePrefixesRef,
    initialPresentTextRef,
    initialEditorHtmlRef,
    lastSerializedEditorHtmlRef,
    draftRef,
    editDirtyRef,
    editSessionIdRef,
    editorRef,
    hostRef,
    setEditing,
    setSessionEditLineRange,
    onDraftTextChange: onInlineDraftTextChange,
  })
  React.useEffect(() => {
    if (!editing) return
    return registerActiveMarkdownBlockEditor(commit)
  }, [commit, editing])
  const readSelectionOffsetsForInlineCommand = React.useCallback(() => {
    const current = getSelectionOffsets()
    if (current) {
      lastSelectionOffsetsRef.current = current
      return current
    }
    return lastSelectionOffsetsRef.current
  }, [getSelectionOffsets, lastSelectionOffsetsRef])
  const {
    readSelectionOffsetsForFormatting,
    execInline,
    insertHtmlAroundSelection,
    readCommentTextFromHtmlSelection,
    readMarkdownTokenFromHtmlSelection,
    applyDefaultHighlightToHtmlSelection,
    applyUnderlineToHtmlSelection,
    clearHtmlFormattingSelection,
    applySigilToHtmlSelection,
    restoreCachedHtmlSelection,
  } = useMarkdownBlockContainerHtmlFormatting({
    editorRef,
    getSelectionOffsets,
    setSelectionByOffsets,
    lastNonCollapsedSelectionOffsetsRef,
    lastNonCollapsedDomRangeRef,
    emitLiveDraftTextFromDom: emitHtmlDraftTextChangeFromEditorDom,
  })
  const lastPointerRef = React.useRef<{ x: number; y: number } | null>(null)
  const lastPointerTargetRef = React.useRef<Node | null>(null)
  const lastPointerSelectionModeRef = React.useRef<'caret' | 'word'>('caret')
  const { openEditor, emitParityProbe, placeCaretFromClientPoint } = useMarkdownBlockContainerEditOpenCaretProbe({
    editable,
    typographySelector: MARKDOWN_EDIT_TYPOGRAPHY_SOURCE_SELECTOR,
    editCaptureLayoutSpacing,
    editStripLinePrefix: !!editStripLinePrefix,
    editStripLinePrefixSpacingSanitize,
    probe,
    resolveEditLineRangeOnOpen,
    resolveEditMinHeightOnOpen,
    setSessionEditLineRange,
    setEditing,
    editTypographySnapshotRef,
    editSpacingSnapshotRef,
    parityProbeSnapshotRef,
    editSessionIdRef,
    editOpenBlurGuardUntilRef,
    editMinHeightPxRef,
    lastPointerRef,
    lastPointerTargetRef,
    lastPointerSelectionModeRef,
    editorRef,
    editStartLine,
    editEndLine,
  })
  React.useEffect(() => {
    return () => {
      if (blurCommitTimerRef.current) {
        window.clearTimeout(blurCommitTimerRef.current)
        blurCommitTimerRef.current = 0
      }
    }
  }, [])
  const {
    inlineSelectionToolbar,
    setInlineSelectionToolbar,
    slashMenu,
    setSlashMenu,
    variableMenu,
    setVariableMenu,
    linkPopover,
    setLinkPopover,
    commentPreview,
    setCommentPreview,
    inlineSelectionToolbarAnchorRef,
    slashAnchorRef,
    variableAnchorRef,
    linkAnchorRef,
    commentAnchorRef,
    slashMenuRef,
    inlineSelectionToolbarRafRef,
    inlineSelectionToolbarScheduleKey,
    editorMouseUpSyncScheduleKey,
    setSlashMenuStable,
    setVariableMenuStable,
  } = useMarkdownBlockContainerInlineUiState({
    startLine,
    endLine,
  })
  const closeCommentPreview = React.useCallback(() => {
    setCommentPreview(prev => (prev.show ? { ...prev, show: false } : prev))
  }, [setCommentPreview])
  const readCommentIndicatorFromTarget = React.useCallback((target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) return null
    const node = target.closest('[data-kg-comment="1"]') as HTMLElement | null
    return node && editorRef.current?.contains(node) ? node : null
  }, [editorRef])
  const openCommentPreviewFromIndicator = React.useCallback((indicator: HTMLElement) => {
    const root = editorRef.current
    if (!root) return
    const text = String(indicator.getAttribute('data-kg-comment-text') || '').trim()
    if (!text) return
    const rootRect = root.getBoundingClientRect()
    const rect = indicator.getBoundingClientRect()
    const leftPx = Math.max(0, rect.left - rootRect.left + (rect.width / 2))
    const topPx = Math.max(0, rect.bottom - rootRect.top + 4)
    setCommentPreview(prev => {
      if (prev.show && prev.leftPx === leftPx && prev.topPx === topPx && prev.text === text) return prev
      return { show: true, leftPx, topPx, text }
    })
  }, [editorRef, setCommentPreview])
  const handleCommentIndicatorMouseOverCapture = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    const indicator = readCommentIndicatorFromTarget(event.target)
    if (!indicator) return
    openCommentPreviewFromIndicator(indicator)
  }, [openCommentPreviewFromIndicator, readCommentIndicatorFromTarget])
  const handleCommentIndicatorMouseOutCapture = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    const indicator = readCommentIndicatorFromTarget(event.target)
    if (!indicator) return
    const next = readCommentIndicatorFromTarget(event.relatedTarget)
    if (next === indicator) return
    closeCommentPreview()
  }, [closeCommentPreview, readCommentIndicatorFromTarget])
  const handleCommentIndicatorFocusCapture = React.useCallback((event: React.FocusEvent<HTMLElement>) => {
    const indicator = readCommentIndicatorFromTarget(event.target)
    if (!indicator) return
    openCommentPreviewFromIndicator(indicator)
  }, [openCommentPreviewFromIndicator, readCommentIndicatorFromTarget])
  const handleCommentIndicatorBlurCapture = React.useCallback((event: React.FocusEvent<HTMLElement>) => {
    const indicator = readCommentIndicatorFromTarget(event.target)
    if (!indicator) return
    const next = readCommentIndicatorFromTarget(event.relatedTarget)
    if (next === indicator) return
    closeCommentPreview()
  }, [closeCommentPreview, readCommentIndicatorFromTarget])
  React.useEffect(() => {
    if (!editing) return
    if (editorPresentation !== 'html') return
    const root = editorRef.current
    if (!root) return
    const cleanupByIndicator = new Map<HTMLElement, () => void>()
    const readIndicator = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element)) return null
      const node = target.closest('[data-kg-comment="1"]') as HTMLElement | null
      return node && root.contains(node) ? node : null
    }
    const bindIndicator = (indicator: HTMLElement) => {
      if (cleanupByIndicator.has(indicator)) return
      const handleMouseOver = () => {
        openCommentPreviewFromIndicator(indicator)
      }
      const handleMouseOut = (event: MouseEvent) => {
        const next = readIndicator(event.relatedTarget)
        if (next === indicator) return
        closeCommentPreview()
      }
      const handleFocus = () => {
        openCommentPreviewFromIndicator(indicator)
      }
      const handleBlur = (event: FocusEvent) => {
        const next = readIndicator(event.relatedTarget)
        if (next === indicator) return
        closeCommentPreview()
      }
      indicator.addEventListener('mouseover', handleMouseOver)
      indicator.addEventListener('mouseout', handleMouseOut)
      indicator.addEventListener('focus', handleFocus)
      indicator.addEventListener('blur', handleBlur)
      cleanupByIndicator.set(indicator, () => {
        indicator.removeEventListener('mouseover', handleMouseOver)
        indicator.removeEventListener('mouseout', handleMouseOut)
        indicator.removeEventListener('focus', handleFocus)
        indicator.removeEventListener('blur', handleBlur)
      })
    }
    const refreshBindings = () => {
      const activeIndicators = new Set(
        Array.from(root.querySelectorAll('[data-kg-comment="1"]')) as HTMLElement[],
      )
      cleanupByIndicator.forEach((cleanup, indicator) => {
        if (activeIndicators.has(indicator)) return
        cleanup()
        cleanupByIndicator.delete(indicator)
      })
      activeIndicators.forEach(bindIndicator)
    }
    refreshBindings()
    const observer = typeof MutationObserver !== 'undefined'
      ? new MutationObserver(() => refreshBindings())
      : null
    observer?.observe(root, { childList: true, subtree: true })
    return () => {
      observer?.disconnect()
      cleanupByIndicator.forEach(cleanup => cleanup())
      cleanupByIndicator.clear()
    }
  }, [closeCommentPreview, editing, editorPresentation, editorRef, openCommentPreviewFromIndicator])
  const { applyVariableToken, applyMediaCommandCandidate, mediaCommandCandidates, variableSuggestions } = useMarkdownBlockContainerVariableActions({
    editable,
    sourceLines,
    editStartLine,
    onReplaceLineRange,
    variableMenu,
    setVariableMenu,
    setSlashMenuStable,
    getDraft,
    getSelectionOffsets,
    getCommandSelectionOffsets: readSelectionOffsetsForInlineCommand,
    setDraftToDom,
    setEditing,
    setSessionEditLineRange,
    editorRef,
  })
  const {
    applyDraftAction,
    applyWrap,
    applyTurnInto,
    applyAlign,
    applyToggleHeading,
    applyColor,
    applyHighlightColor,
    applyChecklist,
    applyDivider,
    applyClearFormatting,
    handleDuplicate,
    handleDelete,
  } = useMarkdownBlockContainerMarkdownFormatting({
    editorPresentation,
    editable,
    editStartLine,
    editEndLine,
    sourceLines,
    onReplaceLineRange,
    getDraft,
    getSelectionOffsets,
    setDraftToDom,
    buildReplacementLinesFromDraft,
    resolveTurnIntoFormatAction,
    readEditorPlainText,
    readCurrentMarkdownDraft,
    editorRef,
    setEditing,
    setSessionEditLineRange,
    setLinkPopover,
    setInlineSelectionToolbar,
    linkRangeRef,
    liveSelectionSnapshotRef,
    readSelectionOffsetsForFormatting,
    execInline,
    insertHtmlAroundSelection,
    applyDefaultHighlightToHtmlSelection,
    applyUnderlineToHtmlSelection,
    clearHtmlFormattingSelection,
    applySigilToHtmlSelection,
    restoreCachedHtmlSelection,
  })
  const applyComment = React.useCallback(() => {
    if (editorPresentation === 'html') restoreCachedHtmlSelection()
    const selection = readSelectionOffsetsForFormatting() || getSelectionOffsets()
    if (!selection || selection.startOffset === selection.endOffset) return
    const selectedTextSnapshot = editorPresentation === 'html' ? readCommentTextFromHtmlSelection() : null
    const selectedMarkdownTokenSnapshot = editorPresentation === 'html' ? readMarkdownTokenFromHtmlSelection() : null
    void (async () => {
      const draft = await readCurrentMarkdownDraft()
      const a = Math.max(0, Math.min(draft.length, selection.startOffset))
      const b = Math.max(0, Math.min(draft.length, selection.endOffset))
      const start = Math.min(a, b)
      const end = Math.max(a, b)
      const selected = draft.slice(start, end)
      const selectedText = selectedTextSnapshot || selected.trim()
      const selectedMarkdownToken = selectedMarkdownTokenSnapshot || selected
      if (!selectedText || !selected) return
      const normalizedSelectedMarkdownToken = String(selectedMarkdownToken || '').trim()
      if (/^`@comment:c-[^`\s]+`$/u.test(normalizedSelectedMarkdownToken)) {
        setCommentPreview({
          show: true,
          leftPx: inlineSelectionToolbar.leftPx,
          topPx: inlineSelectionToolbar.topPx + 28,
          text: selectedText,
        })
        return
      }
      if (/^<!--[\s\S]*?-->$/.test(normalizedSelectedMarkdownToken)) {
        const parsedMarker = parseMarkdownCommentMarker(normalizedSelectedMarkdownToken)
        if (parsedMarker.kind !== 'author-note') {
          setCommentPreview({
            show: true,
            leftPx: inlineSelectionToolbar.leftPx,
            topPx: inlineSelectionToolbar.topPx + 28,
            text:
              parsedMarker.kind === 'review-comment'
                ? parsedMarker.previewText
                : parsedMarker.kind === 'metadata-entry'
                ? parsedMarker.note
                : selectedText,
          })
          return
        }
      }
      const promptConfig = readAppendixAuthoringPromptConfig({
        selectedMarkdown: normalizedSelectedMarkdownToken,
        selectedText,
      })
      const authoredText =
        promptConfig
          ? promptForText(promptConfig.message, promptConfig.defaultText)
          : null
      if (promptConfig && !authoredText) return
      const mutation = applyAppendixCommentToSelection({
        markdown: draft,
        startOffset: start,
        endOffset: end,
        selectedMarkdown: normalizedSelectedMarkdownToken,
        selectedText,
        authoredText,
      })
      if (!mutation) return
      publishMarkdownDraftWithoutDomMutation(mutation.nextMarkdown)
      setCommentPreview({
        show: true,
        leftPx: inlineSelectionToolbar.leftPx,
        topPx: inlineSelectionToolbar.topPx + 28,
        text: selectedText,
      })
    })()
  }, [inlineSelectionToolbar.leftPx, inlineSelectionToolbar.topPx, editorPresentation, getSelectionOffsets, publishMarkdownDraftWithoutDomMutation, readCommentTextFromHtmlSelection, readCurrentMarkdownDraft, readMarkdownTokenFromHtmlSelection, readSelectionOffsetsForFormatting, restoreCachedHtmlSelection, setCommentPreview])
  const applyCreateLinkedWidget = React.useCallback(() => {
    if (!textSelectionWidgetLink) return
    if (editorPresentation === 'html') restoreCachedHtmlSelection()
    const selection = readSelectionOffsetsForFormatting() || getSelectionOffsets()
    if (!selection || selection.startOffset === selection.endOffset) return
    const selectedTextSnapshot = editorPresentation === 'html' ? readCommentTextFromHtmlSelection() : ''
    void (async () => {
      const draft = await readCurrentMarkdownDraft()
      const a = Math.max(0, Math.min(draft.length, selection.startOffset))
      const b = Math.max(0, Math.min(draft.length, selection.endOffset))
      const start = Math.min(a, b)
      const end = Math.max(a, b)
      const selectedText = String(selectedTextSnapshot || draft.slice(start, end)).trim()
      if (!selectedText) return
      const selectionStartLine = editStartLine + draft.slice(0, start).split('\n').length - 1
      const selectionEndLine = selectionStartLine + draft.slice(start, end).split('\n').length - 1
      textSelectionWidgetLink.createLinkedWidget({
        selectedText,
        startLine: selectionStartLine,
        endLine: selectionEndLine,
      })
    })()
  }, [editStartLine, editorPresentation, getSelectionOffsets, readCommentTextFromHtmlSelection, readCurrentMarkdownDraft, readSelectionOffsetsForFormatting, restoreCachedHtmlSelection, textSelectionWidgetLink])
  const {
    captureSelectionForToolbarAction,
    holdToolbarInteraction,
    updateInlineSelectionToolbar,
    syncSelectionToolbarState,
    runSelectionSyncBurst,
  } = useMarkdownBlockContainerSelectionToolbarSync({
    editing,
    editDisableRichUi,
    editorRef,
    getSelectionOffsets,
    setInlineSelectionToolbar,
    setSlashMenu,
    setLinkPopover,
    toolbarInteractingRef,
    toolbarInteractionUntilRef,
    lastSelectionOffsetsRef,
    lastNonCollapsedSelectionOffsetsRef,
    lastNonCollapsedDomRangeRef,
    liveSelectionSnapshotRef,
    selectionSyncSuspendUntilRef,
    inlineSelectionToolbarRafRef,
    selectionSyncBurstTokenRef,
    lastInlineSelectionToolbarProbeRef,
    blurCommitTimerRef,
    inlineSelectionToolbarScheduleKey,
    editorMouseUpSyncScheduleKey,
    probe,
  })
  useMarkdownBlockContainerEditInitialization({
    editing,
    initialText,
    editStripLinePrefix,
    editKeepLinePrefixesInEditor,
    editTrimEdgeNewlines,
    editTrimEmptyBlockEdges,
    editListMode,
    editSigilRenderMode,
    editorPresentation,
    htmlRenderMode,
    normalizeRenderedBlockHtmlForEditor,
    placeCaretFromClientPoint,
    runSelectionSyncBurst,
    syncSelectionToolbarState,
    trimEmptyEditableEdges,
    scheduleEdgeTrimBurst,
    editLinePrefixesRef,
    initialPresentTextRef,
    draftRef,
    editDirtyRef,
    editSessionIdRef,
    editorRef,
    initialEditorHtmlRef,
    lastSerializedEditorHtmlRef,
    lastPointerSelectionModeRef,
  })
  const hasCachedSelection = !!lastNonCollapsedSelectionOffsetsRef.current
    && lastNonCollapsedSelectionOffsetsRef.current.startOffset !== lastNonCollapsedSelectionOffsetsRef.current.endOffset
  const {
    handleVariableMenuMouseDownCapture,
    handleLinkCancel,
    handleLinkHrefChange,
    handleLinkInputKeyDown,
    handleLinkSubmit,
    onInput: handleEditorInput,
    onCopy: handleEditorCopy,
    onCut: handleEditorCut,
    onBlur: handleEditorBlur,
    onFocus: handleEditorFocus,
    onMouseDown: handleEditorMouseDown,
    onMouseUp: handleEditorMouseUp,
    onDoubleClick: handleEditorDoubleClick,
    onKeyDown: handleEditorKeyDown,
    setHostNodeRef,
    onHostClick,
    onHostDoubleClick,
  } = useMarkdownBlockContainerHostEditing({
    editing,
    editTrimEmptyBlockEdges,
    scheduleEdgeTrimBurst,
    edgeTrimRafRef,
    lastSelectionOffsetsRef,
    lastNonCollapsedSelectionOffsetsRef,
    lastNonCollapsedDomRangeRef,
    toolbarInteractingRef,
    getSelectionOffsets,
    editorPresentation,
    linkPopover,
    setLinkPopover,
    linkRangeRef,
    getDraft,
    setDraftToDom,
    forbidCopy,
    editPreserveWhitespace,
    readEditorPlainText,
    editStripLinePrefix,
    editLinePrefixesRef,
    editTrimEdgeNewlines,
    draftRef,
    editDirtyRef,
    emitParityProbe,
    editDisableRichUi,
    setVariableMenuStable,
    variableMenu,
    setSlashMenuStable,
    slashMenu,
    setInlineSelectionToolbar,
    inlineSelectionToolbar,
    blurCommitTimerRef,
    selectionSyncSuspendUntilRef,
    toolbarRef,
    slashMenuRef,
    variableMenuRef,
    commit,
    toolbarInteractionUntilRef,
    editOpenBlurGuardUntilRef,
    lastEditorPointerDownAtRef,
    lastEditorPointerUpAtRef,
    lastDocumentPointerDownAtRef,
    lastDocumentPointerDownTargetRef,
    liveSelectionSnapshotRef,
    editorMouseUpSyncScheduleKey,
    syncSelectionToolbarState,
    runSelectionSyncBurst,
    cancel,
    applyVariableToken,
    hostRef,
    forwardedRef: ref,
    originalOnClick,
    openEditor,
    probe,
    probeSelection,
    lastPointerSelectionModeRef,
    lastPointerRef,
    lastPointerTargetRef,
    emitLiveDraftTextFromDom: emitHtmlDraftTextChangeFromEditorDom,
    editorRef,
  })
  return (
    <Tag
      ref={setHostNodeRef}
      {...(rest as unknown as Record<string, unknown>)}
      id={id}
      className={cls}
      style={highlightStyle}
      data-start-line={startLine}
      data-end-line={endLine ?? startLine}
      onClick={onHostClick}
      onDoubleClick={onHostDoubleClick}
    >
      <MarkdownBlockContainerEditSurfaceView
        editing={editing}
        editable={editable}
        children={children}
        hostTag={Tag}
        editInlineFlow={editInlineFlow}
        editPreserveBlockHeight={editPreserveBlockHeight}
        editMinHeightPx={editMinHeightPxRef.current}
        editStaticChildren={editStaticChildren}
        editStaticChildrenMode={editStaticChildrenMode}
        editLeftRailClassName={editLeftRailClassName}
        inlineSelectionToolbar={inlineSelectionToolbar}
        slashMenu={slashMenu}
        variableMenu={variableMenu}
        linkPopover={linkPopover}
        commentPreview={commentPreview}
        inlineSelectionToolbarAnchorRef={inlineSelectionToolbarAnchorRef}
        slashAnchorRef={slashAnchorRef}
        variableAnchorRef={variableAnchorRef}
        linkAnchorRef={linkAnchorRef}
        commentAnchorRef={commentAnchorRef}
        toolbarRef={toolbarRef}
        slashMenuRef={slashMenuRef}
        variableMenuRef={variableMenuRef}
        editDisableRichUi={editDisableRichUi}
        hasCachedSelection={hasCachedSelection}
        holdToolbarInteraction={holdToolbarInteraction}
        onToolbarInteractionEnd={() => {
          toolbarInteractionUntilRef.current = Math.max(toolbarInteractionUntilRef.current, Date.now() + 180)
          window.setTimeout(() => {
            toolbarInteractingRef.current = false
          }, 0)
        }}
        applyTurnInto={applyTurnInto}
        applyToggleHeading={applyToggleHeading}
        applyAlign={applyAlign}
        applyDraftAction={applyDraftAction}
        applyWrap={applyWrap}
        applyCreateLinkedWidget={textSelectionWidgetLink ? applyCreateLinkedWidget : undefined}
        applyComment={applyComment}
        captureSelectionForToolbarAction={captureSelectionForToolbarAction}
        closeCommentPreview={closeCommentPreview}
        applyHighlightColor={applyHighlightColor}
        applyColor={applyColor}
        applyClearFormatting={applyClearFormatting}
        applyChecklist={applyChecklist}
        applyDivider={applyDivider}
        handleDuplicate={handleDuplicate}
        handleDelete={handleDelete}
        selectionActions={inlineSelectionActions ? {
          startLine,
          endLine: endLine ?? startLine,
          currentView: inlineSelectionActions.currentView,
          onShowOnCanvas:
            inlineSelectionActions.onShowOnCanvas &&
            (inlineSelectionActions.canShowOnCanvas?.(startLine, endLine ?? startLine) ?? true)
              ? inlineSelectionActions.onShowOnCanvas
              : undefined,
          onShowInViewer: inlineSelectionActions.onShowInViewer,
          onShowInEditor: inlineSelectionActions.onShowInEditor,
          onShowInPresentation: inlineSelectionActions.onShowInPresentation,
          onShowInGallery: inlineSelectionActions.onShowInGallery,
          onShowInGraphDataTable: inlineSelectionActions.onShowInGraphDataTable,
        } : null}
        onVariableMenuMouseDownCapture={handleVariableMenuMouseDownCapture}
        setSlashMenuStable={setSlashMenuStable}
        setVariableMenu={setVariableMenu}
        variableSuggestions={variableSuggestions}
        applyVariableToken={applyVariableToken}
        mediaCommandCandidates={mediaCommandCandidates}
        applyMediaCommandCandidate={applyMediaCommandCandidate}
        onLinkSubmit={handleLinkSubmit}
        onLinkHrefChange={handleLinkHrefChange}
        onLinkInputKeyDown={handleLinkInputKeyDown}
        onLinkCancel={handleLinkCancel}
        editorRef={editorRef}
        editorClassName={editorClassName}
        editTypographyMode={editTypographyMode}
        editTypographySnapshot={editTypographySnapshotRef.current}
        editSpacingSnapshot={editSpacingSnapshotRef.current}
        editListMode={editListMode}
        editPresentation={editorPresentation}
        editHtmlRender={htmlRenderMode}
        editHtmlDisableDefaultBlockFlow={editHtmlDisableDefaultBlockFlow}
        onInput={handleEditorInput}
        onCopy={handleEditorCopy}
        onCut={handleEditorCut}
        onMouseOverCapture={handleCommentIndicatorMouseOverCapture}
        onMouseOutCapture={handleCommentIndicatorMouseOutCapture}
        onFocusCapture={handleCommentIndicatorFocusCapture}
        onBlurCapture={handleCommentIndicatorBlurCapture}
        onBlur={handleEditorBlur}
        onFocus={handleEditorFocus}
        onMouseDown={handleEditorMouseDown}
        onMouseUp={handleEditorMouseUp}
        onDoubleClick={handleEditorDoubleClick}
        onKeyDown={handleEditorKeyDown}
      />
    </Tag>
  )
})
