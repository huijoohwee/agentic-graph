import React from 'react'
import {
  MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR,
  MEDIA_PREVIEW_SELECTABLE_SURFACE_VALUE,
} from '@/lib/cards/mediaPreviewSurfaceSelection'

type ThreeCanvasElement = Pick<
  HTMLElement,
  'getAttribute' | 'removeAttribute' | 'setAttribute'
>

export type ThreeCanvasSemanticMediaOwner = Readonly<{
  captionId: string
  label: string
}>

function restoreAttribute(
  element: ThreeCanvasElement,
  name: string,
  ownedValue: string,
  previousValue: string | null,
): void {
  if (element.getAttribute(name) !== ownedValue) return
  if (previousValue !== null) {
    element.setAttribute(name, previousValue)
    return
  }
  element.removeAttribute(name)
}

export function bindThreeCanvasSemanticOwner(
  canvas: ThreeCanvasElement | null | undefined,
  owner: ThreeCanvasSemanticMediaOwner | null | undefined,
): (() => void) | undefined {
  const captionId = String(owner?.captionId || '').trim()
  const label = String(owner?.label || '').trim()
  if (!canvas || !captionId || !label) return undefined

  const previousLabel = canvas.getAttribute('aria-label')
  const previousLabelledBy = canvas.getAttribute('aria-labelledby')
  const previousRole = canvas.getAttribute('role')
  const previousSelectionMarker = canvas.getAttribute(
    MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR,
  )
  canvas.setAttribute('aria-label', label)
  canvas.setAttribute('aria-labelledby', captionId)
  canvas.setAttribute('role', 'region')
  canvas.setAttribute(
    MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR,
    MEDIA_PREVIEW_SELECTABLE_SURFACE_VALUE,
  )

  return () => {
    restoreAttribute(canvas, 'aria-label', label, previousLabel)
    restoreAttribute(
      canvas,
      'aria-labelledby',
      captionId,
      previousLabelledBy,
    )
    restoreAttribute(canvas, 'role', 'region', previousRole)
    restoreAttribute(
      canvas,
      MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR,
      MEDIA_PREVIEW_SELECTABLE_SURFACE_VALUE,
      previousSelectionMarker,
    )
  }
}

export function useThreeCanvasSemanticOwner(
  owner: ThreeCanvasSemanticMediaOwner | null | undefined,
) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const releaseOwnerRef = React.useRef<(() => void) | undefined>()
  const captionId = owner?.captionId
  const label = owner?.label
  const bindCanvas = React.useCallback((canvas: HTMLCanvasElement | null) => {
    releaseOwnerRef.current?.()
    releaseOwnerRef.current = bindThreeCanvasSemanticOwner(
      canvas,
      captionId && label ? { captionId, label } : undefined,
    )
  }, [captionId, label])

  React.useEffect(() => {
    bindCanvas(canvasRef.current)
    return () => {
      releaseOwnerRef.current?.()
      releaseOwnerRef.current = undefined
    }
  }, [bindCanvas])

  return { bindCanvas, canvasRef } as const
}
