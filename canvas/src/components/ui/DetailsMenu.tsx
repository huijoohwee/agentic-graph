import React from 'react'
import { createPortal } from 'react-dom'
import { clampOverlayTopLeftFullyInViewport } from '@/lib/ui/overlayClamp'
import { readOverlayElementSize, resolveOverlayVerticalTop } from '@/lib/ui/overlayPlacement'
import { refreshOverlayPositionAfterMount, useOverlayRepositionObservers } from '@/lib/ui/overlayReposition'
import { buildNonBlockingPortalLayerStyle, withInteractivePortalContentStyle } from '@/lib/ui/overlayPortalStyle'
import { Z_INDEX_MENU } from '@/lib/ui/zIndex'

export type DetailsMenuApi = {
  close: () => void
  open: () => void
  toggle: () => void
}

export type DetailsMenuProps = {
  ariaLabel: string
  detailsClassName?: string
  summaryClassName?: string
  menuClassName?: string
  triggerElement?: 'summary' | 'button'
  summary: React.ReactNode
  menu: React.ReactNode | ((api: DetailsMenuApi) => React.ReactNode)
  shouldToggleFromSummaryEvent?: (e: React.MouseEvent<HTMLElement>) => boolean
  onSummaryPointerDown?: (e: React.PointerEvent<HTMLElement>, api: DetailsMenuApi) => void
  onSummaryMouseDown?: (e: React.MouseEvent<HTMLElement>, api: DetailsMenuApi) => void
  onSummaryClick?: (e: React.MouseEvent<HTMLElement>, api: DetailsMenuApi) => void
  onMenuPointerDownCapture?: (e: React.PointerEvent<HTMLElement>) => void
  onMenuMouseDownCapture?: (e: React.MouseEvent<HTMLElement>) => void
  onMenuPointerUpCapture?: (e: React.PointerEvent<HTMLElement>) => void
  onMenuMouseUpCapture?: (e: React.MouseEvent<HTMLElement>) => void
  portal?: boolean
  portalPlacement?: 'bottom-start' | 'bottom-end'
  portalGapPx?: number
}

