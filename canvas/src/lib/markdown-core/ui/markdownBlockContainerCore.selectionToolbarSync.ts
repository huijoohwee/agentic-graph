import React from 'react'
import { cancelCoalescedTask, scheduleCoalescedTask } from '@/lib/async/coalescedScheduler'
import { captureInlineSelectionForToolbarAction } from '@/lib/markdown-core/ui/markdownInlineSelectionToolbarInteractions'
import {
  computeInlineSelectionToolbarPosition,
  getEditorHostRect,
  hasExpandedSelectionInRoot,
  readLiveSelectionSnapshot,
  readSelectionSyncSignature,
  resolveActiveSelectionRange,
  type LiveSelectionSnapshot,
} from './markdownBlockContainerCore.interaction'

type InlineSelectionToolbarState = { show: boolean; leftPx: number; topPx: number }

export const useMarkdownBlockContainerSelectionToolbarSync = (args: {
  editing: boolean
  editDisableRichUi: boolean
  editorRef: React.RefObject<HTMLElement | null>
  getSelectionOffsets: () => { startOffset: number; endOffset: number } | null
  setInlineSelectionToolbar: React.Dispatch<React.SetStateAction<InlineSelectionToolbarState>>
  setSlashMenu: React.Dispatch<React.SetStateAction<{ show: boolean; leftPx: number; topPx: number }>>
  setLinkPopover: React.Dispatch<React.SetStateAction<{ show: boolean; leftPx: number; topPx: number; href: string }>>
  toolbarInteractingRef: React.MutableRefObject<boolean>
  toolbarInteractionUntilRef: React.MutableRefObject<number>
  lastSelectionOffsetsRef: React.MutableRefObject<{ startOffset: number; endOffset: number } | null>
  lastNonCollapsedSelectionOffsetsRef: React.MutableRefObject<{ startOffset: number; endOffset: number } | null>
  lastNonCollapsedDomRangeRef: React.MutableRefObject<Range | null>
  liveSelectionSnapshotRef: React.MutableRefObject<LiveSelectionSnapshot | null>
  selectionSyncSuspendUntilRef: React.MutableRefObject<number>
  inlineSelectionToolbarRafRef: React.MutableRefObject<number>
  selectionSyncBurstTokenRef: React.MutableRefObject<number>
  lastInlineSelectionToolbarProbeRef: React.MutableRefObject<'show' | 'hide' | null>
  blurCommitTimerRef: React.MutableRefObject<number>
  inlineSelectionToolbarScheduleKey: string
  editorMouseUpSyncScheduleKey: string
  probe: (name: string, data?: Record<string, unknown>) => void
}) => {
  const {
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
  } = args
  const lastSelectionSignatureRef = React.useRef<string>('')
  const lastHostRectSignatureRef = React.useRef<string>('')
  const pendingSelectionSignatureRef = React.useRef<string>('')
  const captureSelectionForToolbarAction = React.useCallback(() => {
    captureInlineSelectionForToolbarAction({
      getSelectionOffsets,
      lastSelectionOffsetsRef,
      lastNonCollapsedSelectionOffsetsRef,
      lastNonCollapsedDomRangeRef,
    })
  }, [getSelectionOffsets, lastNonCollapsedDomRangeRef, lastNonCollapsedSelectionOffsetsRef, lastSelectionOffsetsRef])

  const holdToolbarInteraction = React.useCallback(() => {
    if (blurCommitTimerRef.current) {
      window.clearTimeout(blurCommitTimerRef.current)
      blurCommitTimerRef.current = 0
    }
    toolbarInteractingRef.current = true
    toolbarInteractionUntilRef.current = Date.now() + 900
    captureSelectionForToolbarAction()
  }, [blurCommitTimerRef, captureSelectionForToolbarAction, toolbarInteractionUntilRef, toolbarInteractingRef])

  const updateInlineSelectionToolbar = React.useCallback(() => {
    if (!editing) return
    if (editDisableRichUi) return
    if (toolbarInteractingRef.current) return
    const root = editorRef.current
    if (!root) return
    const domSelection = typeof window !== 'undefined' ? window.getSelection() : null
    const liveSelectionSnapshot = readLiveSelectionSnapshot({ root, selection: domSelection })
    liveSelectionSnapshotRef.current = liveSelectionSnapshot
    const selectionSyncSignature = readSelectionSyncSignature({ root, selection: domSelection }) || ''
    const selection = getSelectionOffsets()
    if (selection) lastSelectionOffsetsRef.current = selection
    const selectionSignature = selectionSyncSignature || (selection ? `${selection.startOffset}:${selection.endOffset}` : '')
    const hostRect = getEditorHostRect(root)
    const hostRectSignature = `${Math.round(hostRect.left)}:${Math.round(hostRect.top)}:${Math.round(hostRect.width)}:${Math.round(hostRect.height)}`
    if (
      selectionSignature &&
      selectionSignature === lastSelectionSignatureRef.current &&
      hostRectSignature === lastHostRectSignatureRef.current &&
      lastInlineSelectionToolbarProbeRef.current === 'show'
    ) {
      return
    }
    const activeRange = resolveActiveSelectionRange({
      root,
      selection: domSelection,
      cachedRange: lastNonCollapsedDomRangeRef.current,
    })
    if (!activeRange) {
      if (lastInlineSelectionToolbarProbeRef.current !== 'hide') {
        lastInlineSelectionToolbarProbeRef.current = 'hide'
        probe('inlineSelectionToolbar.hide', { reason: 'no-active-range' })
      }
      lastSelectionSignatureRef.current = ''
      lastHostRectSignatureRef.current = ''
      setInlineSelectionToolbar(prev => (prev.show ? { ...prev, show: false } : prev))
      return
    }
    const rect = liveSelectionSnapshot?.range === activeRange ? liveSelectionSnapshot.rect : null
    const { leftPx, topPx } = computeInlineSelectionToolbarPosition({ rangeRect: rect, hostRect })
    if (selection && selection.startOffset !== selection.endOffset) {
      lastNonCollapsedSelectionOffsetsRef.current = selection
    }
    try {
      lastNonCollapsedDomRangeRef.current = activeRange.cloneRange()
    } catch {
      void 0
    }
    setInlineSelectionToolbar(prev => {
      const next = { show: true, leftPx, topPx }
      if (prev.show && Math.abs(prev.leftPx - next.leftPx) < 1 && Math.abs(prev.topPx - next.topPx) < 1) return prev
      if (lastInlineSelectionToolbarProbeRef.current !== 'show') {
        lastInlineSelectionToolbarProbeRef.current = 'show'
        probe('inlineSelectionToolbar.show')
      }
      return next
    })
    if (selectionSignature) {
      lastSelectionSignatureRef.current = selectionSignature
      lastHostRectSignatureRef.current = hostRectSignature
    }
    setSlashMenu(prev => (prev.show ? { ...prev, show: false } : prev))
    setLinkPopover(prev => (prev.show ? { ...prev, show: false, href: '' } : prev))
  }, [editDisableRichUi, editing, editorRef, getSelectionOffsets, lastNonCollapsedDomRangeRef, lastNonCollapsedSelectionOffsetsRef, lastInlineSelectionToolbarProbeRef, lastSelectionOffsetsRef, liveSelectionSnapshotRef, probe, setInlineSelectionToolbar, setLinkPopover, setSlashMenu, toolbarInteractingRef])

  const syncSelectionToolbarState = React.useCallback(() => {
    if (!editDisableRichUi) updateInlineSelectionToolbar()
  }, [editDisableRichUi, updateInlineSelectionToolbar])

  const runSelectionSyncBurst = React.useCallback((fn: () => void) => {
    selectionSyncBurstTokenRef.current += 1
    const token = selectionSyncBurstTokenRef.current
    queueMicrotask(() => {
      if (selectionSyncBurstTokenRef.current !== token) return
      fn()
    })
  }, [selectionSyncBurstTokenRef])

  React.useEffect(() => {
    if (!editing) return
    if (editDisableRichUi) return
    const root = editorRef.current
    if (!root) return
    const schedule = () => {
      if (toolbarInteractingRef.current) return
      const selNow = typeof window !== 'undefined' ? window.getSelection() : null
      const selectionSignature = readSelectionSyncSignature({ root, selection: selNow }) || ''
      if (!selectionSignature) {
        const cached = lastNonCollapsedDomRangeRef.current
        if (!cached || cached.collapsed) return
      } else if (selectionSignature === pendingSelectionSignatureRef.current) {
        return
      } else {
        pendingSelectionSignatureRef.current = selectionSignature
      }
      const hasLiveSelection = hasExpandedSelectionInRoot({ root, selection: selNow })
      if (selNow && selNow.rangeCount > 0 && !hasLiveSelection && !lastNonCollapsedDomRangeRef.current) return
      if (Date.now() < selectionSyncSuspendUntilRef.current && !hasLiveSelection) return
      if (inlineSelectionToolbarRafRef.current) return
      inlineSelectionToolbarRafRef.current = 1
      scheduleCoalescedTask(inlineSelectionToolbarScheduleKey, () => {
        inlineSelectionToolbarRafRef.current = 0
        pendingSelectionSignatureRef.current = ''
        updateInlineSelectionToolbar()
      }, 0)
    }
    const onSelectionChange = () => schedule()
    document.addEventListener('selectionchange', onSelectionChange)
    root.addEventListener('keyup', schedule)
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
      root.removeEventListener('keyup', schedule)
      cancelCoalescedTask(inlineSelectionToolbarScheduleKey)
      cancelCoalescedTask(editorMouseUpSyncScheduleKey)
      liveSelectionSnapshotRef.current = null
      pendingSelectionSignatureRef.current = ''
      inlineSelectionToolbarRafRef.current = 0
    }
  }, [
    inlineSelectionToolbarRafRef,
    inlineSelectionToolbarScheduleKey,
    editDisableRichUi,
    editing,
    editorMouseUpSyncScheduleKey,
    editorRef,
    lastNonCollapsedDomRangeRef,
    liveSelectionSnapshotRef,
    selectionSyncSuspendUntilRef,
    toolbarInteractingRef,
    updateInlineSelectionToolbar,
  ])

  return {
    captureSelectionForToolbarAction,
    holdToolbarInteraction,
    updateInlineSelectionToolbar,
    syncSelectionToolbarState,
    runSelectionSyncBurst,
  }
}
