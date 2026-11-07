import {
  readImmersiveMediaSnapshot,
  setImmersiveMediaView,
  zoomImmersiveMedia,
} from './immersiveMediaRuntime'

function isInteractiveTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return !!element?.closest?.(
    'input, textarea, select, button, a, [contenteditable="true"], [role="button"], [role="textbox"]',
  )
}

export function bindImmersiveMediaCameraPointerControls(
  element: HTMLElement,
): () => void {
  let pointer: Readonly<{
    pointerId: number
    x: number
    y: number
    yaw: number
    pitch: number
  }> | null = null

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return
    const view = readImmersiveMediaSnapshot().view
    pointer = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      yaw: view.yawDegrees,
      pitch: view.pitchDegrees,
    }
    try {
      element.setPointerCapture?.(event.pointerId)
    } catch {
      // Some browser surfaces do not support pointer capture.
    }
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (!pointer || pointer.pointerId !== event.pointerId) return
    setImmersiveMediaView({
      yawDegrees: pointer.yaw - (event.clientX - pointer.x) * 0.14,
      pitchDegrees: pointer.pitch + (event.clientY - pointer.y) * 0.12,
    })
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (pointer?.pointerId !== event.pointerId) return
    pointer = null
    try {
      if (element.hasPointerCapture?.(event.pointerId)) {
        element.releasePointerCapture(event.pointerId)
      }
    } catch {
      // Pointer capture may already have been released by the browser.
    }
  }

  const onWheel = (event: WheelEvent): void => {
    if (isInteractiveTarget(event.target)) return
    event.preventDefault()
    zoomImmersiveMedia(event.deltaY > 0 ? 'out' : 'in')
  }

  const onDoubleClick = (event: MouseEvent): void => {
    if (
      !readImmersiveMediaSnapshot().navigation.doubleClickZoom
      || isInteractiveTarget(event.target)
    ) return
    zoomImmersiveMedia(event.shiftKey ? 'out' : 'in')
  }

  element.addEventListener('pointerdown', onPointerDown)
  element.addEventListener('pointermove', onPointerMove)
  element.addEventListener('pointerup', onPointerUp)
  element.addEventListener('pointercancel', onPointerUp)
  element.addEventListener('wheel', onWheel, { passive: false })
  element.addEventListener('dblclick', onDoubleClick)

  return () => {
    pointer = null
    element.removeEventListener('pointerdown', onPointerDown)
    element.removeEventListener('pointermove', onPointerMove)
    element.removeEventListener('pointerup', onPointerUp)
    element.removeEventListener('pointercancel', onPointerUp)
    element.removeEventListener('wheel', onWheel)
    element.removeEventListener('dblclick', onDoubleClick)
  }
}
