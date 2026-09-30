import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { clampOverlayTopLeftFullyInViewport } from '@/lib/ui/overlayClamp'
import { readOverlayElementSize, resolveOverlayVerticalTop } from '@/lib/ui/overlayPlacement'
import { refreshOverlayPositionAfterMount, useOverlayRepositionObservers } from '@/lib/ui/overlayReposition'
import { useBodyPortalRoot } from '@/lib/ui/overlayPortalRoot'
import { buildNonBlockingPortalLayerStyle, withInteractivePortalContentStyle } from '@/lib/ui/overlayPortalStyle'
import { Z_INDEX_ANCHOR_OVERLAY } from '@/lib/ui/zIndex'

type Align = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'bottom-center' | 'top-center'

interface AnchorOverlayProps {
  anchorRef?: React.RefObject<HTMLElement | null>
  anchorPoint?: { left: number; top: number }
  open: boolean
  onClose?: () => void
  align?: Align
  className?: string
  autoFocus?: boolean
  allowOverflowVisible?: boolean
  dismissalGroup?: string
  panelRef?: React.MutableRefObject<HTMLElement | null>
  children: React.ReactNode
}

export function AnchorOverlay({
  anchorRef,
  anchorPoint,
  open,
  onClose,
  align = 'bottom-right',
  className = '',
  autoFocus = true,
  allowOverflowVisible = false,
  dismissalGroup,
  panelRef,
  children,
}: AnchorOverlayProps) {
  const containerRef = useRef<HTMLElement | null>(null)
  const portalRoot = useBodyPortalRoot(open, { createBeforeOpen: true })
  const priorFocusedElementRef = useRef<HTMLElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const updatePosition = React.useCallback(() => {
    const el = anchorRef?.current
    if (!el && !anchorPoint) return
    const r = anchorPoint ? { left: anchorPoint.left, right: anchorPoint.left, top: anchorPoint.top, bottom: anchorPoint.top, width: 0, height: 0 } : el!.getBoundingClientRect()
    const margin = anchorPoint ? 0 : 4
    const overlaySize = readOverlayElementSize(containerRef.current)
    const overlayWidth = overlaySize.width
    const overlayHeight = overlaySize.height
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1
    const top = resolveOverlayVerticalTop({
      anchorRect: r,
      overlayHeight,
      viewportHeight,
      margin,
      preferredPlacement: align.startsWith('bottom') ? 'bottom' : 'top',
    })
    const left = align.endsWith('center')
      ? r.left + r.width / 2 - overlayWidth / 2
      : align.endsWith('right')
        ? r.right - overlayWidth
        : r.left
    const next = clampOverlayTopLeftFullyInViewport({
      pos: { top, left },
      size: { width: overlayWidth, height: overlayHeight },
      viewport: { width: viewportWidth, height: viewportHeight },
      snapPx: 1,
    })
    setPos(prev => (prev.top === next.top && prev.left === next.left ? prev : next))
  }, [align, anchorPoint, anchorRef])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
  })

  useEffect(() => {
    if (!open) return
    updatePosition()
    const timeoutIds = [window.setTimeout(updatePosition, 0), window.setTimeout(updatePosition, 50)]
    return () => {
      timeoutIds.forEach(id => window.clearTimeout(id))
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    if (!onClose) return

    const openedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      onClose()
    }

    const handlePointerDown = (e: MouseEvent | PointerEvent) => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if (now - openedAt < 120) return
      const anchorEl = anchorRef?.current
      const containerEl = containerRef.current
      const t = e.target as Node | null
      if (!t) return
      if (anchorEl && anchorEl.contains(t)) return
      if (containerEl && containerEl.contains(t)) return
      const targetElement = t instanceof Element ? t : t.parentElement
      if (dismissalGroup && targetElement?.closest('[data-kg-overlay-group]')?.getAttribute('data-kg-overlay-group') === dismissalGroup) return
      onClose()
    }

    const handleReposition = () => {
      requestAnimationFrame(updatePosition)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('mousedown', handlePointerDown, true)
    window.addEventListener('scroll', handleReposition, true)
    window.addEventListener('resize', handleReposition)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('mousedown', handlePointerDown, true)
      window.removeEventListener('scroll', handleReposition, true)
      window.removeEventListener('resize', handleReposition)
    }
  }, [open, onClose, anchorRef, updatePosition, dismissalGroup])

  useOverlayRepositionObservers({ open, rootRef: containerRef, updatePosition })

  useEffect(() => {
    if (!open) return
    if (!autoFocus) return
    const activeElement = typeof document !== 'undefined' ? document.activeElement : null
    priorFocusedElementRef.current = activeElement instanceof HTMLElement ? activeElement : null
    const rafId = requestAnimationFrame(() => {
      const containerEl = containerRef.current
      if (!containerEl) return
      const firstFocusable = containerEl.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      const target = firstFocusable || containerEl
      try {
        target.focus({ preventScroll: true })
      } catch {
        target.focus()
      }
    })
    return () => {
      cancelAnimationFrame(rafId)
      const target = priorFocusedElementRef.current
      priorFocusedElementRef.current = null
      if (!target) return
      try {
        target.focus({ preventScroll: true })
      } catch {
        target.focus()
      }
    }
  }, [autoFocus, open])

  const attachContainer = React.useCallback((element: HTMLElement | null) => {
    containerRef.current = element
    if (panelRef) panelRef.current = element
    if (element) refreshOverlayPositionAfterMount(updatePosition)
  }, [updatePosition, panelRef])

  const style = useMemo<React.CSSProperties>(
    () => ({
      position: 'fixed',
      top: pos.top,
      left: pos.left,
      zIndex: Z_INDEX_ANCHOR_OVERLAY,
      width: 'max-content',
      overflow: allowOverflowVisible ? 'visible' : undefined,
    }),
    [allowOverflowVisible, pos],
  )

  if (!open) return null
  if (!portalRoot) return null
  return createPortal(
    <section style={buildNonBlockingPortalLayerStyle(Z_INDEX_ANCHOR_OVERLAY)}>
      <section
        ref={attachContainer}
        style={withInteractivePortalContentStyle(style)}
        className={['kg-anchor-overlay', className].filter(Boolean).join(' ')}
        data-kg-anchor-overlay="true"
        data-kg-overlay-group={dismissalGroup}
        tabIndex={-1}
      >
        {children}
      </section>
    </section>,
    portalRoot,
  )
}

interface DropdownPanelProps {
  anchorRef: React.RefObject<HTMLElement>
  open: boolean
  onClose?: () => void
  children: React.ReactNode
  align?: Align
}

export function DropdownPanel({ anchorRef, open, onClose, children, align = 'bottom-right' }: DropdownPanelProps) {
  void onClose
  return (
    <AnchorOverlay anchorRef={anchorRef} open={open} onClose={onClose} align={align}>
      {children}
    </AnchorOverlay>
  )
}
