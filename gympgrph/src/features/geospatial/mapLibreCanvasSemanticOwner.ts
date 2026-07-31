type MapLibreCanvasElement = Pick<
  HTMLElement,
  'getAttribute' | 'removeAttribute' | 'setAttribute'
>

type MapLibreCanvasOwner = {
  getCanvas?: () => MapLibreCanvasElement | null
}

export function bindMapLibreCanvasSemanticOwner(
  map: MapLibreCanvasOwner | null | undefined,
  captionId: string | null | undefined,
): (() => void) | undefined {
  const canvas = map?.getCanvas?.()
  const normalizedCaptionId = String(captionId || '').trim()
  if (!canvas || !normalizedCaptionId) return undefined

  const previousOwner = canvas.getAttribute('aria-labelledby')
  canvas.setAttribute('aria-labelledby', normalizedCaptionId)

  return () => {
    if (canvas.getAttribute('aria-labelledby') !== normalizedCaptionId) return
    if (previousOwner) {
      canvas.setAttribute('aria-labelledby', previousOwner)
      return
    }
    canvas.removeAttribute('aria-labelledby')
  }
}
