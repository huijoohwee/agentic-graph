import { uiCurrentChoiceRowIsSelected } from 'grph-shared/ui/selectedRowClasses'

export type CanvasAspectRatioMode = '16:9' | '9:16'

export const CANVAS_ASPECT_RATIO_MODE_DEFAULT: CanvasAspectRatioMode = '16:9'
export const CANVAS_ASPECT_RATIO_DISPLAY_CONTROL_ID = 'control:aspectRatio' as const

export const CANVAS_ASPECT_RATIO_DISPLAY_CONTROL_TITLE = 'Aspect'
export const CANVAS_ASPECT_RATIO_DISPLAY_CONTROL_LABEL = 'Aspect'
export const CANVAS_ASPECT_RATIO_DISPLAY_CONTROL_DESCRIPTION = 'Toggle card aspect ratio'

export type CanvasAspectRatioDisplayControlId = typeof CANVAS_ASPECT_RATIO_DISPLAY_CONTROL_ID

export type CanvasAspectRatioOption = {
  value: CanvasAspectRatioMode
  label: string
}

export type CanvasAspectRatioSize = {
  width: number
  height: number
}

export const CANVAS_ASPECT_RATIO_OPTIONS: readonly CanvasAspectRatioOption[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
]

export const readCanvasAspectRatioMode = (raw: unknown): CanvasAspectRatioMode =>
  String(raw || '').trim() === '9:16' ? '9:16' : CANVAS_ASPECT_RATIO_MODE_DEFAULT

const readPositiveFiniteNumber = (value: unknown): number | null => {
  const next = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  return Number.isFinite(next) && next > 0 ? next : null
}

export const readCanvasAspectRatioWidthToHeight = (mode: unknown): number =>
  readCanvasAspectRatioMode(mode) === '9:16' ? 9 / 16 : 16 / 9

export const resolveCanvasAspectRatioSize = (args: {
  defaultWidth: number
  mode: unknown
  width?: unknown
}): CanvasAspectRatioSize => {
  const width = readPositiveFiniteNumber(args.width) || readPositiveFiniteNumber(args.defaultWidth) || 1
  const ratio = readCanvasAspectRatioWidthToHeight(args.mode)
  return {
    width,
    height: Math.round(width / ratio),
  }
}

export const resolveCanvasAspectRatioResizeSize = (args: {
  deltaX: number
  deltaY: number
  minWidth?: number
  mode: unknown
  startHeight: number
  startWidth: number
}): CanvasAspectRatioSize => {
  const ratio = readCanvasAspectRatioWidthToHeight(args.mode)
  const minWidth = readPositiveFiniteNumber(args.minWidth) || 1
  const startWidth = readPositiveFiniteNumber(args.startWidth) || minWidth
  const startHeight = readPositiveFiniteNumber(args.startHeight) || Math.round(startWidth / ratio)
  const deltaX = Number.isFinite(args.deltaX) ? args.deltaX : 0
  const deltaY = Number.isFinite(args.deltaY) ? args.deltaY : 0
  const width = Math.abs(deltaY) > Math.abs(deltaX)
    ? Math.max(minWidth, Math.round((startHeight + deltaY) * ratio))
    : Math.max(minWidth, Math.round(startWidth + deltaX))
  return resolveCanvasAspectRatioSize({ defaultWidth: minWidth, mode: args.mode, width })
}

export const toggleCanvasAspectRatioMode = (mode: unknown): CanvasAspectRatioMode =>
  readCanvasAspectRatioMode(mode) === '16:9' ? '9:16' : '16:9'

export const readCanvasAspectRatioDisplayControlActive = (mode: unknown): boolean =>
  uiCurrentChoiceRowIsSelected(readCanvasAspectRatioMode(mode))

export const readCanvasAspectRatioDisplayControlTitle = (mode: unknown): string => {
  const current = readCanvasAspectRatioMode(mode)
  const option = CANVAS_ASPECT_RATIO_OPTIONS.find(candidate => candidate.value === current)
  return option ? `${CANVAS_ASPECT_RATIO_DISPLAY_CONTROL_TITLE}: ${option.label}` : CANVAS_ASPECT_RATIO_DISPLAY_CONTROL_TITLE
}

export const readCanvasAspectRatioDisplayControlValue = (mode: unknown): string =>
  CANVAS_ASPECT_RATIO_OPTIONS.find(candidate => candidate.value === readCanvasAspectRatioMode(mode))?.label || CANVAS_ASPECT_RATIO_MODE_DEFAULT
