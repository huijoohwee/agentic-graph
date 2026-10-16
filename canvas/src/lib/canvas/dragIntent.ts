export const CANVAS_TOUCH_DRAG_SLOP_PX = 8
export const CANVAS_PEN_DRAG_SLOP_PX = 4

export function readCanvasDragIntentThresholdPx(pointerType: unknown): number {
  if (pointerType === 'touch') return CANVAS_TOUCH_DRAG_SLOP_PX
  if (pointerType === 'pen') return CANVAS_PEN_DRAG_SLOP_PX
  return 0
}

/** Reject object manipulation before a renderer captures input owned by the viewport. */
export function isCanvasObjectDragAllowed(args: {
  pointerMode?: string | null
  spacePanHeld?: boolean
  allowDrag?: boolean
  constraint?: string
  event?: { button?: number; ctrlKey?: boolean; isPrimary?: boolean } | null
}): boolean {
  return args.pointerMode !== 'pan' && args.spacePanHeld !== true && args.allowDrag !== false
    && args.constraint !== 'none' && args.event?.isPrimary !== false && args.event?.ctrlKey !== true
    && (args.event?.button == null || args.event.button === 0)
}
