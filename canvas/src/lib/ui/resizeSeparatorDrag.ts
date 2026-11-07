import { startPointerDrag } from 'grph-shared/dom/pointerDrag'
import { createRafValueScheduler } from '@/lib/react/rafValueScheduler'

export type ResizeSeparatorDragCursor = 'col-resize' | 'row-resize'

export type ResizeSeparatorDragMove<TValue> = {
  startValue: TValue
  startClientX: number
  startClientY: number
  currentClientX: number
  currentClientY: number
  deltaX: number
  deltaY: number
}

export function bindResizeSeparatorDragRuntime<TValue>(args: {
  resizeHandleEl: HTMLElement
  cursor: ResizeSeparatorDragCursor | (() => ResizeSeparatorDragCursor)
  readCurrentValue: () => TValue | null
  setPreviewValue: (next: TValue) => void
  commitValue: (next: TValue) => void
  resolveNextValueFromPointerDrag: (input: ResizeSeparatorDragMove<TValue>) => TValue
  shouldStart?: (ev: PointerEvent) => boolean
}): () => void {
  const {
    resizeHandleEl,
    cursor,
    readCurrentValue,
    setPreviewValue,
    commitValue,
    resolveNextValueFromPointerDrag,
    shouldStart,
  } = args

  const rafSetPreview = createRafValueScheduler<TValue>(value => setPreviewValue(value))

  const canStart = (ev: PointerEvent): boolean => {
    if (ev.button !== undefined && ev.button !== 0) return false
    return shouldStart ? shouldStart(ev) : true
  }

  const readCursor = () => typeof cursor === 'function' ? cursor() : cursor
  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey) return
    const axis = readCursor()
    const keys = axis === 'col-resize' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
    const direction = keys.indexOf(ev.key)
    if (direction < 0) return
    const startValue = readCurrentValue()
    if (startValue == null) return
    ev.preventDefault()
    ev.stopPropagation()
    const delta = (direction ? 1 : -1) * (ev.shiftKey ? 32 : 8)
    const deltaX = axis === 'col-resize' ? delta : 0
    const deltaY = axis === 'row-resize' ? delta : 0
    const next = resolveNextValueFromPointerDrag({
      startValue, startClientX: 0, startClientY: 0,
      currentClientX: deltaX, currentClientY: deltaY, deltaX, deltaY,
    })
    rafSetPreview.cancel()
    setPreviewValue(next)
    commitValue(next)
  }

  const onDown = (ev: PointerEvent) => {
    if (!canStart(ev)) return
    const startValue = readCurrentValue()
    if (startValue == null) return
    const startClientX = ev.clientX
    const startClientY = ev.clientY
    let pending = startValue
    startPointerDrag({
      ev,
      cursor: readCursor(),
      shouldStart: canStart,
      onMove: mv => {
        const next = resolveNextValueFromPointerDrag({
          startValue,
          startClientX,
          startClientY,
          currentClientX: mv.clientX,
          currentClientY: mv.clientY,
          deltaX: mv.clientX - startClientX,
          deltaY: mv.clientY - startClientY,
        })
        pending = next
        rafSetPreview.schedule(next)
      },
      onEnd: () => {
        rafSetPreview.flush()
        setPreviewValue(pending)
        commitValue(pending)
      },
      onCancel: () => {
        rafSetPreview.flush()
        setPreviewValue(pending)
        commitValue(pending)
      },
    })
  }

  resizeHandleEl.addEventListener('pointerdown', onDown)
  resizeHandleEl.addEventListener('keydown', onKeyDown)
  return () => {
    rafSetPreview.cancel()
    resizeHandleEl.removeEventListener('pointerdown', onDown)
    resizeHandleEl.removeEventListener('keydown', onKeyDown)
  }
}
