import React from 'react'
import { isInteractiveEventTarget } from './kanbanMenu'
import type { KanbanDropPosition } from './kanbanReorder'

const KANBAN_ROW_ID_DATA_KEY = 'application/x-agentic-graph-kanban-row-id'
const KANBAN_GROUP_KEY_DATA_KEY = 'application/x-agentic-graph-kanban-group-key'
const KANBAN_EDGE_SCROLL_THRESHOLD_PX = 56
const KANBAN_BOARD_EDGE_SCROLL_STEP_PX = 18
const KANBAN_LANE_EDGE_SCROLL_STEP_PX = 14
const KANBAN_LANE_HOVER_DWELL_MS = 90
const KANBAN_DIRECTIONAL_LANE_ENTRY_BIAS_PX = 28
const KANBAN_DIRECTIONAL_LANE_ENTRY_BIAS_DWELL_MS = 45
const KANBAN_CARD_TARGET_HYSTERESIS_PX = 16
const KANBAN_COMMIT_FEEDBACK_MS = 1200
const KANBAN_FOCUS_RECOVERY_MAX_FRAMES = 12

const readTransferText = (event: React.DragEvent<HTMLElement>, key: string): string => {
  const dataTransfer = event.dataTransfer
  if (!dataTransfer) return ''
  return String(dataTransfer.getData(key) || '').trim()
}

const readDraggedRowId = (event: React.DragEvent<HTMLElement>): string => {
  return readTransferText(event, KANBAN_ROW_ID_DATA_KEY) || readTransferText(event, 'text/plain')
}

const readDraggedGroupKey = (event: React.DragEvent<HTMLElement>): string => {
  return readTransferText(event, KANBAN_GROUP_KEY_DATA_KEY)
}

export type KanbanCardDragProps = {
  draggable?: boolean
  onDragStart?: React.DragEventHandler<HTMLElement>
  onDragEnd?: React.DragEventHandler<HTMLElement>
}

export type KanbanCardDropProps = {
  onDragEnter?: React.DragEventHandler<HTMLElement>
  onDragOver?: React.DragEventHandler<HTMLElement>
  onDragLeave?: React.DragEventHandler<HTMLElement>
  onDrop?: React.DragEventHandler<HTMLElement>
}

export type KanbanLaneDropProps = {
  onDragEnter?: React.DragEventHandler<HTMLElement>
  onDragOver?: React.DragEventHandler<HTMLElement>
  onDragLeave?: React.DragEventHandler<HTMLElement>
  onDrop?: React.DragEventHandler<HTMLElement>
}

type KanbanCommittedMove = {
  rowId: string
  sourceGroupKey: string
  targetGroupKey: string
  targetRowId: string | null
  position: KanbanDropPosition
}

type KanbanBlockedMoveReason =
  | 'start-of-lane'
  | 'end-of-lane'
  | 'start-of-board'
  | 'end-of-board'

