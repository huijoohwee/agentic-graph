import { uiCurrentChoiceRowIsSelected } from 'grph-shared/ui/selectedRowClasses'

export type CanvasBoardLayoutMode = 'flex' | 'fixed'

export const CANVAS_BOARD_LAYOUT_MODE_DEFAULT: CanvasBoardLayoutMode = 'fixed'
export const CANVAS_BOARD_LAYOUT_DISPLAY_CONTROL_ID = 'control:boardLayout' as const

export const CANVAS_BOARD_LAYOUT_DISPLAY_CONTROL_TITLE = 'Board'
export const CANVAS_BOARD_LAYOUT_DISPLAY_CONTROL_LABEL = 'Board'
export const CANVAS_BOARD_LAYOUT_DISPLAY_CONTROL_DESCRIPTION = 'Toggle board layout mode'

export type CanvasBoardLayoutDisplayControlId = typeof CANVAS_BOARD_LAYOUT_DISPLAY_CONTROL_ID

export type CanvasBoardLayoutOption = {
  value: CanvasBoardLayoutMode
  label: string
}

export const CANVAS_BOARD_LAYOUT_OPTIONS: readonly CanvasBoardLayoutOption[] = [
  { value: 'flex', label: 'Flex' },
  { value: 'fixed', label: 'Fixed' },
]

export const readCanvasBoardLayoutMode = (raw: unknown): CanvasBoardLayoutMode =>
  String(raw || CANVAS_BOARD_LAYOUT_MODE_DEFAULT).trim() === 'flex' ? 'flex' : CANVAS_BOARD_LAYOUT_MODE_DEFAULT

export const toggleCanvasBoardLayoutMode = (mode: unknown): CanvasBoardLayoutMode =>
  readCanvasBoardLayoutMode(mode) === 'fixed' ? 'flex' : 'fixed'

export const readCanvasBoardLayoutDisplayControlActive = (mode: unknown): boolean =>
  uiCurrentChoiceRowIsSelected(readCanvasBoardLayoutMode(mode))

export const readCanvasBoardLayoutDisplayControlTitle = (mode: unknown): string => {
  const current = readCanvasBoardLayoutMode(mode)
  const option = CANVAS_BOARD_LAYOUT_OPTIONS.find(candidate => candidate.value === current)
  return option ? `${CANVAS_BOARD_LAYOUT_DISPLAY_CONTROL_TITLE}: ${option.label}` : CANVAS_BOARD_LAYOUT_DISPLAY_CONTROL_TITLE
}

export const readCanvasBoardLayoutDisplayControlValue = (mode: unknown): string =>
  CANVAS_BOARD_LAYOUT_OPTIONS.find(candidate => candidate.value === readCanvasBoardLayoutMode(mode))?.label || CANVAS_BOARD_LAYOUT_MODE_DEFAULT
