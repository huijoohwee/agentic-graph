export const CANVAS_CARD_DISPLAY_CONTROL_ID = 'control:card' as const
export const CANVAS_WIDGET_DISPLAY_CONTROL_ID = 'control:widget' as const

export type CanvasCardWidgetDisplayControlId =
  | typeof CANVAS_CARD_DISPLAY_CONTROL_ID
  | typeof CANVAS_WIDGET_DISPLAY_CONTROL_ID

export type CanvasCardWidgetDisplayMode = 'card' | 'widget'

export const CANVAS_CARD_WIDGET_DISPLAY_MODE_DEFAULT: CanvasCardWidgetDisplayMode = 'card'

export const readCanvasCardWidgetDisplayMode = (raw: unknown): CanvasCardWidgetDisplayMode => {
  return raw === 'widget' ? 'widget' : CANVAS_CARD_WIDGET_DISPLAY_MODE_DEFAULT
}

export const readCanvasCardWidgetDisplayControlTitle = (mode: CanvasCardWidgetDisplayMode): string => {
  return mode === 'widget' ? 'Display: Widget' : 'Display: Card (Default)'
}

export const readCanvasCardWidgetDisplayControlValue = (mode: CanvasCardWidgetDisplayMode): string =>
  mode === 'widget' ? 'Widget' : 'Card (Default)'

export const readCanvasCardWidgetDisplayControlActive = (
  displayMode: CanvasCardWidgetDisplayMode | null | undefined,
  mode: CanvasCardWidgetDisplayMode,
): boolean => {
  return readCanvasCardWidgetDisplayMode(displayMode) === mode
}
