export type OverlayPointerTargetSelectors = {
  resizeHandle: string
  scrollSurface: string
  interactiveControl: string
  playableMedia: string
  header: string
  selectableSurface: string
}

export type OverlayPointerTargetState = {
  element: Element | null
  isResizeHandle: boolean
  isScrollSurface: boolean
  isInteractiveControl: boolean
  isPlayableMedia: boolean
  isHeader: boolean
  isSelectableSurface: boolean
}

export const DEFAULT_OVERLAY_POINTER_TARGET_SELECTORS: OverlayPointerTargetSelectors = {
  resizeHandle: '[data-kg-resize-handle]',
  scrollSurface: '[data-kg-media-scroll-surface="1"]',
  interactiveControl: 'textarea,input,select,button,a,[contenteditable="true"],[data-kg-rich-media-inline-edit="1"]',
  playableMedia: '[data-kg-card-media-interactive="1"],iframe,video,audio',
  header: '[data-kg-rich-media-storyboard-widget-header="1"]',
  selectableSurface: '[data-kg-rich-media-selectable-surface="1"]',
}

export function readOverlayPointerTargetState(
  target: EventTarget | null | undefined,
  selectors: OverlayPointerTargetSelectors = DEFAULT_OVERLAY_POINTER_TARGET_SELECTORS,
): OverlayPointerTargetState {
  const element = typeof Element !== 'undefined' && target instanceof Element ? target : null
  return {
    element,
    isResizeHandle: !!element?.closest(selectors.resizeHandle),
    isScrollSurface: !!element?.closest(selectors.scrollSurface),
    isInteractiveControl: !!element?.closest(selectors.interactiveControl),
    isPlayableMedia: !!element?.closest(selectors.playableMedia),
    isHeader: !!element?.closest(selectors.header),
    isSelectableSurface: !!element?.closest(selectors.selectableSurface),
  }
}

export function shouldBlockOverlayPanTarget(
  state: Pick<OverlayPointerTargetState, 'isResizeHandle' | 'isScrollSurface' | 'isInteractiveControl' | 'isPlayableMedia'>,
  opts?: {
    scrollSurfaceCanForwardPointer?: boolean
  },
): boolean {
  return state.isResizeHandle
    || (state.isScrollSurface && opts?.scrollSurfaceCanForwardPointer !== true)
    || state.isInteractiveControl
    || state.isPlayableMedia
}

export function isOverlayPanStartButtonEvent(event: Pick<MouseEvent, 'button' | 'buttons' | 'type'>): boolean {
  const buttons = typeof event.buttons === 'number' && Number.isFinite(event.buttons) ? event.buttons : 0
  if ((buttons & 1) === 1 || (buttons & 4) === 4) return true
  const button = typeof event.button === 'number' && Number.isFinite(event.button) ? event.button : -1
  const type = String(event.type || '')
  return (type === 'pointerdown' || type === 'mousedown') && (button === 0 || button === 1)
}
