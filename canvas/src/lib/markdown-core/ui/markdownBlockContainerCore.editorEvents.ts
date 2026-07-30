import React from 'react'
import { scheduleCoalescedTask } from '@/lib/async/coalescedScheduler'
import type { SlashMenuState } from './markdownBlockContainerCore.menuState'
import {
  computeFloatingMenuPosition,
  getRangeRectSafe,
  hasExpandedSelectionInRoot,
  ensureWordSelectionInRoot,
  readLiveSelectionSnapshot,
  type LiveSelectionSnapshot,
} from './markdownBlockContainerCore.interaction'

type VariableMode = 'ref' | 'create' | 'update' | 'fallback' | 'delete'

const readInlineMenuSelectionRect = (args: {
  root: HTMLElement
  selection: Selection | null
}): { range: Range; rect: DOMRect | null } | null => {
  const expanded = readLiveSelectionSnapshot(args)
  if (expanded) return expanded
  const selection = args.selection
  if (!selection || selection.rangeCount <= 0) return null
  const range = selection.getRangeAt(0)
  const container = range.commonAncestorContainer
  const node = container.nodeType === 1 ? (container as Element) : container.parentElement
  if (!node || !args.root.contains(node)) return null
  return {
    range,
    rect: getRangeRectSafe(range),
  }
}