export const DetailsMenu = React.memo(function DetailsMenu(props: DetailsMenuProps) {
  const detailsRef = React.useRef<HTMLDetailsElement | null>(null)
  const containerRef = React.useRef<HTMLElement | null>(null)
  const summaryRef = React.useRef<HTMLElement | null>(null)
  const portalRootRef = React.useRef<HTMLElement | null>(null)
  const [isOpen, setIsOpen] = React.useState(false)
  const [portalStyle, setPortalStyle] = React.useState<React.CSSProperties | null>(null)
  const triggerElement = props.triggerElement || 'summary'
  const usesSummaryTrigger = triggerElement === 'summary'

  const close = React.useCallback(() => {
    const el = detailsRef.current
    if (el) el.open = false
    setIsOpen(false)
  }, [])

  const updatePortalPosition = React.useCallback(() => {
    const anchor = summaryRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const gap = typeof props.portalGapPx === 'number' ? props.portalGapPx : 8
    const placement = props.portalPlacement || 'bottom-start'
    const viewportWidth =
      typeof window !== 'undefined'
        ? window.innerWidth || document.documentElement.clientWidth || 0
        : 0
    const viewportHeight =
      typeof window !== 'undefined'
        ? window.innerHeight || document.documentElement.clientHeight || 0
        : 0
    const menuSize = readOverlayElementSize(portalRootRef.current)
    const desiredTop = viewportHeight > 0
      ? resolveOverlayVerticalTop({
          anchorRect: rect,
          overlayHeight: menuSize.height,
          viewportHeight,
          margin: gap,
          preferredPlacement: 'bottom',
        })
      : rect.bottom + gap
    const desiredLeft = placement === 'bottom-end' ? rect.right - menuSize.width : rect.left

    const next: React.CSSProperties = {
      position: 'fixed',
      width: 'max-content',
    }
    if (viewportWidth > 0 && viewportHeight > 0) {
      const clamped = clampOverlayTopLeftFullyInViewport({
        pos: { top: desiredTop - gap, left: desiredLeft - gap },
        size: menuSize,
        viewport: {
          width: Math.max(1, viewportWidth - gap * 2),
          height: Math.max(1, viewportHeight - gap * 2),
        },
        snapPx: 1,
      })
      next.top = clamped.top + gap
      next.left = clamped.left + gap
    } else {
      next.top = Math.round(desiredTop)
      next.left = Math.round(desiredLeft)
    }
    setPortalStyle(prev => {
      if (!prev) return next
      if (prev.top === next.top && prev.left === next.left) return prev
      return next
    })
  }, [props.portalGapPx, props.portalPlacement])
  const syncOpenedPortal = React.useCallback(() => {
    if (!props.portal) return
    try {
      updatePortalPosition()
      requestAnimationFrame(() => updatePortalPosition())
    } catch {
      void 0
    }
  }, [props.portal, updatePortalPosition])
  const open = React.useCallback(() => {
    const el = detailsRef.current
    if (el) el.open = true
    setIsOpen(true)
    syncOpenedPortal()
  }, [syncOpenedPortal])
  const toggle = React.useCallback(() => {
    const el = detailsRef.current
    const next = el ? !el.open : !isOpen
    if (el) el.open = next
    setIsOpen(next)
    if (next) syncOpenedPortal()
  }, [isOpen, syncOpenedPortal])
  const api = React.useMemo<DetailsMenuApi>(() => ({ close, open, toggle }), [close, open, toggle])
  const menu = typeof props.menu === 'function' ? props.menu(api) : props.menu

  React.useEffect(() => {
    if (!props.portal) return
    if (!isOpen) return
    updatePortalPosition()

    const openedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()

    let rafId: number | null = null
    const schedule = () => {
      if (rafId != null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        updatePortalPosition()
      })
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      close()
      summaryRef.current?.focus()
    }
    const onPointerDown = (e: PointerEvent) => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if (now - openedAt < 120) return
      const target = e.target as Node | null
      const root = detailsRef.current || containerRef.current
      const portalRoot = portalRootRef.current
      if (props.portal && !portalRoot) return
      if (root && target && root.contains(target)) return
      if (portalRoot && target && portalRoot.contains(target)) return
      close()
    }

    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      if (rafId != null) window.cancelAnimationFrame(rafId)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [close, isOpen, props.portal, updatePortalPosition])

  useOverlayRepositionObservers({
    open: props.portal === true && isOpen,
    rootRef: portalRootRef,
    updatePosition: updatePortalPosition,
  })

  const triggerClickCapture = props.shouldToggleFromSummaryEvent
    ? (e: React.MouseEvent<HTMLElement>) => {
        const allow = props.shouldToggleFromSummaryEvent?.(e)
        if (allow) return
        e.preventDefault()
        close()
        try {
          setTimeout(() => close(), 0)
        } catch {
          void 0
        }
      }
    : undefined
  const triggerProps = {
    className: props.summaryClassName || '',
    'aria-label': props.ariaLabel,
    ref: (el: HTMLElement | null) => {
      summaryRef.current = el
    },
    onPointerDown: props.onSummaryPointerDown ? (e: React.PointerEvent<HTMLElement>) => props.onSummaryPointerDown?.(e, api) : undefined,
    onMouseDown: props.onSummaryMouseDown ? (e: React.MouseEvent<HTMLElement>) => props.onSummaryMouseDown?.(e, api) : undefined,
    onClick: props.onSummaryClick ? (e: React.MouseEvent<HTMLElement>) => props.onSummaryClick?.(e, api) : undefined,
    onClickCapture: triggerClickCapture,
  }
  const inlineMenu = (
    <section
      aria-hidden="true"
      className={props.menuClassName || ''}
      style={{ display: props.portal ? 'none' : isOpen || usesSummaryTrigger ? undefined : 'none' }}
      onPointerDownCapture={props.onMenuPointerDownCapture}
      onMouseDownCapture={props.onMenuMouseDownCapture}
      onPointerUpCapture={props.onMenuPointerUpCapture}
      onMouseUpCapture={props.onMenuMouseUpCapture}
    >
      {props.portal ? null : menu}
    </section>
  )
  const portalMenu =
    props.portal && isOpen && menu && portalStyle && typeof document !== 'undefined'
      ? createPortal(
          <section style={buildNonBlockingPortalLayerStyle(Z_INDEX_MENU)}>
            <section
              ref={el => {
                portalRootRef.current = el
                if (!el) return
                refreshOverlayPositionAfterMount(updatePortalPosition)
              }}
              style={withInteractivePortalContentStyle(portalStyle)}
              className="kg-details-menu-portal"
              data-kg-details-menu-portal="true"
              onPointerDownCapture={props.onMenuPointerDownCapture}
              onMouseDownCapture={props.onMenuMouseDownCapture}
              onPointerUpCapture={props.onMenuPointerUpCapture}
              onMouseUpCapture={props.onMenuMouseUpCapture}
            >
              {menu}
            </section>
          </section>,
          // A body portal is inert beneath a native modal's top layer.
          // Keep the fixed, viewport-clamped menu in its owning dialog.
          summaryRef.current?.closest('dialog[open]') || document.body,
        )
      : null

  return usesSummaryTrigger ? (
    <details
      ref={detailsRef}
      className={props.detailsClassName || ''}
      onToggle={e => {
        const next = (e.currentTarget as HTMLDetailsElement).open
        setIsOpen(next)
        if (next) syncOpenedPortal()
      }}
    >
      <summary {...triggerProps}>
        {props.summary}
      </summary>
      {inlineMenu}
      {portalMenu}
    </details>
  ) : (
    <section
      ref={el => {
        containerRef.current = el
      }}
      className={props.detailsClassName || ''}
    >
      <button type="button" {...triggerProps} aria-expanded={isOpen}>
        {props.summary}
      </button>
      {inlineMenu}
      {portalMenu}
    </section>
  )
})
