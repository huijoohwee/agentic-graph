import type React from 'react'
import { isSpacePanHeld } from '@/lib/canvas/space-pan'
import {
  isOverlayPanStartButtonEvent,
  readOverlayPointerTargetState,
  shouldBlockOverlayPanTarget,
} from 'grph-shared/dom/overlayPointerGuards'
import { startPointerDrag } from 'grph-shared/dom/pointerDrag'
import { installWheelForwardingAndBrowserZoomGuards } from 'grph-shared/dom/wheelGuards'

export type RichMediaPanelHeaderDragHandlers = {
  shouldStartHeaderDrag?: (e: PointerEvent) => boolean
  onHeaderDragStart?: (args: { pointerId: number; clientX: number; clientY: number }) => void
  onHeaderDrag?: (args: { pointerId: number; clientX: number; clientY: number; dx: number; dy: number }) => void
  onHeaderDragEnd?: (args: { pointerId: number; clientX: number; clientY: number }) => void
}

export type RichMediaPanelOverlayPanHandlers = {
  shouldForwardPointerDown?: (e: PointerEvent) => boolean
  onOverlayPanStart?: (args: { pointerId: number; clientX: number; clientY: number; buttons: number; shiftKey: boolean }) => void
  onOverlayPan?: (args: { pointerId: number; clientX: number; clientY: number; dx: number; dy: number; buttons: number; shiftKey: boolean }) => void
  onOverlayPanEnd?: (args: { pointerId: number; clientX: number; clientY: number; buttons: number; shiftKey: boolean }) => void
  onPointerDownCapture?: React.PointerEventHandler<HTMLElement>
}

export const installRichMediaOverlayWheelForwarding = (
  element: Element,
  options: {
    forwardWheelBeforeScrollableTarget?: boolean
    forwardWheelTo?: () => Element | null
    forwardedFlagKey?: string
    shouldForwardWheel?: (e: WheelEvent) => boolean
    stopPropagationOnForward?: boolean
    stopPropagationOnPreventZoom?: boolean
  },
): (() => void) => installWheelForwardingAndBrowserZoomGuards(element, options)

const readDragPointerId = (native: PointerEvent | MouseEvent): number => {
  const raw = (native as unknown as { pointerId?: unknown }).pointerId
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : -1
}

const readButtons = (native: PointerEvent | MouseEvent): number =>
  typeof native.buttons === 'number' ? native.buttons : 0

const tryPreventDragEvent = (e: React.SyntheticEvent): void => {
  try {
    e.preventDefault()
    e.stopPropagation()
  } catch {
    void 0
  }
}

