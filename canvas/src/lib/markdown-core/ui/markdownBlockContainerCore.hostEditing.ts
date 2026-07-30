import React from 'react'
import { captureInlineSelectionForToolbarAction } from '@/lib/markdown-core/ui/markdownInlineSelectionToolbarInteractions'
import { ensureWordSelectionInRoot } from './markdownBlockContainerCore.interaction'
import { useMarkdownBlockContainerHostOrchestration } from './markdownBlockContainerCore.hostOrchestration'
import { useMarkdownBlockContainerLinkPopover } from './markdownBlockContainerCore.linkPopover'
import { useMarkdownBlockContainerEditorEvents } from './markdownBlockContainerCore.editorEvents'
import type { SlashMenuState } from './markdownBlockContainerCore.menuState'

export const useMarkdownBlockContainerHostEditing = (args: {
  editing: boolean
  editTrimEmptyBlockEdges: boolean
  scheduleEdgeTrimBurst: () => void
  edgeTrimRafRef: React.MutableRefObject<number>
  lastSelectionOffsetsRef: React.MutableRefObject<{ startOffset: number; endOffset: number } | null>
  lastNonCollapsedSelectionOffsetsRef: React.MutableRefObject<{ startOffset: number; endOffset: number } | null>
  lastNonCollapsedDomRangeRef: React.MutableRefObject<Range | null>
  toolbarInteractingRef: React.MutableRefObject<boolean>
  getSelectionOffsets: () => { startOffset: number; endOffset: number } | null
  editorPresentation: 'markdown' | 'html'
  linkPopover: { show: boolean; leftPx: number; topPx: number; href: string }
  setLinkPopover: React.Dispatch<React.SetStateAction<{ show: boolean; leftPx: number; topPx: number; href: string }>>
  editorRef: React.RefObject<HTMLElement | null>
  linkRangeRef: React.MutableRefObject<Range | null>
  getDraft: () => string
  setDraftToDom: (nextText: string, selection?: { startOffset: number; endOffset: number }) => void
  forbidCopy: boolean
  editPreserveWhitespace: boolean
  readEditorPlainText: () => string
  editStripLinePrefix?: (line: string) => { prefix: string; content: string }
  editLinePrefixesRef: React.MutableRefObject<string[] | null>
  editTrimEdgeNewlines: boolean
  draftRef: React.MutableRefObject<string>
  editDirtyRef: React.MutableRefObject<boolean>
  emitParityProbe: () => void
  editDisableRichUi: boolean
  setVariableMenuStable: (next: { show: boolean; leftPx: number; topPx: number; query?: string; keyInput?: string }) => void
  variableMenu: { show: boolean; keyInput: string; mode: 'ref' | 'create' | 'update' | 'fallback' | 'delete' }
  setSlashMenuStable: (next: SlashMenuState) => void
  slashMenu: Pick<SlashMenuState, 'show' | 'kind' | 'query'>
  setInlineSelectionToolbar: React.Dispatch<React.SetStateAction<{ show: boolean; leftPx: number; topPx: number }>>
  inlineSelectionToolbar: { show: boolean }
  blurCommitTimerRef: React.MutableRefObject<number>
  selectionSyncSuspendUntilRef: React.MutableRefObject<number>
  toolbarRef: React.RefObject<HTMLElement | null>
  slashMenuRef: React.RefObject<HTMLElement | null>
  variableMenuRef: React.RefObject<HTMLElement | null>
  commit: () => void | Promise<void>
  toolbarInteractionUntilRef: React.MutableRefObject<number>
  editOpenBlurGuardUntilRef: React.MutableRefObject<number>
  lastEditorPointerDownAtRef: React.MutableRefObject<number>
  lastEditorPointerUpAtRef: React.MutableRefObject<number>
  lastDocumentPointerDownAtRef: React.MutableRefObject<number>
  lastDocumentPointerDownTargetRef: React.MutableRefObject<Node | null>
  liveSelectionSnapshotRef: React.MutableRefObject<import('./markdownBlockContainerCore.interaction').LiveSelectionSnapshot | null>
  editorMouseUpSyncScheduleKey: string
  syncSelectionToolbarState: () => void
  runSelectionSyncBurst: (fn: () => void) => void
  cancel: () => void
  applyVariableToken: (mode: 'ref' | 'create' | 'update' | 'fallback' | 'delete', forcedKey?: string) => void
  hostRef: React.MutableRefObject<HTMLElement | null>
  forwardedRef: React.ForwardedRef<HTMLElement>
  originalOnClick?: React.MouseEventHandler<HTMLElement>
  openEditor: (event: React.MouseEvent<HTMLElement>) => void
  probe: (name: string, data?: Record<string, unknown>) => void
  probeSelection: (name: string, data?: Record<string, unknown>) => void
  lastPointerSelectionModeRef: React.MutableRefObject<'caret' | 'word'>
  lastPointerRef: React.MutableRefObject<{ x: number; y: number } | null>
  lastPointerTargetRef: React.MutableRefObject<Node | null>
  emitLiveDraftTextFromDom?: () => void
}) => {
  React.useEffect(() => {
    if (!args.editing) return
    if (!args.editTrimEmptyBlockEdges) return
    args.scheduleEdgeTrimBurst()
    return () => {
      if (args.edgeTrimRafRef.current) {
        window.cancelAnimationFrame(args.edgeTrimRafRef.current)
        args.edgeTrimRafRef.current = 0
      }
    }
  }, [args.editTrimEmptyBlockEdges, args.editing, args.edgeTrimRafRef, args.scheduleEdgeTrimBurst])

  const handleVariableMenuMouseDownCapture = React.useCallback(() => {
    args.toolbarInteractingRef.current = true
    captureInlineSelectionForToolbarAction({
      getSelectionOffsets: args.getSelectionOffsets,
      lastSelectionOffsetsRef: args.lastSelectionOffsetsRef,
      lastNonCollapsedSelectionOffsetsRef: args.lastNonCollapsedSelectionOffsetsRef,
      lastNonCollapsedDomRangeRef: args.lastNonCollapsedDomRangeRef,
    })
  }, [args.getSelectionOffsets, args.lastNonCollapsedDomRangeRef, args.lastNonCollapsedSelectionOffsetsRef, args.lastSelectionOffsetsRef, args.toolbarInteractingRef])

  const linkPopoverState = useMarkdownBlockContainerLinkPopover({
    editorPresentation: args.editorPresentation,
    linkPopover: args.linkPopover,
    setLinkPopover: args.setLinkPopover,
    editorRef: args.editorRef,
    linkRangeRef: args.linkRangeRef,
    getSelectionOffsets: args.getSelectionOffsets,
    getDraft: args.getDraft,
    setDraftToDom: args.setDraftToDom,
  })

  const editorEvents = useMarkdownBlockContainerEditorEvents({
    editorRef: args.editorRef,
    forbidCopy: args.forbidCopy,
    editPreserveWhitespace: args.editPreserveWhitespace,
    readEditorPlainText: args.readEditorPlainText,
    editStripLinePrefix: args.editStripLinePrefix,
    editLinePrefixesRef: args.editLinePrefixesRef,
    editTrimEdgeNewlines: args.editTrimEdgeNewlines,
    draftRef: args.draftRef,
    editDirtyRef: args.editDirtyRef,
    editTrimEmptyBlockEdges: args.editTrimEmptyBlockEdges,
    scheduleEdgeTrimBurst: args.scheduleEdgeTrimBurst,
    emitParityProbe: args.emitParityProbe,
    editDisableRichUi: args.editDisableRichUi,
    getSelectionOffsets: args.getSelectionOffsets,
    lastSelectionOffsetsRef: args.lastSelectionOffsetsRef,
    setVariableMenuStable: args.setVariableMenuStable,
    variableMenu: args.variableMenu,
    setSlashMenuStable: args.setSlashMenuStable,
    slashMenu: args.slashMenu,
    setInlineSelectionToolbar: args.setInlineSelectionToolbar,
    inlineSelectionToolbar: args.inlineSelectionToolbar,
    blurCommitTimerRef: args.blurCommitTimerRef,
    selectionSyncSuspendUntilRef: args.selectionSyncSuspendUntilRef,
    toolbarRef: args.toolbarRef,
    slashMenuRef: args.slashMenuRef,
    variableMenuRef: args.variableMenuRef,
    commit: args.commit,
    toolbarInteractingRef: args.toolbarInteractingRef,
    toolbarInteractionUntilRef: args.toolbarInteractionUntilRef,
    editOpenBlurGuardUntilRef: args.editOpenBlurGuardUntilRef,
    lastEditorPointerDownAtRef: args.lastEditorPointerDownAtRef,
    lastEditorPointerUpAtRef: args.lastEditorPointerUpAtRef,
    lastDocumentPointerDownAtRef: args.lastDocumentPointerDownAtRef,
    lastDocumentPointerDownTargetRef: args.lastDocumentPointerDownTargetRef,
    lastNonCollapsedSelectionOffsetsRef: args.lastNonCollapsedSelectionOffsetsRef,
    lastNonCollapsedDomRangeRef: args.lastNonCollapsedDomRangeRef,
    liveSelectionSnapshotRef: args.liveSelectionSnapshotRef,
    editorMouseUpSyncScheduleKey: args.editorMouseUpSyncScheduleKey,
    syncSelectionToolbarState: args.syncSelectionToolbarState,
    runSelectionSyncBurst: args.runSelectionSyncBurst,
    cancel: args.cancel,
    applyVariableToken: args.applyVariableToken,
    linkRangeRef: args.linkRangeRef,
    setLinkPopover: args.setLinkPopover,
    emitLiveDraftTextFromDom: args.emitLiveDraftTextFromDom,
  })

  const handleHostDoubleClickWhileEditing = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    args.lastPointerSelectionModeRef.current = 'word'
    args.lastPointerRef.current = { x: event.clientX, y: event.clientY }
    args.lastPointerTargetRef.current = event.target instanceof Node ? event.target : null
    const currentTarget = (args.editorRef.current || event.currentTarget) as HTMLElement
    editorEvents.onDoubleClick({
      detail: 2,
      currentTarget,
      target: event.target as EventTarget,
      stopPropagation: () => {},
      preventDefault: () => {},
    } as unknown as React.MouseEvent<HTMLElement>)
    window.requestAnimationFrame(() => {
      const root = args.editorRef.current
      if (!root) return
      const sel = typeof window !== 'undefined' ? window.getSelection() : null
      if (sel && String(sel.toString() || '').trim().length > 0) return
      ensureWordSelectionInRoot(root)
      args.runSelectionSyncBurst(() => args.syncSelectionToolbarState())
    })
  }, [args.editorRef, args.lastPointerRef, args.lastPointerSelectionModeRef, args.lastPointerTargetRef, args.runSelectionSyncBurst, args.syncSelectionToolbarState, editorEvents])

  const hostOrchestration = useMarkdownBlockContainerHostOrchestration({
    editing: args.editing,
    hostRef: args.hostRef,
    forwardedRef: args.forwardedRef,
    editorRef: args.editorRef,
    lastDocumentPointerDownTargetRef: args.lastDocumentPointerDownTargetRef,
    lastDocumentPointerDownAtRef: args.lastDocumentPointerDownAtRef,
    originalOnClick: args.originalOnClick,
    openEditor: args.openEditor,
    onEditingHostDoubleClick: handleHostDoubleClickWhileEditing,
    probe: args.probe,
    probeSelection: args.probeSelection,
  })

  return {
    handleVariableMenuMouseDownCapture,
    ...linkPopoverState,
    ...editorEvents,
    ...hostOrchestration,
  }
}
