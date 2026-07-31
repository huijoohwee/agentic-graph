type MapLibreCanvasElement = Pick<
  HTMLElement,
  'getAttribute' | 'removeAttribute' | 'setAttribute'
>

type MapLibreCanvasOwner = {
  getCanvas?: () => MapLibreCanvasElement | null
}

const MAPLIBRE_CANVAS_NEUTRAL_LABEL = 'Map'

export type MapLibreCanvasSemanticOwner = Readonly<{
  captionId: string
  label: string
  selectionAttribute: Readonly<{
    name: string
    value: string
  }>
}>

function restoreAttribute(
  element: MapLibreCanvasElement,
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

export function bindMapLibreCanvasSemanticOwner(
  map: MapLibreCanvasOwner | null | undefined,
  owner: MapLibreCanvasSemanticOwner | null | undefined,
): (() => void) | undefined {
  const canvas = map?.getCanvas?.()
  const captionId = String(owner?.captionId || '').trim()
  const label = String(owner?.label || '').trim()
  const selectionAttributeName = String(
    owner?.selectionAttribute.name || '',
  ).trim()
  const selectionAttributeValue = String(
    owner?.selectionAttribute.value || '',
  ).trim()
  if (canvas && !String(canvas.getAttribute('aria-label') || '').trim()) {
    canvas.setAttribute('aria-label', MAPLIBRE_CANVAS_NEUTRAL_LABEL)
  }
  if (
    !canvas
    || !captionId
    || !label
    || !selectionAttributeName
    || !selectionAttributeValue
  ) return undefined

  const previousLabel = canvas.getAttribute('aria-label')
  const previousLabelledBy = canvas.getAttribute('aria-labelledby')
  const previousSelectionMarker = canvas.getAttribute(selectionAttributeName)
  canvas.setAttribute('aria-label', label)
  canvas.setAttribute('aria-labelledby', captionId)
  canvas.setAttribute(selectionAttributeName, selectionAttributeValue)

  return () => {
    restoreAttribute(canvas, 'aria-label', label, previousLabel)
    restoreAttribute(
      canvas,
      'aria-labelledby',
      captionId,
      previousLabelledBy,
    )
    restoreAttribute(
      canvas,
      selectionAttributeName,
      selectionAttributeValue,
      previousSelectionMarker,
    )
  }
}