const tryPreventNativeDragEvent = (e: Event): void => {
  try {
    e.preventDefault()
  } catch {
    void 0
  }
  try {
    e.stopPropagation()
  } catch {
    void 0
  }
  try {
    ;(e as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
  } catch {
    void 0
  }
}

export const startRichMediaPanelHeaderDrag = (
  native: PointerEvent | MouseEvent,
  handlers: RichMediaPanelHeaderDragHandlers,
  target?: Element | null,
): boolean => {
  if (typeof handlers.shouldStartHeaderDrag === 'function') {
    try {
      if (handlers.shouldStartHeaderDrag(native as PointerEvent) !== true) return false
    } catch {
      return false
    }
  }
  const pointerId = readDragPointerId(native)
  const x0 = native.clientX
  const y0 = native.clientY
  try {
    handlers.onHeaderDragStart?.({ pointerId, clientX: x0, clientY: y0 })
  } catch {
    void 0
  }
  startPointerDrag({
    ev: native as PointerEvent,
    cursor: 'grabbing',
    target,
    onMove: ev => {
      try {
        handlers.onHeaderDrag?.({ pointerId, clientX: ev.clientX, clientY: ev.clientY, dx: ev.clientX - x0, dy: ev.clientY - y0 })
      } catch {
        void 0
      }
    },
    onEnd: ev => {
      try {
        handlers.onHeaderDragEnd?.({ pointerId, clientX: ev.clientX, clientY: ev.clientY })
      } catch {
        void 0
      }
    },
    onCancel: ev => {
      try {
        handlers.onHeaderDragEnd?.({ pointerId, clientX: ev.clientX, clientY: ev.clientY })
      } catch {
        void 0
      }
    },
  })
  return true
}

export const startRichMediaPanelOverlayPan = (
  native: PointerEvent | MouseEvent,
  handlers: RichMediaPanelOverlayPanHandlers,
  target?: Element | null,
): boolean => {
  const pointerId = readDragPointerId(native)
  const x0 = native.clientX
  const y0 = native.clientY
  try {
    handlers.onOverlayPanStart?.({ pointerId, clientX: x0, clientY: y0, buttons: readButtons(native), shiftKey: native.shiftKey === true })
  } catch {
    void 0
  }
  startPointerDrag({
    ev: native as PointerEvent,
    cursor: 'grabbing',
    target,
    onMove: ev => {
      try {
        handlers.onOverlayPan?.({ pointerId, clientX: ev.clientX, clientY: ev.clientY, dx: ev.clientX - x0, dy: ev.clientY - y0, buttons: readButtons(ev), shiftKey: ev.shiftKey === true })
      } catch {
        void 0
      }
    },
    onEnd: ev => {
      try {
        handlers.onOverlayPanEnd?.({ pointerId, clientX: ev.clientX, clientY: ev.clientY, buttons: readButtons(ev), shiftKey: ev.shiftKey === true })
      } catch {
        void 0
      }
    },
    onCancel: ev => {
      try {
        handlers.onOverlayPanEnd?.({ pointerId, clientX: ev.clientX, clientY: ev.clientY, buttons: readButtons(ev), shiftKey: ev.shiftKey === true })
      } catch {
        void 0
      }
    },
  })
  return true
}

export const handleRichMediaPanelOverlayDragStartCapture = (args: {
  event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>
  installHeaderDrag: boolean
  installOverlayPan: boolean
  selectSelf: (native: PointerEvent | null) => void
  startHeaderDrag: (native: PointerEvent | MouseEvent, target?: Element | null) => boolean
  handlers: RichMediaPanelOverlayPanHandlers
}): boolean => {
  const native = args.event.nativeEvent as PointerEvent | MouseEvent
  const dragTarget = args.event.currentTarget instanceof Element ? args.event.currentTarget : null
  args.selectSelf(native as PointerEvent)
  const pointerTarget = readOverlayPointerTargetState((native as unknown as { target?: EventTarget | null }).target)
  const scrollSurfaceCanForwardPointer = pointerTarget.isScrollSurface && typeof args.handlers.shouldForwardPointerDown === 'function'
    ? args.handlers.shouldForwardPointerDown(native as PointerEvent) === true
    : false
  const blockOverlayPanForTarget = shouldBlockOverlayPanTarget(pointerTarget, { scrollSurfaceCanForwardPointer })
  const panelDragTarget = pointerTarget.isHeader
    || (args.installHeaderDrag && native.button === 0 && !isSpacePanHeld())
  if (panelDragTarget && !blockOverlayPanForTarget && args.startHeaderDrag(native, dragTarget)) {
    tryPreventDragEvent(args.event)
    return true
  }
  if (!pointerTarget.isHeader && !blockOverlayPanForTarget && args.installOverlayPan && isOverlayPanStartButtonEvent(native)) {
    startRichMediaPanelOverlayPan(native, args.handlers, dragTarget)
    tryPreventDragEvent(args.event)
    return true
  }
  if (!(pointerTarget.isHeader && args.installHeaderDrag)) {
    try {
      if ('pointerId' in native) args.handlers.onPointerDownCapture?.(args.event as React.PointerEvent<HTMLElement>)
    } catch {
      void 0
    }
  }
  return false
}

export const handleRichMediaPanelOverlayNativeDragStartCapture = (args: {
  native: PointerEvent | MouseEvent
  currentTarget: Element
  installHeaderDrag: boolean
  installOverlayPan: boolean
  selectSelf: (native: PointerEvent | null) => void
  startHeaderDrag: (native: PointerEvent | MouseEvent, target?: Element | null) => boolean
  handlers: RichMediaPanelOverlayPanHandlers
}): boolean => {
  const native = args.native
  args.selectSelf(native instanceof PointerEvent ? native : null)
  const target = (native as unknown as { target?: EventTarget | null }).target
  const targetEl = target instanceof Element ? target : null
  const pointerTarget = readOverlayPointerTargetState(targetEl)
  const scrollSurfaceCanForwardPointer = pointerTarget.isScrollSurface && typeof args.handlers.shouldForwardPointerDown === 'function'
    ? args.handlers.shouldForwardPointerDown(native as PointerEvent) === true
    : false
  const blockOverlayPanForTarget = shouldBlockOverlayPanTarget(pointerTarget, { scrollSurfaceCanForwardPointer })
  const panelDragTarget = pointerTarget.isHeader
    || (args.installHeaderDrag && native.button === 0 && !isSpacePanHeld())
  if (panelDragTarget && !blockOverlayPanForTarget && args.startHeaderDrag(native, args.currentTarget)) {
    tryPreventNativeDragEvent(native)
    return true
  }
  if (!pointerTarget.isHeader && !blockOverlayPanForTarget && args.installOverlayPan && isOverlayPanStartButtonEvent(native)) {
    startRichMediaPanelOverlayPan(native, args.handlers, args.currentTarget)
    tryPreventNativeDragEvent(native)
    return true
  }
  return false
}
