import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { LS_KEYS } from '@/lib/config'
import { lsBool } from '@/lib/persistence'
import { clampOverlayTopLeftFullyInViewport, clampOverlayTopLeftToViewport } from '@/lib/ui/overlayClamp'
import { beginOverlayPanelPositionDrag } from '@/lib/ui/overlayPanelDrag'
import { createRafValueScheduler } from '@/lib/react/rafValueScheduler'
import { createRafOnceScheduler } from '@/lib/react/rafOnceScheduler'
import { useGraphStore } from '@/hooks/useGraphStore'
import { recordFloatingPanelPresetDismissal } from '@/features/parsers/floatingPanelPresetDismissal'
import {
  FLOATING_PANEL_CANVAS_RIGHT_INSET_CSS,
  FLOATING_PANEL_CANVAS_TOP_INSET_CSS,
  FLOATING_PANEL_DEFAULT_HEIGHT_FALLBACK_PX,
  FLOATING_PANEL_DEFAULT_WIDTH_FALLBACK_PX,
} from '@/lib/ui/floatingPanelGeometry'

type ToolMenuDragPosition = {
  top: number
  left: number
}

export function useToolMenuState() {
  const isToolMenuOpen = useGraphStore(s => s.floatingPanelOpen === true)
  const setFloatingPanelOpen = useGraphStore(s => s.setFloatingPanelOpen)

  const toolMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const toolMenuCardRef = useRef<HTMLElement | null>(null)
  const [toolMenuDragPos, setToolMenuDragPos] = useState<ToolMenuDragPosition | null>(null)
  const dragSchedulerRef = useRef(createRafValueScheduler((pos: ToolMenuDragPosition) => setToolMenuDragPos(pos)))

  const clampToolMenuPos = useCallback((pos: ToolMenuDragPosition): ToolMenuDragPosition => {
    if (typeof window === 'undefined') return pos
    const el = toolMenuCardRef.current
    const rect = el ? el.getBoundingClientRect() : null
    const w = rect && Number.isFinite(rect.width) && rect.width > 0 ? rect.width : FLOATING_PANEL_DEFAULT_WIDTH_FALLBACK_PX
    const h = rect && Number.isFinite(rect.height) && rect.height > 0 ? rect.height : FLOATING_PANEL_DEFAULT_HEIGHT_FALLBACK_PX
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const fullyClamp = window.matchMedia?.('(pointer: coarse), (max-width: 768px)').matches || w >= viewport.width
    if (fullyClamp) {
      return clampOverlayTopLeftFullyInViewport({
        pos,
        size: { width: w, height: h },
        viewport,
      })
    }
    return clampOverlayTopLeftToViewport({
      pos,
      size: { width: w, height: h },
      viewport,
      visiblePx: 32,
    })
  }, [])

  const handleToolMenuCardPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const el = toolMenuCardRef.current
      if (!el) return

      const scheduler = dragSchedulerRef.current

      beginOverlayPanelPositionDrag({
        event,
        cursor: 'grabbing',
        readStartPosition: () => {
          const rect = el.getBoundingClientRect()
          return { top: rect.top, left: rect.left }
        },
        clampPosition: clampToolMenuPos,
        schedulePosition: position => scheduler.schedule(position),
        flushPosition: () => scheduler.flush(),
        cancelPosition: () => scheduler.cancel(),
      })
    },
    [clampToolMenuPos],
  )

  useEffect(() => {
    if (!isToolMenuOpen) return
    if (!toolMenuDragPos) return
    if (typeof window === 'undefined') return
    const scheduler = createRafOnceScheduler(() => {
      const next = clampToolMenuPos(toolMenuDragPos)
      if (next.top === toolMenuDragPos.top && next.left === toolMenuDragPos.left) return
      setToolMenuDragPos(next)
    })
    scheduler.schedule()
    return () => scheduler.cancel()
  }, [clampToolMenuPos, isToolMenuOpen, toolMenuDragPos])

  const toolMenuCardStyle = useMemo(() => {
    if (!toolMenuDragPos) {
      return {
        position: 'absolute' as const,
        top: FLOATING_PANEL_CANVAS_TOP_INSET_CSS,
        right: FLOATING_PANEL_CANVAS_RIGHT_INSET_CSS,
      }
    }
    return {
      position: 'absolute' as const,
      top: toolMenuDragPos.top,
      left: toolMenuDragPos.left,
    }
  }, [toolMenuDragPos])

  const closeToolMenu = useCallback(() => {
    recordFloatingPanelPresetDismissal(useGraphStore.getState().markdownDocumentName)
    setFloatingPanelOpen(false)
    const pinned = lsBool(LS_KEYS.floatingPanelPinned, false)
    if (!pinned) setToolMenuDragPos(null)
  }, [setFloatingPanelOpen])

  const toggleToolMenu = useCallback(() => {
    if (isToolMenuOpen) recordFloatingPanelPresetDismissal(useGraphStore.getState().markdownDocumentName)
    setFloatingPanelOpen(!isToolMenuOpen)
    if (isToolMenuOpen) {
      const pinned = lsBool(LS_KEYS.floatingPanelPinned, false)
      if (!pinned) setToolMenuDragPos(null)
    }
  }, [isToolMenuOpen, setFloatingPanelOpen])

  return {
    isToolMenuOpen,
    setIsToolMenuOpen: setFloatingPanelOpen,
    toolMenuButtonRef,
    toolMenuCardRef,
    toolMenuCardStyle,
    setToolMenuDragPos,
    handleToolMenuCardPointerDown,
    closeToolMenu,
    toggleToolMenu,
  }
}