export const useMarkdownBlockContainerEditorEvents = (args: {
  editorRef: React.RefObject<HTMLElement | null>
  forbidCopy: boolean
  editPreserveWhitespace: boolean
  readEditorPlainText: () => string
  editStripLinePrefix?: (line: string) => { prefix: string; content: string }
  editLinePrefixesRef: React.MutableRefObject<string[] | null>
  editTrimEdgeNewlines: boolean
  draftRef: React.MutableRefObject<string>
  editDirtyRef: React.MutableRefObject<boolean>
  editTrimEmptyBlockEdges: boolean
  scheduleEdgeTrimBurst: () => void
  emitParityProbe: () => void
  editDisableRichUi: boolean
  getSelectionOffsets: () => { startOffset: number; endOffset: number } | null
  lastSelectionOffsetsRef: React.MutableRefObject<{ startOffset: number; endOffset: number } | null>
  setVariableMenuStable: (next: { show: boolean; leftPx: number; topPx: number; query?: string; keyInput?: string }) => void
  variableMenu: { show: boolean; keyInput: string; mode: VariableMode }
  setSlashMenuStable: (next: SlashMenuState) => void
  slashMenu: { show: boolean }
  setInlineSelectionToolbar: React.Dispatch<React.SetStateAction<{ show: boolean; leftPx: number; topPx: number }>>
  inlineSelectionToolbar: { show: boolean }
  blurCommitTimerRef: React.MutableRefObject<number>
  selectionSyncSuspendUntilRef: React.MutableRefObject<number>
  toolbarRef: React.RefObject<HTMLElement | null>
  slashMenuRef: React.RefObject<HTMLElement | null>
  variableMenuRef: React.RefObject<HTMLElement | null>
  commit: () => void | Promise<void>
  toolbarInteractingRef: React.MutableRefObject<boolean>
  toolbarInteractionUntilRef: React.MutableRefObject<number>
  editOpenBlurGuardUntilRef: React.MutableRefObject<number>
  lastEditorPointerDownAtRef: React.MutableRefObject<number>
  lastEditorPointerUpAtRef: React.MutableRefObject<number>
  lastDocumentPointerDownAtRef: React.MutableRefObject<number>
  lastDocumentPointerDownTargetRef: React.MutableRefObject<Node | null>
  lastNonCollapsedSelectionOffsetsRef: React.MutableRefObject<{ startOffset: number; endOffset: number } | null>
  lastNonCollapsedDomRangeRef: React.MutableRefObject<Range | null>
  liveSelectionSnapshotRef: React.MutableRefObject<LiveSelectionSnapshot | null>
  editorMouseUpSyncScheduleKey: string
  syncSelectionToolbarState: () => void
  runSelectionSyncBurst: (fn: () => void) => void
  cancel: () => void
  applyVariableToken: (mode: VariableMode, forcedKey?: string) => void
  linkRangeRef: React.MutableRefObject<Range | null>
  setLinkPopover: React.Dispatch<React.SetStateAction<{ show: boolean; leftPx: number; topPx: number; href: string }>>
  emitLiveDraftTextFromDom?: () => void
}) => {
  const onCopy = React.useCallback((event: React.ClipboardEvent<HTMLElement>) => {
    if (!args.forbidCopy) return
    event.preventDefault()
  }, [args.forbidCopy])

  const onCut = React.useCallback((event: React.ClipboardEvent<HTMLElement>) => {
    if (!args.forbidCopy) return
    event.preventDefault()
  }, [args.forbidCopy])

  const onInput = React.useCallback(() => {
    args.editOpenBlurGuardUntilRef.current = 0
    const el = args.editorRef.current
    if (!el) return
    const rawText = typeof (el as HTMLElement).innerText === 'string'
      ? (el as HTMLElement).innerText
      : String(el.textContent || '')
    const rawNormalized = rawText.replace(/\r/g, '')
    const editorPlainText = args.readEditorPlainText()
    const textRaw = args.editPreserveWhitespace
      ? editorPlainText
      : editorPlainText.length === rawNormalized.length
      ? rawNormalized
      : editorPlainText
    const preserveQuoteOnlyBlankLineStructure =
      !!args.editStripLinePrefix &&
      Array.isArray(args.editLinePrefixesRef.current) &&
      args.editLinePrefixesRef.current.length > 1 &&
      !String(textRaw || '').trim() &&
      args.editLinePrefixesRef.current.some(prefix => /^\s*(?:>\s*)+$/.test(String(prefix || '')))
    const text = args.editTrimEdgeNewlines
      ? (preserveQuoteOnlyBlankLineStructure ? textRaw : textRaw.replace(/^\n+/, '').replace(/\n+$/, ''))
      : textRaw
    const domDraftControlsSsot = typeof args.emitLiveDraftTextFromDom === 'function'
    // Keep rich-text draft state sourced from DOM serialization so toolbar mutations
    // cannot transiently overwrite semantic HTML markup with plain text.
    if (!domDraftControlsSsot) args.draftRef.current = text
    args.editDirtyRef.current = true
    args.emitLiveDraftTextFromDom?.()
    if (args.editTrimEmptyBlockEdges) args.scheduleEdgeTrimBurst()
    args.emitParityProbe()
    if (args.editDisableRichUi) return
    const sel = typeof window !== 'undefined' ? window.getSelection() : null
    const snapshot = readInlineMenuSelectionRect({ root: el, selection: sel })
    args.liveSelectionSnapshotRef.current = snapshot
    const rect = snapshot?.rect || null
    if (!rect) return
    const { leftPx, topPx } = computeFloatingMenuPosition({ rangeRect: rect, root: el })
    const offsets = args.getSelectionOffsets()
    if (offsets) args.lastSelectionOffsetsRef.current = offsets
    const caretOffset = offsets?.startOffset ?? 0
    const lineStartIdx = text.lastIndexOf('\n', Math.max(0, caretOffset) - 1) + 1
    const preceding = text.slice(lineStartIdx, Math.max(lineStartIdx, Math.min(text.length, caretOffset)))
    const atMatch = /@([A-Za-z0-9_.-]{0,64})$/.exec(preceding)
    const semanticMatch = /#([A-Za-z0-9_.-]{0,64})$/.exec(preceding)
    if (atMatch) {
      const query = String(atMatch[1] || '')
      args.setVariableMenuStable({ show: true, leftPx, topPx, query, keyInput: query || args.variableMenu.keyInput })
      args.setSlashMenuStable({ show: false, leftPx: 0, topPx: 0 })
      args.setInlineSelectionToolbar(prev => (prev.show ? { ...prev, show: false } : prev))
    } else if (semanticMatch) {
      const query = String(semanticMatch[1] || '')
      args.setSlashMenuStable({
        show: true,
        leftPx,
        topPx,
        kind: 'semantic',
        query,
        triggerRange: { startOffset: caretOffset - semanticMatch[0].length, endOffset: caretOffset },
      })
      args.setVariableMenuStable({ show: false, leftPx: 0, topPx: 0, query: '', keyInput: '' })
      args.setInlineSelectionToolbar(prev => (prev.show ? { ...prev, show: false } : prev))
    } else if (/\/$/.test(preceding)) {
      args.setSlashMenuStable({
        show: true,
        leftPx,
        topPx,
        kind: 'slash',
        query: '',
        triggerRange: { startOffset: Math.max(0, caretOffset - 1), endOffset: caretOffset },
      })
      args.setVariableMenuStable({ show: false, leftPx: 0, topPx: 0, query: '', keyInput: '' })
      args.setInlineSelectionToolbar(prev => (prev.show ? { ...prev, show: false } : prev))
    } else if (args.slashMenu.show) {
      args.setSlashMenuStable({ show: false, leftPx: 0, topPx: 0 })
    } else if (args.variableMenu.show) {
      args.setVariableMenuStable({ show: false, leftPx: 0, topPx: 0, query: '', keyInput: '' })
    }
  }, [args])

  const onBlur = React.useCallback((event: React.FocusEvent<HTMLElement>) => {
    const scheduleBlurCommit = (delayMs: number) => {
      if (args.blurCommitTimerRef.current) {
        window.clearTimeout(args.blurCommitTimerRef.current)
        args.blurCommitTimerRef.current = 0
      }
      args.blurCommitTimerRef.current = window.setTimeout(() => {
        args.blurCommitTimerRef.current = 0
        const currentRoot = args.editorRef.current
        if (!currentRoot) return
        if (args.toolbarInteractingRef.current || Date.now() < args.toolbarInteractionUntilRef.current) {
          scheduleBlurCommit(60)
          return
        }
        const active = document.activeElement
        if (active && currentRoot.contains(active)) return
        const toolbarNode = args.toolbarRef.current
        if (active && toolbarNode && toolbarNode.contains(active)) return
        const slashNode = args.slashMenuRef.current
        if (active && slashNode && slashNode.contains(active)) return
        const variableNode = args.variableMenuRef.current
        if (active && variableNode && variableNode.contains(active)) return
        args.setVariableMenuStable({ show: false, leftPx: 0, topPx: 0, query: '', keyInput: '' })
        args.commit()
      }, delayMs)
    }
    if (args.blurCommitTimerRef.current) {
      window.clearTimeout(args.blurCommitTimerRef.current)
      args.blurCommitTimerRef.current = 0
    }
    const nextFocusForGuard = event.relatedTarget instanceof Node ? event.relatedTarget : null
    const rootForGuard = args.editorRef.current
    if (nextFocusForGuard && rootForGuard && !rootForGuard.contains(nextFocusForGuard)) {
      const toolbarNode = args.toolbarRef.current
      const slashNode = args.slashMenuRef.current
      const variableNode = args.variableMenuRef.current
      if (!(toolbarNode && toolbarNode.contains(nextFocusForGuard)) && !(slashNode && slashNode.contains(nextFocusForGuard)) && !(variableNode && variableNode.contains(nextFocusForGuard))) {
        args.toolbarInteractingRef.current = false
        args.toolbarInteractionUntilRef.current = 0
      }
    }
    if (Date.now() < args.selectionSyncSuspendUntilRef.current) return scheduleBlurCommit(120)
    const root = args.editorRef.current
    if (Date.now() < args.selectionSyncSuspendUntilRef.current && root) {
      const selNow = typeof window !== 'undefined' ? window.getSelection() : null
      if (hasExpandedSelectionInRoot({ root, selection: selNow })) return
    }
    if (args.toolbarInteractingRef.current) return scheduleBlurCommit(60)
    if (Date.now() < args.toolbarInteractionUntilRef.current) return scheduleBlurCommit(60)
    if (!args.editDisableRichUi) {
      const cached = args.lastNonCollapsedSelectionOffsetsRef.current
      if (args.inlineSelectionToolbar.show || (cached && cached.startOffset !== cached.endOffset)) {
        if (Date.now() < args.selectionSyncSuspendUntilRef.current) return
        scheduleBlurCommit(50)
        return
      }
    }
    if (args.inlineSelectionToolbar.show) return scheduleBlurCommit(40)
    const nextFocus = event.relatedTarget as Node | null
    if (root) {
      if (nextFocus && root.contains(nextFocus)) return
      const toolbarNode = args.toolbarRef.current
      if (nextFocus && toolbarNode && toolbarNode.contains(nextFocus)) return
      const slashNode = args.slashMenuRef.current
      if (nextFocus && slashNode && slashNode.contains(nextFocus)) return
      const variableNode = args.variableMenuRef.current
      if (nextFocus && variableNode && variableNode.contains(nextFocus)) return
      const active = document.activeElement
      if (active && root.contains(active)) return
      if (active && toolbarNode && toolbarNode.contains(active)) return
      if (active && slashNode && slashNode.contains(active)) return
      if (active && variableNode && variableNode.contains(active)) return
      const selNow = typeof window !== 'undefined' ? window.getSelection() : null
      if (!nextFocus && hasExpandedSelectionInRoot({ root, selection: selNow })) return
    }
    if (Date.now() < args.editOpenBlurGuardUntilRef.current) return scheduleBlurCommit(60)
    if (Date.now() - args.lastEditorPointerDownAtRef.current < 420 || Date.now() - args.lastEditorPointerUpAtRef.current < 260) {
      return scheduleBlurCommit(40)
    }
    const pointerTarget = Date.now() - args.lastDocumentPointerDownAtRef.current < 1200 ? args.lastDocumentPointerDownTargetRef.current : null
    args.lastDocumentPointerDownTargetRef.current = null
    if (!pointerTarget) return scheduleBlurCommit(40)
    const toolbarNode = args.toolbarRef.current
    const slashNode = args.slashMenuRef.current
    const variableNode = args.variableMenuRef.current
    if ((root && root.contains(pointerTarget)) || (toolbarNode && toolbarNode.contains(pointerTarget)) || (slashNode && slashNode.contains(pointerTarget)) || (variableNode && variableNode.contains(pointerTarget))) {
      return
    }
    const pointerEl = pointerTarget.nodeType === Node.ELEMENT_NODE ? (pointerTarget as Element) : pointerTarget.parentElement
    const pointerLineHost = pointerEl?.closest('[data-start-line]')
    if (!pointerLineHost) return scheduleBlurCommit(40)
    scheduleBlurCommit(30)
  }, [args])

  React.useEffect(() => {
    const doc = typeof document !== 'undefined' ? document : null
    const NodeRef = doc?.defaultView?.Node || (typeof Node !== 'undefined' ? Node : null)
    if (!doc || !NodeRef) return undefined
    const onDocumentFocusOutCapture = (event: FocusEvent) => {
      const root = args.editorRef.current
      if (!root) return
      const target = event.target
      if (!(target instanceof NodeRef)) return
      if (!root.contains(target)) return
      onBlur(event as unknown as React.FocusEvent<HTMLElement>)
    }
    doc.addEventListener('focusout', onDocumentFocusOutCapture, true)
    doc.addEventListener('blur', onDocumentFocusOutCapture, true)
    return () => {
      doc.removeEventListener('focusout', onDocumentFocusOutCapture, true)
      doc.removeEventListener('blur', onDocumentFocusOutCapture, true)
    }
  }, [args.editorRef, onBlur])

  

  const onFocus = React.useCallback(() => {
    if (args.blurCommitTimerRef.current) {
      window.clearTimeout(args.blurCommitTimerRef.current)
      args.blurCommitTimerRef.current = 0
    }
    args.toolbarInteractingRef.current = false
    args.toolbarInteractionUntilRef.current = 0
    args.emitParityProbe()
  }, [args])

  const onMouseDown = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    args.lastEditorPointerDownAtRef.current = Date.now()
    if (event.detail >= 2) args.selectionSyncSuspendUntilRef.current = Date.now() + 120
  }, [args.lastEditorPointerDownAtRef, args.selectionSyncSuspendUntilRef])

  const onMouseUp = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    args.lastEditorPointerUpAtRef.current = Date.now()
    const pointerSelection = args.getSelectionOffsets()
    if (pointerSelection) args.lastSelectionOffsetsRef.current = pointerSelection
    const selNow = typeof window !== 'undefined' ? window.getSelection() : null
    let capturedNonCollapsedSelection = false
    if (selNow && selNow.rangeCount > 0) {
      const rr = selNow.getRangeAt(0)
      if (!rr.collapsed) {
        capturedNonCollapsedSelection = true
        args.liveSelectionSnapshotRef.current = { range: rr, rect: getRangeRectSafe(rr) }
        const selection = args.getSelectionOffsets()
        if (selection) args.lastSelectionOffsetsRef.current = selection
        if (selection && selection.startOffset !== selection.endOffset) args.lastNonCollapsedSelectionOffsetsRef.current = selection
        try {
          args.lastNonCollapsedDomRangeRef.current = rr.cloneRange()
        } catch {
          void 0
        }
      }
    }
    const shouldResolveWordSelection = event.detail >= 2 || Date.now() < args.editOpenBlurGuardUntilRef.current
    if (!capturedNonCollapsedSelection && shouldResolveWordSelection) {
      const root = args.editorRef.current
      if (root && ensureWordSelectionInRoot(root)) {
        const nextSelection = typeof window !== 'undefined' ? window.getSelection() : null
        if (nextSelection && nextSelection.rangeCount > 0) {
          const rr = nextSelection.getRangeAt(0)
          if (!rr.collapsed) {
            args.liveSelectionSnapshotRef.current = { range: rr, rect: getRangeRectSafe(rr) }
            const selection = args.getSelectionOffsets()
            if (selection) args.lastSelectionOffsetsRef.current = selection
            if (selection && selection.startOffset !== selection.endOffset) args.lastNonCollapsedSelectionOffsetsRef.current = selection
            try {
              args.lastNonCollapsedDomRangeRef.current = rr.cloneRange()
            } catch {
              void 0
            }
          }
        }
      }
    }
    const syncDelay = event.detail >= 2 ? 24 : 0
    if (event.detail >= 2) args.selectionSyncSuspendUntilRef.current = Date.now() + 120
    scheduleCoalescedTask(args.editorMouseUpSyncScheduleKey, () => {
      args.syncSelectionToolbarState()
    }, syncDelay)
  }, [args])

  const onDoubleClick = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation()
    args.selectionSyncSuspendUntilRef.current = Date.now() + 120
    const runWhenEditorReady = (attempt: number) => {
      const root = args.editorRef.current
      if (!root) {
        if (attempt < 4) {
          window.requestAnimationFrame(() => runWhenEditorReady(attempt + 1))
        }
        return
      }
      const selNow = typeof window !== 'undefined' ? window.getSelection() : null
      const hasSelection = hasExpandedSelectionInRoot({ root, selection: selNow })
      if (!hasSelection && attempt < 4) {
        window.requestAnimationFrame(() => runWhenEditorReady(attempt + 1))
        return
      }
      args.runSelectionSyncBurst(args.syncSelectionToolbarState)
      scheduleCoalescedTask(args.editorMouseUpSyncScheduleKey, () => {
        args.syncSelectionToolbarState()
      }, 24)
    }
    window.requestAnimationFrame(() => runWhenEditorReady(0))
  }, [args])

  const onKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    args.editOpenBlurGuardUntilRef.current = 0
    if (event.key === 'Escape') {
      event.preventDefault()
      if (args.variableMenu.show) {
        args.setVariableMenuStable({ show: false, leftPx: 0, topPx: 0, query: '', keyInput: '' })
        return
      }
      if (args.slashMenu.show) {
        args.setSlashMenuStable({ show: false, leftPx: 0, topPx: 0 })
        return
      }
      args.cancel()
      return
    }
    if (args.editDisableRichUi) {
      if (args.forbidCopy && (event.metaKey || event.ctrlKey)) {
        const key = String(event.key || '').toLowerCase()
        if (key === 'c' || key === 'x') {
          event.preventDefault()
          return
        }
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        args.commit()
      }
      return
    }
    if (event.key === 'Enter' && args.slashMenu.show) {
      event.preventDefault()
      return
    }
    if (event.key === 'Enter' && args.variableMenu.show) {
      event.preventDefault()
      args.applyVariableToken(args.variableMenu.mode === 'update' ? 'update' : args.variableMenu.mode)
      return
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      args.commit()
    }
    if (args.forbidCopy && (event.metaKey || event.ctrlKey)) {
      const key = String(event.key || '').toLowerCase()
      if (key === 'c' || key === 'x') {
        event.preventDefault()
        return
      }
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      const el = args.editorRef.current
      if (!el) return
      const sel = typeof window !== 'undefined' ? window.getSelection() : null
      const snapshot = readLiveSelectionSnapshot({ root: el, selection: sel })
      const range = snapshot?.range || null
      if (!range) return
      args.liveSelectionSnapshotRef.current = snapshot
      args.linkRangeRef.current = range.cloneRange()
      const rect = snapshot?.rect || null
      const { leftPx, topPx } = computeFloatingMenuPosition({ rangeRect: rect, root: el })
      args.setLinkPopover({ show: true, leftPx, topPx, href: '' })
      args.setInlineSelectionToolbar(prev => (prev.show ? { ...prev, show: false } : prev))
    }
  }, [args])

  return {
    onInput,
    onCopy,
    onCut,
    onBlur,
    onFocus,
    onMouseDown,
    onMouseUp,
    onDoubleClick,
    onKeyDown,
  }
}