export const useKanbanDragAndDrop = (args: {
  enabled: boolean
  getBoardScrollElement?: () => HTMLElement | null
  getLaneScrollElement?: (groupKey: string) => HTMLElement | null
  isNoOpMove?: (move: {
    rowId: string
    sourceGroupKey: string
    targetGroupKey: string
    targetRowId: string | null
    position: KanbanDropPosition
  }) => boolean
  buildOutcomeMessage?: (args: {
    kind: 'blocked' | 'cancelled' | 'no-op' | 'committed'
    move?: {
      rowId: string
      sourceGroupKey: string
      targetGroupKey: string
      targetRowId: string | null
      position: KanbanDropPosition
    }
    sourceGroupKey?: string | null
    blockedReason?: KanbanBlockedMoveReason | null
  }) => string
  onCommitMove: (move: {
    rowId: string
    sourceGroupKey: string
    targetGroupKey: string
    targetRowId: string | null
    position: KanbanDropPosition
  }) => void
}) => {
  const [draggingRowId, setDraggingRowId] = React.useState<string | null>(null)
  const [dragOutcomeMessage, setDragOutcomeMessage] = React.useState('')
  const [dragOutcomeSequence, setDragOutcomeSequence] = React.useState(0)
  const [commitFlashGroupKey, setCommitFlashGroupKey] = React.useState<string | null>(null)
  const [commitFlashRowId, setCommitFlashRowId] = React.useState<string | null>(null)
  const [dragSourceGroupKey, setDragSourceGroupKey] = React.useState<string | null>(null)
  const [dragOverGroupKey, setDragOverGroupKey] = React.useState<string | null>(null)
  const [dragOverRowId, setDragOverRowId] = React.useState<string | null>(null)
  const [dragOverPosition, setDragOverPosition] = React.useState<KanbanDropPosition>('end')
  const [pendingFocusRowId, setPendingFocusRowId] = React.useState<string | null>(null)
  const dragOverGroupKeyRef = React.useRef<string | null>(null)
  const dragOverRowIdRef = React.useRef<string | null>(null)
  const dragOverPositionRef = React.useRef<KanbanDropPosition>('end')
  const pendingFocusRowIdRef = React.useRef<string | null>(null)
  const dragPointerClientRef = React.useRef<{ x: number; y: number } | null>(null)
  const lastPointerClientRef = React.useRef<{ x: number; y: number } | null>(null)
  const lastAppliedTargetPointerRef = React.useRef<{ x: number; y: number } | null>(null)
  const boardScrollDirectionRef = React.useRef(0)
  const laneScrollDirectionRef = React.useRef(0)
  const animationFrameIdRef = React.useRef(0)
  const focusRecoveryFrameIdRef = React.useRef<number | null>(null)
  const focusableRowElementsRef = React.useRef(new Map<string, HTMLElement>())
  const dragCompletionRef = React.useRef<'commit' | 'cancelled' | 'no-op' | null>(null)
  const commitFeedbackTimeoutRef = React.useRef<number | null>(null)
  const pendingLaneHoverTimeoutRef = React.useRef<number | null>(null)
  const pendingLaneHoverTargetRef = React.useRef<{
    groupKey: string
    rowId: string | null
    position: KanbanDropPosition
    clientX: number
    clientY: number
  } | null>(null)
  const draggingRowIdRef = React.useRef<string | null>(null)
  const dragSourceGroupKeyRef = React.useRef<string | null>(null)

  const clearCommitFeedback = React.useCallback(() => {
    if (commitFeedbackTimeoutRef.current != null) {
      window.clearTimeout(commitFeedbackTimeoutRef.current)
      commitFeedbackTimeoutRef.current = null
    }
    setDragOutcomeMessage('')
    setCommitFlashGroupKey(null)
    setCommitFlashRowId(null)
  }, [])

  const clearPendingLaneHover = React.useCallback(() => {
    if (pendingLaneHoverTimeoutRef.current != null) {
      window.clearTimeout(pendingLaneHoverTimeoutRef.current)
      pendingLaneHoverTimeoutRef.current = null
    }
    pendingLaneHoverTargetRef.current = null
  }, [])

  const clearPendingFocus = React.useCallback(() => {
    if (focusRecoveryFrameIdRef.current != null) {
      window.cancelAnimationFrame(focusRecoveryFrameIdRef.current)
      focusRecoveryFrameIdRef.current = null
    }
    pendingFocusRowIdRef.current = null
    setPendingFocusRowId(null)
  }, [])

  const attemptFocusRow = React.useCallback((rowId: string) => {
    const element = focusableRowElementsRef.current.get(rowId) || null
    if (!element || !element.isConnected) {
      if (element && !element.isConnected) {
        focusableRowElementsRef.current.delete(rowId)
      }
      return false
    }
    try {
      element.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      })
    } catch {
      void 0
    }
    try {
      element.focus({ preventScroll: true })
    } catch {
      try {
        element.focus()
      } catch {
        return false
      }
    }
    return true
  }, [])

  const requestFocusRow = React.useCallback((rowId: string | null) => {
    if (!rowId) {
      clearPendingFocus()
      return
    }
    pendingFocusRowIdRef.current = rowId
    setPendingFocusRowId(rowId)
  }, [clearPendingFocus])

  const registerFocusableRowElement = React.useCallback((argsValue: {
    rowId: string
    element: HTMLElement | null
  }) => {
    if (argsValue.element) {
      focusableRowElementsRef.current.set(argsValue.rowId, argsValue.element)
      if (pendingFocusRowIdRef.current === argsValue.rowId) {
        if (focusRecoveryFrameIdRef.current != null) {
          window.cancelAnimationFrame(focusRecoveryFrameIdRef.current)
        }
        focusRecoveryFrameIdRef.current = window.requestAnimationFrame(() => {
          focusRecoveryFrameIdRef.current = null
          if (attemptFocusRow(argsValue.rowId)) {
            clearPendingFocus()
          }
        })
      }
      return
    }
    focusableRowElementsRef.current.delete(argsValue.rowId)
  }, [attemptFocusRow, clearPendingFocus])

  const applyDropTarget = React.useCallback((target: {
    groupKey: string
    rowId: string | null
    position: KanbanDropPosition
    clientX?: number
    clientY?: number
  }) => {
    dragOverGroupKeyRef.current = target.groupKey
    dragOverRowIdRef.current = target.rowId
    dragOverPositionRef.current = target.position
    if (typeof target.clientX === 'number' && typeof target.clientY === 'number') {
      lastAppliedTargetPointerRef.current = { x: target.clientX, y: target.clientY }
    }
    setDragOverGroupKey(target.groupKey)
    setDragOverRowId(target.rowId)
    setDragOverPosition(target.position)
  }, [])

  const clearActiveDropTarget = React.useCallback(() => {
    dragOverGroupKeyRef.current = null
    dragOverRowIdRef.current = null
    dragOverPositionRef.current = 'end'
    lastAppliedTargetPointerRef.current = null
    setDragOverGroupKey(null)
    setDragOverRowId(null)
    setDragOverPosition('end')
  }, [])

  const resolveDraggedRowId = React.useCallback((event: React.DragEvent<HTMLElement>): string => {
    return readDraggedRowId(event) || draggingRowIdRef.current || draggingRowId || ''
  }, [draggingRowId])

  const resolveDraggedGroupKey = React.useCallback((event: React.DragEvent<HTMLElement>): string => {
    return readDraggedGroupKey(event) || dragSourceGroupKeyRef.current || dragSourceGroupKey || ''
  }, [dragSourceGroupKey])

  const updateAutoScrollTargets = React.useCallback((clientX: number, clientY: number, groupKey: string | null) => {
    lastPointerClientRef.current = dragPointerClientRef.current
    dragPointerClientRef.current = { x: clientX, y: clientY }

    const boardEl = args.getBoardScrollElement?.() || null
    if (boardEl) {
      const rect = boardEl.getBoundingClientRect()
      const maxScrollLeft = Math.max(0, boardEl.scrollWidth - boardEl.clientWidth)
      if (clientX < rect.left + KANBAN_EDGE_SCROLL_THRESHOLD_PX && boardEl.scrollLeft > 0) {
        boardScrollDirectionRef.current = -1
      } else if (clientX > rect.right - KANBAN_EDGE_SCROLL_THRESHOLD_PX && boardEl.scrollLeft < maxScrollLeft) {
        boardScrollDirectionRef.current = 1
      } else {
        boardScrollDirectionRef.current = 0
      }
    } else {
      boardScrollDirectionRef.current = 0
    }

    const laneEl = groupKey ? args.getLaneScrollElement?.(groupKey) || null : null
    if (laneEl) {
      const rect = laneEl.getBoundingClientRect()
      const maxScrollTop = Math.max(0, laneEl.scrollHeight - laneEl.clientHeight)
      if (clientY < rect.top + KANBAN_EDGE_SCROLL_THRESHOLD_PX && laneEl.scrollTop > 0) {
        laneScrollDirectionRef.current = -1
      } else if (clientY > rect.bottom - KANBAN_EDGE_SCROLL_THRESHOLD_PX && laneEl.scrollTop < maxScrollTop) {
        laneScrollDirectionRef.current = 1
      } else {
        laneScrollDirectionRef.current = 0
      }
    } else {
      laneScrollDirectionRef.current = 0
    }
  }, [args.getBoardScrollElement, args.getLaneScrollElement])

  const resolveDropTarget = React.useCallback((target: {
    groupKey: string
    rowId: string | null
    position: KanbanDropPosition
    clientX: number
    clientY: number
  }) => {
    updateAutoScrollTargets(target.clientX, target.clientY, target.groupKey)
    const currentGroupKey = dragOverGroupKeyRef.current
    const lastAppliedPointer = lastAppliedTargetPointerRef.current
    if (
      currentGroupKey === target.groupKey &&
      dragOverRowIdRef.current != null &&
      target.rowId != null &&
      dragOverRowIdRef.current !== target.rowId &&
      lastAppliedPointer &&
      Math.abs(target.clientY - lastAppliedPointer.y) < KANBAN_CARD_TARGET_HYSTERESIS_PX
    ) {
      return true
    }
    if (
      currentGroupKey === target.groupKey &&
      dragOverRowIdRef.current === target.rowId &&
      target.rowId != null &&
      lastAppliedPointer &&
      Math.abs(target.clientY - lastAppliedPointer.y) < KANBAN_CARD_TARGET_HYSTERESIS_PX
    ) {
      target = {
        ...target,
        position: dragOverPositionRef.current,
      }
    }
    if (currentGroupKey == null || currentGroupKey === target.groupKey) {
      clearPendingLaneHover()
      applyDropTarget(target)
      return true
    }
    const pending = pendingLaneHoverTargetRef.current
    if (
      pending &&
      pending.groupKey === target.groupKey &&
      pending.rowId === target.rowId &&
      pending.position === target.position
    ) {
      pendingLaneHoverTargetRef.current = target
      return true
    }
    clearPendingLaneHover()
    pendingLaneHoverTargetRef.current = target
    const previousPointer = lastPointerClientRef.current
    const horizontalCommitPx = previousPointer ? Math.abs(target.clientX - previousPointer.x) : 0
    const dwellMs = horizontalCommitPx >= KANBAN_DIRECTIONAL_LANE_ENTRY_BIAS_PX
      ? KANBAN_DIRECTIONAL_LANE_ENTRY_BIAS_DWELL_MS
      : KANBAN_LANE_HOVER_DWELL_MS
    pendingLaneHoverTimeoutRef.current = window.setTimeout(() => {
      const nextTarget = pendingLaneHoverTargetRef.current
      pendingLaneHoverTimeoutRef.current = null
      pendingLaneHoverTargetRef.current = null
      if (!nextTarget) return
      applyDropTarget(nextTarget)
      updateAutoScrollTargets(nextTarget.clientX, nextTarget.clientY, nextTarget.groupKey)
    }, dwellMs)
    return true
  }, [applyDropTarget, clearPendingLaneHover, updateAutoScrollTargets])

  const resetDragState = React.useCallback(() => {
    clearPendingLaneHover()
    setDraggingRowId(null)
    setDragSourceGroupKey(null)
    draggingRowIdRef.current = null
    dragSourceGroupKeyRef.current = null
    clearActiveDropTarget()
    dragPointerClientRef.current = null
    lastPointerClientRef.current = null
    boardScrollDirectionRef.current = 0
    laneScrollDirectionRef.current = 0
  }, [clearActiveDropTarget, clearPendingLaneHover])

  React.useEffect(() => clearPendingLaneHover, [clearPendingLaneHover])
  React.useEffect(() => clearCommitFeedback, [clearCommitFeedback])
  React.useEffect(() => clearPendingFocus, [clearPendingFocus])

  React.useEffect(() => {
    if (!pendingFocusRowId) return
    if (attemptFocusRow(pendingFocusRowId)) {
      clearPendingFocus()
      return
    }
    let frameCount = 0
    const retryFocus = () => {
      if (!pendingFocusRowIdRef.current) {
        focusRecoveryFrameIdRef.current = null
        return
      }
      if (attemptFocusRow(pendingFocusRowIdRef.current)) {
        focusRecoveryFrameIdRef.current = null
        clearPendingFocus()
        return
      }
      frameCount += 1
      if (frameCount >= KANBAN_FOCUS_RECOVERY_MAX_FRAMES) {
        focusRecoveryFrameIdRef.current = null
        clearPendingFocus()
        return
      }
      focusRecoveryFrameIdRef.current = window.requestAnimationFrame(retryFocus)
    }
    focusRecoveryFrameIdRef.current = window.requestAnimationFrame(retryFocus)
    return () => {
      if (focusRecoveryFrameIdRef.current != null) {
        window.cancelAnimationFrame(focusRecoveryFrameIdRef.current)
        focusRecoveryFrameIdRef.current = null
      }
    }
  }, [attemptFocusRow, clearPendingFocus, pendingFocusRowId])

  const setDragOutcome = React.useCallback((argsValue: Parameters<NonNullable<typeof args.buildOutcomeMessage>>[0]) => {
    const message = args.buildOutcomeMessage?.(argsValue)
    setDragOutcomeMessage(String(message || '').trim())
    setDragOutcomeSequence(value => value + 1)
  }, [args.buildOutcomeMessage])

  const reportBlockedMove = React.useCallback((argsValue: {
    rowId: string
    sourceGroupKey: string
    reason: KanbanBlockedMoveReason
  }) => {
    clearCommitFeedback()
    requestFocusRow(argsValue.rowId)
    setDragOutcome({
      kind: 'blocked',
      sourceGroupKey: argsValue.sourceGroupKey,
      blockedReason: argsValue.reason,
    })
  }, [clearCommitFeedback, requestFocusRow, setDragOutcome])

  const confirmCommittedMove = React.useCallback((move: KanbanCommittedMove) => {
    clearCommitFeedback()
    setCommitFlashGroupKey(move.targetGroupKey)
    setCommitFlashRowId(move.rowId)
    requestFocusRow(move.rowId)
    setDragOutcome({
      kind: 'committed',
      move,
    })
    commitFeedbackTimeoutRef.current = window.setTimeout(() => {
      commitFeedbackTimeoutRef.current = null
      setDragOutcomeMessage('')
      setCommitFlashGroupKey(null)
      setCommitFlashRowId(null)
    }, KANBAN_COMMIT_FEEDBACK_MS)
  }, [clearCommitFeedback, requestFocusRow, setDragOutcome])

  const commitMove = React.useCallback((move: KanbanCommittedMove): 'committed' | 'no-op' => {
    if (args.isNoOpMove?.(move)) {
      clearCommitFeedback()
      requestFocusRow(move.rowId)
      setDragOutcome({
        kind: 'no-op',
        move,
      })
      return 'no-op'
    }
    confirmCommittedMove(move)
    args.onCommitMove(move)
    return 'committed'
  }, [args.isNoOpMove, args.onCommitMove, clearCommitFeedback, confirmCommittedMove, requestFocusRow, setDragOutcome])

  React.useEffect(() => {
    if (!args.enabled || draggingRowId == null) return
    const tick = () => {
      const pointer = dragPointerClientRef.current
      if (pointer) {
        const boardEl = args.getBoardScrollElement?.() || null
        if (boardEl && boardScrollDirectionRef.current !== 0) {
          const maxScrollLeft = Math.max(0, boardEl.scrollWidth - boardEl.clientWidth)
          const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, boardEl.scrollLeft + boardScrollDirectionRef.current * KANBAN_BOARD_EDGE_SCROLL_STEP_PX))
          if (nextScrollLeft !== boardEl.scrollLeft) {
            boardEl.scrollLeft = nextScrollLeft
            updateAutoScrollTargets(pointer.x, pointer.y, dragOverGroupKey)
          } else {
            boardScrollDirectionRef.current = 0
          }
        }
        const laneEl = dragOverGroupKey ? args.getLaneScrollElement?.(dragOverGroupKey) || null : null
        if (laneEl && laneScrollDirectionRef.current !== 0) {
          const maxScrollTop = Math.max(0, laneEl.scrollHeight - laneEl.clientHeight)
          const nextScrollTop = Math.min(maxScrollTop, Math.max(0, laneEl.scrollTop + laneScrollDirectionRef.current * KANBAN_LANE_EDGE_SCROLL_STEP_PX))
          if (nextScrollTop !== laneEl.scrollTop) {
            laneEl.scrollTop = nextScrollTop
            updateAutoScrollTargets(pointer.x, pointer.y, dragOverGroupKey)
          } else {
            laneScrollDirectionRef.current = 0
          }
        }
      }
      animationFrameIdRef.current = window.requestAnimationFrame(tick)
    }
    animationFrameIdRef.current = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(animationFrameIdRef.current)
      animationFrameIdRef.current = 0
    }
  }, [args.enabled, args.getBoardScrollElement, args.getLaneScrollElement, dragOverGroupKey, draggingRowId, updateAutoScrollTargets])

  const createCardDragProps = React.useCallback((card: { rowId: string; groupKey: string }): KanbanCardDragProps => {
    if (!args.enabled) return {}
    return {
      draggable: true,
      onDragStart: event => {
        if (isInteractiveEventTarget(event.target)) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        dragCompletionRef.current = null
        clearCommitFeedback()
        clearPendingFocus()
        setDraggingRowId(card.rowId)
        setDragSourceGroupKey(card.groupKey)
        draggingRowIdRef.current = card.rowId
        dragSourceGroupKeyRef.current = card.groupKey
        applyDropTarget({ groupKey: card.groupKey, rowId: null, position: 'end' })
        updateAutoScrollTargets(event.clientX, event.clientY, card.groupKey)
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData(KANBAN_ROW_ID_DATA_KEY, card.rowId)
        event.dataTransfer.setData(KANBAN_GROUP_KEY_DATA_KEY, card.groupKey)
        event.dataTransfer.setData('text/plain', card.rowId)
      },
      onDragEnd: () => {
        if (dragCompletionRef.current == null) {
          dragCompletionRef.current = 'cancelled'
          requestFocusRow(card.rowId)
          setDragOutcome({
            kind: 'cancelled',
            sourceGroupKey: card.groupKey,
          })
        }
        resetDragState()
      },
    }
  }, [applyDropTarget, args.enabled, clearCommitFeedback, clearPendingFocus, requestFocusRow, resetDragState, setDragOutcome, updateAutoScrollTargets])

  const createCardDropProps = React.useCallback((card: { rowId: string; groupKey: string }): KanbanCardDropProps => {
    if (!args.enabled) return {}
    const syncDropTarget = (event: React.DragEvent<HTMLElement>) => {
      const rowId = resolveDraggedRowId(event)
      if (!rowId || rowId === card.rowId) return false
      const rect = event.currentTarget.getBoundingClientRect()
      const midpointY = rect.top + rect.height / 2
      const position: KanbanDropPosition = event.clientY >= midpointY ? 'after' : 'before'
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      return resolveDropTarget({
        groupKey: card.groupKey,
        rowId: card.rowId,
        position,
        clientX: event.clientX,
        clientY: event.clientY,
      })
    }
    return {
      onDragEnter: event => {
        syncDropTarget(event)
      },
      onDragOver: event => {
        syncDropTarget(event)
      },
      onDragLeave: event => {
        const nextTarget = event.relatedTarget as Node | null
        if (nextTarget && event.currentTarget.contains(nextTarget)) return
        if (dragOverGroupKeyRef.current !== card.groupKey) return
        if (dragOverRowIdRef.current !== card.rowId) return
        dragOverRowIdRef.current = null
        dragOverPositionRef.current = 'end'
        setDragOverRowId(null)
        setDragOverPosition('end')
      },
      onDrop: event => {
        const rowId = resolveDraggedRowId(event)
        const sourceGroupKey = resolveDraggedGroupKey(event)
        const rect = event.currentTarget.getBoundingClientRect()
        const midpointY = rect.top + rect.height / 2
        const position: KanbanDropPosition = event.clientY >= midpointY ? 'after' : 'before'
        event.preventDefault()
        event.stopPropagation()
        if (rowId && rowId !== card.rowId && sourceGroupKey) {
          const move = {
            rowId,
            sourceGroupKey,
            targetGroupKey: card.groupKey,
            targetRowId: card.rowId,
            position,
          } satisfies KanbanCommittedMove
          dragCompletionRef.current = commitMove(move) === 'committed' ? 'commit' : 'no-op'
        }
        resetDragState()
      },
    }
  }, [args.enabled, commitMove, resetDragState, resolveDraggedGroupKey, resolveDraggedRowId, resolveDropTarget])

  const createLaneDropProps = React.useCallback((groupKey: string): KanbanLaneDropProps => {
    if (!args.enabled) return {}
    const syncDropTarget = (event: React.DragEvent<HTMLElement>) => {
      const rowId = resolveDraggedRowId(event)
      if (!rowId) return false
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      return resolveDropTarget({
        groupKey,
        rowId: null,
        position: 'end',
        clientX: event.clientX,
        clientY: event.clientY,
      })
    }
    return {
      onDragEnter: event => {
        syncDropTarget(event)
      },
      onDragOver: event => {
        syncDropTarget(event)
      },
      onDragLeave: event => {
        const nextTarget = event.relatedTarget as Node | null
        if (nextTarget && event.currentTarget.contains(nextTarget)) return
        if (dragOverGroupKeyRef.current !== groupKey) return
        if (pendingLaneHoverTargetRef.current?.groupKey === groupKey) {
          clearPendingLaneHover()
        }
        if (dragOverRowIdRef.current == null) {
          clearActiveDropTarget()
        }
      },
      onDrop: event => {
        const rowId = resolveDraggedRowId(event)
        const sourceGroupKey = resolveDraggedGroupKey(event)
        event.preventDefault()
        event.stopPropagation()
        if (rowId && sourceGroupKey) {
          const move = {
            rowId,
            sourceGroupKey,
            targetGroupKey: groupKey,
            targetRowId: null,
            position: 'end',
          } satisfies KanbanCommittedMove
          dragCompletionRef.current = commitMove(move) === 'committed' ? 'commit' : 'no-op'
        }
        resetDragState()
      },
    }
  }, [args.enabled, clearActiveDropTarget, clearPendingLaneHover, commitMove, resetDragState, resolveDraggedGroupKey, resolveDraggedRowId, resolveDropTarget])

  return {
    draggingRowId,
    dragOutcomeMessage,
    dragOutcomeSequence,
    commitFlashGroupKey,
    commitFlashRowId,
    dragSourceGroupKey,
    dragOverGroupKey,
    dragOverRowId,
    dragOverPosition,
    commitMove,
    reportBlockedMove,
    requestFocusRow,
    registerFocusableRowElement,
    resetDragState,
    createCardDragProps,
    createCardDropProps,
    createLaneDropProps,
  }
}
